// The two competing models. Both receive exactly the same input: the point on
// Earth where the sun is overhead right now (an observable fact), and the
// observer's latitude and longitude. Each predicts where the sun appears in
// that observer's sky. Neither is given the answer.
//
// Each prediction is worked out as plain geometry (`trueEl`) and then lifted by
// the same air as the measurement (`el`).
import { DEG, EARTH_RADIUS_KM, SUN_RADIUS_KM, MOON_RADIUS_KM, wrap360 } from './astro.js';
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

/**
 * The angle in degrees between two directions in the sky, each a bearing and a height e:
 *   acos(sin e₁ sin e₂ + cos e₁ cos e₂ cos(bearing₁ − bearing₂))
 * This is the "miss" between where a model puts something and where it is measured.
 */
export function skySeparation(a, b) {
  const e1 = a.el * DEG;
  const e2 = b.el * DEG;
  const c =
    Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos((a.az - b.az) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

// The symbols used below, and in the explanations the app shows (js/explain.js):
//   φ   the observer's latitude
//   δ   the latitude of the place the sun (or a star) is directly overhead
//   Δλ  how far east of the observer that place is, in longitude
//   H   the height the flat model gives the sun
//   d   distance on the flat map from the observer to the place under the sun

/**
 * The angle, in degrees, between two places as seen from the centre of the globe:
 *   acos(sin φ₁ sin φ₂ + cos φ₁ cos φ₂ cos Δλ)
 * Multiplied by the Earth's radius it is the shortest distance between them.
 */
export function globeAngleDeg(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;
  const cosAngle = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos((lon2 - lon1) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, cosAngle))) / DEG;
}

/**
 * How far a place is from the north pole on the flat map, in km. The map
 * keeps every place at its true distance from the pole, so the equator is a
 * circle 10,008 km out and the south pole is the rim.
 */
export function flatPoleDistanceKm(lat) {
  return (90 - lat) * DEG * EARTH_RADIUS_KM;
}

/**
 * Straight-line distance between two places on the flat map, in km. With a
 * and b their distances from the pole, and Δλ the angle between them there:
 *   √(a² + b² − 2ab cos Δλ)
 */
export function flatMapDistanceKm(lat1, lon1, lat2, lon2) {
  const a = flatPoleDistanceKm(lat1);
  const b = flatPoleDistanceKm(lat2);
  return Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos((lon2 - lon1) * DEG)));
}

/**
 * Globe model: a sphere, with the sun so far away that its rays arrive parallel.
 *
 *   height   = asin(sin φ sin δ + cos φ cos δ cos Δλ)
 *   bearing  = atan2(cos δ sin Δλ, cos φ sin δ − sin φ cos δ cos Δλ)
 *
 * The height is 90° less the angle round the Earth between the observer and
 * the place under the sun. The bearing is the direction, at the observer, of
 * the shortest path over the surface to that place.
 *
 * Returns the bearing `az`, the height by geometry alone `trueEl`, and the
 * height with the lift from the air added, `el`.
 */
export function globePredict(sub, lat, lon, air = STANDARD_AIR) {
  const phi = lat * DEG;
  const delta = sub.lat * DEG;
  const dLambda = (sub.lon - lon) * DEG;
  const sinHeight = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dLambda);
  const trueEl = Math.asin(Math.min(1, Math.max(-1, sinHeight))) / DEG;
  const east = Math.cos(delta) * Math.sin(dLambda);
  const north = Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(dLambda);
  const az = wrap360(Math.atan2(east, north) / DEG);
  return { az, el: trueEl + lift(trueEl, air), trueEl, sizeDeg: sub.sizeDeg };
}

/**
 * Flat model: a small sun at a fixed height H above the flat map, directly
 * over the place it is overhead. Plain straight-line geometry.
 *
 * With a and b the distances from the pole, on the map, of the observer and
 * of the place under the sun, and Δλ the angle between the two at the pole:
 *
 *   north    = a − b cos Δλ        how far toward the pole that place is from the observer
 *   east     = b sin Δλ            and how far to the right of that line
 *   d        = √(north² + east²)   its distance from the observer on the map
 *   bearing  = atan2(east, north)
 *   height   = atan(H ÷ d)
 *
 * The sun's real width is chosen so that it looks the right size from
 * directly underneath, the most generous choice there is:
 *
 *   w        = 2 × H × tan(width ÷ 2)
 *   s        = √(d² + H²)          straight-line distance from the observer to the sun
 *   width    = 2 × atan(w ÷ 2s)    what it should then show from the observer
 *
 * A variant some supporters propose has light curve upward as it travels, so
 * that a far-off sun looks lower than it is and can set. With c the amount of
 * curve (see flatBendPerKm), a ray that leaves the eye at slope s is at height
 * s·x + c·x²/2 after a distance x, and has to reach H at d:
 *
 *   height   = atan((H − c × d² ÷ 2) ÷ d)
 *
 * The bearing is not changed by it: the light bends up, not sideways.
 */
