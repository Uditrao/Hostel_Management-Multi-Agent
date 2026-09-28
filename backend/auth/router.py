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
                "roll_no": body.roll_no,
                "room_no": body.room_no,
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
    # users table schema: (id, email, role, created_at)
    account_status = "active" if body.role == "kiosk" else "pending"
    try:
        db.table("users").upsert({
            "id":    user_id,
            "email": body.email,
            "role":  body.role,
        }).execute()
    except Exception as exc:
        logger.error("Failed to insert users row for %s: %s", user_id, exc)

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
            else "Account created. Awaiting warden approval before your profile is fully activated."
        ),
    }


@router.post("/login", summary="Login and get JWT access token (public)")
async def login(body: LoginRequest):
    """
    Authenticate with email + password.

    Returns Supabase JWT `access_token` — use this as `Authorization: Bearer <token>` on all protected routes.
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

    user = auth_resp.user
    meta = (user.user_metadata or {}) if user else {}
    role = meta.get("role", "student")
    full_name = meta.get("full_name") or body.email.split("@")[0]

    # For students: active if in students table, pending if not yet approved
    account_status = "active"
    if role == "student":
        try:
            s_row = (
                db.table("students")
                .select("id")
                .eq("id", user.id)
                .execute()
            )
            if not (s_row and s_row.data):
                account_status = "pending"
        except Exception as exc:
            logger.warning("Could not check student approval status for %s: %s", user.id, exc)

    logger.info("Login successful: %s (role=%s, status=%s)", body.email, role, account_status)

    return {
        "success":      True,
        "access_token": auth_resp.session.access_token,
        "token_type":   "bearer",
        "expires_in":   auth_resp.session.expires_in,
        "user": {
            "id":        user.id,
            "email":     body.email,
            "role":      role,
            "full_name": full_name,
            "status":    account_status,
        },
    }


@router.get("/me", summary="Get current user profile (any authenticated role)")
async def get_me(current_user: dict = Depends(get_any_authenticated_user)):
    """
    Returns the profile of the currently authenticated user from the JWT payload.
    Also fetches the application-level row from `students` table if role == student.
    """
    user_id = extract_user_id(current_user)
    role    = extract_role(current_user)
    email   = extract_email(current_user)
    meta    = current_user.get("user_metadata") or {}

    db = get_client()

    # If role is student, check students table to verify approval + enrollment
    student_profile = None
    account_status = "active"

    if role == "student":
        try:
            s_row = (
                db.table("students")
                .select("roll_no, name, room_no, photo_url, enrolled_at, face_embedding")
                .eq("id", user_id)
                .execute()
            )
            if s_row and s_row.data:
                sd = s_row.data[0]
                student_profile = {
                    "roll_no":          sd.get("roll_no"),
                    "name":             sd.get("name"),
                    "room_no":          sd.get("room_no"),
                    "photo_url":        sd.get("photo_url"),
                    "enrolled_at":      sd.get("enrolled_at"),
                    "is_face_enrolled": bool(sd.get("face_embedding") is not None or sd.get("enrolled_at")),
                }
                account_status = "active"
            else:
                account_status = "pending"
        except Exception as exc:
            logger.warning("Could not fetch students record for %s: %s", user_id, exc)
            account_status = "pending"

    full_name = (
        (student_profile.get("name") if student_profile else None)
        or meta.get("full_name")
        or (email.split("@")[0] if email else "User")
    )

    return {
        "success":         True,
        "user_id":         user_id,
        "email":           email,
        "role":            role,
        "full_name":       full_name,
        "status":          account_status,
        "student_profile": student_profile,
    }


@router.get(
    "/pending",
    summary="List pending approval requests (Warden only)",
)
async def list_pending(
    _warden: dict = Depends(require_role("warden")),
):
    """
    Returns all student accounts awaiting warden approval.
    A student is pending if registered with role='student' but not yet in the `students` table.
    """
    db = get_client()
    try:
        # 1. Fetch all approved student IDs
        stu_resp = db.table("students").select("id").execute()
        approved_ids = {s["id"] for s in (stu_resp.data or []) if s.get("id")}

        # 2. Fetch all auth users
        auth_users = db.auth.admin.list_users()
        pending = []
        for u in auth_users:
            meta = u.user_metadata or {}
            role = meta.get("role")
            if role == "student" and u.id not in approved_ids:
                created_at_val = u.created_at
                if hasattr(created_at_val, "isoformat"):
                    created_at_val = created_at_val.isoformat()
                elif created_at_val:
                    created_at_val = str(created_at_val)

                pending.append({
                    "id":         u.id,
                    "email":      u.email,
                    "full_name":  meta.get("full_name") or (u.email.split("@")[0] if u.email else "Student"),
                    "role":       "student",
                    "roll_no":    meta.get("roll_no") or "",
                    "room_no":    meta.get("room_no") or "",
                    "status":     "pending",
                    "created_at": created_at_val,
                })

        return {
            "success": True,
            "count":   len(pending),
            "pending": pending,
        }
    except Exception as exc:
        logger.error("Failed to fetch pending users: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve pending users: {exc}")


@router.get(
    "/students",
    summary="List all approved students (Warden only)",
)
async def list_approved_students(
    _warden: dict = Depends(require_role("warden")),
):
    """
    Returns all approved students currently active in the hostel.
    """
    db = get_client()
    try:
        resp = (
            db.table("students")
            .select("id, roll_no, name, room_no, photo_url, face_embedding, enrolled_at")
            .order("name")
            .execute()
        )
        students = []
        for s in (resp.data or []):
            students.append({
                "id":               s.get("id"),
                "roll_no":          s.get("roll_no"),
                "name":             s.get("name"),
                "room_no":          s.get("room_no"),
                "photo_url":        s.get("photo_url"),
                "is_face_enrolled": bool(s.get("face_embedding") is not None or s.get("enrolled_at")),
                "enrolled_at":      s.get("enrolled_at"),
            })
        return {
            "success":  True,
            "count":    len(students),
            "students": students,
        }
    except Exception as exc:
        logger.error("Failed to fetch approved students: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve students: {exc}")


@router.patch(
    "/approve/{user_id}",
    summary="Approve a pending student account (Warden only)",
)
async def approve_user(
    user_id: str,
    body: ApproveRequest = ApproveRequest(),
    _warden: dict = Depends(require_role("warden")),
):
    """
    Approve a pending student account.

    - Creates a row in `students` with roll_no, room_no, and name.
    - Updates `user_metadata` in Supabase Auth to record approval.
    """
    db = get_client()

    # 1. Check if student is already in students table
    try:
        existing = (
            db.table("students")
            .select("id")
            .eq("id", user_id)
            .execute()
        )
        if existing and existing.data:
            raise HTTPException(status_code=409, detail="Student is already approved and active.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not check existing student record: %s", exc)

    # 2. Fetch auth user to get metadata
    try:
        auth_user_resp = db.auth.admin.get_user_by_id(user_id)
        auth_user = auth_user_resp.user if auth_user_resp else None
        meta = (auth_user.user_metadata if auth_user else {}) or {}
    except Exception as exc:
        logger.warning("Could not fetch auth user for %s: %s", user_id, exc)
        auth_user = None
        meta = {}

    email = auth_user.email if auth_user else None
    full_name = meta.get("full_name") or ""
    roll = body.roll_no or meta.get("roll_no")
    room = body.room_no or meta.get("room_no")

    if not roll or not room:
        raise HTTPException(
            status_code=400,
            detail="roll_no and room_no are required to approve a student.",
        )

    # 3. Ensure user exists in public.users table (id, email, role)
    try:
        db.table("users").upsert({
            "id":    user_id,
            "email": email or "",
            "role":  "student",
        }).execute()
    except Exception as exc:
        logger.warning("Failed to upsert public.users row for %s: %s", user_id, exc)

    # 4. Insert into students table (columns: id, roll_no, name, room_no)
    try:
        stu_resp = db.table("students").insert({
            "id":      user_id,
            "roll_no": roll.strip(),
            "name":    full_name.strip() or email or "Student",
            "room_no": room.strip(),
        }).execute()
        students_row = stu_resp.data[0] if stu_resp.data else None
    except Exception as exc:
        logger.error("Failed to create students row for %s: %s", user_id, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create student record: {exc}",
        )

    # 5. Update user_metadata in Supabase Auth to record approval
    try:
        db.auth.admin.update_user_by_id(
            user_id,
            attributes={
                "user_metadata": {
                    **meta,
                    "approved": True,
                    "roll_no":  roll.strip(),
                    "room_no":  room.strip(),
                }
            }
        )
    except Exception as exc:
        logger.warning("Failed to update user_metadata on approval: %s", exc)

    logger.info("Warden approved student: %s (%s) — roll=%s, room=%s", email, user_id, roll, room)

    return {
        "success":      True,
        "user_id":      user_id,
        "email":        email,
        "role":         "student",
        "status":       "active",
        "students_row": students_row,
        "message":      f"Student '{email}' approved and activated successfully.",
    }
