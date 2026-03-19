import os

from fastapi import Header, HTTPException
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db  # noqa: F401 - re-exported for routers

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


def _get_non_empty_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None

    value = value.strip()
    return value or None


def is_production_env() -> bool:
    for env_name in ("ENV", "NODE_ENV"):
        value = _get_non_empty_env(env_name)
        if value is not None:
            return value.lower() == "production"
    return False


def check_admin_key(x_api_key: str = Header(default="")):
    """Require X-Api-Key when ADMIN_API_KEY is configured."""
    admin_api_key = _get_non_empty_env("ADMIN_API_KEY")
    if admin_api_key is not None and x_api_key.strip() != admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key")


def _decode_user_email_from_authorization(authorization: str) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )

    token = authorization[len("Bearer "):]
    secret = _get_non_empty_env("AUTH_SECRET")
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


async def get_current_user(authorization: str = Header(default="")) -> str:
    """Decode Bearer JWT created by Next.js and return user_email."""
    return _decode_user_email_from_authorization(authorization)


async def get_optional_current_user(authorization: str = Header(default="")) -> str | None:
    """Best-effort JWT decode for routes that also support admin-key-only access."""
    if not authorization.strip():
        return None
    try:
        return _decode_user_email_from_authorization(authorization)
    except HTTPException:
        return None