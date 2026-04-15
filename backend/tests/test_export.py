"""Export SCAD endpoint tests."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_export_scad(client) -> None:
    response = await client.post(
        "/api/v1/export/scad",
        json={"code": "cube(10);", "optimize_for_freecad": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert "code" in data
    assert "filename" in data
    assert "cube(10);" in data["code"]


@pytest.mark.asyncio
async def test_export_scad_freecad(client) -> None:
    response = await client.post(
        "/api/v1/export/scad",
        json={"code": "cube(10);", "optimize_for_freecad": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert "code" in data
    code_lower = data["code"].lower()
    assert "freecad" in code_lower or "openscad" in code_lower
    assert "cube(10);" in data["code"]
