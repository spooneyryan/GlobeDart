// Measured sunlight.
//
// Measured: how much sunlight fell on level ground at four of NOAA's stations
// through the two solstices of 2023, as their instruments recorded it
// (data/sunlight.js, written by tools/fetch-sunlight.mjs). This is the one
// demonstration whose measured column is not from the almanac: nobody worked
// these numbers out.
//
// Each model is asked one thing for each five minutes of the day: is it light
// at this place?
//
//   globe   the top edge of the sun is above the horizon, seen through
//           standard air (astro.js, observedSun)
//   flat    the place is within reach of the flat sun's light, the model's own
//           account of day and night (models.js, flatPredict). The reach is
//           the one set in the panel
//
// A reading counts as light when it is over LIGHT_MARK.
import { subsolarPoint, observedSun } from '../astro.js';
import { flatPredict } from '../models.js';
import { SUNLIGHT_STATIONS, SUNLIGHT_DAYS, SUNLIGHT_STEP_MIN } from '../../data/sunlight.js';
import { INK, label, line, day, keeper } from './sketch.js';

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const STEP_H = SUNLIGHT_STEP_MIN / 60;
// The reading above which it counts as light, in W/m². A clear sky gives about this much with the sun's top
// edge on the horizon: at Boulder on 21 December 2023 the reading passed 5 within a few minutes of that, both
// morning and evening.
const LIGHT_MARK = 5;

