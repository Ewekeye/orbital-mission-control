// ── CONFIG ───────────────────────────────────────
const MAX_POINTS = 60;

let altData    = Array(MAX_POINTS).fill(null);
let signalData = Array(MAX_POINTS).fill(null);
let altChart, signalChart;

// ── SHARED CHART OPTIONS ─────────────────────────
const sharedOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111108',
      borderColor: '#3d3518',
      borderWidth: 1,
      titleColor: '#665530',
      bodyColor: '#ffd000',
      titleFont: { family: 'Share Tech Mono', size: 9 },
      bodyFont:  { family: 'Share Tech Mono', size: 11 },
    },
  },
  scales: {
    x: {
      grid:  { color: 'rgba(42,36,16,0.6)', drawBorder: false },
      ticks: {
        color: '#3d3518',
        font:  { family: 'Share Tech Mono', size: 8 },
        maxTicksLimit: 6,
      },
    },
    y: {
      grid:  { color: 'rgba(42,36,16,0.6)', drawBorder: false },
      ticks: {
        color: '#665530',
        font:  { family: 'Share Tech Mono', size: 9 },
      },
    },
  },
};

function makeLabels() {
  return Array.from({ length: MAX_POINTS }, (_, i) =>
    i === MAX_POINTS - 1 ? 'NOW' : `-${MAX_POINTS - 1 - i}s`
  );
}

// ── ALTITUDE CHART ───────────────────────────────
function initAltChart() {
  const ctx = document.getElementById('altChart').getContext('2d');

  altChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: makeLabels(),
      datasets: [
        {
          label: 'TEMP (°C)',
          data: [...altData],
          borderColor: '#ff6a00',
          borderWidth: 1.5,
          backgroundColor: 'rgba(255,106,0,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: 'VOLT (V)',
          data: Array(MAX_POINTS).fill(null),
          borderColor: '#ff2222',
          borderWidth: 1.5,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: 'PWR (%)',
          data: Array(MAX_POINTS).fill(null),
          borderColor: '#00ff44',
          borderWidth: 1.5,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
        },
      ],
    },
    options: {
      ...sharedOptions,
      plugins: {
        ...sharedOptions.plugins,
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#665530',
            font: { family: 'Share Tech Mono', size: 8 },
            boxWidth: 12,
            padding: 8,
          },
        },
      },
    },
  });
}

// ── SIGNAL CHART ─────────────────────────────────
function initSignalChart() {
  const ctx = document.getElementById('signalChart').getContext('2d');

  signalChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: makeLabels(),
      datasets: [{
        data: [...signalData],
        borderColor: '#ffd000',
        borderWidth: 1.5,
        backgroundColor: 'rgba(255,208,0,0.05)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      }],
    },
    options: {
      ...sharedOptions,
      scales: {
        ...sharedOptions.scales,
        y: {
          ...sharedOptions.scales.y,
          min: -100,
          max: 0,
          ticks: {
            ...sharedOptions.scales.y.ticks,
            callback: v => v + ' dB',
          },
        },
      },
    },
  });
}

// ── UPDATE FUNCTIONS ─────────────────────────────
window.updateAltChart = function(temp, volt, pwr) {
  if (!altChart) return;

  altData.shift();
  altData.push(temp ?? null);

  altChart.data.datasets[0].data = [...altData];

  const voltArr = altChart.data.datasets[1].data;
  voltArr.shift();
  voltArr.push(volt ?? (27 + Math.random() * 2));

  const pwrArr = altChart.data.datasets[2].data;
  pwrArr.shift();
  pwrArr.push(pwr ?? (60 + Math.random() * 20));

  altChart.update('none');
};

window.updateSignalChart = function(dbVal) {
  if (!signalChart) return;

  signalData.shift();
  signalData.push(dbVal ?? null);
  signalChart.data.datasets[0].data = [...signalData];
  signalChart.update('none');
};

// ── INIT ─────────────────────────────────────────
initAltChart();
initSignalChart();