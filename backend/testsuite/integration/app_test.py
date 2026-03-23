import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from limits import parse
from slowapi.errors import RateLimitExceeded
from slowapi.wrappers import Limit
from starlette.requests import Request
from starlette.responses import JSONResponse

import main


def _request(path: str = "/test", method: str = "GET", headers: dict[str, str] | None = None) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "query_string": b"",
        "headers": [(k.lower().encode(), str(v).encode()) for k, v in (headers or {}).items()],
        "client": ("127.0.0.1", 54321),
        "server": ("testserver", 8000),
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_request_context_middleware_sets_security_headers():
    async def call_next(request):
        return JSONResponse({"ok": True})

    request = _request(headers={"x-request-id": "abc"})
    response = await main.request_context_middleware(request, call_next)
    assert response.headers["x-request-id"] == "abc"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


@pytest.mark.asyncio
async def test_http_exception_handler_formats_payload():
    request = _request("/boom")
    response = await main.http_exception_handler(request, HTTPException(status_code=404, detail="Missing"))
    assert response.status_code == 404
    assert b'"error":"Missing"' in response.body.replace(b" ", b"")


@pytest.mark.asyncio
async def test_validation_exception_handler_formats_payload():
    request = _request("/validation")
    exc = RequestValidationError([{"loc": ("body", "field"), "msg": "bad", "type": "value_error"}])
    response = await main.validation_exception_handler(request, exc)
    assert response.status_code == 422
    assert b'Validation error' in response.body


@pytest.mark.asyncio
async def test_rate_limit_exception_handler_formats_payload():
    request = _request("/limit")
    exc = RateLimitExceeded(
        Limit(parse("10/minute"), lambda *_: "key", None, False, None, None, None, 1, False)
    )
    response = await main.rate_limit_exception_handler(request, exc)
    assert response.status_code == 429
    assert b'Rate limit exceeded' in response.body


@pytest.mark.asyncio
async def test_unexpected_exception_handler_formats_payload():
    request = _request("/error")
    response = await main.unexpected_exception_handler(request, RuntimeError("boom"))
    assert response.status_code == 500
    assert b'Internal server error' in response.body
