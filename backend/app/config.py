"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic import AnyHttpUrl, field_validator
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
    # Comma-separated list of allowed hosts for internal service calls (SSRF protection)
    allowed_service_hosts: str = "localhost,127.0.0.1"
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

    @field_validator("ollama_base_url", mode="after")
    @classmethod
    def _validate_ollama_url(cls, v: str, info: Any) -> str:
        """Ensure Ollama URL is valid and restricted to trusted hosts."""
        try:
            from pydantic import TypeAdapter
            adapter = TypeAdapter(AnyHttpUrl)
            url = adapter.validate_python(v)

            # Note: In field_validator, accessing other fields via info.data
            # requires those fields to have been validated already (lexical order).
            allowed_hosts_str = info.data.get("allowed_service_hosts", "localhost,127.0.0.1")
            allowed_hosts = {h.strip() for h in allowed_hosts_str.split(",") if h.strip()}

            if url.host not in allowed_hosts:
                raise ValueError(f"OLLAMA_BASE_URL host {url.host} is not in the allowlist {allowed_hosts}")
            return v
        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            raise ValueError(f"Invalid OLLAMA_BASE_URL: {v}")

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
