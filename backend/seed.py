import sys
import os
sys.path.append(os.path.dirname(__file__))

from database import SessionLocal
from models import Satellite, GroundStation
from orbit import get_orbital_info

def seed_satellites(db):
    satellites = [
        {"name": "ISS (ZARYA)", "norad_id": "25544"},
        {"name": "HUBBLE", "norad_id": "20580"},
        {"name": "NOAA 19", "norad_id": "33591"},
    ]

    orbit_keys = {
        "25544": "iss",
        "20580": "hubble",
        "33591": "noaa19",
    }

    for sat in satellites:
        existing = db.query(Satellite).filter_by(norad_id=sat["norad_id"]).first()
        if existing:
            print(f" Skipping {sat['name']} - already exists")
            continue

        info = get_orbital_info(orbit_keys[sat["norad_id"]])

        new_sat = Satellite(
            name=sat["name"],
            norad_id=sat["norad_id"],
            inclination=info["inclination_deg"],
            altitude=400.0,
        )
        db.add(new_sat)
        print(f" Added {sat['name']}")

    db.commit()


def seed_ground_stations(db):
    stations = [
        {"name": "GOLDSTONE", "latitude": 35.3, "longitude": -116.9, "station_type": "DSN"},
        {"name": "MADRID", "latitude": 40.4, "longitude": -3.9, "station_type": "DSN"},
        {"name": "CANBERRA", "latitude": -35.4, "longitude": 148.9, "station_type": "DSN"},
        {"name": "SVALBARD", "latitude": 78.2, "longitude": 15.4, "station_type": "KSAT"},
        {"name": "WALLOPS", "latitude": 37.9, "longitude": -75.5, "station_type": "NASA"},
    ]

    for station in stations:
        existing = db.query(GroundStation).filter_by(name=station["name"]).first()
        if existing:
            print(f" Skipping {station['name']} - already exists")
            continue

        db.add(GroundStation(**station))
        print(f" Added {station['name']}")

    db.commit()


if __name__=="__main__":
    db = SessionLocal()
    try:
        print("Seeding satellites...")
        seed_satellites(db)

        print("\nSeeding ground stations...")
        seed_ground_stations(db)

        print("\nDone!")
    finally:
        db.close()