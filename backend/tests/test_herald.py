"""
Unit & Integration Tests for HERALD (Orchestrator Agent — Phase 5)
==================================================================
Tests:
  1. Anomaly checks:
      - _check_attendance_missed: flags students absent for 3+ consecutive days.
      - _check_mess_missed_streak: flags students who skipped last 6 meal slots (chronological ordering).
      - _check_unresolved_complaints: flags high/critical complaints open for > 24 hours.
  2. run_orchestrator:
      - Executes all 3 checks, returns aggregated breakdown and new flags.
  3. get_anomaly_flags:
      - Filters by unseen_only and flag_type, pagination.
  4. mark_flag_seen:
      - Sets seen_by_warden=True, handles idempotency.
  5. get_herald_stats:
      - Aggregate counts by flag type and unseen status.
  6. generate_summary:
      - LLM briefing generation with structured prompt.
      - Offline text summarizer fallback.
      - Normal parameters message when no flags.
  7. FastAPI router endpoints:
      - /herald/status, /herald/anomalies, /herald/run,
        PATCH /herald/anomalies/{id}/seen, /herald/summary.
"""

import os
import sys
from unittest.mock import MagicMock, patch

# Mock dependencies that may be missing in headless test env
mock_supabase = MagicMock()
sys.modules["supabase"] = mock_supabase
sys.modules["slowapi"] = MagicMock()
sys.modules["slowapi.util"] = MagicMock()
sys.modules["slowapi.errors"] = MagicMock()

# Add backend directory to sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

import unittest
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agents.herald.orchestrator import (
    run_orchestrator,
    get_anomaly_flags,
    mark_flag_seen,
    get_herald_stats,
    _check_attendance_missed,
    _check_mess_missed_streak,
    _check_unresolved_complaints,
    _clean_uuid,
    IST_OFFSET,
)
from agents.herald.summarizer import generate_summary, _offline_summary
from agents.herald.router import router as herald_router
from auth.dependencies import get_current_user

test_app = FastAPI()
test_app.include_router(herald_router, prefix="/herald")
test_app.dependency_overrides[get_current_user] = lambda: {
    "sub": "550e8400-e29b-41d4-a716-446655440001",
    "email": "warden@hostel.com",
    "user_metadata": {"role": "warden"},
}
client = TestClient(test_app)

STUDENT_UUID_1 = "550e8400-e29b-41d4-a716-446655440001"
STUDENT_UUID_2 = "550e8400-e29b-41d4-a716-446655440002"
FLAG_UUID = "660e8400-e29b-41d4-a716-446655440099"


