// Sanity checks for the sun and model maths: `node tools/check-maths.mjs`.
import { readFileSync } from 'node:fs';
import { EXPLAIN } from '../js/explain.js';
import { flightScene } from '../js/flight.js';
import * as Astronomy from '../vendor/astronomy.js';
import { STANDARD_AIR, standardLift, lift, airFactor, apparentElevation, trueElevation } from '../js/refraction.js';
import {
  K_STANDARD,
  TARGET_SHAPES,
  K_SURVEY,
  STANDARD_GROUND_AIR,
  coefficientFromWeather,
  lapseForCoefficient,
  effectiveRadiusKm,
  horizonDistanceKm,
  hiddenHeightM,
  horizonLineM,
  sightLineHeightM,
  middleMarkRiseM,
  dipDeg,
  flatNeeds,
  horizonScene,
  sunSinkDegPerHour,
  secondSunsetSeconds,
  radiusFromTwoSunsetsKm,
} from '../js/horizon.js';
import { ARGUMENTS, GROUPS, TOOLS, TOURS, OWN_TOUR, MAX_TOUR_STEPS, cleanTourSteps } from '../js/arguments/index.js';
import { SLIDER_STEPS, defaultsFor, cleanValue, cleanOwn, sliderPosition, sliderValue, encodeOwn, decodeOwn, controlFaults } from '../js/arguments/controls.js';
import { earthUrl, buildKml, buildSightKml, parseKml, KML_LIMITS } from '../js/earth.js';
import { VIEWS, viewSizes } from '../js/presets.js';
import { makeAir, traceRay, traceView, astronomicalBend } from '../js/raytrace.js';
import {
  impliedCoefficient,
  scoreObservation,
  cleanObservation,
  mergeObservations,
  encodeObservations,
  decodeObservations,
} from '../js/observations.js';
import {
  subsolarPoint,
  observedSun,
  sunEvents,
  seasons,
  starPoints,
  observedStar,
  constellationAt,
  siderealHours,
  wrap180,
  DEG,
  EARTH_RADIUS_KM,
} from '../js/astro.js';
import { STARS, STAR_LINES, starIndex } from '../js/stars.js';
import { ROUTES, routeStats, greatCirclePath, blockHours, globeDistanceKm } from '../js/distances.js';
import {
  globePredict,
  flatPredict,
  flatBendPerKm,
  impliedSunHeightKm,
  skySeparation,
  rmsMiss,
  flatFitCurve,
  globeAngleDeg,
  flatMapDistanceKm,
  flatVec,
  globePredictNear,
  globePlace,
  flatPlace,
  litFraction,
  viewsApartDeg,
  brightSideDeg,
  earthShadow,
} from '../js/models.js';
import { moonPoint, observedMoon, moonPhase, nextFullMoon, nextLunarEclipse, lunarEclipses, publishedEclipse } from '../js/astro.js';
import { CITIES, REF_CITIES } from '../js/cities.js';
import {
  shadowToElevation,
  shadowToAzimuth,
  summariseMeasurements,
  cleanMeasurement,
  mergeMeasurements,
  encodeMeasurements,
  decodeMeasurements,
  scoreMeasurement,
  measurementKey,
  overheadPoint,
} from '../js/measurements.js';

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
}
const f = (n, d = 3) => n.toFixed(d);
const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;

const s = seasons(2026);
console.log('2026 seasons:', s.marEquinox.toISOString(), s.decSolstice.toISOString());

// 1. Subsolar point: on the equator at an equinox, at the tropic at a solstice.
const eq = subsolarPoint(s.sepEquinox);
check('equinox subsolar latitude is 0', Math.abs(eq.lat) < 0.01, f(eq.lat, 4));
const sol = subsolarPoint(s.decSolstice);
check('December solstice subsolar latitude is -23.44', Math.abs(sol.lat + 23.44) < 0.01, f(sol.lat, 4));

// 2. The sun really is overhead at the subsolar point.
const now = new Date('2026-11-12T15:30:00Z');
const sub = subsolarPoint(now);
const overhead = observedSun(now, sub.lat, sub.lon, null);
check('sun is at the zenith over the subsolar point', overhead.el > 89.99, f(overhead.el, 4));
check('sun angular size about 0.54 deg in November', Math.abs(sub.sizeDeg - 0.539) < 0.005, f(sub.sizeDeg, 4));

// 3. Globe model agrees with the ephemeris everywhere.
let worst = 0;
for (const c of REF_CITIES) {
  for (let h = 0; h < 24; h++) {
    const t = new Date(Date.UTC(2026, 10, 12, h));
    const sp = subsolarPoint(t);
    const obs = observedSun(t, c.lat, c.lon);
    worst = Math.max(worst, skySeparation(obs, globePredict(sp, c.lat, c.lon)));
  }
}
check('globe model matches ephemeris within 0.02 deg', worst < 0.02, `worst ${f(worst, 4)}`);

// 4. Flat model geometry: observer under the sun sees it overhead; known triangle elsewhere.
const params = { sunHeightKm: 5000, lightRangeKm: 10000 };
const under = flatPredict(eq, eq.lat, eq.lon, params, null);
check('flat: sun overhead at subsolar point', under.el > 89.99 && Math.abs(under.sizeDeg - eq.sizeDeg) < 1e-6);
const pole = flatPredict(eq, 89.9999, 0, params, null);
const expectPole = (Math.atan2(5000, (Math.PI / 2) * EARTH_RADIUS_KM) * 180) / Math.PI;
check('flat: elevation at pole on equinox', Math.abs(pole.el - expectPole) < 0.01, `${f(pole.el)} vs ${f(expectPole)}`);
// Observer on the equator, 90 degrees of longitude west of the sun: sun should bear north-east (45).
const west = flatPredict(eq, 0, eq.lon - 90, params, null);
check('flat: equinox sunrise bears 45 deg, not 90', Math.abs(west.az - 45) < 0.5, `az ${f(west.az)} el ${f(west.el)}`);
const globeWest = globePredict(eq, 0, eq.lon - 90, null);
check('globe: equinox sunrise bears 90 deg', Math.abs(globeWest.az - 90) < 0.5 && Math.abs(globeWest.el) < 0.1, `az ${f(globeWest.az)} el ${f(globeWest.el)}`);
// East/west sanity: sun east of the observer in the morning on both models.
const am = flatPredict(eq, 40, eq.lon - 45, params, null);
check('flat: morning sun is in the eastern half of the sky', am.az > 0 && am.az < 180, f(am.az));

// 5. Implied sun heights disagree between observers.
const heights = REF_CITIES.map((c) => impliedSunHeightKm(sub, c.lat, c.lon, observedSun(now, c.lat, c.lon).el)).filter((h) => h !== null);
console.log('implied sun heights (km):', heights.map((h) => Math.round(h)).join(', '));
check('implied heights spread by more than 2000 km', Math.max(...heights) - Math.min(...heights) > 2000);

// 6. Fit curve never reaches zero.
const samples = [];
for (const c of REF_CITIES) {
  for (let h = 0; h < 24; h++) {
    const t = new Date(Date.UTC(2026, 10, 12, h));
    samples.push({ lat: c.lat, lon: c.lon, sub: subsolarPoint(t), obs: observedSun(t, c.lat, c.lon) });
  }
}
const globeRms = rmsMiss(samples, (sp, lat, lon) => globePredict(sp, lat, lon));
const fit = flatFitCurve(samples, params, STANDARD_AIR);
console.log(`globe rms ${f(globeRms, 4)} deg; flat best ${f(fit.best.rms, 2)} deg at ${Math.round(fit.best.heightKm)} km`);
check('flat best fit is still off by more than 5 deg', fit.best.rms > 5);

// 6a. The flat model with light that curves upward.
{
  const sunNow = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12)));
  const straight = { sunHeightKm: 5000, lightRangeKm: 10000 };
  const bent = { ...straight, bendSetKm: 10000 };
  const at = (groundKm) => ({ lat: sunNow.lat + groundKm / 111.19493, lon: sunNow.lon }); // a place that far north of the sun on the flat map
  check('with no bending asked for, the flat model is exactly as it was',
    flatBendPerKm(straight) === 0 && flatPredict(sunNow, 40, 10, { ...straight, bendSetKm: 0 }).el === flatPredict(sunNow, 40, 10, straight).el);
  check('the bend is set so that the sun is on the horizon from as far as its light reaches',
    near(flatBendPerKm(bent), (2 * 5000) / 1e8, 1e-15) && Math.abs(flatPredict(sunNow, at(10000).lat, sunNow.lon, bent, null).trueEl) < 0.01,
    f(flatPredict(sunNow, at(10000).lat, sunNow.lon, bent, null).trueEl, 4));
  check('nearer than that it is above the horizon but lower than with straight light, and further off it has set',
    flatPredict(sunNow, at(5000).lat, sunNow.lon, bent, null).trueEl > 0 &&
    flatPredict(sunNow, at(5000).lat, sunNow.lon, bent, null).trueEl < flatPredict(sunNow, at(5000).lat, sunNow.lon, straight, null).trueEl &&
    flatPredict(sunNow, at(7000).lat, sunNow.lon + 150, bent, null).trueEl < 0);
  check('directly underneath it is still overhead, and the bearing is never changed',
    near(flatPredict(sunNow, sunNow.lat, sunNow.lon, bent, null).trueEl, 90, 1e-6) && flatPredict(sunNow, 40, 10, bent).az === flatPredict(sunNow, 40, 10, straight).az);
  const seen = flatPredict(sunNow, 40, 10, bent, null).trueEl;
  check('the sun height one observer implies comes back out when the bend is allowed for',
    near(impliedSunHeightKm(sunNow, 40, 10, seen, bent), 5000, 1e-6) &&
    near(impliedSunHeightKm(sunNow, 40, 10, seen, { bendPerKm: flatBendPerKm(bent) }), 5000, 1e-6) &&
    impliedSunHeightKm(sunNow, -60, sunNow.lon + 170, 5, bent) === null);
  // How well can it do? Every pair of settings on a grid, over a day at an equinox and at both solstices.
  const tries = [];
  for (const day of [Date.UTC(2026, 2, 20), Date.UTC(2026, 5, 21), Date.UTC(2026, 11, 21)]) {
    for (let hour = 0; hour < 24; hour += 2) {
      const when = new Date(day + hour * 3600000);
      const sunThen = subsolarPoint(when);
      for (const c of REF_CITIES) {
        const o = observedSun(when, c.lat, c.lon);
        if (o.el > 2) tries.push({ sub: sunThen, c, o });
      }
    }
  }
  const typical = (p) => Math.sqrt(tries.reduce((sum, s) => sum + skySeparation(s.o, flatPredict(s.sub, s.c.lat, s.c.lon, p)) ** 2, 0) / tries.length);
  let bestBent = Infinity;
  for (let h = 2000; h <= 12000; h += 1000) for (let reach = 8000; reach <= 20000; reach += 2000) bestBent = Math.min(bestBent, typical({ sunHeightKm: h, lightRangeKm: reach, bendSetKm: reach }));
  check('no height and reach make bending light fit: over a day it still misses by more than 20 degrees', bestBent > 20 && typical({ sunHeightKm: 5000, lightRangeKm: 1e4 }) > 20,
    `best ${f(bestBent, 1)} deg over ${tries.length} sightings`);
}

