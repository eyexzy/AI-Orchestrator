import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, TypeVar

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover - optional dependency at runtime
    Redis = None

logger = logging.getLogger("ai-orchestrator")
T = TypeVar("T")


@dataclass
class MemoryCacheEntry:
    value: str
    expires_at: float


class InMemoryCacheBackend:
    def __init__(self):
        self._entries: dict[str, MemoryCacheEntry] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= time.monotonic():
                self._entries.pop(key, None)
                return None
            return entry.value

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        async with self._lock:
            self._entries[key] = MemoryCacheEntry(
                value=value,
                expires_at=time.monotonic() + ttl_seconds,
            )

    async def delete_many(self, keys: list[str]) -> None:
        async with self._lock:
            for key in keys:
                self._entries.pop(key, None)

    async def close(self) -> None:
        async with self._lock:
            self._entries.clear()


class RedisCacheBackend:
    def __init__(self, redis_url: str):
        if Redis is None:
            raise RuntimeError("redis package is not installed")
        self.client = Redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
        )

    async def ping(self) -> None:
        await self.client.ping()

    async def get(self, key: str) -> str | None:
        return await self.client.get(key)

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        await self.client.set(name=key, value=value, ex=ttl_seconds)

    async def delete_many(self, keys: list[str]) -> None:
        if not keys:
            return
        await self.client.delete(*keys)

    async def close(self) -> None:
        await self.client.aclose()


class CacheService:
    def __init__(self):
        self.backend: InMemoryCacheBackend | RedisCacheBackend = InMemoryCacheBackend()
        self.backend_name = "memory"
        self.redis_url = os.getenv("REDIS_URL", "").strip()

    async def initialize(self) -> None:
        if self.redis_url and Redis is not None:
            try:
                redis_backend = RedisCacheBackend(self.redis_url)
                await redis_backend.ping()
                self.backend = redis_backend
                self.backend_name = "redis"
                logger.info(
                    "[cache] initialized",
                    extra={"backend": self.backend_name},
                )
                return
            except Exception as exc:
                logger.warning(
                    "[cache] redis_unavailable_fallback_to_memory",
                    extra={"error": str(exc)},
                )
        elif self.redis_url and Redis is None:
            logger.warning("[cache] redis_url_configured_but_dependency_missing")

        self.backend = InMemoryCacheBackend()
        self.backend_name = "memory"
        logger.info(
            "[cache] initialized",
            extra={"backend": self.backend_name},
        )

    async def close(self) -> None:
        await self.backend.close()

    async def get_json(self, key: str):
        raw = await self.backend.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def set_json(self, key: str, value, ttl_seconds: int) -> None:
        await self.backend.set(
            key,
            json.dumps(value, ensure_ascii=False),
            ttl_seconds,
        )

    async def delete_many(self, keys: list[str]) -> None:
        await self.backend.delete_many(keys)

    async def get_or_set_json(
        self,
        key: str,
        ttl_seconds: int,
        factory: Callable[[], Awaitable[T]],
    ) -> T:
        cached_value = await self.get_json(key)
        if cached_value is not None:
            return cached_value

        fresh_value = await factory()
        await self.set_json(key, fresh_value, ttl_seconds)
        return fresh_value


cache = CacheService()