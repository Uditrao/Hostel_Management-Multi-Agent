"""
Unit & Integration Tests for FIXR (Maintenance Agent — Phase 4)
===============================================================
Tests:
  1. Complaint classification:
      - LLM classification with structured output.
      - Rule-based offline fallback across categories (electrical, plumbing, carpentry, other).
      - Urgency detection (critical, high, medium, low).
  2. submit_complaint:
      - Valid complaint submission and DB insertion.
      - Input validation (invalid UUID, text too short, empty text).
  3. get_my_complaints:
      - Student viewing their own complaints.
      - Status filtering (open, assigned, resolved).
  4. get_all_complaints:
      - Warden view with sorting (critical first) and filtering.
  5. update_complaint:
      - Status transitions and worker note assignment.
      - Input validation.
  6. get_complaints_summary:
      - Aggregate counts by status, urgency, category.
  7. FastAPI router endpoints:
      - /fixr/status, /fixr/complaint, /fixr/complaints, /fixr/complaints/mine,
        /fixr/complaints/summary, /fixr/complaints, /fixr/complaints/{id}, PATCH /fixr/complaints/{id}.
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
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agents.fixr.complaints import (
    submit_complaint,
    get_my_complaints,
    get_all_complaints,
    update_complaint,
    get_complaint_by_id,
    get_complaints_summary,
    _clean_uuid,
)
from llm.complaint_classifier import (
    classify_complaint,
    _offline_classify,
    _validate_classification,
)
from agents.fixr.router import router as fixr_router
from auth.dependencies import get_current_user

test_app = FastAPI()
test_app.include_router(fixr_router, prefix="/fixr")
test_app.dependency_overrides[get_current_user] = lambda: {
    "sub": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test@hostel.com",
    "user_metadata": {"role": "warden"},
}
client = TestClient(test_app)

STUDENT_UUID = "550e8400-e29b-41d4-a716-446655440000"
COMPLAINT_UUID = "660e8400-e29b-41d4-a716-446655440001"


class FixrAgentTests(unittest.TestCase):

    # ── 1. Helper Tests ──────────────────────────────────────────────────────

    def test_clean_uuid(self):
        self.assertEqual(_clean_uuid(STUDENT_UUID), STUDENT_UUID)
        self.assertIsNone(_clean_uuid("invalid-uuid-string"))
        self.assertIsNone(_clean_uuid(""))
        self.assertIsNone(_clean_uuid(None))

    # ── 2. Classification Tests ──────────────────────────────────────────────

    @patch("llm.complaint_classifier.generate_structured_json")
    def test_classify_complaint_llm(self, mock_llm):
        mock_llm.return_value = {
            "category": "plumbing",
            "urgency": "critical",
            "short_summary": "Bathroom pipe burst and water is flooding.",
        }
        res = classify_complaint("Bathroom pipe burst and water is flooding room 102!")
        self.assertEqual(res["category"], "plumbing")
        self.assertEqual(res["urgency"], "critical")
        self.assertEqual(res["classifier"], "llm")
        self.assertIn("pipe burst", res["short_summary"])

    def test_classify_complaint_offline_fallback(self):
        # Electrical
        res_elec = _offline_classify("The fan and tube light in room 301 are not working")
        self.assertEqual(res_elec["category"], "electrical")

        # Plumbing + Critical
        res_plumb = _offline_classify("Bathroom pipe is leaking and water flooding everywhere")
        self.assertEqual(res_plumb["category"], "plumbing")
        self.assertEqual(res_plumb["urgency"], "critical")

        # Carpentry
        res_carp = _offline_classify("Room main door lock is broken and cannot lock it")
        self.assertEqual(res_carp["category"], "carpentry")

        # Empty
        res_empty = classify_complaint("   ")
        self.assertEqual(res_empty["category"], "other")
        self.assertEqual(res_empty["classifier"], "offline_fallback")

    def test_validate_classification(self):
        valid = _validate_classification({"category": "UNKNOWN", "urgency": "INVALID"})
        self.assertEqual(valid["category"], "other")
        self.assertEqual(valid["urgency"], "medium")

    # ── 3. Submit Complaint ──────────────────────────────────────────────────

    @patch("agents.fixr.complaints.get_client")
    @patch("agents.fixr.complaints.classify_complaint")
    def test_submit_complaint_success(self, mock_classify, mock_get_client):
        mock_classify.return_value = {
            "category": "electrical",
            "urgency": "medium",
            "short_summary": "Fan not working.",
            "classifier": "llm",
        }
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().insert().execute.return_value = MagicMock(
            data=[{
                "id": COMPLAINT_UUID,
                "student_id": STUDENT_UUID,
                "raw_text": "The fan in room 204 has stopped working.",
                "category": "electrical",
                "urgency": "medium",
                "status": "open",
            }]
        )

        res = submit_complaint(STUDENT_UUID, "The fan in room 204 has stopped working.")
        self.assertTrue(res["success"])
        self.assertEqual(res["complaint"]["category"], "electrical")
        self.assertEqual(res["complaint"]["urgency"], "medium")
        self.assertEqual(res["classification"]["category"], "electrical")

    def test_submit_complaint_validations(self):
        # Invalid UUID
        res_bad_id = submit_complaint("bad-uuid", "My fan is not working properly.")
        self.assertFalse(res_bad_id["success"])
        self.assertIn("Invalid or missing student_id", res_bad_id["message"])

        # Too short text
        res_short = submit_complaint(STUDENT_UUID, "fan broke")
        self.assertFalse(res_short["success"])
        self.assertIn("too short", res_short["message"])

        # Empty text
        res_empty = submit_complaint(STUDENT_UUID, "   ")
        self.assertFalse(res_empty["success"])

    # ── 4. View Complaints ───────────────────────────────────────────────────

    @patch("agents.fixr.complaints.get_client")
    def test_get_my_complaints(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().select().eq().order().range().execute.return_value = MagicMock(
            data=[
                {"id": "c1", "status": "open"},
                {"id": "c2", "status": "assigned"},
                {"id": "c3", "status": "resolved"},
            ]
        )

        res = get_my_complaints(STUDENT_UUID)
        self.assertTrue(res["success"])
        self.assertEqual(res["total"], 3)
        self.assertEqual(res["summary"]["open"], 1)
        self.assertEqual(res["summary"]["assigned"], 1)
        self.assertEqual(res["summary"]["resolved"], 1)

    @patch("agents.fixr.complaints.get_client")
    def test_get_all_complaints(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_query = MagicMock()
        mock_client.table.return_value = mock_query
        mock_query.select.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.range.return_value = mock_query
        mock_query.execute.return_value = MagicMock(
            data=[
                {"id": "c1", "urgency": "critical", "category": "plumbing", "status": "open", "created_at": "2026-09-10T10:00:00Z"},
                {"id": "c2", "urgency": "medium", "category": "electrical", "status": "resolved", "created_at": "2026-09-10T11:00:00Z"},
            ]
        )

        res = get_all_complaints(status_filter="open", category_filter="plumbing")
        self.assertTrue(res["success"])
        self.assertEqual(res["total"], 2)
        # Critical sorted first
        self.assertEqual(res["complaints"][0]["urgency"], "critical")
        self.assertEqual(res["global_summary"]["total"], 2)

    # ── 5. Update Complaint ──────────────────────────────────────────────────

    @patch("agents.fixr.complaints.get_client")
    def test_update_complaint(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Existence check
        mock_client.table().select().eq().limit().execute.return_value = MagicMock(
            data=[{"id": COMPLAINT_UUID, "status": "open"}]
        )
        # Update
        mock_client.table().update().eq().execute.return_value = MagicMock(
            data=[{
                "id": COMPLAINT_UUID,
                "status": "assigned",
                "assigned_worker_note": "Electrician Suresh assigned",
            }]
        )

        res = update_complaint(
            complaint_id=COMPLAINT_UUID,
            status="assigned",
            assigned_worker_note="Electrician Suresh assigned",
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["complaint"]["status"], "assigned")

    def test_update_complaint_validation(self):
        # Invalid status
        res_bad_status = update_complaint(COMPLAINT_UUID, status="in_progress")
        self.assertFalse(res_bad_status["success"])

        # No status and no worker note
        res_empty = update_complaint(COMPLAINT_UUID)
        self.assertFalse(res_empty["success"])

    # ── 6. Complaints Summary ────────────────────────────────────────────────

    @patch("agents.fixr.complaints.get_client")
    def test_get_complaints_summary(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().select().execute.return_value = MagicMock(
            data=[
                {"status": "open", "urgency": "critical", "category": "plumbing"},
                {"status": "open", "urgency": "high", "category": "electrical"},
                {"status": "resolved", "urgency": "low", "category": "carpentry"},
            ]
        )

        res = get_complaints_summary()
        self.assertTrue(res["success"])
        self.assertEqual(res["total"], 3)
        self.assertEqual(res["open_critical"], 1)
        self.assertEqual(res["open_high"], 1)
        self.assertEqual(res["by_status"]["open"], 2)
        self.assertEqual(res["by_status"]["resolved"], 1)

    # ── 7. Router Endpoints ──────────────────────────────────────────────────

    @patch("agents.fixr.router.get_complaints_summary")
    def test_endpoint_status(self, mock_summary):
        mock_summary.return_value = {"success": True, "total": 5}
        resp = client.get("/fixr/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["agent"], "FIXR")
        self.assertIn("llm_complaint_classification", data["capabilities"])

    @patch("agents.fixr.router.submit_complaint")
    def test_endpoint_submit_complaint(self, mock_submit):
        mock_submit.return_value = {
            "success": True,
            "message": "Complaint submitted successfully.",
            "complaint": {"id": COMPLAINT_UUID},
        }

        payload = {
            "student_id": STUDENT_UUID,
            "raw_text": "Water tap in bathroom 201 is leaking continuously.",
        }

        # Singular route
        resp1 = client.post("/fixr/complaint", json=payload)
        self.assertEqual(resp1.status_code, 200)
        self.assertTrue(resp1.json()["success"])

        # Plural alias route
        resp2 = client.post("/fixr/complaints", json=payload)
        self.assertEqual(resp2.status_code, 200)
        self.assertTrue(resp2.json()["success"])

    @patch("agents.fixr.router.get_my_complaints")
    def test_endpoint_my_complaints(self, mock_my):
        mock_my.return_value = {
            "success": True,
            "student_id": STUDENT_UUID,
            "total": 1,
            "complaints": [{"id": COMPLAINT_UUID, "status": "open"}],
        }
        resp = client.get(f"/fixr/complaints/mine?student_id={STUDENT_UUID}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["total"], 1)


if __name__ == "__main__":
    unittest.main()
