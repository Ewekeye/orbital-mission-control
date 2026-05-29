# Orbital Mission Control System (OMCS)

A full-stack satellite tracking and telemetry dashboard built with Python, FastAPI, PostgreSQL, Redis, and vanilla JavaScript. This project simulates a real ground control system — the kind of software used by aerospace agencies to monitor satellites in orbit.

I built this to learn how real mission control software works, combining actual orbital mechanics with modern web development. The satellite positions are real — pulled live from NASA/NORAD data. The subsystem telemetry (battery, fuel, temperature) is simulated with realistic drift modelling since that data isn't publicly available.

---

## What It Does

- Tracks real satellites (ISS, Hubble, NOAA 19) using live TLE data from Celestrak
- Computes actual orbital positions, velocity, inclination, and period using Skyfield
- Streams live telemetry to the dashboard via WebSocket — updates every second
- Stores historical telemetry in PostgreSQL every 60 seconds automatically
- Caches live data in Redis for fast reads without hammering the database
- Shows satellite ground track on an interactive Leaflet map
- Displays signal strength and telemetry trend graphs with Chart.js
- Lets you queue commands to satellites and track their status
- Logs mission events in real time with INFO/WARN/CRIT severity levels
- Detects anomalies (battery low, temperature spikes) and flags them automatically

---

## Tech Stack

### Backend
| Tool | Purpose |
|---|---|
| Python 3.11 | Core language |
| FastAPI | REST API + WebSocket server |
| SQLAlchemy | ORM for database models |
| PostgreSQL | Permanent storage for telemetry history, satellites, commands |
| Redis | Fast in-memory cache for live telemetry (updates every second) |
| Skyfield | Real orbital mechanics — computes satellite positions from TLE data |
| psycopg2 | PostgreSQL driver |
| python-dotenv | Environment variable management |

### Frontend
| Tool | Purpose |
|---|---|
| HTML/CSS/JS | No framework — keeps things simple and fast |
| Leaflet.js | Interactive map with ground track and ground station markers |
| Chart.js | Signal strength and telemetry trend graphs |
| WebSocket API | Native browser WebSocket for live data streaming |

---

## Architecture

```
Browser (frontend)
    ↕  REST API calls (satellite list, position, commands)
    ↕  WebSocket (live telemetry every second)
        ↕
    FastAPI (main.py)
        ↕                    ↕                  ↕
    orbit.py            telemetry.py         models.py
    (Skyfield math)     (simulate + store)   (DB tables)
        ↕                    ↕
    Celestrak API       Redis (live cache)
    (real TLE data)     PostgreSQL (history)
```

### Why Two Databases?

PostgreSQL and Redis solve different problems:

- **Redis** answers "what is the battery right now" in under a millisecond. It's an in-memory store — incredibly fast but temporary. Telemetry writes here every second.
- **PostgreSQL** answers "show me battery levels for the last 7 days" with full query power. It's permanent. Telemetry writes here every 60 seconds.

Using one database for both would mean either slow live updates or no persistent history. Two tools, two jobs.

---

## Project Structure

```
orbital-mission-control/
│
├── backend/
│   ├── main.py          # FastAPI app — all API routes and WebSocket
│   ├── database.py      # PostgreSQL connection and session management
│   ├── models.py        # SQLAlchemy table definitions
│   ├── orbit.py         # Skyfield TLE fetching and orbital calculations
│   ├── telemetry.py     # Telemetry simulation and storage
│   ├── cache.py         # Redis interface
│   ├── ws.py            # WebSocket connection manager
│   ├── seed.py          # Seeds database with satellites and ground stations
│   └── init_db.py       # Creates all database tables
│
├── frontend/
│   ├── index.html       # Dashboard structure
│   ├── style.css        # Full styling
│   ├── dashboard.js     # WebSocket client, live UI updates, satellite switching
│   ├── map.js           # Leaflet map, ground track, ground station markers
│   └── chart.js         # Chart.js signal and telemetry graphs
│
├── data/
│   └── tle_cache.json   # Cached TLE data (refreshes every 24 hours)
│
├── .env                 # Database credentials (not committed)
├── requirements.txt     # Python dependencies
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/satellites` | List all tracked satellites |
| GET | `/satellites/{norad_id}` | Get single satellite info |
| GET | `/satellites/{norad_id}/telemetry` | Live telemetry from Redis |
| GET | `/satellites/{norad_id}/telemetry/history` | Historical telemetry from PostgreSQL |
| GET | `/satellites/{norad_id}/position` | Real position from Skyfield |
| GET | `/groundstations` | List all ground stations |
| GET | `/events` | Mission event log |
| GET | `/commands` | Command queue |
| POST | `/commands` | Queue a new command |
| GET | `/health` | Server health check |
| WS | `/ws/telemetry/{norad_id}` | Live telemetry WebSocket stream |

