// The page itself: what is set, what is worked out from it, and what is written into the tables.
//
// No sum about the sky or the ground is done in this file. It calls the ones in the modules beside it:
//
//   js/astro.js       what is measured: the published almanac (Astronomy Engine), for any time and place
//   js/models.js      the two models, each a few lines of geometry
//   js/refraction.js  how much the air lifts things in the sky, one function shared by all three
//   js/horizon.js     what the sea hides, js/flight.js for level flight, js/distances.js for routes
//
// The one thing to check, if you doubt the result. In `compute` below both models are handed the same two
// things: the place on Earth where the sun is overhead at that moment, and where the observer stands. Each
// works out from those where the sun should be in the observer's sky. Neither is handed the answer. The
// "Measured" figure they are marked against comes from the almanac in js/astro.js and from neither model.
// The stars and the moon are done the same way.
//
// The almanac rests on the same astronomy as the globe model, so the globe matching it is true by
// construction. It is not the evidence, and the page says so. The evidence is that the almanac matches what
// anyone measures: "Your own measurements" puts a reading of yours against both models.
//
// In the order they come:
//
//   state                        everything that can be set
//   formatting                   numbers into words
//   the user's own measurements
//   model evaluation             `compute`: the almanac and both models, for the moment on show
//   the moon, the stars          the same for those
//   distances and the score      routes between cities, and the day of hourly sun positions each model is scored on
//   over the horizon, two sunsets, level flight, the user's own horizon observations
//   Google Earth                 files out and in, and the line of sight on the map
//   demonstrations               what each one in js/arguments/ is handed
//   showing the working, moving about the page, the guided tour
//   views and the update         `update`: one pass from state to screen
//   result panels                the tables
//   controls                     the settings, the time controls above the views, the menu on the observer's sky
//   shareable state              the link: everything set, written after the # and read back
//   start
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
  globeAngleDeg,
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
  sunCovered,
  moonShadowGlobe,
  moonShadowFlat,
} from './models.js';
import { CITIES, REF_CITIES } from './cities.js';
import { publishedAt, trackOf, flatCentre } from './shadowpath.js';
import { sceneryAt } from './place.js';
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
  catalogueNamesIn,
} from './stars.js';
import { ROUTES, CRUISE_KMH, SOUND_KMH, routeStats, greatCirclePath, globeDistanceKm } from './distances.js';
import { makeLandCanvas } from './scene-utils.js';
import { GlobeView } from './views/globeView.js';
import { FlatView } from './views/flatView.js';
import { SkyView } from './views/skyView.js';
import { ARGUMENTS, ARGUMENT_BY_ID, GROUPS, TOOLS, TOURS, OWN_TOUR, MIN_TOUR_STEPS, MAX_TOUR_STEPS, cleanTourSteps, moveTourStep } from './arguments/index.js';
import { SLIDER_STEPS, controlsOf, defaultsFor, cleanValue, cleanOwn, sliderPosition, sliderValue, encodeOwn, decodeOwn } from './arguments/controls.js';
import { EXPLAIN } from './explain.js';
import { initInfo, refreshInfo, infoButton, explainHtml } from './info.js';
import { HorizonView } from './views/horizonView.js';
import { FlightView } from './views/flightView.js';
import { SpaceView, spaceDistance } from './views/spaceView.js';
import { spaceScene, SPACE_BODIES } from './space.js';
import { FLIGHT_LIMITS, flightScene, schulerMinutes } from './flight.js';
import { earthUrl, buildKml, buildSightKml, parseKml, kmlText, KML_LIMITS } from './earth.js';
import { makeAir, traceView } from './raytrace.js';
import { VIEWS, viewSizes, viewById } from './presets.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const MINUTE_MS = 60000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// The flat model's sun, moon and stars can be put at any height in this range, and every search for a height
// that suits it best covers the whole of it. The settings start at 5,000 km.
const MIN_HEIGHT_KM = 100;
const MAX_HEIGHT_KM = 1e6;

// The sun counts as up while any of its disc shows above the horizon: while its middle, as it appears, is
// no more than half its own width below level.
//
//   up while   height + width ÷ 2 > 0
//
// The height is the one on show, with whatever lift the air is set to give already in it, and the width is the
// one that source gives the sun from here: the almanac's for the measured sun, each model's own for its own.
// An almanac's times of sunrise and sunset are the same rule put another way. Its usual 0.833° is half the
// sun's width (0.27°) plus the air's lift at the horizon (0.57°), to be set against a height with no lift in it.
const sunUp = (sun) => sun.el + sun.sizeDeg / 2 > 0;
// A sun that is up, in words. Its middle can be a little below the horizon with its top edge still showing.
const sunHeightText = (el) => (el >= 0 ? `${deg(el)} above the horizon` : `on the horizon, its middle ${deg(-el)} below`);

// ---------- state ----------

// Everything that can be set. The link written after the # carries it (see "shareable state").
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
  skyGrid: false, // lines of equal elevation and bearing drawn over the observer's sky
  playing: false,
  speed: 10, // simulated minutes per real second
  // From space
  spaceLook: 'earth', // what the view from space is looking at: one of SPACE_LOOKS
  spaceStay: 'Earth', // the body its camera keeps its place beside as the time runs: one of SPACE_BODIES
  spaceFree: false, // whether its camera is off its circle and moving freely
  spaceOrbits: true,
  spaceNames: true,
  spaceSpeed: 60, // simulated minutes per real second while that view is on show
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
  sun: true, // whether the sun, and the day and night it makes, are drawn on the globe and the map
  observer: true, // whether the observer is marked on the globe and the map
  hiddenPanes: '', // the views that have been switched off: their ids, joined by "~"
  route: null, // { from, to } as place names, or null
  // Over the horizon
  mode: 'sky', // which tool is showing: 'sky' (sun, stars and maps), 'horizon', 'flight' or 'space'
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

// What everything is set to at the start. A link leaves out a setting that is still as it is here, where that
// setting belongs to a tool that is not on show or to something that is switched off.
const DEFAULT = Object.freeze({ ...state, own: {}, ownTour: [] });

// ---------- formatting ----------

const deg = (n, d = 1) => `${n.toFixed(d)}°`;
const whole = (n) => Math.round(n).toLocaleString('en-US');
const km = (n) => `${whole(n)} km`;
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
const kmh = (n) => `${whole(n)} km/h`;
const percent = (fraction) => `${Math.round(fraction * 100)}%`;
/** A height in the sky, in words when it is under the horizon. */
const heightOrBelow = (el) => (el > 0 ? deg(el) : `${deg(-el)} below`);
const toDegrees = (radians) => (radians * 180) / Math.PI;
const hoursMinutes = (h) => {
  const m = Math.round(h * 60);
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
};

// The horizon tool works in metres and kilometres and can show feet and miles.
const FT = 0.3048;
const MI = 1.609344;
const imperial = () => state.units === 'imperial';
// The unit on show, in metres and in kilometres.
const heightUnit = () => (imperial() ? FT : 1);
const distanceUnit = () => (imperial() ? MI : 1);
const heightNumber = (m) => m / heightUnit();
const distanceNumber = (k) => k / distanceUnit();
// Three figures or so: enough to read, and no more than the sums are good for.
const tidy = (v) => Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2));
const fmtH = (m) => `${tidy(heightNumber(m)).toLocaleString('en-US')} ${imperial() ? 'ft' : 'm'}`;
const fmtD = (k) => `${tidy(distanceNumber(k)).toLocaleString('en-US')} ${imperial() ? 'mi' : 'km'}`;
const fmtSpeed = (v) => (imperial() ? `${whole(v / MI)} mph` : kmh(v));
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

// Readings the user has taken of the sun or a star: its height above the horizon and, if they have it, its
// bearing, at a time and a place. They are kept on this device and carried in the link. js/measurements.js
// puts each one against both models.
const STORE_KEY = 'globedart.measurements';
let measurements = [];

/** A list kept on this device under a name, or an empty one. */
function storedList(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    // Storage can be unavailable (private windows, blocked site data). The link still carries them.
    return [];
  }
}

const saveMeasurements = () => remember(STORE_KEY, measurements);

const sameMoment = (m, ms) => Math.abs(m.t - state.date.getTime()) <= ms;
// Within 0.006° each way, which is under 700 m.
const samePlace = (m) => Math.abs(m.lat - state.lat) < 0.006 && Math.abs(wrap180(m.lon - state.lon)) < 0.006;
/** True when the views are showing the time and place this measurement was taken. */
const isShown = (m) => sameMoment(m, MINUTE_MS) && samePlace(m);

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
//
// The names used from here on, for the sun and then again for the moon and each star:
//
//   sub     the place on Earth it is directly overhead, from the almanac. Both models are given this.
//   obs     where the almanac puts it in the observer's sky: a bearing `az` and a height `el`, in degrees,
//           with the lift from the air in the height. This is the "Measured" column.
//   globe   where the globe model puts it, worked out from `sub` and the observer's place alone
//   flat    where the flat model puts it, from the same two things and the height it is set to
//   miss    the angle on the sky between a model's place for it and the almanac's ("Off by")

/** Whether the flat model's light is set to curve upward as it travels, so that its sun can set. */
const bentLight = () => state.flatLight === 'bent';

/**
 * The flat model's settings. Nothing in the model fixes any of them, so all of them are the user's to choose:
 * how high its sun and its stars are, how far its sun's light reaches, and whether that light curves.
 */
const flatParams = () => ({
  sunHeightKm: state.sunHeightKm,
  lightRangeKm: state.lightRangeKm,
  starHeightKm: state.starHeightKm,
  // With bending light the sun is seen on the horizon from exactly as far as its light reaches.
  bendSetKm: bentLight() ? state.lightRangeKm : 0,
});
/** How much the flat model's light curves, per km. The moon and the stars are seen by the same light as the sun. */
const flatBend = () => flatBendPerKm(flatParams());

// The air the measurement and both models are seen through: none, standard, or the user's own.
// All three get the same air, so the lift it gives cannot favour one of them.
function currentAir() {
  if (state.refraction === 'off') return null;
  if (state.refraction === 'custom') return { tempC: state.tempC, pressureHpa: state.pressureHpa };
  return STANDARD_AIR;
}
const airKey = () => (state.refraction === 'custom' ? `${state.tempC}|${state.pressureHpa}` : state.refraction);

