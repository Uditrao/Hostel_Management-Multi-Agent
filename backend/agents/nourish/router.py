"""
NOURISH — FastAPI Router (Phase 3A + 3B)
==========================================
Phase 3A endpoints:
  GET  /nourish/status          -- Agent health check & current meal window
  POST /nourish/mess-event      -- Process identity event from IRIS/kiosk at mess gate
  GET  /nourish/entries         -- Today's entry counts per meal (warden/staff view)
  GET  /nourish/entries/{meal}  -- Paginated entries for a specific meal
  GET  /nourish/meal-windows    -- Show configured meal time windows

Phase 3B endpoints (Inventory + Menu):
  GET  /nourish/inventory                      -- Full inventory table
  POST /nourish/inventory/update               -- Set / add / subtract stock (staff action)
  GET  /nourish/inventory/alerts               -- Active inventory alerts (sorted by urgency)
  POST /nourish/inventory/alerts/{id}/resolve  -- Resolve an alert
  POST /nourish/depletion                      -- Manually trigger post-meal depletion
  POST /nourish/menu/upload                    -- Upload + parse a menu PDF via Gemini
  POST /nourish/menu/save                      -- Save confirmed menu to DB
  GET  /nourish/menu/{meal_type}               -- Get current menu for a meal
  GET  /nourish/menus                          -- List all menus (paginated)

Phase 3C routes (NLP command bar) will be added to this router next.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from agents.nourish.entry import (
    record_mess_entry,
    get_today_entries,
    get_entries_by_meal,
    determine_meal_type,
    MEAL_WINDOWS,
)
from agents.nourish.inventory import (
    get_inventory,
    update_stock,
    trigger_depletion,
    get_active_alerts,
    resolve_alert,
)
from agents.nourish.menu import (
    parse_menu_pdf,
    save_menu,
    save_multiple_meals,
    get_menu,
    list_menus,
)
from agents.nourish.nlp_command import (
    process_inventory_command,
    get_nlp_command_logs,
)

logger = logging.getLogger("hostel.nourish.router")

router = APIRouter()


# -- Pydantic Request Schemas --------------------------------------------------

class MessEventRequest(BaseModel):
    recognized:        bool            = Field(...,   description="Whether the face was recognised by IRIS")
    student_id:        Optional[str]   = Field(None,  description="UUID of the matched student")
    student_name:      Optional[str]   = Field(None,  description="Full name of the matched student")
    roll_no:           Optional[str]   = Field(None,  description="Roll number of the matched student")
    room_no:           Optional[str]   = Field(None,  description="Room number of the matched student")
    confidence:        Optional[float] = Field(None,  description="Cosine similarity score (0-1)")
    location:          Optional[str]   = Field("mess",description="Should be 'mess' for this endpoint")
    flagged_image_url: Optional[str]   = Field(None,  description="URL of the saved flagged image (unrecognised)")


class StockUpdateRequest(BaseModel):
    item_name:  str            = Field(..., example="rice", description="Name of the inventory item")
    action:     str            = Field(..., example="add",  description="'set' | 'add' | 'subtract'")
    quantity:   float          = Field(..., gt=0,           description="Quantity (always positive)")
    unit:       str            = Field(..., example="kg",   description="Unit (e.g. 'kg', 'L', 'units')")
    updated_by: Optional[str]  = Field(None,                description="UUID of the staff member")


class DepletionRequest(BaseModel):
    meal_type:   str           = Field(..., description="'breakfast' | 'lunch' | 'dinner'")
    target_date: Optional[str] = Field(None, description="YYYY-MM-DD (defaults to today IST)")


class MenuSaveRequest(BaseModel):
    meal_type:      Optional[str]        = Field(None, description="'breakfast' | 'lunch' | 'dinner' (required for single meal)")
    effective_date: Optional[str]        = Field(None, description="YYYY-MM-DD (required for single meal)")
    dishes:         Optional[List[dict]] = Field(None, description="List of {dish_name, ingredients:[...]} for single meal")
    meals:          Optional[List[dict]] = Field(None, description="Batch list of meals for full weekly schedule save")
    confirmed_by:   Optional[str]        = Field(None, description="UUID of confirming staff member")


class InventoryCommandRequest(BaseModel):
    command:  str           = Field(..., example="Added 25kg rice and 10L milk delivered by vendor", description="Natural language inventory command")
    staff_id: Optional[str] = Field(None, description="UUID of the staff member (optional)")


# -- Phase 3A Routes -----------------------------------------------------------

@router.get("/status", summary="NOURISH agent health check")
async def nourish_status():
    """Returns the NOURISH agent status, current active meal window, and capability summary."""
    current_meal = determine_meal_type()
    return {
        "agent":        "NOURISH",
        "codename":     "🍽️ NOURISH — feeds everyone",
        "status":       "online",
        "capabilities": [
            "mess_entry_gating",
            "duplicate_entry_prevention",
            "unrecognised_face_flagging",
            "meal_window_detection",
            "inventory_management",
            "post_meal_depletion",
            "inventory_alerts",
            "menu_pdf_parsing",
            "inventory_nlp_command",
        ],
        "current_meal":  current_meal,
        "meal_windows":  {
            meal: {
                "start": str(window["start"])[:5],
                "end":   str(window["end"])[:5],
            }
            for meal, window in MEAL_WINDOWS.items()
        },
    }


@router.post(
    "/mess-event",
    summary="Process identity event at the mess gate",
    response_description="Entry decision: allowed or denied, with reason and log entry",
)
async def process_mess_event(event: MessEventRequest):
    """
    Called by IRIS or the Camera Kiosk after face recognition at the mess gate.

    Decision matrix:
    - **Recognised + in meal window + no duplicate** → Entry **allowed** and logged.
    - **Recognised + duplicate for this meal** → Entry **denied** (already entered).
    - **Recognised + outside meal window** → Entry **denied** (not meal time).
    - **Unrecognised** → Entry **denied**, attempt logged with `flagged_image_url`.
    """
    event_dict = event.model_dump()
    result = record_mess_entry(event_dict)
    logger.info(
        "NOURISH mess-event: recognized=%s student=%s meal=%s allowed=%s",
        event.recognized, event.student_id,
        result.get("meal_type"), result.get("allowed"),
    )
    return result


@router.get("/entries", summary="Today's mess entry summary (warden/staff view)")
async def get_entries_summary(
    target_date: Optional[str] = Query(
        None, pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date in YYYY-MM-DD format (defaults to today IST)",
    ),
):
    parsed_date: Optional[date] = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    return get_today_entries(target_date=parsed_date)


@router.get("/entries/{meal_type}", summary="Detailed entries for a specific meal")
async def get_meal_entries(
    meal_type: str,
    target_date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    recognised_only: bool = Query(False),
):
    if meal_type not in ("breakfast", "lunch", "dinner"):
        raise HTTPException(status_code=400, detail="meal_type must be 'breakfast', 'lunch', or 'dinner'.")
    parsed_date: Optional[date] = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    return get_entries_by_meal(meal_type=meal_type, target_date=parsed_date,
                               limit=limit, offset=offset, recognised_only=recognised_only)


@router.get("/meal-windows", summary="Show configured meal time windows")
async def get_meal_windows():
    return {
        "meal_windows": {
            meal: {"start": str(window["start"])[:5], "end": str(window["end"])[:5]}
            for meal, window in MEAL_WINDOWS.items()
        },
        "note": (
            "Override via .env: BREAKFAST_START, BREAKFAST_END, "
            "LUNCH_START, LUNCH_END, DINNER_START, DINNER_END (HH:MM format)"
        ),
    }


# -- Phase 3B Routes: Inventory ------------------------------------------------

@router.get("/inventory", summary="Get full inventory list (staff/warden view)")
async def inventory_list():
    """Returns the full mess inventory table sorted by item name."""
    return get_inventory()


@router.post("/inventory/update", summary="Update inventory stock (staff action)")
async def inventory_update(body: StockUpdateRequest):
    """
    Set, add, or subtract quantity for a named inventory item.

    - **set**: Replace stock with exact quantity (e.g. after a manual stock count).
    - **add**: Increment stock (e.g. new delivery arrived).
    - **subtract**: Decrement stock (e.g. manual adjustment or NLP command result).

    If the item does not exist yet, **set** or **add** will create it automatically.
    """
    result = update_stock(
        item_name=body.item_name, action=body.action,
        quantity=body.quantity, unit=body.unit, updated_by=body.updated_by,
    )
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error", "Stock update failed."))
    return result


@router.get("/inventory/alerts", summary="Get active inventory alerts (sorted by urgency)")
async def inventory_alerts(
    urgency: Optional[str] = Query(None, description="Filter: 'critical' | 'high' | 'medium'"),
):
    """Returns all unresolved inventory alerts, sorted critical → high → medium."""
    return get_active_alerts(urgency_filter=urgency)


@router.post(
    "/inventory/alerts/{alert_id}/resolve",
    summary="Resolve an inventory alert",
)
async def resolve_inventory_alert(alert_id: str):
    """Mark a specific inventory alert as resolved (staff/warden action)."""
    result = resolve_alert(alert_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Alert not found."))
    return result


@router.post("/depletion", summary="Trigger post-meal inventory depletion")
async def run_depletion(body: DepletionRequest):
    """
    Calculates consumption for a completed meal and subtracts from inventory.
    Raises `inventory_alerts` for any ingredient falling below stock thresholds.
    """
    parsed_date: Optional[date] = None
    if body.target_date:
        try:
            parsed_date = date.fromisoformat(body.target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    return trigger_depletion(meal_type=body.meal_type, target_date=parsed_date)


# -- Phase 3B Routes: Menu PDF -------------------------------------------------

@router.post(
    "/menu/upload",
    summary="Upload a mess menu PDF and parse it with Gemini",
)
async def upload_menu_pdf(
    file: UploadFile = File(..., description="Mess menu PDF file"),
):
    """
    Upload a PDF mess menu. Sends it to **Google Gemini** (native PDF understanding)
    and returns structured JSON with dishes and ingredients.

    **This endpoint only parses — it does NOT save to the database.**
    Review the extracted data, then call `/nourish/menu/save` to confirm.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    result = parse_menu_pdf(pdf_bytes=pdf_bytes, filename=file.filename)
    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error", "Gemini menu parsing failed."))
    return result


