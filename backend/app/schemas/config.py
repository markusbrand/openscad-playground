"""Pydantic models for the API-key configuration endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class ApiKeySetRequest(BaseModel):
    provider: str
    api_key: str


class ApiKeyInfo(BaseModel):
    provider: str
    masked_key: str


class ApiKeyListResponse(BaseModel):
    keys: list[ApiKeyInfo]
