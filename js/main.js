import {
  subsolarPoint,
  observedSun,
  sunEvents,
  seasons,
  starPoints,
  observedStar,
  siderealHours,
  wrap180,
  moonPoint,
  observedMoon,
  moonPhase,
  nextFullMoon,
  nextLunarEclipse,
  publishedEclipse,
} from './astro.js';
import {
  globePredict,
  flatPredict,
  flatBendPerKm,
  impliedSunHeightKm,
  skySeparation,
  rmsMiss,
  flatFitCurve,
  globePredictNear,
  globePlace,
  flatPlace,
  litFraction,
  viewsApartDeg,
  brightSideDeg,
  earthShadow,
} from './models.js';
import { CITIES, REF_CITIES } from './cities.js';
import {
  MAX_MEASUREMENTS,
  shadowToElevation,
  shadowToAzimuth,
  summariseMeasurements,
  overheadPoint,
  cleanMeasurement,
  mergeMeasurements,
  encodeMeasurements,
  decodeMeasurements,
} from './measurements.js';
import { STANDARD_AIR, AIR_LIMITS, airFactor } from './refraction.js';
import {
  K_STANDARD,
  STANDARD_GROUND_AIR,
  OVERTURNING_LAPSE,
  coefficientFromWeather,
  lapseForCoefficient,
  horizonDistanceKm,
  horizonLineM,
  horizonScene,
  HORIZON_LIMITS,
  TARGET_SHAPES,
  sightLineHeightM,
  hiddenHeightM,
  dipDeg,
  sunSinkDegPerHour,
  secondSunsetSeconds,
  radiusFromTwoSunsetsKm,
} from './horizon.js';
import {
  MAX_OBSERVATIONS,
  scoreObservation,
  cleanObservation,
  mergeObservations,
  encodeObservations,
  decodeObservations,
} from './observations.js';
import {
  STARS,
  PLANETS,
  SKY_BODIES,
  STAR_LINES,
  FEATURED_STARS,
  starIndex,
  SKY_TURN_DEG_PER_MIN,
  MAX_CATALOGUE_STARS,
  addCatalogueStar,
  catalogueName,
  catalogueNamesIn,
} from './stars.js';
import { ROUTES, CRUISE_KMH, SOUND_KMH, routeStats, greatCirclePath, globeDistanceKm } from './distances.js';
import { makeLandCanvas } from './scene-utils.js';
import { GlobeView } from './views/globeView.js';
import { FlatView } from './views/flatView.js';
import { SkyView } from './views/skyView.js';
import { ARGUMENTS, ARGUMENT_BY_ID, GROUPS, TOOLS, TOURS, OWN_TOUR, MIN_TOUR_STEPS, MAX_TOUR_STEPS, cleanTourSteps } from './arguments/index.js';
import { SLIDER_STEPS, controlsOf, defaultsFor, cleanValue, cleanOwn, sliderPosition, sliderValue, encodeOwn, decodeOwn } from './arguments/controls.js';
import { EXPLAIN } from './explain.js';
import { initInfo, refreshInfo, infoButton, explainHtml } from './info.js';
import { HorizonView } from './views/horizonView.js';
import { FlightView } from './views/flightView.js';
import { FLIGHT_LIMITS, flightScene, schulerMinutes } from './flight.js';
import { earthUrl, buildKml, buildSightKml, parseKml, kmlText, KML_LIMITS } from './earth.js';
import { makeAir, traceView } from './raytrace.js';
import { VIEWS, viewSizes, viewById } from './presets.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const MIN_HEIGHT_KM = 100;
const MAX_HEIGHT_KM = 1e6;

const state = {
  date: new Date(),
  lat: 51.51,
  lon: -0.13,
  sunHeightKm: 5000,
  lightRangeKm: 10000,
  refraction: 'standard', // 'off', 'standard', or 'custom' (the two values below)
  tempC: STANDARD_AIR.tempC,
  pressureHpa: STANDARD_AIR.pressureHpa,
  sightLines: false,
  flatLighting: 'model',
  flatLight: 'straight', // how the flat model's light travels: 'straight', or 'bent' (curving upward, so that the sun can set)
  follow: true,
  playing: false,
  speed: 10, // simulated minutes per real second
  demo: null,
  own: {}, // the values of the controls that belong to the argument on show
  // Where the horizon tool's line of sight is on the map, when that is known:
  // { from: {name, lat, lon}, to: {name, lat, lon}, waterM }. waterM is the water's height above the sea.
  sight: null,
  tour: null, // a guided tour: null, or { id, step, shown } (which tour, which step, and whether its answer is on show)
  ownTour: [], // the steps of a tour the user put together
  picking: false, // whether the steps of that tour are being chosen
  stars: false,
  star: 'Polaris',
  starHeightKm: 5000, // flat model only: how high its layer of stars sits
  moon: false,
  moonHeightKm: 5000, // flat model only: how high its moon sits
  trails: false,
  route: null, // { from, to } as place names, or null
  // Over the horizon
  mode: 'sky', // which tool is showing: 'sky' (sun, stars and maps), 'horizon' or 'flight'
  shape: 'ship',
  targetM: 50, // height of the thing being looked at
  targetKm: 20, // how far away it is
  eyeM: 1.7,
  k: K_STANDARD, // how strongly the air bends light near the ground
  units: 'metric', // or 'imperial'; used by the horizon tool only
  sailing: false,
  // Layers of air: instead of one bending for the whole path, follow light through air described by its temperatures.
  layers: false,
  airC: 15,
  waterC: 15, // the surface under the light
  layerM: 10, // how deep the air warmed or chilled by the surface is
  lapse100: -0.65, // change of temperature for each 100 m of height above that
  // Two sunsets: the eye heights the sun is watched from, and the seconds timed between its settings.
  sunsetLowM: 0.2,
  sunsetHighM: 1.7,
  sunsetSeconds: null,
  // Level flight
  speedKmh: 900,
  altitudeM: 11000,
  flightMinutes: 10, // the stretch drawn to scale
  flying: false, // the speeded-up lap is running
};

// ---------- formatting ----------

const deg = (n, d = 1) => `${n.toFixed(d)}°`;
const km = (n) => `${Math.round(n).toLocaleString('en-US')} km`;
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];
// Rounded first, so a bearing a hair west of north reads 0.0 and not 360.0.
const bearing = (az) => {
  const a = (Math.round(az * 10) / 10) % 360;
  return `${deg(a)} ${compass(a)}`;
};
const hhmm = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const utcMinutes = (d) => d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
const isoDay = (d) => d.toISOString().slice(0, 10);
const niceHeight = (h) => (h >= 100000 ? `${(h / 1000).toFixed(0)},000 km` : km(h));
const kmh = (n) => `${Math.round(n).toLocaleString('en-US')} km/h`;
const hoursMinutes = (h) => {
  const m = Math.round(h * 60);
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
};

// The horizon tool works in metres and kilometres and can show feet and miles.
const FT = 0.3048;
const MI = 1.609344;
const imperial = () => state.units === 'imperial';
const heightNumber = (m) => (imperial() ? m / FT : m);
const distanceNumber = (k) => (imperial() ? k / MI : k);
const tidy = (v) => Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2));
const fmtH = (m) => `${tidy(heightNumber(m)).toLocaleString('en-US')} ${imperial() ? 'ft' : 'm'}`;
const fmtD = (k) => `${tidy(distanceNumber(k)).toLocaleString('en-US')} ${imperial() ? 'mi' : 'km'}`;
const fmtSpeed = (v) => (imperial() ? `${Math.round(v / MI).toLocaleString('en-US')} mph` : kmh(v));
const fmtAngle = (a) => `${a.toFixed(a >= 10 ? 1 : a >= 1 ? 2 : 3)}°`;
const fmtTime = (minutes) => (minutes < 1 ? 'under a minute' : minutes < 90 ? `${Math.round(minutes)} min` : hoursMinutes(minutes / 60));
// What can be set, in metres and kilometres.
const HZ_LIMITS = { eyeM: HORIZON_LIMITS.eyeM, targetM: HORIZON_LIMITS.targetM, targetKm: HORIZON_LIMITS.distanceKm };

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
const whenUtc = (t) =>
  new Date(t).toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC';
const where = (lat, lon) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ---------- the user's own measurements ----------

const STORE_KEY = 'globedart.measurements';
let measurements = [];

function loadStoredMeasurements() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveMeasurements() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(measurements));
  } catch {
    // Storage can be unavailable (private windows, blocked site data). The link still carries them.
  }
}

const sameMoment = (m, ms) => Math.abs(m.t - state.date.getTime()) <= ms;
const samePlace = (m) => Math.abs(m.lat - state.lat) < 0.006 && Math.abs(wrap180(m.lon - state.lon)) < 0.006;
/** True when the views are showing the time and place this measurement was taken. */
const isShown = (m) => sameMoment(m, 60000) && samePlace(m);

/**
 * The measurement to mark in the two skies: one taken at the time and place on
 * show. If there are several, the one of what is being looked at wins.
 */
function shownMeasurement(sunObs, air) {
  const shown = measurements.filter(isShown);
  const m = shown.find((x) => (state.stars ? x.star === state.star : !x.star)) ?? shown[0];
  if (!m) return null;
  const nearAz = m.star ? observedStar(state.date, state.lat, state.lon, overheadPoint(m), air).az : sunObs.az;
  return { ...m, nearAz };
}

// ---------- model evaluation ----------

const flatParams = () => ({
  sunHeightKm: state.sunHeightKm,
  lightRangeKm: state.lightRangeKm,
  starHeightKm: state.starHeightKm,
  // With bending light the sun is seen on the horizon from exactly as far as its light reaches.
  bendSetKm: state.flatLight === 'bent' ? state.lightRangeKm : 0,
});
/** How much the flat model's light curves, per km. The moon and the stars are seen by the same light as the sun. */
const flatBend = () => flatBendPerKm(flatParams());

// The air the measurement and both models are seen through: none, standard, or the user's own.
function currentAir() {
  if (state.refraction === 'off') return null;
  if (state.refraction === 'custom') return { tempC: state.tempC, pressureHpa: state.pressureHpa };
  return STANDARD_AIR;
}
const airKey = () => (state.refraction === 'custom' ? `${state.tempC}|${state.pressureHpa}` : state.refraction);

function compute() {
  const { date, lat, lon } = state;
  const air = currentAir();
  const sub = subsolarPoint(date);
  const obs = observedSun(date, lat, lon, air);
  const globe = globePredict(sub, lat, lon, air);
  const flat = flatPredict(sub, lat, lon, flatParams(), air);
  const cities = REF_CITIES.map((city) => {
    const o = observedSun(date, city.lat, city.lon, air);
    const f = flatPredict(sub, city.lat, city.lon, flatParams(), air);
    return {
      ...city,
      obs: o,
      flat: f,
      miss: skySeparation(o, f),
      implied: impliedSunHeightKm(sub, city.lat, city.lon, o.el, flatParams()),
    };
  });
  const stars = state.stars ? computeStars() : null;
  const chosen = stars?.points[stars.selected];
  const moon = state.moon ? computeMoon(sub, obs, globe, flat) : null;
  return {
    sub,
    obs,
    globe,
    flat,
    cities,
    stars,
    moon,
    // What the sight lines in the outside views point at: the moon, the chosen star, or the sun.
    sight: moon
      ? {
          name: 'the moon',
          obs: moon.obs,
          cities: moon.cities,
          flat: { lat: moon.point.lat, lon: moon.point.lon, heightKm: state.moonHeightKm },
        }
      : stars
      ? {
          name: stars.name,
          obs: stars.measured[stars.selected],
          cities: stars.cities,
          flat: { lat: chosen.lat, lon: chosen.lon, heightKm: state.starHeightKm },
        }
      : { name: 'the sun', obs, cities, flat: { lat: sub.lat, lon: sub.lon, heightKm: state.sunHeightKm } },
    route: computeRoute(),
    // The user's measurement for this moment and place, and every one of theirs
    // (from anywhere) taken within five minutes that has a bearing to draw.
    own: shownMeasurement(obs, air),
    ownLines: measurements.filter((m) => m.az !== null && sameMoment(m, 300000)),
  };
}

// ---------- the moon ----------

// The published answer to "is there an eclipse now?" takes a search, so it is kept for the minute it was asked about.
const eclipseCache = { key: null, kind: 'none' };
function eclipseNow() {
  const key = Math.floor(state.date.getTime() / 60000);
  if (eclipseCache.key !== key) Object.assign(eclipseCache, { key, kind: publishedEclipse(state.date) });
  return eclipseCache.kind;
}

// The moon is treated like the sun and the stars: both models are told the place it is overhead.
// The globe is also told its distance, which is close enough to matter.
function computeMoon(sub, sunObs, sunGlobe, sunFlat) {
  const { date, lat, lon } = state;
  const air = currentAir();
  const point = moonPoint(date);
  const dome = { sunHeightKm: state.moonHeightKm, lightRangeKm: Infinity, bendPerKm: flatBend() };
  const obs = observedMoon(date, lat, lon, air);
  const globe = globePredictNear(point, lat, lon, air);
  const flat = flatPredict(point, lat, lon, dome, air);
  // Where everything is in space, under each model, for working out what is lit and who sees which face.
  const g = { sun: globePlace(sub.lat, sub.lon, sub.distKm), moon: globePlace(point.lat, point.lon, point.distKm) };
  const f = { sun: flatPlace(sub.lat, sub.lon, state.sunHeightKm), moon: flatPlace(point.lat, point.lon, state.moonHeightKm) };
  const phase = moonPhase(date);
  const here = { globe: globePlace(lat, lon), flat: flatPlace(lat, lon) };
  return {
    point,
    obs,
    globe,
    flat,
    phase,
    lit: {
      measured: phase.fraction,
      globe: litFraction(g.sun, g.moon, here.globe),
      flat: litFraction(f.sun, f.moon, here.flat),
    },
    // Which way the lit side faces in the sky: toward the sun, wherever each puts the sun.
    side: {
      measured: brightSideDeg(obs, sunObs),
      globe: brightSideDeg(globe, sunGlobe),
      flat: brightSideDeg(flat, sunFlat),
    },
    shadow: earthShadow(sub, point),
    published: eclipseNow(),
    cities: REF_CITIES.map((place) => {
      const o = observedMoon(date, place.lat, place.lon, air);
      const fl = flatPredict(point, place.lat, place.lon, dome, air);
      return {
        ...place,
        obs: o,
        flat: fl,
        miss: skySeparation(o, fl),
        implied: impliedSunHeightKm(point, place.lat, place.lon, o.el, { bendPerKm: flatBend() }),
        litGlobe: litFraction(g.sun, g.moon, globePlace(place.lat, place.lon)),
        litFlat: litFraction(f.sun, f.moon, flatPlace(place.lat, place.lon)),
        // How far round the moon this city's view is from the observer's.
        turnGlobe: viewsApartDeg(g.moon, here.globe, globePlace(place.lat, place.lon)),
        turnFlat: viewsApartDeg(f.moon, here.flat, flatPlace(place.lat, place.lon)),
      };
    }),
  };
}

/** The reference city with the moon highest in its sky at a moment. */
function cityUnderMoon(date) {
  return REF_CITIES.reduce((best, place) =>
    observedMoon(date, place.lat, place.lon).el > observedMoon(date, best.lat, best.lon).el ? place : best,
  );
}

const percent = (fraction) => `${Math.round(fraction * 100)}%`;

function renderMoon(c) {
  const m = c.moon;
  $('moon-panel').hidden = !m;
  if (!m) return;
  const up = m.obs.el > 0;
  const height = (el) => (el > 0 ? deg(el) : `${deg(-el)} below`);
  const flatMiss = skySeparation(m.obs, m.flat);
  const globeMiss = skySeparation(m.obs, m.globe);
  const off = (a, b) => (Math.abs(a - b) > 0.05 ? 'bad' : '');
  const shadow = (kind) => (kind === 'none' ? 'no' : `yes, ${kind}`);
  $('moon-compare').tBodies[0].innerHTML = `
    <tr><td>Elevation${infoButton('moon.position', 'where the moon is')}</td><td>${height(m.obs.el)}</td><td>${height(m.globe.el)}</td>
      <td class="${Math.abs(m.flat.el - m.obs.el) > 1 ? 'bad' : ''}">${deg(m.flat.el)}</td></tr>
    <tr><td>Bearing</td><td>${bearing(m.obs.az)}</td><td>${bearing(m.globe.az)}</td>
      <td class="${Math.abs(wrap180(m.flat.az - m.obs.az)) > 1 ? 'bad' : ''}">${bearing(m.flat.az)}</td></tr>
    <tr><td>Width</td><td>${deg(m.obs.sizeDeg, 2)}</td><td>${deg(m.globe.sizeDeg, 2)}</td>
      <td class="${Math.abs(m.flat.sizeDeg - m.obs.sizeDeg) > 0.03 ? 'bad' : ''}">${deg(m.flat.sizeDeg, 2)}</td></tr>
    <tr><td>Face lit${infoButton('moon.phase', 'how much of the moon is lit')}</td><td>${percent(m.lit.measured)}</td>
      <td class="${off(m.lit.globe, m.lit.measured)}">${percent(m.lit.globe)}</td>
      <td class="${off(m.lit.flat, m.lit.measured)}">${percent(m.lit.flat)}</td></tr>
    <tr><td>In the Earth's shadow?${infoButton('moon.eclipse', 'eclipses of the moon')}</td><td>${shadow(m.published)}</td>
      <td class="${m.shadow.kind === m.published ? '' : 'bad'}">${shadow(m.shadow.kind)}</td>
      <td class="${m.published === 'none' ? '' : 'bad'}">cannot be</td></tr>
    <tr><td>Miss</td><td class="dim">n/a</td><td class="${globeMiss > 1 ? 'bad' : 'good'}">${deg(globeMiss, 2)}</td>
      <td class="${flatMiss > 1 ? 'bad' : 'good'}">${deg(flatMiss, 1)}</td></tr>`;
  const seen = m.cities.filter((x) => x.obs.el > 0);
  const lits = seen.map((x) => x.litFlat);
  $('moon-note').textContent =
    seen.length > 1
      ? `Everyone who can see the moon sees ${percent(m.lit.measured)} of its face lit. A ball lit by the flat model's sun ` +
        `would show anything from ${percent(Math.min(...lits))} to ${percent(Math.max(...lits))}, depending on where you stand.`
      : up
        ? 'The moon is up here, but in too few of the other cities to compare.'
        : 'The moon is below the horizon here.';
  $('moon-cities').tBodies[0].innerHTML = m.cities
    .map((x) => {
      const visible = x.obs.el > 0;
      return `<tr><td>${x.name}</td>
        <td class="${visible ? '' : 'dim'}">${visible ? percent(x.litGlobe) : 'not up'}</td>
        <td class="${visible && Math.abs(x.litFlat - m.lit.measured) > 0.05 ? 'bad' : visible ? '' : 'dim'}">${visible ? percent(x.litFlat) : 'n/a'}</td>
        <td class="${visible && x.turnFlat > 5 ? 'bad' : visible ? '' : 'dim'}">${visible ? deg(x.turnFlat, 0) : 'n/a'}</td></tr>`;
    })
    .join('');
}

