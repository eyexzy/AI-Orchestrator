import pytest
import asyncio

from services.cache import CacheService, InMemoryCacheBackend


@pytest.mark.asyncio
async def test_memory_cache_backend_round_trip():
    backend = InMemoryCacheBackend()
    await backend.set("a", "1", 60)
    assert await backend.get("a") == "1"
    await backend.delete_many(["a"])
    assert await backend.get("a") is None


@pytest.mark.asyncio
async def test_cache_service_get_or_set_json():
    cache = CacheService()
    calls = {"count": 0}

    async def factory():
        calls["count"] += 1
        return {"ok": True}

    first = await cache.get_or_set_json("k", 60, factory)
    second = await cache.get_or_set_json("k", 60, factory)
    assert first == {"ok": True}
    assert second == {"ok": True}
    assert calls["count"] == 1
    await cache.close()


@pytest.mark.asyncio
async def test_cache_service_get_or_set_json_singleflight_under_concurrency():
    cache = CacheService()
    calls = {"count": 0}

    async def factory():
        calls["count"] += 1
        await asyncio.sleep(0.05)
        return {"ok": True}

    results = await asyncio.gather(
        *[cache.get_or_set_json("shared", 60, factory) for _ in range(12)]
    )

    assert all(item == {"ok": True} for item in results)
    assert calls["count"] == 1
    await cache.close()
