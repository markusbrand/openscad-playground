"""Pydantic models for the export endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ExportScadRequest(BaseModel):
    code: str
    optimize_for_freecad: bool = False


class ExportScadResponse(BaseModel):
    code: str
    filename: str
