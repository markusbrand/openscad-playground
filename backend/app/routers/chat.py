"""Chat endpoints – streaming SSE and auto-debug."""

from __future__ import annotations

import base64
import binascii
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.schemas.chat import AutodebugRequest, AutodebugResponse, ChatRequest, FileAttachment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MiB per file (decoded binary)

# Declared Content-Type must match extension; browsers often use application/octet-stream for STL/SCAD.
_EXTENSION_ALLOWED_MIMES: dict[str, frozenset[str]] = {
    ".stl": frozenset(
        {
            "model/stl",
            "application/sla",
            "application/vnd.ms-pki.stl",
            "application/octet-stream",
        }
    ),
    ".scad": frozenset(
        {
            "text/plain",
            "application/octet-stream",
            "text/x-openscad",
        }
    ),
    ".png": frozenset({"image/png"}),
    ".jpg": frozenset({"image/jpeg"}),
    ".jpeg": frozenset({"image/jpeg"}),
}


def _sanitize_filename(name: str) -> str:
    """Strip paths and dangerous characters; cap length."""
    base = Path(name).name
    if not base or base in (".", ".."):
        return "attachment"
    forbidden = frozenset('<>:"/\\|?*') | {chr(i) for i in range(32)}
    cleaned = "".join(c if c not in forbidden else "_" for c in base).strip()
    if not cleaned:
        return "attachment"
    if len(cleaned) > 255:
        p = Path(cleaned)
        ext = (p.suffix or "")[:10]
        stem = (p.stem or "file")[:240]
        cleaned = f"{stem}{ext}"
    return cleaned


def _decode_base64_payload(data_b64: str) -> bytes:
    """Decode base64 attachment; reject malformed payloads."""
    s = "".join(data_b64.split())
    pad = (-len(s)) % 4
    if pad:
        s += "=" * pad
    try:
        return base64.b64decode(s, validate=True)
    except binascii.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 file payload") from exc


def _validate_and_normalize_files(files: list[FileAttachment] | None) -> list[FileAttachment] | None:
    """Enforce size, extension, and Content-Type rules; return copies with sanitized names."""
    if not files:
        return files

    normalized: list[FileAttachment] = []
    for attachment in files:
        safe_name = _sanitize_filename(attachment.name)
        suffix = Path(safe_name).suffix.lower()
        if suffix not in _EXTENSION_ALLOWED_MIMES:
            logger.warning(
                "Rejected chat attachment: disallowed extension (sanitized_name=%s)",
                safe_name,
            )
            raise HTTPException(
                status_code=400,
                detail="File type not allowed. Allowed extensions: .stl, .scad, .png, .jpg, .jpeg",
            )

        mime = (attachment.content_type or "").strip().lower()
        allowed_mimes = _EXTENSION_ALLOWED_MIMES[suffix]
        if mime not in allowed_mimes:
            logger.warning(
                "Rejected chat attachment: content_type/extension mismatch "
                "(name=%s ext=%s content_type=%s)",
                safe_name,
                suffix,
                attachment.content_type,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Content-Type {attachment.content_type!r} is not allowed for {suffix} files",
            )

        raw = _decode_base64_payload(attachment.data_base64)
        if len(raw) > MAX_ATTACHMENT_BYTES:
            logger.warning(
                "Rejected chat attachment: exceeds size limit (name=%s bytes=%d)",
                safe_name,
                len(raw),
            )
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum size of {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB",
            )

        normalized.append(
            FileAttachment(
                name=safe_name,
                content_type=mime,
                data_base64=base64.b64encode(raw).decode("ascii"),
            )
        )

    return normalized


@router.post("/stream")
async def stream_chat(body: ChatRequest, request: Request) -> StreamingResponse:
    """Stream LLM response tokens via Server-Sent Events.

    Each SSE event carries a JSON payload:
      - ``{"token": "...", "done": false}`` for incremental tokens
      - ``{"token": "", "done": true, "full_response": "...", "code": "..."}`` for the final event
    """
    llm_service = request.app.state.llm_service
    files = _validate_and_normalize_files(body.files)

    return StreamingResponse(
        llm_service.stream_chat(
            messages=body.messages,
            model=body.model,
            files=files,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/autodebug", response_model=AutodebugResponse)
async def autodebug(body: AutodebugRequest, request: Request) -> AutodebugResponse:
    """Attempt an automated fix for OpenSCAD code that has errors.

    Uses a non-streaming LLM call and returns the fixed code, an
    explanation, and a confidence level.
    """
    llm_service = request.app.state.llm_service

    result = await llm_service.autodebug(
        code=body.code,
        errors=body.errors,
        model=body.model,
        attempt=body.attempt,
    )

    return AutodebugResponse(**result)
