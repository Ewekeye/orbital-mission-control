import sys
import os
sys.path.append(os.path.dirname(__file__))

import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from telemetry import update_telemetry
from orbit import get_position as orbit_get_position
from cache import set_position

ORBIT_KEYS = {
    "25544": "iss",
    "20580": "hubble",
    "33591": "noaa19",
}

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, norad_id: str):
        await websocket.accept()
        if norad_id not in self.active_connections:
            self.active_connections[norad_id] = []
        self.active_connections[norad_id].append(websocket)

    def disconnect(self, websocket: WebSocket, norad_id: str):
        if norad_id in self.active_connections:
            self.active_connections[norad_id].remove(websocket)

    async def broadcast(self, norad_id: str, data: dict):
        connections = self.active_connections.get(norad_id, [])
        dead = []
        for websocket in connections:
            try:
                await websocket.send_json(data)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            connections.remove(websocket)

manager = ConnectionManager()

async def telemetry_stream(websocket: WebSocket, norad_id: str):
    await manager.connect(websocket, norad_id)
    try:
        while True:
            telemetry = update_telemetry(norad_id)

            orbit_key = ORBIT_KEYS.get(norad_id)
            if orbit_key:
                position = orbit_get_position(orbit_key)
                set_position(norad_id, position)
            else:
                position = {}

            await websocket.send_json({
                "type": "update",
                "norad_id": norad_id,
                "telemetry": telemetry,
                "position": position,
            })

            await asyncio.sleep(1)

    except WebSocketDisconnect:
        manager.disconnect(websocket, norad_id)