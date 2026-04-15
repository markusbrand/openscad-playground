"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def master_prompt_resolved(self) -> Path:
        return Path(self.master_prompt_path)


settings = Settings()
