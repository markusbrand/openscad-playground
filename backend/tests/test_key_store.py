"""KeyStore encryption and masking behaviour."""

from __future__ import annotations

from app.services.key_store import KeyStore


def test_key_store_round_trip(tmp_path) -> None:
    path = tmp_path / "store.json"
    ks = KeyStore(keys_file=str(path))
    ks.set_key("openai", "sk-test-roundtrip-unique")

    ks2 = KeyStore(keys_file=str(path))
    assert ks2.get_key("openai") == "sk-test-roundtrip-unique"


def test_masked_key_never_leaks_full_secret(tmp_path) -> None:
    path = tmp_path / "store.json"
    ks = KeyStore(keys_file=str(path))
    secret = "abcdefghijklmnop"
    ks.set_key("custom", secret)
    listed = ks.list_providers()
    entry = next(e for e in listed if e["provider"] == "custom")
    assert secret not in entry["masked_key"]
    assert entry["masked_key"] == "abcd...mnop"


def test_delete_key_removes_from_disk(tmp_path) -> None:
    path = tmp_path / "store.json"
    ks = KeyStore(keys_file=str(path))
    ks.set_key("mistral", "key-to-remove-xx")
    assert ks.delete_key("mistral") is True
    ks2 = KeyStore(keys_file=str(path))
    assert ks2.get_key("mistral") is None
