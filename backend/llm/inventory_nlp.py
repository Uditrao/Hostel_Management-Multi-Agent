"""
NOURISH — Inventory NLP Command Parser (Phase 3C)
================================================
Parses freeform natural language text (English, Hindi, Hinglish) from mess staff
into structured inventory actions:
  - item_name (canonical name)
  - action ('add' | 'subtract' | 'set')
  - quantity (positive float)
  - unit ('kg' | 'L' | 'packets' | 'units')
  - note (optional explanation)

Uses Groq LLM (with Gemini fallback via groq_client.py), with an offline rule-based
parser backup for local development/offline testing.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from llm.groq_client import generate_structured_json

logger = logging.getLogger("hostel.nourish.nlp")

# ── Canonical Dictionary & Unit Maps ─────────────────────────────────────────

ITEM_SYNONYMS: Dict[str, str] = {
    "chawal": "rice",
    "rice": "rice",
    "atta": "atta",
    "aata": "atta",
    "wheat": "atta",
    "wheat flour": "atta",
    "doodh": "milk",
    "milk": "milk",
    "aaloo": "potato",
    "alu": "potato",
    "potato": "potato",
    "potatoes": "potato",
    "pyaaz": "onion",
    "pyaz": "onion",
    "onion": "onion",
    "onions": "onion",
    "tamatar": "tomato",
    "tomato": "tomato",
    "tomatoes": "tomato",
    "cheeni": "sugar",
    "chini": "sugar",
    "sugar": "sugar",
    "namak": "salt",
    "salt": "salt",
    "tel": "cooking oil",
    "oil": "cooking oil",
    "cooking oil": "cooking oil",
    "mustard oil": "cooking oil",
    "refined oil": "cooking oil",
    "paneer": "paneer",
    "cottage cheese": "paneer",
    "dal": "dal",
    "daal": "dal",
    "lentils": "dal",
    "toor dal": "toor dal",
    "moong dal": "moong dal",
    "urad dal": "urad dal",
    "chana": "chana",
    "bread": "bread",
    "breads": "bread",
    "anda": "egg",
    "ande": "egg",
    "egg": "egg",
    "eggs": "egg",
    "chai patti": "tea leaves",
    "tea": "tea leaves",
    "tea leaves": "tea leaves",
    "coffee": "coffee powder",
    "poha": "poha",
    "suji": "suji",
    "sooji": "suji",
    "besan": "besan",
    "butter": "butter",
    "dahi": "curd",
    "curd": "curd",
}

UNIT_MAP: Dict[str, str] = {
    "kg": "kg",
    "kgs": "kg",
    "kilo": "kg",
    "kilos": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "l": "L",
    "lt": "L",
    "ltr": "L",
    "ltrs": "L",
    "liter": "L",
    "liters": "L",
    "litre": "L",
    "litres": "L",
    "packet": "packets",
    "packets": "packets",
    "pack": "packets",
    "packs": "packets",
    "pkt": "packets",
    "pkts": "packets",
    "loaf": "packets",
    "loaves": "packets",
    "box": "packets",
    "boxes": "packets",
    "can": "packets",
    "cans": "packets",
    "tin": "packets",
    "tins": "packets",
    "piece": "units",
    "pieces": "units",
    "unit": "units",
    "units": "units",
    "nos": "units",
    "tray": "units",
    "trays": "units",
}

SYSTEM_PROMPT = """You are an intelligent NLP parser for an Indian university hostel mess inventory system.
Mess staff (managers, head cooks, storekeepers) write or speak stock updates in English, Hindi, or Hinglish.

Your job is to parse their message and return a JSON object with this EXACT schema:
{
  "intent": "inventory_update" | "unclear",
  "actions": [
    {
      "item_name": "<canonical English name in lowercase, e.g. rice, milk, potato, atta, dal>",
      "action": "add" | "subtract" | "set",
      "quantity": <positive float number>,
      "unit": "kg" | "L" | "packets" | "units",
      "note": "<brief reason or context, e.g. 'vendor delivery', 'spoiled', 'physical audit count'>"
    }
  ],
  "summary": "<one sentence concise summary of the actions>",
  "clarification_needed": null | "<what is missing or ambiguous>"
}

