"""
download_weights.py
Pre-downloads Facenet512 model weights during build time
so that live API requests never hang on downloads.
"""
import os
import sys
import numpy as np

def pre_download():
    print("Pre-downloading Facenet512 model weights for production...")
    try:
        from deepface import DeepFace
        dummy_img = np.zeros((224, 224, 3), dtype=np.uint8)
        DeepFace.represent(
            img_path=dummy_img,
            model_name="Facenet512",
            detector_backend="opencv",
            enforce_detection=False,
            align=False
        )
        print("Facenet512 weights successfully downloaded and cached on disk.")
    except Exception as e:
        print(f"Warning: Model pre-download encountered: {e}")
        # Don't fail build if network is slow; runtime will fall back to auto-download
        sys.exit(0)

if __name__ == "__main__":
    pre_download()
