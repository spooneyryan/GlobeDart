// Where things are in space, for the "From space" view.
//
// This is the globe model's own picture and nobody else's: the Sun in the
// middle, the Earth and the other planets going round it, the Moon going round
// the Earth, and the Earth turning once a day on a tilted axis. There is no
// flat-model version of this file, because that model has no such picture.
//
// Nothing here is worked out by the app. Every place comes from the almanac
// (Astronomy Engine, vendor/astronomy.js), which gives it as a distance along
// three fixed directions among the stars. The same almanac supplies the rest
// of the app with where the sun and moon are overhead (js/astro.js), and the
// checks hold the two against each other: the side of the Earth that faces the
// Sun in this picture is the place the almanac says the sun is overhead.
//
// Lengths are in km. The three directions this file hands out are:
//   x   from the Sun toward the point among the stars where the Sun is seen
//       at the March equinox
//   y   straight up out of the plane of the Earth's orbit, on its north side
//   z   square to both, so that the planets go round anticlockwise seen from +y
// So the Earth's orbit lies flat, and the Earth's axis leans over by 23.4°.
// These directions are fixed against the stars. They do not turn with the Earth.
import * as Astronomy from '../vendor/astronomy.js';
import { DEG, EARTH_RADIUS_KM, SUN_RADIUS_KM, MOON_RADIUS_KM } from './astro.js';

/** The tilt of the Earth's equator to the plane of its orbit at the start of 2000, in radians. */
const TILT_2000 = 23.4392911 * DEG;
const [COS_TILT, SIN_TILT] = [Math.cos(TILT_2000), Math.sin(TILT_2000)];
const MINUTE_MS = 60000;
const DAY_MS = 86400000;

/** How long the Moon takes to go once round the Earth against the stars, in days. */
export const MOON_MONTH_DAYS = 27.321661;

/**
 * Everything the view shows, in the order it is listed. `radiusKm` is each
 * body's mean radius: the Sun's and the Moon's as in js/astro.js, the planets'
 * the mean radii NASA publishes in its planetary fact sheets. `around` is what
 * it goes round.
 */
export const SPACE_BODIES = [
  { name: 'Sun', radiusKm: SUN_RADIUS_KM, around: null },
  { name: 'Mercury', radiusKm: 2439.7, around: 'Sun' },
  { name: 'Venus', radiusKm: 6051.8, around: 'Sun' },
  { name: 'Earth', radiusKm: EARTH_RADIUS_KM, around: 'Sun' },
  { name: 'Moon', radiusKm: MOON_RADIUS_KM, around: 'Earth' },
  { name: 'Mars', radiusKm: 3389.5, around: 'Sun' },
  { name: 'Jupiter', radiusKm: 69911, around: 'Sun' },
  { name: 'Saturn', radiusKm: 58232, around: 'Sun' },
];
export const SPACE_BODY = Object.fromEntries(SPACE_BODIES.map((b) => [b.name, b]));
/** The ones that go round the Sun. */
export const PLANET_NAMES = SPACE_BODIES.filter((b) => b.around === 'Sun').map((b) => b.name);

// ---------- small sums on directions ----------

const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const n = length(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
export const distanceKm = (a, b) => length(minus(a, b));

/**
 * The almanac's directions turned into this file's. The almanac measures from
 * the Earth's equator as it lay in 2000: x toward the March equinox, z toward
 * the north pole of the sky. Tipping that over by the tilt ε lays the Earth's
 * orbit flat:
 *   across =  y cos ε + z sin ε
 *   up     = −y sin ε + z cos ε
 * and then this file's (x, y, z) is (x, up, −across). `scale` turns the
 * almanac's unit of length into the one wanted.
 */
function fromAlmanac(v, scale = 1) {
  const across = v.y * COS_TILT + v.z * SIN_TILT;
  const up = -v.y * SIN_TILT + v.z * COS_TILT;
  return [v.x * scale, up * scale, -across * scale];
}

/** A direction among the stars, from the two angles a star catalogue gives for 2000: right ascension in hours, declination in degrees. */
export function starDirection(raHours, decDeg) {
  const [ra, dec] = [raHours * 15 * DEG, decDeg * DEG];
  return fromAlmanac({ x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) });
}

// ---------- where everything is ----------

/**
 * Where the middle of each body is at a moment, in km from the middle of the
 * Sun: { Sun: [0, 0, 0], Earth: [x, y, z], Moon: ..., and each planet }.
 * The almanac gives the planets from the Sun and the Moon from the Earth, so
 * the Moon's place is the Earth's with that added.
 */
export function placesInSpace(date) {
  const time = Astronomy.MakeTime(date);
  const at = { Sun: [0, 0, 0] };
  for (const name of PLANET_NAMES) at[name] = fromAlmanac(Astronomy.HelioVector(Astronomy.Body[name], time), Astronomy.KM_PER_AU);
  at.Moon = plus(at.Earth, fromAlmanac(Astronomy.GeoMoon(time), Astronomy.KM_PER_AU));
  return at;
}

/**
 * Which way round the Earth is turned at a moment: the directions in space of
 * three places on it, each one unit long.
 *   x   where the equator crosses the Greenwich meridian (latitude 0°, longitude 0°)
 *   y   the north pole
 *   z   latitude 0°, longitude 90° west
 * Those are the three axes js/models.js uses for a place on the globe
 * (globeVec), so a place p there sits at p.x × x + p.y × y + p.z × z here.
 *
 * It comes from the same rule the rest of the app uses for what is overhead
 * (js/astro.js): a place at longitude λ has overhead the part of the sky whose
 * right ascension is the Greenwich sidereal time plus λ. The almanac then
 * turns that from today's equator back to the equator of 2000.
 */
