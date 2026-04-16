"""Shared pytest fixtures for the FastAPI app."""

from __future__ import annotations

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app


@pytest.fixture
async def client(tmp_path, monkeypatch):
    """HTTP client with ASGI transport, full lifespan, isolated API key file."""
    keys_path = tmp_path / "api_keys.json"
    monkeypatch.setattr(settings, "api_keys_file", str(keys_path))
    # httpx.ASGITransport has no lifespan=…; drive ASGI lifespan explicitly (same as Starlette TestClient).
    async with LifespanManager(app) as manager:
        transport = ASGITransport(app=manager.app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
