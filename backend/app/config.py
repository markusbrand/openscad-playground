"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Directory that contains `app/` and `data/` (always backend/, regardless of cwd).
BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_ENV = BACKEND_ROOT / ".env"
_ROOT_ENV = BACKEND_ROOT.parent / ".env"


def _resolved_env_files() -> tuple[str, ...] | None:
    """Repo root `.env` first, then `backend/.env` (later file wins on duplicate keys)."""
    paths: list[Path] = []
    if _ROOT_ENV.is_file():
        paths.append(_ROOT_ENV)
    if _DEFAULT_ENV.is_file():
        paths.append(_DEFAULT_ENV)
    return tuple(str(p) for p in paths) if paths else None


class Settings(BaseSettings):
    cors_allowed_origins: str = "http://localhost:5173"
    backend_port: int = 8000
    master_prompt_path: str = "prompts/master-prompt.md"
    api_keys_file: str = "data/api_keys.json"
    ollama_base_url: str = "http://localhost:11434"
    max_autodebug_retries: int = 3
    log_level: str = "INFO"

    # Optional direct API keys (can also be set via the UI / KeyStore)
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    mistral_api_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=_resolved_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("backend_port", mode="after")
    @classmethod
    def _backend_port_in_range(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError("BACKEND_PORT must be between 1 and 65535")
        return v

    @field_validator(
        "gemini_api_key",
        "openai_api_key",
        "anthropic_api_key",
        "mistral_api_key",
        mode="before",
    )
    @classmethod
    def _strip_api_keys(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v  # type: ignore[return-value]

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def master_prompt_resolved(self) -> Path:
        p = Path(self.master_prompt_path)
        return p if p.is_absolute() else (BACKEND_ROOT / p)

    @property
    def api_keys_path(self) -> Path:
        p = Path(self.api_keys_file)
        return p if p.is_absolute() else (BACKEND_ROOT / p)


settings = Settings()