ACTION RULES:
- "add": stock arriving, delivered, bought, added, "aa gaya", "receive hua", "plus", "dala".
- "subtract": stock used, cooked, consumed, spoiled, rotten, expired, thrown, "kharab ho gaya", "ban gaya", "bana liye", "bana lye", "bana diya", "pakaya", "khatam hua", "waste".
- "set": physical audit, count verification, reset, "actual stock is", "audit ke baad bacha hai", "set stock to".

UNIT CONVERSIONS:
- grams / gm / g -> convert to kg (divide quantity by 1000.0, e.g. 500g = 0.5 kg).
- quintal / quintals -> convert to kg (multiply quantity by 100.0, e.g. 2 quintal = 200 kg).
- ml / milli -> convert to L (divide quantity by 1000.0, e.g. 500ml = 0.5 L).

LANGUAGE EXAMPLES:
1. "Added 25kg rice and 10L milk delivered by vendor"
   -> actions: [
        {"item_name": "rice", "action": "add", "quantity": 25.0, "unit": "kg", "note": "vendor delivery"},
        {"item_name": "milk", "action": "add", "quantity": 10.0, "unit": "L", "note": "vendor delivery"}
      ]
2. "Mark 5kg potatoes spoiled and thrown away"
   -> actions: [
        {"item_name": "potato", "action": "subtract", "quantity": 5.0, "unit": "kg", "note": "spoiled"}
      ]
3. "Physical audit done: dal is 42kg and sugar is 18kg"
   -> actions: [
        {"item_name": "dal", "action": "set", "quantity": 42.0, "unit": "kg", "note": "physical audit"},
        {"item_name": "sugar", "action": "set", "quantity": 18.0, "unit": "kg", "note": "physical audit"}
      ]
4. "20 packet bread aa gayi aur 15 tray ande"
   -> actions: [
        {"item_name": "bread", "action": "add", "quantity": 20.0, "unit": "packets", "note": "restock"},
        {"item_name": "egg", "action": "add", "quantity": 15.0, "unit": "units", "note": "restock"}
      ]
5. "aaj humne 10 kilo chawal bana liye h"
   -> actions: [
        {"item_name": "rice", "action": "subtract", "quantity": 10.0, "unit": "kg", "note": "cooked for meal"}
      ]
6. "Hello how are you"
   -> intent: "unclear", actions: [], clarification_needed: "No inventory items or quantities detected."

