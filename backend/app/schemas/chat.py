"""Pydantic models for chat endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FileAttachment(BaseModel):
    name: str
    content_type: str
    data_base64: str


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str
    files: list[FileAttachment] | None = None


class StreamEvent(BaseModel):
    token: str = ""
    done: bool = False
    full_response: str | None = None
    code: str | None = None


class AutodebugRequest(BaseModel):
    code: str
    errors: str
    model: str
    attempt: int = 1


class AutodebugResponse(BaseModel):
    fixed_code: str
    explanation: str
    confidence: str = Field(..., pattern="^(high|medium|low)$")
