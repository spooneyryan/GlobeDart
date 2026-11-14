// Thin wrapper around astronomy-engine. Everything here stands in for
// "what you would actually measure": the published ephemeris that matches
// real observations to a small fraction of a degree.
import * as Astronomy from '../vendor/astronomy.js';
import { STANDARD_AIR, lift } from './refraction.js';

export const EARTH_RADIUS_KM = 6371.0088;
export const SUN_RADIUS_KM = 695700;
export const MOON_RADIUS_KM = 1737.4;
export const DEG = Math.PI / 180;

const SUN = Astronomy.Body.Sun;
const MOON = Astronomy.Body.Moon;

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
 *
 * An entry with a `body` is a planet. It has no fixed place among the stars,
 * so its place is worked out for the date, along with how far away and how
 * bright it is. The nearest a planet comes shifts its place in the sky by
 * under 0.01° between one side of the Earth and the other, which is ignored.
 */
export function starPoints(date, stars) {
  const time = Astronomy.MakeTime(date);
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const gast = Astronomy.SiderealTime(time);
  return stars.map((s) => {
    if (s.body) {
      // A planet: where it is seen from the centre of the Earth, allowing for the time its light takes to arrive.
      const geo = Astronomy.GeoVector(Astronomy.Body[s.body], time, true);
      const place = Astronomy.EquatorFromVector(Astronomy.RotateVector(rot, geo));
      return {
        lat: place.dec,
        lon: wrap180((place.ra - gast) * 15),
        ra: place.ra,
        dec: place.dec,
        sizeDeg: 0,
        distKm: place.dist * Astronomy.KM_PER_AU,
        mag: Astronomy.Illumination(Astronomy.Body[s.body], time).mag,
      };
    }
    const ra = s.ra * 15 * DEG;
    const dec = s.dec * DEG;
    const j2000 = new Astronomy.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), time);
    const eq = Astronomy.EquatorFromVector(Astronomy.RotateVector(rot, j2000));
    return { lat: eq.dec, lon: wrap180((eq.ra - gast) * 15), ra: eq.ra, dec: eq.dec, sizeDeg: 0 };
  });
}

/** How far the sky has turned: Greenwich sidereal time, in hours. A star is overhead where its right ascension less this is the longitude. */
export function siderealHours(date) {
  return Astronomy.SiderealTime(Astronomy.MakeTime(date));
}

/** A star's position in the sky as measured by an observer. `point` comes from starPoints. */
export function observedStar(date, lat, lon, point, air = STANDARD_AIR) {
  const hor = Astronomy.Horizon(Astronomy.MakeTime(date), new Astronomy.Observer(lat, lon, 0), point.ra, point.dec);
  const bend = lift(hor.altitude, air);
  return { az: hor.azimuth, el: hor.altitude + bend, lift: bend };
}

/**
 * The place on Earth where the moon is directly overhead, with its distance
 * from the centre of the Earth and its width as seen from there.
 */
export function moonPoint(date) {
  const time = Astronomy.MakeTime(date);
  const j2000 = Astronomy.GeoVector(MOON, time, true);
  const eq = Astronomy.EquatorFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), j2000));
  const distKm = eq.dist * Astronomy.KM_PER_AU;
  return {
    lat: eq.dec,
    lon: wrap180((eq.ra - Astronomy.SiderealTime(time)) * 15),
    distKm,
    sizeDeg: (2 * Math.atan(MOON_RADIUS_KM / distKm)) / DEG,
  };
}

/** The moon's position in the sky as measured by an observer. */
export function observedMoon(date, lat, lon, air = STANDARD_AIR) {
  const time = Astronomy.MakeTime(date);
  const obs = new Astronomy.Observer(lat, lon, 0);
  const eq = Astronomy.Equator(MOON, time, obs, true, true);
  const hor = Astronomy.Horizon(time, obs, eq.ra, eq.dec);
  const bend = lift(hor.altitude, air);
  return {
    az: hor.azimuth,
    el: hor.altitude + bend,
    lift: bend,
    sizeDeg: (2 * Math.atan(MOON_RADIUS_KM / (eq.dist * Astronomy.KM_PER_AU))) / DEG,
  };
}

/**
 * How much of the moon's face is lit, as published: a fraction from 0 (new)
 * to 1 (full), and whether it is growing. It is the same for everyone on
 * Earth to within half a percent.
 */
export function moonPhase(date) {
  const time = Astronomy.MakeTime(date);
  return {
    fraction: Astronomy.Illumination(MOON, time).phase_fraction,
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
 * published: 'total', 'partial' or 'none'.
 */
export function publishedEclipse(date) {
  const found = Astronomy.SearchLunarEclipse(new Date(date.getTime() - 6 * 3600000));
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
