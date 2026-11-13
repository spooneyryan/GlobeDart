// Fetches the Bright Star Catalogue and writes the copy the app draws its
// background stars from: data/bright-stars.json.
//
//   node tools/fetch-bright-stars.mjs
//
// The catalogue is the Yale Bright Star Catalogue, 5th revised edition
// (Hoffleit and Warren, 1991): every star down to about magnitude 6.5, which
// is roughly what the eye can see from a dark place. It is served by VizieR,
// run by the Centre de Données astronomiques de Strasbourg (CDS), as V/50.
//
// This needs the internet. The app itself does not: it reads the saved copy.
// Positions are for the year 2000, with each star's own drift across the sky
// up to then included. Drift since then is ignored, which moves no star
// by more than a few hundredths of a degree.
import { writeFileSync } from 'node:fs';

const MAG_LIMIT = 6.5;
const QUERY = `/viz-bin/asu-tsv?-source=V/50/catalog&-out=HR,_RAJ2000,_DEJ2000,Vmag&-out.max=10000&Vmag=%3C=${MAG_LIMIT}`;
// VizieR has several sites that hold the same data.
const SITES = ['https://vizier.cds.unistra.fr', 'https://vizier.cfa.harvard.edu'];

async function fetchTable() {
  for (const site of SITES) {
    try {
      const res = await fetch(site + QUERY, { headers: { 'User-Agent': 'star-catalogue-fetch' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!/^HR\t/m.test(text)) throw new Error('no table in the reply');
      return { site, text };
    } catch (err) {
      console.error(`${site}: ${err.message}`);
    }
  }
  throw new Error('No VizieR site answered.');
}

const { site, text } = await fetchTable();
const stars = [];
for (const line of text.split('\n')) {
  if (!/^\s*\d+\t/.test(line)) continue;
  const [hr, ra, dec, mag] = line.split('\t').map((cell) => cell.trim());
  // A few entries in the catalogue are not stars and have no position.
  if (ra === '' || dec === '' || mag === '') continue;
  const star = { hr: Number(hr), ra: Number(ra), dec: Number(dec), mag: Number(mag) };
  if (Object.values(star).every(Number.isFinite)) stars.push(star);
}
// Brightest first, so that a reader of the file can stop early at any limit.
stars.sort((a, b) => a.mag - b.mag || a.hr - b.hr);

const out = {
  source: 'Bright Star Catalogue, 5th revised edition (Hoffleit and Warren, 1991), VizieR V/50, from CDS, Strasbourg',
  fetchedFrom: site,
  fetched: new Date().toISOString().slice(0, 10),
  note: 'Positions are right ascension and declination in degrees for the year 2000. mag is the visual magnitude: smaller is brighter. hr is the number in the catalogue.',
  magLimit: MAG_LIMIT,
  count: stars.length,
  hr: stars.map((s) => s.hr),
  ra: stars.map((s) => Number(s.ra.toFixed(4))),
  dec: stars.map((s) => Number(s.dec.toFixed(4))),
  mag: stars.map((s) => s.mag),
};
writeFileSync(new URL('../data/bright-stars.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${stars.length} stars down to magnitude ${MAG_LIMIT}, from ${site}.`);
console.log(`Brightest: HR ${stars[0].hr}, magnitude ${stars[0].mag}.`);