// 7. Sun events.
const ev = sunEvents(new Date('2026-11-12T12:00:00Z'), 51.51, -0.13);
console.log('London 12 Nov 2026:', ev.rise?.toISOString(), ev.noon?.toISOString(), ev.set?.toISOString());
check('London sunrise about 07:15 UTC', ev.rise && Math.abs(ev.rise.getUTCHours() * 60 + ev.rise.getUTCMinutes() - 435) < 10);
const atSet = observedSun(ev.set, 51.51, -0.13);
const flatAtSet = flatPredict(subsolarPoint(ev.set), 51.51, -0.13, params);
console.log(`London sunset: observed el ${f(atSet.el, 2)} az ${f(atSet.az, 1)}; flat el ${f(flatAtSet.el, 1)} az ${f(flatAtSet.az, 1)} size ${f(flatAtSet.sizeDeg, 3)}`);

// 8. The user's own measurements.
check('stick as long as its shadow means 45 deg', Math.abs(shadowToElevation(1, 1) - 45) < 1e-9);
check('shadow pointing north-east puts the sun in the south-west', shadowToAzimuth(45) === 225);
const t0 = Date.UTC(2026, 10, 12, 11);
const measure = (name, withBearing) => {
  const c = REF_CITIES.find((x) => x.name === name);
  const o = observedSun(new Date(t0), c.lat, c.lon);
  return cleanMeasurement({ t: t0, lat: c.lat, lon: c.lon, el: o.el, az: withBearing ? o.az : null, label: name });
};
const one = summariseMeasurements([measure('Cairo', false)], params);
check('one elevation alone can be matched by some flat sun height', one.best.rms < 0.05 && one.globeRms < 0.05,
  `flat best ${f(one.best.rms, 3)} at ${Math.round(one.best.heightKm)} km, globe ${f(one.globeRms, 3)}`);
const three = summariseMeasurements([measure('Cairo', false), measure('London', false), measure('Nairobi', false)], params);
check('three elevations from different places cannot', three.best.rms > 2 && three.globeRms < 0.05,
  `flat best ${f(three.best.rms, 2)} at ${Math.round(three.best.heightKm)} km, globe ${f(three.globeRms, 3)}; ` +
  `implied ${Math.round(three.impliedMin)} to ${Math.round(three.impliedMax)} km`);
const withBearing = summariseMeasurements([measure('London', true)], params);
check('a bearing alone can rule the flat model out', withBearing.best.rms > 2 && withBearing.globeRms < 0.05,
  `flat best ${f(withBearing.best.rms, 2)}, globe ${f(withBearing.globeRms, 3)}`);
const list = [measure('Cairo', true), measure('London', false)];
check('measurements survive a round trip through a link',
  JSON.stringify(decodeMeasurements(encodeMeasurements(list))) === JSON.stringify(mergeMeasurements(list)));
check('unusable measurements are dropped',
  mergeMeasurements([{ t: 'x', lat: 0, lon: 0, el: 10 }, { t: t0, lat: 0, lon: 0, el: 95 }, { t: t0, lat: '', lon: 0, el: 10 }]).length === 0);

// 8a. Measurements of a star.
{
  const night = Date.UTC(2026, 10, 12, 22);
  const star = (name) => STARS.find((s) => s.name === name);
  const sight = (starName, cityName, withBearing = false) => {
    const c = REF_CITIES.find((x) => x.name === cityName);
    const o = observedStar(new Date(night), c.lat, c.lon, starPoints(new Date(night), [star(starName)])[0]);
    return cleanMeasurement({ t: night, lat: c.lat, lon: c.lon, el: o.el, az: withBearing ? o.az : null, label: cityName, star: starName });
  };
  const london = sight('Polaris', 'London');
  check('a measurement can be of a star', london?.star === 'Polaris' && cleanMeasurement({ ...london, star: '' }).star === null);
  check('a star the app does not know is refused, not scored as the sun', cleanMeasurement({ ...london, star: 'Nonsense' }) === null);
  check("the pole star's height from London is within a degree of London's latitude", Math.abs(london.el - london.lat) < 1, f(london.el, 2));
  const overhead = overheadPoint(london);
  check('the place a star stands over has the latitude of its place in the sky', near(overhead.lat, overhead.dec, 1e-9) && overhead.lat > 89);
  const starParams = { ...params, starHeightKm: 6000 };
  const scored = scoreMeasurement(london, starParams);
  check('the globe matches a star measurement taken from the published positions', scored.globeMiss < 0.05, f(scored.globeMiss, 4));
  check("the flat model's stars use their own height, not the sun's",
    scoreMeasurement(london, { ...starParams, sunHeightKm: 9000 }).flat.el === scored.flat.el &&
    scoreMeasurement(london, { ...starParams, starHeightKm: 3000 }).flat.el < scored.flat.el - 5);
  const oneStar = summariseMeasurements([london], starParams);
  check('one star height alone can be matched by some height for the flat stars, and says nothing about the sun',
    oneStar.stars.best.rms < 0.05 && oneStar.sun === null && oneStar.best === null && oneStar.bestRms < 0.05,
    `flat best ${f(oneStar.stars.best.rms, 3)} at ${Math.round(oneStar.stars.best.heightKm)} km`);
  const threeStars = summariseMeasurements([london, sight('Polaris', 'Cairo'), sight('Polaris', 'New York')], starParams);
  check('the pole star from three places cannot', threeStars.stars.best.rms > 2 && threeStars.globeRms < 0.05 && threeStars.stars.count === 3,
    `flat best ${f(threeStars.stars.best.rms, 2)} at ${Math.round(threeStars.stars.best.heightKm)} km, implied ${Math.round(threeStars.stars.impliedMin)} to ${Math.round(threeStars.stars.impliedMax)} km`);
  const mixed = summariseMeasurements([measure('Cairo', false), london], starParams);
  check('the sun and the stars are each fitted to a height of their own',
    mixed.sun.count === 1 && mixed.stars.count === 1 && mixed.bestRms < 0.05 && Math.abs(mixed.sun.best.heightKm - mixed.stars.best.heightKm) > 500,
    `sun ${Math.round(mixed.sun.best.heightKm)} km, stars ${Math.round(mixed.stars.best.heightKm)} km`);
  const both = [sight('Sirius', 'Cairo', true), london, measure('Cairo', true)];
  check('star measurements survive a round trip through a link',
    JSON.stringify(decodeMeasurements(encodeMeasurements(both))) === JSON.stringify(mergeMeasurements(both)), encodeMeasurements([london]));
  check('a link written before stars could be measured still reads, as the sun',
    decodeMeasurements('2026-11-12T11:00:00Z,30.04,31.24,35.2,170,Cairo,12')[0].star === null);
  check('a measurement with nothing optional ends at its last number in a link',
    /,\d+(\.\d+)?$/.test(encodeMeasurements([measure('London', false)].map((m) => ({ ...m, label: '' })))));
  check('the sun and a star at the same height, time and place are two measurements',
    measurementKey(london) !== measurementKey({ ...london, star: null }) && mergeMeasurements([london, { ...london, star: null }]).length === 2);
}

// 9. Distances under each model.
const place = (name) => CITIES.find((x) => x.name === name);
const sydScl = routeStats(place('Sydney'), place('Santiago'), 13.5);
check('Sydney to Santiago is about 11,350 km on the globe', Math.abs(sydScl.globeKm - 11350) < 80, `${Math.round(sydScl.globeKm)} km`);
check('the same trip is more than twice as far on the flat map', sydScl.ratio > 2,
  `${Math.round(sydScl.flatKm)} km, needing ${Math.round(sydScl.flatKmh)} km/h against ${Math.round(sydScl.globeKmh)} km/h`);
const lonCpt = routeStats(place('London'), place('Cape Town'));
check('north-south distances agree between the models', Math.abs(lonCpt.ratio - 1) < 0.03,
  `globe ${Math.round(lonCpt.globeKm)} km, flat ${Math.round(lonCpt.flatKm)} km`);
const path = greatCirclePath(place('Sydney'), place('Santiago'), 32);
check('the great-circle path starts and ends at the two cities',
  Math.abs(path[0].lat - place('Sydney').lat) < 1e-6 && Math.abs(path[32].lon - place('Santiago').lon) < 1e-6);
