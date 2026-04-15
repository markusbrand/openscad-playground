"""API key configuration endpoint tests."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_api_keys_empty(client) -> None:
    response = await client.get("/api/v1/config/api-keys")
    assert response.status_code == 200
    data = response.json()
    assert "keys" in data
    assert data["keys"] == []


@pytest.mark.asyncio
async def test_set_and_get_api_key_masked(client) -> None:
    response = await client.post(
        "/api/v1/config/api-keys",
        json={"provider": "test_provider", "api_key": "test_key_12345678"},
    )
    assert response.status_code == 200

    response = await client.get("/api/v1/config/api-keys")
    assert response.status_code == 200
    data = response.json()
    keys = data["keys"]
    test_entry = next((k for k in keys if k["provider"] == "test_provider"), None)
    assert test_entry is not None
    assert "test_key_12345678" not in test_entry.get("masked_key", "")


@pytest.mark.asyncio
async def test_delete_api_key(client) -> None:
    await client.post(
        "/api/v1/config/api-keys",
        json={"provider": "deleteme", "api_key": "secretsecretsecret"},
    )
    del_resp = await client.delete("/api/v1/config/api-keys/deleteme")
    assert del_resp.status_code == 200

    listed = (await client.get("/api/v1/config/api-keys")).json()["keys"]
    assert not any(k["provider"] == "deleteme" for k in listed)

    missing = await client.delete("/api/v1/config/api-keys/deleteme")
    assert missing.status_code == 404
