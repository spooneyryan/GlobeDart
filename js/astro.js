// The almanac: where the sun, the moon, the stars and the planets are, as published.
//
// Everything in this file stands in for "what you would actually measure". It
// is a thin wrapper round Astronomy Engine (vendor/astronomy.js, copied in
// unchanged), an open-source library whose author tests it against NASA's JPL
// Horizons service and the US Naval Observatory's NOVAS code, to within a
// sixtieth of a degree. The app takes no readings of its own.
//
// Two kinds of figure come out of it, and they are used very differently:
//
//   where something is overhead    subsolarPoint, moonPoint, starPoints
//       Both models are handed this, and nothing else, to work from.
//
//   where an observer sees it      observedSun, observedMoon, observedStar
//       Neither model is handed this. It is the "Measured" figure that both
//       are marked against.
//
// The almanac rests on the same astronomy as the globe model, so the globe
// agreeing with it is true by construction and is not offered as the evidence.
// The almanac itself can be tested by anyone with a stick, a tape and a watch:
// js/measurements.js takes such readings and marks both models against them.
import * as Astronomy from '../vendor/astronomy.js';
import { STANDARD_AIR, lift } from './refraction.js';

/** The Earth's mean radius in km, the figure of the International Union of Geodesy and Geophysics. */
export const EARTH_RADIUS_KM = 6371.0088;
/** The sun's radius in km, the figure the International Astronomical Union settled on in 2015. */
export const SUN_RADIUS_KM = 695700;
/** The moon's mean radius in km. */
export const MOON_RADIUS_KM = 1737.4;
/** Degrees times this are radians, which is what the sine and cosine routines take. Radians over this are degrees. */
export const DEG = Math.PI / 180;

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

const SUN = Astronomy.Body.Sun;
const MOON = Astronomy.Body.Moon;

/** A longitude brought into the range −180° to 180°. East is positive. */
export function wrap180(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
/** An angle brought into the range 0° to 360°. */
export function wrap360(a) {
  return ((a % 360) + 360) % 360;
}

/**
 * How wide a ball looks from a distance, in degrees:
 *   width = 2 × atan(radius ÷ distance)
 */
const widthDeg = (radiusKm, distKm) => (2 * Math.atan(radiusKm / distKm)) / DEG;

// ---------- where things are overhead ----------
//
// Astronomers give a direction in the sky by two angles, the way a place on
// Earth has a latitude and a longitude:
//   declination       how far north of the sky's equator, in degrees
//   right ascension   how far round the sky, in hours (24 to the full turn)
// The sky turns overhead once a day. "Sidereal time" at Greenwich is how far
// it has turned, also in hours. So something in the sky is straight overhead at
//
//   latitude  = declination
//   longitude = (right ascension − Greenwich sidereal time) × 15
//
// the 15 being degrees to the hour. Anyone under that spot sees it at the top
// of the sky, whatever shape the ground is: this much is an observation, and
// it is all that either model is told.

/** How far the sky has turned at a moment, worked out once for everything looked up at that moment. */
const skyAt = (date) => {
  const time = Astronomy.MakeTime(date);
  return {
    time,
    // Catalogues give directions for the year 2000. The sky's pole drifts slowly, and this turns them to today's.
    turn: Astronomy.Rotation_EQJ_EQD(time),
    siderealHours: Astronomy.SiderealTime(time),
  };
};

/** The place a direction (a vector in the year-2000 frame) is overhead, by the rule above, with its two sky angles. */
function overhead(sky, j2000) {
  const eq = Astronomy.EquatorFromVector(Astronomy.RotateVector(sky.turn, j2000));
  return {
    lat: eq.dec,
    lon: wrap180((eq.ra - sky.siderealHours) * 15),
    ra: eq.ra,
    dec: eq.dec,
    distKm: eq.dist * Astronomy.KM_PER_AU,
  };
}

/** The sun or the moon: the place it is overhead, its distance from the Earth's centre, and its width as seen from there. */
function bodyPoint(body, radiusKm, date) {
  const sky = skyAt(date);
  // `true` allows for the time the light takes to arrive: the sun is seen where it was eight minutes ago.
  const at = overhead(sky, Astronomy.GeoVector(body, sky.time, true));
  return { lat: at.lat, lon: at.lon, distKm: at.distKm, sizeDeg: widthDeg(radiusKm, at.distKm) };
}

/** Point on Earth where the sun is directly overhead, plus the sun's distance and its width in the sky. */
export function subsolarPoint(date) {
  return bodyPoint(SUN, SUN_RADIUS_KM, date);
}

/**
 * The place on Earth where the moon is directly overhead, with its distance
 * from the centre of the Earth and its width as seen from there.
 */
export function moonPoint(date) {
  return bodyPoint(MOON, MOON_RADIUS_KM, date);
}

/**
 * For each star (J2000 right ascension in hours, declination in degrees): the
 * point on Earth it is directly overhead right now, plus its coordinates for
 * this date. A star's "substellar point" plays the same part as the subsolar
 * point does for the sun.
 *
 * An entry with a `body` is a planet. It has no fixed place among the stars,
 * so its place is worked out for the date, along with how far away and how
 * bright it is. The nearest a planet comes shifts its place in the sky by
 * under 0.01° between one side of the Earth and the other, which is ignored.
 */
export function starPoints(date, stars) {
  const sky = skyAt(date);
  return stars.map((s) => {
    if (s.body) {
      // A planet: where it is seen from the centre of the Earth, allowing for the time its light takes to arrive.
      const body = Astronomy.Body[s.body];
      const at = overhead(sky, Astronomy.GeoVector(body, sky.time, true));
      return { lat: at.lat, lon: at.lon, ra: at.ra, dec: at.dec, sizeDeg: 0, distKm: at.distKm, mag: Astronomy.Illumination(body, sky.time).mag };
    }
    // A star: its two catalogue angles as a direction, x toward right ascension 0 on the sky's equator and z toward its north pole.
    const ra = s.ra * 15 * DEG;
    const dec = s.dec * DEG;
    const at = overhead(sky, new Astronomy.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), sky.time));
    return { lat: at.lat, lon: at.lon, ra: at.ra, dec: at.dec, sizeDeg: 0 };
  });
}

