// Tracing light through air whose temperature changes with height.
//
// The single bending coefficient in horizon.js treats the air as the same all
// the way along. Here the air is described by its temperature at each height,
// and each ray of light is followed step by step. The same routine follows
// rays over curved ground and over flat ground; only the ground differs.
//
// Heights and steps are in metres, distances along the ground in kilometres,
// angles in radians above the local level.
import { EARTH_RADIUS_KM } from './astro.js';
import { OVERTURNING_LAPSE } from './horizon.js';

const R = EARTH_RADIUS_KM * 1000;
// Air's refractive index is 1 + C × pressure / temperature (hPa, kelvin).
// Chosen to agree with the 503 in the surveyors' formula in horizon.js.
const C = 503 / R;
// How fast pressure falls with height: this, divided by the temperature, per metre.
const G = -OVERTURNING_LAPSE;
// The air near the ground follows the profile asked for; above this height it
// goes back to the standard rate of cooling, and above the second it stays the same.
const NEAR_GROUND = 1000;
const TROPOPAUSE = 11000;
const STANDARD_LAPSE = -0.0065;

/**
 * Air described by things that can be measured:
 *   tempC        air temperature just above the layer the surface affects
 *   pressureHpa  pressure at the surface
 *   lapse        change of temperature with height, °C per metre, in the first kilometre
 *   surfaceC     temperature of the water or ground, or null for the same as the air
 *   layerM       how deep the layer of air warmed or chilled by the surface is
 *
 * The result's at(h) sets its `n1` (the refractive index less one) and `dn`
 * (how fast the index changes with height) for a height.
 */
export function makeAir({ tempC = 15, pressureHpa = 1013.25, lapse = STANDARD_LAPSE, surfaceC = null, layerM = 10 } = {}) {
  const t0 = tempC + 273.15;
  const offset = surfaceC === null ? 0 : surfaceC - tempC;
  const t1 = t0 + lapse * NEAR_GROUND;
  const t2 = t1 + STANDARD_LAPSE * (TROPOPAUSE - NEAR_GROUND);
  // Pressure at the top of a layer, from the weight of the air in it.
  const through = (pBelow, tBelow, tAbove, rate, depth) =>
    Math.abs(rate) < 1e-9 ? pBelow * Math.exp((-G * depth) / tBelow) : pBelow * Math.pow(tAbove / tBelow, -G / rate);
  const p1 = through(pressureHpa, t0, t1, lapse, NEAR_GROUND);
  const p2 = through(p1, t1, t2, STANDARD_LAPSE, TROPOPAUSE - NEAR_GROUND);
  const reach = layerM * 12;
  const air = {
    n1: 0,
    dn: 0,
    // The finest detail in the profile, which limits how long a step can be.
    finest: offset === 0 ? Infinity : layerM,
    at(h) {
      let t;
      let dt;
      let p;
      if (h <= NEAR_GROUND) {
        t = t0 + lapse * h;
        dt = lapse;
        p = through(pressureHpa, t0, t, lapse, h);
      } else if (h <= TROPOPAUSE) {
        t = t1 + STANDARD_LAPSE * (h - NEAR_GROUND);
        dt = STANDARD_LAPSE;
        p = through(p1, t1, t, STANDARD_LAPSE, h - NEAR_GROUND);
      } else {
        t = t2;
        dt = 0;
        p = p2 * Math.exp((-G * (h - TROPOPAUSE)) / t2);
      }
      if (offset !== 0 && h < reach) {
        // The surface's effect dies away with height.
        const bump = offset * Math.exp(-Math.max(0, h) / layerM);
        t += bump;
        dt -= bump / layerM;
      }
      air.n1 = (C * p) / t;
      air.dn = ((-C * p) / (t * t)) * (G + dt);
    },
  };
  return air;
}

/**
 * Follows one ray from the eye.
 *
 * @param air      from makeAir
 * @param o.eyeM       height of the eye
 * @param o.angle      direction the ray leaves in, radians above level
 * @param o.curved     true for the globe, false for flat ground
 * @param o.targetKm   distance at which to note the ray's height (optional)
 * @param o.stopBelowM stop at the target's distance if the ray arrives no higher than this (optional)
 * @param o.maxKm      how far to follow it
 * @param o.maxM       height at which it has plainly left for the sky
 * @param o.step       length of each step
 * @param o.record     collect points along the way every this many steps (0 for none)
 *
 * Returns { end: 'ground' | 'target' | 'far' | 'high', endKm, atTargetM, bend, points }.
 * `atTargetM` is null if the ray reached the ground before the target's distance.
 * `bend` is the total turning of the ray toward the ground, in radians.
 */
