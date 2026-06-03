"""
Transparent at-rest encryption for device and identity credentials.

Set CREDENTIAL_KEY to a Fernet key to enable encryption.
Generate one with:
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

If CREDENTIAL_KEY is not set, encrypt/decrypt are no-ops (plaintext stored).
This preserves backward compatibility for dev environments without the key.

Existing plaintext rows are detected by trying to decrypt — InvalidToken means
plaintext, which is then encrypted transparently via encrypt_existing_credentials().
"""
import os
import logging

logger = logging.getLogger(__name__)

_KEY = os.getenv("CREDENTIAL_KEY", "").strip()

try:
    from cryptography.fernet import Fernet, InvalidToken as _InvalidToken

    _cipher = Fernet(_KEY.encode()) if _KEY else None
except ImportError:
    _cipher = None
    _InvalidToken = Exception  # type: ignore[misc,assignment]


def encryption_enabled() -> bool:
    return _cipher is not None


def encrypt_credential(plain: str) -> str:
    if not _cipher or not plain:
        return plain
    return _cipher.encrypt(plain.encode()).decode()


def decrypt_credential(stored: str) -> str:
    if not _cipher or not stored:
        return stored
    try:
        return _cipher.decrypt(stored.encode()).decode()
    except _InvalidToken:
        # Legacy plaintext value — return as-is, will be encrypted on next write.
        return stored


def encrypt_existing_credentials(sync_conn) -> int:
    """
    Startup migration: encrypt any plaintext credentials in the DB.
    Called once from init_db via run_sync.
    Returns count of rows updated.
    """
    if not _cipher:
        return 0

    from sqlalchemy import text

    updated = 0

    for table, col in [
        ("lab_pods", "ssh_password"),
        ("credential_identities", "password"),
    ]:
        try:
            rows = sync_conn.execute(text(f"SELECT id, {col} FROM {table}")).fetchall()
        except Exception:
            continue

        for row_id, stored in rows:
            if not stored:
                continue
            try:
                _cipher.decrypt(stored.encode())
                # Already encrypted — skip.
            except _InvalidToken:
                encrypted = _cipher.encrypt(stored.encode()).decode()
                sync_conn.execute(
                    text(f"UPDATE {table} SET {col} = :enc WHERE id = :id"),
                    {"enc": encrypted, "id": row_id},
                )
                updated += 1

    if updated:
        logger.info("Encrypted %d existing plaintext credentials at startup.", updated)

    return updated
