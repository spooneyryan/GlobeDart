// Drawings for "Level flight": one lap speeded up, and a stretch of flight
// drawn to true scale. Each is used once per model.
//
// A scene is what flightScene() returns, plus `phase` (how far round the lap
// the speeded-up aircraft is, 0 to 1) and functions that turn numbers into
// text in the user's units.
import { EARTH_RADIUS_KM } from '../astro.js';

const INK = {
  text: '#e6edf5',
  muted: '#93a4b8',
  nose: '#f2f6fa',
  star: '#c79bff',
  down: '#ff7847',
  ground: '#12385a',
  groundEdge: '#3f86bd',
  path: '#45d6c8',
};

function text(ctx, string, x, y, colour = INK.text, align = 'left', weight = 400, size = 11) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
  ctx.strokeText(string, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(string, x, y);
}

/** An arrow from (x, y) in direction `angle` (radians, clockwise from pointing right). */
function arrow(ctx, x, y, angle, length, colour, width = 2, dash = null) {
  const ex = x + Math.cos(angle) * length;
  const ey = y + Math.sin(angle) * length;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(angle - 0.4) * 7, ey - Math.sin(angle - 0.4) * 7);
  ctx.lineTo(ex - Math.cos(angle + 0.4) * 7, ey - Math.sin(angle + 0.4) * 7);
  ctx.closePath();
  ctx.fill();
}

