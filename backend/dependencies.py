import hashlib
import ipaddress
import os
from typing import Iterable

from fastapi import Header, HTTPException, Request
from jose import JWTError, jwt
from slowapi import Limiter

from database import get_db  # noqa: F401 - re-exported for routers

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


def _get_rate_limit(name: str, default: str) -> str:
    return _get_non_empty_env(name) or default


RATE_LIMIT_ANALYZE = _get_rate_limit("RATE_LIMIT_ANALYZE", "60/minute")
RATE_LIMIT_EVENTS = _get_rate_limit("RATE_LIMIT_EVENTS", "60/minute")
RATE_LIMIT_EVENTS_BATCH = _get_rate_limit("RATE_LIMIT_EVENTS_BATCH", "30/minute")
RATE_LIMIT_GENERATE = _get_rate_limit("RATE_LIMIT_GENERATE", "20/minute")
RATE_LIMIT_GENERATE_MULTI = _get_rate_limit("RATE_LIMIT_GENERATE_MULTI", "10/minute")
RATE_LIMIT_REFINE = _get_rate_limit("RATE_LIMIT_REFINE", "10/minute")


def _iter_trusted_proxy_networks() -> Iterable[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    raw = _get_non_empty_env("TRUSTED_PROXY_CIDRS")
    if raw is None:
        raw = "127.0.0.1/32,::1/128"

    for item in raw.split(","):
        candidate = item.strip()
        if not candidate:
            continue
        try:
            yield ipaddress.ip_network(candidate, strict=False)
        except ValueError:
            continue


def _normalize_ip_candidate(value: str | None) -> str | None:
    if not value:
        return None

    cleaned = value.strip().strip('"').strip("'")
    if not cleaned:
        return None

    if cleaned.lower() == "unknown":
        return None

    if cleaned.startswith("[") and "]" in cleaned:
        cleaned = cleaned[1:cleaned.index("]")]
    elif cleaned.count(":") == 1 and "." in cleaned:
        host, port = cleaned.rsplit(":", 1)
        if port.isdigit():
            cleaned = host

    if "%" in cleaned:
        cleaned = cleaned.split("%", 1)[0]

    try:
        return str(ipaddress.ip_address(cleaned))
    except ValueError:
        return None


def _is_trusted_proxy(remote_addr: str | None) -> bool:
    normalized = _normalize_ip_candidate(remote_addr)
    if normalized is None:
        return False

    remote_ip = ipaddress.ip_address(normalized)
    return any(remote_ip in network for network in _iter_trusted_proxy_networks())


def _extract_forwarded_for(forwarded_header: str | None) -> str | None:
    if not forwarded_header:
        return None

    for part in forwarded_header.split(","):
        for token in part.split(";"):
            token = token.strip()
            if not token.lower().startswith("for="):
                continue
            candidate = token.split("=", 1)[1].strip()
            normalized = _normalize_ip_candidate(candidate)
            if normalized is not None:
                return normalized
    return None


def _get_client_ip(request: Request) -> str:
    direct_ip = _normalize_ip_candidate(request.client.host if request.client else None)

    if direct_ip is not None and _is_trusted_proxy(direct_ip):
        forwarded_ip = _extract_forwarded_for(request.headers.get("forwarded"))
        if forwarded_ip is not None:
            return forwarded_ip

        x_forwarded_for = request.headers.get("x-forwarded-for", "")
        for raw_ip in x_forwarded_for.split(","):
            forwarded_ip = _normalize_ip_candidate(raw_ip)
            if forwarded_ip is not None:
                return forwarded_ip

        real_ip = _normalize_ip_candidate(request.headers.get("x-real-ip"))
        if real_ip is not None:
            return real_ip

    return direct_ip or "unknown"


def _get_rate_limit_identity_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.strip():
        try:
            email = _decode_user_email_from_authorization(authorization)
        except HTTPException:
            pass
        else:
            return f"user:{email.strip().lower()}"

    admin_api_key = _get_non_empty_env("ADMIN_API_KEY")
    x_api_key = request.headers.get("x-api-key", "").strip()
    if admin_api_key is not None and x_api_key == admin_api_key:
        digest = hashlib.sha256(x_api_key.encode("utf-8")).hexdigest()[:12]
        return f"admin:{digest}"

    return None


def get_rate_limit_key(request: Request) -> str:
    identity = _get_rate_limit_identity_from_request(request)
    if identity is not None:
        return identity
    return f"ip:{_get_client_ip(request)}"


def get_rate_limit_strategy_summary() -> dict:
    trusted_proxy_cidrs = _get_non_empty_env("TRUSTED_PROXY_CIDRS")
    return {
        "key_priority": ["jwt_user", "admin_api_key", "client_ip"],
        "trusted_proxy_cidrs": [
            item.strip()
            for item in (trusted_proxy_cidrs or "127.0.0.1/32,::1/128").split(",")
            if item.strip()
        ],
        "limits": {
            "generate": RATE_LIMIT_GENERATE,
            "generate_multi": RATE_LIMIT_GENERATE_MULTI,
            "refine": RATE_LIMIT_REFINE,
            "analyze": RATE_LIMIT_ANALYZE,
            "events": RATE_LIMIT_EVENTS,
            "events_batch": RATE_LIMIT_EVENTS_BATCH,
        },
    }


# Rate limiter
limiter = Limiter(key_func=get_rate_limit_key)


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
