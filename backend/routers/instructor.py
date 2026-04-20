import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/api/v1/instructor", tags=["instructor"])

_private_clients: list[WebSocket] = []
_public_feed_clients: list[WebSocket] = []
INSTRUCTOR_PIN = "1234"


def _drop_client(pool: list[WebSocket], ws: WebSocket) -> None:
    if ws in pool:
        pool.remove(ws)


async def _fanout(pool: list[WebSocket], event: dict) -> None:
    dead: list[WebSocket] = []
    for ws in pool:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)

    for ws in dead:
        _drop_client(pool, ws)


async def broadcast(event: dict):
    await _fanout(_private_clients, event)
    await _fanout(_public_feed_clients, event)


@router.websocket("/ws")
async def instructor_ws(ws: WebSocket):
    await ws.accept()
    try:
        auth = await asyncio.wait_for(ws.receive_json(), timeout=5.0)
    except asyncio.TimeoutError:
        await ws.close(code=4001)
        return

    if auth.get("pin") != INSTRUCTOR_PIN:
        await ws.send_json({"error": "wrong_pin"})
        await ws.close(code=4003)
        return

    await ws.send_json({"ok": True})
    _private_clients.append(ws)

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        _drop_client(_private_clients, ws)


@router.websocket("/feed")
async def instructor_feed(ws: WebSocket):
    await ws.accept()
    _public_feed_clients.append(ws)

    await ws.send_json({"type": "feed.ready"})

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        _drop_client(_public_feed_clients, ws)
