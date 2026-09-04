"""
LLM Client Wrapper (Groq + Gemini Fallback)
===========================================
Provides a clean interface for structured JSON completions.
Primary:  Groq API (llama-3.3-70b-versatile / llama-3.1-8b-instant) with JSON mode.
Fallback: Google Gemini 3.5 Flash via REST API (when GROQ_API_KEY is not set).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("hostel.llm.client")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
FAST_GROQ_MODEL = "llama-3.1-8b-instant"

GEMINI_API_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
)
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
FALLBACK_GEMINI_MODEL = "gemini-flash-lite-latest"


def generate_structured_json(
    prompt: str,
    system_instruction: Optional[str] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """
    Generate structured JSON output from LLM.
    Attempts Groq first if GROQ_API_KEY is present; falls back to Gemini if not set or on failure.
    """
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if groq_api_key:
        try:
            return _call_groq(
                prompt=prompt,
                system_instruction=system_instruction,
                api_key=groq_api_key,
                timeout=timeout,
            )
        except Exception as exc:
            logger.warning("Groq API call failed (%s). Attempting Gemini fallback if available.", exc)
            if gemini_api_key:
                return _call_gemini(
                    prompt=prompt,
                    system_instruction=system_instruction,
                    api_key=gemini_api_key,
                    timeout=timeout,
                )
            raise

    if gemini_api_key:
        return _call_gemini(
            prompt=prompt,
            system_instruction=system_instruction,
            api_key=gemini_api_key,
            timeout=timeout,
        )

    raise ValueError(
        "Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in the environment."
    )


def _call_groq(
    prompt: str,
    system_instruction: Optional[str],
    api_key: str,
    timeout: float,
) -> Dict[str, Any]:
    """Call Groq chat completion endpoint with json_object response format."""
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": DEFAULT_GROQ_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(GROQ_API_URL, headers=headers, json=payload)
        if resp.status_code == 404 or resp.status_code == 400:
            # Try fast model if default model isn't available
            payload["model"] = FAST_GROQ_MODEL
            resp = client.post(GROQ_API_URL, headers=headers, json=payload)

        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]
    return _parse_json_block(content)


def _call_gemini(
    prompt: str,
    system_instruction: Optional[str],
    api_key: str,
    timeout: float,
) -> Dict[str, Any]:
    """Call Gemini REST endpoint with application/json responseMimeType."""
    url = GEMINI_API_URL_TEMPLATE.format(model=DEFAULT_GEMINI_MODEL, key=api_key)

    contents = [{"parts": [{"text": prompt}]}]
    req_body: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }
    if system_instruction:
        req_body["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, json=req_body)
        if resp.status_code == 404:
            # Fallback to secondary Gemini model
            url = GEMINI_API_URL_TEMPLATE.format(model=FALLBACK_GEMINI_MODEL, key=api_key)
            resp = client.post(url, json=req_body)

        resp.raise_for_status()
        data = resp.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError(f"Gemini returned empty response: {data}")

    text_part = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return _parse_json_block(text_part)


def _parse_json_block(text: str) -> Dict[str, Any]:
    """Strip markdown backticks if present and parse JSON."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()
    return json.loads(cleaned)
