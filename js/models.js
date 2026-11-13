// The two competing models. Both receive exactly the same input: the point on
// Earth where the sun is overhead right now (an observable fact), and the
// observer's latitude and longitude. Each predicts where the sun appears in
// that observer's sky. Neither is given the answer.
//
// Each prediction is worked out as plain geometry (`trueEl`) and then lifted by
// the same air as the measurement (`el`).
import { DEG, EARTH_RADIUS_KM, wrap360 } from './astro.js';
import { STANDARD_AIR, lift } from './refraction.js';

/** Unit vector for a latitude/longitude on the globe (y = north pole). */
export function globeVec(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}

/**
 * Position on the standard flat-earth map (north-pole azimuthal equidistant),
 * in Earth radii. The north pole is the origin and the y axis points up.
 */
export function flatVec(lat, lon) {
  const r = (90 - lat) * DEG;
  const l = lon * DEG;
  return [r * Math.cos(l), 0, -r * Math.sin(l)];
}

/** Local east / north / up unit vectors at a point on the globe. */
export function globeFrame(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  return {
    east: [-Math.sin(l), 0, -Math.cos(l)],
    north: [-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)],
    up: globeVec(lat, lon),
  };
}

/** Local east / north / up unit vectors on the flat map (north = toward the pole). */
export function flatFrame(lat, lon) {
  const l = lon * DEG;
  return {
    east: [-Math.sin(l), 0, -Math.cos(l)],
    north: [-Math.cos(l), 0, Math.sin(l)],
    up: [0, 1, 0],
  };
}

/** Direction in a local frame for an azimuth (clockwise from north) and elevation. */
export function frameDirection(frame, azDeg, elDeg) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  const ce = Math.cos(e) * Math.sin(a);
  const cn = Math.cos(e) * Math.cos(a);
  const cu = Math.sin(e);
  return [0, 1, 2].map((i) => frame.east[i] * ce + frame.north[i] * cn + frame.up[i] * cu);
}

/** Angle in degrees between two sky directions given as azimuth/elevation. */
export function skySeparation(a, b) {
  const e1 = a.el * DEG;
  const e2 = b.el * DEG;
  const c =
    Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos((a.az - b.az) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

/**
 * Globe model: a sphere with the sun so far away its rays arrive parallel.
 * The sun's elevation is 90 degrees minus the angle between you and the subsolar point.
 */
export function globePredict(sub, lat, lon, air = STANDARD_AIR) {
  const p = lat * DEG;
  const d = sub.lat * DEG;
  const h = (sub.lon - lon) * DEG; // positive when the sun is east of the observer
  const sinEl = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  const trueEl = Math.asin(Math.min(1, Math.max(-1, sinEl))) / DEG;
  const east = Math.cos(d) * Math.sin(h);
  const north = Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(h);
  const az = wrap360(Math.atan2(east, north) / DEG);
  return { az, el: trueEl + lift(trueEl, air), trueEl, sizeDeg: sub.sizeDeg };
}

/**
 * Flat model: a small sun circling at a fixed height above the flat map,
 * directly over the subsolar point. Plain straight-line geometry.
 *
 * The sun's physical width is chosen so it looks the correct size when it is
 * directly overhead, which is the most generous choice available.
 */
export function flatPredict(sub, lat, lon, params, air = STANDARD_AIR) {
  const heightKm = params.sunHeightKm;
  const o = flatVec(lat, lon);
  const s = flatVec(sub.lat, sub.lon);
  const dx = s[0] - o[0];
  const dz = s[2] - o[2];
  const f = flatFrame(lat, lon);
  const de = dx * f.east[0] + dz * f.east[2];
  const dn = dx * f.north[0] + dz * f.north[2];
  const groundKm = Math.hypot(de, dn) * EARTH_RADIUS_KM;
  const trueEl = Math.atan2(heightKm, groundKm) / DEG;
  const az = wrap360(Math.atan2(de, dn) / DEG);
  const slantKm = Math.hypot(groundKm, heightKm);
  const sunWidthKm = 2 * heightKm * Math.tan((sub.sizeDeg / 2) * DEG);
  const sizeDeg = (2 * Math.atan(sunWidthKm / 2 / slantKm)) / DEG;
  return {
    az,
    el: trueEl + lift(trueEl, air),
    trueEl,
    sizeDeg,
    groundKm,
    slantKm,
    sunWidthKm,
    lit: groundKm <= params.lightRangeKm,
  };
}

/**
 * Height the sun "must" have on a flat earth to explain one observer's
 * measured elevation: ground distance to the subsolar point times tan(elevation).
 * If the earth were flat, every observer would get the same answer.
 */
export function impliedSunHeightKm(sub, lat, lon, observedElDeg) {
  if (observedElDeg <= 0) return null;
  const o = flatVec(lat, lon);
  const s = flatVec(sub.lat, sub.lon);
  const groundKm = Math.hypot(s[0] - o[0], s[2] - o[2]) * EARTH_RADIUS_KM;
  return groundKm * Math.tan(observedElDeg * DEG);
}

/**
 * RMS miss (degrees on the sky) of a model against a list of observations,
 * counting only moments when the sun is actually up for that observer.
 */
export function rmsMiss(samples, predict) {
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    if (s.obs.el <= 0) continue;
    const miss = skySeparation(s.obs, predict(s.sub, s.lat, s.lon));
    sum += miss * miss;
    n++;
  }
  return n ? Math.sqrt(sum / n) : null;
}

/** RMS miss of the flat model for a sweep of sun heights. Returns the curve and its minimum. */
export function flatFitCurve(samples, params, air, minKm = 100, maxKm = 1e6, steps = 90) {
  const curve = [];
  let best = null;
  for (let i = 0; i <= steps; i++) {
    const heightKm = minKm * Math.pow(maxKm / minKm, i / steps);
    const rms = rmsMiss(samples, (sub, lat, lon) =>
      flatPredict(sub, lat, lon, { ...params, sunHeightKm: heightKm }, air),
    );
    const point = { heightKm, rms };
    curve.push(point);
    if (rms !== null && (!best || rms < best.rms)) best = point;
  }
  return { curve, best };
}
