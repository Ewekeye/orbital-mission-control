from contextlib import asynccontextmanager
import asyncio
from backend.ws import telemetry_stream
import sys
import os
sys.path.append(os.path.dirname(__file__))

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import FastAPI, Depends, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db
from models import Satellite, TelemetryLog, GroundStation, MissionEvent, Command
from cache import get_telemetry, get_position, set_position
from telemetry import update_telemetry, write_to_postgres
from orbit import get_position as orbit_get_position, get_orbital_info

NORAD_IDS = ["25544", "20580", "33591"]

async def background_telemetry():
    tick = 0
    while True:
        try:
            for norad in NORAD_IDS:
                update_telemetry(norad)

                tick += 1
                if tick % 60 == 0:
                    write_to_postgres(norad, update_telemetry(norad))

        except Exception as e:
            print(f"Background telemetry error: {e}")

        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(background_telemetry())
    yield
    task.cancel()

app = FastAPI(title="Orbital Mission Control", version="1.0.0", lifespan=lifespan)
import os
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../frontend")), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SATELLITES ──────────────────────────────────────────

@app.get("/satellites")
def list_satellites(db: Session = Depends(get_db)):
    satellites = db.query(Satellite).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "norad_id": s.norad_id,
            "inclination": s.inclination,
            "altitude": s.altitude,
        }
        for s in satellites
    ]

@app.get("/satellites/{norad_id}")
def get_satellite(norad_id: str, db: Session = Depends(get_db)):
    sat = db.query(Satellite).filter_by(norad_id=norad_id).first()
    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")
    return {
        "id": sat.id,
        "name": sat.name,
        "norad_id": sat.norad_id,
        "inclination": sat.inclination,
        "altitude": sat.altitude,
    }

# ── TELEMETRY ────────────────────────────────────────────

@app.get("/satellites/{norad_id}/telemetry")
def live_telemetry(norad_id: str, db: Session = Depends(get_db)):
    sat = db.query(Satellite).filter_by(norad_id=norad_id).first()
    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")

    data = get_telemetry(norad_id)
    if not data:
        data = update_telemetry(norad_id)

    return data

@app.get("/satellites/{norad_id}/telemetry/history")
def telemetry_history(norad_id: str, limit: int = 100, db: Session = Depends(get_db)):
    sat = db.query(Satellite).filter_by(norad_id=norad_id).first()
    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")

    records = (
        db.query(TelemetryLog)
        .filter_by(satellite_id=sat.id)
        .order_by(TelemetryLog.timestamp.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "timestamp": r.timestamp,
            "battery": r.battery,
            "fuel": r.fuel,
            "temperature": r.temperature,
            "voltage": r.voltage,
            "altitude": r.altitude,
            "velocity": r.velocity,
        }
        for r in records
    ]

# ── POSITION ─────────────────────────────────────────────

@app.get("/satellites/{norad_id}/position")
def satellite_position(norad_id: str):
    orbit_keys = {
        "25544": "iss",
        "20580": "hubble",
        "33591": "noaa19",
    }

    key = orbit_keys.get(norad_id)
    if not key:
        raise HTTPException(status_code=404, detail="Satellite not found")

    position = orbit_get_position(key)
    orbital = get_orbital_info(key)

    set_position(norad_id, position)

    return {**position, **orbital}

# ── GROUND STATIONS ───────────────────────────────────────

@app.get("/groundstations")
def list_ground_stations(db: Session = Depends(get_db)):
    stations = db.query(GroundStation).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "station_type": s.station_type,
        }
        for s in stations
    ]

# ── MISSION EVENTS ────────────────────────────────────────

@app.get("/events")
def list_events(limit: int = 50, db: Session = Depends(get_db)):
    events = (
        db.query(MissionEvent)
        .order_by(MissionEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "satellite_id": e.satellite_id,
            "timestamp": e.timestamp,
            "level": e.level,
            "message": e.message,
        }
        for e in events
    ]

# ── COMMANDS ──────────────────────────────────────────────

@app.get("/commands")
def list_commands(db: Session = Depends(get_db)):
    commands = (
        db.query(Command)
        .order_by(Command.timestamp.desc())
        .all()
    )
    return [
        {
            "id": c.id,
            "satellite_id": c.satellite_id,
            "name": c.name,
            "status": c.status,
            "timestamp": c.timestamp,
        }
        for c in commands
    ]

@app.post("/commands")
def create_command(payload: dict, db: Session = Depends(get_db)):
    sat = db.query(Satellite).filter_by(norad_id=payload["norad_id"]).first()
    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")

    command = Command(
        satellite_id=sat.id,
        name=payload["name"],
        status="PENDING",
    )
    db.add(command)
    db.commit()

    return {"message": "Command queued", "command": payload["name"]}

# ── WEBSOCKET ─────────────────────────────────────────────

@app.websocket("/ws/telemetry/{norad_id}")
async def websocket_telemetry(websocket: WebSocket, norad_id: str):
    await telemetry_stream(websocket, norad_id)

# ── HEALTH CHECK ──────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "online", "version": "1.0.0"}

@app.get("/")
def serve_frontend():
    return FileResponse(os.path.join(os.path.dirname(__file__), "../frontend/index.html"))