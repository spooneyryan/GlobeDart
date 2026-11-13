// Drawings for "Over the horizon": the scene from the side, and what the
// observer sees through a telescope. Each is used once per model.
//
// A scene is what horizonScene() returns, plus `shape` and two functions that
// turn metres and kilometres into text in the user's units.
import { EARTH_RADIUS_KM } from '../astro.js';

const INK = {
  globe: '#7fb4ff',
  flat: '#ffb224',
  text: '#e6edf5',
  muted: '#93a4b8',
  hidden: '#ff7d7d',
  sight: '#f2f6fa',
  own: '#c79bff',
  eye: '#ff5d6c',
  sea: '#12385a',
  seaEdge: '#3f86bd',
};

// How wide each target is compared with its height.
const WIDTH = { ship: 3.6, building: 0.34, lighthouse: 0.3 };

const CONTAINER_COLOURS = ['#c8553d', '#3d7ac8', '#d9a441', '#5aa469', '#8e6bbf', '#d0d6dd'];

/** Draws a target standing on (x, base), `size` pixels tall. */
function drawTarget(ctx, shape, x, base, size) {
  // Works in units of the target's height: across from the middle, up from the base.
  const px = (u) => x + u * size;
  const py = (v) => base - v * size;
  const box = (u0, v0, u1, v1, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(px(u0), py(v1), (u1 - u0) * size, (v1 - v0) * size);
  };
  const shapeOf = (points, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    points.forEach(([u, v], i) => (i ? ctx.lineTo(px(u), py(v)) : ctx.moveTo(px(u), py(v))));
    ctx.closePath();
    ctx.fill();
  };

  if (shape === 'ship') {
    const half = WIDTH.ship / 2;
    // Mast and funnel first, so the bridge sits in front of them.
    box(-0.3 * WIDTH.ship - 0.012, 0.7, -0.3 * WIDTH.ship + 0.012, 1, '#aab4c0');
    box(-0.36 * WIDTH.ship, 0.7, -0.33 * WIDTH.ship, 0.86, '#c8553d');
    box(0.4 * WIDTH.ship - 0.01, 0.28, 0.4 * WIDTH.ship + 0.01, 0.6, '#aab4c0');
    // Two tiers of containers along the deck.
    const step = 0.052 * WIDTH.ship;
    for (let i = 0; i < 12; i++) {
      for (let tier = 0; tier < 2; tier++) {
        const u = -0.22 * WIDTH.ship + i * step;
        box(u, 0.28 + tier * 0.11, u + step * 0.92, 0.38 + tier * 0.11, CONTAINER_COLOURS[(i * 2 + tier * 3) % 6]);
      }
    }
    // The bridge, with a line of windows.
    box(-0.4 * WIDTH.ship, 0.28, -0.27 * WIDTH.ship, 0.72, '#eef2f6');
    box(-0.4 * WIDTH.ship, 0.63, -0.27 * WIDTH.ship, 0.67, '#2b3440');
    // The hull, with a red band along the waterline.
    shapeOf([[-half, 0.28], [-half * 0.94, 0], [half * 0.88, 0], [half, 0.28]], '#2b3038');
    shapeOf([[-half * 0.953, 0.07], [-half * 0.94, 0], [half * 0.88, 0], [half * 0.91, 0.07]], '#9b2d2d');
  } else if (shape === 'lighthouse') {
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const v0 = (0.8 * i) / bands;
      const v1 = (0.8 * (i + 1)) / bands;
      const at = (v) => 0.085 - 0.04 * (v / 0.8);
      shapeOf([[-at(v0), v0], [at(v0), v0], [at(v1), v1], [-at(v1), v1]], i % 2 ? '#eef2f6' : '#c8443a');
    }
    box(-0.075, 0.8, 0.075, 0.83, '#2b3038');
    box(-0.04, 0.83, 0.04, 0.93, '#ffe9a8');
    shapeOf([[-0.06, 0.93], [0.06, 0.93], [0, 1]], '#2b3038');
  } else {
    const half = WIDTH.building / 2;
    box(-0.008, 0.9, 0.008, 1, '#aab4c0');
    box(-half, 0, half, 0.9, '#aeb9c6');
    ctx.fillStyle = '#3a4756';
    const floors = 18;
    for (let i = 0; i < floors; i++) {
      ctx.fillRect(px(-half * 0.82), py(0.04 + (0.84 * (i + 0.7)) / floors), half * 1.64 * size, Math.max(1, (0.84 * 0.42 * size) / floors));
    }
  }
}

