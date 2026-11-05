"""
IRIS — Face Engine (Ultra-Lightweight ONNX FaceNet backend)
============================================================
Runs a 512-dimensional FaceNet model via onnxruntime:
  • No heavy TensorFlow / Keras / PyTorch dependencies (~40 MB RAM footprint)
  • Safe for cloud free tiers (e.g. Render 512 MB physical RAM limit)
  • 512-d L2-normalised face embeddings (exact match with Supabase pgvector schema)
  • OpenCV Haar Cascade detector (built-in, 0 MB overhead, ~5ms per frame)
  • Fast CPU inference (~40-60ms)

Model weights (~94 MB) are cached locally at `agents/iris/models/facenet.onnx`.
If absent, they are downloaded once on first run or pre-cached during build.
"""

from __future__ import annotations

import logging
import os
import urllib.request
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger("hostel.iris.engine")

# ── Paths & Remote Model ──────────────────────────────────────────────────────
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_MODELS_DIR = os.path.join(_CURRENT_DIR, "models")
_MODEL_PATH = os.path.join(_MODELS_DIR, "facenet.onnx")
_MODEL_URL = "https://huggingface.co/haikalmumtaz/facenet-onnx/resolve/main/facenet.onnx"
_MIN_MODEL_BYTES = 50 * 1024 * 1024  # Model is ~89.6 MB (93,959,206 bytes)

# Global singleton sessions
_ORT_SESSION = None
_HAAR_DETECTOR = None


# ── Initialization Helpers ───────────────────────────────────────────────────

def _ensure_model_file() -> str:
    """Ensure the ONNX model exists on disk, downloading if necessary."""
    os.makedirs(_MODELS_DIR, exist_ok=True)
    if os.path.exists(_MODEL_PATH) and os.path.getsize(_MODEL_PATH) >= _MIN_MODEL_BYTES:
        return _MODEL_PATH

    logger.info("IRIS: FaceNet ONNX model not found or incomplete. Downloading from HuggingFace...")
    temp_path = f"{_MODEL_PATH}.tmp"
    try:
        urllib.request.urlretrieve(_MODEL_URL, temp_path)
        if os.path.exists(temp_path) and os.path.getsize(temp_path) >= _MIN_MODEL_BYTES:
            os.replace(temp_path, _MODEL_PATH)
            logger.info("IRIS: FaceNet ONNX model downloaded successfully (%.1f MB).", os.path.getsize(_MODEL_PATH) / (1024 * 1024))
        else:
            raise RuntimeError(f"Downloaded model file is corrupt or truncated ({os.path.getsize(temp_path)} bytes).")
    except Exception as exc:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise RuntimeError(f"Failed to download FaceNet ONNX model from {_MODEL_URL}: {exc}") from exc

    return _MODEL_PATH


def _get_session():
    """Lazy-load the ONNX Runtime inference session with single-threaded CPU options."""
    global _ORT_SESSION
    if _ORT_SESSION is None:
        import onnxruntime as ort

        model_path = _ensure_model_file()
        logger.info("IRIS: Initialising ONNX Runtime InferenceSession for FaceNet512...")

        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        _ORT_SESSION = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )
        logger.info("IRIS: FaceNet ONNX session ready (ultra-low RAM mode active).")
    return _ORT_SESSION


def _get_detector():
    """Lazy-load the OpenCV Haar Cascade detector."""
    global _HAAR_DETECTOR
    if _HAAR_DETECTOR is None:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _HAAR_DETECTOR = cv2.CascadeClassifier(cascade_path)
        if _HAAR_DETECTOR.empty():
            logger.error("IRIS: Failed to load OpenCV Haar Cascade classifier.")
    return _HAAR_DETECTOR


# ── Face Detection & Cropping ────────────────────────────────────────────────

