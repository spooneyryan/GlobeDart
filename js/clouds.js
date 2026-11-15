// Which side of a cloud the sun lights.
//
// After the sun has set on the ground, clouds overhead are often lit from
// beneath, and from an aircraft above them their tops are in shade. Each model
// is asked the same question: when the light arrives at a cloud, is it
// travelling downward or upward, and does it arrive at all?
import { DEG, EARTH_RADIUS_KM } from './astro.js';
import { flatBendPerKm } from './models.js';
import { sunSinkDegPerHour } from './horizon.js';

/** The answers: lit on top, lit from beneath, or no sunlight at all. */
export const CLOUD_SIDES = Object.freeze(['top', 'under', 'dark']);

const side = (elDeg, reaches) => (!reaches ? 'dark' : elDeg > 0 ? 'top' : 'under');

/**
 * Globe: how far below level something h up can see over the curve, in degrees:
 *   acos(R ÷ (R + h))
 * The sun can be that far below level and still shine on it.
 */
export function levelDropDeg(heightKm) {
  return Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(0, heightKm))) / DEG;
}

/**
 * Globe: how high the Earth's shadow reaches straight overhead when the sun
 * is e below level there, in km:
 *   R × (1 ÷ cos e − 1)
 * Nothing while the sun is up. It is the same rule as levelDropDeg, turned round.
 */
export function shadowHeightKm(sunElDeg) {
  if (sunElDeg >= 0) return 0;
  if (sunElDeg <= -90) return Infinity;
  return EARTH_RADIUS_KM * (1 / Math.cos(sunElDeg * DEG) - 1);
}

/**
 * Globe: the light on a cloud h up, where the sun is at height e by geometry
 * (negative once it is below level). The sun is so far away that it is at the
 * same height from the cloud as from the ground beneath it.
 *
 *   above level                 the light comes down: the top is lit
 *   below, by less than the drop    the light comes up from over the curve: the underside is lit
 *   below, by more              the Earth is in the way: no light
 */
export function globeCloudLight(heightKm, sunElDeg) {
  const reaches = sunElDeg > -levelDropDeg(heightKm) || sunElDeg >= 0;
  return { el: sunElDeg, reaches, side: side(sunElDeg, reaches) };
}

/**
 * Globe: for how many minutes a cloud h up is lit from beneath as the sun
 * sets: the drop it can see over, at the rate the sun sinks. Null where the
 * sun does not set that day.
 */
export function litBelowMinutes(heightKm, lat, sunLat) {
  const rate = sunSinkDegPerHour(lat, sunLat);
  return rate === null ? null : (levelDropDeg(heightKm) / rate) * 60;
}

/**
 * Flat: the light on a cloud h up, a distance d over the map from the place
 * the sun is overhead. `params` is what flatPredict takes.
 *
 * Straight light. The sun is H up, far above any cloud, so its light always
 * comes down:
 *   height of the sun from the cloud = atan((H − h) ÷ d)
 * and the top is lit, unless the place is beyond the reach the model gives
 * the sun's light, when nothing is.
 *
 * Bending light. With c the amount of curve (flatBendPerKm), light that left
 * the sun at slope s₀ is at height H + s₀·x + c·x²/2 after a distance x. To
 * arrive at the cloud:
 *   s₀ = (h − H − c × d² ÷ 2) ÷ d
 *   height of the sun from the cloud = atan((H − h − c × d² ÷ 2) ÷ d)
 * Once that is below level the light is travelling upward, having passed its
 * lowest point on the way, at height H − s₀² ÷ 2c. If that is under the
 * ground, the light never arrives.
 */
export function flatCloudLight(heightKm, groundKm, params) {
  const d = Math.max(Math.abs(groundKm), 1e-6);
  const drop = params.sunHeightKm - heightKm;
  const bend = flatBendPerKm(params);
  if (!bend) {
    const el = Math.atan2(drop, d) / DEG;
    const reaches = d <= (params.lightRangeKm ?? Infinity);
    return { el, reaches, side: side(el, reaches), leavesAt: -drop / d, bend: 0 };
  }
  const leavesAt = -(drop + (bend * d * d) / 2) / d;
  const el = Math.atan2(drop - (bend * d * d) / 2, d) / DEG;
  const lowestKm = params.sunHeightKm - (leavesAt * leavesAt) / (2 * bend);
  const reaches = el > 0 || lowestKm >= 0;
  return { el, reaches, side: side(el, reaches), leavesAt, bend };
}