/** A step for a scale that gives roughly `count` round-numbered marks up to `max`. */
function niceStep(max, count) {
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

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

/** The scene from the side, with heights stretched so that the curve can be seen. */
function drawSide(ctx, w, h, model, s) {
  const compact = h < 230;
  // The observer and the target stand the same distance in from either side.
  const side = Math.max(36, w * 0.1);
  const pad = { l: side, r: side, t: compact ? 70 : 86, b: compact ? 34 : 44 };
  const xMax = s.distanceKm;
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const from = -(pad.l / plotW) * xMax; // the left and right edges of the panel, in km
  const to = xMax + (pad.r / plotW) * xMax;
  // Heights in metres above the straight line joining the foot of the observer
  // to the foot of the target. Seen that way the two stand level with each
  // other and the globe's surface rises between them in an even arc: the same
  // circle whichever end it is looked at from. Light is bent by the same air
  // in both models; only the ground differs.
  const bend = (x) => ((s.k * x * x) / (2 * EARTH_RADIUS_KM)) * 1000;
  const arc = (x) => ((x * (s.distanceKm - x)) / (2 * EARTH_RADIUS_KM)) * 1000;
  // What that change of baseline adds to a height measured from the observer's own level.
  const tilt = (x) => (model === 'globe' ? ((x * s.distanceKm) / (2 * EARTH_RADIUS_KM)) * 1000 : 0);
  const ground = model === 'globe' ? arc : () => 0;
  const base = 0;
  // The light: grazing the horizon if the target is beyond it, otherwise aimed at the target's foot.
  const beyond = model === 'globe' && s.distanceKm > s.horizonKm;
  const slope = beyond
    ? -Math.sqrt((2 * s.eyeM) / 1000 / s.radiusKm) * 1000
    : (-tilt(s.distanceKm) - s.eyeM + bend(s.distanceKm)) / s.distanceKm;
  const ray = (x) => s.eyeM + slope * x - bend(x) + tilt(x);

  // Both models share one scale, set by the globe, so the two drawings can be compared.
  const crest = ((s.distanceKm * s.distanceKm) / (8 * EARTH_RADIUS_KM)) * 1000;
  const top = Math.max(s.eyeM, s.targetM, crest) * 1.08;
  const lowest = Math.min(((from * (s.distanceKm - from)) / (2 * EARTH_RADIUS_KM)) * 1000, 0);
  const bottom = lowest - (top - lowest) * 0.06;
  const X = (x) => pad.l + (x / xMax) * plotW;
  const Y = (y) => pad.t + ((top - y) / (top - bottom)) * plotH;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#081220');
  sky.addColorStop(1, '#10243a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // The ground, drawn right across the panel.
  const steps = 80;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    const y = Y(ground(x));
    if (i) ctx.lineTo(X(x), y);
    else ctx.moveTo(X(x), y);
  }
  ctx.strokeStyle = INK.seaEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = INK.sea;
  ctx.fill();

  // How far the water stands above a straight line between the two, where that is enough to draw.
  if (model === 'globe' && Y(0) - Y(crest) > 14) {
    text(ctx, `water rises ${s.fmtH(crest)} here`, X(s.distanceKm / 2), Y(crest) + 28, '#9cc4e4', 'center');
  }

  // The target: the part in view, and the part that is hidden.
  const tx = X(s.distanceKm);
  const hidden = model === 'globe' ? s.hiddenM : s.flatHiddenM;
  const bar = 9;
  ctx.fillStyle = '#e6edf5';
  ctx.fillRect(tx - bar / 2, Y(base + s.targetM), bar, Y(base + hidden) - Y(base + s.targetM));
  if (hidden > 0) {
    ctx.fillStyle = INK.hidden;
    ctx.fillRect(tx - bar / 2, Y(base + hidden), bar, Y(base) - Y(base + hidden));
  }

  if (s.traced) {
    // Rays followed through the layered air. The bright ones reach the target.
    for (const one of s.traced[model].fan) {
      ctx.beginPath();
      one.points.forEach((p, i) => {
        const y = Y(p.m + ground(p.km));
        if (i) ctx.lineTo(X(p.km), y);
        else ctx.moveTo(X(p.km), y);
      });
      ctx.strokeStyle = one.onTarget ? 'rgba(242, 246, 250, 0.9)' : 'rgba(147, 164, 184, 0.45)';
      ctx.lineWidth = one.onTarget ? 1.5 : 1;
      ctx.stroke();
    }
  } else {
    // The line of sight.
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const x = (s.distanceKm * i) / 60;
      if (i) ctx.lineTo(X(x), Y(ray(x)));
      else ctx.moveTo(X(x), Y(ray(x)));
    }
    ctx.strokeStyle = INK.sight;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The observer.
  ctx.strokeStyle = INK.eye;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  ctx.lineTo(X(0), Y(s.eyeM));
  ctx.stroke();
  ctx.fillStyle = INK.eye;
  ctx.beginPath();
  ctx.arc(X(0), Y(s.eyeM), 4, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, `eye, ${s.fmtH(s.eyeM)}`, X(0) + 8, Math.max(pad.t - 10, Y(s.eyeM) - 12), INK.eye, 'left', 600);

  // The horizon, where the line of sight touches the ground.
  if (model === 'globe' && Number.isFinite(s.horizonKm) && s.horizonKm < xMax) {
    const hx = X(s.horizonKm);
    const hy = Y(ground(s.horizonKm));
    ctx.fillStyle = INK.sight;
    ctx.beginPath();
    ctx.arc(hx, hy, 3, 0, Math.PI * 2);
    ctx.fill();
    // Kept clear of the labels at either end.
    if (hx > X(0) + 70 && hx < tx - 70) text(ctx, `horizon, ${s.fmtD(s.horizonKm)}`, hx, hy + 14, INK.muted, 'center');
  }

  // The user's own observations: a mark on the target where they saw it cut off.
  for (const own of s.owns) {
    const y = Y(base + own.hiddenM);
    ctx.strokeStyle = INK.own;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx - 11, y);
    ctx.lineTo(tx + 11, y);
    ctx.stroke();
  }
  if (s.owns.length) text(ctx, 'you saw', tx + 14, Y(base + s.owns[0].hiddenM), INK.own, 'left', 600);

  text(ctx, `${s.fmtH(s.targetM)} tall`, tx - 9, Y(base + s.targetM) - 9, INK.text, 'right', 600);
  if (hidden > 0) {
    const label = hidden >= s.targetM ? 'all hidden' : `${s.fmtH(hidden)} hidden`;
    text(ctx, label, tx - 9, (Y(base + hidden) + Y(base)) / 2, INK.hidden, 'right', 600);
  }
  text(ctx, `${s.fmtD(s.distanceKm)} away`, tx, h - (compact ? 10 : 14), INK.muted, 'center');

  const stretch = plotH / (top - bottom) / (plotW / (xMax * 1000));
  return stretch;
}