@router.post("/menu/save", summary="Save confirmed menu to database (supports single meal or full weekly batch)")
async def save_confirmed_menu(body: MenuSaveRequest):
    """
    Save staff-confirmed menu(s) to the `mess_menu` table.
    - If `meals` is provided: saves all meals across the week in one batch.
    - If `meal_type` + `dishes` are provided: saves that single meal.
    """
    if body.meals:
        result = save_multiple_meals(meals=body.meals, confirmed_by=body.confirmed_by)
    elif body.meal_type and body.dishes and body.effective_date:
        result = save_menu(
            meal_type=body.meal_type, effective_date=body.effective_date,
            dishes=body.dishes, confirmed_by=body.confirmed_by,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either 'meals' array (weekly batch) or 'meal_type', 'effective_date', and 'dishes' (single meal).",
        )

    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("error", "Menu save failed."))
    return result


@router.get("/menu/{meal_type}", summary="Get current/active menu for a meal")
async def get_current_menu(
    meal_type: str,
    target_date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    """Retrieve the most recently effective menu for breakfast, lunch, or dinner."""
    if meal_type not in ("breakfast", "lunch", "dinner"):
        raise HTTPException(status_code=400, detail="meal_type must be 'breakfast', 'lunch', or 'dinner'.")
    result = get_menu(meal_type=meal_type, target_date=target_date)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result


@router.get("/menus", summary="List all menu entries (paginated)")
async def list_all_menus(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Returns all menu entries ordered by newest effective_date first."""
    return list_menus(limit=limit, offset=offset)


# -- Phase 3C Routes (NLP Command Bar) -----------------------------------------

@router.post("/inventory/command", summary="Process natural language inventory command (Phase 3C)")
async def execute_inventory_command(body: InventoryCommandRequest):
    """
    Process natural language stock update command from mess staff.
    Accepts commands in English, Hindi, or Hinglish:
      - "Added 25kg rice and 10L milk delivered by vendor"
      - "Mark 5kg potatoes spoiled"
      - "Set dal stock to 30kg after audit"
      - "20 packet bread aa gaya"
    Parses actions via Groq/Gemini LLM, applies them to inventory, and records audit log.
    """
    cmd = body.command.strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="Command string cannot be empty.")

    result = process_inventory_command(raw_command=cmd, staff_id=body.staff_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=422,
            detail=result.get("clarification_needed") or "Could not parse inventory command.",
        )
    return result


@router.get("/inventory/command-logs", summary="Get audit logs for mess staff NLP commands (Phase 3C)")
async def list_inventory_command_logs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Retrieve paginated audit history of mess staff NLP inventory commands."""
    result = get_nlp_command_logs(limit=limit, offset=offset)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to retrieve logs."))
    return result

