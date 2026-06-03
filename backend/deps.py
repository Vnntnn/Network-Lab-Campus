import os
import re
from urllib.parse import unquote

from fastapi import Header, Request


DEFAULT_ACTOR_ID = os.getenv("DEFAULT_ACTOR_ID", "default")
_ALLOWED_ACTOR_CHARS = re.compile(r"[^A-Za-z0-9_.-]")


def normalize_actor_id(raw: str | None) -> str:
    value = (raw or "").strip()
    if "," in value:
        value = value.split(",", 1)[0].strip()

    value = _ALLOWED_ACTOR_CHARS.sub("-", value).strip("-._")
    value = value[:64]
    return value or DEFAULT_ACTOR_ID


def get_actor_id(x_actor_id: str | None = Header(default=None, alias="X-Actor-Id")) -> str:
    return normalize_actor_id(x_actor_id)


def get_actor_name(request: Request) -> str | None:
    raw = request.headers.get("X-Actor-Name", "").strip()
    if not raw:
        return None
    try:
        decoded = unquote(raw).strip()
    except Exception:
        decoded = raw
    return decoded[:64] or None