The API has auto-generated documentation at `/docs` when the server is running.

---

## How The Data Flows

### Live Telemetry (every second)
```
background_telemetry() runs
    → simulate_telemetry() generates new readings with realistic drift
    → write_to_redis() stores in Redis with 5 minute expiry
    → WebSocket pushes to all connected browsers instantly
```

### Historical Logging (every 60 seconds)
```
background_telemetry() tick hits 60
    → write_to_postgres() creates new TelemetryLog row
    → Data permanently stored for historical queries
```

### Satellite Position (on request)
```
Browser calls GET /satellites/{norad_id}/position
    → orbit.py loads TLE from cache (or fetches from Celestrak)
    → Skyfield computes current lat/lon/altitude using real orbital mechanics
    → Position cached in Redis for 10 seconds
    → Returned to browser and map marker updated
```

---

## Running It Locally

### Requirements
- Python 3.11
- PostgreSQL
- Redis

### Setup

**1. Clone the repo**
```bash
git clone https://github.com/Ewekeye/orbital-mission-control
cd orbital-mission-control
```

**2. Create virtual environment**
```bash
python3.11 -m venv venv
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Set up environment variables**

Create a `.env` file in the project root:
```
DATABASE_URL=postgresql://omcs_user:omcs_pass@localhost:5432/omcs
REDIS_URL=redis://localhost:6379
```

**5. Set up PostgreSQL**
```bash
sudo -u postgres psql
```
```sql
CREATE DATABASE omcs;
CREATE USER omcs_user WITH PASSWORD 'omcs_pass';
GRANT ALL PRIVILEGES ON DATABASE omcs TO omcs_user;
\q
```

**6. Create tables and seed data**
```bash
python backend/init_db.py
python backend/seed.py
```

**7. Start the server**
```bash
uvicorn backend.main:app --reload
```

**8. Open the dashboard**

Go to `http://localhost:8000` in your browser.

---

## What I Learned

This project taught me a lot more than I expected going in.

The hardest part wasn't the code — it was understanding why the architecture is designed the way it is. Why do you need two databases? Why WebSockets instead of polling? Why cache TLE data instead of fetching it every time? Every one of those decisions has a real reason behind it and working through them made the whole system make sense.

Skyfield was the most interesting library I'd never heard of before this project. The fact that you can take two lines of cryptic satellite data, hand them to a library, and get back the exact latitude and longitude of a spacecraft moving at 7.6 km/s — that's genuinely cool. Real orbital mechanics running in a Python script on my laptop.

The WebSocket implementation clicked something for me about how real-time software works. The difference between a client asking for data (polling) versus a server pushing data (streaming) sounds simple but the implications for architecture are significant. Once you see it working — data updating on screen every second without the browser doing anything — it makes sense why real mission control software works that way.

Building the whole stack from scratch — database schema, API, real-time layer, frontend — gave me a much better picture of how all these pieces connect in a production system.

---

## Known Limitations

- Subsystem telemetry (battery, fuel, temperature) is simulated, not real. This data is not publicly available from satellites.
- TLE data refreshes every 24 hours. For sub-minute accuracy you'd want more frequent updates.
- The ground station communication windows (AOS/LOS times) are currently placeholder values. Real pass prediction requires more complex geometry calculations.
- No authentication — this is a portfolio project, not production software.

---

## Possible Extensions

- Real pass prediction using Skyfield's find_events() for accurate AOS/LOS times
- 3D orbit visualization using Three.js
- Multi-user support with authentication
- Push notifications for anomaly alerts
- Export telemetry history to CSV
- Add more satellites from Celestrak's catalog

---

## Data Sources

- **TLE Data** — Celestrak (https://celestrak.org) — real orbital element sets updated multiple times daily
- **Orbital Mechanics** — Skyfield (https://rhodesmill.org/skyfield/) — Python library for astronomical calculations

---

*Built by Ewekeye David — aerospace engineering student project, 2026*