"""
IRIS — Recognition
==================
Handles real-time face recognition:

  • recognize_from_image()  — given a BGR numpy array, embed it and
                              query pgvector for the closest match.
  • recognize_from_webcam() — capture a single frame from the laptop camera,
                              then call recognize_from_image().

Both functions return a structured "identity event":
  {
      "recognized":    bool,
      "student_id":    str | None,
      "student_name":  str | None,
      "roll_no":       str | None,
      "room_no":       str | None,
      "confidence":    float,    # 0–1, cosine similarity
      "location":      str,      # 'gate' | 'mess'
      "error":         str | None,
  }

This event is forwarded downstream to SENTINEL (/sentinel/gate-event)
or NOURISH (/nourish/mess-event).
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import cv2
import numpy as np

from agents.iris.face_engine import get_embedding
from db.supabase_client import get_client

logger = logging.getLogger("hostel.iris.recognition")

# Tunable threshold — start at 0.55 and adjust during testing.
# Lower threshold = stricter (fewer false accepts, more false rejects).
FACE_SIMILARITY_THRESHOLD: float = float(
    os.getenv("FACE_SIMILARITY_THRESHOLD", "0.55")
)
# pgvector uses cosine DISTANCE — convert similarity threshold to distance
_DISTANCE_THRESHOLD: float = 1.0 - FACE_SIMILARITY_THRESHOLD


# ── Public API ────────────────────────────────────────────────────────────────

def recognize_from_image(
    image_bgr: np.ndarray,
    location: str = "gate",
) -> dict:
    """
    Recognize a face from a BGR image.

    Args:
        image_bgr: OpenCV BGR image (numpy array).
        location:  'gate' (→ SENTINEL) or 'mess' (→ NOURISH).

    Returns:
        Identity event dict.
    """
    embedding = get_embedding(image_bgr)
    if embedding is None:
        return _unknown_event(location, error="No face detected in the image.")

    return _query_pgvector(embedding, location)


def recognize_from_webcam(
    location: str = "gate",
    camera_index: int = 0,
) -> dict:
    """
    Capture a single frame from the local webcam and recognize.

    Args:
        location:     'gate' or 'mess'.
        camera_index: OpenCV camera index (0 = default laptop camera).

    Returns:
        Identity event dict.
    """
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        return _unknown_event(
            location,
            error=f"Could not open webcam (index={camera_index}).",
        )

    ret, frame = cap.read()
    cap.release()

    if not ret:
        return _unknown_event(location, error="Failed to capture frame from webcam.")

    logger.debug("IRIS: Webcam frame captured for recognition at location=%s.", location)
    return recognize_from_image(frame, location)


# ── Private helpers ───────────────────────────────────────────────────────────

def _query_pgvector(embedding: list[float], location: str) -> dict:
    """
    Call the match_face Supabase RPC to find the closest stored embedding.
    Uses cosine distance (<=>): lower = more similar.
    """
    try:
        client = get_client()

        result = client.rpc(
            "match_face",
            {
                "query_embedding": embedding,
                "match_threshold": _DISTANCE_THRESHOLD,
                "match_count": 1,
            },
        ).execute()

        if result.data and len(result.data) > 0:
            match = result.data[0]
            distance = float(match.get("distance", 1.0))
            similarity = round(1.0 - distance, 4)

            logger.info(
                "IRIS ✅ Match — student=%s name=%s similarity=%.3f location=%s",
                match.get("student_id"),
                match.get("name"),
                similarity,
                location,
            )
            return {
                "recognized": True,
                "student_id": match.get("student_id"),
                "student_name": match.get("name"),
                "roll_no": match.get("roll_no"),
                "room_no": match.get("room_no"),
                "confidence": similarity,
                "location": location,
                "error": None,
            }

        # No match above threshold
        logger.info(
            "IRIS ❌ Unknown face at location=%s (threshold=%.2f similarity).",
            location, FACE_SIMILARITY_THRESHOLD,
        )
        return _unknown_event(location)

    except Exception as exc:
        logger.exception("IRIS: pgvector query error — %s", exc)
        return _unknown_event(location, error=str(exc))


def _unknown_event(location: str, error: Optional[str] = None) -> dict:
    """Build a standardised 'unknown' identity event."""
    return {
        "recognized": False,
        "student_id": None,
        "student_name": None,
        "roll_no": None,
        "room_no": None,
        "confidence": 0.0,
        "location": location,
        "error": error,
    }
