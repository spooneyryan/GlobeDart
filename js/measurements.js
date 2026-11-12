// Measurements the user took themselves, and how each model scores against them.
//
// A measurement is { t, lat, lon, el, az, label }:
//   t      time it was taken, milliseconds since the epoch
//   el     sun's elevation above the horizon, degrees
//   az     compass bearing to the sun, degrees from true north, or null if not measured
import { DEG, subsolarPoint, wrap360 } from './astro.js';
import { globePredict, flatPredict, impliedSunHeightKm, skySeparation } from './models.js';

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

/** Both models' predictions for one measurement, and how far each one is off. */
export function scoreMeasurement(m, flatParams, refraction = true) {
  const sub = subsolarPoint(new Date(m.t));
  const globe = globePredict(sub, m.lat, m.lon, refraction);
  const flat = flatPredict(sub, m.lat, m.lon, flatParams, refraction);
  return {
    sub,
    globe,
    flat,
    globeMiss: measurementMiss(m, globe),
    flatMiss: measurementMiss(m, flat),
    // Flat-model sun height that would reproduce this one elevation.
    implied: impliedSunHeightKm(sub, m.lat, m.lon, m.el),
  };
}

const rms = (values) => (values.length ? Math.sqrt(values.reduce((a, v) => a + v * v, 0) / values.length) : null);

/**
 * Typical miss of each model over a set of measurements, plus the single flat-model
 * sun height that fits all of them best.
 */
export function summariseMeasurements(list, flatParams, refraction = true, minKm = 100, maxKm = 1e6, steps = 180) {
  if (!list.length) return null;
  const scored = list.map((m) => ({ m, ...scoreMeasurement(m, flatParams, refraction) }));
  const heightAt = (x) => minKm * Math.pow(maxKm / minKm, x);
  const missAt = (x) =>
    rms(
      scored.map((s) =>
        measurementMiss(s.m, flatPredict(s.sub, s.m.lat, s.m.lon, { ...flatParams, sunHeightKm: heightAt(x) }, refraction)),
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
  const best = { heightKm: heightAt((lo + hi) / 2), rms: Math.min(bestMiss, missAt((lo + hi) / 2)) };
  const implied = scored.map((s) => s.implied).filter((h) => h !== null);
  return {
    scored,
    globeRms: rms(scored.map((s) => s.globeMiss)),
    flatRms: rms(scored.map((s) => s.flatMiss)),
    best,
    impliedMin: implied.length ? Math.min(...implied) : null,
    impliedMax: implied.length ? Math.max(...implied) : null,
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
  };
}

export const measurementKey = (m) => `${m.t}|${m.lat}|${m.lon}|${m.el}|${m.az ?? ''}`;

/** Joins lists, dropping duplicates and anything unusable, oldest first. */
export function mergeMeasurements(...lists) {
  const seen = new Map();
  for (const raw of lists.flat()) {
    const m = cleanMeasurement(raw);
    if (m && !seen.has(measurementKey(m))) seen.set(measurementKey(m), m);
  }
  return [...seen.values()].sort((a, b) => a.t - b.t).slice(0, MAX_MEASUREMENTS);
}

/** Compact text form for a shareable link: `time,lat,lon,el,az,label;...`. */
export function encodeMeasurements(list) {
  return list
    .map((m) => [new Date(m.t).toISOString().slice(0, 19) + 'Z', m.lat, m.lon, m.el, m.az ?? '', m.label].join(','))
    .join(';');
}

export function decodeMeasurements(text) {
  if (!text) return [];
  return mergeMeasurements(
    text.split(';').map((part) => {
      const [time, lat, lon, el, az, ...label] = part.split(',');
      return { t: Date.parse(time), lat, lon, el, az, label: label.join(' ') };
    }),
  );
}