export function flatPredict(sub, lat, lon, params, air = STANDARD_AIR) {
  const heightKm = params.sunHeightKm;
  const bend = flatBendPerKm(params);
  const a = flatPoleDistanceKm(lat);
  const b = flatPoleDistanceKm(sub.lat);
  const dLambda = (sub.lon - lon) * DEG;
  const north = a - b * Math.cos(dLambda);
  const east = b * Math.sin(dLambda);
  const groundKm = Math.hypot(north, east);
  const trueEl = Math.atan2(heightKm - (bend * groundKm * groundKm) / 2, groundKm) / DEG;
  const az = wrap360(Math.atan2(east, north) / DEG);
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
 * How much light curves upward in the "bending light" version of the flat
 * model, per km travelled. Nothing fixes this number, so it is set from what
 * it is there to explain: the sun, H up, is seen exactly on the horizon from
 * the distance its light is said to reach.
 *
 *   c = 2 × H ÷ reach²
 *
 * `params.bendSetKm` is that reach, and goes with the sun's own height. The
 * stars and the moon are seen by the same light, so they are handed the sun's
 * figure ready-made as `params.bendPerKm`. With neither, light is straight.
 */
export function flatBendPerKm(params) {
  if (params.bendPerKm !== undefined) return params.bendPerKm;
  return params.bendSetKm ? (2 * params.sunHeightKm) / (params.bendSetKm * params.bendSetKm) : 0;
}

/**
 * The height the sun would have to be at, on a flat earth, to explain one
 * observer's measured height e, a distance d on the map from the place under it:
 *   H = d × tan(e)
 * If the earth were flat, every observer would get the same answer.
 *
 * With bending light (`light` as for flatBendPerKm, less the height):
 *   H = d × tan(e) + c × d² ÷ 2                  for a given amount of curve
 *   H = d × tan(e) ÷ (1 − d² ÷ reach²)           when the curve is tied to the sun's own height
 * Beyond the reach the sun cannot be above the horizon at any height, and there is no answer.
 */
export function impliedSunHeightKm(sub, lat, lon, observedElDeg, light = {}) {
  if (observedElDeg <= 0) return null;
  const d = flatMapDistanceKm(lat, lon, sub.lat, sub.lon);
  const straight = d * Math.tan(observedElDeg * DEG);
  if (light.bendPerKm !== undefined) return straight + (light.bendPerKm * d * d) / 2;
  if (!light.bendSetKm) return straight;
  return d < light.bendSetKm ? straight / (1 - (d * d) / (light.bendSetKm * light.bendSetKm)) : null;
}

// ---------- the moon ----------
//
// The moon is close enough that where you stand on the Earth changes where you
// see it, by up to a degree. So the globe model needs one more published fact
// for the moon than for the sun: its distance.

/**
 * Globe model for something near, at a distance D from the centre of the
 * Earth. With γ the angle round the Earth between the observer and the place
 * it is overhead, and R the Earth's radius:
 *
 *   height   = atan((cos γ − R ÷ D) ÷ sin γ)
 *   bearing  = the same as for something far away
 *
 * For something far away R ÷ D is nothing and this becomes 90° − γ, the
 * formula in globePredict. For the moon R ÷ D is about 1/60.
 */
export function globePredictNear(sub, lat, lon, air = STANDARD_AIR) {
  const far = globePredict(sub, lat, lon, null);
  const gamma = globeAngleDeg(lat, lon, sub.lat, sub.lon) * DEG;
  const ratio = EARTH_RADIUS_KM / sub.distKm;
  const trueEl = Math.atan2(Math.cos(gamma) - ratio, Math.sin(gamma)) / DEG;
  // It looks a little larger to someone it is overhead for, who is one Earth radius nearer.
  const nearness = 1 / Math.sqrt(1 + ratio * ratio - 2 * ratio * Math.cos(gamma));
  const sizeDeg = (2 * Math.atan(Math.tan((sub.sizeDeg / 2) * DEG) * nearness)) / DEG;
  return { az: far.az, el: trueEl + lift(trueEl, air), trueEl, sizeDeg };
}

const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const times = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** The angle in degrees between two directions given as vectors. */
export function angleBetweenDeg(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot / (Math.hypot(...a) * Math.hypot(...b))))) / DEG;
}

