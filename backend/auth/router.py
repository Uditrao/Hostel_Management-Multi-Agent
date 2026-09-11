"""
Auth — FastAPI Router (Phase 6)
================================
Endpoints:

  POST  /auth/signup              — Public: register a new user (pending approval)
  POST  /auth/login               — Public: login → returns JWT access_token
  GET   /auth/me                  — Protected: any role — returns own profile
  GET   /auth/pending             — Warden only: list pending approval requests
  PATCH /auth/approve/{user_id}   — Warden only: approve a student (creates students row)
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from auth.dependencies import get_any_authenticated_user, require_role
from auth.jwt_handler import extract_email, extract_role, extract_user_id
from db.supabase_client import get_client

logger = logging.getLogger("hostel.auth.router")

router = APIRouter()


# ── Pydantic Schemas ───────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    full_name: str = Field(..., min_length=2, max_length=100, description="Full name")
    role: str = Field(
        ...,
        description="Role: 'student' | 'warden' | 'mess_staff' | 'kiosk'",
        example="student",
    )
    # Optional student-specific fields (used when warden approves)
    roll_no: Optional[str] = Field(None, description="Student roll number (for students)")
    room_no: Optional[str] = Field(None, description="Room number (for students)")


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., description="Password")


class ApproveRequest(BaseModel):
    roll_no: Optional[str] = Field(None, description="Roll number to assign (students)")
    room_no: Optional[str] = Field(None, description="Room number to assign (students)")


# ── Valid roles ────────────────────────────────────────────────────────────────

_VALID_ROLES = {"student", "warden", "mess_staff", "kiosk"}


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post(
    "/signup",
    summary="Register a new user (public)",
    status_code=status.HTTP_201_CREATED,
)
async def signup(body: SignupRequest):
    """
    Register a new user with Supabase Auth.

    - **student**: account is created with `status=pending` — warden must approve via `PATCH /auth/approve/{id}`.
    - **warden** / **mess_staff**: same pending flow (set up by admin).
    - **kiosk**: auto-approved (no student row needed).

    On success returns: `{user_id, email, role, status, message}`
    """
    if body.role not in _VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{body.role}'. Valid roles: {', '.join(sorted(_VALID_ROLES))}.",
        )

    db = get_client()

    # 1. Create Supabase Auth user with role in user_metadata
    try:
        auth_resp = db.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "user_metadata": {
                "role": body.role,
                "full_name": body.full_name,
            },
            "email_confirm": True,   # auto-confirm for hostel system (no email OTP needed)
        })
    except Exception as exc:
        err_str = str(exc)
        if "already registered" in err_str.lower() or "already exists" in err_str.lower():
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        logger.error("Supabase Auth signup error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Auth signup failed: {err_str}")

    user_id = auth_resp.user.id if auth_resp.user else None
    if not user_id:
        raise HTTPException(status_code=500, detail="Signup succeeded but no user ID returned.")

    # 2. Insert into `users` table (application-level profile)
    account_status = "active" if body.role == "kiosk" else "pending"
    try:
        db.table("users").insert({
            "id":        user_id,
            "email":     body.email,
            "full_name": body.full_name,
            "role":      body.role,
            "status":    account_status,
        }).execute()
    except Exception as exc:
        logger.error("Failed to insert users row for %s: %s", user_id, exc)
        # Don't fail the whole signup — auth user was created. Log and continue.

    logger.info("New user registered: %s (%s) — status=%s", body.email, body.role, account_status)

    return {
        "success":  True,
        "user_id":  user_id,
        "email":    body.email,
        "role":     body.role,
        "status":   account_status,
        "message":  (
            "Account created and active."
            if account_status == "active"
            else "Account created. Awaiting warden approval before you can log in."
        ),
    }


@router.post("/login", summary="Login and get JWT access token (public)")
async def login(body: LoginRequest):
    """
    Authenticate with email + password.

    Returns Supabase JWT `access_token` — use this as `Authorization: Bearer <token>` on all protected routes.

    > **Note**: Accounts with `status=pending` will receive a 403 after login verification.
    """
    db = get_client()

    # Supabase sign-in with email + password
    try:
        auth_resp = db.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception as exc:
        err_str = str(exc).lower()
        if "invalid login" in err_str or "invalid credentials" in err_str or "email not confirmed" in err_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        logger.error("Supabase login error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Login failed: {exc}")

    if not auth_resp.session or not auth_resp.session.access_token:
        raise HTTPException(status_code=401, detail="Login failed — no session returned.")

    # Check application-level account status
    try:
        user_row = (
            db.table("users")
            .select("status, role, full_name")
            .eq("id", auth_resp.user.id)
            .maybe_single()
            .execute()
        )
        user_data = user_row.data or {}
        if user_data.get("status") == "pending":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is pending warden approval. Please wait for approval.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not check user status for %s: %s", auth_resp.user.id, exc)
        user_data = {}

    logger.info("Login successful: %s (%s)", body.email, user_data.get("role", "?"))

    return {
        "success":      True,
        "access_token": auth_resp.session.access_token,
        "token_type":   "bearer",
        "expires_in":   auth_resp.session.expires_in,
        "user": {
            "id":        auth_resp.user.id,
            "email":     body.email,
            "role":      user_data.get("role"),
            "full_name": user_data.get("full_name"),
            "status":    user_data.get("status"),
        },
    }


@router.get("/me", summary="Get current user profile (any authenticated role)")
async def get_me(current_user: dict = Depends(get_any_authenticated_user)):
    """
    Returns the profile of the currently authenticated user from the JWT payload.
    Also fetches the application-level row from `users` table.
    """
    user_id = extract_user_id(current_user)
    role    = extract_role(current_user)
    email   = extract_email(current_user)

    # Fetch extended profile from users table
    db = get_client()
    try:
        row = (
            db.table("users")
            .select("full_name, status, created_at")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        profile = row.data or {}
    except Exception as exc:
        logger.warning("Could not fetch users row for %s: %s", user_id, exc)
        profile = {}

    return {
        "success":   True,
        "user_id":   user_id,
        "email":     email,
        "role":      role,
        "full_name": profile.get("full_name"),
        "status":    profile.get("status"),
        "created_at": profile.get("created_at"),
    }


@router.get(
    "/pending",
    summary="List pending approval requests (Warden only)",
)
async def list_pending(
    _warden: dict = Depends(require_role("warden")),
):
    """
    Returns all user accounts awaiting warden approval.
    Use `PATCH /auth/approve/{user_id}` to approve a specific user.
    """
    db = get_client()
    try:
        resp = (
            db.table("users")
            .select("id, email, full_name, role, status, created_at")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
        pending = resp.data or []
    except Exception as exc:
        logger.error("Failed to fetch pending users: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve pending users: {exc}")

    return {
        "success": True,
        "count":   len(pending),
        "pending": pending,
    }


@router.patch(
    "/approve/{user_id}",
    summary="Approve a pending user account (Warden only)",
)
async def approve_user(
    user_id: str,
    body: ApproveRequest = ApproveRequest(),
    _warden: dict = Depends(require_role("warden")),
):
    """
    Approve a pending user account.

    - Sets `users.status = 'active'`.
    - For **student** role: also creates a `students` row with `roll_no` and `room_no`.

    If the user is not pending, returns a 409 conflict error.
    """
    db = get_client()

    # Fetch the user row to check status + role
    try:
        user_resp = (
            db.table("users")
            .select("id, email, full_name, role, status")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        user_data = user_resp.data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    if not user_data:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")

    if user_data["status"] == "active":
        raise HTTPException(status_code=409, detail="User is already approved and active.")

    # Activate the account
    try:
        db.table("users").update({"status": "active"}).eq("id", user_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to activate user: {exc}")

    # For students: create the students row
    students_row = None
    if user_data["role"] == "student":
        if not body.roll_no or not body.room_no:
            raise HTTPException(
                status_code=400,
                detail="roll_no and room_no are required when approving a student.",
            )
        try:
            stu_resp = db.table("students").insert({
                "id":        user_id,
                "name":      user_data.get("full_name", ""),
                "email":     user_data.get("email", ""),
                "roll_no":   body.roll_no,
                "room_no":   body.room_no,
                "is_active": True,
            }).execute()
            students_row = stu_resp.data[0] if stu_resp.data else None
        except Exception as exc:
            logger.error("Failed to create students row for %s: %s", user_id, exc)
            raise HTTPException(
                status_code=500,
                detail=f"Account activated but failed to create student record: {exc}",
            )

    logger.info(
        "Warden approved user: %s (%s) — role=%s",
        user_data.get("email"), user_id, user_data.get("role"),
    )

    return {
        "success":      True,
        "user_id":      user_id,
        "email":        user_data.get("email"),
        "role":         user_data.get("role"),
        "status":       "active",
        "students_row": students_row,
        "message":      f"User '{user_data.get('email')}' approved and activated.",
    }