Output only valid JSON conforming strictly to the requested schema.
"""


# ── Pydantic Models for Validation ───────────────────────────────────────────

class InventoryActionItem(BaseModel):
    item_name: str
    action: str = Field(..., pattern="^(add|subtract|set)$")
    quantity: float = Field(..., gt=0)
    unit: str
    note: Optional[str] = None


class InventoryNLPResult(BaseModel):
    intent: str
    actions: List[InventoryActionItem] = []
    summary: str = ""
    clarification_needed: Optional[str] = None


# ── Parser Function ──────────────────────────────────────────────────────────

def parse_inventory_command(raw_text: str) -> InventoryNLPResult:
    """
    Parse natural language text command into structured inventory actions.
    Uses Groq/Gemini LLM first, with fallback to rule-based pattern matching.
    """
    clean_text = raw_text.strip()
    if not clean_text:
        return InventoryNLPResult(
            intent="unclear",
            actions=[],
            summary="Empty command provided.",
            clarification_needed="Please enter an inventory command (e.g. 'Add 20kg rice').",
        )

    # 1. Try LLM parsing
    try:
        raw_json = generate_structured_json(
            prompt=f"Parse this mess staff inventory command:\n\"{clean_text}\"",
            system_instruction=SYSTEM_PROMPT,
            timeout=15.0,
        )
        # Normalize and validate
        return _normalize_llm_result(raw_json, clean_text)
    except Exception as exc:
        logger.warning("LLM parser failed (%s). Falling back to rule-based parser.", exc)

    # 2. Rule-based regex fallback
    return _rule_based_fallback(clean_text)


def _normalize_llm_result(data: Dict[str, Any], raw_text: str) -> InventoryNLPResult:
    """Sanitize and standardize LLM output."""
    intent = str(data.get("intent", "inventory_update")).lower()
    raw_actions = data.get("actions", [])
    valid_actions: List[InventoryActionItem] = []

    for act in raw_actions:
        try:
            name = str(act.get("item_name", "")).strip().lower()
            canonical_name = ITEM_SYNONYMS.get(name, name)

            action_raw = str(act.get("action", "add")).strip().lower()
            if action_raw in ("subtract", "used", "cooked", "consume", "consumed", "waste", "spoiled", "kharab", "minus", "thrown", "remove"):
                action = "subtract"
            elif action_raw in ("add", "received", "delivered", "restock", "bought", "plus", "purchased"):
                action = "add"
            elif action_raw in ("set", "audit", "count", "reset"):
                action = "set"
            else:
                action = "add"

            qty = float(act.get("quantity", 0))
            if qty <= 0:
                continue

            raw_unit = str(act.get("unit", "kg")).strip().lower()
            canonical_unit = UNIT_MAP.get(raw_unit, "kg")

            valid_actions.append(
                InventoryActionItem(
                    item_name=canonical_name,
                    action=action,
                    quantity=round(qty, 2),
                    unit=canonical_unit,
                    note=act.get("note"),
                )
            )
        except Exception:
            continue

    summary = data.get("summary") or f"Processed {len(valid_actions)} item action(s)."
    clarification = data.get("clarification_needed")

    if not valid_actions and not clarification:
        intent = "unclear"
        clarification = "Could not identify specific inventory items or quantities."

    return InventoryNLPResult(
        intent=intent,
        actions=valid_actions,
        summary=summary,
        clarification_needed=clarification,
    )


# ── Rule-Based Fallback ──────────────────────────────────────────────────────

_ACTION_KEYWORDS = {
    "add": ["add", "added", "receive", "received", "delivered", "bought", "restock", "aaya", "aa gaya", "dala"],
    "subtract": [
        "subtract", "used", "spoiled", "kharab", "waste", "thrown", "cooked", "ban gaya",
        "bana", "bana liye", "bana lye", "bana liya", "bana diya", "pakaya", "paka", "khatam", "minus"
    ],
    "set": ["set", "audit", "remaining", "count", "actual", "reset"],
}


def _rule_based_fallback(text: str) -> InventoryNLPResult:
    """Simple regex & keyword parser when LLM is unavailable."""
    lower_text = text.lower()

    # Determine default action
    detected_action = "add"
    for act, kws in _ACTION_KEYWORDS.items():
        if any(kw in lower_text for kw in kws):
            detected_action = act
            break

    # Regex: (number) (unit optional) (item)
    pattern = re.compile(
        r"(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|l|lt|ltr|ltrs|liter|liters|litre|packet|packets|pack|packs|units|nos|tray)?\s+([a-zA-Z\s]+?)(?:,|\band\b|\baur\b|$)",
        re.IGNORECASE,
    )

    actions: List[InventoryActionItem] = []
    for match in pattern.finditer(lower_text):
        qty_str, unit_str, raw_item = match.groups()
        qty = float(qty_str)
        unit = UNIT_MAP.get((unit_str or "kg").strip(), "kg")

        item_cleaned = raw_item.strip()
        # strip known noise words
        for noise in [
            "delivered", "by vendor", "spoiled", "today", "stock", "aa gaya", "aa gayi",
            "kharab", "bana liye h", "bana liye", "bana lye", "bana liya", "bana diya",
            "bana", "liye h", "liye", "lye", "h", "hai"
        ]:
            item_cleaned = re.sub(r"\b" + re.escape(noise) + r"\b", "", item_cleaned).strip()

        # Check if any known food synonym is inside item_cleaned
        matched_item = None
        for syn, canonical in ITEM_SYNONYMS.items():
            if re.search(r"\b" + re.escape(syn) + r"\b", item_cleaned):
                matched_item = canonical
                break

        canonical_item = matched_item or ITEM_SYNONYMS.get(item_cleaned, item_cleaned)
        if canonical_item:
            actions.append(
                InventoryActionItem(
                    item_name=canonical_item,
                    action=detected_action,
                    quantity=qty,
                    unit=unit,
                    note="offline rule match",
                )
            )

    if actions:
        return InventoryNLPResult(
            intent="inventory_update",
            actions=actions,
            summary=f"Parsed {len(actions)} action(s) via offline engine.",
            clarification_needed=None,
        )

    return InventoryNLPResult(
        intent="unclear",
        actions=[],
        summary="Offline parser could not determine inventory updates.",
        clarification_needed="Could not parse inventory items. Please format as '[action] [quantity][unit] [item]' (e.g. 'Add 25kg rice').",
    )
