"""
Supabase client — singleton connection helper.
Used by all agents to interact with the database.
"""

import os
import logging
from supabase import create_client, Client
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env explicitly
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()

logger = logging.getLogger("hostel.db")

_client: Client | None = None


def get_client() -> Client:
    """Return the shared Supabase client (lazy singleton)."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service-role key for backend ops
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _client = create_client(url, key)
        logger.info("Supabase client initialised.")
    return _client


def check_connection() -> bool:
    """
    Smoke-test the Supabase connection at startup.
    Returns True if the DB responds, False otherwise.
    """
    try:
        client = get_client()
        # A lightweight query — just fetch the first row of any system view
        client.table("users").select("id").limit(1).execute()
        return True
    except Exception as exc:
        logger.error("Supabase connection check failed: %s", exc)
        return False
