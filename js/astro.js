// Thin wrapper around astronomy-engine. Everything here stands in for
// "what you would actually measure": the published ephemeris that matches
// real observations to a small fraction of a degree.
import * as Astronomy from '../vendor/astronomy.js';
import { STANDARD_AIR, lift } from './refraction.js';

export const EARTH_RADIUS_KM = 6371.0088;
export const SUN_RADIUS_KM = 695700;
export const DEG = Math.PI / 180;

const SUN = Astronomy.Body.Sun;

export function wrap180(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
export function wrap360(a) {
  return ((a % 360) + 360) % 360;
}

/** Point on Earth where the sun is directly overhead, plus the sun's distance. */
export function subsolarPoint(date) {
  const time = Astronomy.MakeTime(date);
  const j2000 = Astronomy.GeoVector(SUN, time, true);
  const ofDate = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), j2000);
  const eq = Astronomy.EquatorFromVector(ofDate);
  const gast = Astronomy.SiderealTime(time);
  const distKm = eq.dist * Astronomy.KM_PER_AU;
  return {
    lat: eq.dec,
    lon: wrap180((eq.ra - gast) * 15),
    distKm,
    sizeDeg: (2 * Math.atan(SUN_RADIUS_KM / distKm)) / DEG,
  };
}

/**
 * Sun position in the sky as measured by an observer (topocentric ephemeris).
 * `lift` is how much of the elevation is the air's doing.
 */
export function observedSun(date, lat, lon, air = STANDARD_AIR) {
  const time = Astronomy.MakeTime(date);
  const obs = new Astronomy.Observer(lat, lon, 0);
  const eq = Astronomy.Equator(SUN, time, obs, true, true);
  const hor = Astronomy.Horizon(time, obs, eq.ra, eq.dec);
  const bend = lift(hor.altitude, air);
  const distKm = eq.dist * Astronomy.KM_PER_AU;
  return {
    az: hor.azimuth,
    el: hor.altitude + bend,
    lift: bend,
    sizeDeg: (2 * Math.atan(SUN_RADIUS_KM / distKm)) / DEG,
  };
}

/**
 * For each star (J2000 right ascension in hours, declination in degrees): the
 * point on Earth it is directly overhead right now, plus its coordinates for
 * this date. A star's "substellar point" plays the same part as the subsolar
 * point does for the sun.
 */
export function starPoints(date, stars) {
  const time = Astronomy.MakeTime(date);
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const gast = Astronomy.SiderealTime(time);
  return stars.map((s) => {
    const ra = s.ra * 15 * DEG;
    const dec = s.dec * DEG;
    const j2000 = new Astronomy.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), time);
    const eq = Astronomy.EquatorFromVector(Astronomy.RotateVector(rot, j2000));
    return { lat: eq.dec, lon: wrap180((eq.ra - gast) * 15), ra: eq.ra, dec: eq.dec, sizeDeg: 0 };
  });
}

/** A star's position in the sky as measured by an observer. `point` comes from starPoints. */
export function observedStar(date, lat, lon, point, air = STANDARD_AIR) {
  const hor = Astronomy.Horizon(Astronomy.MakeTime(date), new Astronomy.Observer(lat, lon, 0), point.ra, point.dec);
  const bend = lift(hor.altitude, air);
  return { az: hor.azimuth, el: hor.altitude + bend, lift: bend };
}

/** Name of the constellation containing a J2000 position, for checking the star table. */
export function constellationAt(raHours, decDeg) {
  return Astronomy.Constellation(raHours, decDeg).symbol;
}

/** Sunrise, solar noon and sunset for the observer's local solar day containing `date`. */
export function sunEvents(date, lat, lon) {
  const dayMs = 86400000;
  const offsetMs = (lon / 15) * 3600000;
  const localMidnight = new Date(Math.floor((date.getTime() + offsetMs) / dayMs) * dayMs - offsetMs);
  const obs = new Astronomy.Observer(lat, lon, 0);
  const pick = (t) => (t && t.date.getTime() - localMidnight.getTime() <= dayMs ? t.date : null);
  let rise = null;
  let set = null;
  let noon = null;
  try {
    rise = pick(Astronomy.SearchRiseSet(SUN, obs, +1, localMidnight, 1));
    set = pick(Astronomy.SearchRiseSet(SUN, obs, -1, localMidnight, 1));
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
