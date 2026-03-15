import os

from fastapi import Header, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db  # noqa: F401 — re-exported for routers

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Optional API key protection for sensitive endpoints
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")  # empty = no protection in dev


def check_admin_key(x_api_key: str = Header(default="")):
    """Dependency: require ADMIN_API_KEY header when env var is set."""
    if ADMIN_API_KEY and x_api_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key")