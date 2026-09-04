"""
NOURISH — Inventory NLP Command Execution & Audit Logging (Phase 3C)
===================================================================
Orchestrates:
  1. Parsing staff raw text via llm.inventory_nlp.
  2. Executing each extracted stock action via agents.nourish.inventory.update_stock.
  3. Writing the audit record to the `inventory_nlp_logs` Supabase table.
  4. Querying past NLP command logs for audit/review.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from db.supabase_client import get_client
from agents.nourish.inventory import update_stock
from llm.inventory_nlp import parse_inventory_command, InventoryNLPResult

logger = logging.getLogger("hostel.nourish.nlp_command")


def _clean_uuid(val: Optional[str]) -> Optional[str]:
    """Return valid UUID string or None if string is not a valid UUID."""
    if not val:
        return None
    try:
        return str(uuid.UUID(str(val).strip()))
    except (ValueError, AttributeError):
        return None


def process_inventory_command(
    raw_command: str,
    staff_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process a natural language mess inventory command:
    - Parses text using LLM/fallback
    - Applies all extracted actions to the inventory table
    - Records audit log in inventory_nlp_logs
    """
    parsed: InventoryNLPResult = parse_inventory_command(raw_command)

    if parsed.intent == "unclear" or not parsed.actions:
        return {
            "success": False,
            "raw_command": raw_command,
            "summary": parsed.summary,
            "clarification_needed": parsed.clarification_needed or "Command was unclear.",
            "actions_applied": [],
            "log_id": None,
        }

    clean_staff_id = _clean_uuid(staff_id)
    results: List[Dict[str, Any]] = []
    actions_data = [
        act.model_dump() if hasattr(act, "model_dump") else act.dict()
        for act in parsed.actions
    ]

    all_applied = True
    # Execute stock updates
    for act in parsed.actions:
        upd = update_stock(
            item_name=act.item_name,
            action=act.action,
            quantity=act.quantity,
            unit=act.unit,
            updated_by=clean_staff_id,
        )
        act_dict = act.model_dump() if hasattr(act, "model_dump") else act.dict()
        is_ok = bool(upd.get("success"))
        if not is_ok:
            all_applied = False
        results.append({
            "action": act_dict,
            "status": "applied" if is_ok else "failed",
            "message": upd.get("message") or upd.get("error"),
            "item": upd.get("item"),
        })

    # Record audit log in inventory_nlp_logs
    log_id = None
    try:
        client = get_client()
        log_payload: Dict[str, Any] = {
            "raw_command": raw_command,
            "parsed_action": actions_data,
        }
        if clean_staff_id:
            log_payload["staff_id"] = clean_staff_id

        res = client.table("inventory_nlp_logs").insert(log_payload).execute()
        if res.data and len(res.data) > 0:
            log_id = res.data[0].get("id")
    except Exception as exc:
        logger.warning("Failed to insert inventory_nlp_logs record: %s", exc)

    return {
        "success": all_applied,
        "raw_command": raw_command,
        "summary": parsed.summary,
        "actions_count": len(parsed.actions),
        "actions": actions_data,
        "results": results,
        "log_id": log_id,
    }


def get_nlp_command_logs(
    limit: int = 20,
    offset: int = 0,
) -> Dict[str, Any]:
    """Retrieve audit history of mess staff NLP commands."""
    try:
        client = get_client()
        res = (
            client.table("inventory_nlp_logs")
            .select("*")
            .order("timestamp", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        logs = res.data or []
        return {
            "success": True,
            "total": len(logs),
            "logs": logs,
        }
    except Exception as exc:
        logger.exception("Failed to query inventory_nlp_logs: %s", exc)
        return {
            "success": False,
            "error": str(exc),
            "logs": [],
        }
