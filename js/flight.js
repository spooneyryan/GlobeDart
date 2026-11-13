// Level flight over each model: how fast the nose has to come down to follow
// the surface, and what would happen if it did not.
//
// Speeds are in km/h, heights in metres, times in minutes unless a name says otherwise.
import { DEG, EARTH_RADIUS_KM } from './astro.js';

export const FLIGHT_LIMITS = Object.freeze({ speedKmh: [100, 3000], altitudeM: [0, 20000], minutes: [1, 120] });

const GRAVITY = 9.80665; // metres per second squared

/** Radius of the circle an aircraft flies when it holds its height, in km. */
const pathRadiusKm = (altitudeM) => EARTH_RADIUS_KM + altitudeM / 1000;

/**
 * How fast the nose comes down, in degrees per minute, for an aircraft that
 * holds its height above a globe. It is simply the rate at which it goes round.
 */
export function pitchRateDegPerMin(speedKmh, altitudeM = 0) {
  return speedKmh / pathRadiusKm(altitudeM) / DEG / 60;
}

/** Hours to fly once round the globe at a steady speed and height. */
export function hoursRound(speedKmh, altitudeM = 0) {
  return (2 * Math.PI * pathRadiusKm(altitudeM)) / speedKmh;
}

/**
 * Height gained, in metres, by an aircraft that flew a dead straight line
 * instead: nose fixed against the stars, the ground falling away beneath it.
 */
export function climbIfStraightM(speedKmh, minutes, altitudeM = 0) {
  const r = pathRadiusKm(altitudeM);
  const along = (speedKmh * minutes) / 60;
  return (Math.hypot(r, along) - r) * 1000;
}

/**
 * The period, in minutes, of a pendulum as long as the Earth's radius. An
 * inertial navigation unit is tuned to it so that it keeps track of which way
 * is down as it is carried round the globe.
 */
export function schulerMinutes() {
  return (2 * Math.PI * Math.sqrt((EARTH_RADIUS_KM * 1000) / GRAVITY)) / 60;
}

/** Everything the views and tables need for one flight. The flat model's answers are all zero. */
export function flightScene({ speedKmh, altitudeM, minutes }) {
  const rate = pitchRateDegPerMin(speedKmh, altitudeM);
  return {
    speedKmh,
    altitudeM,
    minutes,
    rateDegPerMin: rate,
    turnDeg: rate * minutes,
    hoursRound: hoursRound(speedKmh, altitudeM),
    distanceKm: (speedKmh * minutes) / 60,
    climbM: climbIfStraightM(speedKmh, minutes, altitudeM),
    // How far the ground has fallen below a level line by the end of the stretch.
    dropM: climbIfStraightM(speedKmh, minutes, 0),
  };
}
