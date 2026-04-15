"""Model catalog endpoint tests."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_models(client) -> None:
    response = await client.get("/api/v1/models")
    assert response.status_code == 200
    models = response.json()
    assert isinstance(models, list)
    assert len(models) > 0
    for model in models:
        assert "id" in model
        assert "name" in model
        assert "provider" in model
