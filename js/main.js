import { subsolarPoint, observedSun, sunEvents, seasons, starPoints, observedStar, wrap180 } from './astro.js';
import {
  globePredict,
  flatPredict,
  impliedSunHeightKm,
  skySeparation,
  rmsMiss,
  flatFitCurve,
} from './models.js';
import { CITIES, REF_CITIES } from './cities.js';
import {
  MAX_MEASUREMENTS,
  shadowToElevation,
  shadowToAzimuth,
  summariseMeasurements,
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
} from './horizon.js';
import {
  MAX_OBSERVATIONS,
  scoreObservation,
  cleanObservation,
  mergeObservations,
  encodeObservations,
  decodeObservations,
} from './observations.js';
import { STARS, STAR_LINES, FEATURED_STARS, starIndex, SKY_TURN_DEG_PER_MIN } from './stars.js';
import { ROUTES, CRUISE_KMH, SOUND_KMH, routeStats, greatCirclePath } from './distances.js';
import { makeLandCanvas } from './scene-utils.js';
import { GlobeView } from './views/globeView.js';
import { FlatView } from './views/flatView.js';
import { SkyView } from './views/skyView.js';
import { ARGUMENTS, ARGUMENT_BY_ID, TOOLS, TOUR } from './arguments/index.js';
import { HorizonView } from './views/horizonView.js';
import { FlightView } from './views/flightView.js';
import { FLIGHT_LIMITS, flightScene, schulerMinutes } from './flight.js';
import { earthUrl, buildKml } from './earth.js';
import { makeAir, traceView } from './raytrace.js';

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
  follow: true,
  playing: false,
  speed: 10, // simulated minutes per real second
  demo: null,
  tour: null, // the guided tour: null, or { step, shown } (which step, and whether its answer is on show)
  stars: false,
  star: 'Polaris',
  starHeightKm: 5000, // flat model only: how high its layer of stars sits
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

// ---------- model evaluation ----------

const flatParams = () => ({ sunHeightKm: state.sunHeightKm, lightRangeKm: state.lightRangeKm });

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
      implied: impliedSunHeightKm(sub, city.lat, city.lon, o.el),
    };
  });
  const stars = state.stars ? computeStars() : null;
  const chosen = stars?.points[stars.selected];
  return {
    sub,
    obs,
    globe,
    flat,
    cities,
    stars,
    // What the sight lines in the outside views point at: the sun, or the chosen star.
    sight: stars
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
    own: measurements.find(isShown) ?? null,
    ownLines: measurements.filter((m) => m.az !== null && sameMoment(m, 300000)),
  };
}

// ---------- stars ----------

const STAR_MAGS = STARS.map((star) => star.mag);
const TRAIL_STEPS = 36;
const TRAIL_STEP_MIN = 10;
const starDome = () => ({ sunHeightKm: state.starHeightKm, lightRangeKm: Infinity });