/** A small aircraft seen from the side, nose along `angle`. */
function aircraft(ctx, x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#eef2f6';
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // tail fin
  ctx.moveTo(-size * 0.95, 0);
  ctx.lineTo(-size * 1.05, -size * 0.5);
  ctx.lineTo(-size * 0.75, -size * 0.5);
  ctx.lineTo(-size * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#aab4c0'; // wing
  ctx.beginPath();
  ctx.moveTo(size * 0.15, 0);
  ctx.lineTo(-size * 0.25, size * 0.22);
  ctx.lineTo(-size * 0.4, size * 0.22);
  ctx.lineTo(-size * 0.2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function backdrop(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#060c16');
  sky.addColorStop(1, '#0f2238');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

/** One whole lap, speeded up, with the size of the aircraft and its height exaggerated. */
function drawLap(ctx, w, h, model, s) {
  backdrop(ctx, w, h);
  const compact = h < 230;
  const top = compact ? 64 : 80;
  const bottom = compact ? 48 : 56;
  const size = Math.max(9, Math.min(w, h) * 0.035);
  let px;
  let py;
  let nose;
  let down;
  if (model === 'globe') {
    const r = Math.max(20, Math.min((h - top - bottom) / 2 - 26, w * 0.26));
    const cx = w / 2;
    const cy = top + (h - top - bottom) / 2;
    ctx.fillStyle = INK.ground;
    ctx.strokeStyle = INK.groundEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Starts over the top and goes round clockwise.
    const around = -Math.PI / 2 + s.phase * Math.PI * 2;
    ctx.strokeStyle = 'rgba(69, 214, 200, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    px = cx + Math.cos(around) * (r + 16);
    py = cy + Math.sin(around) * (r + 16);
    nose = around + Math.PI / 2;
    down = around + Math.PI;
  } else {
    const ground = top + (h - top - bottom) * 0.72;
    ctx.fillStyle = INK.ground;
    ctx.fillRect(0, ground, w, h - ground);
    ctx.strokeStyle = INK.groundEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    ctx.lineTo(w, ground);
    ctx.stroke();
    px = w * (0.12 + 0.76 * s.phase);
    py = ground - Math.max(34, (h - top - bottom) * 0.3);
    ctx.strokeStyle = 'rgba(69, 214, 200, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(w * 0.12, py);
    ctx.lineTo(w * 0.88, py);
    ctx.stroke();
    ctx.setLineDash([]);
    nose = 0;
    down = Math.PI / 2;
  }
  // Where the nose pointed at the start: a fixed direction against the stars.
  arrow(ctx, px, py, 0, 40, INK.star, 2, [5, 4]);
  arrow(ctx, px, py, down, 26, INK.down, 2);
  arrow(ctx, px, py, nose, 40, INK.nose, 2);
  aircraft(ctx, px, py, nose, size);
  return null;
}

/** A stretch of flight to true scale: the same number of pixels per kilometre across and up. */
function drawStretch(ctx, w, h, model, s) {
  backdrop(ctx, w, h);
  const compact = h < 230;
  const pad = { l: 26, r: 26, t: compact ? 64 : 80, b: compact ? 50 : 58 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const radius = EARTH_RADIUS_KM;
  const altKm = s.altitudeM / 1000;
  const curved = model === 'globe';
  // Heights in km above the level line through the ground under the start.
  const ground = (x) => (curved ? Math.sqrt(radius * radius - x * x) - radius : 0);
  const level = (x) => (curved ? Math.sqrt((radius + altKm) ** 2 - x * x) - radius : altKm);
  const straightEnd = altKm; // a dead straight line stays at the starting height on this drawing
  // Fit the picture: from the lowest ground to the starting height, centred in the space there is.
  const lowest = ground(s.distanceKm);
  const span = altKm - lowest;
  // Pixels per kilometre, the same both ways. Both models use the globe's fit, so they can be compared.
  const globeSpan = altKm + radius - Math.sqrt(radius * radius - s.distanceKm * s.distanceKm);
  const scale = Math.min(plotW / s.distanceKm, (plotH - 24) / Math.max(globeSpan, 1e-9));
  const y0 = pad.t + Math.max(12, (plotH - span * scale) / 2) + altKm * scale;
  const X = (x) => pad.l + x * scale;
  const Y = (y) => y0 - y * scale;

  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const x = (s.distanceKm * i) / 80;
    if (i) ctx.lineTo(X(x), Y(ground(x)));
    else ctx.moveTo(X(x), Y(ground(x)));
  }
  ctx.strokeStyle = INK.groundEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineTo(X(s.distanceKm), h);
  ctx.lineTo(X(0), h);
  ctx.closePath();
  ctx.fillStyle = INK.ground;
  ctx.fill();

  // Dead straight: the nose held still against the stars.
  ctx.strokeStyle = INK.star;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(altKm));
  ctx.lineTo(X(s.distanceKm), Y(straightEnd));
  ctx.stroke();
  ctx.setLineDash([]);

  // Level flight: the same height above the ground all the way.
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const x = (s.distanceKm * i) / 80;
    if (i) ctx.lineTo(X(x), Y(level(x)));
    else ctx.moveTo(X(x), Y(level(x)));
  }
  ctx.strokeStyle = INK.path;
  ctx.lineWidth = 2;
  ctx.stroke();

  const size = Math.max(8, Math.min(14, plotW * 0.025));
  aircraft(ctx, X(0), Y(altKm), 0, size);
  const endAngle = curved ? Math.asin(Math.min(1, s.distanceKm / (radius + altKm))) : 0;
  aircraft(ctx, X(s.distanceKm), Y(level(s.distanceKm)), endAngle, size);

  text(ctx, 'start', X(0), Y(altKm) - 14, INK.muted, 'left');
  text(ctx, `${s.fmtTime(s.minutes)} later`, X(s.distanceKm), Y(level(s.distanceKm)) + 16, INK.muted, 'right');
  return null;
}

export class FlightView {
  /**
   * @param container  a .view element
   * @param kind       'lap' or 'stretch'
   * @param model      'globe' or 'flat'
   */
  constructor(container, kind, model) {
    this.container = container;
    this.kind = kind;
    this.model = model;
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.readout = document.createElement('div');
    this.readout.className = 'readout';
    container.appendChild(this.readout);
    this.scene = null;
    new ResizeObserver(() => this.draw()).observe(container);
  }

  update(scene) {
    this.scene = scene;
    this.draw();
  }

  draw() {
    const s = this.scene;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!s || !w || !h) return; // not on screen: drawn when it comes back
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const globe = this.model === 'globe';
    if (this.kind === 'lap') {
      drawLap(ctx, w, h, this.model, s);
      const flown = s.fmtTime(s.phase * s.hoursRound * 60);
      this.readout.textContent = globe
        ? `${flown} into a ${s.fmtTime(s.hoursRound * 60)} lap: the nose has turned ${(s.phase * 360).toFixed(0)}°`
        : `The same ${flown} of level flight: the nose has not moved`;
    } else {
      drawStretch(ctx, w, h, this.model, s);
      const stretch = `${s.fmtD(s.distanceKm)} in ${s.fmtTime(s.minutes)}`;
      this.readout.textContent = globe
        ? `${stretch}: nose down ${s.fmtAngle(s.turnDeg)}, the ground drops ${s.fmtH(s.dropM)}`
        : `${stretch}: nose down 0°, the ground stays level`;
    }
  }
}