// ---------- stars ----------

const TRAIL_STEPS = 36;
const TRAIL_STEP_MIN = 10;
const starDome = () => ({ sunHeightKm: state.starHeightKm, lightRangeKm: Infinity, bendPerKm: flatBend() });

// Every star is treated exactly like the sun: both models are told the point on
// Earth it is overhead, and each predicts where the observer should see it.
// ---------- the background stars ----------

// Every star the eye can see: the Bright Star Catalogue, read from data/ the first time the stars are shown.
// Each model is told where a star is overhead, as for the named stars, and places it in the sky from that.
let starField = null;
let starFieldLoading = null;
function loadStarField() {
  starFieldLoading ??= readStarField();
  return starFieldLoading;
}
async function readStarField() {
  try {
    const d = await (await fetch('data/bright-stars.json')).json();
    const named = STARS.map((s) => ({ ra: s.ra * 15, dec: s.dec }));
    // The named stars are drawn already, so they are left out here.
    const isNamed = (ra, dec) =>
      named.some((n) => Math.abs(n.dec - dec) < 0.05 && Math.abs(wrap180(n.ra - ra)) * Math.cos((dec * Math.PI) / 180) < 0.05);
    const stars = [];
    const byNumber = new Map();
    for (let i = 0; i < d.count; i++) {
      const star = { hr: d.hr[i], ra: d.ra[i] / 15, dec: d.dec[i], mag: d.mag[i] };
      byNumber.set(star.hr, star);
      if (!isNamed(d.ra[i], d.dec[i])) stars.push(star);
    }
    starField = { stars, byNumber, mags: stars.map((s) => s.mag), day: null, ofDate: null };
    requestUpdate();
  } catch {
    // Without the file the named stars are still there.
  }
}

/** Makes a star from the catalogue one that can be followed and measured. Returns its name, or null. */
function followable(star) {
  const name = addCatalogueStar({ hr: star.hr, raDeg: star.ra * 15, decDeg: star.dec, mag: star.mag });
  if (name) fillStarPickers();
  return name;
}

/**
 * A link or a stored measurement may name a star from the catalogue ("HR 1234").
 * Those have to be known before the link or the measurement is read, so the
 * catalogue is loaded first whenever some text mentions one.
 */
async function knowCatalogueStarsIn(...texts) {
  const names = texts.flatMap(catalogueNamesIn).filter((name) => starIndex(name) < 0);
  if (!names.length) return;
  await loadStarField();
  for (const name of names) {
    const star = starField?.byNumber.get(Number(name.slice(3)));
    if (star) followable(star);
  }
}

// What the two skies last showed, so that a click on one can be matched to a star.
let lastStars = null;

/** A click on one of the skies: follow the star or planet nearest to it, if one is near. */
function pickStar(key, dir, fov) {
  const s = lastStars;
  if (!s) return;
  const reach = Math.max(0.8, fov / 35); // how near counts, in degrees: wider when zoomed out
  const nearest = (list) => {
    let best = { i: -1, apart: Infinity };
    for (let i = 0; i < list.length; i++) {
      if (Math.abs(list[i].el - dir.el) > reach) continue;
      const apart = skySeparation(dir, list[i]);
      if (apart < best.apart) best = { i, apart };
    }
    return best;
  };
  const named = nearest(s[key]);
  const faint = s.field ? nearest(s.field[key]) : { i: -1, apart: Infinity };
  let name = null;
  // A named star or a planet wins unless a catalogue star is clearly nearer the click.
  if (named.apart <= reach && named.apart <= faint.apart + reach / 3) name = SKY_BODIES[named.i].name;
  else if (faint.apart <= reach) {
    name = followable(starField.stars[faint.i]);
    if (!name) return toast(`Up to ${MAX_CATALOGUE_STARS} stars from the catalogue can be followed at once`);
  }
  if (!name) return;
  Object.assign(state, { star: name, follow: true });
  toast(`Following ${name}`);
  requestUpdate();
}

/** Where each model puts every background star, for the time and place on show. */
function computeStarField(air, dome) {
  if (!starField) {
    loadStarField();
    return null;
  }
  const { date, lat, lon } = state;
  // A star's place among the stars drifts too slowly to matter within a day. How far the sky has turned does not.
  const day = Math.floor(date.getTime() / 86400000);
  if (starField.day !== day) {
    starField.ofDate = starPoints(date, starField.stars).map((p) => ({ ra: p.ra, dec: p.dec }));
    starField.day = day;
  }
  const turned = siderealHours(date);
  const n = starField.ofDate.length;
  const globe = new Array(n);
  const flat = new Array(n);
  for (let i = 0; i < n; i++) {
    const star = starField.ofDate[i];
    const overhead = { lat: star.dec, lon: wrap180((star.ra - turned) * 15), sizeDeg: 0 };
    globe[i] = globePredict(overhead, lat, lon, air);
    flat[i] = flatPredict(overhead, lat, lon, dome, air);
  }
  return { globe, flat, mags: starField.mags };
}

function computeStars() {
  const { date, lat, lon } = state;
  const air = currentAir();
  const dome = starDome();
  // The named stars and then the planets, which are placed in each model's sky in just the same way.
  const points = starPoints(date, SKY_BODIES);
  const selected = Math.max(0, starIndex(state.star));
  let globeTrails = null;
  let flatTrails = null;
  if (state.trails) {
    globeTrails = [];
    flatTrails = [];
    for (const point of points) {
      const g = [];
      const f = [];
      for (let k = 0; k <= TRAIL_STEPS; k++) {
        // Earlier on, the star stood over a point further east.
        const then = { ...point, lon: point.lon + k * TRAIL_STEP_MIN * SKY_TURN_DEG_PER_MIN };
        g.push(globePredict(then, lat, lon, air));
        f.push(flatPredict(then, lat, lon, dome, air));
      }
      globeTrails.push(g);
      flatTrails.push(f);
    }
  }
  const chosen = points[selected];
  return {
    points,
    mags: points.map((p, i) => p.mag ?? SKY_BODIES[i].mag), // a planet's brightness changes; a star's is in its table
    lines: STAR_LINES,
    field: computeStarField(air, dome),
    selected,
    name: SKY_BODIES[selected].name,
    measured: points.map((pt) => observedStar(date, lat, lon, pt, air)),
    globe: points.map((pt) => globePredict(pt, lat, lon, air)),
    flat: points.map((pt) => flatPredict(pt, lat, lon, dome, air)),
    globeTrails,
    flatTrails,
    cities: REF_CITIES.map((place) => {
      const o = observedStar(date, place.lat, place.lon, chosen, air);
      const f = flatPredict(chosen, place.lat, place.lon, dome, air);
      return {
        ...place,
        obs: o,
        flat: f,
        miss: skySeparation(o, f),
        implied: impliedSunHeightKm(chosen, place.lat, place.lon, o.el, { bendPerKm: flatBend() }),
      };
    }),
  };
}

// Every star from every reference city at one moment. The sky turns as a whole,
// so the result barely depends on which moment is used.
const starFitCache = { key: null };
function getStarFit() {
  const key = airKey();
  if (starFitCache.key !== key) {
    const air = currentAir();
    const points = starPoints(state.date, STARS);
    const samples = REF_CITIES.flatMap((place) =>
      points.map((pt) => ({
        lat: place.lat,
        lon: place.lon,
        sub: pt,
        obs: observedStar(state.date, place.lat, place.lon, pt, air),
      })),
    );
    Object.assign(starFitCache, {
      key,
      samples,
      globeRms: rmsMiss(samples, (pt, lat, lon) => globePredict(pt, lat, lon, air)),
      ...flatFitCurve(samples, starDome(), air, MIN_HEIGHT_KM, MAX_HEIGHT_KM, 60),
    });
  }
  return starFitCache;
}

// ---------- distances ----------

const presetRoute = (a, b) =>
  ROUTES.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;

function computeRoute() {
  if (!state.route) return null;
  const a = city(state.route.from);
  const b = city(state.route.to);
  if (!a || !b || a === b) return null;
  const preset = presetRoute(a.name, b.name);
  const hours = preset ? (preset.there + preset.back) / 2 : null;
  return { a, b, preset, ...routeStats(a, b, hours), path: greatCirclePath(a, b, 72) };
}

// One day of hourly observations from every reference city, cached per date.
const fitCache = { key: null };
function getFit() {
  const key = `${isoDay(state.date)}|${airKey()}`;
  if (fitCache.key !== key) {
    const air = currentAir();
    const day = Date.parse(`${isoDay(state.date)}T00:00:00Z`);
    const samples = [];
    for (let h = 0; h < 24; h++) {
      const t = new Date(day + h * 3600000);
      const sub = subsolarPoint(t);
      for (const city of REF_CITIES) {
        samples.push({ lat: city.lat, lon: city.lon, sub, obs: observedSun(t, city.lat, city.lon, air) });
      }
    }
    Object.assign(fitCache, {
      key,
      samples,
      globeRms: rmsMiss(samples, (s, lat, lon) => globePredict(s, lat, lon, air)),
      ...flatFitCurve(samples, flatParams(), air, MIN_HEIGHT_KM, MAX_HEIGHT_KM),
    });
  }
  return fitCache;
}

// ---------- over the horizon ----------

// Tracing is the slow part, so the last result is kept until something it depends on changes.
const traceCache = { key: '', value: null };
function tracedViews() {
  const { eyeM, targetM, targetKm, airC, waterC, layerM, lapse100 } = state;
  const key = [eyeM, targetM, targetKm, airC, waterC, layerM, lapse100].join('|');
  if (traceCache.key !== key) {
    const air = makeAir({
      tempC: airC,
      pressureHpa: STANDARD_GROUND_AIR.pressureHpa,
      lapse: lapse100 / 100,
      surfaceC: waterC,
      layerM,
    });
    const sizes = { eyeM, targetM, distanceKm: targetKm };
    traceCache.key = key;
    traceCache.value = {
      globe: traceView(air, { ...sizes, curved: true }),
      flat: traceView(air, { ...sizes, curved: false }),
    };
  }
  return traceCache.value;
}

function computeHorizon() {
  const { eyeM, targetM, targetKm, k } = state;
  const scene = {
    ...horizonScene({ eyeM, targetM, distanceKm: targetKm, k }),
    horizonLineM: horizonLineM(eyeM, targetKm, k),
    // With one bending for the whole path, a flat surface hides nothing.
    flatHiddenM: 0,
    traced: null,
    // The user's own observations of this same arrangement, if there are any.
    owns: observations.filter(obShown),
    shape: state.shape,
    name: state.shape,
    fmtH,
    fmtD,
    fmtScale: heightNumber,
  };
  if (state.layers) {
    // Light followed ray by ray through layered air replaces the single-bending figures.
    const traced = tracedViews();
    Object.assign(scene, {
      traced,
      hiddenM: traced.globe.hiddenM,
      visibleM: targetM - traced.globe.hiddenM,
      flatHiddenM: traced.flat.hiddenM,
      horizonKm: traced.globe.horizonKm ?? Infinity,
      dipDeg: ((traced.globe.dipRad ?? 0) * 180) / Math.PI,
      goneKm: null,
    });
  }
  return scene;
}

/** How far the target is sent before it stops: a little past the point where the globe hides all of it. */
function sailLimitKm() {
  const gone = horizonDistanceKm(state.eyeM, state.k) + horizonDistanceKm(state.targetM, state.k);
  return Number.isFinite(gone) ? Math.min(HZ_LIMITS.targetKm[1], gone * 1.06) : HZ_LIMITS.targetKm[1];
}

/** A distance this side of the horizon, where both models show the whole target. */
function nearKm() {
  const horizon = horizonDistanceKm(state.eyeM, state.k);
  return clamp(Number.isFinite(horizon) ? horizon * 0.5 : 2, HZ_LIMITS.targetKm[0], 5);
}

const perHundred = (lapse) => `${Math.abs(lapse * 100).toFixed(Math.abs(lapse * 100) < 10 ? 2 : 1)} °C`;

function airInWords(k) {
  if (k <= 0) return 'No bending: light travels in straight lines.';
  const lapse = lapseForCoefficient(k);
  const air = `Air that gets ${perHundred(lapse)} ${lapse < 0 ? 'colder' : 'warmer'} for every 100 m of height.`;
  if (k >= 0.995) return `${air} Light follows the curve of the sea, so nothing is ever hidden. Rare, and it does not last.`;
  if (k > 0.22) return `${air} More bending than usual: warm air lying over colder, as over cold water on a still day.`;
  if (k < 0.1) return `${air} Less bending than usual.`;
  return `${air} ${Math.abs(k - K_STANDARD) < 0.006 ? 'This is the standard atmosphere.' : 'Close to the standard atmosphere.'}`;
}

function renderHorizon(hz) {
  const layered = !!hz.traced;
  const some = hz.hiddenM > 0;
  const all = hz.hiddenM >= hz.targetM;
  const far = Number.isFinite(hz.horizonKm);
  const flatSome = hz.flatHiddenM > 0;
  const amount = (m) => (m > 0 ? fmtH(m) : 'none');
  const flatHorizon = layered && hz.traced.flat.horizonKm !== null ? fmtD(hz.traced.flat.horizonKm) : 'no limit';
  const flatDip = layered ? ((hz.traced.flat.dipRad ?? 0) * 180) / Math.PI : 0;
  $('hz-table').tBodies[0].innerHTML = `
    <tr><td>Hidden from the bottom up${infoButton('hz.hidden', 'how much is hidden')}</td><td class="${some ? 'bad' : ''}">${amount(hz.hiddenM)}</td>
      <td class="${flatSome ? 'bad' : ''}">${amount(hz.flatHiddenM)}</td></tr>
    <tr><td>In view</td><td>${all ? 'none' : fmtH(hz.visibleM)}</td><td>${amount(hz.targetM - hz.flatHiddenM)}</td></tr>
    <tr><td>Distance to the horizon${infoButton('hz.horizon', 'distance to the horizon')}</td><td>${far ? fmtD(hz.horizonKm) : layered ? 'beyond it' : 'no limit'}</td><td>${flatHorizon}</td></tr>
    <tr><td>Horizon below eye level${infoButton('hz.dip', 'horizon below eye level')}</td><td>${layered && !far ? '<span class="dim">n/a</span>' : deg(hz.dipDeg, 2)}</td>
      <td>${deg(flatDip, 2)}</td></tr>
    ${
      layered
        ? ''
        : `<tr><td>All of it is hidden beyond${infoButton('hz.gone', 'where it goes out of sight')}</td><td>${Number.isFinite(hz.goneKm) ? fmtD(hz.goneKm) : 'never'}</td><td>never</td></tr>`
    }`;
  $('hz-verdict').textContent = flatSome
    ? `In this air the flat model hides ${fmtH(hz.flatHiddenM)} too, and the globe ${amount(hz.hiddenM)}. See below for how to tell the two apart.`
    : some
      ? `The two models disagree by ${fmtH(hz.hiddenM)} here. Binoculars and a clear day are enough to tell which is right.`
      : layered
        ? 'In this air, at this distance, the two models agree: all of it is in view.'
        : far
          ? `This close, the two models agree: all of it is in view. They part company beyond ${fmtD(hz.horizonKm)}.`
          : 'In air that bends light this strongly, the two models agree at every distance: nothing is hidden.';

  const row = (label, hidden, flatHidden = 0) =>
    `<tr><td>${label}</td><td>${amount(hidden)}</td><td>${amount(flatHidden)}</td></tr>`;
  $('hz-air').tBodies[0].innerHTML =
    row('No bending', hz.hiddenNoneM) +
    row('Standard air', hz.hiddenStandardM) +
    row(layered ? 'As set (layers of air)' : `As set (k = ${hz.k.toFixed(2)})`, hz.hiddenM, hz.flatHiddenM);

  const need = hz.flat;
  let needs;
  if (layered && flatSome) {
    needs = `<p>With the surface warmer than the air, light close to it curves upward, and the flat model does hide
        the bottom <b class="f">${fmtH(hz.flatHiddenM)}</b>. Three things give that kind of hiding away.</p>
      <p>It grows in step with distance, where the globe's grows faster and faster. It comes with a mirage: an
        upside-down copy, or a shimmering strip, under what is left of the image. And it goes when the water is
        cooler than the air, which is exactly when the globe's hiding is plainest.</p>
      <p class="hint">Cool the water, or raise your eye, and compare the two columns again.</p>`;
  } else if (layered) {
    needs = some
      ? `<p>In this air the flat model hides nothing and the globe hides the bottom <b class="g">${fmtH(hz.hiddenM)}</b>.
          The only air that hides anything on a flat surface is air heated from below. Make the water warmer than
          the air to see how much it can do, and what it looks like.</p>`
      : `<p>Nothing, in this air and at this distance: neither model hides any of it.</p>`;
  } else if (some) {
    needs = `<p>For the flat model to hide the bottom <b class="f">${fmtH(hz.hiddenM)}</b>, light would have to curve
        <em>upward</em>, away from the water, along the whole ${fmtD(hz.distanceKm)}. Ordinary air bends it the other
        way.</p>
      <p>That takes air that gets <b class="f">${perHundred(need.lapse)} colder for every 100 m</b> of height. The
        standard atmosphere cools by ${perHundred(STANDARD_GROUND_AIR.lapse)} per 100 m. Air that cools faster than
        ${perHundred(OVERTURNING_LAPSE)} per 100 m is heavier above than below, and turns over.</p>
      <p class="hint">Gradients that steep exist only in a thin layer just above a surface warmer than the air, never
        through the whole depth the light crosses. Such a layer can hide the foot of distant things on either
        model, and gives itself away with a mirage. Tick "Follow light through layers of air" and warm the water
        to see it.</p>`;
  } else {
    needs = far
      ? `<p>Nothing, at this distance: neither model hides any of it. Send it further away.</p>`
      : `<p>Nothing: in this air neither model hides anything.</p>`;
  }
  $('hz-flat-needs').innerHTML = needs;
}

