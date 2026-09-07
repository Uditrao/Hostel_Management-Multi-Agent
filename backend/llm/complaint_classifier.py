"""
LLM — Complaint Classifier (Phase 4 / FIXR)
============================================
Uses Groq (with Gemini fallback via groq_client.py) to classify a free-text
maintenance complaint submitted by a hostel student into:

  • category  — 'electrical' | 'plumbing' | 'carpentry' | 'other'
  • urgency   — 'low' | 'medium' | 'high' | 'critical'
  • short_summary — one concise sentence describing the problem

Includes a rule-based offline fallback so classification still works without
an LLM key during local development / testing.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict

from llm.groq_client import generate_structured_json

logger = logging.getLogger("hostel.llm.complaint_classifier")

# ── System Prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert maintenance complaint classifier for a university hostel.
A student has submitted a free-text complaint about a problem in their room or common area.

Your task is to classify it and return a JSON object with EXACTLY this schema:
{
  "category": "electrical" | "plumbing" | "carpentry" | "other",
  "urgency": "low" | "medium" | "high" | "critical",
  "short_summary": "<one concise sentence (max 15 words) describing the exact problem>"
}

CATEGORY RULES:
- "electrical": anything related to wiring, sockets, switches, lights, fans, power cuts,
  MCB trips, short circuits, electric shocks, inverter, UPS, extension boards.
- "plumbing": anything related to pipes, taps, leaks, water supply, drainage, bathroom,
  toilet, flush, sewage, blocked drain, geyser/water heater.
- "carpentry": anything related to doors, windows, furniture, almirahs, desks, chairs,
  beds, locks, hinges, handles, wardrobes, shelves.
- "other": pest control, cleanliness, WiFi/internet, noise, smell, AC, lift, painting,
  broken glass, ceiling cracks, or anything that does not clearly fit the above.

URGENCY RULES:
- "critical": immediate safety risk — fire hazard, electric shock risk, gas leak,
  water flooding room/corridor, structural collapse risk, sewage overflow.
- "high": problem significantly affects daily life and cannot wait more than 24 hours —
  no water supply, room completely dark, main door lock broken, toilet not working.
- "medium": problem is inconvenient but workarounds exist — one light not working,
  dripping tap, loose socket, window latch broken, drawer jammed.
- "low": cosmetic or minor nuisance — paint peeling, minor dust, table wobbly, 
  slow drain, one socket not working but others available.

EXAMPLES:
Input: "my bathroom pipe is leaking badly and water is flooding the floor"
Output: {"category": "plumbing", "urgency": "critical", "short_summary": "Bathroom pipe leaking severely, water flooding the floor."}

Input: "fan in my room is not working since 2 days"  
Output: {"category": "electrical", "urgency": "medium", "short_summary": "Ceiling fan in room not working for 2 days."}

Input: "my room door lock is broken and i cant lock it"
Output: {"category": "carpentry", "urgency": "high", "short_summary": "Room door lock broken, room cannot be secured."}

Input: "there are cockroaches in the common bathroom"
Output: {"category": "other", "urgency": "medium", "short_summary": "Cockroach infestation reported in the common bathroom."}

Output ONLY valid JSON conforming strictly to the schema above. No extra explanation.
"""

# ── Keyword-based Offline Fallback ────────────────────────────────────────────

_CATEGORY_KEYWORDS: Dict[str, list] = {
    "electrical": [
        "light", "fan", "switch", "socket", "wire", "wiring", "electricity",
        "power", "current", "shock", "short circuit", "mcb", "fuse", "inverter",
        "ups", "bulb", "tube", "led", "plug", "charger", "outlet",
    ],
    "plumbing": [
        "pipe", "tap", "water", "leak", "leaking", "drain", "drainage",
        "toilet", "flush", "bathroom", "bathroom", "geyser", "heater", "shower",
        "sink", "basin", "sewage", "blocked", "clog", "drip", "overflow",
    ],
    "carpentry": [
        "door", "window", "lock", "handle", "hinge", "furniture", "almirah",
        "wardrobe", "desk", "table", "chair", "bed", "shelf", "drawer",
        "cupboard", "cabinet", "wood", "broken door", "broken window",
    ],
}

