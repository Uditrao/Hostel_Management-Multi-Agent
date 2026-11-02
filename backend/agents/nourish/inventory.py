"""
NOURISH — Inventory Logic (Phase 3B)
=====================================
Handles mess inventory:

  • get_inventory()           — fetch full inventory table.
  • update_stock()            — set / add / subtract item quantity (used by NLP + staff UI).
  • trigger_depletion()       — called after a meal window closes; subtracts consumed
                                quantities (entries × qty_per_student from mess_menu)
                                and creates inventory_alerts when stock is low.
  • get_active_alerts()       — return unresolved inventory alerts, sorted by urgency.
  • resolve_alert()           — mark an alert resolved (staff action).

Urgency thresholds (configurable via .env):
  INVENTORY_CRITICAL_MEALS=1   → stock covers ≤ 1 upcoming meal  → critical
  INVENTORY_HIGH_MEALS=3       → stock covers ≤ 3 upcoming meals  → high
  INVENTORY_MEDIUM_MEALS=7     → stock covers ≤ 7 upcoming meals  → medium
  else                         → low (no alert created for 'low')
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import uuid
from db.supabase_client import get_client

logger = logging.getLogger("hostel.nourish.inventory")

IST_TZ = timezone(timedelta(hours=5, minutes=30))


def _clean_uuid(val: Optional[str]) -> Optional[str]:
    """Return valid UUID string or None if string is not a valid UUID."""
    if not val:
        return None
    try:
        return str(uuid.UUID(str(val).strip()))
    except (ValueError, AttributeError):
        return None

# Urgency thresholds (how many upcoming meals the remaining stock can cover)
_CRITICAL = int(os.getenv("INVENTORY_CRITICAL_MEALS", "1"))
_HIGH     = int(os.getenv("INVENTORY_HIGH_MEALS",     "3"))
_MEDIUM   = int(os.getenv("INVENTORY_MEDIUM_MEALS",   "7"))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now_ist() -> datetime:
    return datetime.now(IST_TZ)


def _urgency_for_meals_left(meals_left: float) -> Optional[str]:
    """Return urgency string based on how many upcoming meals the stock covers."""
    if meals_left <= _CRITICAL:
        return "critical"
    if meals_left <= _HIGH:
        return "high"
    if meals_left <= _MEDIUM:
        return "medium"
    return None  # enough stock — no alert needed


# ── Inventory CRUD ───────────────────────────────────────────────────────────

def get_inventory() -> Dict[str, Any]:
    """Return the full inventory table sorted by item_name."""
    try:
        client = get_client()
        res = (
            client.table("inventory")
            .select("*")
            .order("item_name")
            .execute()
        )
        items = res.data or []
        for item in items:
            qty = float(item.get("quantity_available") if item.get("quantity_available") is not None else 0.0)
            item["quantity_available"] = qty
            item["quantity"] = qty
        return {
            "success": True,
            "total_items": len(items),
            "inventory": items,
        }
    except Exception as exc:
        logger.exception("NOURISH Inventory: fetch error — %s", exc)
        return {"success": False, "error": str(exc), "inventory": []}


def update_stock(
    item_name: str,
    action: str,          # "set" | "add" | "subtract"
    quantity: float,
    unit: str,
    updated_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update a single inventory item's stock.

    Args:
        item_name:  Canonical item name (case-insensitive match).
        action:     'set' (absolute) | 'add' (positive delta) | 'subtract' (negative delta).
        quantity:   Amount to set / add / subtract (always positive).
        unit:       Unit string (e.g. 'kg', 'L', 'units').
        updated_by: UUID of the user making the update (for audit trail).

    Returns:
        Dict with {success, item, message}
    """
    if action not in ("set", "add", "subtract"):
        return {"success": False, "error": "action must be 'set', 'add', or 'subtract'."}
    if quantity < 0:
        return {"success": False, "error": "quantity must be non-negative."}

    clean_name = item_name.strip()
    if not clean_name:
        return {"success": False, "error": "Item name cannot be empty."}

    try:
        client = get_client()

        # 1. Case-insensitive lookup
        existing = (
            client.table("inventory")
            .select("*")
            .ilike("item_name", clean_name)
            .limit(1)
            .execute()
        )

        # 2. If not found, check synonyms or common singular plurals
        if not (existing.data and len(existing.data) > 0):
            try:
                from llm.inventory_nlp import ITEM_SYNONYMS
                synonym = ITEM_SYNONYMS.get(clean_name.lower())
                if synonym and synonym.lower() != clean_name.lower():
                    existing = (
                        client.table("inventory")
                        .select("*")
                        .ilike("item_name", synonym)
                        .limit(1)
                        .execute()
                    )
                elif clean_name.lower().endswith("s") and len(clean_name) > 3:
                    singular = clean_name[:-1]
                    existing = (
                        client.table("inventory")
                        .select("*")
                        .ilike("item_name", singular)
                        .limit(1)
                        .execute()
                    )
            except Exception as match_err:
                logger.debug("Synonym check error: %s", match_err)

        now_iso = _now_ist().isoformat()

        if existing.data and len(existing.data) > 0:
            row = existing.data[0]
            current_qty = float(row.get("quantity_available") if row.get("quantity_available") is not None else 0.0)

            if action == "set":
                new_qty = quantity
            elif action == "add":
                new_qty = current_qty + quantity
            else:  # subtract
                new_qty = max(0.0, current_qty - quantity)

            # Preserve existing unit if none passed or empty
            effective_unit = unit.strip() if (unit and unit.strip()) else row.get("unit", "kg")

            payload: Dict[str, Any] = {
                "quantity_available": new_qty,
                "unit": effective_unit,
                "last_updated": now_iso,
            }
            clean_updater = _clean_uuid(updated_by)
            if clean_updater:
                payload["updated_by"] = clean_updater

            res = (
                client.table("inventory")
                .update(payload)
                .eq("id", row["id"])
                .execute()
            )
            updated = dict(res.data[0]) if (res.data and len(res.data) > 0) else {**row, **payload}
            updated["quantity_available"] = float(updated.get("quantity_available", new_qty))
            updated["quantity"] = updated["quantity_available"]
            logger.info(
                "NOURISH Inventory: %s %s %s %s (was %.2f -> now %.2f)",
                action, quantity, effective_unit, row.get("item_name", clean_name), current_qty, new_qty,
            )
            return {"success": True, "item": updated, "message": f"Stock updated: {row.get('item_name', clean_name)} -> {new_qty} {effective_unit}"}

        # Item doesn't exist yet — create it (only for 'set' or 'add')
        if action == "subtract":
            return {"success": False, "error": f"Item '{item_name}' not found in inventory."}

        new_qty = quantity
        canonical_name = clean_name.lower()
        try:
            from llm.inventory_nlp import ITEM_SYNONYMS
            canonical_name = ITEM_SYNONYMS.get(clean_name.lower(), clean_name.lower())
        except Exception:
            pass

        effective_unit = unit.strip() if (unit and unit.strip()) else "kg"
        create_payload: Dict[str, Any] = {
            "item_name": canonical_name,
            "quantity_available": new_qty,
            "unit": effective_unit,
            "last_updated": now_iso,
        }
        clean_updater = _clean_uuid(updated_by)
        if clean_updater:
            create_payload["updated_by"] = clean_updater

        res = client.table("inventory").insert(create_payload).execute()
        created = dict(res.data[0]) if (res.data and len(res.data) > 0) else create_payload
        created["quantity_available"] = float(created.get("quantity_available", new_qty))
        created["quantity"] = created["quantity_available"]
        logger.info("NOURISH Inventory: Created new item '%s' %.2f %s", canonical_name, new_qty, effective_unit)
        return {"success": True, "item": created, "message": f"New inventory item created: {canonical_name} {new_qty} {effective_unit}"}

    except Exception as exc:
        logger.exception("NOURISH Inventory: update_stock error — %s", exc)
        return {"success": False, "error": str(exc)}


