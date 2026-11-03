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


# ── Proactive Forecast & Advance Procurement Alert Engine ─────────────────────

# ── Proactive Forecast & Advance Procurement Alert Engine ─────────────────────

def check_and_generate_forecast_alerts(
    head_count: Optional[int] = None,
    sync_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Proactively calculates raw ingredient requirements for:
      1. TODAY'S upcoming meals (Immediate Kitchen Emergency -> Critical 🔴)
      2. TOMORROW'S full schedule (Advance Market Procurement -> High 🟠)

    Formula:
      Required = Headcount × Per-Student Ratio
      Deficit  = Required - Available Stock

    Args:
        head_count: Number of planned diners (auto-calculated from student count if None).
        sync_to_db: If True, writes new unresolved alerts to the inventory_alerts table.

    Returns:
        Structured breakdown with today's immediate shortages, tomorrow's market shopping list,
        and summarized alert statistics.
    """
    from datetime import time
    try:
        client = get_client()
        now = _now_ist()
        today_date = now.date()
        tomorrow_date = today_date + timedelta(days=1)
        today_str = today_date.isoformat()
        tomorrow_str = tomorrow_date.isoformat()

        # 1. Resolve effective head count
        effective_headcount = head_count
        if not effective_headcount or effective_headcount <= 0:
            try:
                # First check verified student enrollment count
                stud_res = client.table("students").select("id", count="exact").execute()
                count = stud_res.count or len(stud_res.data or [])
                effective_headcount = count if count > 0 else 150
            except Exception:
                effective_headcount = 150

        # 2. Determine what meals remain TODAY vs TOMORROW
        ct = now.time()
        # Remaining meals today based on IST wall clock:
        if ct < time(9, 30):
            today_meals = ["breakfast", "lunch", "dinner"]
        elif ct < time(14, 30):
            today_meals = ["lunch", "dinner"]
        elif ct < time(21, 30):
            today_meals = ["dinner"]
        else:
            today_meals = []

        tomorrow_meals = ["breakfast", "lunch", "dinner"]

        # 3. Import item synonyms for normalization
        try:
            from llm.inventory_nlp import ITEM_SYNONYMS
        except Exception:
            ITEM_SYNONYMS = {}

        # 4. Helper to aggregate ingredient needs for a list of meals on a date
        def _aggregate_needs(meals_list: List[str], date_str: str) -> Dict[str, Dict[str, Any]]:
            needs: Dict[str, Dict[str, Any]] = {}
            for m in meals_list:
                try:
                    menu_res = (
                        client.table("mess_menu")
                        .select("*")
                        .eq("meal_type", m)
                        .lte("effective_date", date_str)
                        .order("effective_date", desc=True)
                        .execute()
                    )
                    rows = menu_res.data or []
                    if not rows:
                        continue
                    latest_eff = rows[0].get("effective_date")
                    meal_dishes = [r for r in rows if r.get("effective_date") == latest_eff]

                    for d in meal_dishes:
                        d_name = d.get("dish_name", "Dish")
                        raw_ings = d.get("ingredients") or []
                        if isinstance(raw_ings, str):
                            import json
                            try:
                                raw_ings = json.loads(raw_ings)
                            except Exception:
                                raw_ings = []

                        for ing in raw_ings:
                            raw_name = str(ing.get("name", "")).strip().lower()
                            if not raw_name:
                                continue
                            canon = ITEM_SYNONYMS.get(raw_name, raw_name)
                            g_per_stud = float(ing.get("qty_per_student_grams", 0.0) or 0.0)
                            unit = ing.get("unit", "kg")
                            # Convert grams to kg if unit is grams
                            needed_qty = (effective_headcount * g_per_stud) / 1000.0 if unit in ("g", "grams") else (effective_headcount * g_per_stud)

                            if canon not in needs:
                                needs[canon] = {
                                    "item_name": canon,
                                    "display_name": canon.title(),
                                    "needed": 0.0,
                                    "unit": "kg" if unit in ("g", "grams") else unit,
                                    "meals": set(),
                                    "dishes": set(),
                                }
                            needs[canon]["needed"] += needed_qty
                            needs[canon]["meals"].add(f"{m.title()}")
                            needs[canon]["dishes"].add(d_name)
                except Exception as m_err:
                    logger.debug("Error aggregating needs for %s on %s: %s", m, date_str, m_err)
            return needs

        today_needs = _aggregate_needs(today_meals, today_str)
        tomorrow_needs = _aggregate_needs(tomorrow_meals, tomorrow_str)

        # 5. Fetch current inventory stock map
        inv_res = client.table("inventory").select("*").execute()
        inv_rows = inv_res.data or []
        inv_map: Dict[str, Dict[str, Any]] = {}
        for r in inv_rows:
            iname = str(r.get("item_name", "")).strip().lower()
            canon = ITEM_SYNONYMS.get(iname, iname)
            qty = float(r.get("quantity_available") if r.get("quantity_available") is not None else 0.0)
            inv_map[canon] = {
                "id": r.get("id"),
                "item_name": canon,
                "available": qty,
                "unit": r.get("unit", "kg"),
            }

        # 6. Evaluate Shortages & Classify Urgency
        today_shortages = []
        tomorrow_shortages = []
        forecast_alerts = []

        all_ingredients = set(list(today_needs.keys()) + list(tomorrow_needs.keys()))

        for item_key in sorted(all_ingredients):
            t_req = today_needs.get(item_key, {})
            tm_req = tomorrow_needs.get(item_key, {})

            needed_today = float(t_req.get("needed", 0.0))
            needed_tomorrow = float(tm_req.get("needed", 0.0))

            inv_entry = inv_map.get(item_key)
            available = inv_entry["available"] if inv_entry else 0.0
            unit = t_req.get("unit") or tm_req.get("unit") or (inv_entry.get("unit") if inv_entry else "kg")

            # Check 1: TODAY'S immediate shortage (Critical 🔴)
            if needed_today > 0 and available < needed_today:
                deficit_today = needed_today - available
                meals_str = ", ".join(t_req.get("meals", []))
                dishes_str = ", ".join(t_req.get("dishes", []))
                alert_msg = (
                    f"CRITICAL DEFICIT (Today's {meals_str}): "
                    f"Need {needed_today:.1f} {unit} of {item_key.title()} for [{dishes_str}], "
                    f"but only {available:.1f} {unit} in stock! Shortage: {deficit_today:.1f} {unit}."
                )
                item_data = {
                    "item_name": item_key,
                    "urgency": "critical",
                    "timeframe": "today",
                    "needed": round(needed_today, 2),
                    "available": round(available, 2),
                    "deficit": round(deficit_today, 2),
                    "unit": unit,
                    "meals": list(t_req.get("meals", [])),
                    "dishes": list(t_req.get("dishes", [])),
                    "message": alert_msg,
                }
                today_shortages.append(item_data)
                forecast_alerts.append(item_data)

            # Check 2: TOMORROW'S advance procurement check (High 🟠)
            # Remaining stock available after today's consumption:
            remaining_after_today = max(0.0, available - needed_today)

            if needed_tomorrow > 0 and remaining_after_today < needed_tomorrow:
                deficit_tomorrow = needed_tomorrow - remaining_after_today
                meals_str = ", ".join(tm_req.get("meals", []))
                dishes_str = ", ".join(tm_req.get("dishes", []))
                alert_msg = (
                    f"ADVANCE PROCUREMENT (Tomorrow's {meals_str}): "
                    f"Need {needed_tomorrow:.1f} {unit} of {item_key.title()} for [{dishes_str}]. "
                    f"Remaining stock after today will be {remaining_after_today:.1f} {unit}. "
                    f"Procure {deficit_tomorrow:.1f} {unit} today from market!"
                )
                item_data = {
                    "item_name": item_key,
                    "urgency": "high",
                    "timeframe": "tomorrow",
                    "needed": round(needed_tomorrow, 2),
                    "available": round(remaining_after_today, 2),
                    "deficit": round(deficit_tomorrow, 2),
                    "unit": unit,
                    "meals": list(tm_req.get("meals", [])),
                    "dishes": list(tm_req.get("dishes", [])),
                    "message": alert_msg,
                }
                tomorrow_shortages.append(item_data)
                forecast_alerts.append(item_data)

        # 7. Optionally Sync Generated Alerts to database table (avoiding spam duplicates)
        if sync_to_db and forecast_alerts:
            for alert in forecast_alerts:
                try:
                    # Check if an active unresolved alert with same urgency exists
                    exist_check = (
                        client.table("inventory_alerts")
                        .select("id")
                        .eq("item_name", alert["item_name"])
                        .eq("urgency", alert["urgency"])
                        .eq("resolved", False)
                        .limit(1)
                        .execute()
                    )
                    if not (exist_check.data and len(exist_check.data) > 0):
                        client.table("inventory_alerts").insert({
                            "item_name": alert["item_name"],
                            "message": alert["message"],
                            "urgency": alert["urgency"],
                            "created_at": now.isoformat(),
                            "resolved": False,
                        }).execute()
                except Exception as sync_err:
                    logger.debug("Could not sync alert to DB: %s", sync_err)

        return {
            "success": True,
            "head_count": effective_headcount,
            "today_date": today_str,
            "tomorrow_date": tomorrow_str,
            "today_meals_checked": today_meals,
            "tomorrow_meals_checked": tomorrow_meals,
            "summary": {
                "critical_today_count": len(today_shortages),
                "advance_procurement_tomorrow_count": len(tomorrow_shortages),
                "total_alerts": len(forecast_alerts),
            },
            "today_shortages": today_shortages,
            "tomorrow_shortages": tomorrow_shortages,
            "all_alerts": forecast_alerts,
        }

    except Exception as exc:
        logger.exception("NOURISH Forecast Alerts Error: %s", exc)
        return {
            "success": False,
            "error": str(exc),
            "today_shortages": [],
            "tomorrow_shortages": [],
            "all_alerts": [],
        }


# ── Depletion Engine ─────────────────────────────────────────────────────────

def trigger_depletion(
    meal_type: str,
    target_date: Optional[date] = None,
    head_count_override: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run after a meal window closes or when staff clicks 'Mark Meal as Served'.
    Calculates consumption and deducts quantities from inventory.

    Supports:
      1. Dynamic head_count_override from live Kiosk / staff input.
      2. Multi-dish menu aggregation with JSON string / JSONB support.
      3. Automatic item synonym canonicalization (e.g., chawal -> rice).
      4. Auto-generation of inventory alerts if remaining stock breaches safety buffer.
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

        # 1. Determine Diner Headcount
        if head_count_override is not None and int(head_count_override) > 0:
            entries_count = int(head_count_override)
            count_source = "staff_override"
        else:
            entries_res = (
                client.table("mess_entries")
                .select("id", count="exact")
                .eq("meal_type", meal_type)
                .eq("is_recognized", True)
                .gte("timestamp", start_iso)
                .lte("timestamp", end_iso)
                .execute()
            )
            entries_count = entries_res.count or len(entries_res.data or [])
            count_source = "kiosk_biometrics"

        if entries_count == 0:
            logger.info("NOURISH Depletion: 0 entries for %s on %s — skipping.", meal_type, date_str)
            return {
                "success": True,
                "meal_type": meal_type,
                "date": date_str,
                "entries_count": 0,
                "count_source": count_source,
                "depletions": [],
                "alerts_raised": [],
                "message": f"No diners recorded for {meal_type.title()} on {date_str}. Pass an estimated headcount to deplete stock.",
            }

        # 2. Fetch all dishes configured for this meal_type on the latest effective date
        menu_res = (
            client.table("mess_menu")
            .select("*")
            .eq("meal_type", meal_type)
            .lte("effective_date", date_str)
            .order("effective_date", desc=True)
            .execute()
        )
        rows = menu_res.data or []
        if not rows:
            logger.warning("NOURISH Depletion: No menu found for %s — cannot deplete.", meal_type)
            return {
                "success": False,
                "meal_type": meal_type,
                "date": date_str,
                "entries_count": entries_count,
                "message": f"No menu configured for '{meal_type}'. Upload or save a menu first.",
            }

        latest_eff = rows[0].get("effective_date")
        meal_dishes = [r for r in rows if r.get("effective_date") == latest_eff]

        try:
            from llm.inventory_nlp import ITEM_SYNONYMS
        except Exception:
            ITEM_SYNONYMS = {}

        # 3. Aggregate ingredient requirements across all dishes
        aggregated: Dict[str, Dict[str, Any]] = {}
        for dish in meal_dishes:
            dish_name = dish.get("dish_name", "Dish")
            raw_ings = dish.get("ingredients") or []
            if isinstance(raw_ings, str):
                import json
                try:
                    raw_ings = json.loads(raw_ings)
                except Exception:
                    raw_ings = []

            for ing in raw_ings:
                raw_name = str(ing.get("name", "")).strip().lower()
                if not raw_name:
                    continue
                canon = ITEM_SYNONYMS.get(raw_name, raw_name)
                g_per_stud = float(ing.get("qty_per_student_grams", 0.0) or 0.0)
                unit = str(ing.get("unit", "g")).lower()

                if canon not in aggregated:
                    aggregated[canon] = {
                        "name": canon,
                        "display_name": canon.title(),
                        "qty_per_student_grams": 0.0,
                        "unit": unit,
                        "dishes": set(),
                    }
                aggregated[canon]["qty_per_student_grams"] += g_per_stud
                aggregated[canon]["dishes"].add(dish_name)

        depletions = []
        alerts_raised = []

        # 4. Perform stock deduction for each ingredient
        for item_key, item_info in aggregated.items():
            name = item_info["name"]
            qty_per_stud = item_info["qty_per_student_grams"]
            unit_str = item_info["unit"]

            if qty_per_stud <= 0:
                continue

            if unit_str in ("g", "grams"):
                consumed = round((qty_per_stud * entries_count) / 1000.0, 3)
                stock_unit = "kg"
            else:
                consumed = round(qty_per_stud * entries_count, 3)
                stock_unit = unit_str

            depletion_result = update_stock(
                item_name=name,
                action="subtract",
                quantity=consumed,
                unit=stock_unit,
            )

            depletions.append({
                "ingredient": name,
                "consumed": consumed,
                "unit": stock_unit,
                "dishes": list(item_info["dishes"]),
                "result": depletion_result,
            })

            # Check stock buffer and raise alert if low
            if depletion_result.get("success") and depletion_result.get("item"):
                remaining = float(depletion_result["item"].get("quantity_available", 0))
                qty_per_meal = (qty_per_stud * entries_count) / (1000.0 if unit_str in ("g", "grams") else 1.0)
                meals_left = (remaining / qty_per_meal) if qty_per_meal > 0 else 999
                urgency = _urgency_for_meals_left(meals_left)

                if urgency in ("critical", "high", "medium"):
                    alert_msg = (
                        f"{name.title()}: only {remaining:.2f} {stock_unit} left — "
                        f"covers approx {meals_left:.1f} more '{meal_type}' meals."
                    )
                    try:
                        # Check duplicate alert
                        existing = (
                            client.table("inventory_alerts")
                            .select("id")
                            .eq("item_name", name)
                            .eq("urgency", urgency)
                            .eq("resolved", False)
                            .execute()
                        )
                        if not (existing.data and len(existing.data) > 0):
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
            "NOURISH Depletion complete: meal=%s date=%s diners=%d (%s) depletions=%d alerts=%d",
            meal_type, date_str, entries_count, count_source, len(depletions), len(alerts_raised),
        )
        return {
            "success": True,
            "meal_type": meal_type,
            "date": date_str,
            "entries_count": entries_count,
            "count_source": count_source,
            "depletions": depletions,
            "alerts_raised": alerts_raised,
            "message": f"Successfully depleted ingredients for {entries_count} diners ({meal_type.title()}).",
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


# ── Proactive Forecast & Advance Procurement Alert Engine ─────────────────────

def check_and_generate_forecast_alerts(
    head_count: Optional[int] = None,
    sync_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Proactively calculates raw ingredient requirements for:
      1. TODAY'S upcoming meals (Immediate Kitchen Emergency -> Critical 🔴)
      2. TOMORROW'S full schedule (Advance Market Procurement -> High 🟠)

    Formula:
      Required = Headcount × Per-Student Ratio
      Deficit  = Required - Available Stock

    Args:
        head_count: Number of planned diners (auto-calculated from student count if None).
        sync_to_db: If True, writes new unresolved alerts to the inventory_alerts table.

    Returns:
        Structured breakdown with today's immediate shortages, tomorrow's market shopping list,
        and summarized alert statistics.
    """
    from datetime import time
    try:
        client = get_client()
        now = _now_ist()
        today_date = now.date()
        tomorrow_date = today_date + timedelta(days=1)
        today_str = today_date.isoformat()
        tomorrow_str = tomorrow_date.isoformat()

        # 1. Resolve effective head count
        effective_headcount = head_count
        if not effective_headcount or effective_headcount <= 0:
            try:
                # First check verified student enrollment count
                stud_res = client.table("students").select("id", count="exact").execute()
                count = stud_res.count or len(stud_res.data or [])
                effective_headcount = count if count > 0 else 150
            except Exception:
                effective_headcount = 150

        # 2. Determine what meals remain TODAY vs TOMORROW
        ct = now.time()
        # Remaining meals today based on IST wall clock:
        if ct < time(9, 30):
            today_meals = ["breakfast", "lunch", "dinner"]
        elif ct < time(14, 30):
            today_meals = ["lunch", "dinner"]
        elif ct < time(21, 30):
            today_meals = ["dinner"]
        else:
            today_meals = []

        tomorrow_meals = ["breakfast", "lunch", "dinner"]

        # 3. Import item synonyms for normalization
        try:
            from llm.inventory_nlp import ITEM_SYNONYMS
        except Exception:
            ITEM_SYNONYMS = {}

        # 4. Helper to aggregate ingredient needs for a list of meals on a date
        def _aggregate_needs(meals_list: List[str], date_str: str) -> Dict[str, Dict[str, Any]]:
            needs: Dict[str, Dict[str, Any]] = {}
            for m in meals_list:
                try:
                    menu_res = (
                        client.table("mess_menu")
                        .select("*")
                        .eq("meal_type", m)
                        .lte("effective_date", date_str)
                        .order("effective_date", desc=True)
                        .execute()
                    )
                    rows = menu_res.data or []
                    if not rows:
                        continue
                    latest_eff = rows[0].get("effective_date")
                    meal_dishes = [r for r in rows if r.get("effective_date") == latest_eff]

                    for d in meal_dishes:
                        d_name = d.get("dish_name", "Dish")
                        raw_ings = d.get("ingredients") or []
                        if isinstance(raw_ings, str):
                            import json
                            try:
                                raw_ings = json.loads(raw_ings)
                            except Exception:
                                raw_ings = []

                        for ing in raw_ings:
                            raw_name = str(ing.get("name", "")).strip().lower()
                            if not raw_name:
                                continue
                            canon = ITEM_SYNONYMS.get(raw_name, raw_name)
                            g_per_stud = float(ing.get("qty_per_student_grams", 0.0) or 0.0)
                            unit = ing.get("unit", "kg")
                            # Convert grams to kg if unit is grams
                            needed_qty = (effective_headcount * g_per_stud) / 1000.0 if unit in ("g", "grams") else (effective_headcount * g_per_stud)

                            if canon not in needs:
                                needs[canon] = {
                                    "item_name": canon,
                                    "display_name": canon.title(),
                                    "needed": 0.0,
                                    "unit": "kg" if unit in ("g", "grams") else unit,
                                    "meals": set(),
                                    "dishes": set(),
                                }
                            needs[canon]["needed"] += needed_qty
                            needs[canon]["meals"].add(f"{m.title()}")
                            needs[canon]["dishes"].add(d_name)
                except Exception as m_err:
                    logger.debug("Error aggregating needs for %s on %s: %s", m, date_str, m_err)
            return needs

        today_needs = _aggregate_needs(today_meals, today_str)
        tomorrow_needs = _aggregate_needs(tomorrow_meals, tomorrow_str)

        # 5. Fetch current inventory stock map
        inv_res = client.table("inventory").select("*").execute()
        inv_rows = inv_res.data or []
        inv_map: Dict[str, Dict[str, Any]] = {}
        for r in inv_rows:
            iname = str(r.get("item_name", "")).strip().lower()
            canon = ITEM_SYNONYMS.get(iname, iname)
            qty = float(r.get("quantity_available") if r.get("quantity_available") is not None else 0.0)
            inv_map[canon] = {
                "id": r.get("id"),
                "item_name": canon,
                "available": qty,
                "unit": r.get("unit", "kg"),
            }

        # 6. Evaluate Shortages & Classify Urgency
        today_shortages = []
        tomorrow_shortages = []
        forecast_alerts = []

        all_ingredients = set(list(today_needs.keys()) + list(tomorrow_needs.keys()))

        for item_key in sorted(all_ingredients):
            t_req = today_needs.get(item_key, {})
            tm_req = tomorrow_needs.get(item_key, {})

            needed_today = float(t_req.get("needed", 0.0))
            needed_tomorrow = float(tm_req.get("needed", 0.0))

            inv_entry = inv_map.get(item_key)
            available = inv_entry["available"] if inv_entry else 0.0
            unit = t_req.get("unit") or tm_req.get("unit") or (inv_entry.get("unit") if inv_entry else "kg")

            # Check 1: TODAY'S immediate shortage (Critical 🔴)
            if needed_today > 0 and available < needed_today:
                deficit_today = needed_today - available
                meals_str = ", ".join(t_req.get("meals", []))
                dishes_str = ", ".join(t_req.get("dishes", []))
                alert_msg = (
                    f"CRITICAL DEFICIT (Today's {meals_str}): "
                    f"Need {needed_today:.1f} {unit} of {item_key.title()} for [{dishes_str}], "
                    f"but only {available:.1f} {unit} in stock! Shortage: {deficit_today:.1f} {unit}."
                )
                item_data = {
                    "item_name": item_key,
                    "urgency": "critical",
                    "timeframe": "today",
                    "needed": round(needed_today, 2),
                    "available": round(available, 2),
                    "deficit": round(deficit_today, 2),
                    "unit": unit,
                    "meals": list(t_req.get("meals", [])),
                    "dishes": list(t_req.get("dishes", [])),
                    "message": alert_msg,
                }
                today_shortages.append(item_data)
                forecast_alerts.append(item_data)

            # Check 2: TOMORROW'S advance procurement check (High 🟠)
            # Remaining stock available after today's consumption:
            remaining_after_today = max(0.0, available - needed_today)

            if needed_tomorrow > 0 and remaining_after_today < needed_tomorrow:
                deficit_tomorrow = needed_tomorrow - remaining_after_today
                meals_str = ", ".join(tm_req.get("meals", []))
                dishes_str = ", ".join(tm_req.get("dishes", []))
                alert_msg = (
                    f"ADVANCE PROCUREMENT (Tomorrow's {meals_str}): "
                    f"Need {needed_tomorrow:.1f} {unit} of {item_key.title()} for [{dishes_str}]. "
                    f"Remaining stock after today will be {remaining_after_today:.1f} {unit}. "
                    f"Procure {deficit_tomorrow:.1f} {unit} today from market!"
                )
                item_data = {
                    "item_name": item_key,
                    "urgency": "high",
                    "timeframe": "tomorrow",
                    "needed": round(needed_tomorrow, 2),
                    "available": round(remaining_after_today, 2),
                    "deficit": round(deficit_tomorrow, 2),
                    "unit": unit,
                    "meals": list(tm_req.get("meals", [])),
                    "dishes": list(tm_req.get("dishes", [])),
                    "message": alert_msg,
                }
                tomorrow_shortages.append(item_data)
                forecast_alerts.append(item_data)

        # 7. Optionally Sync Generated Alerts to database table (avoiding spam duplicates)
        if sync_to_db and forecast_alerts:
            for alert in forecast_alerts:
                try:
                    # Check if an active unresolved alert with same urgency exists
                    exist_check = (
                        client.table("inventory_alerts")
                        .select("id")
                        .eq("item_name", alert["item_name"])
                        .eq("urgency", alert["urgency"])
                        .eq("resolved", False)
                        .limit(1)
                        .execute()
                    )
                    if not (exist_check.data and len(exist_check.data) > 0):
                        client.table("inventory_alerts").insert({
                            "item_name": alert["item_name"],
                            "message": alert["message"],
                            "urgency": alert["urgency"],
                            "created_at": now.isoformat(),
                            "resolved": False,
                        }).execute()
                except Exception as sync_err:
                    logger.debug("Could not sync alert to DB: %s", sync_err)

        return {
            "success": True,
            "head_count": effective_headcount,
            "today_date": today_str,
            "tomorrow_date": tomorrow_str,
            "today_meals_checked": today_meals,
            "tomorrow_meals_checked": tomorrow_meals,
            "summary": {
                "critical_today_count": len(today_shortages),
                "advance_procurement_tomorrow_count": len(tomorrow_shortages),
                "total_alerts": len(forecast_alerts),
            },
            "today_shortages": today_shortages,
            "tomorrow_shortages": tomorrow_shortages,
            "all_alerts": forecast_alerts,
        }

    except Exception as exc:
        logger.exception("NOURISH Forecast Alerts Error: %s", exc)
        return {
            "success": False,
            "error": str(exc),
            "today_shortages": [],
            "tomorrow_shortages": [],
            "all_alerts": [],
        }


# ── Phase 8: Hybrid Stock Issue (Pre-filled Depletion) & Wastage Engine ──────

_IN_MEMORY_WASTAGE_LOGS: List[Dict[str, Any]] = []


def get_depletion_estimate(
    meal_type: str,
    head_count: Optional[int] = None,
    target_date: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Computes recipe-based pre-filled quantities for a specific meal service,
    allowing staff to review and adjust before actual kitchen stock issue.
    """
    try:
        client = get_client()
        now = _now_ist()
        td = target_date or now.date()
        date_str = td.isoformat()

        # 1. Resolve effective headcount
        effective_headcount = head_count
        if not effective_headcount or effective_headcount <= 0:
            try:
                from datetime import time
                IST_TZ_local = timezone(timedelta(hours=5, minutes=30))
                start_iso = datetime.combine(td, time.min, tzinfo=IST_TZ_local).isoformat()
                end_iso = datetime.combine(td, time.max, tzinfo=IST_TZ_local).isoformat()
                entries_res = (
                    client.table("mess_entries")
                    .select("id", count="exact")
                    .eq("meal_type", meal_type)
                    .eq("is_recognized", True)
                    .gte("timestamp", start_iso)
                    .lte("timestamp", end_iso)
                    .execute()
                )
                kiosk_count = entries_res.count or len(entries_res.data or [])
                if kiosk_count > 0:
                    effective_headcount = kiosk_count
            except Exception:
                pass

        if not effective_headcount or effective_headcount <= 0:
            try:
                stud_res = client.table("students").select("id", count="exact").execute()
                count = stud_res.count or len(stud_res.data or [])
                effective_headcount = count if count > 0 else 150
            except Exception:
                effective_headcount = 150

        # 2. Fetch mess menu for this meal on latest effective date
        menu_res = (
            client.table("mess_menu")
            .select("*")
            .eq("meal_type", meal_type)
            .lte("effective_date", date_str)
            .order("effective_date", desc=True)
            .execute()
        )
        rows = menu_res.data or []
        if not rows:
            return {
                "success": False,
                "meal_type": meal_type,
                "date": date_str,
                "head_count": effective_headcount,
                "items": [],
                "message": f"No menu configured for '{meal_type}'. Upload or save a menu first.",
            }

        latest_eff = rows[0].get("effective_date")
        meal_dishes = [r for r in rows if r.get("effective_date") == latest_eff]

        try:
            from llm.inventory_nlp import ITEM_SYNONYMS
        except Exception:
            ITEM_SYNONYMS = {}

        # 3. Aggregate recipe ingredients
        aggregated: Dict[str, Dict[str, Any]] = {}
        for dish in meal_dishes:
            dish_name = dish.get("dish_name", "Dish")
            raw_ings = dish.get("ingredients") or []
            if isinstance(raw_ings, str):
                import json
                try:
                    raw_ings = json.loads(raw_ings)
                except Exception:
                    raw_ings = []

            for ing in raw_ings:
                raw_name = str(ing.get("name", "")).strip().lower()
                if not raw_name:
                    continue
                canon = ITEM_SYNONYMS.get(raw_name, raw_name)
                g_per_stud = float(ing.get("qty_per_student_grams", 0.0) or 0.0)
                unit = str(ing.get("unit", "g")).lower()

                if canon not in aggregated:
                    aggregated[canon] = {
                        "item_name": canon,
                        "display_name": canon.title(),
                        "qty_per_student_grams": 0.0,
                        "unit": "kg" if unit in ("g", "grams") else unit,
                        "dishes": set(),
                    }
                aggregated[canon]["qty_per_student_grams"] += g_per_stud
                aggregated[canon]["dishes"].add(dish_name)

        # 4. Fetch available inventory stock map
        inv_res = client.table("inventory").select("*").execute()
        inv_map: Dict[str, float] = {}
        for row in inv_res.data or []:
            name = str(row.get("item_name", "")).strip().lower()
            canon_name = ITEM_SYNONYMS.get(name, name)
            qty = float(row.get("quantity_available") or row.get("quantity") or 0.0)
            inv_map[canon_name] = inv_map.get(canon_name, 0.0) + qty

        # 5. Build output item list
        items = []
        for item_key, item_info in aggregated.items():
            g_per_stud = item_info["qty_per_student_grams"]
            unit = item_info["unit"]
            suggested = round((g_per_stud * effective_headcount) / 1000.0, 2) if unit == "kg" else round(g_per_stud * effective_headcount, 2)
            avail = round(inv_map.get(item_key, 0.0), 2)

            items.append({
                "item_name": item_key,
                "display_name": item_info["display_name"],
                "suggested_qty": suggested,
                "unit": unit,
                "available_stock": avail,
                "dishes": list(item_info["dishes"]),
                "is_low_stock": avail < suggested,
            })

        return {
            "success": True,
            "meal_type": meal_type,
            "date": date_str,
            "head_count": effective_headcount,
            "items": items,
            "dishes_count": len(meal_dishes),
        }
    except Exception as exc:
        logger.exception("NOURISH Depletion Estimate Error: %s", exc)
        return {"success": False, "error": str(exc), "items": []}


def execute_custom_depletion(
    meal_type: str,
    items: List[Dict[str, Any]],
    head_count: Optional[int] = None,
    target_date: Optional[date] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Deducts customized quantities of ingredients from inventory when issued to kitchen.
    Raises alerts for items whose stock breaches safety thresholds.
    """
    try:
        client = get_client()
        now = _now_ist()
        td = target_date or now.date()
        date_str = td.isoformat()

        depletions = []
        alerts_raised = []

        try:
            from llm.inventory_nlp import ITEM_SYNONYMS
        except Exception:
            ITEM_SYNONYMS = {}

        for item in items:
            raw_name = str(item.get("item_name", "")).strip().lower()
            qty = float(item.get("quantity", 0.0) or 0.0)
            unit = str(item.get("unit", "kg")).strip().lower()
            if not raw_name or qty <= 0:
                continue

            canon = ITEM_SYNONYMS.get(raw_name, raw_name)

            dep_res = update_stock(
                item_name=canon,
                action="subtract",
                quantity=qty,
                unit=unit,
            )

            depletions.append({
                "ingredient": canon,
                "consumed": qty,
                "unit": unit,
                "result": dep_res,
            })

            # Check threshold and raise alert
            if dep_res.get("success") and dep_res.get("item"):
                remaining = float(dep_res["item"].get("quantity_available", 0))
                meals_left = (remaining / qty) if qty > 0 else 999
                urgency = _urgency_for_meals_left(meals_left)
                if urgency in ("critical", "high", "medium"):
                    alert_msg = (
                        f"{canon.title()}: only {remaining:.2f} {unit} left in stock — "
                        f"covers approx {meals_left:.1f} more '{meal_type}' services."
                    )
                    try:
                        existing = (
                            client.table("inventory_alerts")
                            .select("id")
                            .eq("item_name", canon)
                            .eq("urgency", urgency)
                            .eq("resolved", False)
                            .execute()
                        )
                        if not (existing.data and len(existing.data) > 0):
                            alert_payload = {
                                "item_name": canon,
                                "message": alert_msg,
                                "urgency": urgency,
                                "resolved": False,
                            }
                            alert_res = client.table("inventory_alerts").insert(alert_payload).execute()
                            alert = alert_res.data[0] if alert_res.data else alert_payload
                            alerts_raised.append(alert)
                    except Exception as a_err:
                        logger.debug("Failed to record depletion alert: %s", a_err)

        return {
            "success": True,
            "meal_type": meal_type,
            "date": date_str,
            "head_count": head_count,
            "notes": notes,
            "depletions": depletions,
            "alerts_raised": alerts_raised,
            "message": f"Successfully issued and depleted {len(depletions)} ingredient(s) for {meal_type.title()}.",
        }
    except Exception as exc:
        logger.exception("NOURISH Custom Depletion Error: %s", exc)
        return {"success": False, "error": str(exc), "depletions": [], "alerts_raised": []}


def log_meal_wastage(
    meal_type: str,
    waste_kg: float,
    head_count_served: Optional[int] = None,
    target_date: Optional[date] = None,
    leftover_dishes: Optional[str] = None,
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    logged_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Logs post-meal leftover food in kg, computes waste per diner, and persists to meal_wastage.
    """
    try:
        client = get_client()
        now = _now_ist()
        td = target_date or now.date()
        date_str = td.isoformat()

        hc = int(head_count_served or 0)
        waste_float = round(float(waste_kg), 2)
        waste_per_student = round((waste_float * 1000.0) / max(1, hc), 1) if hc > 0 else 0.0

        if waste_float <= 3.0:
            rating = "optimal"
        elif waste_float <= 8.0:
            rating = "moderate"
        else:
            rating = "high"

        record = {
            "id": str(uuid.uuid4()),
            "meal_type": meal_type,
            "date": date_str,
            "head_count_served": hc,
            "waste_kg": waste_float,
            "waste_per_student_grams": waste_per_student,
            "leftover_dishes": leftover_dishes or "",
            "reason": reason or "",
            "notes": notes or "",
            "logged_by": logged_by,
            "created_at": now.isoformat(),
            "rating": rating,
        }

        try:
            insert_payload = {k: v for k, v in record.items() if k not in ("rating",)}
            res = client.table("meal_wastage").insert(insert_payload).execute()
            if res.data:
                record["id"] = res.data[0].get("id", record["id"])
        except Exception as db_err:
            logger.warning("Could not persist to meal_wastage table (using memory cache): %s", db_err)
            _IN_MEMORY_WASTAGE_LOGS.insert(0, record)
            if len(_IN_MEMORY_WASTAGE_LOGS) > 100:
                _IN_MEMORY_WASTAGE_LOGS.pop()

        return {
            "success": True,
            "record": record,
            "message": f"Logged {waste_float} kg leftover waste for {meal_type.title()} ({waste_per_student}g / diner).",
        }
    except Exception as exc:
        logger.exception("NOURISH Log Wastage Error: %s", exc)
        return {"success": False, "error": str(exc)}


def get_recent_wastage(limit: int = 10) -> Dict[str, Any]:
    """
    Returns recent post-meal wastage entries.
    """
    try:
        client = get_client()
        records = []
        try:
            res = (
                client.table("meal_wastage")
                .select("*")
                .order("date", desc=True)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            records = res.data or []
        except Exception as db_err:
            logger.debug("Falling back to in-memory wastage logs: %s", db_err)
            records = _IN_MEMORY_WASTAGE_LOGS[:limit]

        now = _now_ist()
        today_str = now.date().isoformat()
        today_total_kg = sum(float(r.get("waste_kg", 0.0)) for r in records if r.get("date") == today_str)

        return {
            "success": True,
            "today_total_waste_kg": round(today_total_kg, 2),
            "records": records,
        }
    except Exception as exc:
        logger.exception("NOURISH Get Wastage Error: %s", exc)
        return {"success": False, "error": str(exc), "records": []}
