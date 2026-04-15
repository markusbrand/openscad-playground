"""CORS middleware behaviour."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_cors_reflects_allowed_origin(client) -> None:
    response = await client.get(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