def _detect_and_crop_face(image_bgr: np.ndarray) -> Optional[np.ndarray]:
    """
    Detect the primary face in the image using Haar Cascade.
    Crops with a 15% margin to preserve facial boundary contours.
    """
    detector = _get_detector()
    if detector is None or detector.empty():
        return None

    # Downscale frame if larger than 640px to boost speed and reduce detection RAM
    h, w = image_bgr.shape[:2]
    if max(h, w) > 640:
        scale = 640.0 / max(h, w)
        img_scaled = cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        img_scaled = image_bgr
        scale = 1.0

    gray = cv2.cvtColor(img_scaled, cv2.COLOR_BGR2GRAY)

    # First pass: standard detection
    faces = detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(40, 40),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    # Second pass: looser parameters if first pass missed
    if len(faces) == 0:
        faces = detector.detectMultiScale(
            gray,
            scaleFactor=1.05,
            minNeighbors=3,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

    if len(faces) == 0:
        return None

    # Select the largest face by area
    largest = max(faces, key=lambda rect: rect[2] * rect[3])
    x, y, fw, fh = largest

    # Map coordinates back to original image size
    if scale != 1.0:
        x = int(x / scale)
        y = int(y / scale)
        fw = int(fw / scale)
        fh = int(fh / scale)

    # Add 15% boundary margin
    margin_x = int(0.15 * fw)
    margin_y = int(0.15 * fh)
    x1 = max(0, x - margin_x)
    y1 = max(0, y - margin_y)
    x2 = min(image_bgr.shape[1], x + fw + margin_x)
    y2 = min(image_bgr.shape[0], y + fh + margin_y)

    crop = image_bgr[y1:y2, x1:x2]
    return crop if crop.size > 0 else None


# ── Feature Extraction ───────────────────────────────────────────────────────

def _run_inference(face_bgr: np.ndarray) -> list[float]:
    """Preprocess cropped face and extract 512-d L2-normalized embedding."""
    session = _get_session()
    input_meta = session.get_inputs()[0]
    input_name = input_meta.name
    shape = input_meta.shape

    # FaceNet standard input is 160x160 RGB
    target_h, target_w = 160, 160
    if len(shape) == 4:
        if isinstance(shape[2], int) and shape[2] > 0 and isinstance(shape[3], int) and shape[3] > 0:
            target_h, target_w = shape[2], shape[3]
        elif isinstance(shape[1], int) and shape[1] > 0 and isinstance(shape[2], int) and shape[2] > 0 and shape[3] == 3:
            target_h, target_w = shape[1], shape[2]

    # Convert BGR -> RGB and resize
    rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_AREA)

    # Normalise pixels to [-1, 1]
    norm_img = (resized.astype(np.float32) - 127.5) / 128.0

    # NCHW vs NHWC format
    if len(shape) == 4 and (shape[1] == 3 or shape[1] == "channel" or shape[3] != 3):
        tensor = np.transpose(norm_img, (2, 0, 1))  # (3, H, W)
        tensor = np.expand_dims(tensor, axis=0)       # (1, 3, H, W)
    else:
        tensor = np.expand_dims(norm_img, axis=0)      # (1, H, W, 3)

    outputs = session.run(None, {input_name: tensor})
    emb = np.array(outputs[0], dtype=np.float32).flatten()

    # L2-normalise so dot product equals cosine similarity
    norm = np.linalg.norm(emb)
    if norm > 0:
        emb = emb / norm

    return emb.tolist()


# ── Public API ───────────────────────────────────────────────────────────────

def get_embedding(image_bgr: np.ndarray) -> Optional[list[float]]:
    """
    Detect the largest face in a BGR image and return its
    512-d L2-normalised embedding as a plain Python list.

    Returns None if no face is detected.
    """
    if image_bgr is None or image_bgr.size == 0:
        return None

    face_crop = _detect_and_crop_face(image_bgr)
    if face_crop is None:
        logger.warning("IRIS: No face detected in frame.")
        return None

    try:
        emb = _run_inference(face_crop)
        logger.debug("IRIS: 512-d embedding extracted (norm=%.4f).", float(np.linalg.norm(emb)))
        return emb
    except Exception as exc:
        logger.error("IRIS: FaceNet inference error — %s", exc)
        return None


def get_averaged_embedding(frames: list[np.ndarray]) -> Optional[list[float]]:
    """
    Compute a single representative embedding from multiple frames
    (used during enrollment: 3-5 webcam frames -> one stored vector).

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
        avg = avg / norm  # re-normalise after averaging

    logger.info("IRIS: Averaged embedding from %d / %d frames.", len(embeddings), len(frames))
    return avg.tolist()
