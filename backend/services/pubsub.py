import asyncio
import json
import os
from typing import Any, Callable, Awaitable

REDIS_URL = os.getenv("REDIS_URL", "").strip()

_redis = None


async def _get_redis():
    global _redis
    if _redis is None and REDIS_URL:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
            await _redis.ping()
        except Exception:
            _redis = None
    return _redis


async def publish(channel: str, data: dict[str, Any]) -> bool:
    """Publish to Redis channel. Returns True if published, False if Redis unavailable."""
    r = await _get_redis()
    if not r:
        return False
    try:
        await r.publish(channel, json.dumps(data))
        return True
    except Exception:
        return False


async def subscribe_loop(
    channel: str,
    handler: Callable[[dict[str, Any]], Awaitable[None]],
) -> None:
    """Background task: subscribe to Redis channel, call handler for each message."""
    r = await _get_redis()
    if not r:
        return
    try:
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await handler(data)
                except Exception:
                    pass
    except Exception:
        pass
