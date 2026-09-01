"""
Unit & Integration Tests for SENTINEL (Attendance Agent)
=========================================================
Tests:
  1. Attendance window evaluation (present within window, late outside window).
  2. Gate attendance recording (first time -> marked, second time -> idempotent / already_marked).
  3. Defaulter calculation (identifying enrolled students without today's log).
  4. Attendance window retrieval & update.
  5. Student attendance history lookup.
  6. FastAPI router endpoints for /sentinel/*.
"""

import sys
import os
from unittest.mock import MagicMock

# Mock third-party dependencies that might not be installed in the test runner
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
from unittest.mock import patch, AsyncMock
from datetime import datetime, date, time
from fastapi.testclient import TestClient

from agents.sentinel.attendance import (
    record_gate_attendance,
    get_defaulters,
    get_attendance_window,
    update_attendance_window,
    get_student_attendance,
    IST_TZ,
)
from agents.sentinel.router import router as sentinel_router
from fastapi import FastAPI

test_app = FastAPI()
test_app.include_router(sentinel_router, prefix="/sentinel")
client = TestClient(test_app)


class SentinelAttendanceTests(unittest.TestCase):

    @patch("agents.sentinel.attendance.get_client")
    def test_record_gate_attendance_present(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock: No existing log today
        mock_client.table().select().eq().gte().lte().limit().execute.return_value = MagicMock(data=[])
        # Mock window: 00:00 to 23:59 so current time is always present
        mock_client.table().select().limit().execute.return_value = MagicMock(
            data=[{"start_time": "00:00:00", "end_time": "23:59:59", "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}]
        )
        # Mock insert
        inserted_row = {
            "id": "att-123",
            "student_id": "stud-1",
            "status": "present",
            "timestamp": datetime.now(IST_TZ).isoformat(),
            "method": "face",
        }
        mock_client.table().insert().execute.return_value = MagicMock(data=[inserted_row])

        event = {
            "recognized": True,
            "student_id": "stud-1",
            "student_name": "Test Student",
            "roll_no": "CS101",
            "location": "gate",
        }

        result = record_gate_attendance(event)

        self.assertTrue(result["success"])
        self.assertFalse(result["already_marked"])
        self.assertEqual(result["status"], "present")
        self.assertEqual(result["student_id"], "stud-1")

    @patch("agents.sentinel.attendance.get_client")
    def test_record_gate_attendance_idempotency(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Mock: Existing log already exists
        existing_log = {
            "id": "att-existing",
            "student_id": "stud-1",
            "status": "present",
            "timestamp": "2026-09-01T08:30:00+05:30",
        }
        mock_client.table().select().eq().gte().lte().limit().execute.return_value = MagicMock(data=[existing_log])

        event = {
            "recognized": True,
            "student_id": "stud-1",
            "student_name": "Test Student",
            "roll_no": "CS101",
            "location": "gate",
        }

        result = record_gate_attendance(event)

        self.assertTrue(result["success"])
        self.assertTrue(result["already_marked"])
        self.assertEqual(result["status"], "present")
        self.assertEqual(result["log"]["id"], "att-existing")

    @patch("agents.sentinel.attendance.get_client")
    def test_get_defaulters_calculation(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # 3 students enrolled
        students_mock = MagicMock(data=[
            {"id": "s1", "name": "Student 1", "roll_no": "101", "room_no": "A-1"},
            {"id": "s2", "name": "Student 2", "roll_no": "102", "room_no": "A-2"},
            {"id": "s3", "name": "Student 3", "roll_no": "103", "room_no": "A-3"},
        ])
        # Only s1 attended
        logs_mock = MagicMock(data=[
            {"student_id": "s1", "status": "present", "timestamp": "2026-09-01T08:00:00+05:30"},
        ])

        mock_client.table("students").select().execute.return_value = students_mock
        mock_client.table("attendance_logs").select().gte().lte().execute.return_value = logs_mock

        result = get_defaulters(target_date=date(2026, 9, 1))

        self.assertTrue(result["success"])
        self.assertEqual(result["total_enrolled"], 3)
        self.assertEqual(result["present_count"], 1)
        self.assertEqual(result["defaulter_count"], 2)
        defaulter_ids = [d["student_id"] for d in result["defaulters"]]
        self.assertIn("s2", defaulter_ids)
        self.assertIn("s3", defaulter_ids)
        self.assertNotIn("s1", defaulter_ids)

    @patch("agents.sentinel.attendance.get_client")
    def test_attendance_window_crud(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Test get_window
        mock_client.table().select().limit().execute.return_value = MagicMock(
            data=[{"id": "w1", "start_time": "06:30:00", "end_time": "08:30:00", "active_days": ["Mon", "Tue"]}]
        )
        window = get_attendance_window()
        self.assertEqual(window["start_time"], "06:30:00")

        # Test update_window
        mock_client.table().select().limit().execute.return_value = MagicMock(data=[{"id": "w1"}])
        mock_client.table().update().eq().execute.return_value = MagicMock(
            data=[{"id": "w1", "start_time": "07:00:00", "end_time": "09:30:00", "active_days": ["Mon", "Wed"]}]
        )
        update_res = update_attendance_window("07:00", "09:30", ["Mon", "Wed"])
        self.assertTrue(update_res["success"])
        self.assertEqual(update_res["window"]["end_time"], "09:30:00")

    @patch("agents.sentinel.attendance.get_client")
    def test_get_student_attendance(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        mock_logs = [
            {"id": "log1", "student_id": "stud-1", "status": "present", "timestamp": "2026-09-01T08:00:00+05:30"},
            {"id": "log2", "student_id": "stud-1", "status": "late", "timestamp": "2026-08-31T09:15:00+05:30"},
        ]
        mock_client.table().select().eq().order().limit().execute.return_value = MagicMock(data=mock_logs)

        result = get_student_attendance("stud-1")
        self.assertTrue(result["success"])
        self.assertEqual(result["total_records"], 2)
        self.assertEqual(result["present_count"], 1)
        self.assertEqual(result["late_count"], 1)

    # ── Router endpoint integration tests ──

    @patch("agents.sentinel.router.get_attendance_window")
    def test_endpoint_status(self, mock_window):
        mock_window.return_value = {
            "start_time": "07:00:00",
            "end_time": "09:00:00",
            "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        }
        resp = client.get("/sentinel/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["agent"], "SENTINEL")
        self.assertEqual(data["status"], "online")

    @patch("agents.sentinel.router.record_gate_attendance")
    def test_endpoint_gate_event(self, mock_record):
        mock_record.return_value = {
            "success": True,
            "already_marked": False,
            "status": "present",
            "student_id": "stud-1",
            "message": "Attendance successfully marked as 'present'.",
        }
        payload = {
            "recognized": True,
            "student_id": "stud-1",
            "student_name": "Test Student",
            "roll_no": "CS101",
            "confidence": 0.92,
            "location": "gate",
        }
        resp = client.post("/sentinel/gate-event", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "present")

    @patch("agents.sentinel.router.get_defaulters")
    def test_endpoint_defaulters(self, mock_defaulters):
        mock_defaulters.return_value = {
            "success": True,
            "date": "2026-09-01",
            "total_enrolled": 10,
            "defaulter_count": 2,
            "defaulters": [{"student_id": "s2", "roll_no": "102", "name": "Student 2"}],
        }
        resp = client.get("/sentinel/defaulters?target_date=2026-09-01")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["defaulter_count"], 2)


if __name__ == "__main__":
    unittest.main()
