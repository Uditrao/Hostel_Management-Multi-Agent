"""
Auth — JWT Handler (Phase 6)
=============================
Verifies Supabase-issued JWTs using the project's JWT secret (HS256).

Usage:
    payload = verify_supabase_jwt(token)   # raises HTTPException on failure
    role    = extract_role(payload)         # returns 'student' | 'warden' | 'mess_staff' | 'kiosk'
"""

from __future__ import annotations

import os
import logging
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger("hostel.auth.jwt")

# ── Lazy import of jose ────────────────────────────────────────────────────────
# Avoids hard startup failure if python-jose is not installed yet.
try:
    from jose import jwt, JWTError, ExpiredSignatureError
    _JOSE_AVAILABLE = True
except ImportError:  # pragma: no cover
    _JOSE_AVAILABLE = False
    logger.warning("python-jose not installed — JWT verification is DISABLED.")


from pathlib import Path
from dotenv import load_dotenv

# ── Algorithm constant ─────────────────────────────────────────────────────────
_ALGORITHM = "HS256"


def _get_jwt_secret() -> Optional[str]:
    """Return the Supabase JWT secret from environment, reloading .env if needed."""
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret or secret == "your_jwt_secret_here":
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=True)
            secret = os.getenv("SUPABASE_JWT_SECRET")
    if secret and secret != "your_jwt_secret_here":
        return secret
    return None


def verify_supabase_jwt(token: str) -> dict:
    """
    Decode and verify a Supabase JWT.
    First attempts fast local HS256 decode if SUPABASE_JWT_SECRET is valid.
    Falls back to Supabase auth client verification to guarantee reliability.

    Args:
        token: Raw JWT string (without 'Bearer ' prefix).

    Returns:
        Decoded payload dict containing sub, email, user_metadata, and role.

    Raises:
        HTTPException 401 — token missing, expired, or invalid.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Fast local verification if secret is available and jose is installed
    secret = _get_jwt_secret()
    if secret and _JOSE_AVAILABLE:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=[_ALGORITHM],
                options={"verify_aud": False},
            )
            return payload
        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError:
            # Fall through to Supabase client verification
            logger.debug("Local JWT signature check failed; falling back to Supabase client verification")

    # 2. Remote / client verification via Supabase API (works with all token formats)
    try:
        from db.supabase_client import get_client
        client = get_client()
        user_resp = client.auth.get_user(token)
        if user_resp and getattr(user_resp, "user", None):
            u = user_resp.user
            return {
                "sub": str(u.id),
                "email": getattr(u, "email", None),
                "role": getattr(u, "role", "authenticated") or "authenticated",
                "user_metadata": getattr(u, "user_metadata", {}) or {},
                "app_metadata": getattr(u, "app_metadata", {}) or {},
            }
    except Exception as exc:
        logger.warning("Supabase auth verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def extract_role(payload: dict) -> Optional[str]:
    """
    Extract the app role from a decoded Supabase JWT payload.

    Supabase stores custom claims in `user_metadata` (set at signup).
    Returns: 'student' | 'warden' | 'mess_staff' | 'kiosk' | None
    """
    user_metadata = payload.get("user_metadata") or {}
    return user_metadata.get("role")


def extract_user_id(payload: dict) -> Optional[str]:
    """Extract the user UUID (Supabase auth user id) from the JWT payload."""
    return payload.get("sub")


def extract_email(payload: dict) -> Optional[str]:
    """Extract the email from the JWT payload."""
    return payload.get("email")
