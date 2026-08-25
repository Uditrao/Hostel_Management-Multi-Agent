"""
Camera Kiosk Client — IRIS Face Capture Script
===============================================
Runs LOCALLY on your laptop/demo machine.
Captures from the built-in webcam and sends frames to the hosted IRIS backend.

Usage (after filling config.py with your backend URL):

  # Gate attendance mode (forwards to SENTINEL)
  python capture.py --mode gate

  # Mess entry mode (forwards to NOURISH)
  python capture.py --mode mess

  # Demo / dry-run (no API call — just shows webcam + bounding box)
  python capture.py --demo

Controls:
  SPACE   — Capture current frame and send to API
  Q       — Quit
"""

from __future__ import annotations

import argparse
import sys
import time
from io import BytesIO

import cv2
import numpy as np
import requests
from PIL import Image

try:
    from config import BACKEND_URL, KIOSK_API_KEY, CAMERA_INDEX
except ImportError:
    print("[ERROR] config.py not found. Copy config.example.py → config.py and fill in your values.")
    sys.exit(1)


# ── API helpers ───────────────────────────────────────────────────────────────

def _frame_to_jpeg(frame: np.ndarray) -> bytes:
    """Encode a BGR numpy frame to JPEG bytes."""
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise RuntimeError("Failed to encode frame to JPEG.")
    return buf.tobytes()


def call_iris_recognize(frame: np.ndarray, location: str) -> dict:
    """POST a frame to /iris/recognize and return the identity event."""
    jpeg = _frame_to_jpeg(frame)
    files = {"image": ("capture.jpg", jpeg, "image/jpeg")}
    data = {"location": location, "mode": "upload"}
    headers = {"X-API-Key": KIOSK_API_KEY}

    try:
        resp = requests.post(
            f"{BACKEND_URL}/iris/recognize",
            files=files,
            data=data,
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        return {"recognized": False, "error": str(exc), "location": location}


def forward_event(event: dict, location: str) -> dict | None:
    """
    Forward the identity event from IRIS to the appropriate downstream agent.
    gate  → POST /sentinel/gate-event
    mess  → POST /nourish/mess-event
    """
    if not event.get("recognized"):
        return None  # Unknown — nothing to forward

    endpoint_map = {
        "gate": f"{BACKEND_URL}/sentinel/gate-event",
        "mess": f"{BACKEND_URL}/nourish/mess-event",
    }
    endpoint = endpoint_map.get(location)
    if not endpoint:
        return None

    headers = {"X-API-Key": KIOSK_API_KEY}
    try:
        resp = requests.post(endpoint, json=event, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        print(f"[WARN] Could not forward event to {endpoint}: {exc}")
        return None


# ── Overlay rendering ─────────────────────────────────────────────────────────

def _draw_overlay(frame: np.ndarray, event: dict, waiting: bool = False) -> np.ndarray:
    """Draw recognition result overlay on the frame."""
    display = frame.copy()
    h, w = display.shape[:2]

    if waiting:
        # Pulsing "READY — press SPACE" banner
        cv2.rectangle(display, (0, h - 60), (w, h), (50, 50, 50), -1)
        cv2.putText(display, "SPACE = Capture  |  Q = Quit",
                    (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        return display

    if event.get("recognized"):
        color = (0, 220, 0)   # green
        label = f"✓ {event.get('student_name')}  [{event.get('roll_no')}]"
        sub   = f"Confidence: {event.get('confidence', 0):.1%}  |  {event.get('location', '').upper()}"
    elif event.get("error"):
        color = (0, 180, 255)  # orange
        label = "No face detected"
        sub   = event.get("error", "")
    else:
        color = (0, 0, 220)   # red
        label = "UNKNOWN — Access Denied"
        sub   = f"Location: {event.get('location', '').upper()}"

    # Banner
    cv2.rectangle(display, (0, 0), (w, 80), color, -1)
    cv2.putText(display, label, (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    cv2.putText(display, sub,   (15, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (230, 230, 230), 1)

    return display


# ── Main loop ─────────────────────────────────────────────────────────────────

def run(mode: str, demo: bool = False):
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print(f"[ERROR] Could not open camera index={CAMERA_INDEX}.")
        sys.exit(1)

    print(f"\n🎥 IRIS Kiosk — mode={'DEMO' if demo else mode.upper()}")
    print("   SPACE = Capture & Recognize   |   Q = Quit\n")

    last_event: dict = {}
    result_display_until: float = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Frame capture failed.")
            break

        # Show last result for 3 seconds, then return to "ready" state
        now = time.time()
        showing_result = now < result_display_until

        display = _draw_overlay(frame, last_event, waiting=not showing_result)
        cv2.imshow(f"IRIS Kiosk — {mode.upper()}", display)

        key = cv2.waitKey(1) & 0xFF

        if key == ord("q") or key == 27:   # Q or ESC
            print("Exiting IRIS kiosk.")
            break

        if key == ord(" "):  # SPACE — capture
            print("📸 Capturing frame…")
            if demo:
                print("[DEMO] Skipping API call in demo mode.")
                last_event = {"recognized": False, "error": "Demo mode — no API call.", "location": mode}
            else:
                last_event = call_iris_recognize(frame, location=mode)
                recognized = last_event.get("recognized")
                print(f"   {'✅ Recognized' if recognized else '❌ Unknown'}: {last_event}")

                # Forward to SENTINEL / NOURISH
                downstream = forward_event(last_event, mode)
                if downstream:
                    print(f"   ↳ Forwarded to agent: {downstream}")

            result_display_until = time.time() + 3.0  # show result for 3 seconds

    cap.release()
    cv2.destroyAllWindows()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="IRIS Camera Kiosk — captures from webcam, sends to IRIS backend."
    )
    parser.add_argument(
        "--mode",
        choices=["gate", "mess"],
        default="gate",
        help="Kiosk mode: 'gate' (→ SENTINEL) or 'mess' (→ NOURISH). Default: gate",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Demo mode: show webcam without making API calls.",
    )
    args = parser.parse_args()
    run(mode=args.mode, demo=args.demo)