/** A position in space on the globe model, in km from the Earth's centre. */
export function globePlace(lat, lon, distKm = EARTH_RADIUS_KM) {
  return times(globeVec(lat, lon), distKm);
}

/** A position in space on the flat model, in km: a place on the map, and a height above it. */
export function flatPlace(lat, lon, heightKm = 0) {
  const v = flatVec(lat, lon);
  return [v[0] * EARTH_RADIUS_KM, heightKm, v[2] * EARTH_RADIUS_KM];
}

/**
 * How much of a ball's face is lit, as a fraction, for someone looking at it.
 * It depends only on the angle at the ball between the light and the viewer:
 *   lit = (1 + cos(angle)) ÷ 2
 * Light behind the viewer gives a full face; light behind the ball gives none.
 * The same rule serves both models. Only the positions differ.
 */
export function litFraction(sunPlace, moonPlace, eyePlace) {
  const angle = angleBetweenDeg(minus(sunPlace, moonPlace), minus(eyePlace, moonPlace));
  return (1 + Math.cos(angle * DEG)) / 2;
}

/**
 * How far apart two viewers' lines of sight to the moon are, in degrees. It is
 * how much of a different face of the moon one sees from the other.
 */
export function viewsApartDeg(moonPlace, eyeOne, eyeTwo) {
  return angleBetweenDeg(minus(eyeOne, moonPlace), minus(eyeTwo, moonPlace));
}

/**
 * Which way the lit side of the moon faces in the sky: the direction from the
 * moon toward the sun, in degrees clockwise from straight up. Each of `moon`
 * and `sun` is a bearing `az` and a height `el`.
 */
export function brightSideDeg(moon, sun) {
  const dAz = (sun.az - moon.az) * DEG;
  const eS = sun.el * DEG;
  const eM = moon.el * DEG;
  return Math.atan2(Math.cos(eS) * Math.sin(dAz), Math.sin(eS) * Math.cos(eM) - Math.cos(eS) * Math.sin(eM) * Math.cos(dAz)) / DEG;
}

/**
 * The Earth's shadow at the moon, on the globe model. The sun is larger than
 * the Earth, so the fully dark part of the shadow narrows to a point; at the
 * moon's distance D it is still wider than the moon. With R the Earth's
 * radius, and r and d the sun's radius and distance:
 *
 *   dark shadow's radius at the moon  = R − D × (r − R) ÷ d
 *
 * The Earth's air blocks light as well, which makes the shadow about a
 * fiftieth larger than the solid Earth's alone. Astronomers have allowed for
 * that since the 1700s, and so does this.
 *
 * `offDeg` is how far the moon is from the middle of the shadow, the point
 * exactly opposite the sun. The moon is eclipsed when that is less than the
 * shadow's radius plus the moon's own.
 */
export const SHADOW_GROWTH = 1.02;
export function earthShadow(sub, moon) {
  const offDeg = 180 - globeAngleDeg(sub.lat, sub.lon, moon.lat, moon.lon);
  const shadowKm = SHADOW_GROWTH * (EARTH_RADIUS_KM - (moon.distKm * (SUN_RADIUS_KM - EARTH_RADIUS_KM)) / sub.distKm);
  const shadowDeg = Math.atan(shadowKm / moon.distKm) / DEG;
  const moonDeg = Math.atan(MOON_RADIUS_KM / moon.distKm) / DEG;
  const kind = offDeg < shadowDeg - moonDeg ? 'total' : offDeg < shadowDeg + moonDeg ? 'partial' : 'none';
  return { offDeg, shadowKm, shadowDeg, moonDeg, kind };
}

/**
 * A model's score against a list of observations: the root-mean-square miss,
 *   √(average of miss²)
 * in degrees on the sky, counting only moments when the sun (or star) is
 * really above the horizon for that observer.
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
