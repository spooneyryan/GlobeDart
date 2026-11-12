// Sanity checks for the sun and model maths: `node tools/check-maths.mjs`.
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
const overhead = observedSun(now, sub.lat, sub.lon, false);
check('sun is at the zenith over the subsolar point', overhead.el > 89.99, f(overhead.el, 4));
check('sun angular size about 0.54 deg in November', Math.abs(sub.sizeDeg - 0.539) < 0.005, f(sub.sizeDeg, 4));

// 3. Globe model agrees with the ephemeris everywhere.
let worst = 0;
for (const c of REF_CITIES) {
  for (let h = 0; h < 24; h++) {
    const t = new Date(Date.UTC(2026, 10, 12, h));
    const sp = subsolarPoint(t);
    const obs = observedSun(t, c.lat, c.lon, true);
    worst = Math.max(worst, skySeparation(obs, globePredict(sp, c.lat, c.lon, true)));
  }
}
check('globe model matches ephemeris within 0.02 deg', worst < 0.02, `worst ${f(worst, 4)}`);

// 4. Flat model geometry: observer under the sun sees it overhead; known triangle elsewhere.
const params = { sunHeightKm: 5000, lightRangeKm: 10000 };
const under = flatPredict(eq, eq.lat, eq.lon, params, false);
check('flat: sun overhead at subsolar point', under.el > 89.99 && Math.abs(under.sizeDeg - eq.sizeDeg) < 1e-6);
const pole = flatPredict(eq, 89.9999, 0, params, false);
const expectPole = (Math.atan2(5000, (Math.PI / 2) * EARTH_RADIUS_KM) * 180) / Math.PI;
check('flat: elevation at pole on equinox', Math.abs(pole.el - expectPole) < 0.01, `${f(pole.el)} vs ${f(expectPole)}`);
// Observer on the equator, 90 degrees of longitude west of the sun: sun should bear north-east (45).
const west = flatPredict(eq, 0, eq.lon - 90, params, false);
check('flat: equinox sunrise bears 45 deg, not 90', Math.abs(west.az - 45) < 0.5, `az ${f(west.az)} el ${f(west.el)}`);
const globeWest = globePredict(eq, 0, eq.lon - 90, false);
check('globe: equinox sunrise bears 90 deg', Math.abs(globeWest.az - 90) < 0.5 && Math.abs(globeWest.el) < 0.1, `az ${f(globeWest.az)} el ${f(globeWest.el)}`);
// East/west sanity: sun east of the observer in the morning on both models.
const am = flatPredict(eq, 40, eq.lon - 45, params, false);
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
const globeRms = rmsMiss(samples, (sp, lat, lon) => globePredict(sp, lat, lon, true));
const fit = flatFitCurve(samples, params, true);
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
    worstStar = Math.max(worstStar, skySeparation(observedStar(night, c.lat, c.lon, p), globePredict(p, c.lat, c.lon, true)));
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
const starFit = flatFitCurve(starSamples, domeParams, true);
console.log(`stars: flat best ${f(starFit.best.rms, 1)} deg at ${Math.round(starFit.best.heightKm)} km`);
check('no star height brings the flat model within 10 deg', starFit.best.rms > 10);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
