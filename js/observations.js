// Horizon observations the user made themselves, and what each model makes of them.
//
// An observation is { eyeM, distanceKm, targetM, hiddenM, airC, waterC, label }:
//   eyeM        height of the observer's eye above the water, metres
//   distanceKm  distance to the thing looked at
//   targetM     its true height above the water
//   hiddenM     how much of it, from the bottom up, could not be seen
//   airC        air temperature at the time, °C, or null if not noted
//   waterC      water temperature, °C, or null if not noted
import { EARTH_RADIUS_KM } from './astro.js';
import { AIR_LIMITS } from './refraction.js';
import { K_STANDARD, STANDARD_GROUND_AIR, HORIZON_LIMITS, hiddenHeightM, lapseForCoefficient } from './horizon.js';

export const MAX_OBSERVATIONS = 30;

/**
 * The bending of light that would make the globe hide exactly this much.
 * It is always below 1: no air makes the globe hide nothing at every distance
 * short of light that follows the curve.
 */
export function impliedCoefficient(eyeM, distanceKm, hiddenM) {
  const d = distanceKm * 1000;
  const curvature = (2 * (Math.sqrt(Math.max(0, hiddenM)) + Math.sqrt(eyeM)) ** 2) / (d * d);
  return 1 - EARTH_RADIUS_KM * 1000 * curvature;
}

/**
 * What each model makes of one observation.
 *
 * `bound` says how much the observation pins down. Seeing part of the target
 * fixes the bending exactly. Seeing all of it only says the bending was at
 * least so much; seeing none of it, at most so much.
 *
 * `air` puts the bending the globe needs into one of four kinds:
 *   'either'    nothing should be hidden even with straight light: both models agree
 *   'cooling'   air that gets colder with height, the usual state by day
 *   'inversion' air that gets warmer with height, as over cold water or on a still night
 *   'upward'    light bent away from the ground, as over a surface warmer than the air
 */
export function scoreObservation(o) {
  const hiddenM = Math.min(o.targetM, Math.max(0, o.hiddenM));
  const bound = hiddenM <= 0 ? 'atLeast' : hiddenM >= o.targetM ? 'atMost' : 'exact';
  const k = impliedCoefficient(o.eyeM, o.distanceKm, hiddenM);
  const here = { tempC: o.airC ?? STANDARD_GROUND_AIR.tempC, pressureHpa: STANDARD_GROUND_AIR.pressureHpa };
  const lapse = lapseForCoefficient(k, here);
  let air;
  if (bound === 'atLeast' && k <= 0) air = 'either';
  else if (bound === 'atMost') air = k >= 0 ? 'cooling' : 'upward';
  else if (k < 0) air = 'upward';
  else air = lapse <= 0 ? 'cooling' : 'inversion';
  const predicted = (coefficient) => Math.min(o.targetM, hiddenHeightM(o.eyeM, o.distanceKm, coefficient));
  // Water colder than the air chills the air next to it, which is what makes an inversion.
  const waterMinusAir = o.airC !== null && o.waterC !== null ? o.waterC - o.airC : null;
  return {
    hiddenM,
    bound,
    k,
    lapse,
    air,
    waterMinusAir,
    globe: {
      standardM: predicted(K_STANDARD),
      straightM: predicted(0),
      missM: Math.abs(predicted(K_STANDARD) - hiddenM),
    },
    flat: {
      missM: hiddenM,
      fits: hiddenM <= 0,
      // On a flat surface the light itself must supply all the curvature.
      lapse: lapseForCoefficient(k - 1, here),
    },
  };
}

/** Checks and tidies one observation. Returns null if it cannot be used. */
export function cleanObservation(raw) {
  const blank = (v) => v === null || v === undefined || v === '';
  const num = (v) => (blank(v) ? NaN : Number(v));
  const inside = (v, [lo, hi]) => Number.isFinite(v) && v >= lo * 0.999 && v <= hi * 1.001;
  const eyeM = num(raw.eyeM);
  const distanceKm = num(raw.distanceKm);
  const targetM = num(raw.targetM);
  const hiddenM = num(raw.hiddenM);
  if (!inside(eyeM, HORIZON_LIMITS.eyeM) || !inside(distanceKm, HORIZON_LIMITS.distanceKm)) return null;
  if (!inside(targetM, HORIZON_LIMITS.targetM) || !Number.isFinite(hiddenM) || hiddenM < 0) return null;
  // A temperature that cannot be read is dropped; the observation itself is still good.
  const temperature = (v) => {
    const t = num(v);
    return Number.isFinite(t) && t >= AIR_LIMITS.tempC[0] && t <= AIR_LIMITS.tempC[1] ? Number(t.toFixed(1)) : null;
  };
  const round = (v) => Number(v.toFixed(v >= 100 ? 1 : 2));
  return {
    eyeM: round(eyeM),
    distanceKm: round(distanceKm),
    targetM: round(targetM),
    hiddenM: round(Math.min(hiddenM, targetM)),
    airC: temperature(raw.airC),
    waterC: temperature(raw.waterC),
    label: String(raw.label ?? '').replace(/[,;]/g, ' ').trim().slice(0, 30),
  };
}

export const observationKey = (o) => `${o.eyeM}|${o.distanceKm}|${o.targetM}|${o.hiddenM}`;

/** Joins lists, dropping duplicates and anything unusable, in the order given. */
export function mergeObservations(...lists) {
  const seen = new Map();
  for (const raw of lists.flat()) {
    const o = cleanObservation(raw);
    if (o && !seen.has(observationKey(o))) seen.set(observationKey(o), o);
  }
  return [...seen.values()].slice(0, MAX_OBSERVATIONS);
}

/** Compact text form for a shareable link: `eye,distance,height,hidden,air,water,label;...`. */
export function encodeObservations(list) {
  return list
    .map((o) => [o.eyeM, o.distanceKm, o.targetM, o.hiddenM, o.airC ?? '', o.waterC ?? '', o.label].join(','))
    .join(';');
}

export function decodeObservations(text) {
  if (!text) return [];
  return mergeObservations(
    text.split(';').map((part) => {
      const [eyeM, distanceKm, targetM, hiddenM, airC, waterC, label] = part.split(',');
      return { eyeM, distanceKm, targetM, hiddenM, airC, waterC, label };
    }),
  );
}
