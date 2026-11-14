// Distances between places under each model, and the real non-stop flights
// that let anyone test them with a timetable.
import { DEG, EARTH_RADIUS_KM } from './astro.js';
import { globeVec, globeAngleDeg, flatMapDistanceKm } from './models.js';

/** Airliners cruise at roughly this ground speed in still air. */
export const CRUISE_KMH = 900;
/** Speed of sound at cruising altitude (about -56 °C). No airliner in service flies faster. */
export const SOUND_KMH = 1060;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Shortest distance over the surface of the globe, in km: the Earth's radius
 * times the angle between the two places as seen from its centre.
 *   R × acos(sin φ₁ sin φ₂ + cos φ₁ cos φ₂ cos Δλ)
 */
export function globeDistanceKm(a, b) {
  return globeAngleDeg(a.lat, a.lon, b.lat, b.lon) * DEG * EARTH_RADIUS_KM;
}

/**
 * Shortest distance on the flat map, in km: a straight line. With a and b the
 * two places' distances from the pole, and Δλ the angle between them there:
 *   √(a² + b² − 2ab cos Δλ)
 */
export function flatDistanceKm(a, b) {
  return flatMapDistanceKm(a.lat, a.lon, b.lat, b.lon);
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

/**
 * Scheduled time in the air and on the ground between the gates, in hours,
 * from a timetable's local times.
 *
 * @param dep        local departure time, "hh:mm"
 * @param depZone    the departure airport's clock, in hours ahead of UTC
 * @param arr        local arrival time, "hh:mm"
 * @param arrZone    the arrival airport's clock, in hours ahead of UTC
 * @param nextDay    how many calendar days after leaving it arrives, by the local dates
 */
export function blockHours(dep, depZone, arr, arrZone, nextDay = 0) {
  const clock = (text) => {
    const [h, m] = text.split(':').map(Number);
    return h + m / 60;
  };
  return clock(arr) - arrZone + 24 * nextDay - (clock(dep) - depZone);
}

// One timetabled flight: its number, local departure and arrival, each airport's clock
// against UTC on that date, and whether it lands on a later local date.
const leg = (flight, dep, depZone, arr, arrZone, nextDay = 0) => ({
  flight,
  dep,
  depZone,
  arr,
  arrZone,
  nextDay,
  hours: blockHours(dep, depZone, arr, arrZone, nextDay),
});

/**
 * Non-stop passenger routes with one timetabled flight in each direction, as
 * scheduled for the week of 10 to 16 November 2026. Times differ by direction
 * because of the wind, and shift by a quarter of an hour or so with the
 * season, so the average of the two directions is used to work out a speed.
 *
 * The times were read on 13 November 2026: Qantas, British Airways and Japan
 * Airlines from each airline's own site, LATAM from airport boards and
 * FlightAware because LATAM's site refused the lookup. docs/flight-times.md
 * has the sources. Clocks are those in force that week: Sydney +11, Perth +8,
 * Auckland +13, Santiago and São Paulo −3, Johannesburg and Cape Town +2,
 * London 0, New York −5, Los Angeles −8, Tokyo +9.
 */
const TIMETABLE = [
  ['Sydney', 'Santiago', 'Qantas', leg('QF27', '10:35', 11, '09:05', -3), leg('QF28', '13:00', -3, '17:10', 11, 1)],
  ['Sydney', 'Johannesburg', 'Qantas', leg('QF63', '09:30', 11, '15:00', 2), leg('QF64', '17:35', 2, '14:30', 11, 1)],
  ['Santiago', 'Auckland', 'LATAM', leg('LA801', '12:55', -3, '17:15', 13, 1), leg('LA800', '19:45', 13, '14:50', -3)],
  ['Perth', 'Johannesburg', 'Qantas', leg('QF65', '13:15', 8, '18:25', 2), leg('QF66', '21:35', 2, '13:15', 8, 1)],
  ['São Paulo', 'Johannesburg', 'LATAM', leg('LA8058', '22:50', -3, '12:45', 2, 1), leg('LA8059', '15:35', 2, '20:25', -3)],
  ['Sydney', 'Perth', 'Qantas', leg('QF643', '08:10', 11, '10:10', 8), leg('QF648', '11:20', 8, '18:30', 11)],
  ['London', 'Cape Town', 'British Airways', leg('BA59', '22:20', 0, '12:10', 2, 1), leg('BA58', '18:55', 2, '04:55', 0, 1)],
  ['London', 'New York', 'British Airways', leg('BA117', '08:20', 0, '11:20', -5), leg('BA112', '18:10', -5, '06:15', 0, 1)],
  ['Los Angeles', 'Tokyo', 'Japan Airlines', leg('JL15', '12:30', -8, '17:35', 9, 1), leg('JL16', '17:05', 9, '10:00', -8)],
];

/**
 * The routes as the rest of the app uses them. `there` is the scheduled time
 * from -> to in hours and `back` is to -> from, both worked out from the
 * timetable above. `flights` names the two services so anyone can look them up.
 */
export const ROUTES = TIMETABLE.map(([from, to, airline, out, home]) => ({
  from,
  to,
  there: out.hours,
  back: home.hours,
  flights: `${airline} ${out.flight} and ${home.flight}`,
  out,
  home,
}));

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

/**
 * Four places on a flat sheet, from five of the six distances between them.
 *
 * Any three places can be drawn flat from their three distances: A at the
 * start, B straight along from it, C above the line. A fourth place D is then
 * fixed by its distances to A and B, to one of two spots: one on C's side of
 * the line AB and one on the other. So a flat sheet allows only two values for
 * the sixth distance, from C to D. If the real one is neither, the four places
 * are not on a flat surface, whatever map is drawn of them.
 *
 * Returns the places as [x, y] pairs, with the two candidates for D and the
 * distance from C to each: first the one on C's side, then the other.
 */
export function flatSheetLayout({ ab, ac, bc, ad, bd }) {
  const along = (toA, toB) => (ab * ab + toA * toA - toB * toB) / (2 * ab);
  const off = (toA, x) => Math.sqrt(Math.max(0, toA * toA - x * x));
  const cx = along(ac, bc);
  const cy = off(ac, cx);
  const dx = along(ad, bd);
  const dy = off(ad, dx);
  return {
    a: [0, 0],
    b: [ab, 0],
    c: [cx, cy],
    d: [[dx, dy], [dx, -dy]],
    cd: [Math.hypot(cx - dx, cy - dy), Math.hypot(cx - dx, cy + dy)],
  };
}