// ---------- two sunsets ----------

const seconds = (s) => (s < 90 ? `${s.toFixed(s < 20 ? 1 : 0)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

function renderSunsets(hz) {
  const { sunsetLowM: low, sunsetHighM: high, lat } = state;
  const sunLat = subsolarPoint(state.date).lat;
  const rate = sunSinkDegPerHour(lat, sunLat);
  const wait = secondSunsetSeconds(low, high, lat, sunLat, hz.k);
  $('ss-table').tBodies[0].innerHTML = `
    <tr><td>Horizon below level, low eye</td><td>${deg(dipDeg(low, hz.k), 3)}</td><td>${deg(0, 3)}</td></tr>
    <tr><td>Horizon below level, high eye</td><td>${deg(dipDeg(high, hz.k), 3)}</td><td>${deg(0, 3)}</td></tr>
    <tr><td>The sun sinks each minute</td><td>${rate === null ? 'it does not set' : deg(rate / 60, 2)}</td><td class="dim">n/a</td></tr>
    <tr><td>Second sunset comes after</td><td>${wait === null ? 'n/a' : seconds(Math.max(0, wait))}</td><td class="bad">never</td></tr>`;
  const timed = state.sunsetSeconds;
  const radius = timed === null ? null : radiusFromTwoSunsetsKm(low, high, timed, lat, sunLat, hz.k);
  $('ss-result').textContent =
    rate === null
      ? `On ${isoDay(state.date)} the sun does not set at this latitude.`
      : radius === null
        ? `Sun's path for ${isoDay(state.date)}. Enter your timing to work out the size of the Earth from it.`
        : `Your timing gives an Earth ${km(radius)} in radius. The accepted figure is ${km(6371)}. ` +
          `A timing one second longer would give ${km(radiusFromTwoSunsetsKm(low, high, timed + 1, lat, sunLat, hz.k))}.`;
}

// ---------- level flight ----------

// How far round its speeded-up lap the aircraft is, 0 to 1.
let flightPhase = 0;
const LAP_SECONDS = 24;

function computeFlight() {
  return {
    ...flightScene({ speedKmh: state.speedKmh, altitudeM: state.altitudeM, minutes: state.flightMinutes }),
    phase: flightPhase,
    fmtH,
    fmtD,
    fmtTime,
    fmtAngle,
    fmtSpeed,
  };
}

function renderFlight(fl) {
  $('fl-table').tBodies[0].innerHTML = `
    <tr><td>Nose comes down each minute${infoButton('fl.rate', 'how fast the nose comes down')}</td><td>${fmtAngle(fl.rateDegPerMin)}</td><td>0°</td></tr>
    <tr><td>Each hour</td><td>${fmtAngle(fl.rateDegPerMin * 60)}</td><td>0°</td></tr>
    <tr><td>Over ${fmtTime(fl.minutes)}</td><td>${fmtAngle(fl.turnDeg)}</td><td>0°</td></tr>
    <tr><td>The artificial horizon reads${infoButton('fl.instruments', 'what the instruments show')}</td><td>level</td><td>level</td></tr>
    <tr><td>A gyro left free drifts each hour</td><td>${fmtAngle(fl.rateDegPerMin * 60)}</td><td>0°</td></tr>
    <tr><td>Once right round takes${infoButton('fl.round', 'once round')}</td><td>${fmtTime(fl.hoursRound * 60)}</td><td class="dim">no way round</td></tr>
    <tr><td>Flying dead straight for ${fmtTime(fl.minutes)} gains${infoButton('fl.climb', 'flying dead straight')}</td><td>${fmtH(fl.climbM)}</td><td>nothing</td></tr>`;
  $('fl-verdict').textContent = 'Either way the pilot pushes nothing and feels nothing, so this cannot tell the two models apart.';
  $('fl-notice').innerHTML = `
    <p>An airliner's inertial navigation unit senses turning against the stars, not against the ground. Carried
    round a globe at ${fmtSpeed(fl.speedKmh)} it has to allow for <b class="g">${fmtAngle(fl.rateDegPerMin * 60)} an
    hour</b> of turning, worked out from the Earth's radius. Without that its idea of "down" would drift and its
    position with it.</p>
    <p>The same units are tuned to swing with a period of <b class="g">${schulerMinutes().toFixed(1)} minutes</b>,
    the period of a pendulum as long as the Earth's radius. On a flat earth there is no such length, and no reason
    for either setting.</p>
    <p class="hint">Look up "transport rate" and "Schuler tuning" in any text on inertial navigation.</p>`;
}

// ---------- the user's own horizon observations ----------

const OBS_KEY = 'globedart.horizon';
let observations = [];

