"""Chat streaming and autodebug endpoints with mocked LiteLLM."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest


class _Delta:
    def __init__(self, content: str) -> None:
        self.content = content


class _Choice:
    def __init__(self, content: str) -> None:
        self.delta = _Delta(content)


class _StreamChunk:
    def __init__(self, content: str) -> None:
        self.choices = [_Choice(content)]


class _FakeTokenStream:
    """Async iterator yielding one chunk then stops."""

    def __init__(self, contents: list[str]) -> None:
        self._contents = contents
        self._i = 0

    def __aiter__(self) -> _FakeTokenStream:
        return self

    async def __anext__(self) -> _StreamChunk:
        if self._i >= len(self._contents):
            raise StopAsyncIteration
        c = self._contents[self._i]
        self._i += 1
        return _StreamChunk(c)


class _FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = _FakeMessage(content)


class _FakeCompletion:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(content)]


@pytest.mark.asyncio
async def test_stream_chat_sse_format(client) -> None:
    async def fake_acompletion(*args, **kwargs):
        assert kwargs.get("stream") is True
        return _FakeTokenStream(["hello"])

    with patch("app.services.llm_service.litellm.acompletion", side_effect=fake_acompletion):
        response = await client.post(
            "/api/v1/chat/stream",
            json={
                "messages": [{"role": "user", "content": "draw a cube"}],
                "model": "openai/gpt-4o-mini",
            },
        )

    assert response.status_code == 200
    assert "event-stream" in response.headers.get("content-type", "")
    lines = [ln for ln in response.text.splitlines() if ln.startswith("data: ")]
    payloads = [json.loads(ln.removeprefix("data: ")) for ln in lines]
    assert any(p.get("token") == "hello" and p.get("done") is False for p in payloads)
    done_events = [p for p in payloads if p.get("done") is True]
    assert len(done_events) == 1
    assert "full_response" in done_events[0]
    assert done_events[0]["full_response"] == "hello"


@pytest.mark.asyncio
async def test_stream_chat_llm_error_sse(client) -> None:
    async def failing(*args, **kwargs):
        raise RuntimeError("Bad model or missing API key")

    with patch("app.services.llm_service.litellm.acompletion", side_effect=failing):
        response = await client.post(
            "/api/v1/chat/stream",
            json={
                "messages": [{"role": "user", "content": "x"}],
                "model": "openai/invalid-model-name",
            },
        )

    assert response.status_code == 200
    assert "error" in response.text
    lines = [ln for ln in response.text.splitlines() if ln.startswith("data: ")]
    err_payload = json.loads(lines[-1].removeprefix("data: "))
    assert err_payload.get("done") is True
    assert "error" in err_payload


@pytest.mark.asyncio
async def test_autodebug_extracts_openscad_block(client) -> None:
    llm_body = (
        "Here is the fix.\n```openscad\n"
        "cube([2, 2, 2]);\n"
        "```\n"
        "Removed typo.\n"
        "Confidence: high\n"
    )

    async def fake_acompletion(*args, **kwargs):
        assert kwargs.get("stream") is not True
        return _FakeCompletion(llm_body)

    with patch("app.services.llm_service.litellm.acompletion", side_effect=fake_acompletion):
        response = await client.post(
            "/api/v1/chat/autodebug",
            json={
                "code": "cub(1);",
                "errors": "Parser error",
                "model": "openai/gpt-4o-mini",
                "attempt": 1,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["fixed_code"].strip() == "cube([2, 2, 2]);"
    assert body["confidence"] == "high"


@pytest.mark.asyncio
async def test_autodebug_llm_failure_returns_fallback(client) -> None:
    async def failing(*args, **kwargs):
        raise RuntimeError("unavailable")

    with patch("app.services.llm_service.litellm.acompletion", side_effect=failing):
        response = await client.post(
            "/api/v1/chat/autodebug",
            json={
                "code": "sphere(5);",
                "errors": "x",
                "model": "openai/gpt-4o-mini",
                "attempt": 1,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["fixed_code"] == "sphere(5);"
    assert "Auto-debug failed" in body["explanation"]
    assert body["confidence"] == "low"
