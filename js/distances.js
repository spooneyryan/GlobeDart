// Distances between places under each model, and the real non-stop flights
// that let anyone test them with a timetable.
import { DEG, EARTH_RADIUS_KM } from './astro.js';
import { globeVec, flatVec } from './models.js';

/** Airliners cruise at roughly this ground speed in still air. */
export const CRUISE_KMH = 900;
/** Speed of sound at cruising altitude (about -56 °C). No airliner in service flies faster. */
export const SOUND_KMH = 1060;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Shortest distance over the surface of the globe (a great circle). */
export function globeDistanceKm(a, b) {
  const c = dot(globeVec(a.lat, a.lon), globeVec(b.lat, b.lon));
  return Math.acos(Math.min(1, Math.max(-1, c))) * EARTH_RADIUS_KM;
}

/** Shortest distance on the flat map: a straight line. */
export function flatDistanceKm(a, b) {
  const p = flatVec(a.lat, a.lon);
  const q = flatVec(b.lat, b.lon);
  return Math.hypot(p[0] - q[0], p[2] - q[2]) * EARTH_RADIUS_KM;
}

/** Points along the great circle from a to b, as { lat, lon }. */
export function greatCirclePath(a, b, steps = 64) {
  const p = globeVec(a.lat, a.lon);
  const q = globeVec(b.lat, b.lon);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(p, q))));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Spherical interpolation; falls back to a straight blend for two nearly identical points.
    const wa = angle < 1e-9 ? 1 - t : Math.sin((1 - t) * angle) / Math.sin(angle);
    const wb = angle < 1e-9 ? t : Math.sin(t * angle) / Math.sin(angle);
    const v = [0, 1, 2].map((k) => p[k] * wa + q[k] * wb);
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    out.push({ lat: Math.asin(v[1] / len) / DEG, lon: Math.atan2(-v[2], v[0]) / DEG });
  }
  return out;
}

const hm = (h, m) => h + m / 60;

/**
 * Non-stop passenger routes and their scheduled times in each direction, in
 * hours, as listed for November 2026 on public schedule sites. Times differ by
 * direction because of the wind, and shift by a quarter of an hour or so with
 * the season, so the average of the two directions is used to work out a speed.
 *
 * `there` is from -> to, `back` is to -> from. `flights` names one service in
 * each direction so anyone can look the times up for themselves.
 */
export const ROUTES = [
  { from: 'Sydney', to: 'Santiago', there: hm(12, 30), back: hm(14, 10), flights: 'Qantas QF27 and QF28' },
  { from: 'Sydney', to: 'Johannesburg', there: hm(14, 30), back: hm(11, 55), flights: 'Qantas QF63 and QF64' },
  { from: 'Santiago', to: 'Auckland', there: hm(12, 20), back: hm(11, 5), flights: 'LATAM LA801 and LA800' },
  { from: 'Perth', to: 'Johannesburg', there: hm(11, 10), back: hm(9, 40), flights: 'Qantas QF65 and QF66' },
  { from: 'São Paulo', to: 'Johannesburg', there: hm(8, 55), back: hm(9, 50), flights: 'LATAM LA8058 and LA8059' },
  { from: 'Sydney', to: 'Perth', there: hm(5, 0), back: hm(4, 10), flights: 'Qantas QF643 and QF648' },
  { from: 'London', to: 'Cape Town', there: hm(11, 50), back: hm(12, 0), flights: 'British Airways BA59 and BA58' },
  { from: 'London', to: 'New York', there: hm(8, 0), back: hm(7, 5), flights: 'British Airways BA117 and BA112' },
  { from: 'Los Angeles', to: 'Tokyo', there: hm(12, 5), back: hm(9, 55), flights: 'Japan Airlines JL15 and JL16' },
];

/** Distances for a pair of places, and the speeds a known flight time would need. */
export function routeStats(a, b, hours = null) {
  const globeKm = globeDistanceKm(a, b);
  const flatKm = flatDistanceKm(a, b);
  return {
    globeKm,
    flatKm,
    ratio: globeKm > 0 ? flatKm / globeKm : 1,
    hours,
    globeKmh: hours ? globeKm / hours : null,
    flatKmh: hours ? flatKm / hours : null,
  };
}
