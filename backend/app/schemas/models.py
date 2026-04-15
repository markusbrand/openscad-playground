"""Pydantic models for the models endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    description: str = ""
    supports_vision: bool = False
    license_info: str = ""
    pricing_tier: str = "free"
    is_local: bool = False
