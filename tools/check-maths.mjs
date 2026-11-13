// Sanity checks for the sun and model maths: `node tools/check-maths.mjs`.
import * as Astronomy from '../vendor/astronomy.js';
import { STANDARD_AIR, standardLift, lift, airFactor, apparentElevation, trueElevation } from '../js/refraction.js';
import {
  K_STANDARD,
  K_SURVEY,
  STANDARD_GROUND_AIR,
  coefficientFromWeather,
  lapseForCoefficient,
  effectiveRadiusKm,
  horizonDistanceKm,
  hiddenHeightM,
  horizonLineM,
  dipDeg,
  flatNeeds,
  horizonScene,
} from '../js/horizon.js';
import { ARGUMENTS, TOOLS } from '../js/arguments/index.js';
import { earthUrl, buildKml } from '../js/earth.js';
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
  EARTH_RADIUS_KM,
} from '../js/astro.js';
import { STARS, STAR_LINES, starIndex } from '../js/stars.js';
import { ROUTES, routeStats, greatCirclePath } from '../js/distances.js';
import {
  globePredict,
  flatPredict,
  impliedSunHeightKm,
  skySeparation,
  rmsMiss,
  flatFitCurve,
} from '../js/models.js';
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
} from '../js/measurements.js';

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
}
const f = (n, d = 3) => n.toFixed(d);

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
check('every listed flight needs an ordinary airliner speed on the globe',
  ROUTES.every((r) => {
    const v = routeStats(place(r.from), place(r.to), (r.there + r.back) / 2).globeKmh;
    return v > 680 && v < 960;
  }));

// 10. The stars.
const wrong = STARS.filter((st) => constellationAt(st.ra, st.dec) !== st.con);
check(`all ${STARS.length} stars lie in their stated constellations`, wrong.length === 0, wrong.map((st) => st.name).join(', '));
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
const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;
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
    ![a.id, a.label, a.title, a.claim].every((v) => typeof v === 'string' && v.length > 0) ||
    !TOOLS.includes(a.tool) ||
    !['outside', 'sky'].includes(a.pair) ||
    typeof a.apply !== 'function' ||
    typeof a.body !== 'function',
);
check(`all ${ARGUMENTS.length} arguments have a name, a claim, a tool and both functions`, incomplete.length === 0, incomplete.map((a) => a.id).join(', '));
check('no two arguments share a name', new Set(ARGUMENTS.map((a) => a.id)).size === ARGUMENTS.length);
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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
