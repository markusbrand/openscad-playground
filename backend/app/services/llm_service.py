"""LLM interaction layer built on top of LiteLLM."""

from __future__ import annotations

import json
import logging
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
    r"```(?:openscad)?\s*\n(.*?)```", re.DOTALL
)


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
        full_response = ""

        try:
            response = await litellm.acompletion(
                model=model,
                messages=litellm_messages,
                stream=True,
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

        except Exception as exc:
            logger.exception("LLM streaming error for model=%s", model)
            yield self._sse({"error": str(exc), "done": True})

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
            "The following OpenSCAD code produces errors. Fix the code and return:\n"
            "1. The corrected, complete OpenSCAD code inside a ```openscad code block.\n"
            "2. A short explanation of what was wrong.\n"
            "3. Your confidence: high, medium, or low.\n\n"
            f"--- Code ---\n{code}\n\n"
            f"--- Errors ---\n{errors}\n"
        )

        messages = [
            {"role": "system", "content": self._master_prompt},
            {"role": "user", "content": prompt},
        ]

        try:
            response = await litellm.acompletion(model=model, messages=messages)
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
            logger.exception("Auto-debug error for model=%s attempt=%d", model, attempt)
            return {
                "fixed_code": code,
                "explanation": f"Auto-debug failed: {exc}",
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

    @staticmethod
    def _extract_openscad_code(text: str) -> str | None:
        match = OPENSCAD_CODE_BLOCK_RE.search(text)
        return match.group(1).strip() if match else None

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
