// A turning globe: how fast the ground moves, how much the turn takes off
// your weight, and how fast a pendulum's swing turns against the floor.
//
// The sky is seen to turn once in a sidereal day, a little under 24 hours.
// These are what follows if it is the Earth that turns.
import { DEG, EARTH_RADIUS_KM } from './astro.js';

/** One turn against the stars, in hours. */
export const SIDEREAL_DAY_HOURS = 23.9344696;
/** The same as a rate: degrees an hour. A clock's hour hand turns 30. */
export const TURN_DEG_PER_HOUR = 360 / SIDEREAL_DAY_HOURS;

const GRAVITY = 9.80665; // metres per second squared
const TURN_RAD_PER_SEC = (2 * Math.PI) / (SIDEREAL_DAY_HOURS * 3600);

/**
 * Speed of the ground at a latitude, in km/h: once round a circle of radius
 * R cos φ in a sidereal day.
 */
export function groundSpeedKmh(lat) {
  return (2 * Math.PI * EARTH_RADIUS_KM * Math.cos(lat * DEG)) / SIDEREAL_DAY_HOURS;
}

/**
 * The fraction the turn takes off your weight at a latitude. Moving in a
 * circle of radius R cos φ takes a pull of ω² R cos φ toward the axis; the
 * part of that along the vertical is ω² R cos² φ, to be set against gravity g.
 */
export function weightLost(lat) {
  const cos = Math.cos(lat * DEG);
  return (TURN_RAD_PER_SEC * TURN_RAD_PER_SEC * EARTH_RADIUS_KM * 1000 * cos * cos) / GRAVITY;
}

/**
 * How fast the line of a pendulum's swing turns against the floor, in degrees
 * an hour: the Earth's rate of turning times sin φ. Nothing at the equator,
 * the full rate at the poles, and the other way round in the south.
 */
export function pendulumDegPerHour(lat) {
  return TURN_DEG_PER_HOUR * Math.sin(lat * DEG);
}
