// ── CONFIG ───────────────────────────────────────
const API = 'http://localhost:8000';
const WS  = 'ws://localhost:8000';

let currentNorad = '25544';
let socket       = null;
let missionStart = Date.now() - (86400000 * 3);
let logBuffer    = [];
let reconnectTimer = null;

// Simulated extras (not in backend yet)
const extras = {
  roll:     () => (Math.random() * 0.4 - 0.2).toFixed(2),
  pitch:    () => (Math.random() * 0.2 - 0.1).toFixed(2),
  powerBus: () => (120 + Math.random() * 10).toFixed(1),
  dataRate: () => (2.1 + Math.random() * 0.8).toFixed(2),
  obcLoad:  () => (60 + Math.random() * 20).toFixed(0),
  memory:   () => (70 + Math.random() * 15).toFixed(0),
  signal:   () => (-50 - Math.random() * 40).toFixed(1),
};

// ── CLOCK ────────────────────────────────────────
function updateClock() {
  const now = new Date();

  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  document.getElementById('utcClock').textContent = `${h}:${m}:${s}`;

  const months = ['JAN','FEB','MAR','APR','MAY','JUN',
                  'JUL','AUG','SEP','OCT','NOV','DEC'];
  const d = now.getUTCDate();
  const mo = months[now.getUTCMonth()];
  const y = now.getUTCFullYear();
  document.getElementById('utcDate').textContent = `${d} ${mo} ${y}`;
}

setInterval(updateClock, 1000);
updateClock();

// ── CONNECTION STATUS ────────────────────────────
function setStatus(state, text, sub) {
  const pill = document.getElementById('connectionStatus');
  const textEl = pill.querySelector('.status-text');
  const subEl  = pill.querySelector('.status-sub');

  pill.className = 'status-pill ' + state;
  textEl.textContent = text;
  if (subEl && sub) subEl.textContent = sub;
}

// ── MISSION LOG ──────────────────────────────────
function addLog(level, msg) {
  const now = new Date();
  const t = `${String(now.getUTCHours()).padStart(2,'0')}:` +
            `${String(now.getUTCMinutes()).padStart(2,'0')}:` +
            `${String(now.getUTCSeconds()).padStart(2,'0')}`;

  logBuffer.unshift({ time: t, level, msg });
  if (logBuffer.length > 50) logBuffer.pop();

  const el = document.getElementById('missionLog');
  el.innerHTML = logBuffer.map(e => `
    <div class="log-entry">
      <span class="log-time">${e.time}</span>
      <span class="log-level ${e.level}">${e.level}</span>
      <span class="log-msg">${e.msg}</span>
    </div>
  `).join('');
}

document.getElementById('clearLog').addEventListener('click', () => {
  logBuffer = [];
  document.getElementById('missionLog').innerHTML = '';
});

// ── TELEMETRY UPDATE ─────────────────────────────
function updateTelemetry(data) {
  const t = data.telemetry;
  const p = data.position;

  if (!t) return;

  // Meters
  setMeter('batt', t.battery, 100);
  setMeter('fuel', t.fuel,    100);
  setMeter('temp', Math.min(100, ((t.temperature + 10) / 70) * 100), 100);
  setMeter('volt', ((t.voltage - 24) / 8) * 100, 100);

  // Position strip
  if (p) {
    const lat = p.latitude;
    const lon = p.longitude;
    setText('posLat', `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`);
    setText('posLon', `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`);
    setText('posEclipse', 'NO');
    setText('posLos',  '08:12');
    setText('posAos',  '14:40 UTC');

    // Orbital params
    setText('posAlt',    p.altitude_km ? p.altitude_km.toFixed(1) : t.altitude.toFixed(1));
    setText('posVel',    t.velocity ? t.velocity.toFixed(3) : '--');
  }

  // Telemetry snapshot
  setText('attRoll',  extras.roll() + '°');
  setText('attPitch', extras.pitch() + '°C');
  setText('powerBus', extras.powerBus() + ' W');
  setText('dataRate', extras.dataRate() + ' MBPS');
  setText('obcLoad',  extras.obcLoad() + '%');
  setText('memUsage', extras.memory() + '%');

  // Anomaly checks
  if (t.battery < 20) {
    addLog('CRIT', `Battery critical — ${t.battery.toFixed(1)}%`);
    setSatStatus(currentNorad, 'critical', 'CRITICAL');
  } else if (t.battery < 40) {
    addLog('WARN', `Battery low — ${t.battery.toFixed(1)}%`);
    setSatStatus(currentNorad, 'warning', 'WARNING');
  }

  if (t.temperature > 50) {
    addLog('WARN', `High temp detected — ${t.temperature.toFixed(1)}°C`);
  }

  // Update charts
  if (window.updateAltChart)    window.updateAltChart(t.altitude);
  if (window.updateSignalChart) window.updateSignalChart(parseFloat(extras.signal()));
  if (window.updateMapPosition && p) window.updateMapPosition(p.latitude, p.longitude);
}