export function traceRay(air, { eyeM, angle, curved = true, targetKm = null, stopBelowM = null, maxKm, maxM = 5000, step = 20, record = 0 }) {
  const far = maxKm * 1000;
  const target = targetKm === null ? null : targetKm * 1000;
  let h = eyeM;
  let th = angle;
  let x = 0;
  let bend = 0;
  let atTargetM = null;
  const points = record ? [{ km: 0, m: eyeM }] : null;
  // Rates of change at a height and direction: of height, direction, distance along the ground, and bending.
  let dh = 0;
  let dth = 0;
  let dx = 0;
  let db = 0;
  const rates = (hh, tt) => {
    air.at(hh);
    const cos = Math.cos(tt);
    const turn = (air.dn / (1 + air.n1)) * cos;
    dh = Math.sin(tt);
    dth = curved ? cos / (R + hh) + turn : turn;
    dx = curved ? (cos * R) / (R + hh) : cos;
    db = -turn;
  };
  const half = step / 2;
  for (let i = 1; i < 200000; i++) {
    rates(h, th);
    const h1 = dh;
    const t1 = dth;
    const x1 = dx;
    const b1 = db;
    rates(h + h1 * half, th + t1 * half);
    const h2 = dh;
    const t2 = dth;
    const x2 = dx;
    const b2 = db;
    rates(h + h2 * half, th + t2 * half);
    const h3 = dh;
    const t3 = dth;
    const x3 = dx;
    const b3 = db;
    rates(h + h3 * step, th + t3 * step);
    const hNext = h + ((h1 + 2 * h2 + 2 * h3 + dh) * step) / 6;
    const xNext = x + ((x1 + 2 * x2 + 2 * x3 + dx) * step) / 6;
    if (target !== null && atTargetM === null && xNext >= target) {
      atTargetM = h + ((hNext - h) * (target - x)) / (xNext - x);
      if (stopBelowM !== null && atTargetM >= 0 && atTargetM <= stopBelowM) {
        if (points) points.push({ km: targetKm, m: atTargetM });
        return { end: 'target', endKm: targetKm, atTargetM, bend, points };
      }
    }
    if (hNext <= 0) {
      const endKm = (x + ((xNext - x) * h) / (h - hNext)) / 1000;
      if (points) points.push({ km: endKm, m: 0 });
      return { end: 'ground', endKm, atTargetM: atTargetM !== null && atTargetM >= 0 ? atTargetM : null, bend, points };
    }
    h = hNext;
    x = xNext;
    th += ((t1 + 2 * t2 + 2 * t3 + dth) * step) / 6;
    bend += ((b1 + 2 * b2 + 2 * b3 + db) * step) / 6;
    if (points && i % record === 0) points.push({ km: x / 1000, m: h });
    if (x >= far || h >= maxM) {
      if (points) points.push({ km: x / 1000, m: h });
      return { end: x >= far ? 'far' : 'high', endKm: x / 1000, atTargetM, bend, points };
    }
  }
  return { end: 'far', endKm: x / 1000, atTargetM, bend, points };
}

/**
 * How much the whole atmosphere lifts something in the sky, in radians, for a
 * given apparent elevation. Used to check this module against the formula in
 * refraction.js; the app itself uses that formula.
 */
export function astronomicalBend(air, apparentRad, eyeM = 2) {
  return traceRay(air, { eyeM, angle: apparentRad, maxKm: 3000, maxM: 80000, step: 100 }).bend;
}

/**
 * What an observer sees of a target through layered air, for one model.
 *
 * The view is a column of directions, evenly spaced from `bottom` to `top`
 * (radians above level). For each, the ray is followed to the target's
 * distance: `m` is the height on the target it arrives at (null if it misses),
 * and `sea` says whether a ray that misses ends on the ground or in the sky.
 */