/** How far the sky has turned: Greenwich sidereal time, in hours. A star is overhead where its right ascension less this is the longitude. */
export function siderealHours(date) {
  return Astronomy.SiderealTime(Astronomy.MakeTime(date));
}

// ---------- where an observer sees things: the "Measured" figures ----------
//
// The almanac gives the height above the horizon by geometry, for an observer
// at sea level. The air's lift is then added by the routine in refraction.js,
// the same one, with the same air, that lifts each model's prediction.
// In each answer:
//   az     the bearing, in degrees clockwise from true north
//   el     the height above the horizon as it appears, in degrees
//   lift   how much of that height is the air's doing

/** The bearing and height an observer measures for a direction given by its two sky angles. */
function observedAt(time, lat, lon, raHours, decDeg, air) {
  const hor = Astronomy.Horizon(time, new Astronomy.Observer(lat, lon, 0), raHours, decDeg);
  const bend = lift(hor.altitude, air);
  return { az: hor.azimuth, el: hor.altitude + bend, lift: bend };
}

/** The sun or the moon as one observer measures it, with its width from where they stand. */
function observedBody(body, radiusKm, date, lat, lon, air) {
  const time = Astronomy.MakeTime(date);
  // The direction from the observer's own spot, not from the Earth's centre. For the moon the two differ by up to a degree.
  const eq = Astronomy.Equator(body, time, new Astronomy.Observer(lat, lon, 0), true, true);
  return { ...observedAt(time, lat, lon, eq.ra, eq.dec, air), sizeDeg: widthDeg(radiusKm, eq.dist * Astronomy.KM_PER_AU) };
}

/** Sun position in the sky as measured by an observer. */
export function observedSun(date, lat, lon, air = STANDARD_AIR) {
  return observedBody(SUN, SUN_RADIUS_KM, date, lat, lon, air);
}

/** The moon's position in the sky as measured by an observer. */
export function observedMoon(date, lat, lon, air = STANDARD_AIR) {
  return observedBody(MOON, MOON_RADIUS_KM, date, lat, lon, air);
}

/** A star's position in the sky as measured by an observer. `point` comes from starPoints. */
export function observedStar(date, lat, lon, point, air = STANDARD_AIR) {
  return observedAt(Astronomy.MakeTime(date), lat, lon, point.ra, point.dec, air);
}

// ---------- the moon's phases and eclipses ----------

/**
 * How much of the moon's face is lit, as published: a fraction from 0 (new)
 * to 1 (full), and whether it is growing. It is the same for everyone on
 * Earth to within half a percent.
 */
