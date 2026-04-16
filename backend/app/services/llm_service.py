"""LLM interaction layer built on top of LiteLLM."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import litellm

from app.schemas.chat import ChatMessage, FileAttachment

logger = logging.getLogger(__name__)

# Suppress noisy litellm debug output unless we explicitly want it
litellm.suppress_debug_info = True

OPENSCAD_CODE_BLOCK_RE = re.compile(
    r"```\s*(?:openscad|scad)\s*\n?(.*?)```",
    re.DOTALL | re.IGNORECASE,
)
# Optional legacy: ``` with no language tag but same structure
BARE_TRIPLE_FENCE_RE = re.compile(r"```\s*\n(.*?)```", re.DOTALL)
# Generic ```lang … ``` — used when the model picks another fence label
GENERIC_CODE_FENCE_RE = re.compile(
    r"```[a-zA-Z0-9_-]*\s*\n(.*?)```",
    re.DOTALL,
)

# LiteLLM env var names per provider (same as KeyStore.PROVIDER_ENV_MAP)
_LITELLM_API_KEY_ENV: dict[str, str] = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}

# Transient provider errors (503/429/…) often clear after backoff; tune here.
_LLM_TRANSIENT_MAX_ATTEMPTS = 7
_LLM_TRANSIENT_BACKOFF_INITIAL_SEC = 2.0
_LLM_TRANSIENT_BACKOFF_MAX_SEC = 24.0


class LLMService:
    """High-level wrapper around LiteLLM for chat streaming and auto-debug."""

    def __init__(self, master_prompt_path: Path | str) -> None:
        self._master_prompt: str = ""
        self.load_master_prompt(master_prompt_path)

    # ------------------------------------------------------------------
    # Master prompt
    # ------------------------------------------------------------------

    def load_master_prompt(self, path: Path | str) -> None:
        p = Path(path)
        if p.exists():
            self._master_prompt = p.read_text(encoding="utf-8")
            logger.info("Master prompt loaded (%d chars) from %s", len(self._master_prompt), p)
        else:
            logger.warning("Master prompt file not found at %s – using empty prompt", p)

    @property
    def master_prompt(self) -> str:
        return self._master_prompt

    # ------------------------------------------------------------------
    # Streaming chat
    # ------------------------------------------------------------------

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
        files: list[FileAttachment] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted events for a streaming chat completion."""
        litellm_messages = self._build_messages(messages, model, files)
        max_stream_attempts = _LLM_TRANSIENT_MAX_ATTEMPTS
        delay_sec = _LLM_TRANSIENT_BACKOFF_INITIAL_SEC

        for stream_attempt in range(max_stream_attempts):
            full_response = ""
            try:
                response = await litellm.acompletion(
                    model=model,
                    messages=litellm_messages,
                    stream=True,
                    **self._litellm_auth_kwargs(model),
                )

                async for chunk in response:
                    delta = chunk.choices[0].delta  # type: ignore[union-attr]
                    token = getattr(delta, "content", None) or ""
                    if token:
                        full_response += token
                        yield self._sse({"token": token, "done": False})

                code = self._extract_openscad_code(full_response)
                final_payload: dict[str, Any] = {
                    "token": "",
                    "done": True,
                    "full_response": full_response,
                }
                if code:
                    final_payload["code"] = code

                yield self._sse(final_payload)
                return

            except Exception as exc:
                partial = bool(full_response.strip())
                transient = self._is_transient_llm_error(exc)
                if (
                    not partial
                    and transient
                    and stream_attempt < max_stream_attempts - 1
                ):
                    logger.warning(
                        "LLM transient error (stream attempt %d/%d) model=%s: %s — retrying in %.1fs",
                        stream_attempt + 1,
                        max_stream_attempts,
                        model,
                        type(exc).__name__,
                        delay_sec,
                    )
                    await asyncio.sleep(delay_sec)
                    delay_sec = min(delay_sec * 2, _LLM_TRANSIENT_BACKOFF_MAX_SEC)
                    continue

                logger.exception("LLM streaming error for model=%s", model)
                yield self._sse({"error": self._format_llm_error(exc, model), "done": True})
                return

    # ------------------------------------------------------------------
    # Auto-debug (non-streaming)
    # ------------------------------------------------------------------

    async def autodebug(
        self,
        code: str,
        errors: str,
        model: str,
        attempt: int = 1,
    ) -> dict[str, str]:
        """Send code + errors to the LLM for an automated fix attempt."""
        prompt = (
            f"You are an OpenSCAD debugging assistant (attempt {attempt}).\n\n"
            "The script below fails to compile or preview in OpenSCAD. Fix it and respond with:\n"
            "1. One short paragraph (outside any code fence) describing what was wrong.\n"
            "2. A line with confidence: high, medium, or low.\n"
            "3. The **complete corrected** OpenSCAD program in a **single** ```openscad fenced block.\n\n"
            "Constraints:\n"
            "- Prefer the **smallest change** that fixes the reported errors; keep modules, names, and comments "
            "unless they are wrong.\n"
            "- If the log shows **Parser error** or **syntax error** at a line number, fix that exact spot first "
            "(missing `;`, mismatched `()`/`{}`/`[]`, stray commas, invalid identifiers, or text outside comments).\n"
            "- Ignore secondary **FS / .off read** errors when a parser error is present — they disappear once the script compiles.\n"
            "- The fenced block must be valid OpenSCAD only (no markdown, no prose inside the fence).\n"
            "- Do not return a partial file or a diff; return the full script.\n\n"
            f"--- Code ---\n{code}\n\n"
            f"--- Errors / logs ---\n{errors}\n"
        )

        messages = [
            {"role": "system", "content": self._master_prompt},
            {"role": "user", "content": prompt},
        ]

        max_attempts = _LLM_TRANSIENT_MAX_ATTEMPTS
        delay_sec = _LLM_TRANSIENT_BACKOFF_INITIAL_SEC
        for call_attempt in range(max_attempts):
            try:
                response = await litellm.acompletion(
                    model=model,
                    messages=messages,
                    **self._litellm_auth_kwargs(model),
                )
                content: str = response.choices[0].message.content or ""  # type: ignore[union-attr]

                fixed_code = self._extract_openscad_code(content) or content
                explanation = self._extract_explanation(content, fixed_code)
                confidence = self._extract_confidence(content)

                return {
                    "fixed_code": fixed_code,
                    "explanation": explanation,
                    "confidence": confidence,
                }
            except Exception as exc:
                transient = self._is_transient_llm_error(exc)
                if transient and call_attempt < max_attempts - 1:
                    logger.warning(
                        "LLM transient error (autodebug attempt %d/%d) model=%s: %s — retrying in %.1fs",
                        call_attempt + 1,
                        max_attempts,
                        model,
                        type(exc).__name__,
                        delay_sec,
                    )
                    await asyncio.sleep(delay_sec)
                    delay_sec = min(delay_sec * 2, _LLM_TRANSIENT_BACKOFF_MAX_SEC)
                    continue
                logger.exception("Auto-debug error for model=%s attempt=%d", model, attempt)
                return {
                    "fixed_code": code,
                    "explanation": f"Auto-debug failed: {self._format_llm_error(exc, model)}",
                    "confidence": "low",
                }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        messages: list[ChatMessage],
        model: str,
        files: list[FileAttachment] | None,
    ) -> list[dict[str, Any]]:
        """Prepare the full message list for LiteLLM."""
        result: list[dict[str, Any]] = []

        if self._master_prompt:
            result.append({"role": "system", "content": self._master_prompt})

        for msg in messages:
            entry: dict[str, Any] = {"role": msg.role, "content": msg.content}
            result.append(entry)

        if files:
            self._attach_files(result, files)

        return result

    @staticmethod
    def _attach_files(messages: list[dict[str, Any]], files: list[FileAttachment]) -> None:
        """Attach image files as base64 content parts to the last user message."""
        image_parts: list[dict[str, Any]] = []
        for f in files:
            if f.content_type.startswith("image/"):
                image_parts.append(
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{f.content_type};base64,{f.data_base64}"
                        },
                    }
                )

        if not image_parts:
            return

        for msg in reversed(messages):
            if msg["role"] == "user":
                text_content = msg["content"]
                msg["content"] = [
                    {"type": "text", "text": text_content},
                    *image_parts,
                ]
                break

    _SCAD_MARKERS: tuple[str, ...] = (
        "module ",
        "difference(",
        "union(",
        "intersection(",
        "translate(",
        "rotate(",
        "scale(",
        "linear_extrude",
        "rotate_extrude",
        "hull(",
        "minkowski(",
        "cube(",
        "sphere(",
        "cylinder(",
        "polygon(",
        "polyhedron(",
        "circle(",
        "square(",
        "text(",
        "$fn",
        "$fa",
        "$fs",
        "include <",
        "use <",
    )

    @classmethod
    def _scad_marker_hits(cls, text: str) -> int:
        lower = text.lower()
        return sum(1 for m in cls._SCAD_MARKERS if m in lower)

    @classmethod
    def _looks_like_openscad_source(cls, text: str) -> bool:
        """Heuristic: fenced or raw body is plausibly OpenSCAD (works for small models)."""
        t = text.strip()
        if len(t) < 20 or "```" in t:
            return False
        n = cls._scad_marker_hits(t)
        if n >= 2:
            return True
        if n >= 1 and len(t) >= 35:
            return True
        return False

    @classmethod
    def _extract_openscad_code(cls, text: str) -> str | None:
        """Extract OpenSCAD from fenced blocks, generic fences, or raw SCAD-only replies."""
        if not (text and text.strip()):
            return None
        labeled_bodies = [m.group(1).strip() for m in OPENSCAD_CODE_BLOCK_RE.finditer(text) if m.group(1).strip()]
        if labeled_bodies:
            return max(labeled_bodies, key=len)
        bare_bodies = [m.group(1).strip() for m in BARE_TRIPLE_FENCE_RE.finditer(text) if m.group(1).strip()]
        for body in sorted(bare_bodies, key=len, reverse=True):
            if cls._looks_like_openscad_source(body):
                return body
        generic_hits: list[str] = []
        for m in GENERIC_CODE_FENCE_RE.finditer(text):
            body = m.group(1).strip()
            if cls._looks_like_openscad_source(body):
                generic_hits.append(body)
        if generic_hits:
            return max(generic_hits, key=len)
        stripped = text.strip()
        if "```" not in stripped:
            blocks = [b.strip() for b in re.split(r"\n{2,}", stripped) if b.strip()]
            code_blocks = [b for b in blocks if cls._looks_like_openscad_source(b)]
            if code_blocks:
                return max(code_blocks, key=len)
        if cls._looks_like_openscad_source(stripped):
            return stripped
        return None

    @staticmethod
    def _extract_explanation(full_text: str, code: str) -> str:
        cleaned = full_text.replace(code, "").strip()
        cleaned = re.sub(r"```(?:openscad)?\s*```", "", cleaned).strip()
        return cleaned[:500] if cleaned else "Code was adjusted."

    @staticmethod
    def _extract_confidence(text: str) -> str:
        lower = text.lower()
        if "high" in lower:
            return "high"
        if "medium" in lower:
            return "medium"
        return "low"

    @staticmethod
    def _sse(data: dict[str, Any]) -> str:
        return f"data: {json.dumps(data)}\n\n"

    @staticmethod
    def _provider_prefix(model: str) -> str:
        return model.split("/", 1)[0].lower() if "/" in model else ""

    @classmethod
    def _litellm_auth_kwargs(cls, model: str) -> dict[str, Any]:
        """Pass API keys explicitly so LiteLLM uses AI Studio / provider keys predictably."""
        prefix = cls._provider_prefix(model)
        env_name = _LITELLM_API_KEY_ENV.get(prefix)
        if not env_name:
            return {}
        key = os.getenv(env_name)
        if not key:
            return {}
        return {"api_key": key}

    @staticmethod
    def _http_status_from_exception(exc: BaseException) -> int | None:
        """Best-effort HTTP status from LiteLLM / httpx / OpenAI-style wrappers."""
        code = getattr(exc, "status_code", None)
        if isinstance(code, int):
            return code
        resp = getattr(exc, "response", None)
        if resp is not None:
            sc = getattr(resp, "status_code", None)
            if isinstance(sc, int):
                return sc
        # Some clients nest the original error
        cause = getattr(exc, "__cause__", None)
        if isinstance(cause, BaseException):
            nested = LLMService._http_status_from_exception(cause)
            if nested is not None:
                return nested
        return None

    @classmethod
    def _is_transient_llm_error(cls, exc: Exception) -> bool:
        """True for provider overload / capacity errors that often succeed on retry."""
        status = cls._http_status_from_exception(exc)
        if status in (408, 429, 500, 502, 503, 504):
            return True
        raw = str(exc).lower()
        return any(
            marker in raw
            for marker in (
                "503",
                "504",
                "429",
                "502",
                "500",
                "unavailable",
                "resource_exhausted",
                "high demand",
                "try again later",
                "overloaded",
                "deadline exceeded",
                "serviceunavailable",
                "midstreamfallbackerror",
                "rate limit",
                "ratelimit",
                "too many requests",
                "temporar",
                "capacity",
                "throttl",
            )
        )

    @staticmethod
    def _format_llm_error(exc: Exception, model: str) -> str:
        """Turn long provider tracebacks into short, actionable messages where possible."""
        raw = str(exc)
        m = model.lower()
        if LLMService._is_transient_llm_error(exc):
            return (
                "The model provider stayed overloaded or rate-limited after automatic retries "
                f"(up to {_LLM_TRANSIENT_MAX_ATTEMPTS} attempts with backoff). "
                "Wait a few minutes and send your message again, "
                "or choose another model in the dropdown (e.g. a different Gemini tier or OpenAI / Ollama)."
            )
        if m.startswith("gemini/") and (
            "API_KEY_INVALID" in raw
            or "API key not valid" in raw
            or "invalid api key" in raw.lower()
            or "AuthenticationError" in raw
        ):
            return (
                "Gemini API key was rejected by Google (wrong key, revoked, or not an AI Studio key). "
                "Create a key at https://aistudio.google.com/apikey (starts with AIza…). "
                "Put it in backend/.env as GEMINI_API_KEY=… (no quotes) or save under Settings → Gemini. "
                "Restart the API after changing .env. If you still use a valid .env key, remove any stale "
                "Gemini key in Settings and save again, or delete backend/data/api_keys.json while the server is stopped."
            )
        if len(raw) > 2000:
            return raw[:2000] + "\n…(truncated)"
        return raw
