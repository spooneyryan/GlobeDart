// What every number on the page means and how it is worked out.
//
// Each entry is shown in an info box (see info.js) and, for the ones marked
// `maths`, in the "All the maths" list. An entry has:
//   tool    which tool it belongs to: 'sky', 'horizon' or 'flight'
//   title   heading of the box
//   maths   true if it works a formula through with the numbers on show
//   code    where the calculation lives: [file in js/, function, function, ...]
//   body(data, app)   the explanation as HTML
//
// `data` is what the tool has just worked out (see compute, computeHorizon and
// computeFlight in main.js) and `app` holds the helpers that format numbers.
// The numbers shown here are the ones the models produced: nothing is worked
// out a second time, so the explanation cannot drift from the calculation.
// tools/check-maths.mjs checks that every function named in `code` exists.
import { DEG, EARTH_RADIUS_KM, SUN_RADIUS_KM, MOON_RADIUS_KM, wrap180 } from './astro.js';
import { skySeparation, globeAngleDeg } from './models.js';
import { STANDARD_AIR, airFactor, standardLift } from './refraction.js';
import { K_STANDARD, STANDARD_GROUND_AIR, OVERTURNING_LAPSE, dipDeg, sunSinkDegPerHour, secondSunsetSeconds } from './horizon.js';
import { subsolarPoint } from './astro.js';
import { schulerMinutes } from './flight.js';

const KM_PER_DEGREE = EARTH_RADIUS_KM * DEG; // along the ground, and on the flat map
const round = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const latitude = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`;
const longitude = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'E' : 'W'}`;
const per100 = (lapse) => `${Math.abs(lapse * 100).toFixed(2)} °C ${lapse < 0 ? 'colder' : 'warmer'} per 100 m`;

/** One line of working: what the quantity is, how it is found, and its value. */
const step = (what, how, value) =>
  `<div class="step"><span>${what}</span>${how ? `<code>${how}</code>` : ''}<b>${value}</b></div>`;
const steps = (...lines) => `<div class="steps">${lines.filter(Boolean).join('')}</div>`;
const heading = (model, text) => `<h4 class="${model}">${text}</h4>`;

/** The air the sun-and-stars tool is set to: null for none. */
function skyAir(state) {
  if (state.refraction === 'off') return null;
  return state.refraction === 'custom' ? { tempC: state.tempC, pressureHpa: state.pressureHpa } : STANDARD_AIR;
}