export function moonPhase(date) {
  const time = Astronomy.MakeTime(date);
  return {
    fraction: Astronomy.Illumination(MOON, time).phase_fraction,
    // The moon's angle round from the sun: 0° at new, 180° at full, and growing in between.
    waxing: Astronomy.MoonPhase(time) < 180,
  };
}

/** The next full moon after a date. */
export function nextFullMoon(date) {
  return Astronomy.SearchMoonPhase(180, date, 40).date;
}

/**
 * The next eclipse of the moon in which it enters the dark middle of the
 * Earth's shadow, as published: its kind ('partial' or 'total') and its peak.
 */
export function nextLunarEclipse(date, totalOnly = false) {
  const wanted = (kind) => kind === 'total' || (!totalOnly && kind === 'partial');
  let found = Astronomy.SearchLunarEclipse(date);
  for (let i = 0; i < 24 && !wanted(found.kind); i++) found = Astronomy.NextLunarEclipse(found.peak);
  return { kind: found.kind, peak: found.peak.date };
}

/**
 * Whether the moon is in the dark part of the Earth's shadow at a moment, as
 * published: 'total', 'partial' or 'none'. The almanac gives each eclipse's
 * peak, and how many minutes either side of it each stage lasts.
 */
export function publishedEclipse(date) {
  // The search runs forward, so it starts six hours back to catch an eclipse already under way.
  const found = Astronomy.SearchLunarEclipse(new Date(date.getTime() - 6 * MS_PER_HOUR));
  const minutes = Math.abs(found.peak.date.getTime() - date.getTime()) / 60000;
  if (found.kind === 'total' && minutes <= found.sd_total) return 'total';
  if (found.kind !== 'penumbral' && minutes <= found.sd_partial) return 'partial';
  return 'none';
}

/** Every eclipse of the moon, of any kind, with its peak in a span of years. For checking. */
export function lunarEclipses(fromYear, toYear) {
  const list = [];
  let found = Astronomy.SearchLunarEclipse(new Date(Date.UTC(fromYear, 0, 1)));
  while (found.peak.date.getUTCFullYear() <= toYear) {
    list.push({ kind: found.kind, peak: found.peak.date });
    found = Astronomy.NextLunarEclipse(found.peak);
  }
  return list;
}

// What is published about one eclipse of the sun: its kind ('partial',
// 'annular' or 'total'), the moment the line through the sun and moon passes
// nearest the Earth's centre, how near that is, and, when the line meets the
// ground, the place it does so at that moment.
const solarEclipse = (found) => ({
  kind: found.kind,
  peak: found.peak.date,
  axisKm: found.distance,
  lat: found.latitude ?? null,
  lon: found.longitude ?? null,
});

/** The next eclipse of the sun after a date, as published. With `totalOnly`, the next total one. */
export function nextSolarEclipse(date, totalOnly = false) {
  let found = Astronomy.SearchGlobalSolarEclipse(date);
  for (let i = 0; i < 40 && totalOnly && found.kind !== 'total'; i++) found = Astronomy.NextGlobalSolarEclipse(found.peak);
  return solarEclipse(found);
}

/** The published eclipse of the sun with its middle within `hours` of a moment, or null. */
export function solarEclipseNear(date, hours = 4) {
  // The search runs forward, so it starts two days back to catch an eclipse already under way.
  const found = solarEclipse(Astronomy.SearchGlobalSolarEclipse(new Date(date.getTime() - 2 * MS_PER_DAY)));
  return Math.abs(found.peak.getTime() - date.getTime()) <= hours * MS_PER_HOUR ? found : null;
}

/** Every eclipse of the sun, of any kind, with its middle in a span of years. For checking. */
export function solarEclipses(fromYear, toYear) {
  const list = [];
  let found = Astronomy.SearchGlobalSolarEclipse(new Date(Date.UTC(fromYear, 0, 1)));
  while (found.peak.date.getUTCFullYear() <= toYear) {
    list.push(solarEclipse(found));
    found = Astronomy.NextGlobalSolarEclipse(found.peak);
  }
  return list;
}

/** Every new moon in a span of years. For checking. */
export function newMoons(fromYear, toYear) {
  const list = [];
  let from = new Date(Date.UTC(fromYear, 0, 1));
  for (;;) {
    const found = Astronomy.SearchMoonPhase(0, from, 40).date;
    if (found.getUTCFullYear() > toYear) return list;
    list.push(found);
    // New moons are 29½ days apart, so looking again from ten days on finds the next one and never this one.
    from = new Date(found.getTime() + 10 * MS_PER_DAY);
  }
}