// The target drawn plainly, kept so it can be copied into the view a row at a time.
const sprite = { key: '', canvas: null };
function targetSprite(shape, size, dpr) {
  const key = `${shape}|${size.toFixed(2)}|${dpr}`;
  if (sprite.key !== key) {
    const wide = Math.ceil(WIDTH[shape] * size) + 4;
    const tall = Math.ceil(size);
    const canvas = sprite.canvas ?? document.createElement('canvas');
    canvas.width = Math.round(wide * dpr);
    canvas.height = Math.round(tall * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, wide, tall);
    drawTarget(c, shape, wide / 2, tall, size);
    Object.assign(sprite, { key, canvas, wide, tall });
  }
  return sprite;
}

/**
 * What the observer sees through layered air. Each row of the picture is one
 * direction of looking: the ray in that direction was followed to the target,
 * and the row shows whatever height on the target it arrived at.
 */
function drawTracedScope(ctx, w, h, model, s) {
  const t = s.traced[model];
  const size = Math.min(h * 0.46, (w * 0.64) / WIDTH[s.shape]);
  const perRadian = size / t.size; // pixels per radian: the same magnification as the plain view
  const anchor = Math.round(h * 0.8);
  const yOf = (angle) => anchor - (angle - (t.bottom + t.size)) * perRadian;
  const strip = ((t.top - t.bottom) / t.rows.length) * perRadian;
  const seaTop = '#2f6f9f';
  const seaLow = '#173f62';

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5f9bd0');
  sky.addColorStop(1, '#cfe2f1');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Below everything that was traced, it is sea if the lowest ray met the sea.
  if (t.rows[0].sea) {
    ctx.fillStyle = seaLow;
    ctx.fillRect(0, yOf(t.bottom) - 1, w, h);
  }
  const dpr = window.devicePixelRatio || 1;
  const img = targetSprite(s.shape, size, dpr);
  const left = w / 2 - img.wide / 2;
  t.rows.forEach((row, i) => {
    const y = yOf(t.bottom + ((t.top - t.bottom) * (i + 1)) / t.rows.length);
    if (row.sea) {
      ctx.fillStyle = i < t.rows.length * 0.12 ? seaLow : seaTop;
      ctx.fillRect(0, y, w, strip + 0.6);
    }
    if (row.m !== null) {
      const from = Math.min(img.tall - 1, Math.max(0, img.tall * (1 - row.m / s.targetM)));
      ctx.drawImage(img.canvas, 0, from * dpr, img.wide * dpr, Math.max(1, dpr), left, y, img.wide, strip + 0.6);
    }
  });
}

