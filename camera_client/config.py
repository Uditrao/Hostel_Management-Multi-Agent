"""
Camera Kiosk Config
===================
Copy this to config.py (already gitignored) and fill in your values.
"""

# Backend URL — use localhost during dev, hosted URL during demo
BACKEND_URL = "http://127.0.0.1:8000"

# Same value as KIOSK_API_KEY in backend/.env
KIOSK_API_KEY = "change_this_to_a_random_secret"

# Webcam device index (0 = laptop built-in camera, 1 = external USB camera)
CAMERA_INDEX = 0
