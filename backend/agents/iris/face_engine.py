"""
IRIS — Face Engine (DeepFace / Facenet512 backend)
===================================================
Uses the `deepface` library with the Facenet512 model:
  • No C++ compilation required — installs on Windows with plain pip
  • 512-d L2-normalised face embeddings (matches pgvector schema)
  • OpenCV detector backend (fast, no extra download, built into opencv-python)

Model weights (~90 MB) are downloaded automatically on first use to
  ~/.deepface/weights/facenet512_weights.h5

All public functions return plain Python lists (JSON-serialisable / pgvector-compatible).
"""

from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger("hostel.iris.engine")

# ── Config ────────────────────────────────────────────────────────────────────
_MODEL_NAME       = "Facenet512"   # 512-d embeddings — best accuracy/size trade-off
_DETECTOR_BACKEND = "opencv"       # fast, no extra install — part of opencv-python


# ── Core helpers ──────────────────────────────────────────────────────────────

def get_embedding(image_bgr: np.ndarray) -> Optional[list[float]]:
    """
    Detect the largest face in a BGR image and return its
    512-d L2-normalised embedding as a plain Python list.

    Returns None if no face is detected.
    """
    try:
        from deepface import DeepFace  # type: ignore  # lazy import — loads TF once
    except ImportError as exc:
        raise RuntimeError(
            "deepface is not installed. Run: pip install deepface tf-keras"
        ) from exc

    # DeepFace.represent() accepts a BGR numpy array directly
    try:
        results = DeepFace.represent(
            img_path=image_bgr,
            model_name=_MODEL_NAME,
            detector_backend=_DETECTOR_BACKEND,
            enforce_detection=True,   # raises ValueError if no face found
            align=True,               # align face for better accuracy
        )
    except ValueError:
        # enforce_detection=True raises ValueError when no face is detected
        logger.warning("IRIS: No face detected in frame.")
        return None
    except Exception as exc:
        logger.error("IRIS: DeepFace error — %s", exc)
        return None

    if not results:
        logger.warning("IRIS: DeepFace returned empty results.")
        return None

    # DeepFace returns a list of dicts sorted by face area (largest first)
    raw_emb = results[0]["embedding"]  # list[float], length 512

    # L2-normalise so cosine similarity = dot product → works with pgvector <=>
    arr = np.array(raw_emb, dtype=np.float32)
    norm = np.linalg.norm(arr)
    if norm > 0:
        arr /= norm

    logger.debug("IRIS: Embedding generated — norm=%.4f", float(np.linalg.norm(arr)))
    return arr.tolist()


def get_averaged_embedding(frames: list[np.ndarray]) -> Optional[list[float]]:
    """
    Compute a single representative embedding from multiple frames
    (used during enrollment: 3-5 webcam frames → one stored vector).

    Averages per-frame embeddings then re-normalises.
    Returns None if no face is detected in any frame.
    """
    embeddings: list[list[float]] = []

    for i, frame in enumerate(frames):
        emb = get_embedding(frame)
        if emb is not None:
            embeddings.append(emb)
        else:
            logger.debug("IRIS: Frame %d — no face detected, skipping.", i)

    if not embeddings:
        logger.warning("IRIS: No faces detected across %d frames.", len(frames))
        return None

    arr = np.array(embeddings, dtype=np.float32)  # shape (N, 512)
    avg = arr.mean(axis=0)                         # shape (512,)
    norm = np.linalg.norm(avg)
    if norm > 0:
        avg /= norm  # re-normalise after averaging

    logger.info(
        "IRIS: Averaged embedding from %d / %d frames.", len(embeddings), len(frames)
    )
    return avg.tolist()