/** Everything the sky tool shows, for the moment and the place that are set. */
function compute() {
  const { date, lat, lon } = state;
  const air = currentAir();
  // From the almanac: the place the sun is overhead, and where it stands in the observer's sky.
  const sub = subsolarPoint(date);
  const obs = observedSun(date, lat, lon, air);
  // From each model: where it says the sun should stand. Both are given `sub` and the observer's place, not `obs`.
  const globe = globePredict(sub, lat, lon, air);
  const flat = flatPredict(sub, lat, lon, flatParams(), air);
  // The same moment from each of the reference cities.
  const cities = REF_CITIES.map((city) => {
    const o = observedSun(date, city.lat, city.lon, air);
    const f = flatPredict(sub, city.lat, city.lon, flatParams(), air);
    return {
      ...city,
      obs: o,
      flat: f,
      miss: skySeparation(o, f),
      // The height the flat sun would have to be at for this city's measured height to come out right:
      //   H = d × tan(height)
      // with d the distance on the flat map from the city to the place under the sun. One sun has one
      // height, so on a flat earth every city would give the same figure. Null when the sun is not up
      // there, or when no height would do.
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
    ownLines: measurements.filter((m) => m.az !== null && sameMoment(m, 5 * MINUTE_MS)),
  };
}

// ---------- the moon ----------

// The published answer to "is there an eclipse now?" takes a search, so it is kept for the minute it was asked about.
const eclipseCache = { key: null, kind: 'none' };
function eclipseNow() {
  const key = Math.floor(state.date.getTime() / MINUTE_MS);
  if (eclipseCache.key !== key) Object.assign(eclipseCache, { key, kind: publishedEclipse(state.date) });
  return eclipseCache.kind;
}

// The moon is treated like the sun and the stars: both models are told the place it is overhead.
// The globe is also told its distance, which is close enough to matter.
function computeMoon(sub, sunObs, sunGlobe, sunFlat) {
  const { date, lat, lon } = state;
  const air = currentAir();
  // From the almanac: the place the moon is overhead (with its distance), and where it stands in the observer's sky.
  const point = moonPoint(date);
  // The flat model's moon is its sun's sum over again, with the moon's own height. It gives off no light of
  // its own to run out of reach, and is seen by light that curves as much as the sun's does.
  const dome = { sunHeightKm: state.moonHeightKm, lightRangeKm: Infinity, bendPerKm: flatBend() };
  const obs = observedMoon(date, lat, lon, air);
  const globe = globePredictNear(point, lat, lon, air);
  const flat = flatPredict(point, lat, lon, dome, air);
  // Where everything is in space, under each model, for working out what is lit and who sees which face.
  // On the globe (g) the sun and moon are at their published distances from the Earth's centre. On the
  // flat model (f) each is over the same place on the map, at the height it is set to. All in km.
  const g = { sun: globePlace(sub.lat, sub.lon, sub.distKm), moon: globePlace(point.lat, point.lon, point.distKm) };
  const f = { sun: flatPlace(sub.lat, sub.lon, state.sunHeightKm), moon: flatPlace(point.lat, point.lon, state.moonHeightKm) };
  const phase = moonPhase(date);
  const here = { globe: globePlace(lat, lon), flat: flatPlace(lat, lon) };
  const flatHeights = { sunHeightKm: state.sunHeightKm, moonHeightKm: state.moonHeightKm, bendPerKm: flatBend() };
  // During a published eclipse of the sun: the track of the middle of the shadow, as each model has it.
  // The sun and moon are within a couple of degrees of each other at any eclipse, so nothing is looked up otherwise.
  const eclipse = globeAngleDeg(sub.lat, sub.lon, point.lat, point.lon) < 3 ? publishedAt(date) : null;
  const track = eclipse && eclipse.lat !== null ? trackOf(eclipse) : null;
  return {
    point,
    obs,
    globe,
    flat,
    phase,
    // How much of the moon's face is lit. The almanac's figure, and then each model's own, from one rule
    // for a ball lit from one side, with only the positions differing:
    //   lit = (1 + cos(angle)) ÷ 2
    // where the angle is the one at the moon between the sun and the person looking.
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
    // An eclipse of the moon. `shadow` is the globe's own sum: whether the moon is inside the Earth's shadow.
    // `published` is what the almanac says is happening. The flat model has nothing to cast a shadow on its moon.
    shadow: earthShadow(sub, point),
    published: eclipseNow(),
    // An eclipse of the sun: how much of the sun the moon hides from here, and where the middle of its shadow falls.
    // Each is two discs on the sky, a bearing, a height and a width apiece, and the same sum for how far they overlap.
    // The flat model's moon hides nothing unless it is the nearer of the two to the observer.
    cover: {
      measured: sunCovered(sunObs, obs),
      globe: sunCovered(sunGlobe, globe),
      flat: sunCovered(sunFlat, flat, flat.slantKm < sunFlat.slantKm),
    },
    // Where the middle of the moon's shadow meets the ground: on the line from the sun through the moon, as each model has them.
    shade: {
      globe: moonShadowGlobe(sub, point),
      flat: moonShadowFlat(sub, point, flatHeights),
      bendPerKm: flatHeights.bendPerKm,
      path: track && {
        published: { lat: eclipse.lat, lon: eclipse.lon },
        globe: track.map((at) => at.globe.centre),
        flat: track.map((at) => flatCentre(at, flatHeights)),
      },
    },
    cities: REF_CITIES.map((place) => {
      const o = observedMoon(date, place.lat, place.lon, air);
      const fl = flatPredict(point, place.lat, place.lon, dome, air);
      return {
        ...place,
        obs: o,
        flat: fl,
        miss: skySeparation(o, fl),
        // The height this city's measurement would put the flat moon at, as for the sun in `compute`.
        implied: impliedSunHeightKm(point, place.lat, place.lon, o.el, { bendPerKm: flatBend() }),
        // How much of the moon's face each model has lit for someone in this city.
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

/** The moon's table: the almanac, then each model, and what each city sees of its face. */
function renderMoon(c) {
  const m = c.moon;
  $('moon-panel').hidden = !m;
  if (!m) return;
  const up = m.obs.el > 0;
  const height = heightOrBelow;
  // "Off by": the angle on the sky between where a model puts the moon and where the almanac does.
  const flatMiss = skySeparation(m.obs, m.flat);
  const globeMiss = skySeparation(m.obs, m.globe);
  // A share (of the face lit, of the sun hidden) is marked wrong when it is more than 5 points out.
  // A height or a bearing is marked wrong at more than 1°, and a width at more than 0.03°.
  const off = (a, b) => (Math.abs(a - b) > 0.05 ? 'bad' : '');
  const shadow = (kind) => (kind === 'none' ? 'no' : `yes, ${kind}`);
  // How much of the sun's disc the moon covers, for an eclipse of the sun.
  const hidden = (cover) => (cover.fraction <= 0 ? 'none' : cover.fraction >= 1 ? 'all' : `${clamp(Math.round(cover.fraction * 100), 1, 99)}%`);
  $('moon-compare').tBodies[0].innerHTML = `
    <tr><td>Elevation${infoButton('moon.position', 'where the moon is')}</td><td>${height(m.obs.el)}</td><td>${height(m.globe.el)}</td>
      <td class="${Math.abs(m.flat.el - m.obs.el) > 1 ? 'bad' : ''}">${deg(m.flat.el)}</td></tr>
    <tr class="brk"><td>Bearing</td><td>${bearing(m.obs.az)}</td><td>${bearing(m.globe.az)}</td>
      <td class="${Math.abs(wrap180(m.flat.az - m.obs.az)) > 1 ? 'bad' : ''}">${bearing(m.flat.az)}</td></tr>
    <tr><td>Width</td><td>${deg(m.obs.sizeDeg, 2)}</td><td>${deg(m.globe.sizeDeg, 2)}</td>
      <td class="${Math.abs(m.flat.sizeDeg - m.obs.sizeDeg) > 0.03 ? 'bad' : ''}">${deg(m.flat.sizeDeg, 2)}</td></tr>
    <tr><td>Face lit${infoButton('moon.phase', 'how much of the moon is lit')}</td><td>${percent(m.lit.measured)}</td>
      <td class="${off(m.lit.globe, m.lit.measured)}">${percent(m.lit.globe)}</td>
      <td class="${off(m.lit.flat, m.lit.measured)}">${percent(m.lit.flat)}</td></tr>
    <tr><td>In the Earth's shadow?${infoButton('moon.eclipse', 'eclipses of the moon')}</td><td>${shadow(m.published)}</td>
      <td class="${m.shadow.kind === m.published ? '' : 'bad'}">${shadow(m.shadow.kind)}</td>
      <td class="${m.published === 'none' ? '' : 'bad'}">cannot be</td></tr>
    <tr><td>Sun hidden by the moon${infoButton('moon.cover', 'eclipses of the sun')}</td><td>${hidden(m.cover.measured)}</td>
      <td class="${off(m.cover.globe.fraction, m.cover.measured.fraction)}">${hidden(m.cover.globe)}</td>
      <td class="${off(m.cover.flat.fraction, m.cover.measured.fraction)}">${hidden(m.cover.flat)}</td></tr>
    <tr><td>Off by</td><td class="dim">n/a</td><td class="${globeMiss > 1 ? 'bad' : 'good'}">${deg(globeMiss, 2)}</td>
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

// Every star is treated exactly like the sun: both models are told the point on
// Earth it is overhead, and each predicts where the observer should see it.

// A star's trail is where it has been over the last six hours, a point every ten minutes.
const TRAIL_STEPS = 36;
const TRAIL_STEP_MIN = 10;
// The flat model's stars are its sun's sum over again, all at one height of their own, seen from any distance.
const starDome = () => ({ sunHeightKm: state.starHeightKm, lightRangeKm: Infinity, bendPerKm: flatBend() });

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
    // The named stars are drawn already, so they are left out here. One is taken to be the same star when it
    // is within 0.05° north to south and 0.05° east to west on the sky (the cosine allows for the lines of
    // right ascension drawing together toward the poles).
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
  const day = Math.floor(date.getTime() / DAY_MS);
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
    // The place on Earth the star is overhead. Its latitude is the star's declination. Its longitude is
    // the star's right ascension less how far the sky has turned, both in hours, at 15° to the hour:
    //   longitude = (right ascension − sidereal time) × 15
    // Both models are then given that place, as they are for the sun.
    const overhead = { lat: star.dec, lon: wrap180((star.ra - turned) * 15), sizeDeg: 0 };
    globe[i] = globePredict(overhead, lat, lon, air);
    flat[i] = flatPredict(overhead, lat, lon, dome, air);
  }
  return { globe, flat, mags: starField.mags };
}

/** The named stars and the planets: the almanac's place for each, and each model's, with the chosen one seen from every city. */
function computeStars() {
  const { date, lat, lon } = state;
  const air = currentAir();
  const dome = starDome();
  // The named stars and then the planets, which are placed in each model's sky in just the same way.
  // `points` is the place on Earth each one is overhead at this moment, from the almanac.
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
        // Earlier on, the star stood over a point further east: the place under it moves west by a
        // quarter of a degree a minute (360.99° in 24 hours), on either model.
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

// The stars' score. Every named star from every reference city at one moment, counting only the stars that
// are above that city's horizon. The sky turns as a whole, so the result barely depends on which moment is used.
//
//   typical miss = √(average of miss²)     the miss being the angle between a model's place for a star and the almanac's
//
// `globeRms` is the globe's. `curve` is the flat model's at each of 61 heights for its stars from 100 km to
// 1,000,000 km, and `best` the lowest point on it: the height that suits the flat model best is found for it.
// As with the sun, the globe's figure is marked against the almanac and is true by construction.
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
/** The point half way along a path. */
const midPoint = (path) => path[path.length >> 1];

/**
 * The route on show: the shortest distance between its two places on each model, and the speed a flight of
 * known length would need to cover it.
 *
 *   speed = distance ÷ scheduled time
 *
 * The time is the average of the two directions, so that the wind helping one way and hindering the other
 * drops out. The times are from published timetables (docs/flight-times.md).
 */
function computeRoute() {
  if (!state.route) return null;
  const a = city(state.route.from);
  const b = city(state.route.to);
  if (!a || !b || a === b) return null;
  const preset = presetRoute(a.name, b.name);
  const hours = preset ? (preset.there + preset.back) / 2 : null;
  return { a, b, preset, ...routeStats(a, b, hours), path: greatCirclePath(a, b, 72) };
}

// The sun's score ("How well does each model fit?"). One day of hourly positions from every reference city,
// kept until the date, the air or the flat model's light changes.
//
// A sample is one city at one hour: where the sun is overhead then (`sub`) and where the almanac puts it in
// that city's sky (`obs`). Each model is asked for its own place for the sun from `sub` and the city alone.
//
//   miss         = the angle on the sky between the model's place and the almanac's
//   typical miss = √(average of miss²)     over the samples with the sun above the horizon
//
// Nights are left out of the typical miss. That helps the flat model, whose sun never goes below the
// horizon with straight light and would be far out all night.
//
// `globeRms` is the globe's typical miss. `curve` is the flat model's at each of 91 sun heights from 100 km
// to 1,000,000 km, and `best` is the lowest point on that curve. So the flat model is scored twice: at the
// height it is set to, and at the height that suits it best.
//
// The globe's figure is close to nothing, and that is true by construction: the almanac it is marked against
// rests on the same astronomy as the globe. It is not the evidence. What the score tests is the flat model.
const fitCache = { key: null };
function getFit() {
  // With curving light the best sun height depends on how far the light is said to reach, so that is part of the key.
  const key = `${isoDay(state.date)}|${airKey()}|${bentLight() ? state.lightRangeKm : 'straight'}`;
  if (fitCache.key !== key) {
    const air = currentAir();
    const day = Date.parse(`${isoDay(state.date)}T00:00:00Z`);
    const samples = [];
    for (let h = 0; h < 24; h++) {
      const t = new Date(day + h * HOUR_MS);
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
//
// Something of a known height, a known distance away, seen from an eye a known height above the water.
// The sums are in js/horizon.js (one figure k for how much the air bends light) and js/raytrace.js (light
// followed through layers of air). The same air is given to both models.

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
    // The same air and the same sizes for both. The only difference is whether the water curves.
    traceCache.value = {
      globe: traceView(air, { ...sizes, curved: true }),
      flat: traceView(air, { ...sizes, curved: false }),
    };
  }
  return traceCache.value;
}

/** Everything the horizon tool shows, for the sizes and the air that are set. */
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
      dipDeg: toDegrees(traced.globe.dipRad ?? 0),
      goneKm: null,
    });
  }
  return scene;
}

/**
 * How far the target is sent before it stops: a little past the point where the globe hides all of it.
 * That point is the eye's distance to its horizon and the distance from there at which the top of the target
 * meets the same horizon, added together:
 *
 *   gone = √(2 × R′ × eye height) + √(2 × R′ × target height)
 *
 * with R′ the Earth's radius as the bending of light makes it seem (js/horizon.js).
 */
function sailLimitKm() {
  const gone = horizonDistanceKm(state.eyeM, state.k) + horizonDistanceKm(state.targetM, state.k);
  return Number.isFinite(gone) ? Math.min(HZ_LIMITS.targetKm[1], gone * 1.06) : HZ_LIMITS.targetKm[1];
}

/** A distance this side of the horizon, where both models show the whole target. */
function nearKm() {
  const horizon = horizonDistanceKm(state.eyeM, state.k);
  return clamp(Number.isFinite(horizon) ? horizon * 0.5 : 2, HZ_LIMITS.targetKm[0], 5);
}

// A change of temperature with height is kept in °C per metre and shown per 100 m.
const perHundred = (lapse) => `${Math.abs(lapse * 100).toFixed(Math.abs(lapse * 100) < 10 ? 2 : 1)} °C`;

/** What a bending figure k means as weather: the air that would give it, and how usual that air is. */
function airInWords(k) {
  if (k <= 0) return 'No bending: light travels in straight lines.';
  const lapse = lapseForCoefficient(k);
  const air = `Air that gets ${perHundred(lapse)} ${lapse < 0 ? 'colder' : 'warmer'} for every 100 m of height.`;
  if (k >= 0.995) return `${air} Light follows the curve of the sea, so nothing is ever hidden. Rare, and it does not last.`;
  if (k > 0.22) return `${air} More bending than usual: warm air lying over colder, as over cold water on a still day.`;
  if (k < 0.1) return `${air} Less bending than usual.`;
  return `${air} ${Math.abs(k - K_STANDARD) < 0.006 ? 'This is the standard atmosphere.' : 'Close to the standard atmosphere.'}`;
}

/**
 * The horizon tool's tables. There is no "Measured" column here: the two columns are what each model says
 * should be seen, for the user to put beside what they see. With one bending for the whole path the flat
 * model hides nothing, has no horizon and no dip. With layers of air its figures come from the same tracing
 * as the globe's.
 */
function renderHorizon(hz) {
  const layered = !!hz.traced;
  const some = hz.hiddenM > 0;
  const all = hz.hiddenM >= hz.targetM;
  const far = Number.isFinite(hz.horizonKm);
  const flatSome = hz.flatHiddenM > 0;
  const amount = (m) => (m > 0 ? fmtH(m) : 'none');
  const flatHorizon = layered && hz.traced.flat.horizonKm !== null ? fmtD(hz.traced.flat.horizonKm) : 'no limit';
  const flatDip = layered ? toDegrees(hz.traced.flat.dipRad ?? 0) : 0;
  $('hz-table').tBodies[0].innerHTML = `
    <tr><td>Hidden from the bottom up${infoButton('hz.hidden', 'how much is hidden')}</td><td class="${some ? 'bad' : ''}">${amount(hz.hiddenM)}</td>
      <td class="${flatSome ? 'bad' : ''}">${amount(hz.flatHiddenM)}</td></tr>
    <tr><td>In view</td><td>${all ? 'none' : fmtH(hz.visibleM)}</td><td>${amount(hz.targetM - hz.flatHiddenM)}</td></tr>
    <tr><td>Distance to the horizon${infoButton('hz.horizon', 'distance to the horizon')}</td><td>${far ? fmtD(hz.horizonKm) : layered ? 'beyond it' : 'no limit'}</td><td>${flatHorizon}</td></tr>
    ${
      far && !layered && state.k !== 0
        ? `<tr><td>The same with no bending by the air</td><td>${fmtD(horizonDistanceKm(state.eyeM, 0))}</td><td>no limit</td></tr>`
        : ''
    }
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

/**
 * Two sunsets: watch the sun set lying down, stand up at once, and watch it set again. On the globe the
 * horizon is lower for the higher eye, by
 *
 *   dip = √(2 × eye height ÷ R′)
 *
 * so the sun has that much further to sink, at
 *
 *   15° an hour × √(cos² φ − sin² δ)     φ the observer's latitude, δ the latitude the sun is overhead
 *
 * On a flat surface the horizon is at eye level from any height, and there is no second sunset. A timing of
 * the user's own, turned round, gives the size of the Earth. The sums are in js/horizon.js.
 */
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

// An aircraft holding its height at a steady speed. On the globe it follows the ground round, so its nose
// comes down at the rate it goes round:
//
//   speed ÷ (R + height)     in radians an hour, with the speed in km/h and the lengths in km
//
// On the flat model it does not turn at all. The sums are in js/flight.js.

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

// What the user saw of something over water: how much of it was hidden, with the sizes it was seen at.
// js/observations.js works out what air each model would need for that, and main.js puts it into words.
const OBS_KEY = 'globedart.horizon';
let observations = [];

const saveObservations = () => remember(OBS_KEY, observations);

// Two sizes count as the same when they are within half a percent.
const sameSize = (a, b) => Math.abs(a - b) <= 0.005 * Math.max(a, b);
/** True when the drawings show the sizes this observation was made with. */
function obShown(o) {
  return sameSize(o.eyeM, state.eyeM) && sameSize(o.distanceKm, state.targetKm) && sameSize(o.targetM, state.targetM);
}

const gradient = (lapse) =>
  Math.abs(lapse * 100) < 0.005
    ? 'no colder or warmer for every 100 m of height'
    : `${perHundred(lapse)} ${lapse < 0 ? 'colder' : 'warmer'} for every 100 m of height`;

/**
 * What each model makes of one observation, in words. `s` is its score from js/observations.js: the bending
 * k and the change of temperature with height that the globe would need for what was seen, what kind of air
 * that is, and whether the flat model, which hides nothing, fits it.
 */
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

/** One end of a line of sight: a name and a place, and nothing else that came with it. */
const sightEnd = ({ name, lat, lon }) => ({ name, lat, lon });

/** Puts the horizon tool's line of sight between two places, if they are a distance apart that the tool can show. */
function setSight(from, to, waterM = 0) {
  const d = globeDistanceKm(from, to);
  const [least, most] = HZ_LIMITS.targetKm;
  if (!(d >= least && d <= most)) {
    toast(`Those places are ${fmtD(d)} apart. This tool shows from ${fmtD(least)} to ${fmtD(most)}.`);
    return false;
  }
  state.sight = { from: sightEnd(from), to: sightEnd(to), waterM };
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
  // The line's height above the sea at each point along the way, as the globe has it: the height of the
  // water there, and how far above the water the line of sight is (below zero where the sea is in the way).
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

function saveFile(name, text, type = 'application/vnd.google-earth.kml+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }));
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
    $('kml-section').scrollIntoView({ block: 'nearest', behavior: glide() });
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

/** The list of well-known long views (js/presets.js): picking one sets its sizes and its line on the map. */
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
    state.sight = { from: sightEnd(view.from), to: sightEnd(view.to), waterM: view.waterM };
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
  // The two heights must stay in order, the lower one below the higher.
  $('ss-low').addEventListener('change', (e) => {
    const v = Number(e.target.value) * heightUnit();
    if (e.target.value.trim() !== '' && v >= 0) Object.assign(state, { sunsetLowM: clamp(v, 0, state.sunsetHighM * 0.99), sunsetSeconds: null });
    e.target.value = tidy(heightNumber(state.sunsetLowM));
    requestUpdate();
  });
  $('ss-high').addEventListener('change', (e) => {
    const v = Number(e.target.value) * heightUnit();
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
      const amount = Number($('ob-amount').value) * heightUnit();
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

/** The middle of the night at the observer, so the real sky is dark: twelve hours on from the sun's highest. */
function goToMidnight() {
  const noon = sunEvents(state.date, state.lat, state.lon).noon ?? state.date;
  state.date = new Date(noon.getTime() + 12 * HOUR_MS);
}

const MOON_OFF = '<p>Turn on "Show the moon" in the panel on the left to carry on with this demonstration.</p>';
const STARS_OFF = '<p>Turn on "Show the stars" in the panel on the left to carry on with this demonstration.</p>';

// The arguments themselves live in js/arguments/, one file each. This is what they are handed: the state,
// ways to set the scene, and ways to write numbers. Each is also handed the result of `compute` (or of the
// horizon or flight tool), so what its text quotes is the same figure the tables show.
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

// A plain visit opens on the present moment. If it is night at the observer then, it opens on that day's noon
// instead, so that there is a sun for the two models to be checked against.
let openedAt = null;
function openInDaylight() {
  if (observedSun(state.date, state.lat, state.lon, currentAir()).el >= 0) return;
  const noon = sunEvents(state.date, state.lat, state.lon).noon;
  if (!noon) return;
  state.date = noon;
  openedAt = noon.getTime();
}

const INTRO = {
  title: 'How to use this',
  body: () => `
    ${
      openedAt === state.date.getTime()
        ? '<p>It is night where the observer is just now, so this has opened at noon today instead. "Now" goes to the present moment.</p>'
        : ''
    }
    <p><span class="on-wide">The left side is the globe model, the right side is the flat model. Both are shown the
    same moment and the same observer. Top row: the view from outside. Bottom row: what the observer should see in
    the sky.</span><span class="on-phone">The globe model is shown first and the flat model second, both at the same
    moment for the same observer. The two buttons above them choose what to look at: "From outside", or "Observer's
    sky" for what the observer should see.</span></p>
    <p>In the observer's sky the <b class="m">teal ring</b> marks where the sun is measured to be. A model is right
    when its sun sits inside the ring.</p>
    <p>"Measured" here means the published almanac figure, the one navigators and surveyors work from. This app
    takes no readings of its own. The almanac comes from the same picture of the sky as the globe model, so the
    globe agreeing with it is no surprise and is not the evidence. The evidence is that the almanac agrees with
    what anyone measures. "Your own measurements" lets you put a reading of yours against both models.</p>
    <p class="try">Take a tour, pick a demonstration above, or change the time, the place and the flat-model
    settings yourself. Drag any view to look around; scroll or pinch to zoom.</p>`,
};

const HORIZON_INTRO = {
  title: 'Over the horizon',
  body: (hz) => `
    <p>Something ${fmtH(hz.targetM)} tall, ${fmtD(hz.distanceKm)} away, seen by an eye ${fmtH(hz.eyeM)} above the
    water. <span class="on-wide">Top row: the scene from the side. Bottom row: what you would see through a
    telescope.</span><span class="on-phone">The two buttons above the views choose between the scene from the side
    and what you would see through a telescope.</span></p>
    <p>The globe says the sea hides it from the bottom up. The flat model says nothing can hide it, however far
    it goes.</p>
    <p class="try">Press "Send it away", or drag the distance and the height of your eye. Then change the air and
    see how much difference the weather can make.</p>`,
};

const FLIGHT_INTRO = {
  title: 'Level flight',
  body: (fl) => `
    <p>An aircraft at ${fmtSpeed(fl.speedKmh)}, holding its height. <span class="on-wide">Top row: one whole lap, speeded
    up. Bottom row: the next ${fmtTime(fl.minutes)} of flight, drawn to true scale.</span><span class="on-phone">The
    two buttons above the views choose between one whole lap, speeded up, and the next ${fmtTime(fl.minutes)} of
    flight, drawn to true scale.</span></p>
    <p>On the globe the nose comes down by ${fmtAngle(fl.rateDegPerMin)} a minute as the aircraft follows the
    ground round. On the flat model it never moves.</p>
    <p class="try">Press "Fly the lap", then change the speed and the length of the stretch.</p>`,
};

const SPACE_INTRO = {
  title: 'From space',
  body: () => `
    <p>The globe model's own picture, seen from outside: the Sun, the Earth and Moon, and the five planets the
    eye can see, each where the almanac puts it for the moment on show. Sizes and distances are to scale, which
    is why most of it is dots until you go close.</p>
    <p>There is no flat-model view to set beside this one. That model has no outside to stand in: its sun and
    moon circle a few thousand km above the map, and "Sun, stars, maps" shows that from above.</p>
    <p class="try">Press Play and choose how fast the time runs. Go to the Earth and watch it turn on its
    tilted axis. Go out to Mars and watch a year go by. Drag to look round, scroll or pinch to move in and out,
    and click a dot to go to it.</p>
    <p class="try">"Stay with" chooses the body the camera keeps beside as the time runs. Go out to Mars, stay
    with the Earth, and the Sun goes round it: the same motion, seen by a camera that is carried along. Tick
    "Move freely" to turn the camera and take it anywhere.</p>`,
};

// ---------- from space ----------

// The four tools. An argument can use the first three (TOOLS, in js/arguments/index.js); the view from space has none yet.
const MODES = [...TOOLS, 'space'];

// What the view from space can be pointed at: a body, and how far from its middle to stand, in km. `above` is
// how many degrees above the plane of the Earth's orbit to look from, where the look is of a whole orbit. `fit`
// backs off further on a narrow screen so that the orbit still fits across it.
const SPACE_LOOKS = [
  { id: 'earth', label: 'The Earth', body: 'Earth', km: 42000 },
  { id: 'earthmoon', label: 'The Earth and the Moon', body: 'Earth', km: 1.7e6, above: 30, fit: true },
  { id: 'moon', label: 'The Moon', body: 'Moon', km: 12000 },
  { id: 'sun', label: 'The Sun', body: 'Sun', km: 5e6 },
  { id: 'inner', label: 'Out to Mars', body: 'Sun', km: 1e9, above: 40, fit: true },
  { id: 'all', label: 'Out to Saturn', body: 'Sun', km: 6.2e9, above: 40, fit: true },
  { id: 'mercury', label: 'Mercury', body: 'Mercury', km: 16000 },
  { id: 'venus', label: 'Venus', body: 'Venus', km: 40000 },
  { id: 'mars', label: 'Mars', body: 'Mars', km: 22000 },
  { id: 'jupiter', label: 'Jupiter', body: 'Jupiter', km: 450000 },
  { id: 'saturn', label: 'Saturn', body: 'Saturn', km: 380000 },
];
const SPACE_LOOK = Object.fromEntries(SPACE_LOOKS.map((look) => [look.id, look]));

// How fast the time can be run, in minutes for each real second. Seen from space a day is a short time.
const SPEEDS = {
  sky: [[1, '1 min/sec'], [10, '10 min/sec'], [60, '1 hour/sec'], [360, '6 hours/sec']],
  space: [[10, '10 min/sec'], [60, '1 hour/sec'], [360, '6 hours/sec'], [1440, '1 day/sec'], [10080, '1 week/sec'], [43200, '30 days/sec']],
};
/** How fast the time runs in the tool on show. */
const clockSpeed = () => (state.mode === 'space' ? state.spaceSpeed : state.speed);
let speedsFor = null;
/** Offers the speeds that suit the tool on show. */
function fillSpeeds() {
  const key = state.mode === 'space' ? 'space' : 'sky';
  if (speedsFor !== key) {
    speedsFor = key;
    $('speed').innerHTML = SPEEDS[key].map(([minutes, label]) => `<option value="${minutes}">${label}</option>`).join('');
  }
  $('speed').value = String(clockSpeed());
}

// True once the camera has left the look last chosen: it has been moved freely, or told to stay with another
// body. The "Go to" list then shows no choice, so that choosing the same look again goes back to it.
let spaceAway = false;

/** A body's name as it is listed: "The Sun", "Mars". */
const bodyLabel = (name) => (['Sun', 'Earth', 'Moon'].includes(name) ? `The ${name}` : name);

/** How to get about in the view from space, for each of the camera's two ways of moving. */
const SPACE_HINTS = {
  circle: 'Drag to look round. Scroll or pinch to move in and out. Click a dot to go to it.',
  free: 'Drag to turn. Drag with the right mouse button to take hold of a body and turn it any way: you go round it. Scroll or pinch to go towards whatever is under the pointer, or back from it. Hold a button on the view to move, or use the keys W, A, S and D, with E for up and Q for down. Shift goes three times as fast. You slow down as you come near something.',
};

/**
 * Points the view from space at whatever `state.spaceLook` names, from that look's own distance. The camera
 * then stays with that look's body, unless `stay` names another, as a link can.
 */
function applySpaceLook(stay = null) {
  const look = SPACE_LOOK[state.spaceLook] ?? SPACE_LOOKS[0];
  state.spaceStay = stay ?? look.body;
  spaceAway = state.spaceStay !== look.body;
  if (!spaceView) return;
  spaceView.setFree(state.spaceFree);
  spaceView.go(look.body, look.km, { aboveDeg: look.above ?? null, fit: !!look.fit });
  spaceView.stayWith(state.spaceStay);
}

/** Called when the camera in the view from space is turned or moved freely: it is no longer at the look last chosen. */
function leaveSpaceLook() {
  if (spaceAway) return;
  spaceAway = true;
  $('sp-look').value = '';
}

/** A click on a body's dot in the view from space goes to that body. */
function goToBody(name) {
  state.spaceLook = name.toLowerCase();
  applySpaceLook();
  requestUpdate();
}

/** The figures beside the view from space. All are the almanac's, read off the same places the view draws. */
function renderSpace(sp) {
  const phase = moonPhase(sp.date);
  const rows = [
    ['The Earth to the Sun', spaceDistance(sp.sun.distKm)],
    ["The Earth's speed round the Sun", `${sp.earthKmPerSec.toFixed(1)} km a second`],
    ['The Earth to the Moon', spaceDistance(sp.moon.distKm)],
    ["The Moon's speed round the Earth", `${sp.moonKmPerSec.toFixed(2)} km a second`],
    ['The Sun is overhead at', where(sp.sun.lat, sp.sun.lon)],
    ['The Moon is overhead at', where(sp.moon.lat, sp.moon.lon)],
    ["The Earth's axis leans over by", deg(sp.axisTiltDeg)],
    ['Moon lit, seen from the Earth', `${percent(phase.fraction)}, ${phase.waxing ? 'growing' : 'shrinking'}`],
  ];
  const html = rows.map(([name, value]) => `<tr><td>${name}</td><td>${value}</td></tr>`).join('');
  const body = $('sp-table').tBodies[0];
  if (body.innerHTML !== html) body.innerHTML = html;
  $('sp-note').textContent =
    'These are the almanac\'s figures. "Sun, stars, maps" takes where the sun and moon are overhead from the same almanac, and the checks hold the two together.';
}

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

// ---------- moving about the page ----------

// Someone who has asked their device for less motion gets no gliding and nothing that starts moving by itself.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const glide = () => (calm.matches ? 'auto' : 'smooth');
// One column, with the views pinned at the top.
const phone = window.matchMedia('(max-width: 720px)');

/** On a phone, brings the explanation up to sit just beneath the pinned views, once it has been redrawn. */
function cardIntoView() {
  if (!phone.matches) return;
  requestAnimationFrame(() => requestAnimationFrame(() => $('demo-card').scrollIntoView({ block: 'start', behavior: glide() })));
}

// A section of settings or results folds away under its heading. What is folded is remembered on this device.
const FOLD_KEY = 'globedart.folded';
const FOLDED_AT_FIRST = ['Display', 'Google Earth'];
// Each sidebar can also be tucked away at its edge of the screen, where the sidebars sit beside the views.
const TUCK_KEY = 'globedart.tucked';
const SIDE_NAMES = { controls: 'settings', results: 'results' };
const folds = []; // { section, key, set } for every section that folds

function recall(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    // Storage can be unavailable. Then nothing is remembered.
    return {};
  }
}
function remember(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered, then.
  }
}

/** The sections of a sidebar that fold and are on show with the present tool. */
const foldsOf = (side) => folds.filter((f) => f.section.closest('aside').id === side && getComputedStyle(f.section).display !== 'none');

/** Tucks a sidebar away at its edge of the screen, or brings it back. */
function setTucked(side, tucked) {
  if (document.body.classList.contains(`tuck-${side}`) === tucked) return;
  document.body.classList.toggle(`tuck-${side}`, tucked);
  remember(TUCK_KEY, { ...recall(TUCK_KEY), [side]: tucked });
  requestUpdate();
}

/** Keeps the buttons at the top of each sidebar saying what they will do. */
function syncSides() {
  for (const head of document.querySelectorAll('.side-head')) {
    const side = head.dataset.side;
    const shown = foldsOf(side);
    head.querySelector('.side-all').textContent = shown.length && shown.every((f) => f.section.classList.contains('folded')) ? 'Expand all' : 'Collapse all';
    const tucked = document.body.classList.contains(`tuck-${side}`);
    const tuck = head.querySelector('.side-tuck');
    tuck.setAttribute('aria-expanded', String(!tucked));
    tuck.setAttribute('aria-label', `${tucked ? 'Show' : 'Hide'} the ${SIDE_NAMES[side]}`);
    tuck.title = tucked ? `Show the ${SIDE_NAMES[side]}` : `Hide the ${SIDE_NAMES[side]}, to give the views more room`;
    tuck.querySelector('.side-word').textContent = tucked ? SIDE_NAMES[side] : 'Hide';
    // The arrow points the way the sidebar will go: off to its edge, or back in from it.
    tuck.querySelector('.side-arrow').textContent = (side === 'controls') === tucked ? '»' : '«';
  }
}

function bindFolds() {
  const stored = recall(FOLD_KEY);
  for (const section of document.querySelectorAll('aside section')) {
    const heading = section.querySelector(':scope > h2');
    if (!heading || section.id === 'demo-card') continue;
    // The words of the heading become the button. Its "i" stays beside it.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fold';
    for (const node of [...heading.childNodes]) {
      if (!(node.nodeType === 1 && node.classList.contains('info'))) button.append(node);
    }
    heading.prepend(button);
    const key = section.id || button.textContent.replace(/[\d:]/g, '').trim();
    const set = (folded) => {
      section.classList.toggle('folded', folded);
      button.setAttribute('aria-expanded', String(!folded));
    };
    set(stored[key] ?? FOLDED_AT_FIRST.includes(key));
    folds.push({ section, key, set });
    button.addEventListener('click', () => {
      const folded = !section.classList.contains('folded');
      set(folded);
      stored[key] = folded;
      remember(FOLD_KEY, stored);
      requestUpdate();
    });
  }
  const tucked = recall(TUCK_KEY);
  for (const head of document.querySelectorAll('.side-head')) {
    const side = head.dataset.side;
    document.body.classList.toggle(`tuck-${side}`, tucked[side] === true);
    // Folds every section on show in this sidebar, or unfolds them all if they are all folded already.
    head.querySelector('.side-all').addEventListener('click', () => {
      const shown = foldsOf(side);
      const fold = !shown.every((f) => f.section.classList.contains('folded'));
      for (const f of shown) {
        f.set(fold);
        stored[f.key] = fold;
      }
      remember(FOLD_KEY, stored);
      requestUpdate();
    });
    head.querySelector('.side-tuck').addEventListener('click', () => setTucked(side, !document.body.classList.contains(`tuck-${side}`)));
  }
  syncSides();
  for (const btn of document.querySelectorAll('#jump button')) {
    btn.addEventListener('click', () => {
      const all = document.querySelectorAll(btn.dataset.jump === 'controls' ? '#controls > *' : '#results > :not(#demo-card, #jump)');
      [...all].find((s) => s.offsetParent)?.scrollIntoView({ block: 'start', behavior: glide() });
    });
  }
  $('btn-reset').addEventListener('click', () => {
    // Without the part after the #, the page loads afresh as a plain visit.
    location.href = location.pathname;
  });
}

// ---------- the guided tour ----------
//
// A tour is a list of demonstrations taken in order. Each step opens on a question and waits; "Show what
// each model says" then sets the scene and gives the answer. The tours are listed in js/arguments/index.js, and one more can
// be put together by the user.

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
    // The steps in the order they will be shown, each with a pair of buttons to move it.
    const last = state.ownTour.length - 1;
    const order = state.ownTour
      .map((id, i) => {
        const name = esc(DEMOS[id].label);
        return `<li><span>${name}</span>
          <button data-move="${id}:-1" aria-label="Move ${name} earlier" title="Earlier"${i === 0 ? ' disabled' : ''}>↑</button>
          <button data-move="${id}:1" aria-label="Move ${name} later" title="Later"${i === last ? ' disabled' : ''}>↓</button></li>`;
      })
      .join('');
    return `
    <p>Tick the arguments to walk through, up to ${MAX_TOUR_STEPS}. Each one ticked joins the end of the list beneath,
    where the arrows change the order. Once the tour is running, "Copy link to this view" gives a link that carries
    your choice and its order.</p>
    ${groups}
    ${order ? `<p class="pick-order-name">Your tour, in order</p><ol class="pick-order">${order}</ol>` : ''}
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
  Object.assign(state, { demo: id, playing: false, sailing: false, flying: false, picking: false, route: null });
  state.own = defaultsFor(DEMOS[id]);
  setTucked('results', false); // the explanation is in that sidebar
  DEMOS[id].apply(app, state.own);
  // A scene that would start moving by itself waits for its button instead.
  if (calm.matches) Object.assign(state, { sailing: false, flying: false });
  setMode(DEMOS[id].tool);
  setPair(DEMOS[id].pair);
  requestUpdate();
}

/** Moves the tour to a step. The step opens on its question; the views are left as they were until it is answered. */
function tourGo(step, id = state.tour?.id ?? TOURS[0].id) {
  state.tour = { id, step: 0, shown: false };
  state.tour.step = clamp(step, 0, tourSteps().length);
  setTucked('results', false); // the tour's questions are in that sidebar
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
  setTucked('results', false);
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
  // Opening the argument put its controls back to the start. The link may say otherwise, and a control that
  // sets the scene has to set it again.
  if (state.demo) {
    state.own = decodeOwn(DEMOS[state.demo], own);
    if (controlsOf(DEMOS[state.demo]).some((control) => control.sets)) DEMOS[state.demo].apply(app, state.own);
  }
}

// The explanation is only rewritten when it changes, so that what is in it can be clicked and selected.
let demoBodyHtml = null;
function setDemoBody(html) {
  if (html === demoBodyHtml) return;
  demoBodyHtml = html;
  const body = $('demo-body');
  const held = body.contains(document.activeElement) ? document.activeElement.dataset : {};
  const [ticked, moved] = [held.pick, held.move];
  body.innerHTML = html;
  if (ticked) body.querySelector(`[data-pick="${ticked}"]`)?.focus();
  if (moved) {
    // The button that moved a step goes with it. At the end of the list it is switched off, and its partner takes over.
    const [id, by] = moved.split(':');
    const again = body.querySelector(`[data-move="${moved}"]`);
    (again && !again.disabled ? again : body.querySelector(`[data-move="${id}:${-Number(by)}"]`))?.focus();
  }
}

/** An argument can draw a picture of its own. It goes above the explanation and is redrawn with it. */
function renderDemoDrawing(argument, data, own) {
  const canvas = $('demo-canvas');
  canvas.hidden = !argument?.draw;
  if (canvas.hidden) return;
  canvas.setAttribute('aria-label', `Drawing for "${argument.label}". The text beneath it gives the same result in words.`);
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

// ---------- views and the update ----------
//
// Nothing is redrawn when a setting changes. The change is noted with `requestUpdate`, and the loop in
// `start` calls `update` once before the next frame is drawn. `update` works everything out afresh from
// the state, hands the result to the views and writes the tables.

// The four views of the sky tool: each model from outside, and each model's sky as the observer has it.
let globeView;
let flatView;
let globeSky;
let flatSky;
let hzViews = []; // the horizon tool's four
let flViews = []; // the flight tool's four
let spaceView = null; // the view from space, made the first time it is asked for
let landPicture = null; // the picture of the land that the outside views share
let needsUpdate = true;
let hashTimer = null;
let hashWrittenAt = 0; // when the link was last rewritten
// What the link last read said about the views, to be put in place once the views are there: which pair is
// on show, where the observer's sky looks when it follows nothing, and whether the link carried everything.
let linkPair = null;
let linkLook = null;
let linkFull = false;
let linkLayout = null; // { tucked, folded }: the sidebars as the link has them, or null if it says nothing
// The two pairs of views the sun-and-stars tool can show.
const PAIRS = ['outside', 'sky'];
/** The pair on show before anyone chooses: the demonstration's own, or the views from outside. */
const startingPair = () => (state.demo ? (DEMOS[state.demo].pair ?? PAIRS[0]) : PAIRS[0]);
// The boxes of "Work it out from the weather", in the horizon tool.
const WEATHER_INPUTS = ['hz-w-temp', 'hz-w-pressure', 'hz-w-lapse'];

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

// The kind of country the observer is in. Looking it up means going through the map, so it is kept until they move.
const sceneryKept = { key: null, kind: 'field' };
function sceneryHere() {
  const key = `${state.lat.toFixed(2)} ${state.lon.toFixed(2)}`;
  if (sceneryKept.key !== key) Object.assign(sceneryKept, { key, kind: sceneryAt(app.land, state.lat, state.lon) });
  return sceneryKept.kind;
}

function setLook(look) {
  globeSky.setLook(look);
  flatSky.setLook(look);
}

// How far below the horizon the bottom of the observer's sky reaches when it follows something: enough ground
// to stand on, and more of it when what is followed is low.
const groundInView = (top) => 14 + 6 * (1 - clamp(top / 30, 0, 1));

/**
 * Where the two skies look when they follow something: the sun, or the chosen star when the stars are on, or
 * the moon when it is. Both skies are turned the same way, so that they can be compared side by side. This
 * only aims the camera. It changes no figure.
 */
function followLook(c) {
  const s = c.stars;
  const obs = c.moon ? c.moon.obs : s ? s.measured[s.selected] : c.obs;
  const flat = c.moon ? c.moon.flat : s ? s.flat[s.selected] : c.flat;
  // Where it is measured and where the flat model puts it are both kept in view while they are within 90° of
  // each other round the horizon: the view looks half way between. Further apart the view comes round to the
  // measured one alone, little by little, and is there by 150°. `both` is how far it is still looking at both:
  //
  //   n = (150 − the angle between them) ÷ 60, held between 0 and 1          both = n² × (3 − 2n)
  //
  // A sudden change at one angle would make the view jump as the two drew apart, as they do where the sun
  // goes all the way round the sky.
  const diff = wrap180(flat.az - obs.az);
  const near = clamp((150 - Math.abs(diff)) / 60, 0, 1);
  const both = near * near * (3 - 2 * near);
  const az = obs.az + (diff / 2) * both;
  const alone = Math.max(obs.el, 0);
  const top = alone + (Math.max(obs.el, flat.el, 0) - alone) * both;
  const aspect = globeSky.width / globeSky.height;
  const ground = groundInView(top);
  // The share of the view's height that the title and the readout cover, which what is followed has to clear.
  const covered = Math.min(0.42, (Math.max(globeSky.coveredTop(), flatSky.coveredTop()) + 14) / globeSky.height);
  const fov = clamp(Math.max(58, (top + ground + 2) / (1 - covered), (both * (Math.abs(diff) + 26)) / aspect), 58, 92);
  // Keep that much ground in view unless it would push what is followed up under the readout.
  return { az, pitch: clamp(Math.max(fov / 2 - ground, top + 2 + (covered - 0.5) * fov), -10, 82), fov };
}

/** What every tool does last: the explanation, the workings behind the "i" buttons, the settings, and the link. */
function finishUpdate(data) {
  renderDemo(data);
  showWorkings(data);
  syncInputs();
  // The link is rewritten a moment after things stop changing, not on every frame of a drag. While the time or
  // the lap is running nothing stops changing, so then it is rewritten once a second all the same.
  clearTimeout(hashTimer);
  if ((state.playing || state.flying) && performance.now() - hashWrittenAt > 1000) writeHash();
  else hashTimer = setTimeout(writeHash, 300);
}

/** One pass from the state to the screen, for whichever tool is on show. */
function update() {
  $('views').dataset.mode = state.mode;
  document.body.dataset.mode = state.mode;
  applyPanes();
  if (state.mode === 'space') {
    const sp = spaceScene(state.date);
    if (!spaceView) {
      // Made the first time it is wanted: a fifth 3D picture is not worth starting for someone who never opens it.
      spaceView = new SpaceView($('space-view'), app.land, landPicture, { onGo: goToBody, onMove: leaveSpaceLook, readout: $('space-readout') });
      spaceView.resize();
      spaceView.update(state, sp);
      // A link may have asked for a body to stay with that is not the one its look is of.
      applySpaceLook(state.spaceStay);
      if ((SPACE_LOOK[state.spaceLook] ?? SPACE_LOOKS[0]).body === 'Earth' && state.spaceStay === 'Earth') spaceView.faceDaySide();
    }
    spaceView.update(state, sp);
    renderSpace(sp);
    finishUpdate(sp);
    return;
  }
  if (state.mode === 'flight') {
    const fl = computeFlight();
    for (const v of flViews) v.update(fl);
    renderFlight(fl);
    finishUpdate(fl);
    return;
  }
  if (state.mode === 'horizon') {
    const hz = computeHorizon();
    for (const v of hzViews) v.update(hz);
    renderHorizon(hz);
    renderObservations();
    renderSunsets(hz);
    finishUpdate(hz);
    return;
  }
  // The sky tool. `c` holds the almanac's figures and both models' for this moment; all that follows shows them.
  const c = compute();
  globeView.update(state, c);
  flatView.update(state, c);
  globeSky.setGrid(state.skyGrid);
  flatSky.setGrid(state.skyGrid);
  // The ground under the observer's sky suits the place: a field, a desert, snow, the sea.
  const scenery = sceneryHere();
  globeSky.setPlace(scenery);
  flatSky.setPlace(scenery);

  // The lines of words in the corner of each sky: what that model says, in its own figures.
  const flatMiss = skySeparation(c.obs, c.flat);
  let globeText = sunUp(c.globe)
    ? `Sun ${sunHeightText(c.globe.el)}, bearing ${bearing(c.globe.az)}\nWidth ${deg(c.globe.sizeDeg, 2)}`
    : `Sun is ${deg(-c.globe.el)} below the horizon\nIt has set: the ground is in the way`;
  // With straight light the flat sun is always above the horizon. With bending light it can set.
  const flatSet = !sunUp(c.flat);
  let flatText =
    (flatSet
      ? `Sun is ${deg(-c.flat.el)} below the horizon, bearing ${bearing(c.flat.az)}\n`
      : `Sun ${sunHeightText(c.flat.el)}, bearing ${bearing(c.flat.az)}\n`) +
    `Width ${deg(c.flat.sizeDeg, 2)}, and ${deg(flatMiss)} from where it is measured` +
    (flatSet ? '\nIt has set: its light curves away overhead' : c.flat.lit ? '' : '\nOut of its light: by this model it is dark here, with the sun still up');
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
    m && { model: m[key], measured: m.obs, lit: m.lit[key], side: m.side[key], shadow: key === 'globe' ? m.shadow : null, cover: m.cover[key].fraction };
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
  // After the readouts are written, because where to look depends on how much of the view they cover.
  if (state.follow) setLook(followLook(c));
  const views = $('views');
  views.classList.toggle('has-own', c.ownLines.length > 0);
  views.classList.toggle('has-route', !!c.route);
  views.classList.toggle('has-stars', !!s);
  views.classList.toggle('has-moon', !!m);
  for (const el of document.querySelectorAll('.sight-name')) el.textContent = c.sight.name;

  renderCompare(c, flatMiss);
  const routeMiddle = c.route && midPoint(c.route.path);
  $('earth-link').href = c.route
    ? earthUrl(routeMiddle.lat, routeMiddle.lon, c.route.globeKm * 1.6)
    : earthUrl(state.lat, state.lon, 1500);
  $('earth-link').textContent = c.route ? 'Open this route in Google Earth' : 'Open this place in Google Earth';
  renderOwn();
  renderFit();
  renderCities(c);
  renderStars(c);
  renderMoon(c);
  renderRoutes(c);
  finishUpdate(c);
}

// ---------- result panels ----------
//
// The tables. In each, the first column of figures is the almanac's ("Measured"), the second the globe
// model's and the third the flat model's. A model's figure is coloured as wrong when it is further from the
// almanac's than the table's allowance: 1° for a height, a bearing or a miss at the observer, 0.03° for a
// width, 2° in the tables of cities.

/**
 * The row about the air. The lift the air really gives at this height (worked out once, in
 * js/refraction.js, and added to the almanac and to both models alike), and the lift each model would need
 * for its plain geometry to land on the measurement:
 *
 *   needs = measured height − the model's height by geometry alone
 *
 * A model fits when what it needs is within 0.1° of what the air gives.
 */
function bendingRow(obs, globe, flat, extra = '') {
  // Which way the air would have to move it is always said: up is a lift, down is the opposite.
  const show = (x, d) => (Math.abs(x) < 0.005 ? 'none' : `${deg(Math.abs(x), d)} ${x < 0 ? 'down' : 'up'}`);
  const fits = (x) => (Math.abs(x - obs.lift) <= 0.1 ? 'good' : 'bad');
  const need = (x, d) => (Math.abs(x) < 0.005 ? 'needs none' : `needs ${show(x, d)}`);
  // Well below the horizon the ground is in the way and "lift" stops meaning anything.
  const hidden = obs.el < -1;
  const real = hidden ? '<td class="dim">n/a</td>' : `<td>${show(obs.lift, 2)}</td>`;
  const globeNeed = obs.el - globe.trueEl;
  const flatNeed = obs.el - flat.trueEl;
  // One row, two questions: how much the air really lifts the sun, and how much each model would need it to.
  return `<tr class="brk"><td>Bending by the air: the real amount, and what each model needs${extra}</td>${real}
    ${hidden ? '<td class="dim">n/a</td>' : `<td class="${fits(globeNeed)}">${need(globeNeed, 2)}</td>`}
    <td class="${fits(flatNeed)}">${need(flatNeed, 1)}</td></tr>`;
}

/**
 * The main table: the sun at the observer. `c.obs` is the almanac's, `c.globe` and `c.flat` each model's own.
 * "Off by" is the angle on the sky between a model's sun and the almanac's:
 *
 *   acos(sin e₁ sin e₂ + cos e₁ cos e₂ cos(bearing₁ − bearing₂))     e the two heights
 *
 * The globe's column agrees with the almanac's because the almanac rests on the same astronomy. That is
 * true by construction and is not the evidence. The column to read is the flat model's.
 */
function renderCompare(c, flatMiss) {
  const globeMiss = skySeparation(c.obs, c.globe);
  const cls = (miss) => (miss > 1 ? 'bad' : 'good');
  const up = sunUp(c.obs);
  $('compare').tBodies[0].innerHTML = `
    <tr><td>Elevation${infoButton('sky.elevation', 'elevation')}</td><td>${deg(c.obs.el)}</td><td>${deg(c.globe.el)}</td>
      <td class="${Math.abs(c.flat.el - c.obs.el) > 1 ? 'bad' : ''}">${deg(c.flat.el)}</td></tr>
    <tr class="brk"><td>Bearing${infoButton('sky.bearing', 'bearing')}</td><td>${bearing(c.obs.az)}</td><td>${bearing(c.globe.az)}</td>
      <td class="${Math.abs(wrap180(c.flat.az - c.obs.az)) > 1 ? 'bad' : ''}">${bearing(c.flat.az)}</td></tr>
    <tr><td>Sun's width${infoButton('sky.width', 'width of the sun')}</td><td>${deg(c.obs.sizeDeg, 2)}</td><td>${deg(c.globe.sizeDeg, 2)}</td>
      <td class="${Math.abs(c.flat.sizeDeg - c.obs.sizeDeg) > 0.03 ? 'bad' : ''}">${deg(c.flat.sizeDeg, 2)}</td></tr>
    <tr class="brk"><td>Sun visible?</td><td>${up ? 'yes' : 'no, set'}</td><td>${sunUp(c.globe) ? 'yes' : 'no, set'}</td>
      <td class="${up === (sunUp(c.flat) && c.flat.lit) ? '' : 'bad'}">${
        !sunUp(c.flat) ? 'no, set' : c.flat.lit ? 'yes' : `no: out of its light, ${deg(c.flat.el, 0)} up`
      }</td></tr>
    <tr><td>Off by${infoButton('sky.miss', 'how far off each model is')}</td><td class="dim">n/a</td><td class="${cls(globeMiss)}">${deg(globeMiss, 2)}</td>
      <td class="${cls(flatMiss)}">${deg(flatMiss, 1)}</td></tr>
    ${bendingRow(c.obs, c.globe, c.flat, infoButton('sky.lift', 'lift from the air'))}`;
}

// The user's own measurements, each put against both models. Here the "You" column is a real reading and
// not the almanac, so this is the panel where the globe can be wrong: both models are marked the same way,
// by how far their place for the sun or star is from the one the user measured. The flat model is given
// every chance: the height that fits the user's readings best is found for it (js/measurements.js).
//
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

/** One bar of a score: a typical miss in degrees, drawn against a full width of `max` degrees. */
function bar(label, value, color, max = 60) {
  const pct = value === null ? 0 : clamp((value / max) * 100, 0, 100);
  const text = value === null ? 'n/a' : deg(value, value < 1 ? 2 : 1);
  return `<div class="bar-row"><span>${label}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="bar-value">${text}</span></div>`;
}

/**
 * The score panel. Three bars, each a typical miss over the samples described at `getFit`:
 *
 *   Globe          the globe model
 *   Flat, as set   the flat model with its sun at the height that is set
 *   Flat, best     the flat model with its sun at whichever height misses least
 *
 * and under them a count of day and night. For every city-hour of the day, nights included, the almanac
 * says whether the sun is up, and each model is asked the same thing:
 *
 *   globe   the sun is up when its height is above the line for sunrise and sunset
 *   flat    the same, and the city must also be within reach of its sun's light
 *
 * A model is right for a city-hour when its answer is the almanac's.
 *
 * The globe's two figures are true by construction: what counts as right, and which hours are night, come
 * from the almanac, which rests on the same astronomy as the globe. They are not the evidence. What this
 * panel tests is whether any height at all lets the flat model match.
 */
function renderFit() {
  const fit = getFit();
  const air = currentAir();
  // The flat model's typical miss with its sun where it is set now.
  const current = rmsMiss(fit.samples, (s, lat, lon) => flatPredict(s, lat, lon, flatParams(), air));
  $('fit-scope').textContent = `Typical miss: ${REF_CITIES.length} cities, every hour of ${isoDay(state.date)}, daytime only. Leaving the nights out helps the flat model.`;
  // Day or night: each model is also asked, for every one of those hours, whether the sun can be seen at all.
  const tally = { all: fit.samples.length, globe: 0, flat: 0 };
  for (const s of fit.samples) {
    const real = sunUp(s.obs);
    const f = flatPredict(s.sub, s.lat, s.lon, flatParams(), air);
    if (sunUp(globePredict(s.sub, s.lat, s.lon, air)) === real) tally.globe++;
    if ((sunUp(f) && f.lit) === real) tally.flat++;
  }
  $('fit-bars').innerHTML =
    bar('Globe', fit.globeRms, 'var(--globe)') +
    bar('Flat, as set', current, 'var(--flat)') +
    bar('Flat, best', fit.best?.rms ?? null, 'var(--flat)');
  $('fit-note').textContent =
    (fit.best
      ? `No sun height gets the flat model closer than ${deg(fit.best.rms)} ` +
        `(at ${km(fit.best.heightKm)}${bentLight() ? ', with its light curving as set' : ''}). For scale, the sun itself is about 0.5° wide. `
      : '') +
    `Day or night: of the ${tally.all} city-hours, the globe has the sun up or down rightly in ${tally.globe}. ` +
    `The flat model, going by ${bentLight() ? 'where its curving light lets the sun set' : 'how far its light reaches'}, is right in ${tally.flat}. ` +
    // The globe is being marked against the almanac here, as it is in the table at the observer.
    `The globe's two figures are true by construction: what counts as right, and which hours are night, come from the almanac, which rests on the same astronomy as the globe. They are not the evidence. What this panel tests is the flat model.`;
  drawFitChart(fit, current);
}

/**
 * The chart under the bars: the typical miss (up the side, in degrees) against the height of the flat
 * model's sun (along the bottom, in km, each mark ten times the one before). The amber curve is the flat
 * model at every height tried, the dot is the height that is set, and the blue line is the globe.
 */
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

// The height a city's measurement would put the flat sun at. With curving light there are cities that see the
// sun from beyond the distance its light is said to reach, and then no height at all would do.
const impliedText = (heightKm) => (heightKm === null ? 'none works' : km(heightKm));

/**
 * The same moment from every reference city: the sun's height as measured there, the height the flat model
 * gives it, and the height the flat sun would have to be at for that city's measurement to come out right
 * (H = d × tan(height), see `compute`). One sun can only be at one height, so the last column is the test:
 * on a flat earth every row of it would read the same.
 */
function renderCities(c) {
  const rows = c.cities.map((x) => {
    const day = x.obs.el > 0;
    return `<tr><td>${x.name}</td>
      <td class="${day ? '' : 'dim'}">${day ? deg(x.obs.el) : 'night'}</td>
      <td class="${x.miss > 2 ? 'bad' : ''}">${deg(x.flat.el)}</td>
      <td class="${day ? (x.implied === null ? 'bad' : '') : 'dim'}">${day ? impliedText(x.implied) : 'n/a'}</td></tr>`;
  });
  $('city-table').tBodies[0].innerHTML = rows.join('');
}

/** The chosen star's tables: the same three columns as for the sun, its score, and the same star from every city. */
function renderStars(c) {
  const s = c.stars;
  $('stars-panel').hidden = !s;
  if (!s) return;
  const i = s.selected;
  const obs = s.measured[i]; // the almanac's
  const g = s.globe[i];
  const f = s.flat[i];
  const miss = skySeparation(obs, f);
  const globeMiss = skySeparation(obs, g);
  const up = obs.el > 0;
  const height = heightOrBelow;
  $('star-name').textContent = s.name;
  $('star-compare').tBodies[0].innerHTML = `
    <tr><td>Elevation</td><td>${height(obs.el)}</td><td>${height(g.el)}</td>
      <td class="${Math.abs(f.el - obs.el) > 1 ? 'bad' : ''}">${deg(f.el)}</td></tr>
    <tr class="brk"><td>Bearing</td><td>${bearing(obs.az)}</td><td>${bearing(g.az)}</td>
      <td class="${Math.abs(wrap180(f.az - obs.az)) > 1 ? 'bad' : ''}">${bearing(f.az)}</td></tr>
    <tr><td>Above the horizon?</td><td>${up ? 'yes' : 'no'}</td><td>${g.el > 0 ? 'yes' : 'no'}</td>
      <td class="${up ? '' : 'bad'}">yes</td></tr>
    <tr><td>Off by</td><td class="dim">n/a</td><td class="${globeMiss > 1 ? 'bad' : 'good'}">${deg(globeMiss, 2)}</td>
      <td class="${miss > 1 ? 'bad' : 'good'}">${deg(miss, 1)}</td></tr>
    ${bendingRow(obs, g, f)}`;

  // The stars' score (see `getStarFit`), with the flat model's stars at the height that is set.
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
        <td class="${seen ? (x.implied === null ? 'bad' : '') : 'dim'}">${seen ? impliedText(x.implied) : 'n/a'}</td></tr>`;
    })
    .join('');
}

// The table of routes. Nothing here comes from the almanac. Each model gives a distance between two cities:
// the globe the shortest way over a sphere, the flat map a straight line across it. A scheduled flight
// gives a time. Distance ÷ time is the speed the aircraft would have to fly, and a speed above that of sound
// is marked, because airliners do not fly that fast.
//
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
      <td title="${esc(route.flights)}: ${hoursMinutes(route.there)} out, ${hoursMinutes(route.back)} back">${st.hours.toFixed(1)} h</td><td>${whole(st.globeKmh)}</td>
      <td class="${st.flatKmh > SOUND_KMH ? 'bad' : ''}">${whole(st.flatKmh)}</td></tr>`;
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
  const mid = midPoint(r.path);
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
  state.mode = MODES.includes(mode) ? mode : 'sky';
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
    space: ['From space', 'From space'], // one view, so the two buttons are not shown
  }[state.mode];
  document.querySelectorAll('#view-tabs button').forEach((btn, i) => (btn.textContent = names[i]));
  fillSpeeds();
  requestUpdate();
}

/**
 * The card with the explanation: a demonstration's text, a tour's question, the list for choosing a tour, or
 * the introduction to the tool on show. Also keeps the two rows of the menu at the top in step with it.
 */
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
          : { sky: INTRO, horizon: HORIZON_INTRO, flight: FLIGHT_INTRO, space: SPACE_INTRO }[state.mode];
  $('tour-bar').hidden = !tour;
  $('tour-end').hidden = !ended;
  $('tour-ask').hidden = !asking;
  $('demo-card').classList.toggle('answered', asking && tour.shown);
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
  // The lower row says whose it is.
  const groupName = demoGroup === TOURS_GROUP ? 'Tours' : GROUPS.find((g) => g.id === demoGroup).label;
  $('demo-list-name').textContent = groupName;
  $('demo-list').setAttribute('aria-label', demoGroup === TOURS_GROUP ? 'Tours' : `Demonstrations: ${groupName}`);
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
//
// `syncInputs` makes every control show what the state holds. The `bind…` functions go the other way: each
// control changes the state and asks for an update. Nothing is worked out here.

// The sliders for the flat model's heights run from 0 to 1000 and cover 100 km to 1,000,000 km in equal
// ratios, so that each quarter of the slider is ten times the height:
//   height = 100 km × 10,000^(slider ÷ 1000)
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
// The same kind of slider for any range: equal steps along it multiply the value by equal amounts.
const toLogSlider = (value, [min, max]) => (1000 * Math.log(value / min)) / Math.log(max / min);
const fromLogSlider = (v, [min, max]) => min * Math.pow(max / min, v / 1000);
// The three sizes in the horizon tool, each with a slider and a box to type in.
const HZ_QUANTITIES = [
  { key: 'targetM', slider: 'hz-target', number: 'hz-target-n', show: heightNumber, unit: heightUnit },
  { key: 'targetKm', slider: 'hz-distance', number: 'hz-distance-n', show: distanceNumber, unit: distanceUnit },
  { key: 'eyeM', slider: 'hz-eye', number: 'hz-eye-n', show: heightNumber, unit: heightUnit },
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

/** Makes every control show what the state holds. A box that is being typed in is left alone. */
function syncInputs() {
  syncSides();
  $('show-sun').checked = state.sun;
  $('show-observer').checked = state.observer;
  // The views of the tool on show, each with a box to switch it off.
  const paneList = $('pane-list');
  if (paneList.dataset.mode !== state.mode) {
    paneList.dataset.mode = state.mode;
    paneList.innerHTML = (PANES[state.mode] ?? []).map((id) => `<label class="check"><input type="checkbox" data-pane="${id}" /> ${esc(PANE_NAMES[id])}</label>`).join('');
  }
  const off = hiddenPanes();
  for (const box of paneList.querySelectorAll('input')) box.checked = !off.includes(box.dataset.pane);
  setIfIdle($('m-time'), toInputTime(state.date));
  $('m-where').textContent =
    `It will be recorded at the observer's place, ${where(state.lat, state.lon)}. ` +
    'Move the observer first if you measured somewhere else.';
  // The time controls above the views: the date, the time of day in universal time, and the time by the sun.
  setIfIdle($('date'), isoDay(state.date));
  const minutes = utcMinutes(state.date);
  $('time').value = Math.floor(minutes);
  $('time-label').textContent = `${hhmm(Math.floor(minutes))} UTC`;
  // The sun crosses 15° of longitude an hour, so the time by the sun is 4 minutes later for each degree east.
  // It is a rough guide only: it leaves out the quarter of an hour or so by which the sun runs fast or slow over the year.
  $('solar-time').textContent = `${hhmm(Math.floor(minutes + state.lon * 4))} by the sun`;
  $('solar-time').title = 'About this time by the sun at the observer. Clock zones vary.';
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
  $('light-range-name').textContent = bentLight() ? 'How far off the sun is seen to set' : 'How far its light reaches';
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
  $('sky-grid').checked = state.skyGrid;
  $('refraction').value = state.refraction;
  const custom = state.refraction === 'custom';
  $('air-fields').hidden = !custom;
  setIfIdle($('air-temp'), state.tempC);
  setIfIdle($('air-pressure'), state.pressureHpa);
  // The lift goes with the air's density: up with its pressure, down with its temperature (js/refraction.js).
  const change = Math.round((airFactor(currentAir()) - 1) * 100);
  $('air-note').textContent =
    custom ? `This air bends light ${change ? `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than` : 'the same as'} standard air.` : '';
  $('btn-play').textContent = state.playing ? 'Pause' : 'Play';
  $('btn-play').setAttribute('aria-pressed', String(state.playing));
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
  // What k means, in words: how sharply light curves, against how sharply the sea does.
  const curve = state.k < 0.005 ? '' : `Light curves ${Math.round(state.k * 100)}% as sharply as the sea does. `;
  $('hz-k-note').textContent = curve + airInWords(state.k);
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
  $('speed').value = String(clockSpeed());
  $('sp-look').value = spaceAway ? '' : state.spaceLook;
  $('sp-stay').value = state.spaceStay;
  $('sp-free').checked = state.spaceFree;
  const hint = SPACE_HINTS[state.spaceFree ? 'free' : 'circle'];
  if ($('sp-hint').textContent !== hint) $('sp-hint').textContent = hint;
  $('sp-orbits').checked = state.spaceOrbits;
  $('sp-names').checked = state.spaceNames;
}

function bindControls() {
  // Every place there is, by name, for the three lists that offer them.
  const places = [...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option>${c.name}</option>`).join('');
  const select = $('city');
  select.innerHTML = '<option value="">Custom location</option>' + places;
  for (const el of document.querySelectorAll('.ref-count')) el.textContent = REF_CITIES.length;

  // ----- the time controls, in the bar above the views -----

  // The moment on show is the date at midnight, universal time, and the slider's minutes after it.
  const setClock = () => {
    const day = Date.parse(`${$('date').value}T00:00:00Z`);
    if (Number.isNaN(day)) return;
    state.date = new Date(day + Number($('time').value) * MINUTE_MS);
    requestUpdate();
  };
  $('date').addEventListener('change', setClock);
  $('time').addEventListener('input', setClock);

  // Sunrise, noon and sunset at the observer, for the day on show, are the almanac's.
  const jump = (which, name) => () => {
    const t = sunEvents(state.date, state.lat, state.lon)[which];
    if (!t) return toast(`No ${name} here on this date`);
    state.date = t;
    requestUpdate();
  };
  const jumps = {
    rise: jump('rise', 'sunrise'),
    noon: jump('noon', 'solar noon'),
    set: jump('set', 'sunset'),
    now: () => {
      state.date = new Date();
      requestUpdate();
    },
  };
  $('btn-sunrise').addEventListener('click', jumps.rise);
  $('btn-noon').addEventListener('click', jumps.noon);
  $('btn-sunset').addEventListener('click', jumps.set);
  $('btn-now').addEventListener('click', jumps.now);
  // On a phone the four jumps are one short list, which goes back to its name once it has been used.
  $('time-jump').addEventListener('change', (e) => {
    jumps[e.target.value]?.();
    e.target.value = '';
  });
  $('btn-play').addEventListener('click', () => {
    state.playing = !state.playing;
    requestUpdate();
  });
  $('speed').addEventListener('change', (e) => {
    state[state.mode === 'space' ? 'spaceSpeed' : 'speed'] = Number(e.target.value);
    requestUpdate();
  });

  // ----- the view from space -----
  // The first choice is never offered. It is what the list shows once the camera has left the look last chosen.
  $('sp-look').innerHTML =
    '<option value="" hidden disabled>Choose a view</option>' + SPACE_LOOKS.map((look) => `<option value="${look.id}">${look.label}</option>`).join('');
  $('sp-look').addEventListener('change', (e) => {
    state.spaceLook = e.target.value;
    applySpaceLook();
    requestUpdate();
  });
  $('sp-stay').innerHTML = SPACE_BODIES.map(({ name }) => `<option value="${name}">${bodyLabel(name)}</option>`).join('');
  $('sp-stay').addEventListener('change', (e) => {
    state.spaceStay = e.target.value;
    spaceAway = true;
    spaceView?.stayWith(state.spaceStay);
    requestUpdate();
  });
  $('sp-free').addEventListener('change', (e) => {
    state.spaceFree = e.target.checked;
    spaceView?.setFree(state.spaceFree);
    requestUpdate();
  });
  for (const [id, key] of [['sp-orbits', 'spaceOrbits'], ['sp-names', 'spaceNames']]) {
    $(id).addEventListener('change', (e) => {
      state[key] = e.target.checked;
      requestUpdate();
    });
  }

  // ----- the observer, and the flat model's settings -----

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
  // "Best fit" puts the flat sun at the height that misses least over the day (see `getFit`): the flat model at its best.
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
  // The search starts an hour on from the moment on show, so a full moon or an eclipse that is on show already is passed over.
  $('btn-fullmoon').addEventListener('click', moonJump(() => nextFullMoon(new Date(state.date.getTime() + HOUR_MS))));
  $('btn-eclipse').addEventListener('click', moonJump(() => nextLunarEclipse(new Date(state.date.getTime() + HOUR_MS)).peak));

  // Distances
  for (const id of ['route-from', 'route-to']) {
    $(id).innerHTML = '<option value="">Choose a place</option>' + places;
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
    ['sky-grid', 'skyGrid'],
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

  // ----- the menu on the observer's sky -----

  // The observer's sky keeps its own options behind the three dots in its corner. The list stays open while
  // they are ticked, and closes on a press anywhere else or on Escape.
  const skyMenu = $('sky-menu-button');
  const skyList = $('sky-menu-list');
  const openSkyMenu = (open) => {
    skyList.hidden = !open;
    skyMenu.setAttribute('aria-expanded', String(open));
  };
  skyMenu.addEventListener('click', () => openSkyMenu(skyList.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!skyList.hidden && !e.target.closest('#sky-menu')) openSkyMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || skyList.hidden) return;
    openSkyMenu(false);
    skyMenu.focus();
  });

  // ----- the air, the "i" boxes, the other tools, the link -----

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

  // ----- the menu at the top: the groups of demonstrations, the demonstrations, and the tours -----

  $('demo-groups').insertAdjacentHTML('beforeend', GROUPS.map((g) => `<button data-group="${g.id}">${esc(g.label)}</button>`).join(''));
  $('demo-list').innerHTML =
    '<span class="nav-label" id="demo-list-name" aria-hidden="true"></span>' +
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
    btn.addEventListener('click', () => {
      if (btn.dataset.tour === OWN_TOUR) tourPick();
      else tourGo(0, btn.dataset.tour);
      cardIntoView();
    });
  }
  // Choosing the steps of a tour: the ticks and the two buttons are inside the explanation, which is redrawn.
  $('demo-body').addEventListener('change', (e) => {
    const id = e.target.dataset?.pick;
    if (!id) return;
    // A step that is ticked joins the end of the tour. One that is unticked leaves it.
    state.ownTour = cleanTourSteps(e.target.checked ? [...state.ownTour, id] : state.ownTour.filter((step) => step !== id));
    requestUpdate();
  });
  $('demo-body').addEventListener('click', (e) => {
    const move = e.target.closest('[data-move]')?.dataset.move;
    if (move) {
      const [id, by] = move.split(':');
      state.ownTour = moveTourStep(state.ownTour, id, Number(by));
      requestUpdate();
      return;
    }
    if (e.target.closest('[data-pick-start]') && state.ownTour.length >= MIN_TOUR_STEPS) tourGo(0, OWN_TOUR);
    else if (e.target.closest('[data-pick-cancel]')) tourLeave();
  });
  // A control that belongs to the argument on show.
  $('demo-controls').addEventListener('input', (e) => {
    const control = controlsOf(DEMOS[state.demo]).find((c) => c.id === e.target.dataset.own);
    if (!control) return;
    const raw = control.options ? e.target.value : control.scale === 'log' ? sliderValue(control, Number(e.target.value)) : Number(e.target.value);
    state.own = { ...state.own, [control.id]: cleanValue(control, raw) };
    // Some choices are a different scene altogether, such as which eclipse to look at.
    if (control.sets) {
      state.playing = false;
      DEMOS[state.demo].apply(app, state.own);
    }
    requestUpdate();
  });
  $('tour-start').addEventListener('click', () => {
    // The row beneath lists the tours. With none running, the short one starts straight away.
    demoGroup = TOURS_GROUP;
    if (!state.tour && !state.picking) {
      tourGo(0, TOURS[0].id);
      cardIntoView();
    } else requestUpdate();
  });
  const then = (act) => () => {
    act();
    cardIntoView();
  };
  $('tour-again').addEventListener('click', then(() => tourGo(0)));
  $('tour-back').addEventListener('click', then(() => tourGo(state.tour.step - 1)));
  $('tour-next').addEventListener('click', then(() => tourGo(state.tour.step + 1)));
  $('tour-show').addEventListener('click', then(tourShow));
  $('tour-leave').addEventListener('click', tourLeave);
  $('tour-explore').addEventListener('click', tourLeave);
}

function bindHorizonControls() {
  // The three tools. Switching also turns the menu at the top to a group that has something for the new tool.
  for (const btn of document.querySelectorAll('#mode-tabs button')) {
    btn.addEventListener('click', () => {
      setMode(btn.dataset.mode);
      const listed = (group) => ARGUMENTS.some((a) => a.group === group && a.tool === state.mode);
      if (!state.tour && !state.picking && !listed(demoGroup)) demoGroup = ARGUMENTS.find((a) => a.tool === state.mode)?.group ?? demoGroup;
    });
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
  //   k = 503 × pressure ÷ T² × (0.0343 + change of temperature per metre)     pressure in hPa, T in kelvin
  // The sum is `coefficientFromWeather` in js/horizon.js. The change is typed in per 100 m.
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
  for (const id of WEATHER_INPUTS) {
    $(id).addEventListener('input', () => {
      showWeather();
      // What is typed here goes into the link.
      requestUpdate();
    });
  }
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
  // What was measured: the sun, or one of the stars (the list was filled in `bindControls`). A star throws no
  // shadow, so it is always an angle. The sun's height can also come from a stick and its shadow:
  //   height = atan(stick ÷ shadow)
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
//
// Everything that is set goes into the address after the #, so a link shows someone else exactly the same
// scene, and the same figures, to check. A setting that belongs to a tool not on show, or to something that
// is switched off, is left out while it is still as it starts, which keeps a link short. The short names:
//
//   t time (UTC)        lat, lon observer        h flat sun's height, km     r how far its light reaches, km
//   fb=1 its light curves                        fl how the flat map is lit  rf air: 0 none, 1 standard, 2 own (tc °C, ph hPa)
//   sl sight lines      ag grid on the sky       demo demonstration          a its own controls
//   dg the heading whose demonstrations are listed, when none of them is chosen
//   tn tour, ts step, tv=1 answer on show, tl the steps of a tour of one's own
//   st=1 stars, star which one, sh their height, tr trails                  mo=1 moon, mh its height
//   rt route            v tool: h horizon, f flight, s space                u=i feet and miles
//   vp the pair of views on show: outside or sky
//   su=0 no sun on the globe or the map, ob=0 no observer marked on them, hp the views switched off
//   tk the sidebars tucked away: c the settings, r the results, 0 neither
//   fd the sections folded away, each as its sidebar's letter and its heading: c-display~r-cities, or 0 for none
//   fw=0 the observer's sky follows nothing, lk where it then looks: bearing, tilt and angle of view, in degrees
//   pl=1 the time is running, cs how fast in minutes a second, scs how fast in the view from space
//   horizon: tg shape, th its height, td its distance, eh eye height, k bending, sg line of sight on the map,
//            s1 s2 s3 two sunsets, ly=1 layers of air (at, wt, lm, lg),
//            kw the weather to work the bending out from: °C, hPa, °C for each 100 m
//   flight:  fs speed, fa height, fm minutes, fy=1 the lap is running
//   space:   sv what it looks at, sw the body it stays with if that is another, sf=1 moving freely,
//            so=0 no orbits drawn, sn=0 no names
//   m the user's measurements                    o the user's horizon observations
//
// Not in a link, because none of it is a setting: where the outside views and the view from space have been
// dragged round to, a target that is on its way out to sea, the steps of a tour while they are being chosen,
// and what is typed into a form and not yet added. The layout of the sidebars (tk, fd) is written only where
// it has been changed, and a link without it leaves the reader's own layout as it is.

function writeHash() {
  hashWrittenAt = performance.now();
  // A setting is written while what it belongs to is on show, and otherwise only if it has been changed.
  const live = (shown, key) => shown || state[key] !== DEFAULT[key];
  const p = new URLSearchParams({
    t: state.date.toISOString().slice(0, 19) + 'Z',
    lat: state.lat.toFixed(3),
    lon: state.lon.toFixed(3),
    h: Math.round(state.sunHeightKm),
    r: Math.round(state.lightRangeKm),
    sl: state.sightLines ? 1 : 0,
    ...(state.skyGrid ? { ag: 1 } : {}),
    fl: state.flatLighting,
    ...(bentLight() ? { fb: 1 } : {}),
    rf: { off: 0, standard: 1, custom: 2 }[state.refraction],
  });
  const ownAir = state.refraction === 'custom';
  if (live(ownAir, 'tempC')) p.set('tc', state.tempC);
  if (live(ownAir, 'pressureHpa')) p.set('ph', state.pressureHpa);
  if (state.demo) {
    p.set('demo', state.demo);
    const own = encodeOwn(DEMOS[state.demo], state.own);
    if (own) p.set('a', own);
  } else if (demoGroup !== GROUPS[0].id) {
    p.set('dg', demoGroup);
  }
  if (state.tour) {
    if (state.tour.id !== TOURS[0].id) p.set('tn', state.tour.id);
    p.set('ts', state.tour.step + 1);
    if (state.tour.shown) p.set('tv', 1);
  }
  if (state.ownTour.length) p.set('tl', state.ownTour.join('~'));
  if (state.stars) p.set('st', 1);
  if (live(state.stars, 'star')) p.set('star', state.star);
  if (live(state.stars, 'starHeightKm')) p.set('sh', Math.round(state.starHeightKm));
  if (state.trails) p.set('tr', 1);
  if (state.moon) p.set('mo', 1);
  if (live(state.moon, 'moonHeightKm')) p.set('mh', Number(state.moonHeightKm.toFixed(1)));
  if (state.route) p.set('rt', `${state.route.from}~${state.route.to}`);

  // What is drawn, and how the screen is laid out. The layout is written only where it is not as it starts.
  if (!state.sun) p.set('su', 0);
  if (!state.observer) p.set('ob', 0);
  if (state.hiddenPanes) p.set('hp', state.hiddenPanes);
  const layout = layoutNow();
  const start = layoutAtStart();
  if (layout.tucked !== start.tucked || layout.folded.join('~') !== start.folded.join('~')) {
    p.set('tk', layout.tucked || '0');
    p.set('fd', layout.folded.join('~') || '0');
  }

  // The views, and the clock.
  const pair = $('views').dataset.pair;
  if (pair !== startingPair()) p.set('vp', pair);
  if (!state.follow) {
    p.set('fw', 0);
    const { az, pitch, fov } = globeSky.look;
    p.set('lk', [az, pitch, fov].map((n) => Number(n.toFixed(1))).join(','));
  }
  if (state.playing) p.set('pl', 1);
  if (live(false, 'speed')) p.set('cs', state.speed);
  if (live(false, 'spaceSpeed')) p.set('scs', state.spaceSpeed);

  // The view from space.
  const space = state.mode === 'space';
  if (space) p.set('v', 's');
  if (live(space, 'spaceLook')) p.set('sv', state.spaceLook);
  if (state.spaceStay !== (SPACE_LOOK[state.spaceLook] ?? SPACE_LOOKS[0]).body) p.set('sw', state.spaceStay.toLowerCase());
  if (state.spaceFree) p.set('sf', 1);
  if (!state.spaceOrbits) p.set('so', 0);
  if (!state.spaceNames) p.set('sn', 0);

  // Level flight.
  const flight = state.mode === 'flight';
  if (flight) p.set('v', 'f');
  if (live(flight, 'speedKmh')) p.set('fs', Math.round(state.speedKmh));
  if (live(flight, 'altitudeM')) p.set('fa', Math.round(state.altitudeM));
  if (live(flight, 'flightMinutes')) p.set('fm', Math.round(state.flightMinutes));
  if (state.flying) p.set('fy', 1);

  // The horizon.
  const horizon = state.mode === 'horizon';
  if (horizon) p.set('v', 'h');
  if (live(horizon, 'shape')) p.set('tg', state.shape);
  if (live(horizon, 'targetM')) p.set('th', tidy(state.targetM));
  if (live(horizon, 'targetKm')) p.set('td', Number(state.targetKm.toFixed(2)));
  if (live(horizon, 'eyeM')) p.set('eh', tidy(state.eyeM));
  if (live(horizon, 'k')) p.set('k', state.k.toFixed(2));
  if (sightShown()) {
    const { from, to, waterM } = state.sight;
    p.set('sg', [from.lat, from.lon, to.lat, to.lon].map((n) => Number(n.toFixed(5))).concat(Number(waterM.toFixed(2))).join(','));
  }
  if (live(false, 'sunsetLowM') || live(false, 'sunsetHighM') || state.sunsetSeconds !== null) {
    p.set('s1', tidy(state.sunsetLowM));
    p.set('s2', tidy(state.sunsetHighM));
    if (state.sunsetSeconds !== null) p.set('s3', state.sunsetSeconds);
  }
  if (state.layers) p.set('ly', 1);
  if (live(state.layers, 'airC')) p.set('at', state.airC);
  if (live(state.layers, 'waterC')) p.set('wt', state.waterC);
  if (live(state.layers, 'layerM')) p.set('lm', state.layerM);
  if (live(state.layers, 'lapse100')) p.set('lg', state.lapse100);
  // The weather, where all three boxes hold a number and one of them has been changed.
  const weather = WEATHER_INPUTS.map((id) => $(id).value.trim());
  if (weather.every((v) => v !== '' && Number.isFinite(Number(v))) && WEATHER_INPUTS.some((id, i) => Number(weather[i]) !== Number($(id).defaultValue))) {
    p.set('kw', weather.map(Number).join(','));
  }
  if (imperial()) p.set('u', 'i');
  if (measurements.length) p.set('m', encodeMeasurements(measurements));
  if (observations.length) p.set('o', encodeObservations(observations));
  history.replaceState(null, '', `#${p}`);
}

/**
 * Reads a link back into the state. Every number is held to the range its control allows, and anything
 * unreadable is passed over. A link written by the app always carries the time, and whatever such a link
 * leaves out is as it is at the start. A link typed by hand, with no time in it, changes only what it names.
 */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  linkFull = p.has('t');
  const base = linkFull ? DEFAULT : state;
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
  state.skyGrid = p.get('ag') === '1';
  if (p.has('rf')) state.refraction = { 0: 'off', 2: 'custom' }[p.get('rf')] ?? 'standard';
  state.tempC = num('tc', ...AIR_LIMITS.tempC) ?? base.tempC;
  state.pressureHpa = num('ph', ...AIR_LIMITS.pressureHpa) ?? base.pressureHpa;
  if (p.get('fl') === 'observed' || p.get('fl') === 'model') state.flatLighting = p.get('fl');
  state.flatLight = p.get('fb') === '1' ? 'bent' : 'straight';
  state.demo = DEMOS[p.get('demo')] ? p.get('demo') : base.demo;
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
  // It opens the demonstration it names. One that names none leaves the demonstration on show as it is.
  const wanted = !p.has('t') && (state.tour?.shown || (!state.tour && p.has('demo') && state.demo));
  bareLink = wanted ? { demo: state.demo, own: p.get('a'), tourShown: !!state.tour?.shown } : null;
  if (state.demo) demoGroup = DEMOS[state.demo].group;
  else if (p.get('dg') === TOURS_GROUP || GROUPS.some((g) => g.id === p.get('dg'))) demoGroup = p.get('dg');
  else if (linkFull) demoGroup = GROUPS[0].id;
  state.stars = p.get('st') === '1';
  state.moon = p.get('mo') === '1';
  state.moonHeightKm = num('mh', MIN_HEIGHT_KM, MAX_HEIGHT_KM) ?? base.moonHeightKm;
  state.trails = p.get('tr') === '1';
  state.star = starIndex(p.get('star')) >= 0 ? p.get('star') : base.star;
  state.starHeightKm = num('sh', MIN_HEIGHT_KM, MAX_HEIGHT_KM) ?? base.starHeightKm;
  const [from, to] = (p.get('rt') ?? '').split('~');
  state.route = city(from) && city(to) && from !== to ? { from, to } : null;
  state.mode = { h: 'horizon', f: 'flight', s: 'space' }[p.get('v')] ?? 'sky';
  // The views and the clock. A speed has to be one of those on offer.
  linkPair = PAIRS.includes(p.get('vp')) ? p.get('vp') : null;
  // What is drawn, and the layout of the sidebars. A link that says nothing of the layout leaves it alone.
  state.sun = p.has('su') ? p.get('su') !== '0' : base.sun;
  state.observer = p.has('ob') ? p.get('ob') !== '0' : base.observer;
  state.hiddenPanes = p.has('hp') ? cleanPanes(p.get('hp').split('~')) : base.hiddenPanes;
  linkLayout = p.has('tk') || p.has('fd') ? { tucked: p.get('tk'), folded: p.has('fd') ? p.get('fd').split('~') : null } : null;
  state.follow = p.get('fw') !== '0';
  const look = (p.get('lk') ?? '').split(',').map(Number);
  linkLook = !state.follow && look.length === 3 && look.every(Number.isFinite) ? { az: look[0], pitch: look[1], fov: look[2] } : null;
  state.playing = p.get('pl') === '1';
  const speed = (key, kind) => (p.has(key) && SPEEDS[kind].some(([minutes]) => minutes === Number(p.get(key))) ? Number(p.get(key)) : null);
  state.speed = speed('cs', 'sky') ?? base.speed;
  state.spaceSpeed = speed('scs', 'space') ?? base.spaceSpeed;
  state.flying = p.get('fy') === '1';
  state.spaceLook = Object.hasOwn(SPACE_LOOK, p.get('sv') ?? '') ? p.get('sv') : base.spaceLook;
  state.spaceStay = SPACE_BODIES.find((body) => body.name.toLowerCase() === p.get('sw'))?.name ?? SPACE_LOOK[state.spaceLook].body;
  state.spaceFree = p.get('sf') === '1';
  state.spaceOrbits = p.get('so') !== '0';
  state.spaceNames = p.get('sn') !== '0';
  state.speedKmh = num('fs', ...FLIGHT_LIMITS.speedKmh) ?? base.speedKmh;
  state.altitudeM = num('fa', ...FLIGHT_LIMITS.altitudeM) ?? base.altitudeM;
  state.flightMinutes = num('fm', ...FLIGHT_LIMITS.minutes) ?? base.flightMinutes;
  state.shape = TARGET_SHAPES.includes(p.get('tg')) ? p.get('tg') : base.shape;
  state.targetM = num('th', ...HZ_LIMITS.targetM) ?? base.targetM;
  state.targetKm = num('td', ...HZ_LIMITS.targetKm) ?? base.targetKm;
  state.eyeM = num('eh', ...HZ_LIMITS.eyeM) ?? base.eyeM;
  state.k = num('k', 0, 1) ?? base.k;
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
  } else if (p.has('td') || linkFull) {
    state.sight = null;
  }
  state.layers = p.get('ly') === '1';
  state.sunsetHighM = num('s2', 0.02, HZ_LIMITS.eyeM[1]) ?? base.sunsetHighM;
  state.sunsetLowM = num('s1', 0, state.sunsetHighM * 0.99) ?? Math.min(base.sunsetLowM, state.sunsetHighM * 0.99);
  state.sunsetSeconds = num('s3', 0.1, 36000);
  state.airC = num('at', -20, 40) ?? base.airC;
  state.waterC = num('wt', -2, 35) ?? base.waterC;
  state.layerM = num('lm', 1, 50) ?? base.layerM;
  state.lapse100 = num('lg', -1, 2) ?? base.lapse100;
  // The weather to work the bending out from goes straight into its three boxes.
  const weather = (p.get('kw') ?? '').split(',').map(Number);
  const weatherGiven = weather.length === 3 && weather.every(Number.isFinite);
  if (weatherGiven || linkFull) {
    WEATHER_INPUTS.forEach((id, i) => ($(id).value = weatherGiven ? clamp(weather[i], Number($(id).min), Number($(id).max)) : $(id).defaultValue));
    $(WEATHER_INPUTS[0]).dispatchEvent(new Event('input'));
  }
  state.units = p.has('u') ? (p.get('u') === 'i' ? 'imperial' : 'metric') : base.units;
  if (state.demo && DEMOS[state.demo].tool !== state.mode) state.demo = null;
  state.own = state.demo ? decodeOwn(DEMOS[state.demo], p.get('a')) : {};
  // Measurements that came with the link are added to the ones already here.
  measurements = mergeMeasurements(measurements, decodeMeasurements(p.get('m')));
  observations = mergeObservations(observations, decodeObservations(p.get('o')));
}

// ---------- what is on show ----------

// The views of each tool, in the order they are laid out, and a short name for each. The view from space is
// the only one of its tool, so it has no box to switch it off.
const PANES = {
  sky: ['globe-view', 'flat-view', 'globe-sky', 'flat-sky'],
  horizon: ['hz-globe-side', 'hz-flat-side', 'hz-globe-scope', 'hz-flat-scope'],
  flight: ['fl-globe-lap', 'fl-flat-lap', 'fl-globe-stretch', 'fl-flat-stretch'],
};
const PANE_NAMES = {
  'globe-view': 'The globe, from outside',
  'flat-view': 'The flat map, from outside',
  'globe-sky': "The observer's sky, globe model",
  'flat-sky': "The observer's sky, flat model",
  'hz-globe-side': 'From the side, globe model',
  'hz-flat-side': 'From the side, flat model',
  'hz-globe-scope': 'Through a telescope, globe model',
  'hz-flat-scope': 'Through a telescope, flat model',
  'fl-globe-lap': 'The lap, globe model',
  'fl-flat-lap': 'The lap, flat model',
  'fl-globe-stretch': 'To scale, globe model',
  'fl-flat-stretch': 'To scale, flat model',
};
/** The views that are switched off, as a list of their ids. */
const hiddenPanes = () => (state.hiddenPanes ? state.hiddenPanes.split('~') : []);
/** A list of ids as the state keeps it: only real views, in their own order, joined by "~". */
const cleanPanes = (ids) => Object.keys(PANE_NAMES).filter((id) => ids.includes(id)).join('~');

let panesFor = null;
/**
 * Takes the views that are switched off out of the picture, and lets the rest share the room. A view left
 * alone on its row is given the whole width.
 */
function applyPanes() {
  const views = $('views');
  // Nothing to do unless what decides the layout has changed: the tool, the pair, the list, or the width.
  const key = `${state.mode}|${views.dataset.pair}|${state.hiddenPanes}|${window.innerWidth}`;
  if (key === panesFor) return;
  panesFor = key;
  const off = hiddenPanes();
  const all = [...views.querySelectorAll('.view')];
  for (const view of all) view.classList.toggle('off', off.includes(view.id));
  views.toggleAttribute('data-fewer', (PANES[state.mode] ?? []).some((id) => off.includes(id)));
  const shown = all.filter((view) => getComputedStyle(view).display !== 'none');
  for (const view of all) view.classList.toggle('span', shown.length % 2 === 1 && view === shown[shown.length - 1]);
}

function bindShown() {
  for (const [id, key] of [['show-sun', 'sun'], ['show-observer', 'observer']]) {
    $(id).addEventListener('change', (e) => {
      state[key] = e.target.checked;
      requestUpdate();
    });
  }
  $('pane-list').addEventListener('change', (e) => {
    const id = e.target.dataset?.pane;
    if (!id) return;
    const off = new Set(hiddenPanes());
    if (e.target.checked) off.delete(id);
    else off.add(id);
    // One view of the tool always stays, or there would be nothing to look at.
    if ((PANES[state.mode] ?? []).every((pane) => off.has(pane))) {
      off.delete(id);
      toast('One view always stays on show');
    }
    state.hiddenPanes = cleanPanes([...off]);
    requestUpdate();
  });
}

// ---------- the layout of the sidebars, for a link ----------

const SIDES = ['controls', 'results'];
/** A section that folds, as a link names it: its sidebar's first letter and its heading, as "c-display". */
const foldName = (f) => `${f.section.closest('aside').id[0]}-${f.key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
/** The sidebars as they are: which are tucked away (their first letters), and which sections are folded. */
const layoutNow = () => ({
  tucked: SIDES.filter((side) => document.body.classList.contains(`tuck-${side}`)).map((side) => side[0]).join(''),
  folded: folds.filter((f) => f.section.classList.contains('folded')).map(foldName),
});
/** The sidebars as they are on a first visit. */
const layoutAtStart = () => ({ tucked: '', folded: folds.filter((f) => FOLDED_AT_FIRST.includes(f.key)).map(foldName) });

/**
 * Lays the sidebars out as the link last read has them. It is for this visit only: what this computer
 * remembers of the layout is changed only when the reader folds or tucks something themselves.
 */
function applyLinkLayout() {
  if (!linkLayout) return;
  const { tucked, folded } = linkLayout;
  linkLayout = null;
  if (tucked !== null) for (const side of SIDES) document.body.classList.toggle(`tuck-${side}`, tucked.includes(side[0]));
  if (folded !== null) for (const f of folds) f.set(folded.includes(foldName(f)));
  syncSides();
  requestUpdate();
}

// ---------- saved setups ----------
//
// A setup is a link: everything that is set, as it would be written after the #. Setups are kept on this
// computer under a name, and can be saved to a file and read back from one. Reading one goes through
// readHash like any other link, so nothing in a file is trusted further than a link would be.

const SETUPS_KEY = 'globedart.setups';
const SETUP_LIMITS = { count: 50, name: 60, link: 20000, fileBytes: 2e6 };
let setups = []; // { name, link }

/** Whatever of a list is a sound setup: a name, and a link that starts with #. */
function cleanSetups(list) {
  if (!Array.isArray(list)) return [];
  const sound = [];
  for (const item of list) {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, SETUP_LIMITS.name) : '';
    const link = typeof item?.link === 'string' ? item.link : '';
    if (!name || !link.startsWith('#') || link.length > SETUP_LIMITS.link) continue;
    // A name is kept once. The later of two with the same name is the one kept.
    const same = sound.findIndex((s) => s.name === name);
    if (same >= 0) sound[same] = { name, link };
    else sound.push({ name, link });
  }
  return sound.slice(0, SETUP_LIMITS.count);
}

/** What a setup is of, read from its link: the tool and the day. */
function setupAbout(link) {
  const p = new URLSearchParams(link.slice(1));
  const tool = { h: 'The horizon', f: 'Level flight', s: 'From space' }[p.get('v')] ?? 'Sun, stars, maps';
  const day = /^\d{4}-\d{2}-\d{2}/.exec(p.get('t') ?? '')?.[0];
  const demo = DEMOS[p.get('demo')]?.label;
  return [demo ?? tool, day].filter(Boolean).join(', ');
}

function renderSetups() {
  $('setup-list').innerHTML = setups
    .map(
      (s, i) => `<div class="own-card" data-i="${i}">
        <div class="own-head"><div><b>${esc(s.name)}</b><small>${esc(setupAbout(s.link))}</small></div></div>
        <div class="buttons two"><button data-act="load">Load</button><button data-act="remove">Remove</button></div>
      </div>`,
    )
    .join('');
  $('setup-name').placeholder = `Setup ${setups.length + 1}`;
}

function keepSetups() {
  remember(SETUPS_KEY, { list: setups });
  renderSetups();
}

function bindSetups() {
  setups = cleanSetups(recall(SETUPS_KEY).list);
  renderSetups();
  /** The setup on show now, under the name in the box or the next free one. */
  const present = () => {
    writeHash();
    return { name: $('setup-name').value.trim().slice(0, SETUP_LIMITS.name) || `Setup ${setups.length + 1}`, link: location.hash };
  };
  $('setup-keep').addEventListener('click', () => {
    const setup = present();
    const had = setups.some((s) => s.name === setup.name);
    if (!had && setups.length >= SETUP_LIMITS.count) {
      toast(`No more than ${SETUP_LIMITS.count} setups can be kept. Remove one first.`);
      return;
    }
    setups = cleanSetups([...setups, setup]);
    $('setup-name').value = '';
    keepSetups();
    toast(had ? `"${setup.name}" replaced` : `"${setup.name}" kept on this computer`);
  });
  $('setup-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    const setup = setups[Number(btn?.closest('.own-card')?.dataset.i)];
    if (!setup) return;
    if (btn.dataset.act === 'remove') {
      setups = setups.filter((s) => s !== setup);
      keepSetups();
      toast(`"${setup.name}" removed`);
      return;
    }
    // Loading one is following its link. If the link is the one already on show there is nothing to follow.
    writeHash();
    if (location.hash !== setup.link) location.hash = setup.link;
    toast(`"${setup.name}" loaded`);
  });
  $('setup-export').addEventListener('click', () => {
    // With none kept, the file holds the setup on show.
    const list = setups.length ? setups : [present()];
    saveFile('globedart-setups.json', JSON.stringify({ app: 'GlobeDart', kind: 'setups', version: 1, setups: list }, null, 2), 'application/json');
  });
  $('setup-import').addEventListener('click', () => $('setup-file').click());
  $('setup-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so that the same file can be chosen again
    if (!file) return;
    let found = [];
    try {
      if (file.size > SETUP_LIMITS.fileBytes) throw new Error('too large');
      found = cleanSetups(JSON.parse(await file.text())?.setups);
    } catch {
      found = [];
    }
    if (!found.length) {
      toast('No setups could be read from that file');
      return;
    }
    const before = setups.length;
    setups = cleanSetups([...setups, ...found]);
    keepSetups();
    const added = setups.length - before;
    toast(`${found.length} read from the file: ${added} added${found.length > added ? `, ${Math.min(found.length - added, found.length)} replaced or left out` : ''}`);
  });
}

/**
 * Puts the views as the link last read has them: the pair on show, and where the observer's sky looks when
 * it follows nothing. A link typed by hand that names no pair leaves the pair alone, unless `always`.
 */
function applyLinkViews(always) {
  if (always || linkFull || linkPair) setPair(linkPair ?? startingPair());
  if (linkLook) setLook(linkLook);
}

// ---------- start ----------

/** Reads what was stored and what the link says, builds the views, and sets the loop going. */
async function start() {
  let stored = '';
  try {
    stored = localStorage.getItem(STORE_KEY) ?? '';
  } catch {
    // Storage can be unavailable. Then there is nothing stored to read.
  }
  await knowCatalogueStarsIn(decodeURIComponent(location.hash.replace(/\+/g, ' ')), stored);
  measurements = mergeMeasurements(storedList(STORE_KEY));
  observations = mergeObservations(storedList(OBS_KEY));
  readHash();
  // A link written by the app carries its time. Without one, this is a plain visit.
  if (!new URLSearchParams(location.hash.slice(1)).has('t')) openInDaylight();
  bindControls();
  bindShown();
  bindSetups();
  bindFolds();
  applyLinkLayout();
  // The outlines of the land (Natural Earth, 1:110m), drawn on both maps from the same latitudes and longitudes.
  const land = await (await fetch('data/land-110m.json')).json();
  app.land = land; // for an argument that draws a map of its own
  const landCanvas = makeLandCanvas(land);
  landPicture = landCanvas;
  const onPick = (lat, lon) => setObserver({ lat, lon });
  const onLook = (look) => {
    state.follow = false;
    $('follow').checked = false;
    setLook(look);
    // Where the sky looks goes into the link.
    requestUpdate();
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
  applyLinkViews(true);
  window.addEventListener('resize', requestUpdate);
  // A link pasted into a tab that already has the app open changes only the hash.
  window.addEventListener('hashchange', async () => {
    await knowCatalogueStarsIn(decodeURIComponent(location.hash.replace(/\+/g, ' ')));
    readHash();
    applyBareLink();
    setMode(state.mode);
    applyLinkViews(false);
    applyLinkLayout();
    applySpaceLook(state.spaceStay);
    globeView.focus(state.lat, state.lon);
    flatView.focus(state.lat, state.lon);
    requestUpdate();
  });

  // ----- the update loop -----

  // Once for every frame the screen draws. Whatever is running moves on by the time that has passed, then
  // `update` is called if anything has changed, and the sky tool's four views are drawn.
  let last = performance.now();
  const frame = (now) => {
    // Seconds since the last frame, and never more than a tenth: after a pause nothing leaps ahead.
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing) {
      // "Play" only moves the clock: `state.speed` minutes for every real second. Everything else follows from the time.
      state.date = new Date(state.date.getTime() + dt * clockSpeed() * MINUTE_MS);
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
    spaceView?.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Handy for debugging and for scripted checks.
  window.app = { currentKml, state, compute, computeHorizon, computeFlight, requestUpdate, measurements: () => measurements, observations: () => observations, views: { globeView, flatView, globeSky, flatSky, get spaceView() { return spaceView; } } };
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="toast">Could not start: ${String(err.message || err)}. Serve this folder over http.</div>`,
  );
});
