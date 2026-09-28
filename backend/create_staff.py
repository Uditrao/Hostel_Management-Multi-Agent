"""
create_staff.py
================
Script to create or update administrative staff accounts (Warden, Mess Staff).
Supports adding multiple accounts at once.

Usage:
    cd backend
    python create_staff.py

You can customize the STAFF_MEMBERS list below with any credentials you want.
Once you are done, you can delete this file yourself whenever you wish.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path so we can import from db
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db.supabase_client import get_client


# Configure stdout for UTF-8 on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# ==============================================================================
# CONFIGURATION: Add or edit as many staff members as you want here!
# Roles allowed: "warden", "mess_staff"
# ==============================================================================
STAFF_MEMBERS = [
    {
        "full_name": "Chief Hostel Warden",
        "email":     "warden@hostel.com",
        "password":  "warden123",  # 9 chars
        "role":      "warden",
    },
    {
        "full_name": "Assistant Warden",
        "email":     "asst.warden@hostel.com",
        "password":  "warden123",  # 9 chars
        "role":      "warden",
    },
    {
        "full_name": "Head Mess Manager",
        "email":     "mess@hostel.com",
        "password":  "mess1234",   # 8 chars (min length is 8)
        "role":      "mess_staff",
    },
]


def provision_staff():
    print("=" * 65)
    print(" [HOSTEL SYSTEM] - STAFF PROVISIONING SCRIPT")
    print("=" * 65)

    try:
        db = get_client()
    except Exception as exc:
        print(f"[!] Failed to connect to Supabase: {exc}")
        print("    Please check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in backend/.env")
        return

    # Fetch existing auth users to check for matches
    print("\n[*] Checking existing Supabase Auth users...")
    try:
        auth_users = db.auth.admin.list_users()
        existing_users = {u.email.lower(): u for u in auth_users if u.email}
    except Exception as exc:
        print(f"[!] Could not list existing auth users: {exc}")
        existing_users = {}

    print(f"[*] Processing {len(STAFF_MEMBERS)} staff member(s)...\n")

    success_count = 0

    for idx, member in enumerate(STAFF_MEMBERS, start=1):
        email = member["email"].strip().lower()
        password = member["password"]
        full_name = member["full_name"].strip()
        role = member["role"].strip().lower()

        if role not in ("warden", "mess_staff"):
            print(f"[{idx}] [ERROR] Invalid role '{role}' for {email}. Must be 'warden' or 'mess_staff'. Skipping.")
            continue

        if len(password) < 8:
            print(f"[{idx}] [ERROR] Password for {email} must be at least 8 characters. Skipping.")
            continue

        print(f"[{idx}] {full_name} ({email}) -> Role: [{role}]")

        user_id = None
        user_already_exists = email in existing_users

        if user_already_exists:
            existing_user = existing_users[email]
            user_id = existing_user.id
            print(f"    [INFO] Auth account already exists (ID: {user_id}). Updating password & metadata...")
            try:
                db.auth.admin.update_user_by_id(
                    user_id,
                    attributes={
                        "password": password,
                        "user_metadata": {
                            "role": role,
                            "full_name": full_name,
                        },
                        "email_confirm": True,
                    }
                )
                print("    [OK] Auth credentials and role updated.")
            except Exception as exc:
                print(f"    [ERROR] Failed to update auth user: {exc}")
                continue
        else:
            print("    [+] Creating new Supabase Auth account...")
            try:
                auth_resp = db.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "user_metadata": {
                        "role": role,
                        "full_name": full_name,
                    },
                    "email_confirm": True,  # Pre-confirmed, no verification email needed
                })
                user_id = auth_resp.user.id
                print(f"    [OK] Auth user created successfully (ID: {user_id}).")
            except Exception as exc:
                print(f"    [ERROR] Failed to create auth user: {exc}")
                continue

        # Sync/Upsert into the public.users database table
        print("    [*] Activating in public.users table...")
        upsert_payload = {
            "id":    user_id,
            "email": email,
            "role":  role,
        }
        # Try inserting with optional status/full_name if supported by table schema
        try:
            db.table("users").upsert({
                **upsert_payload,
                "full_name": full_name,
                "status":    "active",
            }).execute()
            print("    [OK] Profile activated in users table (with full metadata).")
            success_count += 1
        except Exception:
            # Fallback to standard core schema (id, email, role)
            try:
                db.table("users").upsert(upsert_payload).execute()
                print("    [OK] Profile activated in users table.")
                success_count += 1
            except Exception as exc:
                print(f"    [ERROR] Failed to upsert into users table: {exc}")

        print()

    print("=" * 65)
    print(f"[DONE] Complete! {success_count}/{len(STAFF_MEMBERS)} staff account(s) ready to log in.")
    print("=" * 65)
    print("You can now log in directly at http://localhost:5173/login with these credentials.")


if __name__ == "__main__":
    provision_staff()