/** Name of the constellation containing a J2000 position, for checking the star table. */
export function constellationAt(raHours, decDeg) {
  return Astronomy.Constellation(raHours, decDeg).symbol;
}

// ---------- the day and the year ----------

/**
 * Sunrise, solar noon and sunset for the observer's local solar day containing
 * `date`. Each is null when it does not happen that day, as near the poles.
 */
export function sunEvents(date, lat, lon) {
  // The day by the sun at the observer: every 15° of longitude east puts the sun's clock an hour ahead of Greenwich's.
  const offsetMs = (lon / 15) * MS_PER_HOUR;
  const localMidnight = new Date(Math.floor((date.getTime() + offsetMs) / MS_PER_DAY) * MS_PER_DAY - offsetMs);
  const obs = new Astronomy.Observer(lat, lon, 0);
  // A rising or setting found more than a day on belongs to another day.
  const pick = (t) => (t && t.date.getTime() - localMidnight.getTime() <= MS_PER_DAY ? t.date : null);
  let rise = null;
  let set = null;
  let noon = null;
  try {
    rise = pick(Astronomy.SearchRiseSet(SUN, obs, +1, localMidnight, 1));
    set = pick(Astronomy.SearchRiseSet(SUN, obs, -1, localMidnight, 1));
    // Solar noon: the moment the sun crosses the line from due north to due south, overhead.
    noon = Astronomy.SearchHourAngle(SUN, obs, 0, localMidnight).time.date;
  } catch {
    /* polar day or night: leave nulls */
  }
  return { rise, noon, set };
}

/** Equinox and solstice instants for a year. */
export function seasons(year) {
  const s = Astronomy.Seasons(year);
  return {
    marEquinox: s.mar_equinox.date,
    junSolstice: s.jun_solstice.date,
    sepEquinox: s.sep_equinox.date,
    decSolstice: s.dec_solstice.date,
  };
}

// ---------- the planets among the stars ----------

const OBLIQUITY_2000 = 23.4392911 * DEG; // the tilt of the Earth's axis to its orbit at the start of 2000

/**
 * Where a planet is seen among the stars from the Earth, as published:
 * measured along the sun's yearly path (`lon`) and north of it (`lat`), in
 * degrees, in the same fixed frame as js/planets.js uses. Also its distance in
 * astronomical units and how much of its face is lit.
 *
 * The almanac's direction (x, y, z) is measured from the sky's equator. The
 * sun's yearly path is tilted to that by the angle ε above, about the x axis
 * the two share, so the direction is turned by ε to measure from the path:
 *
 *   y′ =  y cos ε + z sin ε
 *   z′ = −y sin ε + z cos ε
 *   lon = atan2(y′, x)      lat = asin(z′ ÷ distance)
 */
export function planetSeen(body, date) {
  const time = Astronomy.MakeTime(date);
  const v = Astronomy.GeoVector(Astronomy.Body[body], time, true);
  const [c, s] = [Math.cos(OBLIQUITY_2000), Math.sin(OBLIQUITY_2000)];
  const [x, y, z] = [v.x, v.y * c + v.z * s, -v.y * s + v.z * c];
  const distAu = Math.hypot(x, y, z);
  return {
    lon: wrap360(Math.atan2(y, x) / DEG),
    lat: Math.asin(z / distAu) / DEG,
    distAu,
    lit: Astronomy.Illumination(Astronomy.Body[body], time).phase_fraction,
  };
}

/**
 * The next time the Earth and a planet are in line on the same side of the
 * sun, as published. For Mars that is opposition, when it is nearest and up
 * all night. For Venus it is the moment it passes between us and the sun.
 */
export function nextInLine(body, date) {
  return Astronomy.SearchRelativeLongitude(Astronomy.Body[body], 0, date).date;
}

/**
 * The new moons, first quarters, full moons and last quarters in a stretch of
 * days, as published: each a time in ms and a `quarter` from 0 (new) to 3.
 */
export function moonQuarters(from, days) {
  const list = [];
  let found = Astronomy.SearchMoonQuarter(from);
  const until = from.getTime() + days * MS_PER_DAY;
  while (found.time.date.getTime() <= until) {
    list.push({ t: found.time.date.getTime(), quarter: found.quarter });
    found = Astronomy.NextMoonQuarter(found);
  }
  return list;
}