// ── HELPERS ──────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setMeter(prefix, value, max) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const bar = document.getElementById(prefix + 'Bar');
  const val = document.getElementById(prefix + 'Val');
  if (bar) bar.style.width = pct + '%';
  if (val) {
    if (prefix === 'batt' || prefix === 'fuel') {
      val.textContent = value.toFixed(1) + '%';
    } else if (prefix === 'temp') {
      val.textContent = value.toFixed ? value.toFixed(1) + '°C' : value + '°C';
    } else if (prefix === 'volt') {
      val.textContent = (typeof value === 'number' ? value : 0).toFixed ? 
        document.getElementById('voltVal').textContent : value + ' V';
    }
  }
}

// Fix voltage display separately
function updateVoltage(v) {
  const bar = document.getElementById('voltBar');
  const val = document.getElementById('voltVal');
  const pct = Math.min(100, Math.max(0, ((v - 24) / 8) * 100));
  if (bar) bar.style.width = pct + '%';
  if (val) val.textContent = v.toFixed(2) + ' V';
}

function setSatStatus(norad, cls, text) {
  const item = document.querySelector(`[data-norad="${norad}"]`);
  if (!item) return;
  const badge = item.querySelector('.sat-status');
  if (!badge) return;
  badge.className = `sat-status ${cls}`;
  badge.textContent = text;
}