function loadStoredObservations() {
  try {
    const stored = JSON.parse(localStorage.getItem(OBS_KEY) ?? '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveObservations() {
  try {
    localStorage.setItem(OBS_KEY, JSON.stringify(observations));
  } catch {
    // Storage can be unavailable. The link still carries them.
  }
}

const sameSize = (a, b) => Math.abs(a - b) <= 0.005 * Math.max(a, b);
/** True when the drawings show the sizes this observation was made with. */
function obShown(o) {
  return sameSize(o.eyeM, state.eyeM) && sameSize(o.distanceKm, state.targetKm) && sameSize(o.targetM, state.targetM);
}

const gradient = (lapse) =>
  Math.abs(lapse * 100) < 0.005
    ? 'no colder or warmer for every 100 m of height'
    : `${perHundred(lapse)} ${lapse < 0 ? 'colder' : 'warmer'} for every 100 m of height`;

/** What each model makes of one observation, in words. */
function observationWords(o, s) {
  const checkSizes = ' Otherwise, check the distance and the heights.';
  const w = s.waterMinusAir;
  const waterNote = (helps) =>
    w === null || Math.abs(w) < 1
      ? ''
      : helps(w)
        ? ` Your water was ${Math.abs(w).toFixed(1)} °C ${w < 0 ? 'colder' : 'warmer'} than the air, which is the weather that does this.`
        : ` But your water was ${Math.abs(w).toFixed(1)} °C ${w < 0 ? 'colder' : 'warmer'} than the air, which bends light the other way.`;
  const kText = `k = ${s.k.toFixed(2)}`;
  let globe;
  let globeFits = true;
  if (s.air === 'either') {
    globe = `At this distance the globe hides nothing either, even with light travelling dead straight. Both models
      fit, so this one cannot tell them apart. Try something further away, or get lower.`;
  } else if (s.air === 'cooling' && s.bound === 'exact') {
    globe = `Fits the globe in ordinary air: it needs air that gets ${gradient(s.lapse)} (${kText}). The standard
      atmosphere gets ${perHundred(STANDARD_GROUND_AIR.lapse)} colder.`;
  } else if (s.air === 'cooling' && s.bound === 'atLeast') {
    globe = `Fits the globe in ordinary air: all of it shows as long as the air gets no more than
      ${perHundred(s.lapse)} colder for every 100 m of height. The standard atmosphere gets
      ${perHundred(STANDARD_GROUND_AIR.lapse)} colder.`;
  } else if (s.air === 'cooling') {
    // None of it was seen, and some ordinary air hides all of it.
    if (s.k >= K_STANDARD) {
      globe = `Fits the globe: all of it is hidden in standard air, and in any air that bends light less than ${kText}.`;
    } else {
      globeFits = false;
      globe = `Fits the globe only if the air bent light less than usual (below ${kText}). In standard air the top
        ${fmtH(o.targetM - s.globe.standardM)} would show.`;
    }
  } else if (s.air === 'inversion') {
    globeFits = false;
    globe = `Fits the globe if the air was warmer higher up than at the water: ${gradient(s.lapse)}${
      s.bound === 'atLeast' ? ' or more' : ''
    } (${kText}). That is an inversion, common over cold water and on still nights.${
      s.lapse > 0.05 ? ' One this strong is unusual, and tends to come with stretched or stacked images.' : ''
    }${waterNote((d) => d < 0)}`;
  } else {
    globeFits = false;
    globe = `${
      s.bound === 'atMost'
        ? `With light travelling dead straight, the globe says the top ${fmtH(o.targetM - s.globe.straightM)} should show.`
        : `More was hidden than the globe gives with light travelling dead straight (${fmtH(s.globe.straightM)}).`
    } It fits only if light was bent upward, which takes air that gets ${gradient(s.lapse)} just above the surface,
      as over water warmer than the air.${waterNote((d) => d > 0)}${checkSizes}`;
  }
  const flat = s.flat.fits
    ? s.air === 'either'
      ? 'Fits the flat model too.'
      : 'Fits the flat model, which says all of it shows at any distance.'
    : `Does not fit the flat model, which has nothing to hide the bottom ${fmtH(s.hiddenM)}. It would take air that
      gets ${gradient(s.flat.lapse)} all the way along, and air that cools faster than
      ${perHundred(OVERTURNING_LAPSE)} per 100 m turns over.`;
  return { globe, flat, globeFits };
}

// Rebuilt only when its content changes, so the buttons in it stay clickable while the target moves.
let obsHtml = null;
function renderObservations() {
  $('ob-sizes').textContent =
    `It will be recorded with the sizes set now: ${fmtH(state.targetM)} tall, ${fmtD(state.targetKm)} away, your eye ` +
    `${fmtH(state.eyeM)} up. Change them first if yours were different.`;
  const kind = $('ob-kind').value;
  $('ob-amount-row').hidden = kind === 'all' || kind === 'none';
  $('ob-amount-label').textContent = kind === 'visible' ? 'How much of the top showed' : 'How much was hidden';

  const html = observations
    .map((o, i) => {
      const s = scoreObservation(o);
      const words = observationWords(o, s);
      const saw = s.hiddenM <= 0 ? 'none' : s.hiddenM >= o.targetM ? 'all of it' : fmtH(s.hiddenM);
      const temps = [o.airC === null ? '' : `air ${o.airC} °C`, o.waterC === null ? '' : `water ${o.waterC} °C`]
        .filter(Boolean)
        .join(', ');
      const canSet = s.bound !== 'atMost' && s.k >= 0 && s.k <= 1;
      return `<div class="own-card ${obShown(o) ? 'shown' : ''}" data-i="${i}">
        <div class="own-head">
          <div>${o.label ? `<b>${esc(o.label)}</b>` : ''}
            <small>${fmtH(o.targetM)} tall, ${fmtD(o.distanceKm)} away, eye ${fmtH(o.eyeM)} up</small>
            ${temps ? `<small>${temps}</small>` : ''}</div>
          <span class="own-actions">
            <button data-act="show" title="Show these sizes in the drawings">Show</button>
            <button data-act="remove" title="Remove this observation" aria-label="Remove this observation">×</button>
          </span>
        </div>
        <table class="data">
          <thead><tr><th></th><th class="own">You</th><th class="globe">Globe</th><th class="flat">Flat</th></tr></thead>
          <tbody>
            <tr><td>Hidden</td><td>${saw}</td><td>${s.globe.standardM > 0 ? fmtH(s.globe.standardM) : 'none'}</td><td>none</td></tr>
            <tr><td>Off by</td><td class="dim"></td>
              <td class="${words.globeFits ? 'good' : ''}">${fmtH(s.globe.missM)}</td>
              <td class="${s.flat.fits ? 'good' : 'bad'}">${fmtH(s.flat.missM)}</td></tr>
          </tbody>
        </table>
        <p class="hint">The globe column is for standard air.</p>
        <p class="verdict"><b class="g">Globe.</b> ${words.globe}</p>
        <p class="verdict"><b class="f">Flat.</b> ${words.flat}</p>
        ${canSet ? '<button data-act="air">Set the air the globe needs for this</button>' : ''}
      </div>`;
    })
    .join('');
  if (html === obsHtml) return;
  obsHtml = html;
  $('ob-list').innerHTML = html;
}

/** The view on show, as a file Google Earth can open. */
function currentKml() {
  const c = compute();
  const when = whenUtc(state.date.getTime());
  const overhead = [
    { name: 'Sun overhead', description: `The sun was directly overhead here at ${when}.`, lat: c.sub.lat, lon: c.sub.lon },
  ];
  if (c.stars) {
    const p = c.stars.points[c.stars.selected];
    overhead.push({ name: `${c.stars.name} overhead`, description: `${c.stars.name} was directly overhead here at ${when}.`, lat: p.lat, lon: p.lon });
  }
  const r = c.route;
  return buildKml({
    title: `GlobeDart: ${when}`,
    observer: { lat: state.lat, lon: state.lon },
    overhead,
    route: r && {
      name: `${r.a.name} to ${r.b.name}`,
      description: `The shortest route on a globe, ${km(r.globeKm)}. A straight line on the flat map would be ${km(r.flatKm)}.`,
      from: r.a,
      to: r.b,
      path: r.path,
      lengthKm: r.globeKm,
    },
  });
}

// ---------- the line of sight on the map ----------

/** The sight line belongs to the scene only while the distance on show is still the distance between its two ends. */
const sightShown = () => !!state.sight && sameSize(globeDistanceKm(state.sight.from, state.sight.to), state.targetKm);

/** Puts the horizon tool's line of sight between two places, if they are a distance apart that the tool can show. */
function setSight(from, to, waterM = 0) {
  const d = globeDistanceKm(from, to);
  const [least, most] = HZ_LIMITS.targetKm;
  if (!(d >= least && d <= most)) {
    toast(`Those places are ${fmtD(d)} apart. This tool shows from ${fmtD(least)} to ${fmtD(most)}.`);
    return false;
  }
  state.sight = { from: { name: from.name, lat: from.lat, lon: from.lon }, to: { name: to.name, lat: to.lat, lon: to.lon }, waterM };
  Object.assign(state, { targetKm: d, sailing: false });
  return true;
}

/** The line of sight as a KML file: both ends, the ground under it, and the line itself with and without air. */
function sightKml() {
  const { from, to, waterM } = state.sight;
  const steps = 64;
  const d = state.targetKm;
  const sizes = { eyeM: state.eyeM, targetM: state.targetM, distanceKm: d };
  const track = greatCirclePath(from, to, steps);
  const line = (k) => track.map((p, i) => ({ ...p, altM: waterM + sightLineHeightM((d * i) / steps, sizes, k) }));
  const hidden = (k) => {
    const m = hiddenHeightM(state.eyeM, d, k);
    return m <= 0 ? 'On a globe nothing is hidden.' : m >= state.targetM ? 'On a globe the whole target is hidden.' : `On a globe the bottom ${fmtH(m)} is hidden.`;
  };
  const below = 'Where the line goes under the surface, the water is in the way.';
  const lines = [
    {
      name: `Line of sight to the top, with the air bending light (k = ${state.k.toFixed(2)})`,
      description: `${hidden(state.k)} ${below}`,
      colour: 'ffffb16f',
      path: line(state.k),
    },
  ];
  if (state.k > 0.005) {
    lines.push({ name: 'A dead straight line to the top, as with no air', description: `${hidden(0)} ${below}`, colour: 'ffffffff', path: line(0) });
  }
  return buildSightKml({
    title: `GlobeDart: ${from.name} to ${to.name}`,
    from: { ...from, altM: waterM + state.eyeM, description: `The eye, ${fmtH(state.eyeM)} above the water.` },
    to: { ...to, altM: waterM + state.targetM, description: `The top of the target, ${fmtH(state.targetM)} above the water and ${fmtD(d)} away.` },
    track,
    lines,
  });
}

// ---------- Google Earth: files out and in ----------

function saveFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/vnd.google-earth.kml+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Saved ${name}`);
}

// What the last KML file loaded held, and which of its places have been picked as the ends of a sight line.
const KML_SHOWN = 30;
let kmlData = null;
let kmlEnds = { from: null, to: null };

function renderKml() {
  const section = $('kml-section');
  section.hidden = !kmlData;
  if (!kmlData) return;
  const { points, lines, fileName } = kmlData;
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  $('kml-summary').textContent =
    `${fileName}: ${count(points.length, 'place', 'places')} and ${count(lines.length, 'path', 'paths')}.` +
    (points.length > KML_SHOWN ? ` The first ${KML_SHOWN} places are listed.` : '') +
    ' "Observer" moves the observer there. Pick a "From" and a "To" to put a line of sight between two places.';
  const on = (end, i) => (kmlEnds[end] === i ? ' class="active"' : '');
  $('kml-list').innerHTML =
    points
      .slice(0, KML_SHOWN)
      .map(
        (p, i) => `<div class="kml-item" data-point="${i}">
          <div><b>${esc(p.name)}</b><small>${where(p.lat, p.lon)}</small></div>
          <span class="own-actions">
            <button data-act="observer">Observer</button>
            <button data-act="from"${on('from', i)}>From</button>
            <button data-act="to"${on('to', i)}>To</button>
          </span>
        </div>`,
      )
      .join('') +
    lines
      .map((l, i) => {
        const [a, b] = [l.path[0], l.path[l.path.length - 1]];
        return `<div class="kml-item" data-line="${i}">
          <div><b>${esc(l.name)}</b><small>a path of ${l.path.length} points, ${fmtD(globeDistanceKm(a, b))} end to end</small></div>
          <span class="own-actions"><button data-act="line">Sight along it</button></span>
        </div>`;
      })
      .join('');
}

/** Puts a line of sight between two places and shows it in the horizon tool. */
function sightBetween(from, to) {
  if (!setSight(from, to)) return;
  if (state.demo) state.demo = null;
  setMode('horizon');
  toast(`Line of sight: ${from.name} to ${to.name}, ${fmtD(state.targetKm)}`);
  requestUpdate();
}

function bindEarthControls() {
  $('earth-kml').addEventListener('click', () => saveFile('globedart.kml', currentKml()));
  $('hz-sight-kml').addEventListener('click', () => state.sight && saveFile('globedart-sight-line.kml', sightKml()));
  $('hz-sight-water').addEventListener('change', (e) => {
    const m = Number(e.target.value);
    if (state.sight && e.target.value.trim() !== '' && Number.isFinite(m)) state.sight.waterM = clamp(m, -500, 6000);
    requestUpdate();
  });

  for (const id of ['earth-load', 'hz-load-kml']) $(id).addEventListener('click', () => $('kml-file').click());
  $('kml-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so that the same file can be chosen again
    if (!file) return;
    if (file.size > KML_LIMITS.bytes) return toast('That file is too large to read here');
    let text;
    try {
      // A KMZ is a zipped KML, and is unzipped here in the browser.
      text = await kmlText(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      return toast(err.message);
    }
    const found = parseKml(text);
    if (found.problem) return toast(found.problem);
    kmlData = { ...found, fileName: file.name };
    kmlEnds = { from: null, to: null };
    renderKml();
    $('kml-section').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return toast(`Read ${file.name}`);
  });
  $('kml-clear').addEventListener('click', () => {
    kmlData = null;
    renderKml();
  });
  $('kml-list').addEventListener('click', (e) => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    const item = e.target.closest('.kml-item');
    if (!act || !item || !kmlData) return;
    if (act === 'line') {
      const path = kmlData.lines[Number(item.dataset.line)].path;
      const name = kmlData.lines[Number(item.dataset.line)].name;
      return sightBetween({ ...path[0], name: `the start of ${name}` }, { ...path[path.length - 1], name: `the end of ${name}` });
    }
    const i = Number(item.dataset.point);
    const place = kmlData.points[i];
    if (act === 'observer') {
      state.follow = true;
      setObserver(place, true);
      return toast(`Observer moved to ${place.name}`);
    }
    kmlEnds[act] = i;
    if (kmlEnds.from !== null && kmlEnds.to !== null && kmlEnds.from !== kmlEnds.to) {
      sightBetween(kmlData.points[kmlEnds.from], kmlData.points[kmlEnds.to]);
    }
    return renderKml();
  });
}

function bindViewControls() {
  $('hz-view-row').hidden = VIEWS.length === 0;
  $('hz-view').innerHTML = '<option value="">Choose one</option>' + VIEWS.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  $('hz-view').addEventListener('change', (e) => {
    const view = viewById(e.target.value);
    if (!view) return;
    const s = viewSizes(view);
    Object.assign(state, {
      shape: view.shape,
      targetM: clamp(s.targetM, ...HZ_LIMITS.targetM),
      targetKm: clamp(s.distanceKm, ...HZ_LIMITS.targetKm),
      eyeM: clamp(s.eyeM, ...HZ_LIMITS.eyeM),
      k: K_STANDARD,
      layers: false,
      sailing: false,
    });
    state.sight = {
      from: { name: view.from.name, lat: view.from.lat, lon: view.from.lon },
      to: { name: view.to.name, lat: view.to.lat, lon: view.to.lon },
      waterM: view.waterM,
    };
    if (state.demo && DEMOS[state.demo].tool === 'horizon') state.demo = null;
    requestUpdate();
  });
}

function bindSunsetControls() {
  $('ss-preset').addEventListener('change', (e) => {
    const [low, high] = e.target.value.split(',').map(Number);
    // A timing belongs to the heights it was made from, so it goes when they change.
    if (e.target.value) Object.assign(state, { sunsetLowM: low, sunsetHighM: high, sunsetSeconds: null });
    requestUpdate();
  });
  const feet = () => (imperial() ? FT : 1);
  // The two heights must stay in order, the lower one below the higher.
  $('ss-low').addEventListener('change', (e) => {
    const v = Number(e.target.value) * feet();
    if (e.target.value.trim() !== '' && v >= 0) Object.assign(state, { sunsetLowM: clamp(v, 0, state.sunsetHighM * 0.99), sunsetSeconds: null });
    e.target.value = tidy(heightNumber(state.sunsetLowM));
    requestUpdate();
  });
  $('ss-high').addEventListener('change', (e) => {
    const v = Number(e.target.value) * feet();
    if (e.target.value.trim() !== '' && v > 0) Object.assign(state, { sunsetHighM: clamp(v, state.sunsetLowM * 1.01 + 0.01, HZ_LIMITS.eyeM[1]), sunsetSeconds: null });
    e.target.value = tidy(heightNumber(state.sunsetHighM));
    requestUpdate();
  });
  $('ss-lat').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (e.target.value.trim() !== '' && Number.isFinite(v)) state.lat = clamp(v, -89.9, 89.9);
    e.target.value = state.lat.toFixed(1);
    requestUpdate();
  });
  $('ss-seconds').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    state.sunsetSeconds = e.target.value.trim() !== '' && v > 0 ? v : null;
    requestUpdate();
  });
}

function bindFlightControls() {
  for (const [id, key, limits] of [
    ['fl-speed', 'speedKmh', FLIGHT_LIMITS.speedKmh],
    ['fl-alt', 'altitudeM', FLIGHT_LIMITS.altitudeM],
    ['fl-minutes', 'flightMinutes', FLIGHT_LIMITS.minutes],
  ]) {
    $(id).addEventListener('input', (e) => {
      state[key] = clamp(Number(e.target.value), ...limits);
      requestUpdate();
    });
  }
  $('fl-units').addEventListener('change', (e) => {
    state.units = e.target.value === 'imperial' ? 'imperial' : 'metric';
    requestUpdate();
  });
  $('fl-fly').addEventListener('click', () => {
    state.flying = !state.flying;
    requestUpdate();
  });
  $('fl-airliner').addEventListener('click', () => {
    Object.assign(state, { speedKmh: 900, altitudeM: 11000 });
    requestUpdate();
  });
}

function bindObservationForm() {
  $('ob-kind').addEventListener('change', requestUpdate);
  const filled = (id) => $(id).value.trim() !== '';
  $('ob-add').addEventListener('click', () => {
    const kind = $('ob-kind').value;
    let hiddenM = kind === 'all' ? 0 : state.targetM;
    if (kind === 'hidden' || kind === 'visible') {
      const amount = Number($('ob-amount').value) * (imperial() ? FT : 1);
      if (!filled('ob-amount') || !Number.isFinite(amount) || amount <= 0 || amount > state.targetM * 1.001) {
        return toast(`Enter an amount between 0 and ${fmtH(state.targetM)}`);
      }
      hiddenM = kind === 'hidden' ? amount : state.targetM - amount;
    }
    if (observations.length >= MAX_OBSERVATIONS) return toast(`Up to ${MAX_OBSERVATIONS} observations can be kept`);
    const o = cleanObservation({
      eyeM: state.eyeM,
      distanceKm: state.targetKm,
      targetM: state.targetM,
      hiddenM,
      airC: $('ob-air').value,
      waterC: $('ob-water').value,
      label: $('ob-label').value,
    });
    if (!o) return toast('That observation could not be read');
    const before = observations.length;
    observations = mergeObservations(observations, [o]);
    if (observations.length === before) return toast('That observation is already in the list');
    saveObservations();
    state.sailing = false;
    for (const id of ['ob-amount', 'ob-air', 'ob-water', 'ob-label']) $(id).value = '';
    toast('Observation added');
    return requestUpdate();
  });

  $('ob-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    const o = observations[Number(btn?.closest('.own-card')?.dataset.i)];
    if (!o) return;
    if (btn.dataset.act === 'remove') {
      observations = observations.filter((x) => x !== o);
      saveObservations();
      toast('Observation removed');
    } else {
      // Both other buttons put the observation's sizes into the drawings.
      Object.assign(state, { eyeM: o.eyeM, targetKm: o.distanceKm, targetM: o.targetM, sailing: false });
      if (btn.dataset.act === 'air') state.k = clamp(scoreObservation(o).k, 0, 1);
    }
    requestUpdate();
  });
}

// ---------- demonstrations ----------

const city = (name) => CITIES.find((c) => c.name === name);

// What every demonstration starts from. `pair` is which pair of views a phone shows.
const SUN_DEMO = { follow: true, sightLines: false, flatLighting: 'model', stars: false, trails: false, moon: false };
const STAR_DEMO = { follow: true, sightLines: true, flatLighting: 'model', stars: true, trails: true, moon: false };
const MOON_DEMO = { follow: true, sightLines: false, flatLighting: 'model', stars: false, trails: false, moon: true };

/** The middle of the night at the observer, so the real sky is dark. */
function goToMidnight() {
  const noon = sunEvents(state.date, state.lat, state.lon).noon ?? state.date;
  state.date = new Date(noon.getTime() + 12 * 3600000);
}

const MOON_OFF = '<p>Turn on "Show the moon" in the panel on the left to carry on with this demonstration.</p>';
const STARS_OFF = '<p>Turn on "Show the stars" in the panel on the left to carry on with this demonstration.</p>';

// The arguments themselves live in js/arguments/, one file each. This is what they are handed.
const DEMOS = ARGUMENT_BY_ID;
const app = {
  state,
  city,
  setObserver,
  sunEvents,
  seasons,
  goToMidnight,
  focusRoute,
  nearKm,
  isoDay,
  deg,
  km,
  kmh,
  bearing,
  hoursMinutes,
  esc,
  fmtH,
  fmtD,
  fmtSpeed,
  fmtAngle,
  fmtTime,
  REF_CITIES,
  SOUND_KMH,
  SUN_DEMO,
  STAR_DEMO,
  MOON_DEMO,
  STARS_OFF,
  MOON_OFF,
  percent,
  nextFullMoon,
  nextLunarEclipse,
  cityUnderMoon,
};

const INTRO = {
  title: 'How to use this',
  body: () => `
    <p>The left side is the globe model, the right side is the flat model. Both are shown the same moment and the
    same observer. Top row: the view from outside. Bottom row: what the observer should see in the sky.</p>
    <p>The <b class="m">teal ring</b> marks where the sun is actually measured to be. A model is right when its sun
    sits inside the ring.</p>
    <p class="try">Take a tour, pick a demonstration above, or change the time, the place and the flat-model
    settings yourself. Drag any view to look around; scroll or pinch to zoom.</p>`,
};

const HORIZON_INTRO = {
  title: 'Over the horizon',
  body: (hz) => `
    <p>Something ${fmtH(hz.targetM)} tall, ${fmtD(hz.distanceKm)} away, seen by an eye ${fmtH(hz.eyeM)} above the
    water. Top row: the scene from the side. Bottom row: what you would see through a telescope.</p>
    <p>The globe says the sea hides it from the bottom up. The flat model says nothing can hide it, however far
    it goes.</p>
    <p class="try">Press "Send it away", or drag the distance and the height of your eye. Then change the air and
    see how much difference the weather can make.</p>`,
};

const FLIGHT_INTRO = {
  title: 'Level flight',
  body: (fl) => `
    <p>An aircraft at ${fmtSpeed(fl.speedKmh)}, holding its height. Top row: one whole lap, speeded up. Bottom row:
    the next ${fmtTime(fl.minutes)} of flight, drawn to true scale.</p>
    <p>On the globe the nose comes down by ${fmtAngle(fl.rateDegPerMin)} a minute as the aircraft follows the
    ground round. On the flat model it never moves.</p>
    <p class="try">Press "Fly the lap", then change the speed and the length of the stretch.</p>`,
};

// ---------- showing the working ----------

// What the tool on show last worked out. The info boxes read their numbers from it.
let workings = null;

function showWorkings(data) {
  workings = data;
  refreshInfo();
  const list = $('all-maths');
  if (!list.open) return;
  const html = Object.entries(EXPLAIN)
    .filter(([, entry]) => entry.maths && entry.tool === state.mode)
    .map(([key, entry]) => `<h3>${esc(entry.title)}</h3>${explainHtml(key, data, app)}`)
    .join('');
  const body = $('all-maths-body');
  if (body.innerHTML !== html) body.innerHTML = html;
}

// ---------- the guided tour ----------

const TOUR_END = {
  title: 'What to go and check',
  body: () => `
    <p>None of that has to be taken on trust. Every step was something anyone can go and look at:</p>
    <ol class="tour-list">${tourSteps().map((id) => `<li><b>${esc(DEMOS[id].label)}.</b> ${esc(DEMOS[id].check)}</li>`).join('')}</ol>
    <p class="try">The demonstrations along the top answer more claims, and "Take a tour" has other tours. "Your
    own measurements" checks both models against numbers of your own.</p>`,
};

const TOUR_PICK = {
  title: 'Choose your own tour',
  body: () => {
    const chosen = new Set(state.ownTour);
    const full = chosen.size >= MAX_TOUR_STEPS;
    const groups = GROUPS.map((g) => {
      const boxes = ARGUMENTS.filter((a) => a.group === g.id).map(
        (a) =>
          `<label title="${esc(a.claim)}"><input type="checkbox" data-pick="${a.id}"${chosen.has(a.id) ? ' checked' : ''}${
            full && !chosen.has(a.id) ? ' disabled' : ''
          } /> ${esc(a.label)}</label>`,
      );
      return `<fieldset class="pick-group"><legend>${esc(g.label)}</legend>${boxes.join('')}</fieldset>`;
    }).join('');
    const ready = chosen.size >= MIN_TOUR_STEPS;
    return `
    <p>Tick the arguments to walk through, up to ${MAX_TOUR_STEPS}. They are shown in the order they are listed
    here. Once the tour is running, "Copy link to this view" gives a link that carries your choice.</p>
    ${groups}
    <div class="buttons two">
      <button data-pick-cancel>Cancel</button>
      <button class="primary" data-pick-start${ready ? '' : ' disabled'}>${ready ? `Start with ${chosen.size} steps` : `Tick at least ${MIN_TOUR_STEPS}`}</button>
    </div>`;
  },
};

/** The tour that is running: its name and its steps. */
function tourOf(tour = state.tour) {
  if (!tour) return null;
  if (tour.id === OWN_TOUR) return { id: OWN_TOUR, label: 'Your tour', steps: state.ownTour };
  return TOURS.find((t) => t.id === tour.id) ?? TOURS[0];
}
const tourSteps = () => tourOf()?.steps ?? [];

// Which group of demonstrations the bar is listing. "Take a tour" lists the tours in the same place.
const TOURS_GROUP = 'tours';
let demoGroup = GROUPS[0].id;
let shownGroup = null; // the group the bar last scrolled to

/** Puts an argument on show: its scene, its tool, and the pair of views a phone starts with. */
function showArgument(id) {
  demoGroup = DEMOS[id].group;
  Object.assign(state, { demo: id, playing: false, sailing: false, flying: false, picking: false });
  state.own = defaultsFor(DEMOS[id]);
  DEMOS[id].apply(app, state.own);
  setMode(DEMOS[id].tool);
  setPair(DEMOS[id].pair);
  requestUpdate();
}

/** Moves the tour to a step. The step opens on its question; the views are left as they were until it is answered. */
function tourGo(step, id = state.tour?.id ?? TOURS[0].id) {
  state.tour = { id, step: 0, shown: false };
  state.tour.step = clamp(step, 0, tourSteps().length);
  Object.assign(state, { demo: null, playing: false, sailing: false, flying: false, picking: false });
  requestUpdate();
}

function tourShow() {
  const id = state.tour && tourSteps()[state.tour.step];
  if (!id) return;
  state.tour.shown = true;
  showArgument(id);
}

function tourLeave() {
  state.tour = null;
  state.picking = false;
  requestUpdate();
}

/** Opens the list of arguments to tick for a tour of one's own. */
function tourPick() {
  Object.assign(state, { tour: null, demo: null, picking: true, playing: false, sailing: false, flying: false });
  requestUpdate();
}

// A short link names a demonstration or a tour and nothing else, so its scene still has to be set.
let bareLink = null;
function applyBareLink() {
  if (!bareLink) return;
  const { demo, own, tourShown } = bareLink;
  bareLink = null;
  if (tourShown) tourShow();
  else if (demo) showArgument(demo);
  // Opening the argument put its controls back to the start. The link may say otherwise.
  if (state.demo) state.own = decodeOwn(DEMOS[state.demo], own);
}

// The explanation is only rewritten when it changes, so that what is in it can be clicked and selected.
let demoBodyHtml = null;
function setDemoBody(html) {
  if (html === demoBodyHtml) return;
  demoBodyHtml = html;
  const body = $('demo-body');
  const ticked = body.contains(document.activeElement) ? document.activeElement.dataset.pick : null;
  body.innerHTML = html;
  if (ticked) body.querySelector(`[data-pick="${ticked}"]`)?.focus();
}

/** An argument can draw a picture of its own. It goes above the explanation and is redrawn with it. */
function renderDemoDrawing(argument, data, own) {
  const canvas = $('demo-canvas');
  canvas.hidden = !argument?.draw;
  if (canvas.hidden) return;
  const w = canvas.clientWidth;
  const h = argument.drawHeight ?? 180;
  if (!w) return; // not on screen: drawn when it comes back
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  argument.draw(ctx, { w, h }, data, app, own);
}

// The controls that belong to the argument on show. They are built once per argument and then kept in step.
let controlsFor = null;
function renderDemoControls(argument, own) {
  const box = $('demo-controls');
  const list = controlsOf(argument);
  box.hidden = list.length === 0;
  const key = list.length ? argument.id : null;
  if (controlsFor !== key) {
    controlsFor = key;
    box.innerHTML = list
      .map((c) =>
        c.options
          ? `<label class="row"><span>${esc(c.label)}</span><select data-own="${c.id}">${c.options
              .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
              .join('')}</select></label>`
          : `<label class="stack"><span class="row"><span>${esc(c.label)}</span><output data-own-label="${c.id}"></output></span>
             <input type="range" data-own="${c.id}" ${
               c.scale === 'log' ? `min="0" max="${SLIDER_STEPS}" step="1"` : `min="${c.min}" max="${c.max}" step="${c.step}"`
             } /></label>`,
      )
      .join('');
  }
  for (const c of list) {
    const input = box.querySelector(`[data-own="${c.id}"]`);
    const value = own[c.id];
    // A log slider is left where it is if that place already stands for the value, so it does not creep while dragged.
    const inStep = c.options ? input.value === String(value) : c.scale === 'log' ? sliderValue(c, Number(input.value)) === value : Number(input.value) === value;
    if (!inStep) input.value = String(c.options ? value : c.scale === 'log' ? sliderPosition(c, value) : value);
    if (!c.options) box.querySelector(`[data-own-label="${c.id}"]`).textContent = c.show ? c.show(value, app) : String(value);
  }
}

// ---------- views ----------

let globeView;
let flatView;
let globeSky;
let flatSky;
let hzViews = [];
let flViews = [];
let needsUpdate = true;
let hashTimer = null;

function requestUpdate() {
  needsUpdate = true;
}

function setObserver(place, focus = false) {
  state.lat = clamp(place.lat, -89.9, 89.9);
  state.lon = wrap180(place.lon);
  if (focus && globeView) {
    globeView.focus(state.lat, state.lon);
    flatView.focus(state.lat, state.lon);
  }
  requestUpdate();
}

function setLook(look) {
  globeSky.setLook(look);
  flatSky.setLook(look);
}

function followLook(c) {
  // Keep the sun in view, or the chosen star when the stars are on, or the moon when it is.
  const s = c.stars;
  const obs = c.moon ? c.moon.obs : s ? s.measured[s.selected] : c.obs;
  const flat = c.moon ? c.moon.flat : s ? s.flat[s.selected] : c.flat;
  const diff = wrap180(flat.az - obs.az);
  const together = Math.abs(diff) < 115;
  const az = together ? obs.az + diff / 2 : obs.az;
  const top = Math.max(obs.el, together ? flat.el : 0, 0);
  const bottom = Math.max(Math.min(obs.el, together ? flat.el : obs.el), 0);
  const aspect = globeSky.width / globeSky.height;
  const fov = clamp(Math.max(58, top - bottom + 34, together ? (Math.abs(diff) + 26) / aspect : 0), 58, 96);
  return { az, pitch: clamp((top + bottom) / 2, fov / 2 - 10, 82), fov };
}

function update() {
  $('views').dataset.mode = state.mode;
  document.body.dataset.mode = state.mode;
  if (state.mode === 'flight') {
    const fl = computeFlight();
    for (const v of flViews) v.update(fl);
    renderFlight(fl);
    renderDemo(fl);
    showWorkings(fl);
    syncInputs();
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 300);
    return;
  }
  if (state.mode === 'horizon') {
    const hz = computeHorizon();
    for (const v of hzViews) v.update(hz);
    renderHorizon(hz);
    renderObservations();
    renderSunsets(hz);
    renderDemo(hz);
    showWorkings(hz);
    syncInputs();
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 300);
    return;
  }
  const c = compute();
  globeView.update(state, c);
  flatView.update(state, c);
  if (state.follow) setLook(followLook(c));

  const up = c.obs.el > -0.9;
  const flatMiss = skySeparation(c.obs, c.flat);
  let globeText = up
    ? `Sun ${deg(c.globe.el)} above the horizon, bearing ${bearing(c.globe.az)}\nWidth ${deg(c.globe.sizeDeg, 2)}`
    : `Sun is ${deg(-c.globe.el)} below the horizon\nIt has set: the ground is in the way`;
  // With straight light the flat sun is always above the horizon. With bending light it can set.
  const flatSet = c.flat.el < -0.833;
  let flatText =
    (flatSet
      ? `Sun is ${deg(-c.flat.el)} below the horizon, bearing ${bearing(c.flat.az)}\n`
      : `Sun ${deg(c.flat.el)} above the horizon, bearing ${bearing(c.flat.az)}\n`) +
    `Width ${deg(c.flat.sizeDeg, 2)}, and ${deg(flatMiss)} from where it is measured` +
    (flatSet ? '\nIt has set: its light curves away overhead' : c.flat.lit ? '' : '\nBeyond its light range, yet in plain line of sight');
  const s = c.stars;
  if (s) {
    const g = s.globe[s.selected];
    const f = s.flat[s.selected];
    globeText =
      g.el > 0
        ? `${s.name}: ${deg(g.el)} above the horizon, bearing ${bearing(g.az)}`
        : `${s.name} is ${deg(-g.el)} below the horizon\nThe ground is in the way`;
    flatText =
      `${s.name}: ${deg(f.el)} above the horizon, bearing ${bearing(f.az)}\n` +
      `${deg(skySeparation(s.measured[s.selected], f))} from where it is measured`;
  }
  const m = c.moon;
  if (m) {
    globeText =
      m.globe.el > 0
        ? `Moon: ${deg(m.globe.el)} above the horizon, bearing ${bearing(m.globe.az)}\n${percent(m.lit.globe)} of its face lit`
        : `Moon is ${deg(-m.globe.el)} below the horizon\nThe ground is in the way`;
    flatText =
      `Moon: ${deg(m.flat.el)} above the horizon, bearing ${bearing(m.flat.az)}\n` +
      `${percent(m.lit.flat)} lit, and ${deg(skySeparation(m.obs, m.flat))} from where it is measured`;
  }
  const skyMoon = (key) =>
    m && { model: m[key], measured: m.obs, lit: m.lit[key], side: m.side[key], shadow: key === 'globe' ? m.shadow : null };
  lastStars = s;
  const skyStars = (key) =>
    s && {
      model: s[key],
      measured: s.measured,
      mags: s.mags,
      lines: s.lines,
      trails: s[`${key}Trails`],
      field: s.field && { model: s.field[key], mags: s.field.mags },
      selected: s.selected,
      name: s.name,
    };
  globeSky.update(c.globe, c.obs, true, globeText, c.own, skyStars('globe'), skyMoon('globe'));
  flatSky.update(c.flat, c.obs, c.flat.lit, flatText, c.own, skyStars('flat'), skyMoon('flat'));
  const views = $('views');
  views.classList.toggle('has-own', c.ownLines.length > 0);
  views.classList.toggle('has-route', !!c.route);
  views.classList.toggle('has-stars', !!s);
  views.classList.toggle('has-moon', !!m);
  for (const el of document.querySelectorAll('.sight-name')) el.textContent = c.sight.name;

  renderCompare(c, flatMiss);
  $('earth-link').href = c.route
    ? earthUrl(c.route.path[c.route.path.length >> 1].lat, c.route.path[c.route.path.length >> 1].lon, c.route.globeKm * 1.6)
    : earthUrl(state.lat, state.lon, 1500);
  $('earth-link').textContent = c.route ? 'Open this route in Google Earth' : 'Open this place in Google Earth';
  renderOwn();
  renderFit();
  renderCities(c);
  renderStars(c);
  renderMoon(c);
  renderRoutes(c);
  renderDemo(c);
  showWorkings(c);
  syncInputs();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 300);
}

