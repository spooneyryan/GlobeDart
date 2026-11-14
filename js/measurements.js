// Measurements the user took themselves, and how each model scores against them.
//
// A measurement is { t, lat, lon, el, az, label, tempC, star }:
//   t      time it was taken, milliseconds since the epoch
//   el     elevation above the horizon of what was measured, degrees
//   az     compass bearing to it, degrees from true north, or null if not measured
//   tempC  air temperature when it was taken, degrees Celsius, or null if not noted
//   star   the name of the star or planet that was measured, or null for the sun
import { DEG, subsolarPoint, starPoints, wrap360 } from './astro.js';
import { SKY_BODIES, starIndex } from './stars.js';
import { globePredict, flatPredict, flatBendPerKm, impliedSunHeightKm, skySeparation } from './models.js';
import { STANDARD_AIR, AIR_LIMITS } from './refraction.js';

export const MAX_MEASUREMENTS = 40;

/** Sun elevation from a vertical stick and the length of its shadow on level ground. */
export function shadowToElevation(stickHeight, shadowLength) {
  return Math.atan2(stickHeight, shadowLength) / DEG;
}

/** The sun is in the opposite direction to the way the shadow points. */
export function shadowToAzimuth(shadowBearing) {
  return wrap360(shadowBearing + 180);
}

/**
 * How far a prediction is from a measurement. With a bearing this is the angle
 * on the sky between the two; without one, only the elevations can be compared.
 */
export function measurementMiss(m, prediction) {
  if (m.az === null) return Math.abs(prediction.el - m.el);
  return skySeparation(m, prediction);
}

/**
 * The air to use for one measurement. A temperature noted at the time replaces
 * the one in the current setting; with refraction switched off it stays off.
 */
export function airFor(m, air) {
  return air && m.tempC !== null && m.tempC !== undefined ? { ...air, tempC: m.tempC } : air;
}

/** The place on Earth that the sun, or the star that was measured, stood over when the measurement was taken. */
export function overheadPoint(m) {
  const date = new Date(m.t);
  return m.star ? starPoints(date, [SKY_BODIES[starIndex(m.star)]])[0] : subsolarPoint(date);
}

/**
 * The flat model's settings for what was measured. The stars have a height of
 * their own (`starHeightKm`), and nothing limits how far their light reaches.
 */
export function flatParamsFor(m, flatParams) {
  // If the flat model's light bends, starlight bends as much as sunlight does.
  return m.star
    ? { sunHeightKm: flatParams.starHeightKm ?? flatParams.sunHeightKm, lightRangeKm: Infinity, bendPerKm: flatBendPerKm(flatParams) }
    : flatParams;
}

/** Both models' predictions for one measurement, and how far each one is off. */
export function scoreMeasurement(m, flatParams, air = STANDARD_AIR) {
  const sub = overheadPoint(m);
  const own = airFor(m, air);
  const globe = globePredict(sub, m.lat, m.lon, own);
  const flat = flatPredict(sub, m.lat, m.lon, flatParamsFor(m, flatParams), own);
  return {
    sub,
    air: own,
    globe,
    flat,
    globeMiss: measurementMiss(m, globe),
    flatMiss: measurementMiss(m, flat),
    // The flat-model height, of the sun or of the stars, that would reproduce this one elevation.
    implied: impliedSunHeightKm(sub, m.lat, m.lon, m.el, m.star ? { bendPerKm: flatBendPerKm(flatParams) } : { bendSetKm: flatParams.bendSetKm }),
  };
}

const rms = (values) => (values.length ? Math.sqrt(values.reduce((a, v) => a + v * v, 0) / values.length) : null);

/** The one flat-model height that fits a set of scored measurements best, and how far it still misses. */
function bestHeight(scored, flatParams, minKm, maxKm, steps) {
  const heightAt = (x) => minKm * Math.pow(maxKm / minKm, x);
  const missAt = (x) =>
    rms(
      scored.map((s) =>
        measurementMiss(s.m, flatPredict(s.sub, s.m.lat, s.m.lon, { ...flatParamsFor(s.m, flatParams), sunHeightKm: heightAt(x) }, s.air)),
      ),
    );
  // Coarse sweep over the whole range, then narrow in around the best step.
  let bestStep = 0;
  let bestMiss = Infinity;
  for (let i = 0; i <= steps; i++) {
    const value = missAt(i / steps);
    if (value < bestMiss) [bestStep, bestMiss] = [i, value];
  }
  let lo = Math.max(0, bestStep - 1) / steps;
  let hi = Math.min(steps, bestStep + 1) / steps;
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (missAt(a) < missAt(b)) hi = b;
    else lo = a;
  }
  return { heightKm: heightAt((lo + hi) / 2), rms: Math.min(bestMiss, missAt((lo + hi) / 2)) };
}