check('every listed flight uses places the app knows', ROUTES.every((r) => place(r.from) && place(r.to)));
for (const r of ROUTES) {
  const st = routeStats(place(r.from), place(r.to), (r.there + r.back) / 2);
  console.log(`  ${r.from} - ${r.to}: globe ${Math.round(st.globeKm)} km at ${Math.round(st.globeKmh)} km/h, ` +
    `flat ${Math.round(st.flatKm)} km at ${Math.round(st.flatKmh)} km/h`);
}
// Scheduled times are worked out from the timetable's local times, so the arithmetic is checked here.
check('Sydney 10:35 to Santiago 09:05 the same day is 12 h 30 min in the air', near(blockHours('10:35', 11, '09:05', -3), 12.5, 1e-9));
check('and Santiago 13:00 to Sydney 17:10 the next day is 14 h 10 min', near(blockHours('13:00', -3, '17:10', 11, 1), 14 + 10 / 60, 1e-9));
const expected = { QF27: [12, 30], QF28: [14, 10], QF63: [14, 30], QF64: [11, 55], LA801: [12, 20], LA800: [11, 5], QF65: [11, 10], QF66: [9, 40],
  LA8058: [8, 55], LA8059: [9, 50], QF643: [5, 0], QF648: [4, 10], BA59: [11, 50], BA58: [12, 0], BA117: [8, 0], BA112: [7, 5], JL15: [12, 5], JL16: [9, 55] };
const legs = ROUTES.flatMap((r) => [r.out, r.home]);
const offSchedule = legs.filter((l) => !expected[l.flight] || !near(l.hours, expected[l.flight][0] + expected[l.flight][1] / 60, 1e-9));
check(`all ${legs.length} timetabled flights work out to their published durations`, legs.length === 18 && offSchedule.length === 0, offSchedule.map((l) => l.flight).join(', '));
check('every scheduled flight is between 3 and 18 hours', legs.every((l) => l.hours > 3 && l.hours < 18));
check('every listed flight needs an ordinary airliner speed on the globe',
  ROUTES.every((r) => {
    const v = routeStats(place(r.from), place(r.to), (r.there + r.back) / 2).globeKmh;
    return v > 680 && v < 960;
  }));

// 10. The stars.
const wrong = STARS.filter((st) => constellationAt(st.ra, st.dec) !== st.con);
check(`all ${STARS.length} stars lie in their stated constellations`, wrong.length === 0, wrong.map((st) => st.name).join(', '));
// The saved copy of what the SIMBAD database gives for each star. `node tools/check-stars.mjs --save` renews it.
const catalogue = JSON.parse(readFileSync(new URL('../data/star-catalogue.json', import.meta.url), 'utf8'));
const inCatalogue = new Map(catalogue.stars.map((c) => [c.name, c]));
let worstCatalogue = 0;
let worstName = '';
for (const st of STARS) {
  const c = inCatalogue.get(st.name);
  const off = c ? skySeparation({ az: st.ra * 15, el: st.dec }, { az: c.ra, el: c.dec }) * 3600 : Infinity;
  if (off > worstCatalogue) [worstCatalogue, worstName] = [off, st.name];
}
check(`all ${STARS.length} stars are within 8 arcseconds of the SIMBAD catalogue (copy of ${catalogue.fetched})`,
  worstCatalogue <= 8, `worst ${f(worstCatalogue, 1)} arcseconds, ${worstName}`);
check('no star is listed twice and every figure line joins two known stars',
  new Set(STARS.map((st) => st.name)).size === STARS.length && STAR_LINES.every(([a, b]) => a >= 0 && b >= 0));
const star = (name) => STARS[starIndex(name)];
const apart = (a, b) => skySeparation({ az: star(a).ra * 15, el: star(a).dec }, { az: star(b).ra * 15, el: star(b).dec });
for (const [a, b, expected] of [
  ['Dubhe', 'Merak', 5.37],
  ['Acrux', 'Gacrux', 6.0],
  ['Mintaka', 'Alnitak', 2.74],
  ['Alpha Centauri', 'Hadar', 4.4],
  ['Castor', 'Pollux', 4.5],
]) {
  check(`${a} and ${b} are ${expected} degrees apart`, Math.abs(apart(a, b) - expected) < 0.06, f(apart(a, b)));
}
const night = new Date('2026-11-12T22:00:00Z');
const pts = starPoints(night, STARS);
let worstStar = 0;
for (const c of REF_CITIES) {
  pts.forEach((p) => {
    worstStar = Math.max(worstStar, skySeparation(observedStar(night, c.lat, c.lon, p), globePredict(p, c.lat, c.lon)));
  });
}
check('globe model matches every star from every city within 0.02 deg', worstStar < 0.02, `worst ${f(worstStar, 4)}`);
const polaris = pts[starIndex('Polaris')];
const london = place('London');
const sydney = place('Sydney');
const polarisLondon = observedStar(night, london.lat, london.lon, polaris);
check("Polaris stands about London's latitude above the horizon", Math.abs(polarisLondon.el - london.lat) < 1, f(polarisLondon.el, 2));
const domeParams = { sunHeightKm: 5000, lightRangeKm: Infinity };
const polarisSydney = observedStar(night, sydney.lat, sydney.lon, polaris);
const flatPolarisSydney = flatPredict(polaris, sydney.lat, sydney.lon, domeParams);
check('Polaris is below the horizon in Sydney, yet up on the flat model', polarisSydney.el < -30 && flatPolarisSydney.el > 10,
  `measured ${f(polarisSydney.el, 1)}, flat ${f(flatPolarisSydney.el, 1)}`);
const sigma = pts[starIndex('Sigma Octantis')];
for (const name of ['Sydney', 'Santiago', 'Cape Town']) {
  const c = place(name);
  const o = observedStar(night, c.lat, c.lon, sigma);
  const fl = flatPredict(sigma, c.lat, c.lon, domeParams);
  check(`${name} sees Sigma Octantis due south, as high as its latitude`,
    Math.abs(o.az - 180) < 2 && Math.abs(o.el + c.lat) < 1.5, `az ${f(o.az, 1)} el ${f(o.el, 1)}; flat az ${f(fl.az, 1)} el ${f(fl.el, 1)}`);
}
const starSamples = REF_CITIES.flatMap((c) => pts.map((p) => ({ lat: c.lat, lon: c.lon, sub: p, obs: observedStar(night, c.lat, c.lon, p) })));
const starFit = flatFitCurve(starSamples, domeParams, STANDARD_AIR);
console.log(`stars: flat best ${f(starFit.best.rms, 1)} deg at ${Math.round(starFit.best.heightKm)} km`);
check('no star height brings the flat model within 10 deg', starFit.best.rms > 10);

// 10a. The full catalogue the background stars are drawn from.
{
  const bsc = JSON.parse(readFileSync(new URL('../data/bright-stars.json', import.meta.url), 'utf8'));
  check('the saved star catalogue holds as many stars as it says, all with a position and a brightness',
    bsc.count > 8000 && [bsc.hr, bsc.ra, bsc.dec, bsc.mag].every((list) => list.length === bsc.count && list.every(Number.isFinite)) &&
    bsc.ra.every((v) => v >= 0 && v < 360) && bsc.dec.every((v) => Math.abs(v) <= 90), `${bsc.count} stars`);
  check('it goes down to what the eye can see and no further, brightest first',
    bsc.mag.every((m, i) => m <= bsc.magLimit && (i === 0 || m >= bsc.mag[i - 1])) && bsc.magLimit === 6.5);
  check('its brightest star is Sirius, where the hand-entered table puts it',
    bsc.mag[0] === -1.46 && near(bsc.ra[0], star('Sirius').ra * 15, 0.01) && near(bsc.dec[0], star('Sirius').dec, 0.01));
  // The hand-entered table and the catalogue come from different sources. Every star in one should be in the other.
  const apart = (s, i) => Math.hypot((wrap180(s.ra * 15 - bsc.ra[i])) * Math.cos(s.dec * DEG), s.dec - bsc.dec[i]);
  const unmatched = STARS.filter((s) => !bsc.ra.some((_, i) => apart(s, i) < 0.03));
  check(`all ${STARS.length} stars in the hand-entered table are in the catalogue, within 0.03 degrees`, unmatched.length === 0, unmatched.map((s) => s.name).join(', '));
  check('the sky turns once in a sidereal day: a star is overhead a degree further west every four minutes',
    near(wrap180((siderealHours(new Date(t0 + 240000)) - siderealHours(new Date(t0))) * 15), 1.0027, 0.0005));
  const sirius = starPoints(new Date(t0), [star('Sirius')])[0];
  check('where a star is overhead follows from its place among the stars and how far the sky has turned',
    near(wrap180((sirius.ra - siderealHours(new Date(t0))) * 15), sirius.lon, 1e-9));
}

