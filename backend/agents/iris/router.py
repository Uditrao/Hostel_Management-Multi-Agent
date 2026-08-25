"""
IRIS — FastAPI Router
=====================
Endpoints:

  GET  /iris/status       — Agent health check
  POST /iris/enroll       — Enroll a student's face (image upload OR webcam)
  POST /iris/recognize    — Recognize a face and return an identity event

Both /enroll and /recognize support two modes:
  • mode=upload   → send image file as multipart/form-data
  • mode=webcam   → server captures from the local camera (use when running on kiosk)
"""

from __future__ import annotations

import logging
from io import BytesIO

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from agents.iris.enrollment import enroll_from_image, enroll_from_webcam
from agents.iris.recognition import recognize_from_image, recognize_from_webcam

logger = logging.getLogger("hostel.iris.router")

router = APIRouter()


# ── Utility ───────────────────────────────────────────────────────────────────

def _file_to_bgr(upload: UploadFile) -> np.ndarray:
    """Convert an uploaded image file (any format) to an OpenCV BGR numpy array."""
    raw = upload.file.read()
    pil_img = Image.open(BytesIO(raw)).convert("RGB")
    bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    return bgr


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status", summary="IRIS agent health check")
async def iris_status():
    """Returns the IRIS agent status and capability summary."""
    return {
        "agent": "IRIS",
        "codename": "👁️ IRIS — the eye of the hostel",
        "status": "online",
        "capabilities": ["face_enrollment", "face_recognition"],
        "model": "MobileFaceNet (InsightFace buffalo_s, 512-d)",
        "modes": ["upload", "webcam"],
    }


@router.post(
    "/enroll",
    summary="Enroll a student's face",
    response_description="Enrollment result with success status",
)
async def enroll_student(
    student_id: str = Form(
        ...,
        description="UUID of the student row in Supabase (must be approved by warden first)",
    ),
    mode: str = Form(
        "upload",
        description="'upload' — send image file | 'webcam' — capture from local camera",
    ),
    image: UploadFile = File(
        None,
        description="JPG/PNG image file. Required when mode=upload.",
    ),
):
    """
    Enroll a student's face embedding into the database.

    **mode=upload**: Attach a clear, front-facing photo (JPG/PNG). Best for initial setup.

    **mode=webcam**: The server captures 5 frames from the laptop camera.
    Use this from the kiosk machine or during demo.

    The student row must already exist in Supabase (created when warden approves sign-up).
    """
    if mode == "upload":
        if image is None:
            raise HTTPException(
                status_code=400,
                detail="An image file is required when mode=upload.",
            )
        try:
            bgr = _file_to_bgr(image)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not decode image file: {exc}",
            )
        result = enroll_from_image(student_id=student_id, image_bgr=bgr)

    elif mode == "webcam":
        result = enroll_from_webcam(student_id=student_id)

    else:
        raise HTTPException(
            status_code=400,
            detail="mode must be 'upload' or 'webcam'.",
        )

    if not result.get("success"):
        raise HTTPException(status_code=422, detail=result.get("message", "Enrollment failed."))

    return result


@router.post(
    "/recognize",
    summary="Recognize a face — returns an identity event",
    response_description="Identity event: {recognized, student_id, confidence, location}",
)
async def recognize_face(
    location: str = Form(
        "gate",
        description="'gate' (forwards to SENTINEL) or 'mess' (forwards to NOURISH)",
    ),
    mode: str = Form(
        "upload",
        description="'upload' — send image file | 'webcam' — capture from local camera",
    ),
    image: UploadFile = File(
        None,
        description="JPG/PNG image file. Required when mode=upload.",
    ),
):
    """
    Recognize a face and return a structured identity event.

    The caller (camera kiosk script or frontend) should then POST this event to:
    - `/sentinel/gate-event`  if location=gate
    - `/nourish/mess-event`   if location=mess

    **recognized=true**: Student identified — student_id, name, confidence returned.

    **recognized=false**: Unknown person — flagged, no entry granted.
    """
    if mode == "upload":
        if image is None:
            raise HTTPException(
                status_code=400,
                detail="An image file is required when mode=upload.",
            )
        try:
            bgr = _file_to_bgr(image)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not decode image file: {exc}",
            )
        result = recognize_from_image(image_bgr=bgr, location=location)

    elif mode == "webcam":
        result = recognize_from_webcam(location=location)

    else:
        raise HTTPException(
            status_code=400,
            detail="mode must be 'upload' or 'webcam'.",
        )

    # Always return 200 — the caller decides what to do with recognized=false
    return result
