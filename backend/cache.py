import sys
import os
sys.path.append(os.path.dirname(__file__))

import json
import redis
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

redis_client = redis.from_url(os.getenv("REDIS_URL"))

def set_telemetry(norad_id, data):
    key = f"telemetry:{norad_id}"
    redis_client.set(key, json.dumps(data), ex=300)

def get_telemetry(norad_id):
    key = f"telemetry:{norad_id}"
    data = redis_client.get(key)
    if data:
        return json.loads(data)
    return None

def set_position(norad_id, data):
    key = f"position:{norad_id}"
    redis_client.set(key, json.dumps(data), ex=10)

def get_position(norad_id):
    key = f"position:{norad_id}"
    data = redis_client.get(key)
    if data:
        return json.loads(data)
    return None

def get_all_live(norad_ids):
    result = {}
    for norad_id in norad_ids:
        telemetry = get_telemetry(norad_id)
        position = get_position(norad_id)
        if telemetry or position:
            result[norad_id] = {
                "telemetry": telemetry,
                "position": position,
            }
    return result

def ping():
    try:
        redis_client.ping()
        return True
    except Exception:
        return False