export function traceView(air, { eyeM, targetM, distanceKm, curved }) {
  const d = distanceKm * 1000;
  const size = targetM / d; // how tall the target looks with no air at all
  const base = -eyeM / d - (curved ? d / (2 * R) : 0); // where its foot would be in a straight line
  const level = curved ? -Math.sqrt((2 * eyeM) / R) : 0; // and the horizon
  const step = Math.min(150, 30 * air.finest, Math.max(10, d / 400));
  const maxM = targetM * 4 + eyeM + 200;
  const follow = (angle, record = 0) =>
    traceRay(air, { eyeM, angle, curved, targetKm: distanceKm, stopBelowM: targetM, maxKm: distanceKm * 1.6 + 5, maxM, step, record });
  const onTarget = (r) => r.end === 'target';
  // The same, but carrying on past the target to see whether sea or sky lies behind it.
  const followPast = (angle) =>
    traceRay(air, { eyeM, angle, curved, targetKm: distanceKm, maxKm: distanceKm * 1.6 + 5, maxM, step });
  // Narrows down the direction at which rays change from failing a test to passing it.
  const edge = (failing, passing, test) => {
    let lo = failing;
    let hi = passing;
    let found = follow(hi);
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const r = follow(mid);
      if (test(r)) {
        hi = mid;
        found = r;
      } else {
        lo = mid;
      }
    }
    return { angle: hi, ray: found };
  };

  // A coarse sweep upward, to find where the horizon and the target appear.
  const lo = Math.min(base, level) - 2 * size;
  const hi = Math.max(base + size, level) + 5 * size;
  const COARSE = 48;
  const at = (i) => lo + ((hi - lo) * i) / COARSE;
  let firstHit = null;
  let firstClear = null; // the first direction that does not end on the ground
  for (let i = 0; i <= COARSE && (firstHit === null || firstClear === null); i++) {
    const r = follow(at(i));
    if (firstHit === null && onTarget(r)) firstHit = i;
    if (firstClear === null && r.end !== 'ground') firstClear = i;
  }
  // The horizon: the direction at which rays stop reaching the ground.
  let horizon = null;
  let horizonKm = null;
  if (firstClear !== null && firstClear > 0) {
    const grazing = edge(at(firstClear), at(firstClear - 1), (r) => r.end === 'ground');
    // Only a horizon if the ground is met this side of the target. Otherwise it is just the target's foot.
    if (grazing.ray.endKm < distanceKm * 0.98) {
      horizon = grazing.angle;
      horizonKm = grazing.ray.endKm;
    }
  }
  // The lowest part of the target that can be seen.
  let lowest = null;
  if (firstHit !== null) {
    const foot = firstHit > 0 ? edge(at(firstHit - 1), at(firstHit), onTarget) : { angle: at(0), ray: follow(at(0)) };
    lowest = { angle: foot.angle, m: Math.max(0, foot.ray.atTargetM) };
  }

  // The window that is drawn: a little below the lowest thing of interest, and well above it.
  const anchor = lowest?.angle ?? horizon ?? base;
  const bottom = anchor - size;
  const top = anchor + 3 * size;
  const ROWS = 150;
  const rows = [];
  let lowestM = lowest ? lowest.m : Infinity;
  let highestM = -Infinity;
  let upsideDown = false;
  let before = null;
  for (let i = 0; i < ROWS; i++) {
    const r = followPast(bottom + ((top - bottom) * (i + 0.5)) / ROWS);
    const m = r.atTargetM !== null && r.atTargetM <= targetM ? r.atTargetM : null;
    rows.push({ m, sea: r.end === 'ground' });
    if (m !== null) {
      lowestM = Math.min(lowestM, m);
      highestM = Math.max(highestM, m);
      // Looking higher normally shows a higher part. Where it shows a lower part, the image is inverted.
      if (before !== null && m < before - targetM * 0.01) upsideDown = true;
    }
    before = m;
  }
  const seen = Number.isFinite(lowestM);
  // A few rays for the side-on drawing, spread across the window.
  const fan = [];
  for (let i = 0; i < 9; i++) {
    const r = follow(bottom + ((top - bottom) * (i + 0.5)) / 9, Math.max(1, Math.round(d / step / 40)));
    fan.push({ points: r.points, onTarget: onTarget(r) });
  }
  // Anything under a five-hundredth of the height is within the accuracy of the tracing.
  const hiddenM = seen ? (lowestM < targetM / 500 ? 0 : lowestM) : targetM;
  return {
    bottom,
    top,
    rows,
    size,
    hiddenM,
    highestM: seen ? highestM : null,
    upsideDown,
    horizonKm,
    dipRad: horizon === null ? null : -horizon,
    fan,
  };
}