// ---------- result panels ----------

// The lift the air really gives at this height, and the lift each model would
// need for its plain geometry to land on the measurement.
function bendingRow(obs, globe, flat, extra = '') {
  const show = (x, d) => (Math.abs(x) < 0.005 ? 'none' : `${deg(Math.abs(x), d)}${x < 0 ? ' down' : ''}`);
  const fits = (x) => (Math.abs(x - obs.lift) <= 0.1 ? 'good' : 'bad');
  // A model that needs more lift than the air gives has the direction spelled out.
  const need = (x, d) => (fits(x) === 'bad' && x >= 0.005 ? `${show(x, d)} up` : show(x, d));
  // Well below the horizon the ground is in the way and "lift" stops meaning anything.
  const hidden = obs.el < -1;
  const real = hidden ? '<td class="dim">n/a</td>' : `<td>${show(obs.lift, 2)}</td>`;
  const globeNeed = obs.el - globe.trueEl;
  const flatNeed = obs.el - flat.trueEl;
  return `<tr><td>Lift from the air${extra}</td>${real}
    ${hidden ? '<td class="dim">n/a</td>' : `<td class="${fits(globeNeed)}">${need(globeNeed, 2)}</td>`}
    <td class="${fits(flatNeed)}">${need(flatNeed, 1)}</td></tr>`;
}

function renderCompare(c, flatMiss) {
  const globeMiss = skySeparation(c.obs, c.globe);
  const cls = (miss) => (miss > 1 ? 'bad' : 'good');
  const up = c.obs.el > -0.833;
  $('compare').tBodies[0].innerHTML = `
    <tr><td>Elevation${infoButton('sky.elevation', 'elevation')}</td><td>${deg(c.obs.el)}</td><td>${deg(c.globe.el)}</td>
      <td class="${Math.abs(c.flat.el - c.obs.el) > 1 ? 'bad' : ''}">${deg(c.flat.el)}</td></tr>
    <tr><td>Bearing${infoButton('sky.bearing', 'bearing')}</td><td>${bearing(c.obs.az)}</td><td>${bearing(c.globe.az)}</td>
      <td class="${Math.abs(wrap180(c.flat.az - c.obs.az)) > 1 ? 'bad' : ''}">${bearing(c.flat.az)}</td></tr>
    <tr><td>Sun's width${infoButton('sky.width', 'width of the sun')}</td><td>${deg(c.obs.sizeDeg, 2)}</td><td>${deg(c.globe.sizeDeg, 2)}</td>
      <td class="${Math.abs(c.flat.sizeDeg - c.obs.sizeDeg) > 0.03 ? 'bad' : ''}">${deg(c.flat.sizeDeg, 2)}</td></tr>
    <tr><td>Sun visible?</td><td>${up ? 'yes' : 'no, set'}</td><td>${c.globe.el > -0.833 ? 'yes' : 'no, set'}</td>
      <td class="${up === c.flat.el > -0.833 ? '' : 'bad'}">${c.flat.el > -0.833 ? 'yes' : 'no, set'}</td></tr>
    <tr><td>Miss${infoButton('sky.miss', 'miss')}</td><td class="dim">n/a</td><td class="${cls(globeMiss)}">${deg(globeMiss, 2)}</td>
      <td class="${cls(flatMiss)}">${deg(flatMiss, 1)}</td></tr>
    ${bendingRow(c.obs, c.globe, c.flat, infoButton('sky.lift', 'lift from the air'))}`;
}

// Rebuilt only when its content changes, so the buttons in it stay clickable during playback.
let ownHtml = null;
function renderOwn() {
  const sum = summariseMeasurements(measurements, flatParams(), currentAir());
  let list = '';
  let summary = '';
  if (sum) {
    const cls = (miss) => (miss <= 3 ? 'good' : miss > 5 ? 'bad' : '');
    list = sum.scored
      .map((s, i) => {
        const m = s.m;
        const bearingRow =
          m.az === null
            ? ''
            : `<tr><td>Bearing</td><td>${deg(m.az)}</td><td>${deg(s.globe.az)}</td><td>${deg(s.flat.az)}</td></tr>`;
        const implied =
          s.implied === null
            ? ''
            : `<p class="hint">For the flat model to match this elevation, its ${m.star ? 'stars' : 'sun'} would have to be
               <b class="f">${km(s.implied)}</b> up.</p>`;
        const what = m.star ? esc(m.star) : 'The sun';
        const far =
          s.globeMiss > 10
            ? `<p class="hint">This is a long way from the published position for that time and place. It is worth
               double-checking the time zone and the location.</p>`
            : '';
        return `<div class="own-card ${isShown(m) ? 'shown' : ''}" data-i="${i}">
          <div class="own-head">
            <div><b>${m.label ? esc(m.label) : what}</b>${m.label ? `<small>${what}</small>` : ''}<small>${whenUtc(m.t)}</small>
              <small>${where(m.lat, m.lon)}${m.tempC === null ? '' : `, air ${m.tempC} °C`}</small></div>
            <span class="own-actions">
              <button data-act="show" title="Show this time and place in the views">Show</button>
              <button data-act="remove" title="Remove this measurement" aria-label="Remove this measurement">×</button>
            </span>
          </div>
          <table class="data">
            <thead><tr><th></th><th class="own">You</th><th class="globe">Globe</th><th class="flat">Flat</th></tr></thead>
            <tbody>
              <tr><td>Elevation</td><td>${deg(m.el)}</td><td>${deg(s.globe.el)}</td><td>${deg(s.flat.el)}</td></tr>
              ${bearingRow}
              <tr><td>Off by</td><td class="dim"></td><td class="${cls(s.globeMiss)}">${deg(s.globeMiss)}</td>
                <td class="${cls(s.flatMiss)}">${deg(s.flatMiss)}</td></tr>
            </tbody>
          </table>
          ${implied}${far}
        </div>`;
      })
      .join('');

    const n = measurements.length;
    // What one kind of measurement says about the flat model's height for it.
    const verdictFor = (group, thing, it) => {
      if (!group) return '';
      const { best, count } = group;
      if (best.rms < 1) {
        return `<p class="hint">One height for the flat ${thing} (about ${km(best.heightKm)}) can match what you have
          entered for ${it} so far. That is expected with ${count === 1 ? 'a single measurement' : 'so few'}: any one
          elevation can be explained by choosing a height. The test is whether a measurement from another place, or
          from the same place at another time, agrees on the same height.</p>`;
      }
      if (group.impliedMin !== null && count > 1) {
        return `<p class="hint">Your measurements put the flat ${thing} at heights from
          <b class="f">${km(group.impliedMin)}</b> to <b class="f">${km(group.impliedMax)}</b>. The best single
          height, ${km(best.heightKm)}, still misses by ${deg(best.rms)} on average.</p>`;
      }
      return `<p class="hint">The best height for the flat ${thing}, ${km(best.heightKm)}, still misses by ${deg(best.rms)}.</p>`;
    };
    const fitting = sum.sun && sum.stars ? 'the heights that best fit' : `the ${sum.stars ? 'star' : 'sun'} height that best fits`;
    summary =
      `<p class="hint">Typical miss across your ${n} measurement${n === 1 ? '' : 's'}:</p>` +
      bar('Globe', sum.globeRms, 'var(--globe)') +
      bar('Flat, as set', sum.flatRms, 'var(--flat)') +
      bar('Flat, best', sum.bestRms, 'var(--flat)') +
      verdictFor(sum.sun, 'sun', 'it') +
      verdictFor(sum.stars, 'stars', 'them') +
      `<p class="hint">A stick and a tape measure, or a phone held along a line of sight, are good to a degree or two,
       so expect even a correct model to miss by about that much.</p>
       <button data-act="fit">Use ${fitting} my measurements</button>`;
  }
  const html = `${list}\u0000${summary}`;
  if (html === ownHtml) return;
  ownHtml = html;
  $('own-list').innerHTML = list;
  $('own-summary').innerHTML = summary;
}

function bar(label, value, color, max = 60) {
  const pct = value === null ? 0 : clamp((value / max) * 100, 0, 100);
  const text = value === null ? 'n/a' : deg(value, value < 1 ? 2 : 1);
  return `<div class="bar-row"><span>${label}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="bar-value">${text}</span></div>`;
}

function renderFit() {
  const fit = getFit();
  const air = currentAir();
  const current = rmsMiss(fit.samples, (s, lat, lon) => flatPredict(s, lat, lon, flatParams(), air));
  $('fit-scope').textContent = `Typical miss: ${REF_CITIES.length} cities, every hour of ${isoDay(state.date)}, daytime only.`;
  $('fit-bars').innerHTML =
    bar('Globe', fit.globeRms, 'var(--globe)') +
    bar('Flat, as set', current, 'var(--flat)') +
    bar('Flat, best', fit.best?.rms ?? null, 'var(--flat)');
  $('fit-note').textContent = fit.best
    ? `No sun height gets the flat model closer than ${deg(fit.best.rms)} ` +
      `(at ${km(fit.best.heightKm)}). For scale, the sun itself is about 0.5° wide.`
    : '';
  drawFitChart(fit, current);
}

