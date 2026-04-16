"""Health-check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["health"])

APP_VERSION = "1.0.0"


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Return service health status and version."""
    return {"status": "ok", "version": APP_VERSION}
