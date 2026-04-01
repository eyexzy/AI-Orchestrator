import pytest

import database


def test_prefer_ipv4_addrinfo_returns_ipv4_rows_first():
    rows = [
        (database.socket.AF_INET6, 1, 0, "", ("::1", 5432, 0, 0)),
        (database.socket.AF_INET, 1, 0, "", ("127.0.0.1", 5432)),
    ]

    preferred = database._prefer_ipv4_addrinfo(rows)

    assert preferred == [(database.socket.AF_INET, 1, 0, "", ("127.0.0.1", 5432))]


@pytest.mark.asyncio
async def test_init_db_retries_until_success(monkeypatch):
    attempts = {"count": 0}
    original_ready = database.DB_READY

    async def fake_check():
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise TimeoutError()

    monkeypatch.setattr(database, "_check_db_connection", fake_check)

    try:
        ready = await database.init_db(startup_retries=3, retry_delay_seconds=0.0)
        assert ready is True
        assert attempts["count"] == 3
        assert database.DB_READY is True
    finally:
        database.DB_READY = original_ready


@pytest.mark.asyncio
async def test_init_db_returns_false_after_retry_budget(monkeypatch):
    original_ready = database.DB_READY

    async def fail_check():
        raise TimeoutError()

    monkeypatch.setattr(database, "_check_db_connection", fail_check)

    try:
        ready = await database.init_db(startup_retries=2, retry_delay_seconds=0.0)
        assert ready is False
        assert database.DB_READY is False
    finally:
        database.DB_READY = original_ready
