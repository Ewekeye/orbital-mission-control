// ── MAP INIT ─────────────────────────────────────
let map;
let satelliteMarker;
let groundTrackLine;
let groundStationMarkers = [];
let trackPoints = [];

function initMap() {
  map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    zoomControl: false,
    attributionControl: false,
  });

  // Dark night earth tile
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { subdomains: 'abcd', maxZoom: 19 }
  ).addTo(map);

  // Zoom control bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Graticule lines (lat/lon grid)
  drawGraticule();

  // Initial satellite marker
  satelliteMarker = L.marker([0, 0], {
    icon: createSatIcon(),
    zIndexOffset: 1000,
  }).addTo(map);

  // Ground track line
  groundTrackLine = L.polyline([], {
    color: '#ff6a00',
    weight: 1.5,
    opacity: 0.7,
    dashArray: '4 4',
  }).addTo(map);
}

// ── SATELLITE ICON ───────────────────────────────
function createSatIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div class="sat-map-marker">
        <div class="sat-map-ring"></div>
        <div class="sat-map-dot"></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// ── GROUND STATION ICON ──────────────────────────
function createGsIcon(name) {
  return L.divIcon({
    className: '',
    html: `
      <div class="gs-map-marker">
        <div class="gs-map-triangle"></div>
        <div class="gs-map-label">${name}</div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [8, 8],
  });
}

// ── UPDATE POSITION ──────────────────────────────
window.updateMapPosition = function(lat, lon) {
  if (!map || !satelliteMarker) return;

  const pos = [lat, lon];
  satelliteMarker.setLatLng(pos);

  // Add to track
  trackPoints.push(pos);
  if (trackPoints.length > 180) trackPoints.shift();
  groundTrackLine.setLatLngs(trackPoints);
};

// ── GROUND STATIONS ──────────────────────────────
window.addGroundStations = function(stations) {
  // Clear old
  groundStationMarkers.forEach(m => map.removeLayer(m));
  groundStationMarkers = [];

  stations.forEach(gs => {
    const marker = L.marker([gs.latitude, gs.longitude], {
      icon: createGsIcon(gs.name.substring(0, 4)),
    }).addTo(map);

    // Coverage circle
    const circle = L.circle([gs.latitude, gs.longitude], {
      radius: 2500000,
      color: '#ff6a00',
      fillColor: '#ff6a00',
      fillOpacity: 0.03,
      weight: 0.5,
      opacity: 0.3,
      dashArray: '4 8',
    }).addTo(map);

    marker.bindTooltip(`
      <div style="
        background:#111108;
        border:1px solid #ff6a00;
        color:#ffd000;
        font-family:'Share Tech Mono',monospace;
        font-size:10px;
        padding:4px 8px;
        letter-spacing:1px;
      ">
        ${gs.name}<br>
        <span style="color:#665530">
          ${gs.station_type} · 
          ${Math.abs(gs.latitude).toFixed(1)}°
          ${gs.latitude >= 0 ? 'N' : 'S'}
        </span>
      </div>
    `, {
      permanent: false,
      className: 'gs-tooltip',
      direction: 'top',
    });

    groundStationMarkers.push(marker);
    groundStationMarkers.push(circle);
  });
};

// ── GRATICULE ────────────────────────────────────
function drawGraticule() {
  // Longitude lines
  for (let lon = -180; lon <= 180; lon += 30) {
    L.polyline(
      [[-90, lon], [90, lon]],
      { color: '#1a1608', weight: 0.5, opacity: 0.6 }
    ).addTo(map);
  }
  // Latitude lines
  for (let lat = -90; lat <= 90; lat += 30) {
    L.polyline(
      [[lat, -180], [lat, 180]],
      { color: '#1a1608', weight: 0.5, opacity: 0.6 }
    ).addTo(map);
  }

  // Equator highlight
  L.polyline(
    [[0, -180], [0, 180]],
    { color: '#2a2410', weight: 1, opacity: 0.8 }
  ).addTo(map);
}

// ── CSS FOR MAP MARKERS ──────────────────────────
const mapStyles = document.createElement('style');
mapStyles.textContent = `
  .sat-map-marker {
    position: relative;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sat-map-dot {
    width: 8px;
    height: 8px;
    background: #ff6a00;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(255,106,0,0.9),
                0 0 20px rgba(255,106,0,0.5);
    position: absolute;
    z-index: 2;
  }

  .sat-map-ring {
    width: 24px;
    height: 24px;
    border: 1.5px solid rgba(255,106,0,0.5);
    border-radius: 50%;
    position: absolute;
    animation: satPing 2s ease-out infinite;
  }

  @keyframes satPing {
    0%   { transform: scale(0.5); opacity: 1; }
    100% { transform: scale(1.8); opacity: 0; }
  }

  .gs-map-marker {
    position: relative;
  }

  .gs-map-triangle {
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 11px solid #ff9500;
    filter: drop-shadow(0 0 4px rgba(255,149,0,0.7));
  }

  .gs-map-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: #665530;
    margin-top: 2px;
    white-space: nowrap;
    letter-spacing: 1px;
  }

  .leaflet-tooltip {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
  }

  .leaflet-tile-pane {
    filter: brightness(0.85) contrast(1.1);
  }
`;
document.head.appendChild(mapStyles);

// ── START ────────────────────────────────────────
initMap();