// Every star is treated exactly like the sun: both models are told the point on
// Earth it is overhead, and each predicts where the observer should see it.
function computeStars() {
  const { date, lat, lon } = state;
  const air = currentAir();
  const dome = starDome();
  const points = starPoints(date, STARS);
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
    mags: STAR_MAGS,
    lines: STAR_LINES,
    selected,
    name: STARS[selected].name,
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
        implied: impliedSunHeightKm(chosen, place.lat, place.lon, o.el),
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
    <tr><td>Hidden from the bottom up</td><td class="${some ? 'bad' : ''}">${amount(hz.hiddenM)}</td>
      <td class="${flatSome ? 'bad' : ''}">${amount(hz.flatHiddenM)}</td></tr>
    <tr><td>In view</td><td>${all ? 'none' : fmtH(hz.visibleM)}</td><td>${amount(hz.targetM - hz.flatHiddenM)}</td></tr>
    <tr><td>Distance to the horizon</td><td>${far ? fmtD(hz.horizonKm) : layered ? 'beyond it' : 'no limit'}</td><td>${flatHorizon}</td></tr>
    <tr><td>Horizon below eye level</td><td>${layered && !far ? '<span class="dim">n/a</span>' : deg(hz.dipDeg, 2)}</td>
      <td>${deg(flatDip, 2)}</td></tr>
    ${
      layered
        ? ''
        : `<tr><td>All of it is hidden beyond</td><td>${Number.isFinite(hz.goneKm) ? fmtD(hz.goneKm) : 'never'}</td><td>never</td></tr>`
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
    <tr><td>Nose comes down each minute</td><td>${fmtAngle(fl.rateDegPerMin)}</td><td>0°</td></tr>
    <tr><td>Each hour</td><td>${fmtAngle(fl.rateDegPerMin * 60)}</td><td>0°</td></tr>
    <tr><td>Over ${fmtTime(fl.minutes)}</td><td>${fmtAngle(fl.turnDeg)}</td><td>0°</td></tr>
    <tr><td>Once right round takes</td><td>${fmtTime(fl.hoursRound * 60)}</td><td class="dim">no way round</td></tr>
    <tr><td>Flying dead straight for ${fmtTime(fl.minutes)} gains</td><td>${fmtH(fl.climbM)}</td><td>nothing</td></tr>`;
  $('fl-verdict').textContent =
    'Either way the pilot pushes nothing and feels nothing: an aircraft trimmed to hold its height follows the ' +
    'ground beneath it. So what pilots do, or do not do, with the nose cannot tell the two models apart.';
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
  $('ob-note').hidden = !observations.length;

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

function bindEarthControls() {
  $('earth-kml').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([currentKml()], { type: 'application/vnd.google-earth.kml+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'globedart.kml';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Saved globedart.kml');
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
const SUN_DEMO = { follow: true, sightLines: false, flatLighting: 'model', stars: false, trails: false };
const STAR_DEMO = { follow: true, sightLines: true, flatLighting: 'model', stars: true, trails: true };

/** The middle of the night at the observer, so the real sky is dark. */
function goToMidnight() {
  const noon = sunEvents(state.date, state.lat, state.lon).noon ?? state.date;
  state.date = new Date(noon.getTime() + 12 * 3600000);
}

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
  STARS_OFF,
};

const INTRO = {
  title: 'How to use this',
  body: () => `
    <p>The left side is the globe model, the right side is the flat model. Both are shown the same moment and the
    same observer. Top row: the view from outside. Bottom row: what the observer should see in the sky.</p>
    <p>The <b class="m">teal ring</b> marks where the sun is actually measured to be. A model is right when its sun
    sits inside the ring.</p>
    <p class="try">Take the tour, pick a demonstration above, or change the time, the place and the flat-model
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

// ---------- the guided tour ----------

const TOUR_END = {
  title: 'What to go and check',
  body: () => `
    <p>None of that has to be taken on trust. Every step was something anyone can go and look at:</p>
    <ol class="tour-list">${TOUR.map((id) => `<li><b>${esc(DEMOS[id].label)}.</b> ${esc(DEMOS[id].check)}</li>`).join('')}</ol>
    <p class="try">The other demonstrations along the top cover the pole star, December daylight, the horizon from
    an airliner, photographs taken from "too far away", and what pilots do. "Your own measurements" checks both
    models against numbers of your own.</p>`,
};

/** Puts an argument on show: its scene, its tool, and the pair of views a phone starts with. */
function showArgument(id) {
  Object.assign(state, { demo: id, playing: false, sailing: false, flying: false });
  DEMOS[id].apply(app);
  setMode(DEMOS[id].tool);
  setPair(DEMOS[id].pair);
  requestUpdate();
}

/** Moves the tour to a step. The step opens on its question; the views are left as they were until it is answered. */
function tourGo(step) {
  state.tour = { step: clamp(step, 0, TOUR.length), shown: false };
  Object.assign(state, { demo: null, playing: false, sailing: false, flying: false });
  requestUpdate();
}

function tourShow() {
  const id = state.tour && TOUR[state.tour.step];
  if (!id) return;
  state.tour.shown = true;
  showArgument(id);
}

function tourLeave() {
  state.tour = null;
  requestUpdate();
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
  // Keep the sun in view, or the chosen star when the stars are on.
  const s = c.stars;
  const obs = s ? s.measured[s.selected] : c.obs;
  const flat = s ? s.flat[s.selected] : c.flat;
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
    renderDemo(hz);
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
  let flatText =
    `Sun ${deg(c.flat.el)} above the horizon, bearing ${bearing(c.flat.az)}\n` +
    `Width ${deg(c.flat.sizeDeg, 2)}, and ${deg(flatMiss)} from where it is measured` +
    (c.flat.lit ? '' : '\nBeyond its light range, yet in plain line of sight');
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
  const skyStars = (model, trails) =>
    s && { model, measured: s.measured, mags: s.mags, lines: s.lines, trails, selected: s.selected, name: s.name };
  globeSky.update(c.globe, c.obs, true, globeText, c.own, skyStars(s?.globe, s?.globeTrails));
  flatSky.update(c.flat, c.obs, c.flat.lit, flatText, c.own, skyStars(s?.flat, s?.flatTrails));
  const views = $('views');
  views.classList.toggle('has-own', c.ownLines.length > 0);
  views.classList.toggle('has-route', !!c.route);
  views.classList.toggle('has-stars', !!s);
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
  renderRoutes(c);
  renderDemo(c);
  syncInputs();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 300);
}

// ---------- result panels ----------

// The lift the air really gives at this height, and the lift each model would
// need for its plain geometry to land on the measurement.
function bendingRow(obs, globe, flat) {
  const show = (x, d) => (Math.abs(x) < 0.005 ? 'none' : `${deg(Math.abs(x), d)}${x < 0 ? ' down' : ''}`);
  const fits = (x) => (Math.abs(x - obs.lift) <= 0.1 ? 'good' : 'bad');
  // A model that needs more lift than the air gives has the direction spelled out.
  const need = (x, d) => (fits(x) === 'bad' && x >= 0.005 ? `${show(x, d)} up` : show(x, d));
  // Well below the horizon the ground is in the way and "lift" stops meaning anything.
  const hidden = obs.el < -1;
  const real = hidden ? '<td class="dim">n/a</td>' : `<td>${show(obs.lift, 2)}</td>`;
  const globeNeed = obs.el - globe.trueEl;
  const flatNeed = obs.el - flat.trueEl;
  return `<tr><td>Lift from the air</td>${real}
    ${hidden ? '<td class="dim">n/a</td>' : `<td class="${fits(globeNeed)}">${need(globeNeed, 2)}</td>`}
    <td class="${fits(flatNeed)}">${need(flatNeed, 1)}</td></tr>`;
}

function renderCompare(c, flatMiss) {
  const globeMiss = skySeparation(c.obs, c.globe);
  const cls = (miss) => (miss > 1 ? 'bad' : 'good');
  const up = c.obs.el > -0.833;
  $('compare').tBodies[0].innerHTML = `
    <tr><td>Elevation</td><td>${deg(c.obs.el)}</td><td>${deg(c.globe.el)}</td>
      <td class="${Math.abs(c.flat.el - c.obs.el) > 1 ? 'bad' : ''}">${deg(c.flat.el)}</td></tr>
    <tr><td>Bearing</td><td>${bearing(c.obs.az)}</td><td>${bearing(c.globe.az)}</td>
      <td class="${Math.abs(wrap180(c.flat.az - c.obs.az)) > 1 ? 'bad' : ''}">${bearing(c.flat.az)}</td></tr>
    <tr><td>Sun's width</td><td>${deg(c.obs.sizeDeg, 2)}</td><td>${deg(c.globe.sizeDeg, 2)}</td>
      <td class="${Math.abs(c.flat.sizeDeg - c.obs.sizeDeg) > 0.03 ? 'bad' : ''}">${deg(c.flat.sizeDeg, 2)}</td></tr>
    <tr><td>Sun visible?</td><td>${up ? 'yes' : 'no, set'}</td><td>${c.globe.el > -0.833 ? 'yes' : 'no, set'}</td>
      <td class="${up ? '' : 'bad'}">yes</td></tr>
    <tr><td>Miss</td><td class="dim">n/a</td><td class="${cls(globeMiss)}">${deg(globeMiss, 2)}</td>
      <td class="${cls(flatMiss)}">${deg(flatMiss, 1)}</td></tr>
    ${bendingRow(c.obs, c.globe, c.flat)}`;
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
            : `<p class="hint">For the flat model to match this elevation, its sun would have to be
               <b class="f">${km(s.implied)}</b> up.</p>`;
        const far =
          s.globeMiss > 10
            ? `<p class="hint">This is a long way from the published position for that time and place. It is worth
               double-checking the time zone and the location.</p>`
            : '';
        return `<div class="own-card ${isShown(m) ? 'shown' : ''}" data-i="${i}">
          <div class="own-head">
            <div>${m.label ? `<b>${esc(m.label)}</b>` : ''}<small>${whenUtc(m.t)}</small>
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
    const verdict =
      sum.best.rms < 1
        ? `One sun height (about ${km(sum.best.heightKm)}) can match what you have entered so far. That is expected
           with ${n === 1 ? 'a single measurement' : 'so few'}: any one elevation can be explained by choosing a
           height. The test is whether a measurement from another place, or from the same place at another time of
           day, agrees on the same height.`
        : sum.impliedMin !== null && n > 1
          ? `Your measurements put the flat sun at heights from <b class="f">${km(sum.impliedMin)}</b> to
             <b class="f">${km(sum.impliedMax)}</b>. The best single height, ${km(sum.best.heightKm)}, still misses
             by ${deg(sum.best.rms)} on average.`
          : `The best flat sun height for this, ${km(sum.best.heightKm)}, still misses by ${deg(sum.best.rms)}.`;
    summary =
      `<p class="hint">Typical miss across your ${n} measurement${n === 1 ? '' : 's'}:</p>` +
      bar('Globe', sum.globeRms, 'var(--globe)') +
      bar('Flat, as set', sum.flatRms, 'var(--flat)') +
      bar('Flat, best', sum.best.rms, 'var(--flat)') +
      `<p class="hint">${verdict}</p>
       <p class="hint">A stick and a tape measure are good to a degree or two, so expect even a correct model to miss
       by about that much.</p>
       <button data-act="fit">Use the sun height that best fits my measurements</button>`;
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
  $('fit-scope').textContent =
    `Typical miss across ${REF_CITIES.length} cities, every hour of ${isoDay(state.date)} (UTC), ` +
    `counting daytime only.`;
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
    `Typical miss across ${STARS.length} stars seen from ${REF_CITIES.length} cities, counting only stars that are ` +
    `really above the horizon. ${fit.best ? `No height for the stars does better than ${deg(fit.best.rms)}.` : ''}`;

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
  if (tour?.shown && state.demo !== TOUR[tour.step]) tour.shown = false;
  const ended = !!tour && tour.step >= TOUR.length;
  const asking = !!tour && !ended;
  const demo = ended
    ? TOUR_END
    : asking
      ? DEMOS[TOUR[tour.step]]
      : state.demo
        ? DEMOS[state.demo]
        : { sky: INTRO, horizon: HORIZON_INTRO, flight: FLIGHT_INTRO }[state.mode];
  $('tour-bar').hidden = !tour;
  $('tour-end').hidden = !ended;
  $('tour-ask').hidden = !asking;
  if (tour) {
    $('tour-step').textContent = ended ? 'Tour: the end' : `Tour: step ${tour.step + 1} of ${TOUR.length}`;
    $('tour-back').disabled = tour.step === 0;
    $('tour-next').hidden = ended;
    $('tour-next').textContent = tour.step === TOUR.length - 1 ? 'Finish' : 'Next';
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
  // A step's explanation waits until its question has been answered.
  $('demo-body').innerHTML = asking && !tour.shown ? '' : demo.body(c, app);
  for (const btn of document.querySelectorAll('#demos button')) {
    btn.classList.toggle('active', btn.dataset.demo === state.demo);
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
  $('stars').checked = state.stars;
  $('star').value = state.star;
  $('star-height').value = heightToSlider(state.starHeightKm);
  $('star-height-label').textContent = niceHeight(state.starHeightKm);
  $('trails').checked = state.trails;
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
    state.refraction === 'off'
      ? 'No bending: every position is plain geometry.'
      : custom
        ? `This air bends light ${change ? `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than` : 'the same as'} standard air. ` +
          'Use the pressure where you stand: weather reports adjust it to sea level.'
        : 'Standard air, 10 °C and 1010 hPa. The same lift is applied to the measurement and to both models.';
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
  // Stars
  const featured = new Set(FEATURED_STARS.map(([name]) => name));
  $('star').innerHTML =
    '<optgroup label="Good ones to start with">' +
    FEATURED_STARS.map(([name, note]) => `<option value="${name}">${name}${note ? ` (${note})` : ''}</option>`).join('') +
    '</optgroup><optgroup label="Other bright stars">' +
    STARS.filter((star) => !featured.has(star.name))
      .map((star) => star.name)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `<option>${name}</option>`)
      .join('') +
    '</optgroup>';
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
  bindHorizonControls();
  bindFlightControls();
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

  $('demos').insertAdjacentHTML(
    'beforeend',
    ARGUMENTS.map((a) => `<button data-demo="${a.id}" title="${esc(a.claim)}">${esc(a.label)}</button>`).join(''),
  );
  for (const btn of document.querySelectorAll('#demos button[data-demo]')) {
    btn.addEventListener('click', () => {
      // Picking a demonstration directly leaves the tour.
      state.tour = null;
      showArgument(btn.dataset.demo);
    });
  }
  $('tour-start').addEventListener('click', () => tourGo(0));
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
  const showMethod = () => {
    const shadow = $('m-method').value === 'shadow';
    $('m-angle-fields').hidden = shadow;
    $('m-shadow-fields').hidden = !shadow;
    $('m-az-label').textContent = shadow
      ? 'Compass bearing the shadow points (°, optional)'
      : 'Compass bearing to the sun (°, optional)';
  };
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
    const shadow = $('m-method').value === 'shadow';
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
    });
    if (!m) return toast('That measurement could not be read');
    const before = measurements.length;
    measurements = mergeMeasurements(measurements, [m]);
    if (measurements.length === before) return toast('That measurement is already in the list');
    saveMeasurements();
    state.date = new Date(m.t);
    state.playing = false;
    for (const id of ['m-el', 'm-shadow', 'm-az', 'm-label', 'm-temp']) $(id).value = '';
    showShadowResult();
    toast('Measurement added');
    return requestUpdate();
  });

  $('own').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'fit') {
      const best = summariseMeasurements(measurements, flatParams(), currentAir())?.best;
      if (!best) return;
      state.sunHeightKm = best.heightKm;
      toast(`Best fit to your measurements: ${km(best.heightKm)}, off by ${deg(best.rms)}`);
      requestUpdate();
      return;
    }
    const m = measurements[Number(btn.closest('.own-card')?.dataset.i)];
    if (!m) return;
    if (btn.dataset.act === 'show') {
      state.date = new Date(m.t);
      state.playing = false;
      state.follow = true;
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
    rf: { off: 0, standard: 1, custom: 2 }[state.refraction],
  });
  if (state.refraction === 'custom') {
    p.set('tc', state.tempC);
    p.set('ph', state.pressureHpa);
  }
  if (state.demo) p.set('demo', state.demo);
  if (state.tour) {
    p.set('ts', state.tour.step + 1);
    if (state.tour.shown) p.set('tv', 1);
  }
  if (state.stars) {
    p.set('st', 1);
    p.set('star', state.star);
    p.set('sh', Math.round(state.starHeightKm));
    if (state.trails) p.set('tr', 1);
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
  if (DEMOS[p.get('demo')]) state.demo = p.get('demo');
  const tourStep = num('ts', 1, TOUR.length + 1);
  state.tour = tourStep === null ? null : { step: Math.round(tourStep) - 1, shown: p.get('tv') === '1' };
  if (state.tour && !state.tour.shown) state.demo = null;
  state.stars = p.get('st') === '1';
  state.trails = p.get('tr') === '1';
  if (starIndex(p.get('star')) >= 0) state.star = p.get('star');
  state.starHeightKm = num('sh', MIN_HEIGHT_KM, MAX_HEIGHT_KM) ?? state.starHeightKm;
  const [from, to] = (p.get('rt') ?? '').split('~');
  state.route = city(from) && city(to) && from !== to ? { from, to } : null;
  state.mode = { h: 'horizon', f: 'flight' }[p.get('v')] ?? 'sky';
  state.speedKmh = num('fs', ...FLIGHT_LIMITS.speedKmh) ?? state.speedKmh;
  state.altitudeM = num('fa', ...FLIGHT_LIMITS.altitudeM) ?? state.altitudeM;
  state.flightMinutes = num('fm', ...FLIGHT_LIMITS.minutes) ?? state.flightMinutes;
  if (['ship', 'building', 'lighthouse'].includes(p.get('tg'))) state.shape = p.get('tg');
  state.targetM = num('th', ...HZ_LIMITS.targetM) ?? state.targetM;
  state.targetKm = num('td', ...HZ_LIMITS.targetKm) ?? state.targetKm;
  state.eyeM = num('eh', ...HZ_LIMITS.eyeM) ?? state.eyeM;
  state.k = num('k', 0, 1) ?? state.k;
  state.layers = p.get('ly') === '1';
  state.airC = num('at', -20, 40) ?? state.airC;
  state.waterC = num('wt', -2, 35) ?? state.waterC;
  state.layerM = num('lm', 1, 50) ?? state.layerM;
  state.lapse100 = num('lg', -1, 2) ?? state.lapse100;
  if (p.has('u')) state.units = p.get('u') === 'i' ? 'imperial' : 'metric';
  if (state.demo && DEMOS[state.demo].tool !== state.mode) state.demo = null;
  // Measurements that came with the link are added to the ones already here.
  measurements = mergeMeasurements(measurements, decodeMeasurements(p.get('m')));
  observations = mergeObservations(observations, decodeObservations(p.get('o')));
}

// ---------- start ----------

async function start() {
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
  globeSky = new SkyView($('globe-sky'), { onLook });
  flatSky = new SkyView($('flat-sky'), { onLook });
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
  setMode(state.mode);
  setPair(state.demo ? DEMOS[state.demo].pair : 'outside');
  window.addEventListener('resize', requestUpdate);
  // A link pasted into a tab that already has the app open changes only the hash.
  window.addEventListener('hashchange', () => {
    readHash();
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