// ── WEBSOCKET ────────────────────────────────────
function connectWebSocket(norad) {
  if (socket) {
    socket.close();
    socket = null;
  }

  setStatus('', 'CONNECTING...', 'ESTABLISHING LINK');
  addLog('INFO', `Connecting to satellite ${norad}...`);

  socket = new WebSocket(`${WS}/ws/telemetry/${norad}`);

  socket.onopen = () => {
    setStatus('connected', 'CONNECTED', 'LINK STABLE · 28MS');
    addLog('INFO', `Uplink established — NORAD ${norad}`);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateTelemetry(data);

      // Update voltage separately for cleaner display
      if (data.telemetry && data.telemetry.voltage) {
        updateVoltage(data.telemetry.voltage);
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  socket.onerror = () => {
    setStatus('error', 'LINK ERROR', 'RETRYING...');
    addLog('CRIT', 'WebSocket connection failed');
  };

  socket.onclose = () => {
    setStatus('error', 'DISCONNECTED', 'ATTEMPTING RECONNECT');
    addLog('WARN', 'Connection lost — reconnecting in 3s');
    reconnectTimer = setTimeout(() => connectWebSocket(norad), 3000);
  };
}

// ── SATELLITE SELECTOR ───────────────────────────
function selectSatellite(norad) {
  currentNorad = norad;

  // Update active state
  document.querySelectorAll('.sat-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-norad="${norad}"]`).classList.add('active');

  // Fetch orbital info for this satellite
  fetchOrbitalInfo(norad);

  // Reconnect WebSocket
  connectWebSocket(norad);

  addLog('INFO', `Switched tracking to NORAD ${norad}`);
}

document.querySelectorAll('.sat-item').forEach(item => {
  item.addEventListener('click', () => {
    selectSatellite(item.dataset.norad);
  });
});

// ── FETCH ORBITAL INFO ───────────────────────────
async function fetchOrbitalInfo(norad) {
  try {
    const res = await fetch(`${API}/satellites/${norad}/position`);
    const data = await res.json();
    setText('posInc',    data.inclination_deg ? data.inclination_deg.toFixed(2) : '--');
    setText('posPeriod', data.period_min      ? data.period_min.toFixed(2)      : '--');
  } catch (e) {
    console.error('Orbital fetch failed:', e);
  }
}

// ── FETCH GROUND STATIONS ────────────────────────
async function fetchGroundStations() {
  try {
    const res  = await fetch(`${API}/groundstations`);
    const data = await res.json();
    const el   = document.getElementById('groundStationList');

    const bands = {
      'DSN':  'X-BAND',
      'KSAT': 'S-BAND',
      'NASA': 'S-BAND',
    };

    el.innerHTML = data.map(gs => `
      <div class="gs-item">
        <div class="gs-dot"></div>
        <div class="gs-name">${gs.name} STATION</div>
        <div class="gs-band">${bands[gs.station_type] || gs.station_type}</div>
        <div class="gs-coords">${Math.abs(gs.latitude).toFixed(2)}°
          ${gs.latitude >= 0 ? 'N' : 'S'},
          ${Math.abs(gs.longitude).toFixed(2)}°
          ${gs.longitude >= 0 ? 'E' : 'W'}
        </div>
      </div>
    `).join('');

    // Pass to map
    if (window.addGroundStations) window.addGroundStations(data);

  } catch (e) {
    console.error('Ground station fetch failed:', e);
  }
}

// ── FETCH COMMANDS ───────────────────────────────
async function fetchCommands() {
  try {
    const res  = await fetch(`${API}/commands`);
    const data = await res.json();
    const el   = document.getElementById('cmdList');

    if (data.length === 0) {
      el.innerHTML = '<div style="color:var(--muted);font-size:10px;padding:8px 0">No commands queued</div>';
      return;
    }

    el.innerHTML = data.slice(0, 6).map((c, i) => `
      <div class="cmd-item">
        <span class="cmd-seq">${String(i + 1).padStart(3, '0')}</span>
        <span class="cmd-name">${c.name}</span>
        <span class="cmd-status ${c.status}">${c.status}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Command fetch failed:', e);
  }
}

// ── COMMAND MODAL ────────────────────────────────
document.getElementById('openCmdModal').addEventListener('click', () => {
  document.getElementById('cmdModal').classList.add('open');
});

document.getElementById('closeCmdModal').addEventListener('click', () => {
  document.getElementById('cmdModal').classList.remove('open');
});

document.getElementById('submitCmd').addEventListener('click', async () => {
  const norad = document.getElementById('cmdSatSelect').value;
  const name  = document.getElementById('cmdNameInput').value.trim().toUpperCase();

  if (!name) return;

  try {
    await fetch(`${API}/commands`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ norad_id: norad, name }),
    });

    addLog('INFO', `Command queued: ${name} → NORAD ${norad}`);
    document.getElementById('cmdNameInput').value = '';
    document.getElementById('cmdModal').classList.remove('open');
    fetchCommands();
  } catch (e) {
    addLog('CRIT', 'Failed to queue command');
  }
});

// ── RANDOM LOG EVENTS ────────────────────────────
const LOG_EVENTS = [
  ['INFO', 'Telemetry packet received'],
  ['INFO', 'Signal lock confirmed — S-BAND'],
  ['INFO', 'Attitude hold maintained ±0.05°'],
  ['INFO', 'Solar panel efficiency 94.2% nominal'],
  ['INFO', 'Orbital plane precession recorded'],
  ['WARN', 'Reaction wheel torque slightly elevated'],
  ['INFO', 'Downlink rate: 8.4 Mbps confirmed'],
  ['INFO', 'S-band transponder nominal'],
  ['INFO', 'Ground track entry recorded'],
];

setInterval(() => {
  const e = LOG_EVENTS[Math.floor(Math.random() * LOG_EVENTS.length)];
  addLog(e[0], e[1]);
}, 8000);

// ── INIT ─────────────────────────────────────────
async function init() {
  addLog('INFO', 'Ground systems initializing...');
  addLog('INFO', 'Database connection established');
  addLog('INFO', 'Fetching ground station network...');

  await fetchGroundStations();
  await fetchOrbitalInfo(currentNorad);
  await fetchCommands();

  addLog('INFO', 'All systems nominal — connecting uplink');
  connectWebSocket(currentNorad);
}

init();