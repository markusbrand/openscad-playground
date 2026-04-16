"""FastAPI application entry-point for the OpenSCAD AI Backend."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, config_api, export, health, models
from app.services.export_service import ExportService
from app.services.key_store import KeyStore
from app.services.llm_service import LLMService


def _configure_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle hook."""
    _configure_logging()
    logger = logging.getLogger(__name__)

    # Seed env vars from .env settings so LiteLLM can pick them up
    _seed_env_keys()

    logger.info("Initialising services …")
    app.state.key_store = KeyStore(keys_file=str(settings.api_keys_path))
    # Keys saved in the UI are written to api_keys.json and applied to os.environ first.
    # If the same provider is set in backend/.env, .env must win (fixes stale/wrong UI keys).
    _enforce_settings_api_keys_over_key_store()

    app.state.llm_service = LLMService(master_prompt_path=settings.master_prompt_resolved)
    app.state.export_service = ExportService()
    logger.info("OpenSCAD AI Backend ready")

    yield  # ── application runs ──

    logger.info("Shutting down OpenSCAD AI Backend")


def _seed_env_keys() -> None:
    """Push any API keys present in settings into os.environ for LiteLLM."""
    for env_var, value in _settings_api_key_pairs():
        if value:
            os.environ.setdefault(env_var, value)


def _settings_api_key_pairs() -> list[tuple[str, str | None]]:
    return [
        ("GEMINI_API_KEY", settings.gemini_api_key),
        ("OPENAI_API_KEY", settings.openai_api_key),
        ("ANTHROPIC_API_KEY", settings.anthropic_api_key),
        ("MISTRAL_API_KEY", settings.mistral_api_key),
    ]


def _enforce_settings_api_keys_over_key_store() -> None:
    """When backend/.env defines a provider key, it overrides KeyStore (UI) values for LiteLLM."""
    logger = logging.getLogger(__name__)
    applied: list[str] = []
    for env_var, value in _settings_api_key_pairs():
        if value:
            os.environ[env_var] = value
            applied.append(env_var)
    if applied:
        logger.info(
            "API keys from application settings (.env / environment) override KeyStore for: %s",
            ", ".join(applied),
        )


app = FastAPI(
    title="OpenSCAD AI Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting: Add slowapi middleware here for production
# from slowapi import Limiter
# from slowapi.util import get_remote_address
# limiter = Limiter(key_func=get_remote_address)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(models.router, prefix=API_PREFIX)
app.include_router(config_api.router, prefix=API_PREFIX)
app.include_router(export.router, prefix=API_PREFIX)
