"""
HERALD -- Warden Summary Generator (Phase 5 -- optional Groq summarizer)
=========================================================================
Turns a list of anomaly flag detail strings into one concise paragraph
suitable for the Warden daily briefing card.

Uses the shared groq_client (Groq + Gemini fallback) so it works even
without an LLM key (offline text-join fallback).

Public API
----------
  generate_summary(flags)  -> str   -- one-paragraph Warden briefing
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger("hostel.herald.summarizer")

# ---------------------------------------------------------------------------
# System prompt sent to the LLM
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are HERALD, the Orchestrator Agent for a university hostel management system.
You receive a list of anomaly flags raised by the system after nightly checks.
Each flag is a sentence describing a specific issue (missed attendance, missed meals, or unresolved complaints).

Your task is to write ONE concise paragraph (max 120 words) for the Warden that:
1. Summarises the key problems detected today.
2. Highlights the most urgent issues first.
3. Uses simple, direct language.
4. Ends with a brief action recommendation.

Do NOT list every student by name -- focus on patterns and severity.
Return ONLY the paragraph text, no heading, no bullet points, no JSON.
"""


def generate_summary(flags: List[Dict[str, Any]]) -> str:
    """
    Generate a one-paragraph Warden briefing from a list of anomaly flag rows.

    Args:
        flags: List of anomaly_flags rows (dicts with at least a 'detail' key).

    Returns:
        A plain-text summary paragraph, or a short offline fallback message.
    """
    if not flags:
        return (
            "No new anomaly flags were detected in today's orchestrator run. "
            "All systems appear to be within normal parameters."
        )

    # Build the input for the LLM
    flag_details = [f.get("detail", "") for f in flags if f.get("detail")]
    if not flag_details:
        return "Anomaly flags were raised but details could not be retrieved."

    # Group by type for a structured prompt
    type_groups: Dict[str, List[str]] = {}
    for flag in flags:
        ftype   = flag.get("type", "unknown")
        detail  = flag.get("detail", "")
        if detail:
            type_groups.setdefault(ftype, []).append(detail)

    lines = []
    for ftype, details in type_groups.items():
        lines.append(f"[{ftype.upper().replace('_', ' ')}] ({len(details)} flag(s)):")
        for d in details[:5]:  # cap at 5 per type to keep prompt short
            lines.append(f"  - {d}")
        if len(details) > 5:
            lines.append(f"  ... and {len(details) - 5} more.")

    prompt_body = "\n".join(lines)
    prompt = (
        f"Today's anomaly flags ({len(flags)} total):\n\n"
        f"{prompt_body}\n\n"
        "Write the Warden briefing paragraph as instructed."
    )

    # Try LLM summarisation
    try:
        from llm.groq_client import generate_structured_json  # noqa: F401
        # The shared client returns JSON; for free text we use a wrapper trick:
        # wrap the paragraph in a JSON field so the json_object mode is satisfied.
        json_prompt = (
            f"{prompt}\n\n"
            "Return a JSON object with exactly one key: "
            "{\"summary\": \"<your paragraph here>\"}"
        )
        result = generate_structured_json(
            prompt=json_prompt,
            system_instruction=_SYSTEM_PROMPT,
            timeout=30.0,
        )
        summary = str(result.get("summary", "")).strip()
        if summary:
            logger.info("HERALD summarizer: LLM summary generated (%d chars)", len(summary))
            return summary
    except Exception as exc:
        logger.warning("HERALD summarizer: LLM call failed (%s). Using offline fallback.", exc)

    # Offline fallback -- plain text join
    return _offline_summary(type_groups, len(flags))


def _offline_summary(type_groups: Dict[str, List[str]], total: int) -> str:
    """Simple rule-based summary when LLM is unavailable."""
    parts = []
    att   = len(type_groups.get("attendance_missed", []))
    mess  = len(type_groups.get("mess_missed_streak", []))
    comp  = len(type_groups.get("unresolved_complaint", []))

    if att:
        parts.append(f"{att} student(s) missed attendance for 3+ consecutive days")
    if mess:
        parts.append(f"{mess} student(s) skipped the last 6 meal slots")
    if comp:
        parts.append(f"{comp} high/critical maintenance complaint(s) unresolved for 24+ hours")

    if not parts:
        return f"HERALD detected {total} anomaly flag(s) today. Please review the flags dashboard."

    body = "; ".join(parts) + "."
    return (
        f"HERALD detected {total} anomaly flag(s) today: {body} "
        "Please review the Warden dashboard for full details and take appropriate action."
    )