/** What a set of measurements of one kind (the sun, or the stars) says about the flat model's height for it. */
function summariseKind(scored, flatParams, minKm, maxKm, steps) {
  if (!scored.length) return null;
  const implied = scored.map((s) => s.implied).filter((h) => h !== null);
  return {
    count: scored.length,
    best: bestHeight(scored, flatParams, minKm, maxKm, steps),
    impliedMin: implied.length ? Math.min(...implied) : null,
    impliedMax: implied.length ? Math.max(...implied) : null,
  };
}

/**
 * Typical miss of each model over a set of measurements. The flat model has one
 * height for the sun and another for the stars, so the two kinds are fitted
 * apart: `sun` and `stars` each hold the single height that fits that kind
 * best, or are null when there are none of that kind. `bestRms` is the flat
 * model's typical miss with both heights at their best.
 */
export function summariseMeasurements(list, flatParams, air = STANDARD_AIR, minKm = 100, maxKm = 1e6, steps = 180) {
  if (!list.length) return null;
  const scored = list.map((m) => ({ m, ...scoreMeasurement(m, flatParams, air) }));
  const sun = summariseKind(scored.filter((s) => !s.m.star), flatParams, minKm, maxKm, steps);
  const stars = summariseKind(scored.filter((s) => s.m.star), flatParams, minKm, maxKm, steps);
  const atBest = scored.map((s) => {
    const heightKm = (s.m.star ? stars : sun).best.heightKm;
    return measurementMiss(s.m, flatPredict(s.sub, s.m.lat, s.m.lon, { ...flatParamsFor(s.m, flatParams), sunHeightKm: heightKm }, s.air));
  });
  return {
    scored,
    globeRms: rms(scored.map((s) => s.globeMiss)),
    flatRms: rms(scored.map((s) => s.flatMiss)),
    bestRms: rms(atBest),
    sun,
    stars,
    // The sun's own figures, under the names they had before stars could be measured.
    best: sun?.best ?? null,
    impliedMin: sun?.impliedMin ?? null,
    impliedMax: sun?.impliedMax ?? null,
  };
}

/** Checks and tidies one measurement. Returns null if it cannot be used. */
export function cleanMeasurement(raw) {
  const blank = (v) => v === null || v === undefined || v === '';
  const num = (v) => (blank(v) ? NaN : Number(v));
  const t = Math.round(num(raw.t) / 1000) * 1000;
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  const el = num(raw.el);
  const az = blank(raw.az) ? null : Number(raw.az);
  // A temperature that cannot be read is dropped; the measurement itself is still good.
  const temp = num(raw.tempC);
  const [coldest, hottest] = AIR_LIMITS.tempC;
  // A star the app does not know cannot be scored, and must not be scored as the sun.
  const star = blank(raw.star) ? null : String(raw.star);
  if (star !== null && starIndex(star) < 0) return null;
  if (![t, lat, lon, el].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || el < 0 || el > 90) return null;
  if (az !== null && (!Number.isFinite(az) || az < 0 || az > 360)) return null;
  if (Number.isNaN(new Date(t).getTime())) return null;
  return {
    t,
    lat: Number(lat.toFixed(3)),
    lon: Number(lon.toFixed(3)),
    el: Number(el.toFixed(2)),
    az: az === null ? null : Number((az % 360).toFixed(1)),
    label: String(raw.label ?? '').replace(/[,;]/g, ' ').trim().slice(0, 30),
    tempC: Number.isFinite(temp) && temp >= coldest && temp <= hottest ? Number(temp.toFixed(1)) : null,
    star,
  };
}

export const measurementKey = (m) => `${m.t}|${m.lat}|${m.lon}|${m.el}|${m.az ?? ''}|${m.star ?? ''}`;

/** Joins lists, dropping duplicates and anything unusable, oldest first. Of two copies, one with a temperature wins. */
export function mergeMeasurements(...lists) {
  const seen = new Map();
  for (const raw of lists.flat()) {
    const m = cleanMeasurement(raw);
    if (!m) continue;
    const kept = seen.get(measurementKey(m));
    if (!kept || (kept.tempC === null && m.tempC !== null)) seen.set(measurementKey(m), m);
  }
  return [...seen.values()].sort((a, b) => a.t - b.t).slice(0, MAX_MEASUREMENTS);
}

/** Compact text form for a shareable link: `time,lat,lon,el,az,label,temperature,star;...`. Empty fields at the end are left off. */
export function encodeMeasurements(list) {
  return list
    .map((m) =>
      [new Date(m.t).toISOString().slice(0, 19) + 'Z', m.lat, m.lon, m.el, m.az ?? '', m.label, m.tempC ?? '', m.star ?? ''].join(',').replace(/,+$/, ''),
    )
    .join(';');
}

export function decodeMeasurements(text) {
  if (!text) return [];
  return mergeMeasurements(
    text.split(';').map((part) => {
      const [time, lat, lon, el, az, label, tempC, star] = part.split(',');
      return { t: Date.parse(time), lat, lon, el, az, label, tempC, star };
    }),
  );
}