_URGENCY_KEYWORDS: Dict[str, list] = {
    "critical": [
        "flood", "flooding", "electric shock", "shock", "fire", "burning",
        "collapse", "sewage overflow", "gas leak", "overflow", "dangerous",
        "emergency", "sparking", "short circuit", "burst pipe",
    ],
    "high": [
        "no water", "no light", "complete dark", "main door", "cannot lock",
        "cant lock", "not working", "completely", "no supply", "broken lock",
        "toilet blocked", "toilet not flush",
    ],
    "medium": [
        "dripping", "loose", "slow drain", "one fan", "one light", "jammed",
        "stuck", "not closing", "not opening", "leaking slightly",
    ],
    "low": [
        "paint", "painting", "wobbly", "minor", "cosmetic", "small crack",
        "little", "slightly", "occasionally",
    ],
}


def _offline_classify(raw_text: str) -> Dict[str, Any]:
    """Rule-based keyword fallback when LLM is unavailable."""
    lower = raw_text.lower()

    # Category detection
    category = "other"
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            category = cat
            break

    # Urgency detection (highest priority first)
    urgency = "medium"
    for urg in ("critical", "high", "low"):
        if any(kw in lower for kw in _URGENCY_KEYWORDS[urg]):
            urgency = urg
            break

    # Short summary: take first 15 words of raw text
    words = raw_text.split()
    short_summary = " ".join(words[:15])
    if len(words) > 15:
        short_summary += "…"

    return {
        "category": category,
        "urgency": urgency,
        "short_summary": short_summary,
    }


def _validate_classification(data: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure LLM output has valid fields; patch invalid values to safe defaults."""
    valid_categories = {"electrical", "plumbing", "carpentry", "other"}
    valid_urgencies  = {"low", "medium", "high", "critical"}

    category = str(data.get("category", "other")).strip().lower()
    if category not in valid_categories:
        category = "other"

    urgency = str(data.get("urgency", "medium")).strip().lower()
    if urgency not in valid_urgencies:
        urgency = "medium"

    short_summary = str(data.get("short_summary", "")).strip()
    # Cap at 150 characters (safety guard)
    if len(short_summary) > 150:
        short_summary = short_summary[:147] + "…"
    if not short_summary:
        short_summary = "Maintenance complaint received."

    return {
        "category": category,
        "urgency": urgency,
        "short_summary": short_summary,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def classify_complaint(raw_text: str) -> Dict[str, Any]:
    """
    Classify a free-text hostel maintenance complaint.

    Returns a dict with:
        {
            "category":      str,   # 'electrical'|'plumbing'|'carpentry'|'other'
            "urgency":       str,   # 'low'|'medium'|'high'|'critical'
            "short_summary": str,   # concise one-sentence description
            "classifier":    str,   # 'llm' | 'offline_fallback'
        }
    """
    clean_text = raw_text.strip()
    if not clean_text:
        return {
            "category": "other",
            "urgency": "low",
            "short_summary": "Empty complaint text received.",
            "classifier": "offline_fallback",
        }

    # 1. Try LLM classification
    try:
        raw_json = generate_structured_json(
            prompt=(
                f"Classify this hostel maintenance complaint submitted by a student:\n"
                f"\"{clean_text}\"\n"
                f"Return JSON with category, urgency, and short_summary."
            ),
            system_instruction=SYSTEM_PROMPT,
            timeout=20.0,
        )
        result = _validate_classification(raw_json)
        result["classifier"] = "llm"
        logger.info(
            "FIXR ✅ LLM classified complaint: category=%s urgency=%s",
            result["category"], result["urgency"],
        )
        return result

    except Exception as exc:
        logger.warning(
            "FIXR: LLM complaint classification failed (%s). Using offline fallback.", exc
        )

    # 2. Offline fallback
    result = _offline_classify(clean_text)
    result["classifier"] = "offline_fallback"
    logger.info(
        "FIXR 🔄 Offline classified complaint: category=%s urgency=%s",
        result["category"], result["urgency"],
    )
    return result
