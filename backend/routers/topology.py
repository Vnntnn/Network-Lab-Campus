from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import TopologyDiscoveryResponse
from services.topology_discovery import discover_topology

router = APIRouter(prefix="/topology", tags=["topology"])
_clients: list[WebSocket] = []


async def broadcast(event: dict) -> None:
    dead: list[WebSocket] = []
    for ws in _clients:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)

    for ws in dead:
        if ws in _clients:
            _clients.remove(ws)


@router.websocket("/ws")
async def topology_ws(ws: WebSocket):
    await ws.accept()
    _clients.append(ws)

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in _clients:
            _clients.remove(ws)


@router.get("/discover/{pod_id}", response_model=TopologyDiscoveryResponse)
async def discover(
    pod_id: int,
    max_hops: int = Query(3, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
):
    response = await discover_topology(db, pod_id, max_hops=max_hops)
    await broadcast(
        {
            "type": "topology.discovery",
            "seed_pod_id": response.seed_pod_id,
            "snapshot": response.model_dump(mode="json"),
        }
    )
    return response