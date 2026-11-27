// Fetches a few days of measured sunlight and writes the copy the app reads:
// data/sunlight.js.
//
//   node tools/fetch-sunlight.mjs
//
// The measurements are NOAA's. Its Global Monitoring Laboratory keeps
// instruments at fixed stations that record, every minute, how much sunlight
// is falling on level ground, in watts per square metre. The stations here are
// three of its baseline observatories and one station of its SURFRAD network.
// The files are public, one per station per day, with times in universal time:
//
//   https://gml.noaa.gov/aftp/data/radiation/
//
// Each row of a file is one minute. Counting from 1, the columns used are:
//   5, 6   the hour and the minute
//   9      sunlight coming down on level ground ("dw_solar"), W/m²
//   10     NOAA's own quality mark for that reading: 0 is good
// The file also has NOAA's worked-out height of the sun for each minute. That
// is a sum, not a measurement, and it is not kept.
//
// A reading that is missing, or that NOAA has not marked as good, is left out.
// The rest are averaged over five minutes at a time, which is fine enough to
// see the light come and go and keeps the copy small. A stretch of five
// minutes with no good reading is written as null.
//
// This needs the internet. The app itself does not: it reads the saved copy.
import { writeFileSync } from 'node:fs';

const BASE = 'https://gml.noaa.gov/aftp/data/radiation';
const STEP_MIN = 5;

/** The stations, from the far south to the far north. `folder` is where NOAA keeps each one's files. */
const STATIONS = [
  { id: 'spo', name: 'South Pole', folder: 'baseline/spo' },
  { id: 'smo', name: 'American Samoa', folder: 'baseline/smo' },
  { id: 'tbl', name: 'Boulder, Colorado', folder: 'surfrad/Boulder_CO' },
  { id: 'brw', name: 'Utqiagvik (Barrow), Alaska', folder: 'baseline/brw' },
];

/** The days: the two solstices of 2023, each a whole day of universal time. */
const DAYS = [
  { id: 'jun', date: '2023-06-21' },
  { id: 'dec', date: '2023-12-21' },
];

/** Which day of its year a date is, counting 1 January as 1. */
function dayOfYear(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

/** One station's file for one day, as text. */
async function fetchDay(station, date) {
  const year = date.slice(0, 4);
  const name = `${station.id}${year.slice(2)}${String(dayOfYear(date)).padStart(3, '0')}.dat`;
  const url = `${BASE}/${station.folder}/${year}/${name}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sunlight-record-fetch' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return { url, text: await res.text() };
}

/** A file's readings as five-minute averages, with where the station is. */
function read(text) {
  const lines = text.split('\n');
  const [lat, lon, heightM] = lines[1].trim().split(/\s+/).map(Number);
  const sums = Array.from({ length: (24 * 60) / STEP_MIN }, () => ({ total: 0, n: 0 }));
  let good = 0;
  for (const line of lines.slice(2)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10) continue;
    const [hour, minute, light, mark] = [Number(f[4]), Number(f[5]), Number(f[8]), Number(f[9])];
    if (mark !== 0 || light < -9000) continue;
    const bin = sums[Math.floor((hour * 60 + minute) / STEP_MIN)];
    bin.total += light;
    bin.n += 1;
    good += 1;
  }
  // One decimal place near the dark end, where the first and last light of a day are told apart. Whole watts above.
  const tidy = (v) => (Math.abs(v) < 20 ? Math.round(v * 10) / 10 : Math.round(v));
  return { lat, lon, heightM, good, light: sums.map((b) => (b.n ? tidy(b.total / b.n) : null)) };
}

const stations = [];
for (const station of STATIONS) {
  const out = { id: station.id, name: station.name, days: {} };
  for (const day of DAYS) {
    const { url, text } = await fetchDay(station, day.date);
    const got = read(text);
    Object.assign(out, { lat: got.lat, lon: got.lon, heightM: got.heightM });
    out.days[day.id] = got.light;
    console.log(`${station.name}, ${day.date}: ${got.good} good minutes of 1440, from ${url}`);
  }
  stations.push(out);
}

const row = (s) => `  {
    id: '${s.id}',
    name: '${s.name}',
    lat: ${s.lat},
    lon: ${s.lon},
    heightM: ${s.heightM},
    days: {
${DAYS.map((d) => `      ${d.id}: ${JSON.stringify(s.days[d.id])},`).join('\n')}
    },
  },`;

writeFileSync(
  new URL('../data/sunlight.js', import.meta.url),
  `// Measured sunlight at four of NOAA's stations on the two solstices of 2023.
//
// Written by tools/fetch-sunlight.mjs, which says where the readings come from
// and what is done to them. Do not edit by hand.
//
// Each list is one whole day of universal time, midnight to midnight: the
// sunlight falling on level ground in watts per square metre, averaged over
// each ${STEP_MIN} minutes in turn. null is a stretch with no good reading. At night
// the instruments read a watt or two under nothing, because they are losing
// their own warmth to the sky. That is left as recorded.

/** How many minutes each reading covers. */
export const SUNLIGHT_STEP_MIN = ${STEP_MIN};

/** The two days, each a whole day of universal time. */
export const SUNLIGHT_DAYS = [
${DAYS.map((d) => `  { id: '${d.id}', date: '${d.date}' },`).join('\n')}
];

/** The stations, from the far south to the far north. Longitude is east; height is above the sea. */
export const SUNLIGHT_STATIONS = [
${stations.map(row).join('\n')}
];
`,
);
console.log('Wrote data/sunlight.js');