/** What the observer sees, zoomed in until the target fills the view. */
function drawScope(ctx, w, h, model, s) {
  if (s.traced) return drawTracedScope(ctx, w, h, model, s);
  const size = Math.min(h * 0.46, (w * 0.64) / WIDTH[s.shape]);
  const scale = size / s.targetM; // pixels per metre at the target's distance
  const cx = w / 2;
  const base = Math.round(h * 0.8);
  // The horizon crosses the target this far above its base.
  const lineM = model === 'globe' ? s.horizonLineM : s.eyeM;
  const beyond = model === 'globe' && s.distanceKm > s.horizonKm;
  const horizon = Math.max(-2, base - lineM * scale);

  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  sky.addColorStop(0, '#5f9bd0');
  sky.addColorStop(1, '#cfe2f1');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sea = () => {
    const water = ctx.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, '#2f6f9f');
    water.addColorStop(1, '#173f62');
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, horizon, w, 1);
  };

  if (beyond) {
    // The sea is in front: it covers everything below the horizon.
    drawTarget(ctx, s.shape, cx, base, size);
    sea();
    // A ghost of the hidden part, so it is clear what is missing.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    drawTarget(ctx, s.shape, cx, base, size);
    ctx.restore();
  } else {
    // The target is in front, with the sea running on behind it.
    sea();
    drawTarget(ctx, s.shape, cx, base, size);
  }

  // A height scale beside the target.
  const rx = Math.max(46, cx - (WIDTH[s.shape] * size) / 2 - 22);
  const hidden = model === 'globe' ? s.hiddenM : s.flatHiddenM;
  ctx.strokeStyle = 'rgba(8, 13, 20, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx, base);
  ctx.lineTo(rx, base - size);
  ctx.stroke();
  const step = niceStep(s.fmtScale(s.targetM), 5) / s.fmtScale(1);
  for (let m = 0; m <= s.targetM + 1e-9; m += step) {
    const y = base - m * scale;
    ctx.beginPath();
    ctx.moveTo(rx - 5, y);
    ctx.lineTo(rx, y);
    ctx.stroke();
    text(ctx, s.fmtH(m, true), rx - 8, y, m < hidden - 1e-9 ? '#ffd0d0' : INK.text, 'right');
  }
  if (hidden > 0) {
    ctx.strokeStyle = INK.hidden;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx, base);
    ctx.lineTo(rx, base - hidden * scale);
    ctx.stroke();
  }

  // Where the horizon would cut with no bending, and in standard air, when that differs.
  if (model === 'globe') {
    const marks = [
      [s.hiddenNoneM, 'no bending'],
      [s.hiddenStandardM, 'standard air'],
    ].filter(([m]) => m > 0 && m < s.targetM && Math.abs(m - hidden) * scale > 5);
    for (const [m, label] of marks) {
      const y = base - m * scale;
      // Right across, so it can be read off against the target.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
      const wide = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(8, 13, 20, 0.8)';
      ctx.fillRect(w - wide - 6, y - 9, wide, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w - 11, y);
    }
  }
  // The user's own observations: the line below which they could not see it.
  for (const own of s.owns) {
    const y = base - own.hiddenM * scale;
    const label =
      own.label || (own.hiddenM <= 0 ? 'you saw all of it' : own.hiddenM >= s.targetM ? 'you saw none of it' : 'you saw it cut off here');
    ctx.strokeStyle = INK.own;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.font = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    const wide = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(8, 13, 20, 0.85)';
    ctx.fillRect(w - wide - 6, y + 4, wide, 18);
    ctx.fillStyle = INK.own;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w - 11, y + 13);
  }
  return null;
}

const angle = (degrees) => (degrees >= 0.1 ? `${degrees.toFixed(2)}°` : `${(degrees * 60).toFixed(1)} arcminutes`);

export class HorizonView {
  /**
   * @param container  a .view element
   * @param kind       'side' or 'scope'
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
    this.note = document.createElement('div');
    this.note.className = 'legend';
    container.appendChild(this.note);
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
    const hidden = globe ? s.hiddenM : s.flatHiddenM;
    const what =
      hidden <= 0
        ? `All ${s.fmtH(s.targetM)} of the ${s.name} is in view`
        : hidden >= s.targetM
          ? `The whole ${s.name} is hidden`
          : `The bottom ${s.fmtH(hidden)} is hidden, the top ${s.fmtH(s.targetM - hidden)} shows`;
    if (this.kind === 'side') {
      const stretch = drawSide(ctx, w, h, this.model, s);
      this.readout.textContent = what;
      const times = stretch >= 10 ? Math.round(stretch).toLocaleString('en-US') : stretch.toFixed(1);
      this.note.textContent =
        stretch >= 3 ? `Heights stretched ${times} times. Drawn to scale it would look flat` : `Heights stretched ${times} times`;
    } else {
      drawScope(ctx, w, h, this.model, s);
      this.readout.textContent = what;
      const t = s.traced?.[this.model];
      this.note.textContent = t
        ? `Light followed through layers of air${t.upsideDown ? '. Part of the image is upside down: a mirage' : ''}`
        : `Zoomed in: from here the ${s.name} looks ${angle(s.looksDeg)} tall`;
    }
  }
}
