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


# ── Algorithm constant ─────────────────────────────────────────────────────────
_ALGORITHM = "HS256"


def _get_jwt_secret() -> str:
    """Return the Supabase JWT secret from environment, raising on missing."""
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        raise RuntimeError(
            "SUPABASE_JWT_SECRET is not set in .env. "
            "Find it at: Supabase Dashboard → Project Settings → API → JWT Settings."
        )
    return secret


def verify_supabase_jwt(token: str) -> dict:
    """
    Decode and verify a Supabase JWT.

    Args:
        token: Raw JWT string (without 'Bearer ' prefix).

    Returns:
        Decoded payload dict, e.g.:
        {
          "sub": "<user_uuid>",
          "email": "...",
          "role": "authenticated",
          "user_metadata": {"role": "warden", ...},
          "exp": ...,
          ...
        }

    Raises:
        HTTPException 401 — token missing, expired, or invalid.
        HTTPException 503 — jose library not installed (server config error).
    """
    if not _JOSE_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth service unavailable: python-jose not installed on server.",
        )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        secret = _get_jwt_secret()
    except RuntimeError as exc:
        logger.error("JWT secret missing: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth service misconfigured — SUPABASE_JWT_SECRET not set.",
        )

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[_ALGORITHM],
            options={"verify_aud": False},   # Supabase does not include 'aud' in user JWTs
        )
        return payload

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as exc:
        logger.warning("JWT validation failed: %s", exc)
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
