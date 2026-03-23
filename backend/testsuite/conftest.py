import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.requests import Request

from database import Base


@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()


@pytest.fixture()
def req():
    def build(path: str = "/", method: str = "POST", headers: dict[str, str] | None = None, client_host: str = "127.0.0.1") -> Request:
        header_items = []
        for key, value in (headers or {}).items():
            header_items.append((key.lower().encode(), str(value).encode()))
        scope = {
            "type": "http",
            "method": method,
            "path": path,
            "headers": header_items,
            "query_string": b"",
            "client": (client_host, 12345),
            "server": ("testserver", 80),
            "scheme": "http",
        }
        return Request(scope)

    return build
