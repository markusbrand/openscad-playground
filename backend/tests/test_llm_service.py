"""LLMService helpers (code extraction, master prompt loading)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.llm_service import LLMService


def test_extract_openscad_code_from_fence() -> None:
    svc = LLMService(master_prompt_path=Path("/nonexistent"))
    text = "Intro\n```openscad\ncylinder(r=1, h=4);\n```\nDone"
    code = svc._extract_openscad_code(text)
    assert code == "cylinder(r=1, h=4);"


def test_extract_openscad_code_plain_fence() -> None:
    svc = LLMService(master_prompt_path=Path("/nonexistent"))
    text = "```\nunion() { cube(1); }\n```"
    code = svc._extract_openscad_code(text)
    assert "union()" in code


def test_extract_openscad_code_no_fence() -> None:
    svc = LLMService(master_prompt_path=Path("/nonexistent"))
    assert svc._extract_openscad_code("no code block") is None


def test_load_master_prompt_when_file_exists(tmp_path) -> None:
    p = tmp_path / "prompt.md"
    p.write_text("You are a test system prompt.\n", encoding="utf-8")
    svc = LLMService(master_prompt_path=p)
    assert "test system prompt" in svc.master_prompt


def test_sse_line_format() -> None:
    line = LLMService._sse({"token": "a", "done": False})
    assert line.startswith("data: ")
    assert line.endswith("\n\n")
