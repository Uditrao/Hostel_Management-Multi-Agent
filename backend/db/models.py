"""
Pydantic models mirroring every table in the Postgres schema.
Used for request validation, response serialisation, and type safety
across all agent modules.
"""

from __future__ import annotations

import uuid
from datetime import datetime, date, time
from typing import Optional, List, Any
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# USERS & STUDENTS
# ─────────────────────────────────────────────────────────────────────────────

class UserRole:
    STUDENT    = "student"
    MESS_STAFF = "mess_staff"
    WARDEN     = "warden"


class User(BaseModel):
    id: uuid.UUID
    email: str
    role: str  # 'student' | 'mess_staff' | 'warden'
    created_at: datetime


class Student(BaseModel):
    id: uuid.UUID                          # same UUID as users.id
    roll_no: str
    name: str
    room_no: str
    photo_url: Optional[str] = None
    face_embedding: Optional[List[float]] = None  # 128-d vector
    enrolled_at: Optional[datetime] = None


class StudentCreate(BaseModel):
    roll_no: str
    name: str
    room_no: str
    email: str                             # used to look up the users row


# ─────────────────────────────────────────────────────────────────────────────
# ATTENDANCE
# ─────────────────────────────────────────────────────────────────────────────

class AttendanceStatus:
    PRESENT = "present"
    LATE    = "late"


class AttendanceLog(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    timestamp: datetime
    status: str      # 'present' | 'late'
    method: str = "face"


class AttendanceWindow(BaseModel):
    id: uuid.UUID
    start_time: time
    end_time: time
    active_days: List[str]   # e.g. ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']


class AttendanceWindowUpdate(BaseModel):
    start_time: time
    end_time: time
    active_days: List[str]


# ─────────────────────────────────────────────────────────────────────────────
# MESS
# ─────────────────────────────────────────────────────────────────────────────

class MealType:
    BREAKFAST = "breakfast"
    LUNCH     = "lunch"
    DINNER    = "dinner"


class MessEntry(BaseModel):
    id: uuid.UUID
    student_id: Optional[uuid.UUID] = None   # None if unrecognised
    is_recognized: bool
    meal_type: str   # 'breakfast' | 'lunch' | 'dinner'
    timestamp: datetime
    flagged_image_url: Optional[str] = None


class Ingredient(BaseModel):
    name: str
    qty_per_student_grams: float


class MessMenu(BaseModel):
    id: uuid.UUID
    meal_type: str
    dish_name: str
    ingredients: List[Ingredient]
    effective_date: date


class InventoryItem(BaseModel):
    id: uuid.UUID
    item_name: str
    quantity_available: float
    unit: str
    last_updated: datetime
    updated_by: Optional[uuid.UUID] = None


class InventoryUpsert(BaseModel):
    item_name: str
    quantity_available: float
    unit: str


class InventoryAlert(BaseModel):
    id: uuid.UUID
    item_name: str
    message: str
    urgency: str   # 'low' | 'medium' | 'high' | 'critical'
    created_at: datetime
    resolved: bool = False


class InventoryNLPLog(BaseModel):
    id: uuid.UUID
    raw_command: str
    parsed_action: dict   # {"item": str, "action": str, "qty": float, "unit": str}
    staff_id: uuid.UUID
    timestamp: datetime


# ─────────────────────────────────────────────────────────────────────────────
# MAINTENANCE
# ─────────────────────────────────────────────────────────────────────────────

class ComplaintCategory:
    ELECTRICAL = "electrical"
    PLUMBING   = "plumbing"
    CARPENTRY  = "carpentry"
    OTHER      = "other"


class ComplaintStatus:
    OPEN     = "open"
    ASSIGNED = "assigned"
    RESOLVED = "resolved"


class ComplaintUrgency:
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"


class Complaint(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    raw_text: str
    category: str       # ComplaintCategory values
    urgency: str        # ComplaintUrgency values
    status: str = "open"
    created_at: datetime
    assigned_worker_note: Optional[str] = None


class ComplaintSubmit(BaseModel):
    raw_text: str   # the student's free-text submission


class ComplaintUpdate(BaseModel):
    status: Optional[str] = None
    assigned_worker_note: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# ORCHESTRATOR / ANOMALIES
# ─────────────────────────────────────────────────────────────────────────────

class AnomalyType:
    ATTENDANCE_MISSED    = "attendance_missed"
    MESS_MISSED_STREAK   = "mess_missed_streak"
    UNRESOLVED_COMPLAINT = "unresolved_complaint"


class AnomalyFlag(BaseModel):
    id: uuid.UUID
    student_id: Optional[uuid.UUID] = None
    type: str       # AnomalyType values
    detail: str
    created_at: datetime
    seen_by_warden: bool = False


# ─────────────────────────────────────────────────────────────────────────────
# SHARED / GENERIC RESPONSES
# ─────────────────────────────────────────────────────────────────────────────

class StatusResponse(BaseModel):
    """Generic success/failure response wrapper."""
    success: bool
    message: str
    data: Optional[Any] = None
