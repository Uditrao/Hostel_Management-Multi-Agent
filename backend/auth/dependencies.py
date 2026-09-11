"""
Auth — FastAPI Dependencies (Phase 6)
======================================
Provides reusable FastAPI dependency functions for:

  - get_current_user(...)      → verified JWT payload dict
  - require_role(*roles)       → dependency factory enforcing role membership
  - get_kiosk_or_warden(...)   → convenience: warden OR kiosk access

Usage in a router:
    from auth.dependencies import get_current_user, require_role

    @router.get("/admin-only")
    async def admin_endpoint(user = Depends(require_role("warden"))):
        ...

    @router.get("/student-or-warden")
    async def mixed_endpoint(user = Depends(require_role("student", "warden"))):
        ...
"""

from __future__ import annotations

import os
import logging
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, APIKeyHeader

from auth.jwt_handler import verify_supabase_jwt, extract_role, extract_user_id

logger = logging.getLogger("hostel.auth.deps")

# ── Schemes ────────────────────────────────────────────────────────────────────

# Bearer token (JWT) — used by students, wardens, mess_staff
_bearer_scheme = HTTPBearer(auto_error=False)

# API key header — used by camera kiosk for backward compatibility
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# ── Core Dependency ────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_bearer_scheme),
) -> dict:
    """
    FastAPI dependency: verify Bearer JWT and return the decoded payload.

    The returned dict contains Supabase JWT claims:
      - sub          : str  — Supabase auth user UUID
      - email        : str
      - user_metadata: dict — includes our 'role' field
      ...

    Raises:
        HTTPException 401 if no token or invalid token.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_supabase_jwt(credentials.credentials)


# ── Role Enforcement Factory ───────────────────────────────────────────────────

def require_role(*allowed_roles: str) -> Callable:
    """
    Factory that returns a FastAPI dependency enforcing role membership.

    Args:
        *allowed_roles: One or more role strings that are permitted
                        (e.g. "warden", "student", "mess_staff", "kiosk").

    Returns:
        A dependency callable that resolves to the user's JWT payload dict.

    Raises:
        HTTPException 401 — if unauthenticated.
        HTTPException 403 — if authenticated but wrong role.

    Example:
        @router.get("/warden-only")
        async def warden_view(user = Depends(require_role("warden"))):
            ...
    """
    async def _dependency(
        user: dict = Depends(get_current_user),
    ) -> dict:
        role = extract_role(user)
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required role(s): {', '.join(allowed_roles)}. "
                    f"Your role: '{role or 'unknown'}'."
                ),
            )
        return user

    return _dependency


# ── Kiosk OR Warden dependency ─────────────────────────────────────────────────

async def get_kiosk_or_warden(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_bearer_scheme),
    api_key: Optional[str] = Security(_api_key_header),
) -> dict:
    """
    Dependency that accepts EITHER:
    - A valid JWT with role='warden' or role='kiosk'
    - A valid X-API-Key matching KIOSK_API_KEY (backward compat for camera kiosk)

    Returns a user-like dict for the kiosk case:
        {"sub": "kiosk", "user_metadata": {"role": "kiosk"}}

    Raises:
        HTTPException 401 / 403 if neither credential is valid.
    """
    # Try API key first (kiosk legacy path)
    expected_api_key = os.getenv("KIOSK_API_KEY")
    if api_key and expected_api_key and api_key == expected_api_key:
        logger.debug("Kiosk authenticated via X-API-Key.")
        return {"sub": "kiosk", "email": None, "user_metadata": {"role": "kiosk"}}

    # Fall back to JWT verification
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: provide a Bearer JWT or X-API-Key header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_supabase_jwt(credentials.credentials)
    role = extract_role(payload)
    if role not in ("warden", "kiosk"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Required role: warden or kiosk. Your role: '{role or 'unknown'}'.",
        )
    return payload


# ── Any Authenticated User ─────────────────────────────────────────────────────

async def get_any_authenticated_user(
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Dependency that allows ANY role (student, warden, mess_staff).
    Just verifies the JWT is valid — does not enforce a specific role.
    """
    return user