// 11. Bending of light by the air.
const arcmin = (el) => standardLift(el) * 60;
check('lift is 29 arcminutes for something geometrically on the horizon', Math.abs(arcmin(0) - 29) < 0.5, f(arcmin(0), 2));
check('lift is 5.4 arcminutes at 10 degrees up', Math.abs(arcmin(10) - 5.4) < 0.1, f(arcmin(10), 2));
check('lift is 1.0 arcminute at 45 degrees up', Math.abs(arcmin(45) - 1.0) < 0.05, f(arcmin(45), 2));
const onHorizon = trueElevation(0);
check('something seen exactly on the horizon is 34 arcminutes below it', Math.abs(onHorizon * 60 + 34) < 0.6, f(onHorizon * 60, 2));
let worstRound = 0;
for (let el = -0.9; el <= 90; el += 0.37) worstRound = Math.max(worstRound, Math.abs(trueElevation(apparentElevation(el)) - el));
check('true to apparent and back returns the same elevation', worstRound < 1e-9, worstRound.toExponential(1));
let worstFormula = 0;
for (let el = -90; el <= 90; el += 0.05) worstFormula = Math.max(worstFormula, Math.abs(standardLift(el) - Astronomy.Refraction('normal', el)));
check("the lift formula is the library's own, to the last digit", worstFormula < 1e-12, worstFormula.toExponential(1));
// Before this module existed the measured position came from the library's own
// refraction option. Standard air must still give those numbers.
let worstSun = 0;
let worstStarEl = 0;
for (const c of REF_CITIES) {
  const observer = new Astronomy.Observer(c.lat, c.lon, 0);
  for (let h = 0; h < 24; h++) {
    const t = new Date(Date.UTC(2026, 10, 12, h));
    const time = Astronomy.MakeTime(t);
    const e = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
    const old = Astronomy.Horizon(time, observer, e.ra, e.dec, 'normal');
    const o = observedSun(t, c.lat, c.lon);
    worstSun = Math.max(worstSun, Math.abs(o.el - old.altitude), Math.abs(o.az - old.azimuth));
  }
  for (const p of pts) {
    const old = Astronomy.Horizon(Astronomy.MakeTime(night), observer, p.ra, p.dec, 'normal');
    const o = observedStar(night, c.lat, c.lon, p);
    worstStarEl = Math.max(worstStarEl, Math.abs(o.el - old.altitude), Math.abs(o.az - old.azimuth));
  }
}
check('standard air gives the same measured sun as before', worstSun < 1e-9, worstSun.toExponential(1));
check('standard air gives the same measured stars as before', worstStarEl < 1e-9, worstStarEl.toExponential(1));
check('standard air scales the lift by exactly 1', airFactor(STANDARD_AIR) === 1);
check('no air means no lift', lift(0, null) === 0 && observedSun(now, 51.51, -0.13, null).lift === 0);
const cold = airFactor({ tempC: -20, pressureHpa: 1030 });
check('at -20 C and 1030 hPa the lift is about 14% larger', Math.abs(cold - 1.14) < 0.005, f(cold, 4));
const thin = airFactor({ tempC: 10, pressureHpa: 840 });
check('at 840 hPa, about 1,600 m up, it is about 17% smaller', Math.abs(thin - 0.83) < 0.005, f(thin, 4));
// The row in the app: what the flat model would need from the air at a London sunset.
check('at a London sunset the air lifts the sun by about 0.6 of a degree', Math.abs(atSet.lift - 0.62) < 0.03, f(atSet.lift, 3));
check('the flat sun would need bending more than 20 degrees the other way', flatAtSet.trueEl - atSet.el > 20,
  f(flatAtSet.trueEl - atSet.el, 1));
check('the globe needs exactly the lift the air gives',
  Math.abs(atSet.el - globePredict(subsolarPoint(ev.set), 51.51, -0.13).trueEl - atSet.lift) < 0.01);
// A temperature noted with a measurement.
const frosty = cleanMeasurement({ t: ev.set.getTime(), lat: 51.51, lon: -0.13, el: 0.3, az: null, label: 'frost', tempC: '-20' });
check('a measurement keeps the temperature noted with it', frosty.tempC === -20);
check('and carries it through a link',
  decodeMeasurements(encodeMeasurements([frosty]))[0].tempC === -20 && decodeMeasurements(encodeMeasurements(list))[0].tempC === null);
check('links made before temperatures existed still open',
  decodeMeasurements('2026-11-12T11:00:00Z,30.04,31.24,35.2,170,Cairo;2026-11-12T11:00:00Z,51.51,-0.13,20.1,,').length === 2);
const mild = scoreMeasurement({ ...frosty, tempC: null }, params);
const freezing = scoreMeasurement(frosty, params);
check('colder air lifts the predicted sunset sun a little more', freezing.globe.el - mild.globe.el > 0.03 && freezing.globe.el - mild.globe.el < 0.12,
  f(freezing.globe.el - mild.globe.el, 3));
check('with refraction off a noted temperature changes nothing',
  scoreMeasurement(frosty, params, null).globe.el === scoreMeasurement({ ...frosty, tempC: null }, params, null).globe.el);
check('of two copies of a measurement, the one with a temperature is kept',
  mergeMeasurements([{ ...frosty, tempC: null }], [frosty]).length === 1 && mergeMeasurements([{ ...frosty, tempC: null }], [frosty])[0].tempC === -20);

// 12. Over the horizon.
check('eye at 1.7 m: horizon 4.65 km with no bending', near(horizonDistanceKm(1.7, 0), 4.65, 0.01), f(horizonDistanceKm(1.7, 0)));
check("and 4.99 km with the surveyors' k = 0.13", near(horizonDistanceKm(1.7, K_SURVEY), 4.99, 0.01), f(horizonDistanceKm(1.7, K_SURVEY)));
check('30 km away, eye at 1.7 m: 50.4 m hidden with no bending', near(hiddenHeightM(1.7, 30, 0), 50.4, 0.1), f(hiddenHeightM(1.7, 30, 0), 2));
check('and 42.7 m with k = 0.13', near(hiddenHeightM(1.7, 30, K_SURVEY), 42.7, 0.1), f(hiddenHeightM(1.7, 30, K_SURVEY), 2));
check('nothing is hidden this side of the horizon', hiddenHeightM(1.7, 4, 0) === 0 && hiddenHeightM(100, 30, 0) === 0);
check('from 10,000 m the horizon dips 3.2 degrees with no bending', near(dipDeg(10000, 0), 3.2, 0.02), f(dipDeg(10000, 0)));
check('and about 3.0 degrees with k = 0.13', near(dipDeg(10000, K_SURVEY), 3.0, 0.02), f(dipDeg(10000, K_SURVEY)));
check('from 10,000 m the horizon is about 357 km away', near(horizonDistanceKm(10000, 0), 357, 1), f(horizonDistanceKm(10000, 0), 1));
check('k = 1 puts the horizon infinitely far away and hides nothing',
  effectiveRadiusKm(1) === Infinity && horizonDistanceKm(1.7, 1) === Infinity && hiddenHeightM(1.7, 300, 1) === 0 && dipDeg(1.7, 1) === 0);
const kWeather = coefficientFromWeather(STANDARD_GROUND_AIR);
check('the standard atmosphere gives k between 0.16 and 0.18', kWeather > 0.16 && kWeather < 0.18, f(kWeather, 4));
check('and that is the value the app calls standard', near(kWeather, K_STANDARD, 0.005));
check('weather to k and back returns the same change of temperature',
  near(lapseForCoefficient(coefficientFromWeather({ tempC: 3, pressureHpa: 990, lapse: 0.02 }), { tempC: 3, pressureHpa: 990 }), 0.02, 1e-12));
check('air of the same temperature all the way up gives k of about 0.21',
  near(coefficientFromWeather({ ...STANDARD_GROUND_AIR, lapse: 0 }), 0.21, 0.005), f(coefficientFromWeather({ ...STANDARD_GROUND_AIR, lapse: 0 }), 4));
check('light follows the curve when the air warms by about 13 C per 100 m', near(lapseForCoefficient(1) * 100, 12.9, 0.3), f(lapseForCoefficient(1) * 100, 2));
const needs = flatNeeds(K_STANDARD);
check('the flat model needs k of about -0.83', near(needs.k, -0.83, 0.001));
check('which is air about 17 C colder for every 100 m of height', near(needs.lapse * 100, -17, 0.5), f(needs.lapse * 100, 2));
check('and with no bending allowed for, about 0.2 C colder per metre', near(flatNeeds(0).lapse, -0.2, 0.005), f(flatNeeds(0).lapse, 4));
// The line where the horizon crosses the target: sea behind it when near, sea in front when far.
check('at the horizon itself the line sits on the waterline', near(horizonLineM(1.7, horizonDistanceKm(1.7, 0), 0), 0, 1e-9));
check('with the target very close the line is at eye height', near(horizonLineM(1.7, 0.001, 0), 1.7, 0.01), f(horizonLineM(1.7, 0.001, 0), 4));
check('on a flat surface the line is always at eye height', horizonLineM(1.7, 30, 1) === 1.7);
const scene = horizonScene({ eyeM: 1.7, targetM: 50, distanceKm: 30, k: 0 });
check('a 50 m ship 30 km off is entirely hidden with no bending, and 9.6 m shows in standard air',
  scene.hiddenM === 50 && scene.visibleM === 0 && near(50 - scene.hiddenStandardM, 9.6, 0.1), f(50 - scene.hiddenStandardM, 2));
check('it is fully out of sight beyond about 29.9 km', near(scene.goneKm, 29.9, 0.1), f(scene.goneKm, 2));
check('hidden height never exceeds the height of the target', horizonScene({ eyeM: 1.7, targetM: 10, distanceKm: 200, k: 0 }).hiddenM === 10);
check('raising the eye brings the hull back', hiddenHeightM(30, 30, K_STANDARD) < 5 && hiddenHeightM(1.7, 30, K_STANDARD) > 40,
  `${f(hiddenHeightM(30, 30, K_STANDARD), 2)} m from 30 m up, ${f(hiddenHeightM(1.7, 30, K_STANDARD), 2)} m from 1.7 m`);

// 12a. Two sunsets.
check('the sun sinks more slowly at a slant: at 60 degrees on an equinox, half the rate at the equator', near(sunSinkDegPerHour(60, 0), 7.5, 1e-9));
let worstRadius = 0;
for (const [low, high, lat, sunLat] of [[0.2, 1.7, 0, 0], [0.2, 1.7, 51.5, -18], [2, 35, 34, 10], [2, 555, 25.2, 0]]) {
  const t = secondSunsetSeconds(low, high, lat, sunLat, K_STANDARD);
  worstRadius = Math.max(worstRadius, Math.abs(radiusFromTwoSunsetsKm(low, high, t, lat, sunLat, K_STANDARD) - EARTH_RADIUS_KM));
}
check("a timing of exactly the predicted gap gives back the Earth's radius", worstRadius < 1e-6, `worst ${worstRadius.toExponential(1)} km`);
check('a longer gap means a smaller Earth', radiusFromTwoSunsetsKm(0.2, 1.7, 12, 0, 0) < radiusFromTwoSunsetsKm(0.2, 1.7, 6, 0, 0));
check('in London in mid November, lying then standing gives about 11 seconds', near(secondSunsetSeconds(0.2, 1.7, 51.5, -18, K_STANDARD), 11.2, 0.4), f(secondSunsetSeconds(0.2, 1.7, 51.5, -18, K_STANDARD), 2));

