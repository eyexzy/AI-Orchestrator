import pytest
from jose import jwt

from dependencies import check_admin_key, get_current_user, get_optional_current_user
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_get_current_user_decodes_bearer(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "secret")
    token = jwt.encode({"email": "user@example.com"}, "secret", algorithm="HS256")
    email = await get_current_user(authorization=f"Bearer {token}")
    assert email == "user@example.com"


@pytest.mark.asyncio
async def test_get_current_user_rejects_invalid_token(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "secret")
    with pytest.raises(HTTPException) as exc:
        await get_current_user(authorization="Bearer bad-token")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "secret")
    assert await get_optional_current_user(authorization="") is None
    assert await get_optional_current_user(authorization="Bearer bad-token") is None


def test_check_admin_key_enforces_env_value(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "admin-secret")
    check_admin_key(x_api_key="admin-secret")
    with pytest.raises(HTTPException) as exc:
        check_admin_key(x_api_key="wrong")
    assert exc.value.status_code == 401
