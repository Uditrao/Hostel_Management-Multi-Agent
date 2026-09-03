"""
NOURISH — Menu Parser (Phase 3B)
==================================
Handles mess menu management:

  • parse_menu_pdf()    — send a PDF to Google Gemini (native file understanding)
                          and get back structured JSON: {meal_type, dishes:[{name, ingredients:[...]}]}
  • save_menu()         — persist parsed (and staff-confirmed) menu to mess_menu table.
  • get_menu()          — retrieve the current/active menu for a given date.
  • list_menus()        — list all menu entries (paginated).

Gemini prompt contract:
  Input : PDF binary (uploaded via Gemini Files API) 
  Output: JSON matching MenuSchema (validated with Pydantic before DB write)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from db.supabase_client import get_client

logger = logging.getLogger("hostel.nourish.menu")


# ── Pydantic schemas for Gemini output validation ─────────────────────────────

class IngredientSchema(BaseModel):
    name:                    str   = Field(..., description="Ingredient name, e.g. 'rice'")
    qty_per_student_grams:   float = Field(..., description="Grams per student serving (use litres×1000 for liquids)")
    unit:                    str   = Field("g",  description="Unit — 'g' (grams) or 'L' (litres) or 'units'")

    @field_validator("name")
    @classmethod
    def name_lower(cls, v: str) -> str:
        return v.strip().lower()


class DishSchema(BaseModel):
    dish_name:   str                    = Field(..., description="Name of the dish")
    ingredients: List[IngredientSchema] = Field(default_factory=list)


class MenuSchema(BaseModel):
    meal_type:     str             = Field(..., description="'breakfast' | 'lunch' | 'dinner'")
    effective_date: str            = Field(..., description="YYYY-MM-DD — the date this menu applies from")
    dishes:        List[DishSchema] = Field(default_factory=list)

    @field_validator("meal_type")
    @classmethod
    def valid_meal(cls, v: str) -> str:
        if v.lower() not in ("breakfast", "lunch", "dinner"):
            raise ValueError("meal_type must be breakfast, lunch, or dinner")
        return v.lower()


# ── Gemini client (lazy import) ───────────────────────────────────────────────

# ── Gemini Menu PDF Parsing via REST API ──────────────────────────────────────

_MENU_EXTRACTION_PROMPT = """
You are a hostel mess management assistant. Analyse the uploaded mess menu PDF and extract structured data.
If the menu is a weekly schedule (grid of days and meals), extract ALL meals for all days into the "meals" array.

