import sys
import os
sys.path.append(os.path.dirname(__file__))

import json
import random
import math
from datetime import datetime, timezone

from dotenv import load_dotenv
from pathlib import Path

from database import SessionLocal
from models import Satellite, TelemetryLog

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")


SATELLITE_DEFAULTS = {
    "25544": {"battery": 88.0, "fuel": 74.0, "temperature": 22.0, "voltage": 28.4},
    "20580": {"battery": 72.0, "fuel": 41.0, "temperature": 18.0, "voltage": 27.9},
    "33591": {"battery": 95.0, "fuel": 88.0, "temperature": 15.0, "voltage": 28.1},
}

def get_live_telemetry(norad_id):
    from cache import get_telemetry
    data = get_telemetry(norad_id)

    if data:
        return data

    return SATELLITE_DEFAULTS.get(norad_id, {})

def simulate_telemetry(norad_id):
    current = get_live_telemetry(norad_id)

    if not current:
        current = SATELLITE_DEFAULTS[norad_id].copy()

    def drift(value, min_val, max_val, step=0.3):
        change = random.uniform(-step, step)
        return round(max(min_val, min(max_val, value + change)), 4)

    new_telemetry = {
        "norad_id":    norad_id,
        "battery":     drift(current.get("battery", 80),     10,  100, 0.2),
        "fuel":        round(current.get("fuel", 70) - 0.001, 4),
        "temperature": drift(current.get("temperature", 20), -10,  60, 0.3),
        "voltage":     drift(current.get("voltage", 28),      25,  30, 0.05),
        "altitude":    drift(current.get("altitude", 400),   350, 450, 0.1),
        "velocity":    drift(current.get("velocity", 7.66),  7.5, 7.9, 0.005),
        "timestamp":   datetime.now(timezone.utc).isoformat(),
    }

    return new_telemetry

def write_to_redis(norad_id, telemetry):
    from cache import set_telemetry
    set_telemetry(norad_id, telemetry)

def write_to_postgres(norad_id, telemetry):
    db = SessionLocal()
    try:
        satellite = db.query(Satellite).filter_by(norad_id=norad_id).first()
        if not satellite:
            return

        log = TelemetryLog(
            satellite_id=satellite.id,
            battery=telemetry["battery"],
            fuel=telemetry["fuel"],
            temperature=telemetry["temperature"],
            voltage=telemetry["voltage"],
            altitude=telemetry["altitude"],
            velocity=telemetry["velocity"],
        )
        db.add(log)
        db.commit()
    finally:
        db.close()

def update_telemetry(norad_id):
    telemetry = simulate_telemetry(norad_id)
    write_to_redis(norad_id, telemetry)
    return telemetry

if __name__ == "__main__":
    norad_ids = ["25544", "20580", "33591"]

    print("Simulating telemetry...\n")
    for nid in norad_ids:
        t = update_telemetry(nid)
        print(f"Satellite {nid}:")
        print(f"  Battery:     {t['battery']}%")
        print(f"  Fuel:        {t['fuel']}%")
        print(f"  Temperature: {t['temperature']}°C")
        print(f"  Voltage:     {t['voltage']}V")
        print(f"  Altitude:    {t['altitude']}km")
        print()

    print("Writing one record to Postgres...")
    write_to_postgres("25544", update_telemetry("25544"))
    print("Done!")