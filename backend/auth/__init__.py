"""
Auth package — Phase 6
========================
Exposes the key dependency functions for use in all agent routers.
"""

from auth.jwt_handler import verify_supabase_jwt, extract_role, extract_user_id, extract_email
from auth.dependencies import (
    get_current_user,
    require_role,
    get_kiosk_or_warden,
    get_any_authenticated_user,
)

__all__ = [
    "verify_supabase_jwt",
    "extract_role",
    "extract_user_id",
    "extract_email",
    "get_current_user",
    "require_role",
    "get_kiosk_or_warden",
    "get_any_authenticated_user",
]