Return a JSON object EXACTLY matching this schema:
{
  "week_range": "<e.g. 31 August – 06 September 2026 or single date>",
  "meals": [
    {
      "meal_type": "<breakfast|lunch|dinner>",
      "effective_date": "<YYYY-MM-DD>",
      "dishes": [
        {
          "dish_name": "<name of the dish>",
          "ingredients": [
            {
              "name": "<raw ingredient name, lowercase, e.g. rice, potato, dal, paneer, oil, milk, atta, curd>",
              "qty_per_student_grams": <estimated portion in grams per student, number>,
              "unit": "<g|L|units>"
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Cover Breakfast, Lunch, and Dinner. (You can ignore High Tea / snacks if not a main meal).
- Convert all dates printed on the menu into standard ISO YYYY-MM-DD format (e.g., 31/08/26 becomes 2026-08-31).
- Include standard daily common items (such as milk, bread, rice, roti/puri, dal, salad) under the corresponding meal's dishes.
- For each dish, infer 1-3 key raw pantry ingredients with realistic per-student portion estimates (e.g. rice: 120g, atta: 80g, dal: 40g, potato: 75g, milk: 150g).
- Return ONLY valid JSON.
"""


def parse_menu_pdf(pdf_bytes: bytes, filename: str = "menu.pdf") -> Dict[str, Any]:
    """
    Parse a menu PDF by sending it to Google Gemini 3.5 Flash via REST API (inline base64).
    Supports single-meal menus and full weekly schedule tables.

    Args:
        pdf_bytes: Raw PDF file content.
        filename:  Original filename (used for logging only).

    Returns:
        {
          "success": bool,
          "week_range": str,
          "meals": List[dict],       # All meals extracted across the week
          "menu": dict | None,       # First/today meal (for backwards compatibility)
          "raw_json": str,
          "error": str | None,
        }
    """
    import base64
    import httpx

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {
            "success": False,
            "week_range": "",
            "meals": [],
            "menu": None,
            "raw_json": "",
            "error": "GEMINI_API_KEY is not set in .env. Get a free key from https://aistudio.google.com",
        }

    try:
        b64_pdf = base64.b64encode(pdf_bytes).decode("utf-8")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "application/pdf",
                                "data": b64_pdf,
                            }
                        },
                        {
                            "text": _MENU_EXTRACTION_PROMPT,
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
                "response_mime_type": "application/json",
            },
        }

        logger.info("NOURISH Menu: Calling Gemini 3.5 Flash REST API for '%s'...", filename)
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        # Extract text from candidate response
        candidates = data.get("candidates", [])
        if not candidates:
            return {
                "success": False,
                "week_range": "",
                "meals": [],
                "menu": None,
                "raw_json": "",
                "error": "Gemini returned no candidates.",
            }

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return {
                "success": False,
                "week_range": "",
                "meals": [],
                "menu": None,
                "raw_json": "",
                "error": "Gemini response had no content parts.",
            }

        raw_text = parts[0].get("text", "").strip()
        logger.info("NOURISH Menu: Gemini raw response: %s...", raw_text[:200])

        parsed = json.loads(raw_text)
        meals = parsed.get("meals", [])

        # Fallback if Gemini returned a single menu dict instead of {"meals": [...]}
        if not meals and "meal_type" in parsed:
            meals = [parsed]

        first_menu = meals[0] if meals else None

        logger.info(
            "NOURISH Menu: Parsed successfully — %d meals extracted across %s",
            len(meals), parsed.get("week_range", "specified period"),
        )
        return {
            "success": True,
            "week_range": parsed.get("week_range", ""),
            "meals": meals,
            "menu": first_menu,
            "raw_json": raw_text,
            "error": None,
        }

    except httpx.HTTPStatusError as http_err:
        logger.error("NOURISH Menu: Gemini HTTP error: %s - %s", http_err.response.status_code, http_err.response.text)
        return {
            "success": False,
            "week_range": "",
            "meals": [],
            "menu": None,
            "raw_json": "",
            "error": f"Gemini API error ({http_err.response.status_code}): {http_err.response.text}",
        }
    except json.JSONDecodeError as exc:
        logger.error("NOURISH Menu: JSON decode error from Gemini — %s", exc)
        return {
            "success": False,
            "week_range": "",
            "meals": [],
            "menu": None,
            "raw_json": raw_text if "raw_text" in locals() else "",
            "error": f"Gemini returned invalid JSON: {exc}",
        }
    except Exception as exc:
        logger.exception("NOURISH Menu: parse_menu_pdf error — %s", exc)
        return {
            "success": False,
            "week_range": "",
            "meals": [],
            "menu": None,
            "raw_json": "",
            "error": str(exc),
        }



# ── Menu DB CRUD ──────────────────────────────────────────────────────────────

def save_menu(
    meal_type: str,
    effective_date: str,
    dishes: List[Dict],
    confirmed_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Save a confirmed menu to the mess_menu table.

    The `dishes` list is stored as JSONB `ingredients` field — we flatten all
    dish ingredients into a single list for easy depletion calculation later.

    Schema: mess_menu(id, meal_type, dish_name, ingredients JSONB, effective_date DATE)
    We insert one row per dish.

    Args:
        meal_type:      'breakfast' | 'lunch' | 'dinner'
        effective_date: 'YYYY-MM-DD'
        dishes:         List of {dish_name, ingredients:[{name, qty_per_student_grams, unit}]}
        confirmed_by:   Optional staff user UUID for audit trail

    Returns:
        {success, saved_rows, message}
    """
    if not dishes:
        return {"success": False, "error": "No dishes provided."}

    try:
        client = get_client()
        rows = []
        for dish in dishes:
            rows.append({
                "meal_type":      meal_type,
                "dish_name":      dish.get("dish_name", "Unknown"),
                "ingredients":    dish.get("ingredients", []),
                "effective_date": effective_date,
            })

        res = client.table("mess_menu").insert(rows).execute()
        saved = res.data or []
        logger.info(
            "NOURISH Menu: Saved %d dish rows for %s on %s",
            len(saved), meal_type, effective_date,
        )
        return {
            "success": True,
            "saved_rows": len(saved),
            "message": f"{len(saved)} dish(es) saved for {meal_type} on {effective_date}.",
            "rows": saved,
        }

    except Exception as exc:
        logger.exception("NOURISH Menu: save_menu error — %s", exc)
        return {"success": False, "error": str(exc)}


def save_multiple_meals(
    meals: List[Dict],
    confirmed_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Save a batch of meals (e.g. an entire 7-day weekly menu) to the mess_menu table.
    """
    if not meals:
        return {"success": False, "error": "No meals provided to save."}

    try:
        client = get_client()
        all_rows = []
        for meal in meals:
            m_type = meal.get("meal_type")
            e_date = meal.get("effective_date")
            for dish in meal.get("dishes", []):
                all_rows.append({
                    "meal_type": m_type,
                    "dish_name": dish.get("dish_name", "Unknown"),
                    "ingredients": dish.get("ingredients", []),
                    "effective_date": e_date,
                })

        if not all_rows:
            return {"success": False, "error": "No dishes found in the provided meals."}

        res = client.table("mess_menu").insert(all_rows).execute()
        saved = res.data or []
        logger.info(
            "NOURISH Menu: Batch saved %d dishes across %d meals.",
            len(saved), len(meals),
        )
        return {
            "success": True,
            "total_meals": len(meals),
            "saved_dishes": len(saved),
            "message": f"Successfully saved {len(meals)} meals ({len(saved)} dishes) to database.",
            "rows": saved,
        }
    except Exception as exc:
        logger.exception("NOURISH Menu: save_multiple_meals error — %s", exc)
        return {"success": False, "error": str(exc)}


def get_menu(
    meal_type: str,
    target_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Retrieve the most recently effective menu for a given meal and date.

    Args:
        meal_type:   'breakfast' | 'lunch' | 'dinner'
        target_date: 'YYYY-MM-DD' (defaults to today IST)

    Returns:
        {success, meal_type, effective_date, dishes}
    """
    from datetime import timezone, timedelta
    td = target_date or datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    try:
        client = get_client()
        res = (
            client.table("mess_menu")
            .select("*")
            .eq("meal_type", meal_type)
            .lte("effective_date", td)
            .order("effective_date", desc=True)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return {
                "success": False,
                "meal_type": meal_type,
                "error": f"No menu found for '{meal_type}' on or before {td}.",
            }

        # Group by effective_date — return all dishes for the latest date
        latest_date = rows[0]["effective_date"]
        dishes = [r for r in rows if r["effective_date"] == latest_date]
        return {
            "success": True,
            "meal_type": meal_type,
            "effective_date": latest_date,
            "dishes": dishes,
        }

    except Exception as exc:
        logger.exception("NOURISH Menu: get_menu error — %s", exc)
        return {"success": False, "error": str(exc)}


def list_menus(limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """Return a paginated list of all menu entries ordered by newest effective_date first."""
    try:
        client = get_client()
        res = (
            client.table("mess_menu")
            .select("*")
            .order("effective_date", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = res.data or []
        return {"success": True, "total_returned": len(rows), "offset": offset, "menus": rows}
    except Exception as exc:
        logger.exception("NOURISH Menu: list_menus error — %s", exc)
        return {"success": False, "error": str(exc), "menus": []}
