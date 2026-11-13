// What is hidden behind the horizon, under each model.
//
// Light passing close to the ground is bent by the air, usually downward. The
// amount is described the way surveyors do, by a coefficient k: the Earth's
// radius divided by the radius of the light's curve. k = 0 is a straight line,
// k = 1 is light that follows the surface all the way round.
//
// Heights are in metres and distances in kilometres. The formulas are the
// usual surveying ones, good while heights and distances are small next to the
// size of the Earth.
import { DEG, EARTH_RADIUS_KM } from './astro.js';

/** The standard atmosphere, cooling by 6.5 °C per kilometre of height, gives about this. */
export const K_STANDARD = 0.17;
/** The value surveyors have used since Gauss, for daytime sights over land. */
export const K_SURVEY = 0.13;
/** Air near the ground in the standard atmosphere. `lapse` is °C per metre of height. */
export const STANDARD_GROUND_AIR = Object.freeze({ tempC: 15, pressureHpa: 1013.25, lapse: -0.0065 });
/** Air that cools faster than this with height is denser above than below, and overturns. */
export const OVERTURNING_LAPSE = -0.0343;

/** The bending coefficient for air of a given temperature, pressure and change of temperature with height. */
export function coefficientFromWeather({ tempC, pressureHpa, lapse }) {
  const t = tempC + 273.15;
  return ((503 * pressureHpa) / (t * t)) * (-OVERTURNING_LAPSE + lapse);
}

/** The reverse: the change of temperature with height (°C per metre) that gives a coefficient. */
export function lapseForCoefficient(k, { tempC, pressureHpa } = STANDARD_GROUND_AIR) {
  const t = tempC + 273.15;
  return (k * t * t) / (503 * pressureHpa) + OVERTURNING_LAPSE;
}

/**
 * Light that curves the same way as the surface makes the Earth behave as if
 * it were larger. At k = 1 and beyond, nothing is ever hidden.
 */
export function effectiveRadiusKm(k = 0) {
  return k >= 1 ? Infinity : EARTH_RADIUS_KM / (1 - k);
}

/** How far away the horizon is on the globe, for an eye at a given height. */
export function horizonDistanceKm(eyeM, k = 0) {
  const r = effectiveRadiusKm(k);
  return Number.isFinite(r) ? Math.sqrt((2 * r * Math.max(0, eyeM)) / 1000) : Infinity;
}

/** How far below eye level the horizon appears on the globe, in degrees. */
export function dipDeg(eyeM, k = 0) {
  const r = effectiveRadiusKm(k);
  return Number.isFinite(r) ? Math.sqrt((2 * Math.max(0, eyeM)) / 1000 / r) / DEG : 0;
}

/**
 * Where the line of the horizon crosses something standing at a distance,
 * measured up from its base, in metres. Nearer than the horizon, this is sea
 * seen behind it. Beyond the horizon, it is the part that is hidden.
 */
export function horizonLineM(eyeM, distanceKm, k = 0) {
  const r = effectiveRadiusKm(k);
  if (!Number.isFinite(r)) return Math.max(0, eyeM); // a flat surface, or light that follows the curve
  return ((distanceKm - horizonDistanceKm(eyeM, k)) ** 2 / (2 * r)) * 1000;
}

/** Height hidden behind the curve on the globe, in metres. Nothing is hidden this side of the horizon. */
export function hiddenHeightM(eyeM, distanceKm, k = 0) {
  return distanceKm > horizonDistanceKm(eyeM, k) ? horizonLineM(eyeM, distanceKm, k) : 0;
}

/**
 * The air the flat model would need to hide what the globe hides.
 * On a flat surface the light itself would have to curve upward, away from the
 * ground, as sharply as the globe's surface curves away from its light.
 */
export function flatNeeds(k, air = STANDARD_GROUND_AIR) {
  return { k: k - 1, lapse: lapseForCoefficient(k - 1, air) };
}

/** Everything the views and tables need for one arrangement of eye, target and air. */
export function horizonScene({ eyeM, targetM, distanceKm, k }) {
  const hiddenM = Math.min(targetM, hiddenHeightM(eyeM, distanceKm, k));
  return {
    eyeM,
    targetM,
    distanceKm,
    k,
    radiusKm: effectiveRadiusKm(k),
    horizonKm: horizonDistanceKm(eyeM, k),
    dipDeg: dipDeg(eyeM, k),
    hiddenM,
    visibleM: targetM - hiddenM,
    // The same sight with no bending at all, and in standard air, for comparison.
    hiddenNoneM: Math.min(targetM, hiddenHeightM(eyeM, distanceKm, 0)),
    hiddenStandardM: Math.min(targetM, hiddenHeightM(eyeM, distanceKm, K_STANDARD)),
    // How far away the whole target would be out of sight.
    goneKm: Number.isFinite(effectiveRadiusKm(k))
      ? horizonDistanceKm(eyeM, k) + horizonDistanceKm(targetM, k)
      : Infinity,
    // How tall the whole target looks from here, in degrees.
    looksDeg: Math.atan2(targetM / 1000, distanceKm) / DEG,
    lapse: lapseForCoefficient(k),
    flat: flatNeeds(k),
  };
}