export function earthTurn(date) {
  const time = Astronomy.MakeTime(date);
  const toYear2000 = Astronomy.Rotation_EQD_EQJ(time);
  const sidereal = Astronomy.SiderealTime(time) * 15 * DEG;
  const place = (lat, lon) => {
    const [ra, dec] = [sidereal + lon * DEG, lat * DEG];
    const today = new Astronomy.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), time);
    return unit(fromAlmanac(Astronomy.RotateVector(toYear2000, today)));
  };
  return { x: place(0, 0), y: place(90, 0), z: place(0, -90) };
}

/** A place on the Earth as a direction in space from its middle, one unit long: the reverse of `overheadPlace`. */
export function placeDirection(turn, lat, lon) {
  const [p, l] = [lat * DEG, lon * DEG];
  const [x, y, z] = [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
  return [0, 1, 2].map((i) => turn.x[i] * x + turn.y[i] * y + turn.z[i] * z);
}

/**
 * The place on Earth that a direction in space is straight overhead, as
 * { lat, lon }. The direction is measured along the Earth's own three axes,
 * and then latitude is how far it leans toward the pole and longitude how far
 * round from Greenwich it is.
 */
export function overheadPlace(turn, direction) {
  const d = unit(direction);
  const [x, y, z] = [dot(d, turn.x), dot(d, turn.y), dot(d, turn.z)];
  return { lat: Math.asin(Math.max(-1, Math.min(1, y))) / DEG, lon: Math.atan2(-z, x) / DEG };
}

/**
 * One moment, with the figures the panel beside the view quotes:
 *   at             where everything is (placesInSpace)
 *   turn           how the Earth is turned (earthTurn)
 *   sun, moon      for each, the place on Earth it is overhead and its distance from the Earth's middle
 *   earthKmPerSec  how fast the Earth is moving round the Sun
 *   moonKmPerSec   how fast the Moon is moving round the Earth
 *   axisTiltDeg    the angle between the Earth's axis and straight up out of its orbit
 */
export function spaceScene(date) {
  const at = placesInSpace(date);
  const turn = earthTurn(date);
  // Speeds are how far each has gone a minute later, divided by the sixty seconds.
  const later = placesInSpace(new Date(date.getTime() + MINUTE_MS));
  const seen = (name) => {
    const from = minus(at[name], at.Earth);
    return { ...overheadPlace(turn, from), distKm: length(from) };
  };
  return {
    date,
    at,
    turn,
    sun: seen('Sun'),
    moon: seen('Moon'),
    earthKmPerSec: distanceKm(later.Earth, at.Earth) / 60,
    moonKmPerSec: distanceKm(minus(later.Moon, later.Earth), minus(at.Moon, at.Earth)) / 60,
    axisTiltDeg: Math.acos(Math.max(-1, Math.min(1, turn.y[1]))) / DEG,
  };
}

// ---------- paths, for drawing the orbits ----------

/** How long a planet takes to go once round the Sun, in days, as the almanac has it. */
export const yearDays = (name) => Astronomy.PlanetOrbitalPeriod(Astronomy.Body[name]);

/**
 * A planet's path round the Sun: its place at `steps` moments spread evenly
 * over one of its years, starting at `date`, in km from the Sun. The path is
 * the almanac's places joined up, not an ellipse fitted to them.
 */
export function planetPath(name, date, steps = 360) {
  const body = Astronomy.Body[name];
  const stepMs = (yearDays(name) * DAY_MS) / steps;
  return Array.from({ length: steps }, (_, i) =>
    fromAlmanac(Astronomy.HelioVector(body, Astronomy.MakeTime(new Date(date.getTime() + i * stepMs))), Astronomy.KM_PER_AU));
}

/**
 * The Moon's path round the Earth for half a month either side of a moment:
 * `steps + 1` places in km from the Earth's middle. It does not quite join
 * up, because the Moon's orbit is pulled about by the Sun and never repeats.
 */
export function moonPath(date, steps = 120) {
  const stepMs = (MOON_MONTH_DAYS * DAY_MS) / steps;
  const start = date.getTime() - (MOON_MONTH_DAYS * DAY_MS) / 2;
  return Array.from({ length: steps + 1 }, (_, i) => fromAlmanac(Astronomy.GeoMoon(Astronomy.MakeTime(new Date(start + i * stepMs))), Astronomy.KM_PER_AU));
}

// ---------- moving about ----------

/**
 * The body whose surface is nearest a point, and how far off that surface is,
 * in km. `point` is in km from the Sun, like the places in `at`
 * (placesInSpace). For each body the distance is
 *
 *   how far the point is from the body's middle − the body's radius
 *
 * so a point inside a body is less than nothing from its surface. The view
 * uses this to set how fast a freely moving camera goes.
 */
export function nearestSurface(point, at) {
  let best = null;
  for (const { name, radiusKm } of SPACE_BODIES) {
    const gapKm = distanceKm(point, at[name]) - radiusKm;
    if (!best || gapKm < best.gapKm) best = { name, gapKm };
  }
  return best;
}
