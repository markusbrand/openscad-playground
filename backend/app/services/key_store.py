"""Encrypted API-key storage backed by a JSON file + Fernet."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# Maps logical provider name -> environment variable expected by litellm
PROVIDER_ENV_MAP: dict[str, str] = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


class KeyStore:
    """Manage provider API keys with Fernet-encrypted on-disk storage."""

    def __init__(self, keys_file: str = "data/api_keys.json") -> None:
        self._keys_path = Path(keys_file)
        self._encryption_key_path = self._keys_path.parent / "encryption.key"
        self._fernet = self._load_or_create_fernet()
        self._keys: dict[str, str] = self._load_keys()
        self._apply_all_env_vars()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_key(self, provider: str, api_key: str) -> None:
        """Store *api_key* for *provider* and push it into the process env."""
        provider = provider.lower()
        self._keys[provider] = api_key
        self._persist()
        self._set_env_var(provider, api_key)
        logger.info("API key stored for provider=%s", provider)

    def get_key(self, provider: str) -> str | None:
        return self._keys.get(provider.lower())

    def delete_key(self, provider: str) -> bool:
        provider = provider.lower()
        if provider in self._keys:
            del self._keys[provider]
            self._persist()
            env_var = PROVIDER_ENV_MAP.get(provider)
            if env_var and env_var in os.environ:
                del os.environ[env_var]
            logger.info("API key deleted for provider=%s", provider)
            return True
        return False

    def list_providers(self) -> list[dict[str, str]]:
        """Return provider names with masked keys."""
        results: list[dict[str, str]] = []
        for provider, key in self._keys.items():
            results.append({"provider": provider, "masked_key": self._mask(key)})
        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_or_create_fernet(self) -> Fernet:
        self._encryption_key_path.parent.mkdir(parents=True, exist_ok=True)
        if self._encryption_key_path.exists():
            raw = self._encryption_key_path.read_bytes().strip()
        else:
            raw = Fernet.generate_key()
            self._encryption_key_path.write_bytes(raw)
            logger.info("Generated new encryption key at %s", self._encryption_key_path)
        return Fernet(raw)

    def _load_keys(self) -> dict[str, str]:
        if not self._keys_path.exists():
            return {}
        try:
            encrypted_blob = self._keys_path.read_bytes()
            decrypted = self._fernet.decrypt(encrypted_blob)
            return json.loads(decrypted)
        except Exception:
            logger.exception("Failed to decrypt api_keys.json – starting fresh")
            return {}

    def _persist(self) -> None:
        self._keys_path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(self._keys).encode()
        self._keys_path.write_bytes(self._fernet.encrypt(payload))

    def _apply_all_env_vars(self) -> None:
        for provider, key in self._keys.items():
            self._set_env_var(provider, key)

    @staticmethod
    def _set_env_var(provider: str, api_key: str) -> None:
        env_var = PROVIDER_ENV_MAP.get(provider)
        if env_var:
            os.environ[env_var] = api_key

    @staticmethod
    def _mask(key: str) -> str:
        if len(key) <= 8:
            return "****"
        return f"{key[:4]}...{key[-4:]}"
