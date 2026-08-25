"""
IRIS — Enrollment
=================
Handles face enrollment for a student:

  • enroll_from_image()  — given a pre-decoded BGR image (numpy array)
                           generate embedding → upsert to students table
  • enroll_from_webcam() — capture N frames from the local webcam,
                           average embeddings → upsert to students table

Both functions return a plain dict with {success, message, student_id}.
"""

from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

from agents.iris.face_engine import get_embedding, get_averaged_embedding
from db.supabase_client import get_client

logger = logging.getLogger("hostel.iris.enrollment")

ENROLLMENT_FRAMES = 5          # webcam frames captured per enrollment session
WEBCAM_CAPTURE_DELAY_MS = 200  # ms between frames so they aren't identical


# ── Public API ────────────────────────────────────────────────────────────────

def enroll_from_image(
    student_id: str,
    image_bgr: np.ndarray,
    photo_url: Optional[str] = None,
) -> dict:
    """
    Enroll a student from a single BGR image.

    Args:
        student_id: UUID string matching students.id in Supabase.
        image_bgr:  OpenCV BGR image (numpy array).
        photo_url:  Optional URL of the stored enrollment photo.

    Returns:
        {"success": bool, "message": str, "student_id": str}
    """
    embedding = get_embedding(image_bgr)
    if embedding is None:
        return {
            "success": False,
            "message": "No face detected in the provided image. "
                       "Ensure the face is clearly visible and well-lit.",
        }

    return _persist_embedding(student_id, embedding, photo_url)


def enroll_from_webcam(
    student_id: str,
    num_frames: int = ENROLLMENT_FRAMES,
    camera_index: int = 0,
) -> dict:
    """
    Capture `num_frames` frames from the local webcam and compute an
    averaged embedding for robust enrollment.

    Args:
        student_id:   UUID string matching students.id in Supabase.
        num_frames:   How many frames to capture (default 5).
        camera_index: OpenCV camera index (0 = laptop default camera).

    Returns:
        {"success": bool, "message": str, "student_id": str}
    """
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        return {
            "success": False,
            "message": f"Could not open webcam (index={camera_index}). "
                       "Make sure no other app is using the camera.",
        }

    logger.info(
        "IRIS Enrollment: capturing %d frames from camera %d for student %s…",
        num_frames, camera_index, student_id,
    )

    frames: list[np.ndarray] = []
    try:
        while len(frames) < num_frames:
            ret, frame = cap.read()
            if not ret:
                logger.warning("IRIS: Failed to read frame %d.", len(frames))
                break
            frames.append(frame)
            cv2.waitKey(WEBCAM_CAPTURE_DELAY_MS)  # small delay between frames
    finally:
        cap.release()

    if not frames:
        return {
            "success": False,
            "message": "Webcam opened but no frames could be captured.",
        }

    embedding = get_averaged_embedding(frames)
    if embedding is None:
        return {
            "success": False,
            "message": f"No face detected across {len(frames)} webcam frames. "
                       "Ensure good lighting and face the camera directly.",
        }

    return _persist_embedding(student_id, embedding)


# ── Private helpers ───────────────────────────────────────────────────────────

def _persist_embedding(
    student_id: str,
    embedding: list[float],
    photo_url: Optional[str] = None,
) -> dict:
    """
    Upsert the computed embedding into students.face_embedding via Supabase.
    This is an UPDATE (student row must already exist — created by warden during approval).
    """
    try:
        client = get_client()

        update_payload: dict = {
            "face_embedding": embedding,
            "enrolled_at": "now()",
        }
        if photo_url:
            update_payload["photo_url"] = photo_url

        result = (
            client.table("students")
            .update(update_payload)
            .eq("id", student_id)
            .execute()
        )

        if result.data:
            logger.info("IRIS: Enrollment saved — student_id=%s", student_id)
            return {
                "success": True,
                "message": "Face enrollment successful. Student can now use face recognition.",
                "student_id": student_id,
            }
        else:
            logger.error("IRIS: Student not found — student_id=%s", student_id)
            return {
                "success": False,
                "message": f"Student with id={student_id} was not found. "
                           "The student must be approved by the warden first.",
            }

    except Exception as exc:
        logger.exception("IRIS: DB error during enrollment — %s", exc)
        return {
            "success": False,
            "message": f"Database error during enrollment: {exc}",
        }