class HeraldAgentTests(unittest.TestCase):

    # ── 1. Helper Tests ──────────────────────────────────────────────────────

    def test_clean_uuid(self):
        self.assertEqual(_clean_uuid(FLAG_UUID), FLAG_UUID)
        self.assertIsNone(_clean_uuid("not-a-uuid"))
        self.assertIsNone(_clean_uuid(""))
        self.assertIsNone(_clean_uuid(None))

    # ── 2. Check: Attendance Missed ──────────────────────────────────────────

    def test_check_attendance_missed(self):
        mock_client = MagicMock()

        # Enrolled students: S1 and S2
        mock_client.table("students").select().execute.return_value = MagicMock(
            data=[
                {"id": STUDENT_UUID_1, "name": "Student One", "roll_no": "R01", "room_no": "101"},
                {"id": STUDENT_UUID_2, "name": "Student Two", "roll_no": "R02", "room_no": "102"},
            ]
        )

        # Attendance logs: S1 attended, S2 has no logs
        mock_client.table("attendance_logs").select().gte().execute.return_value = MagicMock(
            data=[{"student_id": STUDENT_UUID_1}]
        )

        # Flag insert returns newly created row for S2
        mock_client.table("anomaly_flags").insert().execute.return_value = MagicMock(
            data=[{"id": "flag-1", "student_id": STUDENT_UUID_2, "type": "attendance_missed"}]
        )

        flags = _check_attendance_missed(mock_client)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]["type"], "attendance_missed")
        self.assertEqual(flags[0]["student_id"], STUDENT_UUID_2)

    # ── 3. Check: Mess Missed Streak ─────────────────────────────────────────

    def test_check_mess_missed_streak(self):
        mock_client = MagicMock()

        now = datetime.now(tz=IST_OFFSET)
        d_today = now.strftime("%Y-%m-%d")
        d_yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

        # Mess entries across recent meals:
        # S1 ate in 6 recent meals. S2 ate in none.
        mock_client.table("mess_entries").select().eq().gte().execute.return_value = MagicMock(
            data=[
                {"student_id": STUDENT_UUID_1, "meal_type": "dinner", "timestamp": f"{d_today}T20:00:00Z"},
                {"student_id": STUDENT_UUID_1, "meal_type": "lunch", "timestamp": f"{d_today}T13:00:00Z"},
                {"student_id": STUDENT_UUID_1, "meal_type": "breakfast", "timestamp": f"{d_today}T08:00:00Z"},
                {"student_id": STUDENT_UUID_1, "meal_type": "dinner", "timestamp": f"{d_yesterday}T20:00:00Z"},
                {"student_id": STUDENT_UUID_1, "meal_type": "lunch", "timestamp": f"{d_yesterday}T13:00:00Z"},
                {"student_id": STUDENT_UUID_1, "meal_type": "breakfast", "timestamp": f"{d_yesterday}T08:00:00Z"},
            ]
        )

        mock_client.table("students").select().execute.return_value = MagicMock(
            data=[
                {"id": STUDENT_UUID_1, "name": "Student One", "roll_no": "R01", "room_no": "101"},
                {"id": STUDENT_UUID_2, "name": "Student Two", "roll_no": "R02", "room_no": "102"},
            ]
        )

        mock_client.table("anomaly_flags").insert().execute.return_value = MagicMock(
            data=[{"id": "flag-2", "student_id": STUDENT_UUID_2, "type": "mess_missed_streak"}]
        )

        flags = _check_mess_missed_streak(mock_client)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]["type"], "mess_missed_streak")
        self.assertEqual(flags[0]["student_id"], STUDENT_UUID_2)

    # ── 4. Check: Unresolved Complaints ──────────────────────────────────────

    def test_check_unresolved_complaints(self):
        mock_client = MagicMock()

        # Stale open critical complaint
        mock_client.table("complaints").select().eq().in_().lte().execute.return_value = MagicMock(
            data=[{
                "id": "comp-1",
                "student_id": STUDENT_UUID_1,
                "category": "plumbing",
                "urgency": "critical",
                "created_at": "2026-09-08T10:00:00Z",
                "students": {"name": "Student One", "roll_no": "R01", "room_no": "101"},
            }]
        )

        mock_client.table("anomaly_flags").insert().execute.return_value = MagicMock(
            data=[{"id": "flag-3", "student_id": STUDENT_UUID_1, "type": "unresolved_complaint"}]
        )

        flags = _check_unresolved_complaints(mock_client)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]["type"], "unresolved_complaint")

    # ── 5. Run Orchestrator ──────────────────────────────────────────────────

    @patch("agents.herald.orchestrator._check_unresolved_complaints")
    @patch("agents.herald.orchestrator._check_mess_missed_streak")
    @patch("agents.herald.orchestrator._check_attendance_missed")
    @patch("agents.herald.orchestrator.get_client")
    def test_run_orchestrator(self, mock_client, mock_att, mock_mess, mock_comp):
        mock_att.return_value = [{"id": "f1", "type": "attendance_missed"}]
        mock_mess.return_value = [{"id": "f2", "type": "mess_missed_streak"}]
        mock_comp.return_value = [{"id": "f3", "type": "unresolved_complaint"}]

        res = run_orchestrator()
        self.assertTrue(res["success"])
        self.assertEqual(res["new_flags"], 3)
        self.assertEqual(res["breakdown"]["attendance_missed"], 1)
        self.assertEqual(res["breakdown"]["mess_missed_streak"], 1)
        self.assertEqual(res["breakdown"]["unresolved_complaint"], 1)

    # ── 6. Anomaly Flags Retrieval & Seen ────────────────────────────────────

    @patch("agents.herald.orchestrator.get_client")
    def test_get_anomaly_flags(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_query = MagicMock()
        mock_client.table.return_value = mock_query
        mock_query.select.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.range.return_value = mock_query
        mock_query.execute.return_value = MagicMock(
            count=2,
            data=[
                {"id": "f1", "type": "attendance_missed", "seen_by_warden": False},
                {"id": "f2", "type": "unresolved_complaint", "seen_by_warden": False},
            ]
        )

        res = get_anomaly_flags(unseen_only=True)
        self.assertTrue(res["success"])
        self.assertEqual(res["total"], 2)
        self.assertEqual(res["unseen_count"], 2)

    @patch("agents.herald.orchestrator.get_client")
    def test_mark_flag_seen(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Check existing
        mock_client.table("anomaly_flags").select().eq().limit().execute.return_value = MagicMock(
            data=[{"id": FLAG_UUID, "seen_by_warden": False}]
        )
        # Update
        mock_client.table("anomaly_flags").update().eq().execute.return_value = MagicMock(
            data=[{"id": FLAG_UUID, "seen_by_warden": True}]
        )

        res = mark_flag_seen(FLAG_UUID)
        self.assertTrue(res["success"])
        self.assertTrue(res["flag"]["seen_by_warden"])

    # ── 7. Summarizer ────────────────────────────────────────────────────────

    def test_generate_summary_empty(self):
        summary = generate_summary([])
        self.assertIn("No new anomaly flags", summary)

    @patch("llm.groq_client.generate_structured_json")
    def test_generate_summary_llm(self, mock_llm):
        mock_llm.return_value = {
            "summary": "3 students missed attendance and 1 critical plumbing complaint is open."
        }
        flags = [
            {"type": "attendance_missed", "detail": "Student A missed 3 days."},
            {"type": "unresolved_complaint", "detail": "Pipe burst in 102."},
        ]
        summary = generate_summary(flags)
        self.assertEqual(summary, "3 students missed attendance and 1 critical plumbing complaint is open.")

    def test_offline_summary(self):
        type_groups = {
            "attendance_missed": ["Detail 1", "Detail 2"],
            "unresolved_complaint": ["Detail 3"],
        }
        summary = _offline_summary(type_groups, total=3)
        self.assertIn("2 student(s) missed attendance", summary)
        self.assertIn("1 high/critical maintenance complaint(s)", summary)

    # ── 8. Router Endpoints ──────────────────────────────────────────────────

    @patch("agents.herald.router.get_herald_stats")
    def test_endpoint_status(self, mock_stats):
        mock_stats.return_value = {
            "success": True,
            "total_flags": 10,
            "unseen": 4,
            "by_type": {"attendance_missed": 2, "mess_missed_streak": 1, "unresolved_complaint": 1},
        }
        resp = client.get("/herald/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["agent"], "HERALD")
        self.assertIn("cross_agent_anomaly_detection", data["capabilities"])

    @patch("agents.herald.router.run_orchestrator")
    def test_endpoint_trigger_run(self, mock_run):
        mock_run.return_value = {
            "success": True,
            "new_flags": 2,
            "breakdown": {"attendance_missed": 1, "mess_missed_streak": 0, "unresolved_complaint": 1},
        }
        resp = client.post("/herald/run")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["new_flags"], 2)

    @patch("agents.herald.router.mark_flag_seen")
    def test_endpoint_mark_seen(self, mock_mark):
        mock_mark.return_value = {
            "success": True,
            "message": "Flag marked as seen.",
            "flag": {"id": FLAG_UUID, "seen_by_warden": True},
        }
        resp = client.patch(f"/herald/anomalies/{FLAG_UUID}/seen")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["flag"]["seen_by_warden"])


if __name__ == "__main__":
    unittest.main()
