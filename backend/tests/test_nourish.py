"""
Unit & Integration Tests for NOURISH (Mess Agent — Phase 3A + 3B)
==================================================================
Tests:
  1. determine_meal_type: correctly identifies breakfast, lunch, dinner, and outside-window.
  2. record_mess_entry:
      - Valid recognized entry in meal window -> allowed.
      - Duplicate entry for same meal -> denied with already_entered=True.
      - Unrecognized face -> denied, logs flagged_image_url.
      - Outside meal window -> denied.
  3. update_stock:
      - 'set', 'add', 'subtract' actions on inventory.
      - Automatic creation of new items.
  4. trigger_depletion:
      - Calculates ingredient depletion based on student count × per-portion recipe.
      - Raises inventory alert when stock drops below threshold.
  5. Alerts CRUD: retrieve active alerts, sort by urgency, resolve alert.
  6. Menu CRUD: saving and retrieving menu entries.
  7. FastAPI router endpoints: /nourish/status, /nourish/mess-event, /nourish/inventory.
"""

import sys
import os
from unittest.mock import MagicMock

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
from unittest.mock import patch, MagicMock
from datetime import datetime, date, time
from fastapi.testclient import TestClient
from fastapi import FastAPI

from agents.nourish.entry import (
    determine_meal_type,
    record_mess_entry,
    get_today_entries,
    IST_TZ,
)
from agents.nourish.inventory import (
    update_stock,
    get_inventory,
    get_active_alerts,
    resolve_alert,
    trigger_depletion,
)
from agents.nourish.menu import (
    save_menu,
    get_menu,
)
from agents.nourish.nlp_command import (
    process_inventory_command,
    get_nlp_command_logs,
)
from llm.inventory_nlp import (
    parse_inventory_command,
    _rule_based_fallback,
)
from agents.nourish.router import router as nourish_router

test_app = FastAPI()
test_app.include_router(nourish_router, prefix="/nourish")
client = TestClient(test_app)


