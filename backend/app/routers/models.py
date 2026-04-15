"""Model catalog endpoint – hardcoded entries plus dynamic Ollama discovery."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from app.config import settings
from app.schemas.models import ModelInfo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["models"])

KNOWN_MODELS: list[ModelInfo] = [
    ModelInfo(
        id="gemini/gemini-2.5-flash-preview-04-17",
        name="Gemini 2.5 Flash (Preview)",
        provider="gemini",
        description="Google's fast & capable multimodal model",
        supports_vision=True,
        license_info="Proprietary – Google",
        pricing_tier="free-tier available",
    ),
    ModelInfo(
        id="gemini/gemini-2.5-pro-preview-03-25",
        name="Gemini 2.5 Pro (Preview)",
        provider="gemini",
        description="Google's most capable reasoning model",
        supports_vision=True,
        license_info="Proprietary – Google",
        pricing_tier="paid",
    ),
    ModelInfo(
        id="openai/gpt-4o",
        name="GPT-4o",
        provider="openai",
        description="OpenAI's flagship multimodal model",
        supports_vision=True,
        license_info="Proprietary – OpenAI",
        pricing_tier="paid",
    ),
    ModelInfo(
        id="openai/gpt-4o-mini",
        name="GPT-4o Mini",
        provider="openai",
        description="Fast and affordable OpenAI model",
        supports_vision=True,
        license_info="Proprietary – OpenAI",
        pricing_tier="paid",
    ),
    ModelInfo(
        id="anthropic/claude-sonnet-4-20250514",
        name="Claude Sonnet 4",
        provider="anthropic",
        description="Anthropic's balanced performance model",
        supports_vision=True,
        license_info="Proprietary – Anthropic",
        pricing_tier="paid",
    ),
    ModelInfo(
        id="mistral/mistral-large-latest",
        name="Mistral Large",
        provider="mistral",
        description="Mistral's flagship model",
        supports_vision=False,
        license_info="Proprietary – Mistral AI",
        pricing_tier="paid",
    ),
]


async def _discover_ollama_models() -> list[ModelInfo]:
    """Query the local Ollama API for available models."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()

        models: list[ModelInfo] = []
        for m in data.get("models", []):
            name = m.get("name", "unknown")
            models.append(
                ModelInfo(
                    id=f"ollama/{name}",
                    name=name,
                    provider="ollama",
                    description=f"Local Ollama model – {name}",
                    supports_vision="llava" in name.lower() or "vision" in name.lower(),
                    license_info="See model card",
                    pricing_tier="free",
                    is_local=True,
                )
            )
        return models
    except Exception:
        logger.debug("Ollama not reachable at %s – skipping local models", settings.ollama_base_url)
        return []


@router.get("/models", response_model=list[ModelInfo])
async def list_models() -> list[ModelInfo]:
    """Return the full model catalog (hardcoded + Ollama)."""
    ollama_models = await _discover_ollama_models()
    return KNOWN_MODELS + ollama_models
