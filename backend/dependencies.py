import os

from fastapi import Header, HTTPException
from jose import jwt, JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db  # noqa: F401 — re-exported for routers

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Admin API key — None means env var not set (skip check in dev)
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")


def check_admin_key(x_api_key: str = Header(default="")):
    """Dependency: require X-Api-Key header when ADMIN_API_KEY env var is set."""
    if ADMIN_API_KEY is not None and x_api_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key")


async def get_current_user(authorization: str = Header(default="")) -> str:
    """Dependency: decode Bearer JWT (created by Next.js with AUTH_SECRET) and return user_email."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )

    token = authorization[len("Bearer "):]
    secret = os.getenv("AUTH_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="AUTH_SECRET not configured on server")

    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        email: str | None = payload.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Token missing email claim")
        return email
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")