// 12b. The well-known views.
const badViews = VIEWS.filter((v) => {
  const s = viewSizes(v);
  const numbers = [v.waterM, v.from.lat, v.from.lon, v.from.groundM, v.to.lat, v.to.lon, v.to.baseM, v.to.heightM];
  return (
    !numbers.every(Number.isFinite) ||
    ![v.id, v.name, v.note, v.from.name, v.to.name, v.to.top].every((t) => typeof t === 'string' && t.length > 0) ||
    !TARGET_SHAPES.includes(v.shape) ||
    !(v.sources?.length >= 2) ||
    !v.sources.every((src) => /^https?:\/\//.test(src.url) && src.label) ||
    !(s.distanceKm >= 0.5 && s.distanceKm <= 500 && s.eyeM >= 0.1 && s.eyeM <= 12000 && s.targetM >= 1 && s.targetM <= 5000) ||
    (v.statedKm !== undefined && Math.abs(s.distanceKm - v.statedKm) > Math.max(1.5, v.statedKm * 0.03))
  );
});
check(`all ${VIEWS.length} well-known views have their figures, at least two sources, sizes the tool can show, and a distance within 3% of any published one`,
  badViews.length === 0, badViews.map((v) => v.id).join(', '));
check('no two well-known views share a name', new Set(VIEWS.map((v) => v.id)).size === VIEWS.length && new Set(VIEWS.map((v) => v.name)).size === VIEWS.length);
check('no two well-known views are so alike that the picker could confuse them', VIEWS.every((a, i) => VIEWS.every((b, j) => i >= j ||
  Math.abs(viewSizes(a).distanceKm - viewSizes(b).distanceKm) > 0.02 * viewSizes(a).distanceKm)));
{
  const hides = (id, k = K_STANDARD) => { const s = viewSizes(VIEWS.find((v) => v.id === id)); return hiddenHeightM(s.eyeM, s.distanceKm, k); };
  const size = (id) => viewSizes(VIEWS.find((v) => v.id === id));
  check('Chicago from the top of Warren Dunes: the globe hides the lower part of the Willis Tower and leaves the upper part',
    hides('chicago-warren-dunes') > 150 && hides('chicago-warren-dunes') < 250, f(hides('chicago-warren-dunes'), 0) + ' m of ' + f(size('chicago-warren-dunes').targetM, 0));
  check('Chicago from the shore at Grand Mere: in standard air the globe hides the tower to above its roof',
    hides('chicago-grand-mere') > size('chicago-grand-mere').targetM, f(hides('chicago-grand-mere'), 0) + ' m of ' + f(size('chicago-grand-mere').targetM, 0));
  check('Toronto from Fort Niagara: the globe hides the shore and leaves most of the CN Tower',
    hides('toronto-fort-niagara') > 50 && hides('toronto-fort-niagara') < 0.25 * size('toronto-fort-niagara').targetM, f(hides('toronto-fort-niagara'), 0) + ' m');
  check('the Canigou from Marseille: the globe leaves only the top of the mountain showing',
    hides('canigou-marseille') > 0.9 * size('canigou-marseille').targetM && hides('canigou-marseille') < size('canigou-marseille').targetM, f(hides('canigou-marseille'), 0) + ' m');
  const allauch = VIEWS.find((v) => v.id === 'canigou-allauch');
  check('the Canigou from Allauch: what the globe hides in standard air is within 100 m of the lowest point photographed in 2005',
    near(hides('canigou-allauch'), allauch.lowestSeenM, 100), f(hides('canigou-allauch'), 0) + ' m against ' + allauch.lowestSeenM);
}

// 13. The user's own horizon observations.
const seen = (hiddenM, extra = {}) =>
  cleanObservation({ eyeM: 1.7, distanceKm: 30, targetM: 50, hiddenM, airC: null, waterC: null, label: '', ...extra });
let worstK = 0;
for (const k of [0, 0.13, 0.17, 0.4, 0.8]) {
  for (const [eye, km] of [[1.7, 30], [10, 60], [100, 120]]) {
    worstK = Math.max(worstK, Math.abs(impliedCoefficient(eye, km, hiddenHeightM(eye, km, k)) - k));
  }
}
check('the bending worked back from a hidden height is the bending that produced it', worstK < 1e-9, worstK.toExponential(1));
check('no observation can imply light bent more sharply than the curve', impliedCoefficient(1.7, 30, 0) < 1 && impliedCoefficient(1.7, 500, 0) < 1);
const ordinary = scoreObservation(seen(hiddenHeightM(1.7, 30, K_SURVEY)));
check('42.7 m hidden at 30 km fits the globe in air that cools with height',
  ordinary.air === 'cooling' && ordinary.bound === 'exact' && near(ordinary.k, K_SURVEY, 0.002) && !ordinary.flat.fits,
  `k ${f(ordinary.k)}, ${f(ordinary.lapse * 100, 2)} C per 100 m`);
check('and the flat model would need air about 18 C colder per 100 m', near(ordinary.flat.lapse * 100, -17.6, 0.5), f(ordinary.flat.lapse * 100, 2));
const looming = scoreObservation(seen(20, { airC: 12, waterC: 4 }));
check('20 m hidden at 30 km needs an inversion, and colder water than air is noted',
  looming.air === 'inversion' && looming.lapse > 0 && looming.k > 0.21 && looming.waterMinusAir === -8,
  `k ${f(looming.k)}, ${f(looming.lapse * 100, 2)} C per 100 m`);
const tooMuch = scoreObservation(seen(49.9, { targetM: 80 }));
check('49.9 m hidden, just under the 50.4 m that straight light gives, still fits air that cools with height',
  tooMuch.air === 'cooling' && tooMuch.k > 0 && tooMuch.k < 0.02, f(tooMuch.k, 4));
const upward = scoreObservation(seen(60, { targetM: 80 }));
check('60 m hidden at 30 km is more than straight light gives, so light must bend upward', upward.air === 'upward' && upward.k < 0, f(upward.k));
const allSeenNear = scoreObservation(seen(0, { distanceKm: 4 }));
check('seeing all of something this side of the horizon fits both models', allSeenNear.air === 'either' && allSeenNear.flat.fits);
const allSeenFar = scoreObservation(seen(0));
check('seeing all of a ship 30 km off fits the flat model, and the globe only with extreme bending',
  allSeenFar.flat.fits && allSeenFar.bound === 'atLeast' && allSeenFar.air === 'inversion' && allSeenFar.k > 0.95,
  `k at least ${f(allSeenFar.k)}, ${f(allSeenFar.lapse * 100, 1)} C warmer per 100 m`);
const noneSeen = scoreObservation(seen(50, { distanceKm: 40 }));
check('seeing none of a 50 m ship 40 km off fits the globe in standard air', noneSeen.bound === 'atMost' && noneSeen.air === 'cooling' && noneSeen.k >= K_STANDARD, f(noneSeen.k));
check('hidden is never recorded as more than the height', seen(80).hiddenM === 50);
check('observations outside what the tool can show are dropped',
  mergeObservations([{ eyeM: 0, distanceKm: 30, targetM: 50, hiddenM: 1 }, { eyeM: 2, distanceKm: 9000, targetM: 50, hiddenM: 1 }, { eyeM: 2, distanceKm: 30, targetM: 50, hiddenM: -3 }]).length === 0);
const sightings = [seen(20, { airC: 12, waterC: 4, label: 'ferry' }), seen(0, { distanceKm: 4 })];
check('observations survive a round trip through a link',
  JSON.stringify(decodeObservations(encodeObservations(sightings))) === JSON.stringify(mergeObservations(sightings)));
check('the same observation is not kept twice', mergeObservations(sightings, sightings).length === 2);

// 14. The arguments, each a file of its own in js/arguments/.
const incomplete = ARGUMENTS.filter(
  (a) =>
    ![a.id, a.label, a.title, a.claim, a.ask, a.check].every((v) => typeof v === 'string' && v.length > 0) ||
    !TOOLS.includes(a.tool) ||
    !['outside', 'sky'].includes(a.pair) ||
    typeof a.apply !== 'function' ||
    typeof a.body !== 'function',
);
check(`all ${ARGUMENTS.length} arguments have a name, a claim, a question, a self-check, a tool and both functions`, incomplete.length === 0, incomplete.map((a) => a.id).join(', '));
check('no two arguments share a name', new Set(ARGUMENTS.map((a) => a.id)).size === ARGUMENTS.length);
const groupIds = GROUPS.map((g) => g.id);
check('every argument is listed under a group that exists, and no group is empty',
  ARGUMENTS.every((a) => groupIds.includes(a.group)) && groupIds.every((id) => ARGUMENTS.some((a) => a.group === id)),
  ARGUMENTS.filter((a) => !groupIds.includes(a.group)).map((a) => a.id).join(', '));
const badTours = TOURS.filter(
  (t) =>
    ![t.id, t.label, t.about].every((v) => typeof v === 'string' && v.length > 0) ||
    !t.steps.every((id) => ARGUMENTS.some((a) => a.id === id)) ||
    new Set(t.steps).size !== t.steps.length ||
    t.steps.length < 3 ||
    t.steps.length > MAX_TOUR_STEPS,
);
check(`all ${TOURS.length} tours have a name, and steps that are arguments that exist, none twice`, badTours.length === 0, badTours.map((t) => t.id).join(', '));
check('no two tours share a name, and none takes the name kept for a tour of your own',
  new Set(TOURS.map((t) => t.id)).size === TOURS.length && !TOURS.some((t) => t.id === OWN_TOUR));
check('every argument is in at least one tour', ARGUMENTS.every((a) => TOURS.some((t) => t.steps.includes(a.id))),
  ARGUMENTS.filter((a) => !TOURS.some((t) => t.steps.includes(a.id))).map((a) => a.id).join(', '));
check('every question an argument asks ends as a question', ARGUMENTS.every((a) => a.ask.trim().endsWith('?')),
  ARGUMENTS.filter((a) => !a.ask.trim().endsWith('?')).map((a) => a.id).join(', '));
check('a tour of your own keeps only arguments that exist, each once, in the listed order',
  cleanTourSteps(['ship', 'nonsense', 'sunset', 'ship']).join() === 'sunset,ship' && cleanTourSteps(null).length === 0);
check(`and is cut off at ${MAX_TOUR_STEPS} steps`, cleanTourSteps(ARGUMENTS.map((a) => a.id)).length === Math.min(MAX_TOUR_STEPS, ARGUMENTS.length));

// 14a. Controls that belong to an argument.
const faults = ARGUMENTS.flatMap(controlFaults);
check(`the ${ARGUMENTS.filter((a) => a.controls?.length).length} arguments with controls of their own describe them properly`, faults.length === 0, faults.join('; '));
{
  const slider = { id: 'n', label: 'N', min: 10, max: 80, step: 0.5, value: 60 };
  const wide = { id: 'w', label: 'W', min: 0.1, max: 500, scale: 'log', value: 5 };
  const list = { id: 'l', label: 'L', options: [['a', 'A'], ['b', 'B']], value: 'a' };
  const made = { id: 'made', controls: [slider, wide, list] };
  check('a slider value is kept within its range and on its step',
    cleanValue(slider, 200) === 80 && cleanValue(slider, -5) === 10 && cleanValue(slider, 33.26) === 33.5 && cleanValue(slider, '45') === 45);
  check('anything that is not a number goes back to where the slider starts',
    cleanValue(slider, 'x') === 60 && cleanValue(slider, '') === 60 && cleanValue(slider, null) === 60 && cleanValue(slider, NaN) === 60);
  check('a list keeps only its own options', cleanValue(list, 'b') === 'b' && cleanValue(list, 'z') === 'a');
  check('a log slider runs from its least value to its greatest',
    sliderValue(wide, 0) === 0.1 && sliderValue(wide, SLIDER_STEPS) === 500 && sliderPosition(wide, 0.1) === 0 && sliderPosition(wide, 500) === SLIDER_STEPS);
  let worstSlide = 0;
  for (let p = 0; p <= SLIDER_STEPS; p++) worstSlide = Math.max(worstSlide, Math.abs(sliderPosition(wide, sliderValue(wide, p)) - p));
  check('and every place on it stands for a value that leads back to within one place', worstSlide <= 1, `worst ${worstSlide}`);
  check('values that have not been changed are left out of a link', encodeOwn(made, defaultsFor(made)) === '' && encodeOwn({ id: 'none' }, {}) === '');
  const changed = { n: 33.5, w: 12.3, l: 'b' };
  check('values survive being written into a link and read back',
    JSON.stringify(decodeOwn(made, encodeOwn(made, changed))) === JSON.stringify(changed), encodeOwn(made, changed));
  check('a link cannot set a control the argument does not have, or push one out of range',
    JSON.stringify(decodeOwn(made, 'zz:9~n:9999~l:nope~w:abc')) === JSON.stringify({ n: 80, w: 5, l: 'a' }));
  check('missing values are filled in from where the controls start', JSON.stringify(cleanOwn(made, { n: 20 })) === JSON.stringify({ n: 20, w: 5, l: 'a' }));
  check('a badly described control is caught',
    controlFaults({ id: 'x', controls: [{ id: 'Bad Id', label: '', min: 5, max: 1, value: 3 }] }).length >= 3 &&
    controlFaults({ id: 'x', controls: [{ id: 'a', label: 'A', min: 0, max: 10, step: 3, value: 5 }] }).length === 1 &&
    controlFaults({ id: 'x', controls: [{ id: 'a', label: 'A', min: 0, max: 10, scale: 'log', value: 5 }] }).length === 1);
}
for (const a of ARGUMENTS) a.checks?.({ check, near, f });

// 15. Google Earth.
check('the Google Earth link carries the place and the viewing distance',
  earthUrl(-33.87, 151.21, 1500) === 'https://earth.google.com/web/@-33.87,151.21,0a,1500000d,35y,0h,0t,0r', earthUrl(-33.87, 151.21, 1500));
const kmlRoute = greatCirclePath(place('Sydney'), place('Santiago'), 24);
const kml = buildKml({
  title: 'Test & <check>',
  observer: place('London'),
  overhead: [{ name: 'Sun overhead', description: 'here', lat: sub.lat, lon: sub.lon }],
  route: { name: 'Sydney to Santiago', description: 'x', from: place('Sydney'), to: place('Santiago'), path: kmlRoute, lengthKm: 11346 },
});
check('the KML file escapes its text', kml.includes('<name>Test &amp; &lt;check&gt;</name>') && !kml.includes('<check>'));
check('the KML file has a point for the observer, the sun and both ends of the route', (kml.match(/<Point>/g) ?? []).length === 4);
const kmlLine = kml.match(/<LineString>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)?.[1].split(' ') ?? [];
check('the route in the KML file runs from Sydney to Santiago, longitude first',
  kmlLine.length === 25 && kmlLine[0] === '151.21,-33.87,0' && kmlLine[24].startsWith('-70.6'), `${kmlLine.length} points, ${kmlLine[0]} to ${kmlLine[24]}`);
check('every opening tag in the KML file is closed',
  ['kml', 'Document', 'Placemark', 'Point', 'LineString', 'LookAt', 'coordinates', 'name'].every(
    (tag) => (kml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length === (kml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length));

// 15a. A line of sight on the map, and reading a KML file back in.
{
  const sizes = { eyeM: 2, targetM: 100, distanceKm: 40 };
  check('the line of sight starts at the eye and ends at the top of the target',
    near(sightLineHeightM(0, sizes, K_STANDARD), 2, 1e-9) && near(sightLineHeightM(40, sizes, K_STANDARD), 100, 1e-9));
  check('half way along, it is lower than a straight run by the rise of the water in between',
    near(51 - sightLineHeightM(20, sizes, 0), middleMarkRiseM(40, 0), 1e-9) && near(51 - sightLineHeightM(20, sizes, K_STANDARD), middleMarkRiseM(40, K_STANDARD), 1e-9));
  check('light that follows the curve gives a straight run', near(sightLineHeightM(20, sizes, 1), 51, 1e-9));
  // The line to the lowest point that can be seen just touches the water, and goes no lower.
  const lowest = hiddenHeightM(sizes.eyeM, sizes.distanceKm, K_STANDARD);
  let least = Infinity;
  for (let i = 0; i <= 4000; i++) least = Math.min(least, sightLineHeightM((40 * i) / 4000, { ...sizes, targetM: lowest }, K_STANDARD));
  check('the line of sight to the lowest point that shows just grazes the water', Math.abs(least) < 0.001, least.toExponential(1));

  const allauch = VIEWS.find((v) => v.id === 'canigou-allauch');
  const s = viewSizes(allauch);
  const track = greatCirclePath(allauch.from, allauch.to, 16);
  const sightKml = buildSightKml({
    title: 'A & B',
    from: { ...allauch.from, name: 'Eye <1>', description: 'x', altM: s.eyeM },
    to: { ...allauch.to, name: 'Top', description: 'y', altM: s.targetM },
    track,
    lines: [{ name: 'Line', description: 'z', colour: 'ffffb16f', path: track.map((p, i) => ({ ...p, altM: sightLineHeightM((s.distanceKm * i) / 16, s, K_STANDARD) })) }],
  });
  check('the sight-line file escapes its text and gives the line its heights above the sea',
    sightKml.includes('<name>A &amp; B</name>') && sightKml.includes('Eye &lt;1&gt;') && (sightKml.match(/<altitudeMode>absolute<\/altitudeMode>/g) ?? []).length === 3);
  const back = parseKml(sightKml);
  check('reading that file back gives its two ends and its two paths',
    back.problem === null && back.points.length === 2 && back.lines.length === 2 && back.points[0].name === 'Eye <1>' && back.lines[1].path.length === 17,
    `${back.points.length} places, ${back.lines.length} paths`);
  check('and the ends are where they were put, with their heights',
    near(back.points[0].lat, allauch.from.lat, 1e-5) && near(back.points[1].lon, allauch.to.lon, 1e-5) && near(back.points[0].altM, Math.round(s.eyeM), 1e-9) &&
    near(globeDistanceKm(back.points[0], back.points[1]), s.distanceKm, 0.01));
  const ownFile = parseKml(kml);
  check("the app's own view file reads back: the observer, the sun and both ends of the route, and the route",
    ownFile.points.length === 4 && ownFile.points[0].name === 'Observer' && ownFile.lines.length === 1 && ownFile.lines[0].path.length === 25);
  const earthStyle = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder>
    <Placemark><name><![CDATA[Tom & Jerry's <b>pier</b>]]></name><Point><coordinates>
      -86.5442,42.0081,177 </coordinates></Point></Placemark>
    <Placemark><name>Caf&#233; &amp; bar</name><LineString><coordinates>-87.6,41.8,0
      -86.5,42.0,0 999,5,0 nonsense</coordinates></LineString></Placemark>
    <Placemark><name>Off the map</name><Point><coordinates>10,95,0</coordinates></Point></Placemark>
    <Placemark><Point><coordinates>1,2</coordinates></Point></Placemark>
  </Folder></Document></kml>`;
  const read = parseKml(earthStyle);
  check('names are read as the text they stand for, with their wrapping and escapes undone',
    read.points[0].name === "Tom & Jerry's <b>pier</b>" && read.lines[0].name === 'Café & bar', `${read.points[0]?.name} / ${read.lines[0]?.name}`);
  check('coordinates are longitude first, anything off the Earth is dropped, and a missing height is zero',
    read.points.length === 2 && read.points[0].lat === 42.0081 && read.points[0].lon === -86.5442 && read.points[0].altM === 177 &&
    read.lines[0].path.length === 2 && read.points[1].altM === 0 && read.points[1].name === 'Place 2');
  check('a zipped file, an empty one and something that is not KML are each turned away with a reason',
    [parseKml('PK\u0003\u0004junk'), parseKml('   '), parseKml('<html><body>hello</body></html>'), parseKml('<kml><Document></Document></kml>')].every(
      (r) => r.points.length === 0 && r.lines.length === 0 && typeof r.problem === 'string' && r.problem.length > 10));
  check('a file that is too large is not read', parseKml('<kml>' + ' '.repeat(KML_LIMITS.bytes) + '</kml>').problem !== null);
  const crowd = '<kml>' + Array.from({ length: KML_LIMITS.points + 50 }, (_, i) => `<Placemark><Point><coordinates>${i % 90},${i % 45}</coordinates></Point></Placemark>`).join('') + '</kml>';
  check(`no more than ${KML_LIMITS.points} places are kept from one file`, parseKml(crowd).points.length === KML_LIMITS.points);
}

// 16. Light followed through layers of air.
const RAD = Math.PI / 180;
// The whole atmosphere, in the conditions the lift formula assumes, must reproduce that formula.
const formulaAir = makeAir({ tempC: 10, pressureHpa: 1010 });
let worstHigh = 0;
for (const el of [2, 3, 5, 10, 20, 45]) {
  const traced = (astronomicalBend(formulaAir, el * RAD) / RAD) * 60;
  worstHigh = Math.max(worstHigh, Math.abs(traced - (el - trueElevation(el)) * 60));
}
check('traced through the whole atmosphere, the lift matches the formula within a quarter of an arcminute from 2 degrees up',
  worstHigh < 0.25, `worst ${f(worstHigh, 2)} arcminutes`);
const tracedHorizon = (astronomicalBend(formulaAir, 0) / RAD) * 60;
check('and within an arcminute on the horizon itself', Math.abs(tracedHorizon - 34.4) < 1, `${f(tracedHorizon, 2)} against 34.4`);
// Even air must give the same answers as the single bending coefficient.
const evenAir = makeAir({});
let worstHidden = 0;
let worstFlat = 0;
for (const [eyeM, distanceKm, targetM] of [[1.7, 30, 50], [1.7, 20, 50], [2, 60, 300], [10, 40, 100], [100, 80, 300]]) {
  const globe = traceView(evenAir, { eyeM, distanceKm, targetM, curved: true });
  worstHidden = Math.max(worstHidden, Math.abs(globe.hiddenM - Math.min(targetM, hiddenHeightM(eyeM, distanceKm, K_STANDARD))) / targetM);
  worstFlat = Math.max(worstFlat, traceView(evenAir, { eyeM, distanceKm, targetM, curved: false }).hiddenM);
}
check('in even air the traced hidden height matches the single-coefficient one within half a percent of the height',
  worstHidden < 0.005, `worst ${f(worstHidden * 100, 2)}%`);
check('and on flat ground even air hides nothing', worstFlat === 0);
const tracedShip = traceView(evenAir, { eyeM: 1.7, distanceKm: 20, targetM: 50, curved: true });
check('the traced horizon is where the formula puts it, within 2%', near(tracedShip.horizonKm, horizonDistanceKm(1.7, K_STANDARD), 0.1), f(tracedShip.horizonKm));
check('air of one temperature all the way up matches k = 0.21',
  near(traceView(makeAir({ lapse: 0 }), { eyeM: 1.7, distanceKm: 30, targetM: 50, curved: true }).hiddenM,
    hiddenHeightM(1.7, 30, coefficientFromWeather({ ...STANDARD_GROUND_AIR, lapse: 0 })), 0.3));
check('a ray aimed at the ground reaches it, and one aimed at the sky leaves',
  traceRay(evenAir, { eyeM: 2, angle: -0.01, maxKm: 50 }).end === 'ground' && traceRay(evenAir, { eyeM: 2, angle: 0.05, maxKm: 500 }).end === 'high');
// Water colder or warmer than the air.
const sizes = { eyeM: 1.7, distanceKm: 20, targetM: 50 };
const coldAir = makeAir({ tempC: 15, surfaceC: 9, layerM: 15 });
const warmAir = makeAir({ tempC: 12, surfaceC: 15, layerM: 2 });
const coldGlobe = traceView(coldAir, { ...sizes, curved: true });
const warmGlobe = traceView(warmAir, { ...sizes, curved: true });
const warmFlat = traceView(warmAir, { ...sizes, curved: false });
check('over cold water less is hidden on the globe than in even air', coldGlobe.hiddenM < tracedShip.hiddenM - 5, `${f(coldGlobe.hiddenM, 1)} m against ${f(tracedShip.hiddenM, 1)} m`);
check('over warm water more is hidden on the globe', warmGlobe.hiddenM > tracedShip.hiddenM + 5, `${f(warmGlobe.hiddenM, 1)} m`);
check('over warm water the flat model hides the foot too, but less than the globe',
  warmFlat.hiddenM > 2 && warmFlat.hiddenM < warmGlobe.hiddenM, `flat ${f(warmFlat.hiddenM, 1)} m, globe ${f(warmGlobe.hiddenM, 1)} m`);
check('and the flat model hides nothing over cold water', traceView(coldAir, { ...sizes, curved: false }).hiddenM === 0);
const nearer = traceView(warmAir, { ...sizes, distanceKm: 10, curved: false }).hiddenM;
check('on flat ground the warm-water hiding grows in step with distance', near(warmFlat.hiddenM / nearer, 2, 0.35), `${f(nearer, 1)} m at 10 km, ${f(warmFlat.hiddenM, 1)} m at 20 km`);

// 18. The moon.
let worstMoon = 0;
let worstMoonFar = 0;
for (let day = 0; day < 30; day += 3) {
  for (let hour = 0; hour < 24; hour += 3) {
    const t = new Date(Date.UTC(2026, 10, 1 + day, hour));
    const mp = moonPoint(t);
    for (const c of REF_CITIES) {
      const o = observedMoon(t, c.lat, c.lon, null);
      worstMoon = Math.max(worstMoon, skySeparation(o, globePredictNear(mp, c.lat, c.lon, null)));
      worstMoonFar = Math.max(worstMoonFar, skySeparation(o, globePredict(mp, c.lat, c.lon, null)));
    }
  }
}
check('globe model, given the moon\'s distance, matches the published moon within 0.01 deg', worstMoon < 0.01, `worst ${f(worstMoon, 4)}`);
check('without the distance it is up to a degree out, so the distance matters', worstMoonFar > 0.9 && worstMoonFar < 1.1, f(worstMoonFar));
// What is lit.
const origin = [0, 0, 0];
check('a ball is fully lit with the light behind the viewer, dark with it behind the ball, half lit from the side',
  near(litFraction([10, 0, 0], origin, [5, 0, 0]), 1, 1e-12) && near(litFraction([10, 0, 0], origin, [-5, 0, 0]), 0, 1e-12) && near(litFraction([10, 0, 0], origin, [0, 5, 0]), 0.5, 1e-12));
const fullMoon = nextFullMoon(new Date(Date.UTC(2026, 10, 13)));
const moonPlaces = (t, sunHeight = 5000, moonHeight = 5000) => {
  const sp = subsolarPoint(t);
  const mp = moonPoint(t);
  return {
    sp, mp,
    globe: { sun: globePlace(sp.lat, sp.lon, sp.distKm), moon: globePlace(mp.lat, mp.lon, mp.distKm) },
    flat: { sun: flatPlace(sp.lat, sp.lon, sunHeight), moon: flatPlace(mp.lat, mp.lon, moonHeight) },
  };
};
let worstPhase = 0;
for (const t of [fullMoon, new Date(fullMoon.getTime() + 7.4 * 86400000), new Date(fullMoon.getTime() - 11 * 86400000)]) {
  const p = moonPlaces(t);
  for (const c of REF_CITIES) worstPhase = Math.max(worstPhase, Math.abs(litFraction(p.globe.sun, p.globe.moon, globePlace(c.lat, c.lon)) - moonPhase(t).fraction));
}
check('on the globe every city sees the published phase, within one part in a hundred', worstPhase < 0.01, f(worstPhase, 4));
const atFull = moonPlaces(fullMoon);
const moonUp = REF_CITIES.filter((c) => observedMoon(fullMoon, c.lat, c.lon).el > 0);
const flatLits = moonUp.map((c) => litFraction(atFull.flat.sun, atFull.flat.moon, flatPlace(c.lat, c.lon)));
check('at full moon the flat model shows different cities phases more than 40 points apart',
  moonUp.length >= 4 && Math.max(...flatLits) - Math.min(...flatLits) > 0.4, `${f(Math.min(...flatLits) * 100, 0)}% to ${f(Math.max(...flatLits) * 100, 0)}% in ${moonUp.length} cities`);
check('directly under the flat model\'s moon, with the sun at the same height, exactly half is lit',
  near(litFraction(atFull.flat.sun, atFull.flat.moon, flatPlace(atFull.mp.lat, atFull.mp.lon)), 0.5, 1e-9));
// Which face.
let turnGlobe = 0;
let turnFlat = 0;
for (const a of moonUp) {
  for (const b of moonUp) {
    turnGlobe = Math.max(turnGlobe, viewsApartDeg(atFull.globe.moon, globePlace(a.lat, a.lon), globePlace(b.lat, b.lon)));
    turnFlat = Math.max(turnFlat, viewsApartDeg(atFull.flat.moon, flatPlace(a.lat, a.lon), flatPlace(b.lat, b.lon)));
  }
}
check('on the globe no two cities see the moon from directions more than 2 deg apart', turnGlobe < 2, f(turnGlobe, 2));
check('on the flat model some see it from directions more than 60 deg apart', turnFlat > 60, f(turnFlat, 0));
check('the lit side points straight up when the sun is directly above the moon, and to the right when the sun is to the right',
  near(brightSideDeg({ az: 100, el: 10 }, { az: 100, el: 40 }), 0, 1e-9) && near(brightSideDeg({ az: 100, el: 0 }, { az: 130, el: 0 }), 90, 1e-9));
// Eclipses: the Earth's shadow, from plain geometry, against every published eclipse.
const published = lunarEclipses(2020, 2035);
const wrongEclipses = published.filter((e) => earthShadow(subsolarPoint(e.peak), moonPoint(e.peak)).kind !== (e.kind === 'penumbral' ? 'none' : e.kind));
const dark = published.filter((e) => e.kind !== 'penumbral').length;
check(`the globe's shadow puts the moon in or out of it correctly for all ${published.length} eclipses of 2020 to 2035 (${dark} partial or total)`,
  published.length > 30 && wrongEclipses.length === 0, wrongEclipses.map((e) => e.peak.toISOString().slice(0, 10)).join(', '));
let falseAlarms = 0;
let fullMoons = 0;
for (let t = nextFullMoon(new Date(Date.UTC(2020, 0, 1))); t.getUTCFullYear() < 2036; t = nextFullMoon(new Date(t.getTime() + 5 * 86400000))) {
  fullMoons++;
  const real = published.some((e) => Math.abs(e.peak - t) < 86400000 && e.kind !== 'penumbral');
  if ((earthShadow(subsolarPoint(t), moonPoint(t)).kind !== 'none') !== real) falseAlarms++;
}
check(`and gives no eclipse at any other of the ${fullMoons} full moons of 2020 to 2035`, falseAlarms === 0, `${falseAlarms} wrong`);
const total = nextLunarEclipse(new Date(Date.UTC(2026, 10, 13)), true);
const totalShadow = earthShadow(subsolarPoint(total.peak), moonPoint(total.peak));
check('the next total eclipse is found, and the moon is wholly inside the shadow at its peak',
  total.kind === 'total' && totalShadow.kind === 'total' && publishedEclipse(total.peak) === 'total', `${total.peak.toISOString().slice(0, 10)}, ${f(totalShadow.offDeg, 2)} deg from the middle`);
check("the Earth's shadow at the moon is between 2.5 and 3 times the moon's width", totalShadow.shadowDeg / totalShadow.moonDeg > 2.5 && totalShadow.shadowDeg / totalShadow.moonDeg < 3,
  f(totalShadow.shadowDeg / totalShadow.moonDeg, 2));

// 17. The explanations the app shows, and the code they describe.
// The flat model's formulas, as the info boxes give them, against plain vectors on the map.
let worstMap = 0;
for (const a of REF_CITIES) {
  for (const b of REF_CITIES) {
    const p = flatVec(a.lat, a.lon);
    const q = flatVec(b.lat, b.lon);
    worstMap = Math.max(worstMap, Math.abs(flatMapDistanceKm(a.lat, a.lon, b.lat, b.lon) - Math.hypot(p[0] - q[0], p[2] - q[2]) * EARTH_RADIUS_KM));
  }
}
check('the flat-map distance formula agrees with measuring straight across the map', worstMap < 1e-6, `worst ${worstMap.toExponential(1)} km`);
check('the angle between two places on the globe is 90 degrees from pole to equator, 180 pole to pole',
  near(globeAngleDeg(90, 0, 0, 50), 90, 1e-9) && near(globeAngleDeg(90, 0, -90, 0), 180, 1e-9));
const hereNow = { lat: 51.51, lon: -0.13 };
const g = globePredict(sub, hereNow.lat, hereNow.lon, null);
check("the globe's height is 90 degrees less the angle to the place under the sun",
  near(g.trueEl, 90 - globeAngleDeg(hereNow.lat, hereNow.lon, sub.lat, sub.lon), 1e-9));
const fl0 = flatPredict(sub, hereNow.lat, hereNow.lon, params, null);
check("the flat model's distance to the place under the sun is the flat-map distance",
  near(fl0.groundKm, flatMapDistanceKm(hereNow.lat, hereNow.lon, sub.lat, sub.lon), 1e-6));

// Every function an explanation points at must exist, and every explanation must be reachable.
const modules = {};
const missing = [];
for (const [key, entry] of Object.entries(EXPLAIN)) {
  for (const [file, ...names] of entry.code ?? []) {
    modules[file] ??= await import(`../js/${file}`);
    for (const name of names) if (typeof modules[file][name] !== 'function') missing.push(`${key}: ${file} ${name}`);
  }
}
check('every function an explanation names exists in the code', missing.length === 0, missing.join('; '));
const pageText = readFileSync(new URL('../index.html', import.meta.url), 'utf8') + readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const used = new Set([...pageText.matchAll(/data-info="([a-z.]+)"|infoButton\('([a-z.]+)'/g)].map((m) => m[1] ?? m[2]));
const unknown = [...used].filter((key) => !EXPLAIN[key]);
const unused = Object.keys(EXPLAIN).filter((key) => !used.has(key));
check('every info button opens an explanation that exists', unknown.length === 0, unknown.join(', '));
check('every explanation has a button that opens it', unused.length === 0, unused.join(', '));

// Each explanation is worked through with real numbers and must come out whole.
const plain = (n, d = 1) => n.toFixed(d);
const stubApp = {
  state: { date: now, sunsetLowM: 0.2, sunsetHighM: 1.7, lat: hereNow.lat, lon: hereNow.lon, sunHeightKm: 5000, lightRangeKm: 10000, flatLight: 'bent', moonHeightKm: 5000, refraction: 'custom', tempC: -5, pressureHpa: 1000, mode: 'sky' },
  percent: (x) => `${Math.round(x * 100)}%`,
  deg: (n, d = 1) => `${plain(n, d)}°`,
  km: (n) => `${Math.round(n)} km`,
  kmh: (n) => `${Math.round(n)} km/h`,
  bearing: (n) => `${plain(n)}°`,
  hoursMinutes: (h) => `${plain(h)} h`,
  fmtH: (m) => `${plain(m)} m`,
  fmtD: (k) => `${plain(k)} km`,
  fmtSpeed: (v) => `${Math.round(v)} km/h`,
  fmtAngle: (a) => `${plain(a, 3)}°`,
  fmtTime: (m) => `${Math.round(m)} min`,
  REF_CITIES,
};
const air = { tempC: -5, pressureHpa: 1000 };
const routeEnds = [place('Sydney'), place('Santiago')];
const sample = {
  sky: {
    sub,
    obs: observedSun(now, hereNow.lat, hereNow.lon, air),
    globe: globePredict(sub, hereNow.lat, hereNow.lon, air),
    flat: flatPredict(sub, hereNow.lat, hereNow.lon, params, air),
    cities: REF_CITIES.map((c) => {
      const o = observedSun(now, c.lat, c.lon, air);
      return { ...c, obs: o, flat: flatPredict(sub, c.lat, c.lon, params, air), implied: impliedSunHeightKm(sub, c.lat, c.lon, o.el) };
    }),
    route: { a: routeEnds[0], b: routeEnds[1], ...routeStats(routeEnds[0], routeEnds[1], 13.3) },
    moon: (() => {
      const mp = moonPoint(now);
      const p = moonPlaces(now);
      const dome = { sunHeightKm: 5000, lightRangeKm: Infinity };
      const eye = { globe: globePlace(hereNow.lat, hereNow.lon), flat: flatPlace(hereNow.lat, hereNow.lon) };
      return {
        point: mp,
        obs: observedMoon(now, hereNow.lat, hereNow.lon, air),
        globe: globePredictNear(mp, hereNow.lat, hereNow.lon, air),
        flat: flatPredict(mp, hereNow.lat, hereNow.lon, dome, air),
        lit: { measured: moonPhase(now).fraction, globe: litFraction(p.globe.sun, p.globe.moon, eye.globe), flat: litFraction(p.flat.sun, p.flat.moon, eye.flat) },
        shadow: earthShadow(sub, mp),
        published: publishedEclipse(now),
        cities: REF_CITIES.map((c) => ({
          ...c,
          obs: observedMoon(now, c.lat, c.lon, air),
          litFlat: litFraction(p.flat.sun, p.flat.moon, flatPlace(c.lat, c.lon)),
          turnGlobe: viewsApartDeg(p.globe.moon, eye.globe, globePlace(c.lat, c.lon)),
          turnFlat: viewsApartDeg(p.flat.moon, eye.flat, flatPlace(c.lat, c.lon)),
        })),
      };
    })(),
  },
  horizon: { ...horizonScene({ eyeM: 1.7, targetM: 50, distanceKm: 20, k: K_STANDARD }), flatHiddenM: 0, traced: null },
  flight: flightScene({ speedKmh: 900, altitudeM: 11000, minutes: 10 }),
};
const broken = [];
for (const [key, entry] of Object.entries(EXPLAIN)) {
  let html = '';
  try {
    html = entry.body(sample[entry.tool], stubApp);
  } catch (err) {
    html = `threw ${err.message}`;
  }
  if (typeof html !== 'string' || html.length < 40 || /NaN|undefined|threw|Infinity/.test(html)) broken.push(key);
}
check(`all ${Object.keys(EXPLAIN).length} explanations work through with real numbers`, broken.length === 0, broken.join(', '));
const flatWorking = EXPLAIN['sky.elevation'].body(sample.sky, stubApp);
check('the working shown for the flat sun carries the numbers the model produced',
  flatWorking.includes(stubApp.km(sample.sky.flat.groundKm)) && flatWorking.includes(stubApp.deg(sample.sky.flat.trueEl, 2)));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
