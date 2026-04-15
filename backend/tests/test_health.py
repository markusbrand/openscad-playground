"""Health endpoint and startup (lifespan) checks."""

from __future__ import annotations

import pytest

from app.main import app


@pytest.mark.asyncio
async def test_health(client) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.asyncio
async def test_master_prompt_loaded_after_lifespan(client) -> None:
    """Lifespan must load prompts/master-prompt.md so chat has system context."""
    _ = client  # lifespan runs when the client session starts
    prompt = app.state.llm_service.master_prompt
    assert isinstance(prompt, str)
    assert len(prompt) > 0