function drawFitChart(fit, current) {
  const canvas = $('fit-chart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 30, r: 8, t: 8, b: 30 };
  const logMin = Math.log10(MIN_HEIGHT_KM);
  const logMax = Math.log10(MAX_HEIGHT_KM);
  const yMax = Math.max(60, ...fit.curve.map((p) => p.rms ?? 0)) * 1.05;
  const x = (km_) => pad.l + ((Math.log10(km_) - logMin) / (logMax - logMin)) * (w - pad.l - pad.r);
  const y = (v) => h - pad.b - (v / yMax) * (h - pad.t - pad.b);

  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#93a4b8';
  ctx.strokeStyle = '#243243';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  for (const [value, label] of [[100, '100'], [1000, '1,000'], [10000, '10,000'], [100000, '100,000'], [1e6, '1M']]) {
    ctx.beginPath();
    ctx.moveTo(x(value), pad.t);
    ctx.lineTo(x(value), h - pad.b);
    ctx.stroke();
    ctx.textAlign = value === 1e6 ? 'right' : value === 100 ? 'left' : 'center';
    ctx.fillText(label, x(value), h - pad.b + 13);
  }
  ctx.textAlign = 'center';
  ctx.fillText('flat-model sun height (km)', pad.l + (w - pad.l - pad.r) / 2, h - 3);
  ctx.textAlign = 'right';
  for (let v = 0; v <= yMax; v += 20) {
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(w - pad.r, y(v));
    ctx.stroke();
    ctx.fillText(`${v}°`, pad.l - 4, y(v) + 4);
  }

  // Globe model: a flat line at essentially zero.
  ctx.strokeStyle = '#7fb4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.l, y(fit.globeRms ?? 0) - 1);
  ctx.lineTo(w - pad.r, y(fit.globeRms ?? 0) - 1);
  ctx.stroke();

  // Flat model: miss as a function of sun height.
  ctx.strokeStyle = '#ffb224';
  ctx.beginPath();
  let started = false;
  for (const p of fit.curve) {
    if (p.rms === null) continue;
    if (started) ctx.lineTo(x(p.heightKm), y(p.rms));
    else ctx.moveTo(x(p.heightKm), y(p.rms));
    started = true;
  }
  ctx.stroke();
  if (current !== null) {
    const cx = x(clamp(state.sunHeightKm, MIN_HEIGHT_KM, MAX_HEIGHT_KM));
    ctx.fillStyle = '#ffb224';
    ctx.beginPath();
    ctx.arc(cx, y(current), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b1017';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function renderCities(c) {
  const rows = c.cities.map((x) => {
    const day = x.obs.el > 0;
    return `<tr><td>${x.name}</td>
      <td class="${day ? '' : 'dim'}">${day ? deg(x.obs.el) : 'night'}</td>
      <td class="${x.miss > 2 ? 'bad' : ''}">${deg(x.flat.el)}</td>
      <td class="${day ? '' : 'dim'}">${day ? km(x.implied) : 'n/a'}</td></tr>`;
  });
  $('city-table').tBodies[0].innerHTML = rows.join('');
}

function renderStars(c) {
  const s = c.stars;
  $('stars-panel').hidden = !s;
  if (!s) return;
  const i = s.selected;
  const obs = s.measured[i];
  const g = s.globe[i];
  const f = s.flat[i];
  const miss = skySeparation(obs, f);
  const globeMiss = skySeparation(obs, g);
  const up = obs.el > 0;
  const height = (el) => (el > 0 ? deg(el) : `${deg(-el)} below`);
  $('star-name').textContent = s.name;
  $('star-compare').tBodies[0].innerHTML = `
    <tr><td>Elevation</td><td>${height(obs.el)}</td><td>${height(g.el)}</td>
      <td class="${Math.abs(f.el - obs.el) > 1 ? 'bad' : ''}">${deg(f.el)}</td></tr>
    <tr><td>Bearing</td><td>${bearing(obs.az)}</td><td>${bearing(g.az)}</td>
      <td class="${Math.abs(wrap180(f.az - obs.az)) > 1 ? 'bad' : ''}">${bearing(f.az)}</td></tr>
    <tr><td>Above the horizon?</td><td>${up ? 'yes' : 'no'}</td><td>${g.el > 0 ? 'yes' : 'no'}</td>
      <td class="${up ? '' : 'bad'}">yes</td></tr>
    <tr><td>Miss</td><td class="dim">n/a</td><td class="${globeMiss > 1 ? 'bad' : 'good'}">${deg(globeMiss, 2)}</td>
      <td class="${miss > 1 ? 'bad' : 'good'}">${deg(miss, 1)}</td></tr>
    ${bendingRow(obs, g, f)}`;

  const fit = getStarFit();
  const air = currentAir();
  const current = rmsMiss(fit.samples, (pt, lat, lon) => flatPredict(pt, lat, lon, starDome(), air));
  $('star-fit-bars').innerHTML =
    bar('Globe', fit.globeRms, 'var(--globe)', 90) +
    bar('Flat, as set', current, 'var(--flat)', 90) +
    bar('Flat, best', fit.best?.rms ?? null, 'var(--flat)', 90);
  $('star-fit-note').textContent =
    `Typical miss: ${STARS.length} stars from ${REF_CITIES.length} cities. ` +
    `${fit.best ? `No height for the stars does better than ${deg(fit.best.rms)}.` : ''}`;

  $('star-cities').tBodies[0].innerHTML = s.cities
    .map((x) => {
      const seen = x.obs.el > 0;
      return `<tr><td>${x.name}</td>
        <td class="${seen ? '' : 'dim'}">${seen ? deg(x.obs.el) : 'not visible'}</td>
        <td class="${x.miss > 2 ? 'bad' : ''}">${deg(x.flat.el)}</td>
        <td class="${seen ? '' : 'dim'}">${seen ? km(x.implied) : 'n/a'}</td></tr>`;
    })
    .join('');
}

// Rebuilt only when its content changes, so its buttons stay clickable during playback.
let routeHtml = null;
function renderRoutes(c) {
  const r = c.route;
  let detail = '<p class="hint">Pick two places, or one of the flights below, to draw the route on both maps.</p>';
  if (r) {
    const fast = (v) => (v > SOUND_KMH ? 'bad' : '');
    const speed = r.hours
      ? `<tr><td>Speed the flight needs</td><td>${kmh(r.globeKmh)}</td>
           <td class="${fast(r.flatKmh)}">${kmh(r.flatKmh)}</td></tr>`
      : `<tr><td>Flying time at ${CRUISE_KMH} km/h</td><td>${hoursMinutes(r.globeKm / CRUISE_KMH)}</td>
           <td>${hoursMinutes(r.flatKm / CRUISE_KMH)}</td></tr>`;
    const note = r.preset
      ? `Non-stop flights (${esc(r.preset.flights)}) are scheduled at about ${hoursMinutes(r.preset.there)} from
         ${r.preset.from} and ${hoursMinutes(r.preset.back)} back. The difference is the wind, so the speed uses
         the average. Sound travels at about ${kmh(SOUND_KMH)} at that height, and airliners fly a little slower.`
      : `No timetable is stored for this pair. Look up a real flight or sailing time and see which distance it
         fits.`;
    detail = `<table class="data">
        <thead><tr><th>${r.a.name} to ${r.b.name}</th><th class="globe">Globe</th><th class="flat">Flat map</th></tr></thead>
        <tbody>
          <tr><td>Shortest distance</td><td>${km(r.globeKm)}</td>
            <td class="${r.ratio > 1.15 ? 'bad' : ''}">${km(r.flatKm)}</td></tr>
          ${speed}
        </tbody></table>
      <p class="hint">${note}</p>`;
  }
  const rows = ROUTES.map((route, i) => {
    const st = routeStats(city(route.from), city(route.to), (route.there + route.back) / 2);
    const active = r?.preset === route;
    return `<tr class="${active ? 'active' : ''}">
      <td><button data-route="${i}" title="Draw this route on both maps">${route.from} – ${route.to}</button></td>
      <td>${st.hours.toFixed(1)} h</td><td>${Math.round(st.globeKmh).toLocaleString('en-US')}</td>
      <td class="${st.flatKmh > SOUND_KMH ? 'bad' : ''}">${Math.round(st.flatKmh).toLocaleString('en-US')}</td></tr>`;
  }).join('');
  const html = `${detail}\u0000${rows}`;
  if (html === routeHtml) return;
  routeHtml = html;
  $('route-detail').innerHTML = detail;
  $('route-table').tBodies[0].innerHTML = rows;
}

/** Turn both outside views to face the middle of the chosen route. */
function focusRoute() {
  const r = computeRoute();
  if (!r || !globeView) return;
  const mid = r.path[r.path.length >> 1];
  globeView.focus(mid.lat, mid.lon);
  flatView.focus(mid.lat, mid.lon);
}

function setRoute(from, to) {
  state.route = from && to && from !== to ? { from, to } : null;
  // Routes are drawn in the outside views, so a phone switches to that pair.
  if (state.route) setPair('outside');
  focusRoute();
  requestUpdate();
}

/** On a phone only one pair of views fits: the two outside views, or the two skies. */
function setPair(pair) {
  $('views').dataset.pair = pair;
  for (const btn of document.querySelectorAll('#view-tabs button')) {
    const on = btn.dataset.pair === pair;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  requestUpdate();
}

/** Switches between the sun-and-stars tool and the horizon tool. */
function setMode(mode) {
  state.mode = TOOLS.includes(mode) ? mode : 'sky';
  if (state.mode !== 'horizon') state.sailing = false;
  if (state.mode !== 'flight') state.flying = false;
  // A demonstration belongs to one tool; leaving that tool ends it.
  if (state.demo && DEMOS[state.demo].tool !== state.mode) state.demo = null;
  for (const btn of document.querySelectorAll('#mode-tabs button')) {
    const on = btn.dataset.mode === state.mode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  const names = {
    sky: ['From outside', "Observer's sky"],
    horizon: ['From the side', 'Through a telescope'],
    flight: ['One lap, speeded up', 'To scale'],
  }[state.mode];
  document.querySelectorAll('#view-tabs button').forEach((btn, i) => (btn.textContent = names[i]));
  requestUpdate();
}

function renderDemo(c) {
  const tour = state.tour;
  // If the scene has been changed away from the step on show, the step goes back to its question.
  const steps = tourSteps();
  if (tour?.shown && state.demo !== steps[tour.step]) tour.shown = false;
  const ended = !!tour && tour.step >= steps.length;
  const asking = !!tour && !ended;
  const demo = state.picking
    ? TOUR_PICK
    : ended
      ? TOUR_END
      : asking
        ? DEMOS[steps[tour.step]]
        : state.demo
          ? DEMOS[state.demo]
          : { sky: INTRO, horizon: HORIZON_INTRO, flight: FLIGHT_INTRO }[state.mode];
  $('tour-bar').hidden = !tour;
  $('tour-end').hidden = !ended;
  $('tour-ask').hidden = !asking;
  if (tour) {
    const name = tourOf().label;
    $('tour-step').textContent = ended ? `${name}: the end` : `${name}: step ${tour.step + 1} of ${steps.length}`;
    $('tour-back').disabled = tour.step === 0;
    $('tour-next').hidden = ended;
    $('tour-next').textContent = tour.step === steps.length - 1 ? 'Finish' : 'Next';
  }
  if (asking) {
    $('tour-question').textContent = demo.ask;
    $('tour-show').hidden = tour.shown;
  }
  // While a question is waiting, the views still hold the last scene, so they are dimmed.
  $('views').classList.toggle('waiting', asking && !tour.shown);
  $('demo-title').textContent = demo.title;
  $('demo-claim').hidden = !demo.claim;
  $('demo-claim-text').textContent = demo.claim ?? '';
  // A step's explanation, and any controls of its own, wait until its question has been answered.
  const answered = !(asking && !tour.shown);
  const argument = answered && state.demo && demo === DEMOS[state.demo] ? demo : null;
  const own = cleanOwn(argument, state.own);
  renderDemoControls(argument, own);
  renderDemoDrawing(argument, c, own);
  setDemoBody(answered ? demo.body(c, app, own) : '');
  for (const btn of document.querySelectorAll('#demo-list button')) {
    const on = btn.dataset.tour ? (state.picking ? btn.dataset.tour === OWN_TOUR : btn.dataset.tour === tour?.id) : btn.dataset.demo === state.demo;
    btn.classList.toggle('active', on);
    btn.hidden = btn.dataset.group !== demoGroup;
  }
  $('tour-start').setAttribute('aria-pressed', String(demoGroup === TOURS_GROUP));
  for (const btn of document.querySelectorAll('#demo-groups button[data-group]')) {
    const open = btn.dataset.group === demoGroup;
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-pressed', String(open));
    // On a phone the row of headings scrolls sideways: bring the open one into it when it changes.
    if (open && shownGroup !== demoGroup) {
      const row = $('demo-groups');
      const at = btn.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
      row.scrollLeft = at - (row.clientWidth - btn.offsetWidth) / 2;
      shownGroup = demoGroup;
    }
  }
}

// ---------- controls ----------

const heightToSlider = (h) => (1000 * Math.log10(h / MIN_HEIGHT_KM)) / Math.log10(MAX_HEIGHT_KM / MIN_HEIGHT_KM);
const sliderToHeight = (v) => MIN_HEIGHT_KM * Math.pow(MAX_HEIGHT_KM / MIN_HEIGHT_KM, v / 1000);

const celsius = (v) => `${v} °C`;
// The sliders that describe layered air: element, state key, and how its value is shown.
const LAYER_INPUTS = [
  ['hz-airc', 'airC', celsius],
  ['hz-waterc', 'waterC', celsius],
  ['hz-layer', 'layerM', (v) => fmtH(v)],
  ['hz-lapse', 'lapse100', (v) => (v === 0 ? 'the same' : `${Math.abs(v).toFixed(2)} °C ${v < 0 ? 'colder' : 'warmer'}`)],
];
const toLogSlider = (value, [min, max]) => (1000 * Math.log(value / min)) / Math.log(max / min);
const fromLogSlider = (v, [min, max]) => min * Math.pow(max / min, v / 1000);
// The three sizes in the horizon tool, each with a slider and a box to type in.
const HZ_QUANTITIES = [
  { key: 'targetM', slider: 'hz-target', number: 'hz-target-n', show: heightNumber, unit: () => (imperial() ? FT : 1) },
  { key: 'targetKm', slider: 'hz-distance', number: 'hz-distance-n', show: distanceNumber, unit: () => (imperial() ? MI : 1) },
  { key: 'eyeM', slider: 'hz-eye', number: 'hz-eye-n', show: heightNumber, unit: () => (imperial() ? FT : 1) },
];

function setIfIdle(input, value) {
  if (document.activeElement !== input) input.value = value;
}

// The measurement form shows the same moment as the main clock, in the chosen time zone.
const pad2 = (n) => String(n).padStart(2, '0');
function toInputTime(d) {
  if ($('m-zone').value === 'utc') return d.toISOString().slice(0, 16);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fromInputTime(value) {
  if ($('m-zone').value !== 'utc') return new Date(value); // no offset given: read as this device's clock
  return new Date(value.length === 16 ? `${value}:00Z` : `${value}Z`);
}

function syncInputs() {
  setIfIdle($('m-time'), toInputTime(state.date));
  $('m-where').textContent =
    `It will be recorded at the observer's place, ${where(state.lat, state.lon)}. ` +
    'Move the observer first if you measured somewhere else.';
  setIfIdle($('date'), isoDay(state.date));
  const minutes = utcMinutes(state.date);
  $('time').value = Math.floor(minutes);
  $('time-label').textContent = hhmm(Math.floor(minutes));
  $('solar-time').textContent =
    `About ${hhmm(Math.floor(minutes + state.lon * 4))} by the sun at the observer (clock zones vary).`;
  setIfIdle($('lat'), state.lat.toFixed(2));
  setIfIdle($('lon'), state.lon.toFixed(2));
  const match = CITIES.find((c) => Math.abs(c.lat - state.lat) < 0.005 && Math.abs(c.lon - state.lon) < 0.005);
  $('city').value = match ? match.name : '';
  $('sun-height').value = heightToSlider(state.sunHeightKm);
  $('sun-height-label').textContent = niceHeight(state.sunHeightKm);
  $('light-range').value = state.lightRangeKm;
  $('light-range-label').textContent = km(state.lightRangeKm);
  $('flat-lighting').value = state.flatLighting;
  $('flat-light').value = state.flatLight;
  $('light-range-name').textContent = state.flatLight === 'bent' ? 'How far off the sun is seen to set' : 'How far its light reaches';
  $('stars').checked = state.stars;
  $('star').value = state.star;
  $('star-height').value = heightToSlider(state.starHeightKm);
  $('star-height-label').textContent = niceHeight(state.starHeightKm);
  $('trails').checked = state.trails;
  $('moon').checked = state.moon;
  $('moon-height').value = heightToSlider(state.moonHeightKm);
  $('moon-height-label').textContent = niceHeight(state.moonHeightKm);
  $('route-from').value = state.route?.from ?? '';
  $('route-to').value = state.route?.to ?? '';
  $('sight-lines').checked = state.sightLines;
  $('follow').checked = state.follow;
  $('refraction').value = state.refraction;
  const custom = state.refraction === 'custom';
  $('air-fields').hidden = !custom;
  setIfIdle($('air-temp'), state.tempC);
  setIfIdle($('air-pressure'), state.pressureHpa);
  const change = Math.round((airFactor(currentAir()) - 1) * 100);
  $('air-note').textContent =
    custom ? `This air bends light ${change ? `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than` : 'the same as'} standard air.` : '';
  $('btn-play').textContent = state.playing ? 'Pause' : 'Play';
  // Over the horizon
  $('hz-shape').value = state.shape;
  $('hz-units').value = state.units;
  for (const q of HZ_QUANTITIES) {
    $(q.slider).value = toLogSlider(state[q.key], HZ_LIMITS[q.key]);
    setIfIdle($(q.number), tidy(q.show(state[q.key])));
  }
  for (const el of document.querySelectorAll('.unit-h')) el.textContent = imperial() ? 'ft' : 'm';
  for (const el of document.querySelectorAll('.unit-d')) el.textContent = imperial() ? 'mi' : 'km';
  $('hz-k').value = Math.round(state.k * 100);
  $('hz-k-label').textContent = `k = ${state.k.toFixed(2)}`;
  $('hz-k-note').textContent = airInWords(state.k);
  $('hz-sail').textContent = state.sailing ? 'Stop' : 'Send it away';
  // The picker shows a view only while the sizes on show are still that view's.
  const view = VIEWS.find((v) => {
    const s = viewSizes(v);
    return sameSize(s.distanceKm, state.targetKm) && sameSize(s.eyeM, state.eyeM) && sameSize(s.targetM, state.targetM);
  });
  $('hz-view').value = view?.id ?? '';
  const noteHtml = view
    ? `<p><b>${esc(view.to.name)}</b> from ${esc(view.from.name)}. ${esc(view.note)}</p>
       <p>Sources: ${view.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join(', ')}</p>`
    : '';
  const note = $('hz-view-note');
  note.hidden = !view;
  if (note.innerHTML !== noteHtml) note.innerHTML = noteHtml;
  const sight = sightShown() ? state.sight : null;
  $('hz-sight').hidden = !sight;
  if (sight) {
    const middle = greatCirclePath(sight.from, sight.to, 2)[1];
    $('hz-sight-text').textContent = `On the map: from ${sight.from.name} to ${sight.to.name}, ${fmtD(state.targetKm)}.`;
    $('hz-sight-link').href = earthUrl(middle.lat, middle.lon, Math.max(5, state.targetKm * 1.6));
    setIfIdle($('hz-sight-water'), String(sight.waterM));
  }
  setIfIdle($('ss-low'), tidy(heightNumber(state.sunsetLowM)));
  setIfIdle($('ss-high'), tidy(heightNumber(state.sunsetHighM)));
  setIfIdle($('ss-lat'), state.lat.toFixed(1));
  setIfIdle($('ss-seconds'), state.sunsetSeconds ?? '');
  const pair = `${state.sunsetLowM},${state.sunsetHighM}`;
  $('ss-preset').value = [...$('ss-preset').options].some((o) => o.value === pair) ? pair : '';
  $('hz-layers').checked = state.layers;
  $('hz-simple-air').hidden = state.layers;
  $('hz-layer-air').hidden = !state.layers;
  for (const [id, key, show] of LAYER_INPUTS) {
    $(id).value = state[key];
    $(`${id}-label`).textContent = show(state[key]);
  }
  const warmer = state.waterC - state.airC;
  $('hz-layer-note').textContent =
    warmer > 0.4
      ? 'Water warmer than the air: the air next to it is heated from below and light near the surface curves upward. Expect more to be hidden, and a mirage.'
      : warmer < -0.4
        ? 'Water colder than the air: the air next to it is chilled, and light near the surface curves down with the sea. Expect to see further.'
        : 'Water and air the same: only the steady change with height bends the light.';
  // Level flight
  $('fl-speed').value = state.speedKmh;
  $('fl-speed-label').textContent = fmtSpeed(state.speedKmh);
  $('fl-alt').value = state.altitudeM;
  $('fl-alt-label').textContent = fmtH(state.altitudeM);
  $('fl-minutes').value = state.flightMinutes;
  $('fl-minutes-label').textContent = fmtTime(state.flightMinutes);
  $('fl-units').value = state.units;
  $('fl-fly').textContent = state.flying ? 'Stop' : 'Fly the lap';
  $('speed').value = String(state.speed);
}

function bindControls() {
  const select = $('city');
  select.innerHTML =
    '<option value="">Custom location</option>' +
    [...CITIES]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `<option>${c.name}</option>`)
      .join('');
  for (const el of document.querySelectorAll('.ref-count')) el.textContent = REF_CITIES.length;

  const setClock = () => {
    const day = Date.parse(`${$('date').value}T00:00:00Z`);
    if (Number.isNaN(day)) return;
    state.date = new Date(day + Number($('time').value) * 60000);
    requestUpdate();
  };
  $('date').addEventListener('change', setClock);
  $('time').addEventListener('input', setClock);

  const jump = (which, name) => () => {
    const t = sunEvents(state.date, state.lat, state.lon)[which];
    if (!t) return toast(`No ${name} here on this date`);
    state.date = t;
    requestUpdate();
  };
  $('btn-sunrise').addEventListener('click', jump('rise', 'sunrise'));
  $('btn-noon').addEventListener('click', jump('noon', 'solar noon'));
  $('btn-sunset').addEventListener('click', jump('set', 'sunset'));
  $('btn-now').addEventListener('click', () => {
    state.date = new Date();
    requestUpdate();
  });
  $('btn-play').addEventListener('click', () => {
    state.playing = !state.playing;
    requestUpdate();
  });
  $('speed').addEventListener('change', (e) => (state.speed = Number(e.target.value)));

  select.addEventListener('change', () => {
    const place = city(select.value);
    if (place) setObserver(place, true);
  });
  const setLatLon = () => {
    const lat = Number($('lat').value);
    const lon = Number($('lon').value);
    if (Number.isFinite(lat) && Number.isFinite(lon)) setObserver({ lat, lon }, true);
  };
  $('lat').addEventListener('change', setLatLon);
  $('lon').addEventListener('change', setLatLon);

  $('sun-height').addEventListener('input', (e) => {
    state.sunHeightKm = sliderToHeight(Number(e.target.value));
    requestUpdate();
  });
  $('light-range').addEventListener('input', (e) => {
    state.lightRangeKm = Number(e.target.value);
    requestUpdate();
  });
  $('btn-bestfit').addEventListener('click', () => {
    const best = getFit().best;
    if (!best) return;
    state.sunHeightKm = best.heightKm;
    toast(`Best fit: ${km(best.heightKm)}, still ${deg(best.rms)} off`);
    requestUpdate();
  });
  $('flat-lighting').addEventListener('change', (e) => {
    state.flatLighting = e.target.value;
    requestUpdate();
  });
  $('flat-light').addEventListener('change', (e) => {
    state.flatLight = e.target.value === 'bent' ? 'bent' : 'straight';
    requestUpdate();
  });
  // Stars
  fillStarPickers();
  $('star').addEventListener('change', (e) => {
    Object.assign(state, { star: e.target.value, stars: true, follow: true });
    requestUpdate();
  });
  $('star-height').addEventListener('input', (e) => {
    state.starHeightKm = sliderToHeight(Number(e.target.value));
    state.stars = true;
    requestUpdate();
  });
  $('btn-star-bestfit').addEventListener('click', () => {
    const best = getStarFit().best;
    if (!best) return;
    state.starHeightKm = best.heightKm;
    state.stars = true;
    toast(`Best fit for the stars: ${km(best.heightKm)}, still ${deg(best.rms)} off`);
    requestUpdate();
  });

  // Moon
  $('moon-height').addEventListener('input', (e) => {
    state.moonHeightKm = sliderToHeight(Number(e.target.value));
    state.moon = true;
    requestUpdate();
  });
  const moonJump = (when) => () => {
    state.date = when();
    Object.assign(state, { moon: true, follow: true, playing: false });
    // Go to where the moon is high in the sky at that moment.
    setObserver(cityUnderMoon(state.date), true);
  };
  $('btn-fullmoon').addEventListener('click', moonJump(() => nextFullMoon(new Date(state.date.getTime() + 3600000))));
  $('btn-eclipse').addEventListener('click', moonJump(() => nextLunarEclipse(new Date(state.date.getTime() + 3600000)).peak));

  // Distances
  const places = [...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option>${c.name}</option>`);
  for (const id of ['route-from', 'route-to']) {
    $(id).innerHTML = '<option value="">Choose a place</option>' + places.join('');
    $(id).addEventListener('change', () => setRoute($('route-from').value, $('route-to').value));
  }
  $('route-table').addEventListener('click', (e) => {
    const route = ROUTES[Number(e.target.closest('button[data-route]')?.dataset.route)];
    if (route) setRoute(route.from, route.to);
  });
  $('route-clear').addEventListener('click', () => setRoute(null, null));

  for (const btn of document.querySelectorAll('#view-tabs button')) {
    btn.addEventListener('click', () => setPair(btn.dataset.pair));
  }

  for (const [id, key] of [
    ['sight-lines', 'sightLines'],
    ['follow', 'follow'],
    ['stars', 'stars'],
    ['moon', 'moon'],
    ['trails', 'trails'],
  ]) {
    $(id).addEventListener('change', (e) => {
      state[key] = e.target.checked;
      requestUpdate();
    });
  }
  $('refraction').addEventListener('change', (e) => {
    state.refraction = e.target.value;
    requestUpdate();
  });
  for (const [id, key] of [
    ['air-temp', 'tempC'],
    ['air-pressure', 'pressureHpa'],
  ]) {
    $(id).addEventListener('change', (e) => {
      const v = Number(e.target.value);
      if (e.target.value.trim() !== '' && Number.isFinite(v)) state[key] = clamp(v, ...AIR_LIMITS[key]);
      e.target.value = state[key];
      requestUpdate();
    });
  }
  initInfo(() => ({ data: workings, app }));
  $('all-maths').addEventListener('toggle', requestUpdate);
  bindHorizonControls();
  bindFlightControls();
  bindSunsetControls();
  bindViewControls();
  bindEarthControls();
  bindObservationForm();
  bindMeasurementForm();
  $('btn-share').addEventListener('click', async () => {
    writeHash();
    try {
      await navigator.clipboard.writeText(location.href);
      toast(measurements.length || observations.length ? 'Link copied, including what you entered' : 'Link copied');
    } catch {
      toast('Copy the address from the address bar');
    }
  });

  $('demo-groups').insertAdjacentHTML('beforeend', GROUPS.map((g) => `<button data-group="${g.id}">${esc(g.label)}</button>`).join(''));
  $('demo-list').innerHTML =
    ARGUMENTS.map((a) => `<button data-demo="${a.id}" data-group="${a.group}" title="${esc(a.claim)}">${esc(a.label)}</button>`).join('') +
    TOURS.map((t) => `<button data-tour="${t.id}" data-group="${TOURS_GROUP}" title="${esc(t.about)}">${esc(t.label)} · ${t.steps.length}</button>`).join('') +
    `<button data-tour="${OWN_TOUR}" data-group="${TOURS_GROUP}" title="Pick the arguments yourself">Choose your own</button>`;
  for (const btn of document.querySelectorAll('#demo-groups button[data-group]')) {
    btn.addEventListener('click', () => {
      demoGroup = btn.dataset.group;
      requestUpdate();
    });
  }
  for (const btn of document.querySelectorAll('#demos button[data-demo]')) {
    btn.addEventListener('click', () => {
      // Picking a demonstration directly leaves the tour.
      state.tour = null;
      showArgument(btn.dataset.demo);
    });
  }
  for (const btn of document.querySelectorAll('#demos button[data-tour]')) {
    btn.addEventListener('click', () => (btn.dataset.tour === OWN_TOUR ? tourPick() : tourGo(0, btn.dataset.tour)));
  }
  // Choosing the steps of a tour: the ticks and the two buttons are inside the explanation, which is redrawn.
  $('demo-body').addEventListener('change', (e) => {
    const id = e.target.dataset?.pick;
    if (!id) return;
    const chosen = new Set(state.ownTour);
    if (e.target.checked) chosen.add(id);
    else chosen.delete(id);
    state.ownTour = cleanTourSteps([...chosen]);
    requestUpdate();
  });
  $('demo-body').addEventListener('click', (e) => {
    if (e.target.closest('[data-pick-start]') && state.ownTour.length >= MIN_TOUR_STEPS) tourGo(0, OWN_TOUR);
    else if (e.target.closest('[data-pick-cancel]')) tourLeave();
  });
  // A control that belongs to the argument on show.
  $('demo-controls').addEventListener('input', (e) => {
    const control = controlsOf(DEMOS[state.demo]).find((c) => c.id === e.target.dataset.own);
    if (!control) return;
    const raw = control.options ? e.target.value : control.scale === 'log' ? sliderValue(control, Number(e.target.value)) : Number(e.target.value);
    state.own = { ...state.own, [control.id]: cleanValue(control, raw) };
    requestUpdate();
  });
  $('tour-start').addEventListener('click', () => {
    demoGroup = TOURS_GROUP;
    requestUpdate();
  });
  $('tour-again').addEventListener('click', () => tourGo(0));
  $('tour-back').addEventListener('click', () => tourGo(state.tour.step - 1));
  $('tour-next').addEventListener('click', () => tourGo(state.tour.step + 1));
  $('tour-show').addEventListener('click', tourShow);
  $('tour-leave').addEventListener('click', tourLeave);
  $('tour-explore').addEventListener('click', tourLeave);
}

function bindHorizonControls() {
  for (const btn of document.querySelectorAll('#mode-tabs button')) {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  }
  const set = (key, value) => {
    state[key] = clamp(value, ...HZ_LIMITS[key]);
    // Moving the target by hand takes over from the animation.
    if (key === 'targetKm') state.sailing = false;
    requestUpdate();
  };
  for (const q of HZ_QUANTITIES) {
    $(q.slider).addEventListener('input', (e) => set(q.key, fromLogSlider(Number(e.target.value), HZ_LIMITS[q.key])));
    $(q.number).addEventListener('change', (e) => {
      const v = Number(e.target.value);
      if (e.target.value.trim() !== '' && Number.isFinite(v) && v > 0) set(q.key, v * q.unit());
      e.target.value = tidy(q.show(state[q.key]));
    });
  }
  $('hz-shape').addEventListener('change', (e) => {
    state.shape = e.target.value;
    // The ship demonstration talks about a ship.
    if (state.shape !== 'ship' && state.demo === 'ship') state.demo = null;
    requestUpdate();
  });
  $('hz-units').addEventListener('change', (e) => {
    state.units = e.target.value === 'imperial' ? 'imperial' : 'metric';
    requestUpdate();
  });
  $('hz-sail').addEventListener('click', () => {
    state.sailing = !state.sailing;
    // Already out of sight: start again from close in.
    if (state.sailing && state.targetKm >= sailLimitKm() * 0.999) state.targetKm = nearKm();
    requestUpdate();
  });
  $('hz-reset').addEventListener('click', () => {
    state.sailing = false;
    state.targetKm = nearKm();
    requestUpdate();
  });

  const setK = (k) => {
    state.k = clamp(k, 0, 1);
    requestUpdate();
  };
  $('hz-k').addEventListener('input', (e) => setK(Number(e.target.value) / 100));
  $('hz-layers').addEventListener('change', (e) => {
    state.layers = e.target.checked;
    requestUpdate();
  });
  for (const [id, key] of LAYER_INPUTS) {
    $(id).addEventListener('input', (e) => {
      state[key] = Number(e.target.value);
      requestUpdate();
    });
  }
  for (const [id, air] of [
    ['hz-air-cold', { airC: 15, waterC: 9, layerM: 15, lapse100: -0.65 }],
    ['hz-air-even', { airC: 15, waterC: 15, layerM: 10, lapse100: -0.65 }],
    ['hz-air-warm', { airC: 12, waterC: 15, layerM: 2, lapse100: -0.65 }],
  ]) {
    $(id).addEventListener('click', () => {
      Object.assign(state, air, { layers: true });
      requestUpdate();
    });
  }
  $('hz-k-none').addEventListener('click', () => setK(0));
  $('hz-k-standard').addEventListener('click', () => setK(K_STANDARD));

  // The weather calculator: three things a person can measure, turned into the bending.
  const weather = () => {
    const tempC = Number($('hz-w-temp').value);
    const pressureHpa = Number($('hz-w-pressure').value);
    const per100 = Number($('hz-w-lapse').value);
    const ok =
      [tempC, pressureHpa, per100].every(Number.isFinite) &&
      ['hz-w-temp', 'hz-w-pressure', 'hz-w-lapse'].every((id) => $(id).value.trim() !== '') &&
      tempC >= AIR_LIMITS.tempC[0] && tempC <= AIR_LIMITS.tempC[1] &&
      pressureHpa >= AIR_LIMITS.pressureHpa[0] && pressureHpa <= AIR_LIMITS.pressureHpa[1];
    return ok ? coefficientFromWeather({ tempC, pressureHpa, lapse: per100 / 100 }) : null;
  };
  const showWeather = () => {
    const k = weather();
    $('hz-w-use').disabled = k === null;
    $('hz-w-result').textContent =
      k === null
        ? 'Enter a temperature, a pressure and the change in temperature.'
        : k < 0
          ? `That gives k = ${k.toFixed(2)}: light bends upward, as over hot ground. The slider stops at none.`
          : k > 1
            ? `That gives k = ${k.toFixed(2)}: light bends more sharply than the sea curves. The slider stops at 1.`
            : `That gives k = ${k.toFixed(2)}.`;
  };
  for (const id of ['hz-w-temp', 'hz-w-pressure', 'hz-w-lapse']) $(id).addEventListener('input', showWeather);
  $('hz-w-use').addEventListener('click', () => {
    const k = weather();
    if (k !== null) setK(k);
  });
  showWeather();
}

/** Fills the two lists of stars: the one to follow, and the one to say what was measured. */
function fillStarPickers() {
  const options = (names) => names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  const featured = new Set(FEATURED_STARS.map(([name]) => name));
  const others = STARS.filter((star) => !featured.has(star.name)).map((star) => star.name).sort((a, b) => a.localeCompare(b));
  const planets = PLANETS.map((p) => p.name);
  const added = SKY_BODIES.filter((s) => s.hr !== undefined).map((s) => s.name);
  const fromCatalogue = added.length ? `<optgroup label="From the catalogue">${options(added)}</optgroup>` : '';
  const follow = $('star');
  follow.innerHTML =
    '<optgroup label="Good ones to start with">' +
    FEATURED_STARS.map(([name, note]) => `<option value="${name}">${name}${note ? ` (${note})` : ''}</option>`).join('') +
    `</optgroup><optgroup label="Other bright stars">${options(others)}</optgroup><optgroup label="Planets">${options(planets)}</optgroup>${fromCatalogue}`;
  follow.value = state.star;
  const what = $('m-what');
  const chosen = what.value;
  what.innerHTML =
    `<option value="">The sun</option><optgroup label="A planet">${options(planets)}</optgroup>` +
    `<optgroup label="A star">${options(STARS.map((s) => s.name).sort((a, b) => a.localeCompare(b)))}</optgroup>${fromCatalogue}`;
  what.value = chosen;
}

function bindMeasurementForm() {
  const offset = -new Date().getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const mins = Math.abs(offset) % 60;
  $('m-zone').options[0].textContent =
    `My clock (UTC${offset < 0 ? '−' : '+'}${hours}${mins ? `:${pad2(mins)}` : ''})`;

  $('m-time').addEventListener('change', (e) => {
    const d = fromInputTime(e.target.value);
    if (Number.isNaN(d.getTime())) return;
    state.date = d;
    state.playing = false;
    requestUpdate();
  });
  $('m-zone').addEventListener('change', requestUpdate);

  const filled = (id) => $(id).value.trim() !== '';
  const shadowElevation = () => {
    const stick = Number($('m-stick').value);
    const shadow = Number($('m-shadow').value);
    return filled('m-stick') && filled('m-shadow') && stick > 0 && shadow > 0 ? shadowToElevation(stick, shadow) : null;
  };
  // What was measured: the sun, or one of the stars. A star throws no shadow, so it is always an angle.
  fillStarPickers();
  const usingShadow = () => !$('m-what').value && $('m-method').value === 'shadow';
  const showMethod = () => {
    const star = $('m-what').value;
    const shadow = usingShadow();
    $('m-method-row').hidden = !!star;
    $('m-star-hint').hidden = !star;
    $('m-angle-fields').hidden = shadow;
    $('m-shadow-fields').hidden = !shadow;
    $('m-el-label').textContent = star ? `Height of ${star} above the horizon (°)` : "Sun's height above the horizon (°)";
    $('m-az-label').textContent = shadow
      ? 'Compass bearing the shadow points (°, optional)'
      : `Compass bearing to ${star || 'the sun'} (°, optional)`;
  };
  $('m-what').addEventListener('change', showMethod);
  const showShadowResult = () => {
    const el = shadowElevation();
    $('m-shadow-result').textContent =
      el === null ? 'Stand the stick upright on level ground.' : `That puts the sun ${deg(el)} above the horizon.`;
  };
  $('m-method').addEventListener('change', showMethod);
  $('m-stick').addEventListener('input', showShadowResult);
  $('m-shadow').addEventListener('input', showShadowResult);
  showMethod();
  showShadowResult();

  $('m-add').addEventListener('click', () => {
    const shadow = usingShadow();
    const el = shadow ? shadowElevation() : filled('m-el') ? Number($('m-el').value) : null;
    if (el === null || !Number.isFinite(el) || el < 0 || el > 90) {
      return toast(shadow ? 'Enter the stick height and the shadow length' : 'Enter an elevation from 0 to 90 degrees');
    }
    let az = null;
    if (filled('m-az')) {
      const b = Number($('m-az').value);
      if (!Number.isFinite(b) || b < 0 || b > 360) return toast('Enter a bearing from 0 to 360 degrees');
      az = shadow ? shadowToAzimuth(b) : b;
    }
    if (measurements.length >= MAX_MEASUREMENTS) return toast(`Up to ${MAX_MEASUREMENTS} measurements can be kept`);
    const m = cleanMeasurement({
      t: state.date.getTime(),
      lat: state.lat,
      lon: state.lon,
      el,
      az,
      label: $('m-label').value,
      tempC: $('m-temp').value,
      star: $('m-what').value,
    });
    if (!m) return toast('That measurement could not be read');
    const before = measurements.length;
    measurements = mergeMeasurements(measurements, [m]);
    if (measurements.length === before) return toast('That measurement is already in the list');
    saveMeasurements();
    state.date = new Date(m.t);
    state.playing = false;
    // A star that has just been measured is put on show, so its mark can be seen beside it.
    if (m.star) Object.assign(state, { stars: true, star: m.star });
    for (const id of ['m-el', 'm-shadow', 'm-az', 'm-label', 'm-temp']) $(id).value = '';
    showShadowResult();
    toast('Measurement added');
    return requestUpdate();
  });

  $('own').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'fit') {
      const sum = summariseMeasurements(measurements, flatParams(), currentAir());
      if (!sum) return;
      if (sum.sun) state.sunHeightKm = clamp(sum.sun.best.heightKm, MIN_HEIGHT_KM, MAX_HEIGHT_KM);
      if (sum.stars) state.starHeightKm = clamp(sum.stars.best.heightKm, MIN_HEIGHT_KM, MAX_HEIGHT_KM);
      const heights = [sum.sun && `sun ${km(sum.sun.best.heightKm)}`, sum.stars && `stars ${km(sum.stars.best.heightKm)}`].filter(Boolean).join(', ');
      toast(`Best fit to your measurements: ${heights}, off by ${deg(sum.bestRms)}`);
      requestUpdate();
      return;
    }
    const m = measurements[Number(btn.closest('.own-card')?.dataset.i)];
    if (!m) return;
    if (btn.dataset.act === 'show') {
      state.date = new Date(m.t);
      state.playing = false;
      state.follow = true;
      if (m.star) Object.assign(state, { stars: true, star: m.star });
      setObserver(m, true);
    } else if (btn.dataset.act === 'remove') {
      measurements = measurements.filter((x) => x !== m);
      saveMeasurements();
      toast('Measurement removed');
      requestUpdate();
    }
  });
}

// ---------- shareable state ----------

function writeHash() {
  const p = new URLSearchParams({
    t: state.date.toISOString().slice(0, 19) + 'Z',
    lat: state.lat.toFixed(3),
    lon: state.lon.toFixed(3),
    h: Math.round(state.sunHeightKm),
    r: Math.round(state.lightRangeKm),
    sl: state.sightLines ? 1 : 0,
    fl: state.flatLighting,
    ...(state.flatLight === 'bent' ? { fb: 1 } : {}),
    rf: { off: 0, standard: 1, custom: 2 }[state.refraction],
  });
  if (state.refraction === 'custom') {
    p.set('tc', state.tempC);
    p.set('ph', state.pressureHpa);
  }
  if (state.demo) {
    p.set('demo', state.demo);
    const own = encodeOwn(DEMOS[state.demo], state.own);
    if (own) p.set('a', own);
  }
  if (state.tour) {
    if (state.tour.id !== TOURS[0].id) p.set('tn', state.tour.id);
    if (state.tour.id === OWN_TOUR) p.set('tl', state.ownTour.join('~'));
    p.set('ts', state.tour.step + 1);
    if (state.tour.shown) p.set('tv', 1);
  }
  if (state.stars) {
    p.set('st', 1);
    p.set('star', state.star);
    p.set('sh', Math.round(state.starHeightKm));
    if (state.trails) p.set('tr', 1);
  }
  if (state.moon) {
    p.set('mo', 1);
    p.set('mh', Math.round(state.moonHeightKm));
  }
  if (state.route) p.set('rt', `${state.route.from}~${state.route.to}`);
  if (state.mode === 'flight') {
    p.set('v', 'f');
    p.set('fs', Math.round(state.speedKmh));
    p.set('fa', Math.round(state.altitudeM));
    p.set('fm', Math.round(state.flightMinutes));
    if (imperial()) p.set('u', 'i');
  }
  if (state.mode === 'horizon') {
    p.set('v', 'h');
    p.set('tg', state.shape);
    p.set('th', tidy(state.targetM));
    p.set('td', Number(state.targetKm.toFixed(2)));
    p.set('eh', tidy(state.eyeM));
    p.set('k', state.k.toFixed(2));
    if (sightShown()) {
      const { from, to, waterM } = state.sight;
      p.set('sg', [from.lat, from.lon, to.lat, to.lon].map((n) => Number(n.toFixed(5))).concat(Number(waterM.toFixed(2))).join(','));
    }
    if (state.sunsetLowM !== 0.2 || state.sunsetHighM !== 1.7 || state.sunsetSeconds !== null) {
      p.set('s1', tidy(state.sunsetLowM));
      p.set('s2', tidy(state.sunsetHighM));
      if (state.sunsetSeconds !== null) p.set('s3', state.sunsetSeconds);
    }
    if (state.layers) {
      p.set('ly', 1);
      p.set('at', state.airC);
      p.set('wt', state.waterC);
      p.set('lm', state.layerM);
      p.set('lg', state.lapse100);
    }
    if (imperial()) p.set('u', 'i');
  }
  if (measurements.length) p.set('m', encodeMeasurements(measurements));
  if (observations.length) p.set('o', encodeObservations(observations));
  history.replaceState(null, '', `#${p}`);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (key, min, max) => {
    const v = Number(p.get(key));
    return p.has(key) && Number.isFinite(v) ? clamp(v, min, max) : null;
  };
  const t = new Date(p.get('t') ?? '');
  if (!Number.isNaN(t.getTime())) state.date = t;
  state.lat = num('lat', -89.9, 89.9) ?? state.lat;
  state.lon = num('lon', -180, 180) ?? state.lon;
  state.sunHeightKm = num('h', MIN_HEIGHT_KM, MAX_HEIGHT_KM) ?? state.sunHeightKm;
  state.lightRangeKm = num('r', 1000, 20000) ?? state.lightRangeKm;
  if (p.has('sl')) state.sightLines = p.get('sl') === '1';
  if (p.has('rf')) state.refraction = { 0: 'off', 2: 'custom' }[p.get('rf')] ?? 'standard';
  state.tempC = num('tc', ...AIR_LIMITS.tempC) ?? state.tempC;
  state.pressureHpa = num('ph', ...AIR_LIMITS.pressureHpa) ?? state.pressureHpa;
  if (p.get('fl') === 'observed' || p.get('fl') === 'model') state.flatLighting = p.get('fl');
  state.flatLight = p.get('fb') === '1' ? 'bent' : 'straight';
  if (DEMOS[p.get('demo')]) state.demo = p.get('demo');
  if (p.has('tl')) state.ownTour = cleanTourSteps(p.get('tl').split('~'));
  // A tour is named by "tn"; a step number alone means the first tour, as it did when there was only one.
  const tourId =
    p.get('tn') === OWN_TOUR && state.ownTour.length >= MIN_TOUR_STEPS ? OWN_TOUR : (TOURS.find((t) => t.id === p.get('tn')) ?? TOURS[0]).id;
  const tourLength = tourOf({ id: tourId }).steps.length;
  const tourStep = num('ts', 1, tourLength + 1) ?? (p.has('tn') ? 1 : null);
  state.tour = tourStep === null ? null : { id: tourId, step: Math.round(tourStep) - 1, shown: p.get('tv') === '1' };
  state.picking = false;
  if (state.tour && !state.tour.shown) state.demo = null;
  // A link written by the app always carries the time. One without it was typed by hand.
  const wanted = !p.has('t') && (state.tour?.shown || (!state.tour && state.demo));
  bareLink = wanted ? { demo: state.demo, own: p.get('a'), tourShown: !!state.tour?.shown } : null;
  if (state.demo) demoGroup = DEMOS[state.demo].group;
  state.stars = p.get('st') === '1';
  state.moon = p.get('mo') === '1';
  state.moonHeightKm = num('mh', MIN_HEIGHT_KM, MAX_HEIGHT_KM) ?? state.moonHeightKm;
  state.trails = p.get('tr') === '1';
  if (starIndex(p.get('star')) >= 0) state.star = p.get('star');
  state.starHeightKm = num('sh', MIN_HEIGHT_KM, MAX_HEIGHT_KM) ?? state.starHeightKm;
  const [from, to] = (p.get('rt') ?? '').split('~');
  state.route = city(from) && city(to) && from !== to ? { from, to } : null;
  state.mode = { h: 'horizon', f: 'flight' }[p.get('v')] ?? 'sky';
  state.speedKmh = num('fs', ...FLIGHT_LIMITS.speedKmh) ?? state.speedKmh;
  state.altitudeM = num('fa', ...FLIGHT_LIMITS.altitudeM) ?? state.altitudeM;
  state.flightMinutes = num('fm', ...FLIGHT_LIMITS.minutes) ?? state.flightMinutes;
  if (TARGET_SHAPES.includes(p.get('tg'))) state.shape = p.get('tg');
  state.targetM = num('th', ...HZ_LIMITS.targetM) ?? state.targetM;
  state.targetKm = num('td', ...HZ_LIMITS.targetKm) ?? state.targetKm;
  state.eyeM = num('eh', ...HZ_LIMITS.eyeM) ?? state.eyeM;
  state.k = num('k', 0, 1) ?? state.k;
  // The two ends of the line of sight, and the height of the water. Their names come back if they are a well-known view's.
  const ends = (p.get('sg') ?? '').split(',').map(Number);
  if (ends.length === 5 && ends.every(Number.isFinite) && Math.abs(ends[0]) <= 90 && Math.abs(ends[2]) <= 90 && Math.abs(ends[1]) <= 180 && Math.abs(ends[3]) <= 180) {
    const near = (a, b) => Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
    const from = { lat: ends[0], lon: ends[1] };
    const to = { lat: ends[2], lon: ends[3] };
    const known = VIEWS.find((v) => near(v.from, from) && near(v.to, to));
    state.sight = {
      from: { name: known?.from.name ?? 'the first place', ...from },
      to: { name: known?.to.name ?? 'the second place', ...to },
      waterM: clamp(ends[4], -500, 6000),
    };
  } else if (p.has('td')) {
    state.sight = null;
  }
  state.layers = p.get('ly') === '1';
  state.sunsetHighM = num('s2', 0.02, HZ_LIMITS.eyeM[1]) ?? state.sunsetHighM;
  state.sunsetLowM = num('s1', 0, state.sunsetHighM * 0.99) ?? Math.min(state.sunsetLowM, state.sunsetHighM * 0.99);
  state.sunsetSeconds = num('s3', 0.1, 36000);
  state.airC = num('at', -20, 40) ?? state.airC;
  state.waterC = num('wt', -2, 35) ?? state.waterC;
  state.layerM = num('lm', 1, 50) ?? state.layerM;
  state.lapse100 = num('lg', -1, 2) ?? state.lapse100;
  if (p.has('u')) state.units = p.get('u') === 'i' ? 'imperial' : 'metric';
  if (state.demo && DEMOS[state.demo].tool !== state.mode) state.demo = null;
  state.own = state.demo ? decodeOwn(DEMOS[state.demo], p.get('a')) : {};
  // Measurements that came with the link are added to the ones already here.
  measurements = mergeMeasurements(measurements, decodeMeasurements(p.get('m')));
  observations = mergeObservations(observations, decodeObservations(p.get('o')));
}

// ---------- start ----------

async function start() {
  let stored = '';
  try {
    stored = localStorage.getItem(STORE_KEY) ?? '';
  } catch {
    // Storage can be unavailable. Then there is nothing stored to read.
  }
  await knowCatalogueStarsIn(decodeURIComponent(location.hash.replace(/\+/g, ' ')), stored);
  measurements = mergeMeasurements(loadStoredMeasurements());
  observations = mergeObservations(loadStoredObservations());
  readHash();
  bindControls();
  const land = await (await fetch('data/land-110m.json')).json();
  const landCanvas = makeLandCanvas(land);
  const onPick = (lat, lon) => setObserver({ lat, lon });
  const onLook = (look) => {
    state.follow = false;
    $('follow').checked = false;
    setLook(look);
  };
  globeView = new GlobeView($('globe-view'), land, landCanvas, REF_CITIES, { onPick });
  flatView = new FlatView($('flat-view'), land, landCanvas, REF_CITIES, { onPick });
  globeSky = new SkyView($('globe-sky'), { onLook, onPick: (dir, fov) => pickStar('globe', dir, fov) });
  flatSky = new SkyView($('flat-sky'), { onLook, onPick: (dir, fov) => pickStar('flat', dir, fov) });
  hzViews = [
    new HorizonView($('hz-globe-side'), 'side', 'globe'),
    new HorizonView($('hz-flat-side'), 'side', 'flat'),
    new HorizonView($('hz-globe-scope'), 'scope', 'globe'),
    new HorizonView($('hz-flat-scope'), 'scope', 'flat'),
  ];
  flViews = [
    new FlightView($('fl-globe-lap'), 'lap', 'globe'),
    new FlightView($('fl-flat-lap'), 'lap', 'flat'),
    new FlightView($('fl-globe-stretch'), 'stretch', 'globe'),
    new FlightView($('fl-flat-stretch'), 'stretch', 'flat'),
  ];
  for (const v of [globeView, flatView, globeSky, flatSky]) v.resize();
  globeView.focus(state.lat, state.lon);
  flatView.focus(state.lat, state.lon);
  focusRoute();
  applyBareLink();
  setMode(state.mode);
  setPair(state.demo ? DEMOS[state.demo].pair : 'outside');
  window.addEventListener('resize', requestUpdate);
  // A link pasted into a tab that already has the app open changes only the hash.
  window.addEventListener('hashchange', async () => {
    await knowCatalogueStarsIn(decodeURIComponent(location.hash.replace(/\+/g, ' ')));
    readHash();
    applyBareLink();
    setMode(state.mode);
    globeView.focus(state.lat, state.lon);
    flatView.focus(state.lat, state.lon);
    requestUpdate();
  });

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing) {
      state.date = new Date(state.date.getTime() + dt * state.speed * 60000);
      needsUpdate = true;
    }
    if (state.flying && state.mode === 'flight') {
      flightPhase = (flightPhase + dt / LAP_SECONDS) % 1;
      needsUpdate = true;
    }
    if (state.sailing && state.mode === 'horizon') {
      // The target moves off faster the further it has gone, so the whole trip takes a few seconds.
      const limit = sailLimitKm();
      state.targetKm = Math.min(limit, state.targetKm * Math.exp(dt * 0.3));
      if (state.targetKm >= limit) state.sailing = false;
      needsUpdate = true;
    }
    if (needsUpdate) {
      needsUpdate = false;
      update();
    }
    for (const v of [globeView, flatView, globeSky, flatSky]) v.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Handy for debugging and for scripted checks.
  window.app = { currentKml, state, compute, computeHorizon, computeFlight, requestUpdate, measurements: () => measurements, observations: () => observations, views: { globeView, flatView, globeSky, flatSky } };
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="toast">Could not start: ${String(err.message || err)}. Serve this folder over http.</div>`,
  );
});
