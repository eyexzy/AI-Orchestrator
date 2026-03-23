import hashlib
from jose import jwt
from starlette.requests import Request
from dependencies import get_rate_limit_key

def _build_request(*, headers: dict[str, str] | None=None, client_host: str='198.51.100.20') -> Request:
    encoded_headers = [(key.lower().encode('latin-1'), value.encode('latin-1')) for key, value in (headers or {}).items()]
    scope = {'type': 'http', 'http_version': '1.1', 'method': 'POST', 'scheme': 'http', 'path': '/analyze', 'query_string': b'', 'headers': encoded_headers, 'client': (client_host, 54321), 'server': ('testserver', 8000)}
    return Request(scope)

def test_rate_limit_uses_authenticated_user_identity(monkeypatch):
    monkeypatch.setenv('AUTH_SECRET', 'test-secret')
    monkeypatch.setenv('TRUSTED_PROXY_CIDRS', '127.0.0.1/32')
    token = jwt.encode({'email': 'Test.User@example.com'}, 'test-secret', algorithm='HS256')
    request = _build_request(client_host='127.0.0.1', headers={'Authorization': f'Bearer {token}', 'X-Forwarded-For': '203.0.113.9, 10.0.0.4'})
    assert get_rate_limit_key(request) == 'user:test.user@example.com'

def test_rate_limit_trusts_forwarded_for_only_from_trusted_proxy(monkeypatch):
    monkeypatch.setenv('TRUSTED_PROXY_CIDRS', '127.0.0.1/32')
    trusted_request = _build_request(client_host='127.0.0.1', headers={'X-Forwarded-For': '203.0.113.9, 10.0.0.4'})
    untrusted_request = _build_request(client_host='198.51.100.20', headers={'X-Forwarded-For': '203.0.113.9'})
    assert get_rate_limit_key(trusted_request) == 'ip:203.0.113.9'
    assert get_rate_limit_key(untrusted_request) == 'ip:198.51.100.20'

def test_rate_limit_supports_forwarded_header_from_trusted_proxy(monkeypatch):
    monkeypatch.setenv('TRUSTED_PROXY_CIDRS', '10.0.0.0/8')
    request = _build_request(client_host='10.2.3.4', headers={'Forwarded': 'for=203.0.113.10;proto=https;by=10.2.3.4'})
    assert get_rate_limit_key(request) == 'ip:203.0.113.10'

def test_rate_limit_admin_routes_fallback_to_hashed_api_key(monkeypatch):
    monkeypatch.delenv('AUTH_SECRET', raising=False)
    monkeypatch.setenv('ADMIN_API_KEY', 'super-secret-admin-key')
    request = _build_request(client_host='198.51.100.20', headers={'X-Api-Key': 'super-secret-admin-key'})
    expected = hashlib.sha256(b'super-secret-admin-key').hexdigest()[:12]
    assert get_rate_limit_key(request) == f'admin:{expected}'
