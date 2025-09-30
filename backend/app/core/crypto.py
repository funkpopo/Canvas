from __future__ import annotations

from typing import Optional

from cryptography.fernet import Fernet, InvalidToken  # type: ignore[import-untyped]

from app.config import get_settings


_FERNET_PREFIX = "enc:"


def _get_fernet() -> Optional[Fernet]:
    key = get_settings().fernet_key
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return None


def encrypt_if_configured(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    f = _get_fernet()
    if not f:
        return plaintext
    token = f.encrypt(plaintext.encode())
    return _FERNET_PREFIX + token.decode()


def decrypt_if_encrypted(value: str | None) -> str | None:
    if value is None:
        return None
    if not value.startswith(_FERNET_PREFIX):
        return value
    token = value[len(_FERNET_PREFIX) :].encode()
    f = _get_fernet()
    if not f:
        # No key available, return as-is
        return value
    try:
        out = f.decrypt(token)
        return out.decode()
    except (InvalidToken, Exception):
        return value

