// The moon's shadow over the course of one eclipse of the sun: which published
// eclipse is going on at a moment, and where each model puts the middle of the
// shadow as it crosses. The "Solar eclipse" argument and the two outside views
// both draw from this.
import { subsolarPoint, moonPoint, observedSun, solarEclipseNear } from './astro.js';
import { moonShadowGlobe, moonShadowFlat } from './models.js';

// Looking an eclipse up takes a search, and so does following its shadow, so each is done once and kept.
const kept = new Map();
export function keep(key, make) {
  if (!kept.has(key)) {
    if (kept.size > 40) kept.clear();
    kept.set(key, make());
  }
  return kept.get(key);
}

/** The published eclipse of the sun going on at a moment, or null. */
let lastLooked = { hour: null, found: null };
export function publishedAt(date) {
  const t = date.getTime();
  if (lastLooked.found && Math.abs(lastLooked.found.peak.getTime() - t) <= 4 * 3600000) return lastLooked.found;
  const hour = Math.floor(t / 3600000);
  if (lastLooked.hour !== hour) lastLooked = { hour, found: solarEclipseNear(date) };
  return lastLooked.found;
}

/** Where the sun and the moon are overhead at a moment, and the shadow the globe makes of that. */
export function moment(date) {
  const sub = subsolarPoint(date);
  const moon = moonPoint(date);
  return { date, sub, moon, globe: moonShadowGlobe(sub, moon) };
}

/** The middle of an eclipse: the moment itself, and how high the sun is from the published place. */
export function middleOf(eclipse) {
  return keep(`middle ${eclipse.peak.getTime()}`, () => ({
    ...moment(eclipse.peak),
    sunEl: eclipse.lat === null ? null : observedSun(eclipse.peak, eclipse.lat, eclipse.lon).el,
  }));
}

/** The globe's shadow every three minutes for as long as the line through the sun and moon meets the ground. */
export function trackOf(eclipse) {
  return keep(`track ${eclipse.peak.getTime()}`, () => {
    const list = [];
    for (let minutes = -240; minutes <= 240; minutes += 3) {
      const at = moment(new Date(eclipse.peak.getTime() + minutes * 60000));
      if (at.globe.centre) list.push(at);
    }
    return list;
  });
}

/** Where the flat model's shadow is at one of those moments, if it is anywhere on the map. */
export function flatCentre(at, flat) {
  const shade = moonShadowFlat(at.sub, at.moon, flat);
  return shade.centre && !shade.offMap ? shade.centre : null;
}