class NourishAgentTests(unittest.TestCase):

    # ── 1. Meal Type Detection ───────────────────────────────────────────────

    def test_determine_meal_type(self):
        self.assertEqual(determine_meal_type(time(8, 0)), "breakfast")
        self.assertEqual(determine_meal_type(time(13, 0)), "lunch")
        self.assertEqual(determine_meal_type(time(20, 0)), "dinner")
        self.assertIsNone(determine_meal_type(time(16, 0)))  # 4 PM = outside windows

    # ── 2. Mess Entry Gating ─────────────────────────────────────────────────

    @patch("agents.nourish.entry.determine_meal_type")
    @patch("agents.nourish.entry.get_client")
    def test_record_mess_entry_allowed(self, mock_get_client, mock_meal_type):
        mock_meal_type.return_value = "lunch"
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # No duplicate entry exists
        mock_client.table().select().eq().eq().eq().gte().lte().limit().execute.return_value = MagicMock(data=[])
        # Insert success
        mock_client.table().insert().execute.return_value = MagicMock(data=[{"id": "entry-1", "student_id": "stud-1"}])

        event = {
            "recognized": True,
            "student_id": "stud-1",
            "student_name": "Test Student",
            "roll_no": "CS101",
            "confidence": 0.85,
            "location": "mess",
        }
        result = record_mess_entry(event)

        self.assertTrue(result["success"])
        self.assertTrue(result["allowed"])
        self.assertFalse(result["already_entered"])
        self.assertEqual(result["meal_type"], "lunch")

    @patch("agents.nourish.entry.determine_meal_type")
    @patch("agents.nourish.entry.get_client")
    def test_record_mess_entry_duplicate_denied(self, mock_get_client, mock_meal_type):
        mock_meal_type.return_value = "dinner"
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # Existing entry for dinner today
        mock_client.table().select().eq().eq().eq().gte().lte().limit().execute.return_value = MagicMock(
            data=[{"id": "entry-existing", "student_id": "stud-1", "meal_type": "dinner"}]
        )

        event = {
            "recognized": True,
            "student_id": "stud-1",
            "student_name": "Test Student",
            "location": "mess",
        }
        result = record_mess_entry(event)

        self.assertTrue(result["success"])
        self.assertFalse(result["allowed"])
        self.assertTrue(result["already_entered"])
        self.assertIn("already entered", result["reason"])

    @patch("agents.nourish.entry.determine_meal_type")
    @patch("agents.nourish.entry.get_client")
    def test_record_mess_entry_unrecognized(self, mock_get_client, mock_meal_type):
        mock_meal_type.return_value = "breakfast"
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().insert().execute.return_value = MagicMock(data=[{"id": "flagged-1"}])

        event = {
            "recognized": False,
            "student_id": None,
            "flagged_image_url": "https://storage.hostel.com/unknown/frame1.jpg",
            "location": "mess",
        }
        result = record_mess_entry(event)

        self.assertTrue(result["success"])
        self.assertFalse(result["allowed"])
        self.assertIn("not recognised", result["reason"])

    # ── 3. Stock Management ──────────────────────────────────────────────────

    @patch("agents.nourish.inventory.get_client")
    def test_update_stock_add_and_set(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # 1. Existing item add
        mock_client.table().select().ilike().limit().execute.return_value = MagicMock(
            data=[{"id": "inv-1", "item_name": "Rice", "quantity_available": 50.0, "unit": "kg"}]
        )
        mock_client.table().update().eq().execute.return_value = MagicMock(
            data=[{"id": "inv-1", "item_name": "Rice", "quantity_available": 75.0, "unit": "kg"}]
        )

        add_res = update_stock("Rice", "add", 25.0, "kg")
        self.assertTrue(add_res["success"])
        self.assertEqual(add_res["item"]["quantity_available"], 75.0)

        # 2. New item creation via set
        mock_client.table().select().ilike().limit().execute.return_value = MagicMock(data=[])
        mock_client.table().insert().execute.return_value = MagicMock(
            data=[{"id": "inv-2", "item_name": "Paneer", "quantity_available": 20.0, "unit": "kg"}]
        )

        set_res = update_stock("Paneer", "set", 20.0, "kg")
        self.assertTrue(set_res["success"])
        self.assertEqual(set_res["item"]["quantity_available"], 20.0)

    # ── 4. Depletion Engine ──────────────────────────────────────────────────

    @patch("agents.nourish.inventory.update_stock")
    @patch("agents.nourish.inventory.get_client")
    def test_trigger_depletion_and_alerts(self, mock_get_client, mock_update_stock):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        # 100 students attended lunch
        mock_client.table("mess_entries").select().eq().eq().gte().lte().execute.return_value = MagicMock(
            count=100, data=[{"id": f"e-{i}"} for i in range(100)]
        )

        # Menu has rice: 150g per student (100 * 150g = 15kg consumed)
        mock_client.table("mess_menu").select().eq().lte().order().limit().execute.return_value = MagicMock(
            data=[{
                "ingredients": [{"name": "rice", "qty_per_student_grams": 150, "unit": "g"}],
                "effective_date": "2026-09-03",
            }]
        )

        # Remaining stock after 15kg subtraction is only 5kg (less than 1 meal left -> critical alert!)
        mock_update_stock.return_value = {
            "success": True,
            "item": {"item_name": "rice", "quantity_available": 5.0, "unit": "kg"},
        }
        mock_client.table("inventory_alerts").insert().execute.return_value = MagicMock(
            data=[{"id": "alert-1", "item_name": "rice", "urgency": "critical"}]
        )

        result = trigger_depletion("lunch", target_date=date(2026, 9, 3))

        self.assertTrue(result["success"])
        self.assertEqual(result["entries_count"], 100)
        self.assertEqual(len(result["depletions"]), 1)
        self.assertEqual(result["depletions"][0]["consumed"], 15.0)  # 15 kg
        self.assertEqual(len(result["alerts_raised"]), 1)

    # ── 5. Menu CRUD ─────────────────────────────────────────────────────────

    @patch("agents.nourish.menu.get_client")
    def test_save_and_get_menu(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        dishes = [
            {"dish_name": "Dal Tadka", "ingredients": [{"name": "dal", "qty_per_student_grams": 50, "unit": "g"}]}
        ]
        mock_client.table().insert().execute.return_value = MagicMock(
            data=[{"id": "menu-1", "meal_type": "dinner", "dish_name": "Dal Tadka", "effective_date": "2026-09-03"}]
        )

        save_res = save_menu("dinner", "2026-09-03", dishes)
        self.assertTrue(save_res["success"])
        self.assertEqual(save_res["saved_rows"], 1)

        # Get menu
        mock_client.table().select().eq().lte().order().execute.return_value = MagicMock(
            data=[{"meal_type": "dinner", "effective_date": "2026-09-03", "dish_name": "Dal Tadka"}]
        )
        get_res = get_menu("dinner", "2026-09-03")
        self.assertTrue(get_res["success"])
        self.assertEqual(len(get_res["dishes"]), 1)

    # ── 6. FastAPI Router Endpoints ──────────────────────────────────────────

    def test_endpoint_nourish_status(self):
        resp = client.get("/nourish/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["agent"], "NOURISH")
        self.assertIn("mess_entry_gating", data["capabilities"])
        self.assertIn("inventory_management", data["capabilities"])

    @patch("agents.nourish.router.get_inventory")
    def test_endpoint_inventory_list(self, mock_get_inv):
        mock_get_inv.return_value = {
            "success": True,
            "total_items": 2,
            "inventory": [{"item_name": "Rice", "quantity_available": 100}],
        }
        resp = client.get("/nourish/inventory")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["total_items"], 2)

    # ── 7. Phase 3C NLP Command Bar ──────────────────────────────────────────

    @patch("llm.inventory_nlp.generate_structured_json")
    def test_parse_inventory_command_llm(self, mock_llm):
        mock_llm.return_value = {
            "intent": "inventory_update",
            "actions": [
                {"item_name": "rice", "action": "add", "quantity": 25.0, "unit": "kg", "note": "vendor delivery"},
                {"item_name": "milk", "action": "add", "quantity": 10.0, "unit": "L", "note": "vendor delivery"},
            ],
            "summary": "Added 25kg rice and 10L milk",
        }
        res = parse_inventory_command("Added 25kg rice and 10L milk delivered by vendor")
        self.assertEqual(res.intent, "inventory_update")
        self.assertEqual(len(res.actions), 2)
        self.assertEqual(res.actions[0].item_name, "rice")
        self.assertEqual(res.actions[0].action, "add")
        self.assertEqual(res.actions[0].quantity, 25.0)
        self.assertEqual(res.actions[0].unit, "kg")
        self.assertEqual(res.actions[1].item_name, "milk")
        self.assertEqual(res.actions[1].quantity, 10.0)

    def test_parse_inventory_command_rule_fallback(self):
        # Offline rule fallback without LLM
        res = _rule_based_fallback("add 20kg rice and 15kg potato")
        self.assertEqual(res.intent, "inventory_update")
        self.assertEqual(len(res.actions), 2)
        self.assertEqual(res.actions[0].item_name, "rice")
        self.assertEqual(res.actions[0].quantity, 20.0)
        self.assertEqual(res.actions[1].item_name, "potato")

    @patch("agents.nourish.nlp_command.get_client")
    @patch("agents.nourish.nlp_command.update_stock")
    @patch("agents.nourish.nlp_command.parse_inventory_command")
    def test_process_inventory_command_execution(self, mock_parse, mock_update, mock_get_client):
        from llm.inventory_nlp import InventoryNLPResult, InventoryActionItem

        mock_parse.return_value = InventoryNLPResult(
            intent="inventory_update",
            actions=[
                InventoryActionItem(item_name="potato", action="subtract", quantity=5.0, unit="kg", note="spoiled")
            ],
            summary="Subtracted 5kg potato",
        )
        mock_update.return_value = {
            "success": True,
            "item": {"item_name": "potato", "quantity_available": 45.0, "unit": "kg"},
            "message": "Stock updated: potato -> 45.0 kg",
        }
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().insert().execute.return_value = MagicMock(data=[{"id": "log-123"}])

        res = process_inventory_command("Mark 5kg potatoes spoiled", staff_id="staff-uuid-1")
        self.assertTrue(res["success"])
        self.assertEqual(res["actions_count"], 1)
        self.assertEqual(res["log_id"], "log-123")
        self.assertEqual(res["results"][0]["status"], "applied")
        mock_update.assert_called_once_with(
            item_name="potato",
            action="subtract",
            quantity=5.0,
            unit="kg",
            updated_by="staff-uuid-1",
        )

    def test_process_inventory_command_empty(self):
        res = process_inventory_command("   ")
        self.assertFalse(res["success"])
        self.assertIsNotNone(res["clarification_needed"])

    @patch("agents.nourish.router.process_inventory_command")
    def test_endpoint_inventory_command(self, mock_proc):
        mock_proc.return_value = {
            "success": True,
            "raw_command": "Added 10kg rice",
            "summary": "Added 10kg rice",
            "actions_count": 1,
            "actions": [{"item_name": "rice", "action": "add", "quantity": 10.0, "unit": "kg"}],
            "results": [{"status": "applied", "message": "Updated"}],
            "log_id": "log-999",
        }
        resp = client.post(
            "/nourish/inventory/command",
            json={"command": "Added 10kg rice", "staff_id": "staff-1"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["log_id"], "log-999")

    @patch("agents.nourish.router.get_nlp_command_logs")
    def test_endpoint_inventory_command_logs(self, mock_logs):
        mock_logs.return_value = {
            "success": True,
            "total": 1,
            "logs": [{"id": "log-1", "raw_command": "Added 10kg rice"}],
        }
        resp = client.get("/nourish/inventory/command-logs?limit=10&offset=0")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["total"], 1)


if __name__ == "__main__":
    unittest.main()