const STATION = Object.fromEntries(SUNLIGHT_STATIONS.map((s) => [s.id, s]));
const DAY = Object.fromEntries(SUNLIGHT_DAYS.map((d) => [d.id, d]));
/** A length of time in words, to the minute: "45 min", "9 h 15 min", "24 h". */
const hoursMinutes = (h) => {
  const m = Math.round(h * 60);
  if (m > 0 && m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
};
/** A station's name as it reads after "at". */
const at = (station) => (station.id === 'spo' ? 'the South Pole' : station.name);
const startOf = (dayId) => Date.parse(`${DAY[dayId].date}T00:00:00Z`);

/**
 * One station's day, five minutes at a time: the reading, whether that counts
 * as light, and whether each model has it light. Each model is asked at the
 * middle of the five minutes.
 */
export function stationDay(station, dayId, flat) {
  const from = startOf(dayId);
  return station.days[dayId].map((light, i) => {
    const date = new Date(from + (i + 0.5) * SUNLIGHT_STEP_MIN * MINUTE_MS);
    const sun = observedSun(date, station.lat, station.lon);
    return {
      t: date.getTime(),
      light,
      measured: light === null ? null : light > LIGHT_MARK,
      globe: sun.el > -sun.sizeDeg / 2,
      flat: flatPredict(subsolarPoint(date), station.lat, station.lon, flat).lit,
    };
  });
}

/**
 * A day in a few figures: hours of light as measured and by each model, and
 * for how long each model disagrees with the instrument. Stretches with no
 * good reading are left out of all of them.
 */
export function summary(list) {
  const read = list.filter((p) => p.measured !== null);
  const hours = (test) => read.filter(test).length * STEP_H;
  return {
    read: read.length * STEP_H,
    measured: hours((p) => p.measured),
    globe: hours((p) => p.globe),
    flat: hours((p) => p.flat),
    globeWrong: hours((p) => p.globe !== p.measured),
    flatWrong: hours((p) => p.flat !== p.measured),
  };
}

const keep = keeper(16);
/** The flat model's settings that decide where its light falls. */
const flatOf = (state) => ({ sunHeightKm: state.sunHeightKm, lightRangeKm: state.lightRangeKm });
/** Every station's day, kept until the day or the reach of the flat sun's light changes. */
const allStations = (dayId, state) =>
  keep(`${dayId}|${state.lightRangeKm}`, () =>
    SUNLIGHT_STATIONS.map((station) => {
      const list = stationDay(station, dayId, flatOf(state));
      return { station, list, ...summary(list) };
    }),
  );

export default {
  id: 'sunlight',
  group: 'sun',
  label: 'Measured sunlight',
  title: 'Sunlight, as instruments recorded it',
  claim: 'The sun never sets. It circles above the flat earth like a spotlight, and night is only being out of its reach.',
  ask: 'On one and the same day, how long should the light last at the South Pole, in Samoa, in Colorado and in the north of Alaska?',
  check: 'NOAA publishes these readings, minute by minute, for anyone to download. Or use "Find live cameras near this place" in the settings to look at the far north and the far south on the same day.',
  tool: 'sky',
  pair: 'outside',
  controls: [
    { id: 'station', label: 'Station', value: 'spo', options: SUNLIGHT_STATIONS.map((s) => [s.id, s.name]), sets: true },
    { id: 'day', label: 'Day', value: 'dec', options: SUNLIGHT_DAYS.map((d) => [d.id, day(`${d.date}T12:00:00Z`)]), sets: true },
  ],
  apply({ state, setObserver, SUN_DEMO }, own) {
    setObserver(STATION[own.station], true);
    // The middle of the day on record, by universal time.
    state.date = new Date(startOf(own.day) + 12 * HOUR_MS);
    Object.assign(state, SUN_DEMO);
  },
  drawHeight: 250,
  /** The readings through the day as a curve, with three bars beneath: when it was light, and when each model has it light. */
  draw(ctx, { w, h }, c, { state }, own) {
    const station = STATION[own.station];
    const here = allStations(own.day, state).find((s) => s.station === station);
    const from = startOf(own.day);
    const [x0, x1] = [4, w - 4];
    const [top, bottom] = [28, h - 90];
    const X = (t) => x0 + ((t - from) / (24 * HOUR_MS)) * (x1 - x0);
    label(ctx, `${station.name}, ${day(from)}`, x0, 9, INK.text, 'left', 600);

    // ----- the readings -----
    // Up the side: from nothing to the day's highest reading, or to 50 W/m² on a day with no light to speak of.
    const most = Math.max(50, ...here.list.map((p) => p.light ?? 0));
    const Y = (v) => bottom - (Math.max(0, v) / most) * (bottom - top);
    ctx.fillStyle = INK.panel;
    ctx.fillRect(x0, top - 6, x1 - x0, bottom - top + 6);
    const points = here.list.map((p) => (p.light === null ? null : [X(p.t), Y(p.light)]));
    ctx.fillStyle = 'rgba(69, 214, 200, 0.16)';
    ctx.beginPath();
    let open = null;
    const close = (x) => {
      if (open === null) return;
      ctx.lineTo(x, bottom);
      ctx.lineTo(open, bottom);
      ctx.fill();
      ctx.beginPath();
      open = null;
    };
    let last = x0;
    for (const p of points) {
      if (!p) close(last);
      else {
        if (open === null) {
          open = p[0];
          ctx.moveTo(p[0], p[1]);
        } else ctx.lineTo(p[0], p[1]);
        last = p[0];
      }
    }
    close(last);
    line(ctx, points, INK.real, 2);
    label(ctx, `${Math.round(most)} W/m²`, x1 - 2, top + 2, INK.muted, 'right', 400, 11);

    // ----- when it is light -----
    const bar = (key, y, colour, words) => {
      label(ctx, words, x0, y, colour, 'left', 600, 11);
      ctx.fillStyle = INK.panel;
      ctx.fillRect(x0, y + 8, x1 - x0, 7);
      ctx.fillStyle = colour;
      const step = (x1 - x0) / here.list.length;
      here.list.forEach((p, i) => {
        if (p[key]) ctx.fillRect(x0 + i * step, y + 8, step + 0.5, 7);
      });
    };
    bar('measured', bottom + 12, INK.real, `measured, light for ${hoursMinutes(here.measured)}`);
    bar('globe', bottom + 34, INK.globe, `globe, sun above the horizon for ${hoursMinutes(here.globe)}`);
    bar('flat', bottom + 56, INK.flat, `flat, within reach of its sun for ${hoursMinutes(here.flat)}`);

    // ----- the hours, and the moment on show -----
    for (const hour of [0, 6, 12, 18, 24]) {
      const x = X(from + hour * HOUR_MS);
      const align = hour === 0 ? 'left' : hour === 24 ? 'right' : 'center';
      label(ctx, hour === 24 ? '24:00 UTC' : `${String(hour).padStart(2, '0')}:00`, x, h - 8, INK.muted, align, 400, 11);
    }
    const now = state.date.getTime();
    if (now >= from && now <= from + 24 * HOUR_MS) line(ctx, [[X(now), top - 6], [X(now), bottom + 74]], 'rgba(230, 237, 245, 0.4)', 1, [3, 3]);
  },
  body(c, { state, km }, own) {
    const all = allStations(own.day, state);
    const here = all.find((s) => s.station.id === own.station);
    const total = (key) => all.reduce((sum, s) => sum + s[key], 0);
    const span = (h) => (h === 0 ? 'none' : hoursMinutes(h));
    const rows = all
      .map(
        (s) => `<tr><td>${s.station.name}</td><td>${span(s.measured)}</td>
        <td class="${s.globeWrong > 0.5 ? 'bad' : ''}">${span(s.globe)}</td>
        <td class="${s.flatWrong > 0.5 ? 'bad' : ''}">${span(s.flat)}</td></tr>`,
      )
      .join('');
    // The South Pole's record for 21 December has a few minutes with no good reading.
    const gap = 24 - all.find((s) => s.station.id === 'spo').read;
    const pole =
      own.day === 'dec'
        ? `<p>On this day the South Pole had light all day${gap > 0 ? `: ${hoursMinutes(gap)} of its readings are missing, and every other one shows light` : ''}. Utqiagvik, in the north of Alaska, had none.
          On the flat map the South Pole is the outer rim, further from the sun's track than anywhere else. A light
          that reaches the rim all day reaches every place all day, Utqiagvik included.</p>`
        : `<p>On this day Utqiagvik, in the north of Alaska, had light for all 24 hours and the South Pole had none.
          The flat model can do that much: its June sun circles near the middle, and a reach of about 10,000 km
          lights the far north all day and leaves the rim dark. Look at what the same reach gives the two stations
          between, and then at December.</p>`;
    return `
    <p>Nobody worked these numbers out. An instrument at ${at(here.station)} recorded the sunlight falling on
    level ground all through this day, and the teal line is what it read. It counts as light here when the
    reading is over ${LIGHT_MARK} W/m², about what a clear sky gives with the sun's top edge on the horizon.</p>
    <p>It was light there for <b class="m">${span(here.measured)}</b>. The globe has the sun above that horizon for
    <b class="g">${span(here.globe)}</b>. The flat model, with its light reaching ${km(state.lightRangeKm)}, has the
    place in its light for <b class="f">${span(here.flat)}</b>.</p>
    <table class="data"><thead><tr><th>Light for</th><th class="measured">Measured</th><th class="globe">Globe</th>
    <th class="flat">Flat</th></tr></thead><tbody>${rows}</tbody></table>
    <p>Over the four stations that makes ${hoursMinutes(total('read'))} of readings. The globe disagrees with the
    instruments for <b class="g">${span(total('globeWrong'))}</b> of them, and the flat model for
    <b class="f">${span(total('flatWrong'))}</b>. The globe's share comes at the two ends of the day, where cloud or hills can hold
    the reading under the mark for a while with the sun just up. Over the two days together, no reach of its light
    brings the flat model within 25 hours of the instruments.</p>
    ${pole}
    <p>On the flat map the South Pole is not one place but the whole rim. The station is put on the rim at its own
    longitude. Another longitude would move the hours its light comes, not how many there are.</p>
    <p class="try">Try: drag "Its light travels" until the flat model suits one station, and read down the table.
    Then switch to the other day with the same reach.</p>`;
  },
  checks({ check, near }) {
    const shape = SUNLIGHT_STATIONS.length === 4 && SUNLIGHT_STATIONS.every((s) => SUNLIGHT_DAYS.every((d) => s.days[d.id].length === (24 * 60) / SUNLIGHT_STEP_MIN));
    check('sunlight argument: four stations, each with a whole day of readings for both solstices', shape);
    const flat = { sunHeightKm: 5000, lightRangeKm: 10000 };
    const of = (id, dayId) => summary(stationDay(STATION[id], dayId, flat));
    const [poleDec, poleJun, northDec, northJun] = [of('spo', 'dec'), of('spo', 'jun'), of('brw', 'dec'), of('brw', 'jun')];
    check('sunlight argument: the South Pole was light all through 21 December 2023 and dark all through 21 June, and Utqiagvik the other way about',
      poleDec.measured === poleDec.read && poleJun.measured === 0 && northDec.measured === 0 && northJun.measured === 24,
      `${poleDec.measured.toFixed(2)} of ${poleDec.read.toFixed(2)} h, ${poleJun.measured}, ${northDec.measured}, ${northJun.measured}`);
    const boulder = of('tbl', 'dec');
    check('sunlight argument: at Boulder on 21 December the instrument and the globe agree on the hours of light to within ten minutes',
      near(boulder.measured, boulder.globe, 10 / 60), `${boulder.measured.toFixed(2)} h measured, ${boulder.globe.toFixed(2)} h by the globe`);
    // How long a flat sun is out, over the four stations, for one reach of its light and one day.
    const flatOut = (dayId, reach) =>
      SUNLIGHT_STATIONS.reduce((sum, st) => sum + summary(stationDay(st, dayId, { sunHeightKm: 5000, lightRangeKm: reach })).flatWrong, 0);
    const globeOut = (dayId) => SUNLIGHT_STATIONS.reduce((sum, st) => sum + of(st.id, dayId).globeWrong, 0);
    check('sunlight argument: over the four stations the globe is out for under an hour on each day', globeOut('jun') < 1 && globeOut('dec') < 1,
      `${globeOut('jun').toFixed(2)} h and ${globeOut('dec').toFixed(2)} h`);
    check('sunlight argument: a flat sun whose light reaches 10,000 km is out for about four and a half hours in June and over a day in December',
      near(flatOut('jun', 10000), 4.6, 0.5) && flatOut('dec', 10000) > 24, `${flatOut('jun', 10000).toFixed(2)} h and ${flatOut('dec', 10000).toFixed(2)} h`);
    // Every reach from 1,000 km to 40,000 km, a thousand at a time.
    const reaches = Array.from({ length: 40 }, (_, i) => (i + 1) * 1000);
    const least = Math.min(...reaches.map((r) => flatOut('jun', r) + flatOut('dec', r)));
    check('sunlight argument: no reach of its light brings the flat sun within 25 hours of the instruments over the two days', least > 25, `${least.toFixed(2)} h at best`);
    // The furthest the rim ever is from a flat sun over the southern tropic is more than the whole way across the middle.
    const far = flatPredict({ lat: -23.44, lon: 180, sizeDeg: 0.53 }, -89.997, 0, flat).groundKm;
    check('sunlight argument: on the flat map the South Pole is over 32,000 km from a December sun on the far side', far > 32000 && far < 33000, `${far.toFixed(0)} km`);
  },
};
