const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let paused = true; // wait for the user to press Start
let time = 0;
let totalSpikes = 0;
let currentPattern = 'regular';
let inputCurrent = 10;
let noise = 3;

const N = 8;
let neurons = [];
let histories = [];
let spikeMarkers = [];
const MAX_HISTORY = 500;
const DT = 0.5;

const PATTERNS = {
  regular:   { a: 0.02, b: 0.2,  c: -65, d: 8, color: '#e8788a' },
  bursting:  { a: 0.02, b: 0.2,  c: -55, d: 4, color: '#b0a0d0' },
  chattering:{ a: 0.02, b: 0.2,  c: -50, d: 2, color: '#80c8c0' },
  fast:      { a: 0.1,  b: 0.2,  c: -65, d: 2, color: '#f0a0b8' },
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getPattern() {
  if (currentPattern === 'mixed') {
    const keys = Object.keys(PATTERNS);
    return PATTERNS[keys[Math.floor(Math.random() * keys.length)]];
  }
  return PATTERNS[currentPattern];
}

function makeNeuron() {
  const p = getPattern();
  return {
    v: p.c,
    u: p.b * p.c,
    a: p.a, b: p.b, c: p.c, d: p.d,
    color: p.color,
    fired: false,
  };
}

function reset() {
  neurons = Array.from({ length: N }, () => makeNeuron());
  histories = Array.from({ length: N }, () => []);
  spikeMarkers = Array.from({ length: N }, () => []);
  time = 0;
  totalSpikes = 0;
  updateStats();
}

function step() {
  for (let i = 0; i < N; i++) {
    const n = neurons[i];
    const I = inputCurrent + (Math.random() - 0.5) * noise * 2;
    const dv = (0.04 * n.v * n.v + 5 * n.v + 140 - n.u + I);
    const du = n.a * (n.b * n.v - n.u);
    n.v += dv * DT;
    n.u += du * DT;
    n.fired = false;

    if (n.v >= 30) {
      n.v = n.c;
      n.u += n.d;
      n.fired = true;
      totalSpikes++;
      spikeMarkers[i].push(histories[i].length);
    }

    histories[i].push(Math.min(n.v, 30));
    if (histories[i].length > MAX_HISTORY) {
      histories[i].shift();
      spikeMarkers[i] = spikeMarkers[i].map(s => s - 1).filter(s => s >= 0);
    }
  }
  time += DT;
}

function updateStats() {
  document.getElementById('s-spikes').textContent = totalSpikes;
  document.getElementById('s-time').textContent = Math.floor(time);
  // time is already in ms (it grows by DT each step), so convert ms to seconds only
  const seconds = time / 1000;
  const rate = seconds > 0 ? totalSpikes / seconds : 0;
  document.getElementById('s-rate').textContent = rate.toFixed(2);
}

function draw() {
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, w, h);

  const padL = 44, padR = 16, padT = 12, padB = 12;
  const rowH = (h - padT - padB) / N;
  const plotW = w - padL - padR;

  for (let i = 0; i < N; i++) {
    const n = neurons[i];
    const y0 = padT + i * rowH;

    // row background
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,240,245,0.6)' : 'rgba(252,232,240,0.5)';
    ctx.fillRect(padL, y0, plotW, rowH);

    // neuron label
    ctx.font = '500 10px sans-serif';
    ctx.fillStyle = n.color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('N' + (i + 1), padL - 6, y0 + rowH / 2);

    // voltage trace
    const hist = histories[i];
    if (hist.length > 1) {
      ctx.beginPath();
      hist.forEach((v, j) => {
        const x = padL + (j / MAX_HISTORY) * plotW;
        const norm = Math.max(0, Math.min(1, (v + 80) / 110));
        const y = y0 + rowH - norm * (rowH - 4) - 2;
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = n.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // spike markers — thin vertical lines
    spikeMarkers[i].forEach(si => {
      const x = padL + (si / MAX_HISTORY) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, y0 + 2);
      ctx.lineTo(x, y0 + rowH - 2);
      ctx.strokeStyle = hexToRgba(n.color, 0.2);
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // row dividers
  for (let i = 1; i < N; i++) {
    const y = padT + i * rowH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.strokeStyle = 'rgba(192, 96, 122, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // left axis
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + N * rowH);
  ctx.strokeStyle = 'rgba(192, 96, 122, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Run the simulation at the same speed on every screen (60 Hz, 120 Hz, etc.)
// SPEED = simulated ms per real ms. 0.125 is slowed down so the spikes are easy to watch.
const SPEED = 0.125;
let lastFrameTime = null;
let unsimulatedTime = 0; // real time (ms) that has passed but not been simulated yet

function loop(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  let elapsed = now - lastFrameTime;
  lastFrameTime = now;

  // If the tab was hidden for a while, don't try to catch up all at once
  if (elapsed > 100) elapsed = 100;

  if (!paused) {
    unsimulatedTime += elapsed * SPEED;
    while (unsimulatedTime >= DT) {
      step();
      unsimulatedTime -= DT;
    }
    updateStats();
  }
  draw();
  requestAnimationFrame(loop);
}

document.querySelectorAll('.pattern-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPattern = btn.dataset.pattern;
    reset();
  });
});

document.getElementById('btn-reset').addEventListener('click', reset);
document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused;
  document.getElementById('btn-pause').textContent = paused ? 'Start' : 'Pause';
});

document.getElementById('r-current').addEventListener('input', e => {
  inputCurrent = +e.target.value;
  document.getElementById('o-current').textContent = inputCurrent;
});
document.getElementById('r-noise').addEventListener('input', e => {
  noise = +e.target.value;
  document.getElementById('o-noise').textContent = noise;
});

window.addEventListener('resize', () => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  draw();
});

const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * window.devicePixelRatio;
canvas.height = rect.height * window.devicePixelRatio;
ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

reset();
requestAnimationFrame(loop);
