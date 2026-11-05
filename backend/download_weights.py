"""
download_weights.py
Pre-downloads the lightweight FaceNet ONNX model during Render build time
so that live API requests never hang on downloads or trigger timeouts.
"""
import os
import sys
import urllib.request

MODEL_URL = "https://huggingface.co/haikalmumtaz/facenet-onnx/resolve/main/facenet.onnx"
TARGET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agents", "iris", "models")
TARGET_PATH = os.path.join(TARGET_DIR, "facenet.onnx")
MIN_BYTES = 90 * 1024 * 1024


def pre_download():
    print(f"Pre-downloading FaceNet ONNX model from {MODEL_URL}...")
    os.makedirs(TARGET_DIR, exist_ok=True)

    if os.path.exists(TARGET_PATH) and os.path.getsize(TARGET_PATH) >= MIN_BYTES:
        print(f"Model already cached at {TARGET_PATH} (size: {os.path.getsize(TARGET_PATH)} bytes).")
        return

    temp_path = f"{TARGET_PATH}.tmp"
    try:
        urllib.request.urlretrieve(MODEL_URL, temp_path)
        if os.path.exists(temp_path) and os.path.getsize(temp_path) >= MIN_BYTES:
            os.replace(temp_path, TARGET_PATH)
            print(f"FaceNet ONNX model successfully downloaded ({os.path.getsize(TARGET_PATH)} bytes).")
        else:
            print("Warning: Downloaded file size is smaller than expected.")
    except Exception as exc:
        print(f"Warning: Pre-download encountered {exc}; runtime will auto-download.")
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        sys.exit(0)


if __name__ == "__main__":
    pre_download()