# ── Depletion Engine ─────────────────────────────────────────────────────────

def trigger_depletion(meal_type: str, target_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Run after a meal window closes. Calculates consumption and updates inventory.

    Algorithm:
      1. Count recognised entries for the meal on target_date.
      2. Fetch ingredients from mess_menu for that meal (most recent effective date).
      3. For each ingredient: consumed = entries × qty_per_student_grams / 1000 (→ kg)
         or leave in native units if the unit from mess_menu is not grams.
      4. Subtract consumed from inventory.
      5. For each ingredient, estimate how many future same-type meals the remaining
         stock can cover → create/update inventory_alert if threshold breached.

    Returns:
        Dict with {success, meal_type, date, entries_count, depletions, alerts_raised}
    """
    try:
        client = get_client()
        now = _now_ist()
        td = target_date or now.date()
        date_str = td.isoformat()

        from datetime import time
        IST_TZ_local = timezone(timedelta(hours=5, minutes=30))
        start_iso = datetime.combine(td, time.min, tzinfo=IST_TZ_local).isoformat()
        end_iso   = datetime.combine(td, time.max, tzinfo=IST_TZ_local).isoformat()

        # 1. Count recognised entries for this meal
        entries_res = (
            client.table("mess_entries")
            .select("id", count="exact")
            .eq("meal_type", meal_type)
            .eq("is_recognized", True)
            .gte("timestamp", start_iso)
            .lte("timestamp", end_iso)
            .execute()
        )
        entries_count: int = entries_res.count or len(entries_res.data or [])

        if entries_count == 0:
            logger.info("NOURISH Depletion: 0 entries for %s on %s — skipping.", meal_type, date_str)
            return {
                "success": True,
                "meal_type": meal_type,
                "date": date_str,
                "entries_count": 0,
                "depletions": [],
                "alerts_raised": [],
                "message": "No entries found — no inventory depletion performed.",
            }

        # 2. Fetch most recent menu for this meal_type (ingredients as JSONB)
        menu_res = (
            client.table("mess_menu")
            .select("ingredients, effective_date")
            .eq("meal_type", meal_type)
            .lte("effective_date", date_str)
            .order("effective_date", desc=True)
            .limit(1)
            .execute()
        )
        if not menu_res.data:
            logger.warning("NOURISH Depletion: No menu found for %s — cannot deplete.", meal_type)
            return {
                "success": False,
                "meal_type": meal_type,
                "date": date_str,
                "entries_count": entries_count,
                "message": f"No menu configured for '{meal_type}'. Upload a menu first.",
            }

        ingredients: List[Dict] = menu_res.data[0].get("ingredients", [])
        # ingredients format: [{"name": "rice", "qty_per_student_grams": 150, "unit": "g"}, ...]

        depletions = []
        alerts_raised = []

        for ingredient in ingredients:
            name = ingredient.get("name", "").strip()
            qty_per_student = float(ingredient.get("qty_per_student_grams", 0))
            ing_unit = ingredient.get("unit", "g").lower()

            if not name or qty_per_student <= 0:
                continue

            # Convert to kg if ingredient unit is grams
            if ing_unit in ("g", "grams"):
                consumed_kg = (qty_per_student * entries_count) / 1000.0
                consumed_display = consumed_kg
                stock_unit = "kg"
            else:
                # Assume litres, units, etc. — subtract as-is
                consumed_display = qty_per_student * entries_count
                stock_unit = ing_unit

            # 3. Subtract from inventory
            depletion_result = update_stock(
                item_name=name,
                action="subtract",
                quantity=consumed_display,
                unit=stock_unit,
            )
            depletions.append({
                "ingredient": name,
                "consumed": consumed_display,
                "unit": stock_unit,
                "result": depletion_result,
            })

            # 4. Check remaining stock and raise alert if needed
            if depletion_result.get("success") and depletion_result.get("item"):
                remaining = float(depletion_result["item"].get("quantity_available", 0))
                # Estimate: how many same-type meals can remaining stock cover?
                qty_per_meal = (qty_per_student * entries_count) / (1000.0 if ing_unit in ("g", "grams") else 1.0)
                meals_left = (remaining / qty_per_meal) if qty_per_meal > 0 else 999
                urgency = _urgency_for_meals_left(meals_left)

                if urgency in ("critical", "high", "medium"):
                    alert_msg = (
                        f"{name.title()}: only {remaining:.2f} {stock_unit} left — "
                        f"covers approx {meals_left:.1f} more '{meal_type}' meals."
                    )
                    try:
                        alert_payload = {
                            "item_name": name,
                            "message": alert_msg,
                            "urgency": urgency,
                            "resolved": False,
                        }
                        alert_res = client.table("inventory_alerts").insert(alert_payload).execute()
                        alert = alert_res.data[0] if alert_res.data else alert_payload
                        alerts_raised.append(alert)
                        logger.warning("NOURISH Alert [%s]: %s", urgency.upper(), alert_msg)
                    except Exception as alert_exc:
                        logger.exception("NOURISH: Failed to insert alert — %s", alert_exc)

        logger.info(
            "NOURISH Depletion complete: meal=%s date=%s entries=%d depletions=%d alerts=%d",
            meal_type, date_str, entries_count, len(depletions), len(alerts_raised),
        )
        return {
            "success": True,
            "meal_type": meal_type,
            "date": date_str,
            "entries_count": entries_count,
            "depletions": depletions,
            "alerts_raised": alerts_raised,
        }

    except Exception as exc:
        logger.exception("NOURISH Depletion: unhandled error — %s", exc)
        return {"success": False, "meal_type": meal_type, "error": str(exc)}


# ── Alerts ───────────────────────────────────────────────────────────────────

def get_active_alerts(urgency_filter: Optional[str] = None) -> Dict[str, Any]:
    """
    Return all unresolved inventory alerts, sorted by urgency (critical first).
    Optionally filter by urgency level.
    """
    URGENCY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    try:
        client = get_client()
        query = (
            client.table("inventory_alerts")
            .select("*")
            .eq("resolved", False)
            .order("created_at", desc=True)
        )
        if urgency_filter:
            query = query.eq("urgency", urgency_filter)

        res = query.execute()
        alerts = res.data or []
        # Sort by urgency severity
        alerts.sort(key=lambda a: URGENCY_ORDER.get(a.get("urgency", "low"), 3))
        return {
            "success": True,
            "total_alerts": len(alerts),
            "alerts": alerts,
        }
    except Exception as exc:
        logger.exception("NOURISH: get_active_alerts error — %s", exc)
        return {"success": False, "error": str(exc), "alerts": []}


def resolve_alert(alert_id: str) -> Dict[str, Any]:
    """Mark an inventory alert as resolved."""
    try:
        client = get_client()
        res = (
            client.table("inventory_alerts")
            .update({"resolved": True})
            .eq("id", alert_id)
            .execute()
        )
        if res.data:
            return {"success": True, "alert": res.data[0]}
        return {"success": False, "error": f"Alert {alert_id} not found."}
    except Exception as exc:
        logger.exception("NOURISH: resolve_alert error — %s", exc)
        return {"success": False, "error": str(exc)}
