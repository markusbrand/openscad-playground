"""API-key management endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.schemas.config import ApiKeyInfo, ApiKeyListResponse, ApiKeySetRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config", tags=["config"])


@router.post("/api-keys")
async def set_api_key(body: ApiKeySetRequest, request: Request) -> dict[str, str]:
    """Store (or update) an API key for the given provider."""
    key_store = request.app.state.key_store
    key_store.set_key(body.provider, body.api_key)
    return {"status": "ok", "provider": body.provider}


@router.get("/api-keys", response_model=ApiKeyListResponse)
async def list_api_keys(request: Request) -> ApiKeyListResponse:
    """List configured providers with masked keys."""
    key_store = request.app.state.key_store
    items = [ApiKeyInfo(**entry) for entry in key_store.list_providers()]
    return ApiKeyListResponse(keys=items)


@router.delete("/api-keys/{provider}")
async def delete_api_key(provider: str, request: Request) -> dict[str, str]:
    """Remove the stored API key for *provider*."""
    key_store = request.app.state.key_store
    if not key_store.delete_key(provider):
        raise HTTPException(status_code=404, detail=f"No key found for provider '{provider}'")
    return {"status": "ok", "provider": provider}
