import json
import time
import math
import requests
from pathlib import Path
from skyfield.api import load, EarthSatellite, wgs84

TLE_CACHE_PATH = Path(__file__).parent.parent / "data" / "tle_cache.json"
TLE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

TLE_CACHE_MAX_AGE = 86400

BASE_URL = "https://celestrak.org/NORAD/elements/gp.php"

TLE_IDS = {
    "iss": 25544,
    "hubble": 20580,
    "noaa19": 33591,
}

ts = load.timescale()

def fetch_tle(catnr):
    params = {
        "CATNR": catnr,
        "FORMAT": "tle"
    }

    response = requests.get(BASE_URL, params=params, timeout=10)
    response.raise_for_status()

    lines = response.text.strip().splitlines()

    if len(lines) < 3:
        raise ValueError(f"Invalid TLE response for CATNR {catnr}")

    return lines[1], lines[2]

def fetch_and_cache_tle():
    satellites = {}

    for name, catnr in TLE_IDS.items():
        line1, line2 = fetch_tle(catnr)

        satellites[name] = {
            "line1": line1,
            "line2": line2,
            "fetched_at": time.time()
        }

    with open(TLE_CACHE_PATH, "w") as f:
        json.dump(satellites, f, indent=2)

    print("TLE data fetched and cached.")

    return satellites

def load_tle_cache():
    if not TLE_CACHE_PATH.exists():
        return fetch_and_cache_tle()

    with open(TLE_CACHE_PATH) as f:
        data = json.load(f)

    first_sat = next(iter(data.values()))
    age = time.time() - first_sat["fetched_at"]

    if age > TLE_CACHE_MAX_AGE:
        return fetch_and_cache_tle()

    return data

_satellite_cache = {}

def get_satellite(name):
    if name not in _satellite_cache:
        data = load_tle_cache()

        if name not in data:
            raise KeyError(f"Satellite '{name}' not found")

        sat_data = data[name]

        _satellite_cache[name] = EarthSatellite(
            sat_data["line1"],
            sat_data["line2"],
            name,
            ts
        )

    return _satellite_cache[name]

def get_position(name):
    sat = get_satellite(name)

    geocentric = sat.at(ts.now())
    subpoint = wgs84.subpoint(geocentric)

    return {
        "latitude": round(subpoint.latitude.degrees, 4),
        "longitude": round(subpoint.longitude.degrees, 4),
        "altitude_km": round(subpoint.elevation.km, 2),
    }

def get_orbital_info(name):
    sat = get_satellite(name)

    geocentric = sat.at(ts.now())

    velocity = geocentric.velocity.km_per_s

    speed = math.sqrt(
        velocity[0]**2 +
        velocity[1]**2 +
        velocity[2]**2
    )

    period = (2 * math.pi) / sat.model.no_kozai

    return {
        "speed_km_s": round(speed, 4),
        "period_min": round(period, 2),
        "inclination_deg": round(math.degrees(sat.model.inclo), 4),
        "eccentricity": round(sat.model.ecco, 7),
    }

if __name__ == "__main__":
    fetch_and_cache_tle()

    print("\nISS Position:")
    print(get_position("iss"))

    print("\nISS Orbital Info:")
    print(get_orbital_info("iss"))