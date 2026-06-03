import pytest

pytest.importorskip("cryptography")

from cryptography.fernet import Fernet
import services.credentials as credentials


def test_encrypt_returns_different_string(monkeypatch):
    key = Fernet.generate_key()
    cipher = Fernet(key)
    monkeypatch.setattr(credentials, "_cipher", cipher)

    plain = "s3cr3t"
    encrypted = credentials.encrypt_credential(plain)
    assert encrypted != plain


def test_round_trip(monkeypatch):
    key = Fernet.generate_key()
    cipher = Fernet(key)
    monkeypatch.setattr(credentials, "_cipher", cipher)

    plain = "my-password-123"
    assert credentials.decrypt_credential(credentials.encrypt_credential(plain)) == plain


def test_decrypt_plaintext_fallback(monkeypatch):
    key = Fernet.generate_key()
    cipher = Fernet(key)
    monkeypatch.setattr(credentials, "_cipher", cipher)

    plain = "not-a-fernet-token"
    result = credentials.decrypt_credential(plain)
    assert result == plain


def test_encrypt_empty_passthrough(monkeypatch):
    key = Fernet.generate_key()
    cipher = Fernet(key)
    monkeypatch.setattr(credentials, "_cipher", cipher)

    assert credentials.encrypt_credential("") == ""


def test_no_key_encrypt_passthrough(monkeypatch):
    monkeypatch.setattr(credentials, "_cipher", None)
    plain = "plaintext-pass"
    assert credentials.encrypt_credential(plain) == plain


def test_no_key_decrypt_passthrough(monkeypatch):
    monkeypatch.setattr(credentials, "_cipher", None)
    stored = "some-stored-value"
    assert credentials.decrypt_credential(stored) == stored
