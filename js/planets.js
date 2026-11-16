// The Earth as one of the planets going round the sun.
//
// The globe model comes with a larger picture: the Earth is a ball that goes
// round the sun once a year, and so do the other planets, each on an ellipse
// of its own. This file works out where a planet should then be seen from the
// Earth, from six numbers for each orbit. It is given no positions in the sky.
//
// The six numbers are the "Keplerian elements" published by NASA's Jet
// Propulsion Laboratory (E. M. Standish, "Keplerian Elements for Approximate
// Positions of the Major Planets", the table for 1800 to 2050). For each: the
// value at the start of the year 2000, and how much it changes in a century.
//   a   half the long axis of the ellipse, in astronomical units (the Earth's own distance from the sun)
//   e   how far from round the ellipse is
//   I   the tilt of the orbit to the Earth's, in degrees
//   L   where round the orbit the planet is, in degrees
//   ϖ   the direction of its closest point to the sun, in degrees
//   Ω   the direction of the line where the two orbits cross, in degrees
//
// This file imports nothing: not the almanac, and not either model. What it
// works out is set beside the almanac's figures in the app, and the checks
// hold Mars to within 0.05° of its published place.
const DEG = Math.PI / 180;
/** The astronomical unit, the Earth's average distance from the sun, in km. */
export const AU_KM = 149597870.7;

export const ORBITS = {
  Venus: { a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  // The Earth's row is for the balance point of the Earth and the moon, which the Earth is never more than 4,700 km from.
  Earth: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0, 0] },
  Mars: { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
};

/** The widths of the two planets the app looks at, in km. */
export const PLANET_RADIUS_KM = { Venus: 6051.8, Mars: 3389.5 };

// The moment the six numbers are given for: noon on 1 January 2000. Their rates of change are per 36,525 days.
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const CENTURY_MS = 36525 * 86400000;

/** An angle brought into the range −180° to 180°. */
const wrap180 = (deg) => ((deg % 360) + 540) % 360 - 180;
/** An angle brought into the range 0° to 360°. */
const wrap360 = (deg) => ((deg % 360) + 360) % 360;

/**
 * Where a planet is at a moment, in astronomical units from the sun: x toward
 * the March equinox, y a quarter turn on round the Earth's orbit, z to the north of it.
 *
 *   M = L − ϖ                       how far round from its closest point, at a steady rate
 *   E − e sin E = M                 Kepler's equation, solved for E
 *   x′ = a (cos E − e)              its place in the plane of its own orbit,
 *   y′ = a √(1 − e²) sin E          measured from the closest point
 *
 * and then three turns to bring that into the plane of the Earth's orbit:
 * by ϖ − Ω in its own plane, by the tilt I, and by Ω.
 */
export function orbitPlace(name, date) {
  const t = (date.getTime() - J2000_MS) / CENTURY_MS;
  const o = ORBITS[name];
  const at = (pair) => pair[0] + pair[1] * t;
  const [a, e] = [at(o.a), at(o.e)];
  const M = wrap180(at(o.L) - at(o.peri)) * DEG;
  // Kepler's equation has no neat answer, so it is closed in on by Newton's method: a first guess, then
  //   E ← E − (E − e sin E − M) ÷ (1 − e cos E)
  // eight times over. For orbits this nearly round, three would do.
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [w, I, N] = [(at(o.peri) - at(o.node)) * DEG, at(o.I) * DEG, at(o.node) * DEG];
  const [cw, sw, cI, sI, cN, sN] = [Math.cos(w), Math.sin(w), Math.cos(I), Math.sin(I), Math.cos(N), Math.sin(N)];
  // The three turns, multiplied out.
  return [
    (cw * cN - sw * sN * cI) * xp + (-sw * cN - cw * sN * cI) * yp,
    (cw * sN + sw * cN * cI) * xp + (-sw * sN + cw * cN * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/**
 * What that makes of a planet as seen from the Earth: the straight line from
 * one to the other.
 *
 *   lon, lat   where it is among the stars, measured along and from the sun's yearly path, in degrees
 *   distAu     how far away it is
 *   lit        how much of its face is lit, by the rule used for the moon: (1 + cos angle) ÷ 2, with the angle
 *              at the planet between the sun and the Earth
 *   widthSec   how wide it looks, in seconds of arc (3,600 to a degree)
 */
export function seenFromEarth(name, date) {
  const planet = orbitPlace(name, date);
  const earth = orbitPlace('Earth', date);
  const to = planet.map((v, i) => v - earth[i]);
  const distAu = Math.hypot(...to);
  const sunDistAu = Math.hypot(...planet);
  // The angle at the planet between the sun (at the origin) and the Earth.
  const cosAngle = (planet[0] * to[0] + planet[1] * to[1] + planet[2] * to[2]) / (sunDistAu * distAu);
  return {
    lon: wrap360(Math.atan2(to[1], to[0]) / DEG),
    lat: Math.asin(to[2] / distAu) / DEG,
    distAu,
    lit: (1 + cosAngle) / 2,
    widthSec: widthSec(name, distAu),
    planet,
    earth,
  };
}

/** How wide a planet looks from a distance, in seconds of arc: 2 × atan(radius ÷ distance). */
export function widthSec(name, distAu) {
  return (2 * Math.atan(PLANET_RADIUS_KM[name] / (distAu * AU_KM)) * 3600) / DEG;
}

/**
 * The moments a planet stops among the stars and turns round, from a list of
 * its longitudes a day apart: where the change from one day to the next
 * changes sign. Returns the times in ms, with the direction it then sets off in.
 */
export function stations(samples) {
  // How far it moved from one day to the next, allowing for the step from 359° back to 0°.
  const turn = (a, b) => ((b - a + 540) % 360) - 180;
  const found = [];
  for (let i = 1; i + 1 < samples.length; i++) {
    const before = turn(samples[i - 1].lon, samples[i].lon);
    const after = turn(samples[i].lon, samples[i + 1].lon);
    if (before === 0 || Math.sign(before) === Math.sign(after)) continue;
    // The speed passes through nothing somewhere between the middles of the two days.
    const part = before / (before - after);
    const t = (samples[i - 1].t + samples[i].t) / 2 + part * (samples[i].t - samples[i - 1].t);
    found.push({ t, backward: after < 0 });
  }
  return found;
}
