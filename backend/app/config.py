"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Directory that contains `app/` and `data/` (always backend/, regardless of cwd).
BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_ENV = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    cors_allowed_origins: str = "http://localhost:5173"
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
        env_file=_DEFAULT_ENV if _DEFAULT_ENV.is_file() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

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