export const EXPLAIN = {
  // ---------- sun, stars and maps ----------

  'sky.measured': {
    tool: 'sky',
    title: 'Where "measured" comes from',
    code: [['astro.js', 'observedSun', 'subsolarPoint']],
    body: (c, { km }) => `
      <p>"Measured" is where astronomers' published tables put the sun for this time and place. It stands in for
      what you would measure yourself with a stick's shadow, a compass and a clock, and it agrees with careful
      measurements to a small fraction of a degree.</p>
      <p>Neither model is given that answer. Each is told one fact only: the place on Earth where the sun is
      directly overhead at this moment.</p>
      ${steps(
        step('The sun is overhead at', '', `${latitude(c.sub.lat)}, ${longitude(c.sub.lon)}`),
        step('Its distance from the Earth', '', km(c.sub.distKm)),
      )}`,
  },

  'sky.elevation': {
    tool: 'sky',
    title: "How high each model puts the sun",
    maths: true,
    code: [['models.js', 'globePredict', 'flatPredict']],
    body(c, { state, deg, km }) {
      const lift = (m) => (Math.abs(m.el - m.trueEl) < 0.005 ? '' : step('Lift from the air', 'see "Lift from the air"', `+ ${deg(m.el - m.trueEl, 2)}`));
      return `
      <p>The globe's sun is so far away that its light arrives in parallel rays. Its height is then 90° less the
      angle round the Earth between you and the place it is overhead.</p>
      ${heading('globe', 'Globe')}
      ${steps(
        step('Your latitude', 'φ', deg(state.lat, 2)),
        step('Latitude where the sun is overhead', 'δ', deg(c.sub.lat, 2)),
        step('How far east of you that place is', 'Δλ', deg(wrap180(c.sub.lon - state.lon), 2)),
        step('Height by geometry', 'asin(sin φ sin δ + cos φ cos δ cos Δλ)', deg(c.globe.trueEl, 2)),
        lift(c.globe),
        step('Globe says', '', deg(c.globe.el, 2)),
      )}
      <p>The flat model's sun sits at a chosen height above the place it is overhead. Its height in your sky is a
      right-angled triangle.</p>
      ${heading('flat', 'Flat')}
      ${steps(
        step('Distance on the flat map from you to the place under the sun', 'd', km(c.flat.groundKm)),
        step('Height given to the sun', 'H', km(state.sunHeightKm)),
        step('Height by geometry', 'atan(H ÷ d)', deg(c.flat.trueEl, 2)),
        lift(c.flat),
        step('Flat says', '', deg(c.flat.el, 2)),
      )}
      ${steps(step('Measured', '', deg(c.obs.el, 2)))}`;
    },
  },

  'sky.bearing': {
    tool: 'sky',
    title: 'Which way each model puts the sun',
    maths: true,
    code: [['models.js', 'globePredict', 'flatPredict', 'flatVec']],
    body(c, { state, deg, km, bearing }) {
      const east = wrap180(c.sub.lon - state.lon);
      return `
      <p>On the globe it is the direction, where you stand, of the shortest path over the surface to the place the
      sun is overhead.</p>
      ${heading('globe', 'Globe')}
      ${steps(
        step('Your latitude', 'φ', deg(state.lat, 2)),
        step('Latitude where the sun is overhead', 'δ', deg(c.sub.lat, 2)),
        step('How far east of you that place is', 'Δλ', deg(east, 2)),
        step('Bearing', 'atan2(cos δ sin Δλ, cos φ sin δ − sin φ cos δ cos Δλ)', bearing(c.globe.az)),
      )}
      <p>On the flat map every place sits at a distance from the north pole in proportion to how far it is from
      the pole in latitude. The bearing is the direction of the straight line on that map from you to the place
      under the sun, measured clockwise from the line toward the pole.</p>
      ${heading('flat', 'Flat')}
      ${steps(
        step('Your distance from the pole on the map', 'a = (90° − φ) × 111.2 km', km((90 - state.lat) * KM_PER_DEGREE)),
        step("The sun's place, from the pole", 'b = (90° − δ) × 111.2 km', km((90 - c.sub.lat) * KM_PER_DEGREE)),
        step('Angle between the two at the pole', 'Δλ', deg(east, 2)),
        step('Bearing', 'atan2(b sin Δλ, a − b cos Δλ)', bearing(c.flat.az)),
      )}
      ${steps(step('Measured', '', bearing(c.obs.az)))}`;
    },
  },

  'sky.width': {
    tool: 'sky',
    title: 'How wide each model makes the sun look',
    maths: true,
    code: [['astro.js', 'subsolarPoint'], ['models.js', 'flatPredict']],
    body: (c, { state, deg, km }) => `
      <p>The real sun is ${round(2 * SUN_RADIUS_KM)} km across and so far off that its width is the same from
      everywhere on Earth.</p>
      ${heading('globe', 'Measured, and globe')}
      ${steps(
        step("Sun's radius", 'r', km(SUN_RADIUS_KM)),
        step("Sun's distance", 'D', km(c.sub.distKm)),
        step('Width in the sky', '2 × atan(r ÷ D)', deg(c.globe.sizeDeg, 2)),
      )}
      <p>The flat model's sun is close, so it must look smaller the further away it is. It is given the most
      generous size there is: the width that looks right when it is directly overhead.</p>
      ${heading('flat', 'Flat')}
      ${steps(
        step('Height given to the sun', 'H', km(state.sunHeightKm)),
        step('Width it must really have, to look right from underneath', 'w = 2 × H × tan(width ÷ 2)', km(c.flat.sunWidthKm)),
        step('Distance on the map from you to the place under it', 'd', km(c.flat.groundKm)),
        step('Straight-line distance from you to that sun', 's = √(d² + H²)', km(c.flat.slantKm)),
        step('Width it should show from here', '2 × atan(w ÷ 2s)', deg(c.flat.sizeDeg, 2)),
      )}`,
  },

  'sky.miss': {
    tool: 'sky',
    title: 'What "miss" means',
    maths: true,
    code: [['models.js', 'skySeparation']],
    body: (c, { deg }) => `
      <p>The angle on the sky between where a model puts the sun and where it is measured to be. It rolls the
      error in height and the error in direction into one number. For scale, the sun is about half a degree
      wide.</p>
      ${steps(
        step('Two positions, each a height e and a bearing b', '', ''),
        step('Angle between them', 'acos(sin e₁ sin e₂ + cos e₁ cos e₂ cos(b₁ − b₂))', ''),
        step('Globe misses by', '', deg(skySeparation(c.obs, c.globe), 2)),
        step('Flat misses by', '', deg(skySeparation(c.obs, c.flat), 2)),
      )}`,
  },

  'sky.lift': {
    tool: 'sky',
    title: 'Lift from the air',
    maths: true,
    code: [['refraction.js', 'standardLift', 'airFactor', 'lift']],
    body(c, { state, deg }) {
      const air = skyAir(state);
      const trueEl = c.obs.el - c.obs.lift;
      return `
      <p>Air bends light downward, so everything in the sky appears slightly higher than it geometrically is. The
      effect is greatest on the horizon and almost nothing overhead. Air lifts what you see by less than a
      degree, never pushes it down, and cannot change a bearing.</p>
      <p>The same lift is added to the measured position and to both models, so it favours neither.</p>
      ${
        air
          ? steps(
              step("The sun's height by geometry", 'h', deg(trueEl, 2)),
              step('Lift in standard air, in sixtieths of a degree', '1.02 ÷ tan(h + 10.3 ÷ (h + 5.11))', (standardLift(trueEl) * 60).toFixed(1)),
              step('Allowance for the weather', '(P ÷ 1010 hPa) × (283 K ÷ T)', `× ${airFactor(air).toFixed(3)}`),
              step('Lift, in degrees', '', deg(c.obs.lift, 2)),
            )
          : '<p>Bending is switched off, so every position is plain geometry.</p>'
      }
      <p>The last row of the table asks what lift each model would <em>need</em> for its geometry to land on the
      measurement: the measured height less the model's height by geometry.</p>
      ${steps(
        step('Globe needs', 'measured − globe geometry', deg(c.obs.el - c.globe.trueEl, 2)),
        step('Flat needs', 'measured − flat geometry', deg(c.obs.el - c.flat.trueEl, 2)),
      )}`;
    },
  },

  'sky.fit': {
    tool: 'sky',
    title: 'How the score is worked out',
    maths: true,
    code: [['models.js', 'rmsMiss', 'flatFitCurve']],
    body: (c, { REF_CITIES }) => `
      <p>One moment and one place could be a fluke, so each model is scored over a whole day and
      ${REF_CITIES.length} cities spread across the world.</p>
      ${steps(
        step('For every city and every hour of the day on show', 'the miss, in degrees', ''),
        step('Moments when the sun is really down there', 'left out', ''),
        step('Score', '√(average of miss²)', ''),
      )}
      <p>Night is left out because the flat model never lets the sun set, and would score far worse with it in.
      Squaring before averaging makes large misses count for more than small ones.</p>
      <p>"Flat, as set" uses the sun height on the slider. "Flat, best" is the lowest score any height from 100 km
      to 1,000,000 km reaches; the chart shows the score at every height in between.</p>`,
  },

  'sky.implied': {
    tool: 'sky',
    title: 'The sun height each observer implies',
    maths: true,
    code: [['models.js', 'impliedSunHeightKm']],
    body(c, { deg, km }) {
      const day = c.cities.find((x) => x.obs.el > 0 && x.implied !== null);
      return `
      <p>If the earth were flat, with the sun a height H above the place it is overhead, an observer a distance d
      away on the map would see it at a height of atan(H ÷ d). Turned round, each observer's measurement gives
      a value for H. On a flat earth they would all give the same one.</p>
      ${
        day
          ? steps(
              step(`${day.name}: distance on the map to the place under the sun`, 'd', km(day.flat.groundKm)),
              step('Height of the sun measured there', 'e', deg(day.obs.el, 2)),
              step('Height the sun would have to be at', 'H = d × tan(e)', km(day.implied)),
            )
          : '<p>It is night in every one of the cities at this moment.</p>'
      }`;
    },
  },

  'sky.stars': {
    tool: 'sky',
    title: 'How the stars are handled',
    code: [['astro.js', 'starPoints', 'observedStar'], ['models.js', 'globePredict', 'flatPredict']],
    body: (c, { REF_CITIES }) => `
      <p>Every star is treated exactly like the sun. Both models are told the place on Earth it is directly
      overhead, and each works out where you should see it, by the same two calculations.</p>
      <p>The globe puts the stars immeasurably far away. The flat model puts them all at one height, turning
      about the point above the north pole once a day. That height has its own slider.</p>
      <p>If the stars sat at one height above a flat earth, every observer's measured angle would give that same
      height. The table lists what each city's measurement gives.</p>
      <p>The score is the typical miss across all the stars in the list, seen from ${REF_CITIES.length} cities,
      counting only stars that are really above the horizon there.</p>`,
  },

  'sky.own': {
    tool: 'sky',
    title: 'Your own measurements',
    maths: true,
    code: [['measurements.js', 'shadowToElevation', 'shadowToAzimuth', 'scoreMeasurement']],
    body: () => `
      <p>Do not take the published numbers on trust. Measure the sun yourself, enter it, and both models are
      scored against your number instead.</p>
      ${steps(
        step('An upright stick and the length of its shadow on level ground', "sun's height = atan(stick ÷ shadow)", ''),
        step('The compass direction the shadow points', "sun's bearing = that + 180°", ''),
      )}
      <p>With no bearing, only the heights are compared. With one, the miss is the full angle on the sky.</p>
      <p>A single height can always be matched by choosing a sun height for the flat model. The test is whether a
      second measurement, from another place or another time of day, agrees on the same height.</p>
      <p>A stick and a tape measure are good to a degree or two, so expect even the right model to be off by about
      that much.</p>`,
  },

  'sky.bearings': {
    tool: 'sky',
    title: 'Giving a bearing',
    body: () => `
      <p>Bearings run clockwise from true north: east is 90, south 180, west 270.</p>
      <p>A magnetic compass points to magnetic north, which can be several degrees away from true north depending
      on where you are. Leave the bearing blank if you are unsure: the heights alone are still compared.</p>`,
  },

  'sky.distance': {
    tool: 'sky',
    title: 'Distances and the speed a flight needs',
    maths: true,
    code: [['distances.js', 'globeDistanceKm', 'flatDistanceKm', 'routeStats']],
    body(c, { deg, km, kmh, hoursMinutes }) {
      const r = c.route;
      const value = (text) => (r ? text() : '');
      return `
      <p>The two maps disagree about how far apart places are, most of all east to west in the south. A timetable
      settles it: a flight's distance divided by its time has to be a speed an airliner can fly.</p>
      ${r ? `<p><b>${r.a.name} to ${r.b.name}</b></p>` : '<p>Pick a route to see the numbers.</p>'}
      ${heading('globe', 'Globe')}
      ${steps(
        step('The two latitudes', 'φ₁, φ₂', value(() => `${deg(r.a.lat, 2)}, ${deg(r.b.lat, 2)}`)),
        step('Difference in longitude', 'Δλ', value(() => deg(Math.abs(wrap180(r.b.lon - r.a.lon)), 2))),
        step("Earth's radius", 'R', km(EARTH_RADIUS_KM)),
        step('Shortest distance over the surface', 'R × acos(sin φ₁ sin φ₂ + cos φ₁ cos φ₂ cos Δλ)', value(() => km(r.globeKm))),
      )}
      ${heading('flat', 'Flat')}
      ${steps(
        step('Each place, from the pole on the map', 'a, b = (90° − φ) × 111.2 km',
          value(() => `${km((90 - r.a.lat) * KM_PER_DEGREE)}, ${km((90 - r.b.lat) * KM_PER_DEGREE)}`)),
        step('Straight line between them on the map', '√(a² + b² − 2ab cos Δλ)', value(() => km(r.flatKm))),
      )}
      ${
        r?.hours
          ? `${steps(
              step('Scheduled time, average of the two directions', 't', hoursMinutes(r.hours)),
              step('Speed needed on the globe', 'distance ÷ t', kmh(r.globeKmh)),
              step('Speed needed on the flat map', 'distance ÷ t', kmh(r.flatKmh)),
            )}
            <p>The two directions take different times because of the wind, so the average is used. Flight times
            are the scheduled ones for November 2026; look any of them up in an airline timetable.</p>`
          : ''
      }`;
    },
  },

  'sky.flat': {
    tool: 'sky',
    title: "The flat model's settings",
    body: () => `
      <p>The flat model here is the usual one: the north pole in the middle, and a small sun circling above. It is
      given every adjustment its supporters propose. Tune them and watch whether any setting matches the
      measurements.</p>
      <p><b>Sun height</b> is how far above the flat surface the sun sits. The globe has no such setting: it has
      nothing to adjust.</p>
      <p><b>How far its light reaches</b> is the size of the patch the sun lights, like a spotlight. It decides
      where the flat map is shaded as day. It does not move the sun, so a place "beyond its light" still has the
      sun in plain line of sight.</p>
      <p><b>Flat map shading</b> switches between that spotlight and the places where it really is day.</p>`,
  },

  'sky.air': {
    tool: 'sky',
    title: 'Bending of light by the air',
    maths: true,
    code: [['refraction.js', 'standardLift', 'airFactor', 'lift']],
    body(c, { state }) {
      const air = skyAir(state);
      return `
      <p>Air bends light downward, which lifts everything in the sky a little: about half a degree on the horizon,
      and almost nothing overhead. The same lift is applied to the measured position and to both models.</p>
      <p><b>Off</b> shows plain geometry. <b>Standard air</b> is 10 °C at 1010 hPa. <b>My conditions</b> allows
      for your own temperature and pressure: use the pressure where you are standing, not the sea-level figure
      from a weather report.</p>
      ${steps(
        step('Lift in standard air, in sixtieths of a degree, for a height of h degrees', '1.02 ÷ tan(h + 10.3 ÷ (h + 5.11))', ''),
        step('Allowance for the weather', '(P ÷ 1010 hPa) × (283 K ÷ T)', air ? `× ${airFactor(air).toFixed(3)}` : 'off'),
      )}`;
    },
  },

  'sky.earth': {
    tool: 'sky',
    title: 'Google Earth',
    code: [['earth.js', 'earthUrl', 'buildKml']],
    body: () => `
      <p>The link opens Google Earth looking down at the observer, or at the route if one is on show.</p>
      <p>The file holds the observer, the place the sun is overhead, the star being followed and the route. Open
      it in Google Earth to see the real ground under them.</p>
      <p>Google Earth is itself drawn as a globe, so it is somewhere to look, not a proof of anything. Nothing is
      sent to Google until you follow the link.</p>`,
  },

  // ---------- the moon ----------

  'moon.about': {
    tool: 'sky',
    title: 'How the moon is handled',
    code: [['astro.js', 'moonPoint', 'observedMoon', 'moonPhase'], ['models.js', 'globePredictNear', 'flatPredict']],
    body: (c, { state, km }) => `
      <p>The moon is treated like the sun and the stars. Both models are told the place on Earth it is directly
      overhead, and each works out where you should see it.</p>
      <p>The globe is told one thing more: how far away the moon is${c.moon ? `, ${km(c.moon.point.distKm)} at this moment` : ''}.
      It is close enough that where you stand on the Earth shifts it in your sky by up to a degree, twice its own
      width.</p>
      <p>The flat model puts the moon at a height of its own, ${km(state.moonHeightKm)} as set, and treats it as a
      ball lit by the flat model's sun. Some hold instead that the moon gives its own light. That version says
      nothing about why the moon has phases, or why its lit side always faces the sun, so there is nothing in it
      to work out.</p>`,
  },

  'moon.position': {
    tool: 'sky',
    title: 'Where each model puts the moon',
    maths: true,
    code: [['models.js', 'globePredictNear', 'globeAngleDeg', 'flatPredict']],
    body(c, { state, deg, km }) {
      const m = c.moon;
      if (!m) return '<p>Turn on "Show the moon" to see the working.</p>';
      const gamma = globeAngleDeg(state.lat, state.lon, m.point.lat, m.point.lon);
      return `
      <p>For the sun, the globe model treats the light as arriving in parallel rays. The moon is too close for
      that: someone standing under it is one Earth radius nearer to it than someone who sees it on the horizon.</p>
      ${heading('globe', 'Globe')}
      ${steps(
        step('Angle round the Earth from you to the place the moon is overhead', 'γ', deg(gamma, 2)),
        step("Earth's radius over the moon's distance", 'R ÷ D', `${km(EARTH_RADIUS_KM)} ÷ ${km(m.point.distKm)}`),
        step('Height by geometry', 'atan((cos γ − R ÷ D) ÷ sin γ)', deg(m.globe.trueEl, 2)),
        step('If the moon were treated as far away, it would be', '90° − γ', deg(90 - gamma, 2)),
        step('Globe says, with the lift from the air', '', deg(m.globe.el, 2)),
      )}
      ${heading('flat', 'Flat')}
      ${steps(
        step('Distance on the flat map from you to the place under the moon', 'd', km(m.flat.groundKm)),
        step('Height given to the moon', 'H', km(state.moonHeightKm)),
        step('Height by geometry', 'atan(H ÷ d)', deg(m.flat.trueEl, 2)),
        step('Flat says, with the lift from the air', '', deg(m.flat.el, 2)),
      )}
      ${steps(step('Measured', '', deg(m.obs.el, 2)))}`;
    },
  },

  'moon.phase': {
    tool: 'sky',
    title: "How much of the moon's face is lit",
    maths: true,
    code: [['models.js', 'litFraction', 'globePlace', 'flatPlace']],
    body(c, { state, km, percent }) {
      const m = c.moon;
      if (!m) return '<p>Turn on "Show the moon" to see the working.</p>';
      const angle = (lit) => `${(Math.acos(2 * lit - 1) / DEG).toFixed(1)}°`;
      return `
      <p>The moon is a ball with one half in sunlight. How much of the lit half you see depends on one angle: the
      angle at the moon between the sun and you. With the sun behind you it is 0° and the face is full. With the
      sun behind the moon it is 180° and the face is dark.</p>
      ${steps(step('Fraction of the face lit', '(1 + cos(angle)) ÷ 2', ''))}
      <p>The same rule is used for both models. Only where they put the sun, the moon and you differs.</p>
      ${heading('globe', 'Globe')}
      ${steps(
        step('The sun is', '', `${km(c.sub.distKm)} away`),
        step('The moon is', '', `${km(m.point.distKm)} away`),
        step('Angle at the moon between the sun and you', '', angle(m.lit.globe)),
        step('Face lit', '', percent(m.lit.globe)),
      )}
      <p>The sun is so much further off than the moon that everyone on Earth is in nearly the same direction from
      the moon, and sees the same phase.</p>
      ${heading('flat', 'Flat')}
      ${steps(
        step('The sun and the moon are both above the map, at', '', `${km(state.sunHeightKm)} and ${km(state.moonHeightKm)}`),
        step('You are on the ground, looking up', '', ''),
        step('Angle at the moon between the sun and you', '', angle(m.lit.flat)),
        step('Face lit', '', percent(m.lit.flat)),
      )}
      <p>Here the angle changes with where you stand. Directly under the flat model's moon the sunlight always
      comes from the side, so the most you could see is half.</p>
      ${steps(step('Measured, the same everywhere', '', percent(m.lit.measured)))}`;
    },
  },

  'moon.face': {
    tool: 'sky',
    title: 'Who sees which face of the moon',
    maths: true,
    code: [['models.js', 'viewsApartDeg', 'globePlace', 'flatPlace']],
    body(c, { state, deg, km }) {
      const m = c.moon;
      if (!m) return '<p>Turn on "Show the moon" to see the working.</p>';
      const seen = m.cities.filter((x) => x.obs.el > 0);
      const far = seen.reduce((a, b) => (b.turnFlat > a.turnFlat ? b : a), seen[0]);
      return `
      <p>Two people looking at the moon see the same face only if they look at it from the same direction. The
      angle at the moon between their two lines of sight is how far round it one of them is from the other.</p>
      <p>"Lit, measured" is the same in every row because the published figure does not depend on where you are.
      "Lit, flat" and "Face turned" are what a ball ${km(state.moonHeightKm)} above a flat earth would show each
      city, compared with the observer.</p>
      ${
        far
          ? steps(
              step(`${far.name}: view turned from yours, on the globe`, 'angle at the moon', deg(far.turnGlobe, 2)),
              step('The same on the flat model', 'angle at the moon', deg(far.turnFlat, 0)),
              step('The most it can be on the globe', "atan(Earth's width ÷ moon's distance)", deg(Math.atan((2 * EARTH_RADIUS_KM) / m.point.distKm) / DEG, 2)),
            )
          : '<p>The moon is not up in any of the cities at this moment.</p>'
      }
      <p>Everyone sees the same markings on the moon. That fits a moon far away, and does not fit one a few
      thousand kilometres overhead.</p>`;
    },
  },

  'moon.eclipse': {
    tool: 'sky',
    title: "The Earth's shadow on the moon",
    maths: true,
    code: [['models.js', 'earthShadow'], ['astro.js', 'publishedEclipse']],
    body(c, { state, deg, km }) {
      const m = c.moon;
      if (!m) return '<p>Turn on "Show the moon" to see the working.</p>';
      const s = m.shadow;
      return `
      <p>On the globe the Earth blocks sunlight and casts a shadow straight away from the sun. The sun is bigger
      than the Earth, so the fully dark part of the shadow narrows with distance. At the moon it is still much
      wider than the moon.</p>
      ${heading('globe', 'Globe')}
      ${steps(
        step("Earth's radius", 'R', km(EARTH_RADIUS_KM)),
        step("Sun's radius and distance", 'r, d', `${km(SUN_RADIUS_KM)}, ${km(c.sub.distKm)}`),
        step("Moon's distance", 'D', km(m.point.distKm)),
        step('Radius of the dark shadow at the moon, with a fiftieth added for the air', '1.02 × (R − D × (r − R) ÷ d)', km(s.shadowKm)),
        step('The same as an angle seen from Earth', '', deg(s.shadowDeg, 2)),
        step("Moon's radius as an angle", `atan(${Math.round(MOON_RADIUS_KM)} km ÷ D)`, deg(s.moonDeg, 2)),
        step('How far the moon is from the point opposite the sun', '', deg(s.offDeg, 2)),
        step('Globe says', '', s.kind === 'none' ? 'no eclipse' : `a ${s.kind} eclipse`),
        step('Published', '', m.published === 'none' ? 'no eclipse' : `a ${m.published} eclipse`),
      )}
      <p>The moon is in the shadow when its distance from that point is less than the shadow's radius plus its
      own, and wholly inside when it is less than the shadow's radius minus its own.</p>
      ${heading('flat', 'Flat')}
      <p>The flat model's sun and moon are both above the surface, ${km(state.sunHeightKm)} and
      ${km(state.moonHeightKm)} up. The Earth is never between them, so no shadow of the Earth can fall on the
      moon.</p>`;
    },
  },

  // ---------- over the horizon ----------

  'hz.views': {
    tool: 'horizon',
    title: 'The well-known views',
    code: [['presets.js', 'viewSizes'], ['distances.js', 'globeDistanceKm']],
    body: () => `
      <p>These are real places where people look a long way across water, and argue about what they see. Choosing
      one sets the height, the distance and the height of your eye to match it.</p>
      <p>Every figure has a source, listed under the picker. The distance is worked out from the two positions,
      and the heights are measured from the surface of the water the line of sight crosses, not from sea level:
      a tower beside a lake stands on ground above the lake, and both count.</p>
      <p>The view is set up for a person standing at the water's edge in standard air. Change the height of your
      eye or the air to match the day a particular photograph was taken.</p>`,
  },

  'hz.eye': {
    tool: 'horizon',
    title: 'Heights',
    body: () => `
      <p>Both heights are measured up from the water: the height of your eye, and the height of the top of the
      thing you are looking at.</p>
      <p>1.7 m is a person standing at the water's edge. A few metres is a pier or a low cliff. An airliner
      cruises at about 10,000 m.</p>`,
  },

  'hz.air': {
    tool: 'horizon',
    title: 'How the air bends light near the ground',
    maths: true,
    code: [['horizon.js', 'coefficientFromWeather', 'lapseForCoefficient', 'effectiveRadiusKm']],
    body: (hz, { fmtD }) => `
      <p>Air bends light toward the ground a little, so you see slightly further round a curve. The same air is
      applied to both models.</p>
      <p>The bending is given the way surveyors give it, as a number k: the Earth's radius divided by the radius
      of the light's curve. At 0 light travels straight. At 1 it follows the surface all the way round. The
      standard atmosphere gives ${K_STANDARD}.</p>
      <p>It follows from how the air's temperature changes with height, which is something you can measure:</p>
      ${steps(
        step('Pressure in hPa, temperature in kelvin, change of temperature per metre of height', 'k = 503 × P ÷ T² × (0.0343 + dT/dh)', ''),
        step('As set', 'k', hz.k.toFixed(2)),
        step('Which is air that gets', '', hz.k > 0 ? per100(hz.lapse) : 'no bending at all'),
        step('It makes the Earth behave as if its radius were', 'R′ = R ÷ (1 − k)', Number.isFinite(hz.radiusKm) ? fmtD(hz.radiusKm) : 'without limit'),
      )}`,
  },

  'hz.layers': {
    tool: 'horizon',
    title: 'Following light through layers of air',
    maths: true,
    code: [['raytrace.js', 'makeAir', 'traceRay', 'traceView']],
    body: () => `
      <p>A single number for the bending treats the air as the same all the way up. Real air is not: next to
      water it takes on the water's temperature, and that thin layer is what makes mirages and lets you see
      "too far".</p>
      <p>With this ticked, the air is described by four things you can measure, and each ray of light is
      followed step by step through it.</p>
      ${steps(
        step('Temperature at a height h: air T, change with height g, water T<sub>w</sub>, layer depth L', 'T + g × h + (T<sub>w</sub> − T) × e<sup>−h ÷ L</sup>', ''),
        step("Air's refractive index, from pressure P and that temperature", 'n = 1 + 0.000079 × P ÷ T', ''),
        step("Change in a ray's direction per metre travelled, on the globe", '1 ÷ (R + h) + dn/dh', ''),
        step('The same on flat ground', 'dn/dh', ''),
      )}
      <p>The only difference between the two models is that one term, the curve of the ground. With water and air
      at the same temperature, this gives the same answers as the single number.</p>`,
  },

  'hz.hidden': {
    tool: 'horizon',
    title: 'How much is hidden',
    maths: true,
    code: [['horizon.js', 'effectiveRadiusKm', 'horizonDistanceKm', 'hiddenHeightM']],
    body(hz, { fmtH, fmtD }) {
      if (hz.traced) {
        return `
        <p>With layers of air on there is no single formula. Rays are sent out from your eye in a fan of
        directions and each is followed to the target's distance. The lowest point on the target that any ray
        reaches is the lowest part you can see; everything below it is hidden.</p>
        ${steps(
          step('Hidden on the globe', 'curved ground', hz.hiddenM > 0 ? fmtH(hz.hiddenM) : 'none'),
          step('Hidden on the flat model', 'flat ground, same air', hz.flatHiddenM > 0 ? fmtH(hz.flatHiddenM) : 'none'),
        )}
        <p>See "Following light through layers of air" for the rule each ray obeys.</p>`;
      }
      const far = Number.isFinite(hz.horizonKm);
      return `
      <p>On the globe the sea curves away, and beyond the horizon it stands between you and the foot of anything
      distant. What is hidden depends only on how far past your horizon the thing is.</p>
      ${heading('globe', 'Globe')}
      ${steps(
        step("Earth's radius, allowing for the bending of light", 'R′ = R ÷ (1 − k)', far ? fmtD(hz.radiusKm) : 'without limit'),
        step('Height of your eye', 'h', fmtH(hz.eyeM)),
        step('Distance to your horizon', 'd<sub>h</sub> = √(2 × R′ × h)', far ? fmtD(hz.horizonKm) : 'no limit'),
        step('Distance to the target', 'd', fmtD(hz.distanceKm)),
        hz.distanceKm > hz.horizonKm
          ? step('Hidden, from the bottom up', '(d − d<sub>h</sub>)² ÷ (2 × R′)', fmtH(hz.hiddenM))
          : step('The target is nearer than your horizon', 'nothing is hidden', 'none'),
      )}
      ${heading('flat', 'Flat')}
      <p>Over a flat surface a straight line from your eye to any part of the target clears the water at every
      distance, so nothing is hidden. Ordinary air bends light downward, which only lifts the view.</p>`;
    },
  },

  'hz.horizon': {
    tool: 'horizon',
    title: 'How far away the horizon is',
    maths: true,
    code: [['horizon.js', 'horizonDistanceKm']],
    body: (hz, { fmtH, fmtD }) => `
      <p>On the globe your horizon is where your line of sight just touches the sea. It moves away as you climb,
      with the square root of your height: four times as high, twice as far.</p>
      ${
        hz.traced
          ? '<p>With layers of air on, it is found by following rays: it is where the highest ray that still reaches the sea touches down.</p>'
          : ''
      }
      ${steps(
        step("Earth's radius, allowing for the bending of light", 'R′', Number.isFinite(hz.radiusKm) ? fmtD(hz.radiusKm) : 'without limit'),
        step('Height of your eye', 'h', fmtH(hz.eyeM)),
        step('Distance to the horizon', '√(2 × R′ × h)', Number.isFinite(hz.horizonKm) ? fmtD(hz.horizonKm) : 'no limit'),
      )}
      <p>On a flat surface there is no such point: the sea would run on until haze or the edge of the map ended
      it.</p>`,
  },

  'hz.dip': {
    tool: 'horizon',
    title: 'How far the horizon sits below eye level',
    maths: true,
    code: [['horizon.js', 'dipDeg']],
    body: (hz, { deg, fmtH, fmtD }) => `
      <p>On the globe the horizon is below a level line through your eye, and drops further the higher you go.
      From a beach it is too little to see. From an airliner it is about 3°, six widths of the full moon.</p>
      ${steps(
        step('Height of your eye', 'h', fmtH(hz.eyeM)),
        step("Earth's radius, allowing for the bending of light", 'R′', Number.isFinite(hz.radiusKm) ? fmtD(hz.radiusKm) : 'without limit'),
        step('Drop below level, as an angle', '√(2 × h ÷ R′)', deg(hz.dipDeg, 2)),
      )}
      <p>On a flat surface the horizon is at eye level from any height.</p>`,
  },

  'hz.gone': {
    tool: 'horizon',
    title: 'Where it goes out of sight altogether',
    maths: true,
    code: [['horizon.js', 'horizonScene', 'horizonDistanceKm']],
    body: (hz, { fmtH, fmtD }) => `
      <p>The top of the target has a horizon of its own. The whole of it is hidden once it is further away than
      your horizon and its own put together.</p>
      ${steps(
        step('Your horizon, from a height h', '√(2 × R′ × h)', Number.isFinite(hz.horizonKm) ? fmtD(hz.horizonKm) : 'no limit'),
        step(`The horizon of something ${fmtH(hz.targetM)} tall`, '√(2 × R′ × H)',
          Number.isFinite(hz.goneKm) ? fmtD(hz.goneKm - hz.horizonKm) : 'no limit'),
        step('All of it is hidden beyond', 'the two added', Number.isFinite(hz.goneKm) ? fmtD(hz.goneKm) : 'never'),
      )}
      <p>On the flat model it never goes out of sight. It only looks smaller.</p>`,
  },

  'hz.range': {
    tool: 'horizon',
    title: 'How much the air can change it',
    code: [['horizon.js', 'hiddenHeightM']],
    body: () => `
      <p>The three rows are the same sight worked out three times: with light travelling dead straight, in the
      standard atmosphere, and in the air as it is set.</p>
      <p>The bending follows how the air's temperature changes with height, and that shifts from hour to hour,
      most of all over water. On a still day over cold water it can be several times the standard amount, and
      then more is in view than the standard figure allows.</p>
      <p>The flat model's answer does not change with the weather, unless the surface is warmer than the air: see
      "What the flat model would need".</p>`,
  },

  'hz.flat': {
    tool: 'horizon',
    title: 'What the flat model would need',
    maths: true,
    code: [['horizon.js', 'flatNeeds', 'lapseForCoefficient']],
    body: (hz) => `
      <p>On the globe, the sea rises between you and the target because the surface curves away faster than the
      light does. A flat surface does not curve at all, so to hide the same amount the light itself would have
      to make up the whole difference, curving <em>upward</em>.</p>
      ${steps(
        step('Bending as set', 'k', hz.k.toFixed(2)),
        step('Bending the flat model needs', 'k − 1', hz.flat.k.toFixed(2)),
        step('The air that gives it: change of temperature per metre', 'k × T² ÷ (503 × P) − 0.0343', per100(hz.flat.lapse)),
        step('The standard atmosphere', '', per100(STANDARD_GROUND_AIR.lapse)),
        step('Air overturns if it cools faster than', '', per100(OVERTURNING_LAPSE)),
      )}
      <p>Air that cools so fast with height is heavier above than below and cannot stay that way through any
      depth. It exists only in a thin layer just above a surface warmer than the air. That layer does hide the
      foot of distant things, on either model, and shows itself as a mirage: tick "Follow light through layers
      of air" and warm the water to see it.</p>`,
  },

  'hz.own': {
    tool: 'horizon',
    title: 'Your own observations',
    maths: true,
    code: [['observations.js', 'impliedCoefficient', 'scoreObservation']],
    body: () => `
      <p>Look at something across water yourself, enter what you saw, and both models are checked against your
      observation. It is recorded with the sizes set at the time.</p>
      <p>The flat model predicts that all of it shows. For the globe, the question is turned round: what bending
      of light would make the globe hide exactly what you saw?</p>
      ${steps(
        step('Hidden height, eye height and distance, all in metres', 'k = 1 − 2 × R × (√hidden + √eye)² ÷ d²', ''),
      )}
      <p>That bending is then put in plain terms: air that cools with height (the usual state by day), air that
      warms with height (an inversion, common over cold water), or light bent upward (a surface warmer than the
      air). Only the first is called a plain fit.</p>
      <p>Seeing all of it, or none of it, does not pin the bending down. It only says "at least" or "at most".</p>
      <p>Judging how much is hidden by eye is rough, and so are most distances and heights, so expect even the
      right model to be off by a few metres. The temperatures are used to check the explanation, not to work out
      the bending: that needs the temperature at several heights along the whole line of sight.</p>`,
  },

  'hz.sunsets': {
    tool: 'horizon',
    title: 'Timing two sunsets',
    maths: true,
    code: [['horizon.js', 'dipDeg', 'sunSinkDegPerHour', 'secondSunsetSeconds', 'radiusFromTwoSunsetsKm']],
    body(hz, { state, deg, fmtH }) {
      const sunLat = subsolarPoint(state.date).lat;
      const rate = sunSinkDegPerHour(state.lat, sunLat);
      const low = state.sunsetLowM;
      const high = state.sunsetHighM;
      const wait = secondSunsetSeconds(low, high, state.lat, sunLat, hz.k);
      return `
      <p>On a globe the horizon drops as you rise, so the sun sets a little later for a higher eye. Watch it set
      from low down, get up quickly, and you can watch it set again. The gap between the two is a measurement of
      the Earth, made with a stopwatch.</p>
      ${steps(
        step(`Horizon below eye level from ${fmtH(low)}`, '√(2 × h ÷ R′)', deg(dipDeg(low, hz.k), 3)),
        step(`And from ${fmtH(high)}`, '√(2 × h ÷ R′)', deg(dipDeg(high, hz.k), 3)),
        step('How fast the sun sinks as it sets, with φ your latitude and δ where the sun is overhead', '15° an hour × √(cos² φ − sin² δ)',
          rate === null ? 'it does not set' : `${deg(rate / 60, 3)} a minute`),
        step('Gap between the two sunsets', 'difference in drop ÷ rate of sinking', wait === null ? 'none' : `${wait.toFixed(1)} s`),
      )}
      <p>Turned round, a timing gives the Earth's radius. With θ the angle the sun sank in the time you measured:</p>
      ${steps(
        step('Radius as the bending of light makes it seem', 'R′ = 2 × (√high − √low)² ÷ θ²', ''),
        step("The Earth's own radius", 'R′ × (1 − k)', ''),
      )}
      <p>Expect to be within a fifth or so. The hard part is judging the instant the last of the sun goes, and a
      second's error matters when the whole gap is ten.</p>
      <p>On the flat model the horizon is at eye level from every height, so getting up brings nothing back.</p>`;
    },
  },

  // ---------- level flight ----------

  'fl.level': {
    tool: 'flight',
    title: 'Why nothing has to be pushed',
    body: () => `
      <p>An aircraft trimmed to hold its height follows the ground beneath it. "Level" means square to the pull
      of gravity, and gravity points at the middle of the Earth, so level turns with the aircraft as it goes
      round. Holding the height on the altimeter <em>is</em> the nose coming down.</p>
      <p>So on both models the pilot pushes nothing and feels nothing. What pilots do, or do not do, with the
      nose cannot tell the two models apart.</p>`,
  },

  'fl.rate': {
    tool: 'flight',
    title: 'How fast the nose comes down',
    maths: true,
    code: [['flight.js', 'pitchRateDegPerMin']],
    body: (fl, { km, fmtSpeed, fmtH, fmtAngle }) => `
      <p>An aircraft that holds its height above a globe is flying round a circle. Its nose turns at the rate it
      goes round that circle: its speed divided by the circle's radius.</p>
      ${steps(
        step('Speed over the ground', 'v', fmtSpeed(fl.speedKmh)),
        step("Earth's radius plus the height flown", 'R + h', `${km(EARTH_RADIUS_KM)} + ${fmtH(fl.altitudeM)}`),
        step('Turning, as an angle each hour', 'v ÷ (R + h)', fmtAngle(fl.rateDegPerMin * 60)),
        step('Each minute', '÷ 60', fmtAngle(fl.rateDegPerMin)),
      )}
      <p>On a flat earth the path is a straight line and the nose never turns.</p>`,
  },

  'fl.round': {
    tool: 'flight',
    title: 'How long once round takes',
    maths: true,
    code: [['flight.js', 'hoursRound']],
    body: (fl, { km, fmtSpeed, fmtH, fmtTime }) => `
      ${steps(
        step('Radius of the circle flown', 'R + h', `${km(EARTH_RADIUS_KM)} + ${fmtH(fl.altitudeM)}`),
        step('Distance once round', '2π × (R + h)', km(2 * Math.PI * (EARTH_RADIUS_KM + fl.altitudeM / 1000))),
        step('Speed over the ground', 'v', fmtSpeed(fl.speedKmh)),
        step('Time', 'distance ÷ v', fmtTime(fl.hoursRound * 60)),
      )}
      <p>In that time the nose turns through a full 360°, which is why the rate is so small.</p>`,
  },

  'fl.climb': {
    tool: 'flight',
    title: 'What flying dead straight would do',
    maths: true,
    code: [['flight.js', 'climbIfStraightM']],
    body: (fl, { km, fmtD, fmtH, fmtTime }) => `
      <p>Suppose the nose really were held still against the stars. The aircraft would fly a straight line while
      the ground curved away beneath it, and its height would grow.</p>
      ${steps(
        step(`Distance flown in ${fmtTime(fl.minutes)}`, 's = v × t', fmtD(fl.distanceKm)),
        step('Distance from the middle of the Earth at the start', 'R + h', km(EARTH_RADIUS_KM + fl.altitudeM / 1000)),
        step('Height gained', '√((R + h)² + s²) − (R + h)', fmtH(fl.climbM)),
      )}
      <p>For short stretches that is close to s² ÷ 2R, so twice the distance gives four times the climb.</p>`,
  },

  'fl.notice': {
    tool: 'flight',
    title: 'The instruments that sense the turning',
    maths: true,
    code: [['flight.js', 'schulerMinutes', 'pitchRateDegPerMin']],
    body: (fl, { fmtAngle }) => `
      <p>An inertial navigation unit works out where an aircraft is from its own motion alone. It senses turning
      against the stars, not against the ground, so it has to be told how fast "down" swings round as it is
      carried over a globe. That allowance is the same rate the nose comes down at.</p>
      ${steps(
        step('Allowance for being carried round the Earth', 'v ÷ (R + h)', `${fmtAngle(fl.rateDegPerMin * 60)} an hour`),
        step("A pendulum as long as the Earth's radius would swing once every", '2π × √(R ÷ g)', `${schulerMinutes().toFixed(1)} minutes`),
      )}
      <p>The second number is the period these units are tuned to, so that their sense of "down" stays true while
      they are moved about. Both settings are built from the Earth's radius. On a flat earth there is no such
      length, and no reason for either.</p>
      <p>Look up "transport rate" and "Schuler tuning" in any text on inertial navigation.</p>`,
  },
};
