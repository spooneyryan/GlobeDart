// Compares the hand-entered star table in js/stars.js with the SIMBAD
// astronomical database, and keeps a copy of what SIMBAD said.
//
//   node tools/check-stars.mjs          compare, and print the differences
//   node tools/check-stars.mjs --save   also rewrite data/star-catalogue.json
//
// This needs the internet, so it is separate from tools/check-maths.mjs, which
// does not. That one checks the table against the saved copy every time.
//
// SIMBAD is run by the Centre de Données astronomiques de Strasbourg (CDS).
// Its positions are for the year 2000, the same as the table's.
import { writeFileSync } from 'node:fs';
import { STARS } from '../js/stars.js';

// SIMBAD has two sites that hold the same data.
const SITES = [
  'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
  'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync',
];

// SIMBAD's name for each star. Where a star is double, the brighter member comes first.
const IDS = {
  Sirius: ['* alf CMa'], Canopus: ['* alf Car'], 'Alpha Centauri': ['* alf Cen'], Arcturus: ['* alf Boo'],
  Vega: ['* alf Lyr'], Capella: ['* alf Aur'], Rigel: ['* bet Ori'], Procyon: ['* alf CMi'], Achernar: ['* alf Eri'],
  Betelgeuse: ['* alf Ori'], Hadar: ['* bet Cen'], Altair: ['* alf Aql'], Acrux: ['* alf Cru'], Aldebaran: ['* alf Tau'],
  Antares: ['* alf Sco'], Spica: ['* alf Vir'], Pollux: ['* bet Gem'], Fomalhaut: ['* alf PsA'], Deneb: ['* alf Cyg'],
  Mimosa: ['* bet Cru'], Regulus: ['* alf Leo'], Adhara: ['* eps CMa'], Castor: ['* alf Gem'], Gacrux: ['* gam Cru'],
  Shaula: ['* lam Sco'], Bellatrix: ['* gam Ori'], Elnath: ['* bet Tau'], Miaplacidus: ['* bet Car'], Alnilam: ['* eps Ori'],
  Alnair: ['* alf Gru'], Alnitak: ['* zet Ori'], Alioth: ['* eps UMa'], 'Gamma Velorum': ['* gam02 Vel', '* gam Vel'],
  Dubhe: ['* alf UMa'], Mirfak: ['* alf Per'], Wezen: ['* del CMa'], 'Kaus Australis': ['* eps Sgr'], Avior: ['* eps Car'],
  Alkaid: ['* eta UMa'], Sargas: ['* tet Sco'], Menkalinan: ['* bet Aur'], Atria: ['* alf TrA'], Alhena: ['* gam Gem'],
  Peacock: ['* alf Pav'], 'Delta Velorum': ['* del Vel'], Polaris: ['* alf UMi'], Mirzam: ['* bet CMa'], Alphard: ['* alf Hya'],
  Hamal: ['* alf Ari'], Diphda: ['* bet Cet'], Nunki: ['* sig Sgr'], Mirach: ['* bet And'], Menkent: ['* tet Cen'],
  Alpheratz: ['* alf And'], Rasalhague: ['* alf Oph'], Kochab: ['* bet UMi'], Algieba: ['* gam01 Leo', '* gam Leo'],
  Saiph: ['* kap Ori'], Algol: ['* bet Per'], Denebola: ['* bet Leo'], Sadr: ['* gam Cyg'], 'Lambda Velorum': ['* lam Vel'],
  Schedar: ['* alf Cas'], Mintaka: ['* del Ori'], Alphecca: ['* alf CrB'], Eltanin: ['* gam Dra'], Naos: ['* zet Pup'],
  'Iota Carinae': ['* iot Car'], Almach: ['* gam01 And', '* gam And'], Caph: ['* bet Cas'], Mizar: ['* zet01 UMa', '* zet UMa'],
  'Epsilon Scorpii': ['* eps Sco'], Dschubba: ['* del Sco'], Merak: ['* bet UMa'], Ankaa: ['* alf Phe'], Enif: ['* eps Peg'],
  'Kappa Scorpii': ['* kap Sco'], Scheat: ['* bet Peg'], Phecda: ['* gam UMa'], 'Epsilon Cygni': ['* eps Cyg'],
  'Gamma Cassiopeiae': ['* gam Cas'], Markab: ['* alf Peg'], 'Kappa Velorum': ['* kap Vel'], Alderamin: ['* alf Cep'],
  Zosma: ['* del Leo'], Acrab: ['* bet01 Sco', '* bet Sco'], Ruchbah: ['* del Cas'], 'Delta Crucis': ['* del Cru'],
  'Beta Hydri': ['* bet Hyi'], Algenib: ['* gam Peg'], 'Delta Cygni': ['* del Cyg'], Pherkad: ['* gam UMi'],
  Albireo: ['* bet01 Cyg', '* bet Cyg A', '* bet Cyg'], Megrez: ['* del UMa'], Segin: ['* eps Cas'], 'Sigma Octantis': ['* sig Oct'],
};

const unnamed = STARS.filter((s) => !IDS[s.name]).map((s) => s.name);
if (unnamed.length) {
  console.error(`No SIMBAD name is listed here for: ${unnamed.join(', ')}. Add it to IDS.`);
  process.exit(1);
}

async function ask(query) {
  for (const site of SITES) {
    try {
      const res = await fetch(site, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'csv', query }),
      });
      const text = await res.text();
      if (res.ok && text.startsWith('id')) return { site, text };
      console.error(`${site} answered ${res.status}; trying the next one.`);
    } catch (err) {
      console.error(`${site} could not be reached (${err.message}); trying the next one.`);
    }
  }
  console.error('SIMBAD could not be reached at either address.');
  process.exit(1);
}

const wanted = [...new Set(Object.values(IDS).flat())];
const { site, text } = await ask(`SELECT ident.id, basic.ra, basic.dec, basic.pmra, basic.pmdec, allfluxes.V
  FROM ident JOIN basic ON ident.oidref = basic.oid LEFT JOIN allfluxes ON allfluxes.oidref = basic.oid
  WHERE ident.id IN (${wanted.map((id) => `'${id}'`).join(',')})`);

const found = new Map();
for (const line of text.trim().split('\n').slice(1)) {
  const m = line.match(/^"?([^",]+)"?,([^,]*),([^,]*),([^,]*),([^,]*),([^,]*)$/);
  if (m) found.set(m[1].replace(/\s+/g, ' ').trim(), { ra: +m[2], dec: +m[3], pmra: +m[4], pmdec: +m[5], v: m[6] === '' ? null : +m[6] });
}

const DEG = Math.PI / 180;
/** Angle between two positions on the sky, in arcseconds (3,600 to a degree). */
const apartArcsec = (ra1, dec1, ra2, dec2) => {
  const cos = Math.sin(dec1 * DEG) * Math.sin(dec2 * DEG) + Math.cos(dec1 * DEG) * Math.cos(dec2 * DEG) * Math.cos((ra1 - ra2) * DEG);
  return (Math.acos(Math.min(1, cos)) / DEG) * 3600;
};
const yearsSince2000 = (Date.now() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000);

const rows = STARS.map((s) => {
  const id = IDS[s.name].find((x) => found.has(x));
  if (!id) return { name: s.name, id: null };
  const c = found.get(id);
  return {
    name: s.name,
    id,
    ra: Number(c.ra.toFixed(6)), // degrees
    dec: Number(c.dec.toFixed(6)),
    pmra: c.pmra, // thousandths of an arcsecond a year
    pmdec: c.pmdec,
    v: c.v,
    off: apartArcsec(s.ra * 15, s.dec, c.ra, c.dec),
    drift: (Math.hypot(c.pmra, c.pmdec) * yearsSince2000) / 1000,
    mag: s.mag,
  };
});

const lost = rows.filter((r) => !r.id);
const ok = rows.filter((r) => r.id);
const worst = [...ok].sort((a, b) => b.off - a.off);
console.log(`Asked ${site}`);
console.log(`Found ${ok.length} of ${STARS.length} stars.${lost.length ? ` Not found: ${lost.map((r) => r.name).join(', ')}.` : ''}`);
console.log(`\nFurthest from the catalogue, in arcseconds (one second of time in the table is up to 15):`);
for (const r of worst.slice(0, 8)) console.log(`  ${r.name.padEnd(18)} ${r.off.toFixed(1).padStart(6)}`);
console.log(`\nWithin 8 arcseconds: ${ok.filter((r) => r.off <= 8).length} of ${ok.length}.`);
const brightness = ok.filter((r) => r.v !== null && Math.abs(r.mag - r.v) > 0.15);
console.log(`\nBrightness differing by more than 0.15 magnitudes (often a double star counted as one or as two):`);
for (const r of brightness) console.log(`  ${r.name.padEnd(18)} table ${r.mag}, catalogue ${r.v}`);
console.log(`\nMoved furthest since 2000, in arcseconds (the app does not allow for this):`);
for (const r of [...ok].sort((a, b) => b.drift - a.drift).slice(0, 5)) console.log(`  ${r.name.padEnd(18)} ${r.drift.toFixed(0).padStart(4)}`);

if (process.argv.includes('--save')) {
  const file = new URL('../data/star-catalogue.json', import.meta.url);
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: 'SIMBAD astronomical database, CDS, Strasbourg, France',
        fetched: new Date().toISOString().slice(0, 10),
        note: 'Positions are in degrees for the year 2000. pmra and pmdec are thousandths of an arcsecond a year. v is the visual magnitude.',
        stars: ok.map(({ name, id, ra, dec, pmra, pmdec, v }) => ({ name, id, ra, dec, pmra, pmdec, v })),
      },
      null,
      1,
    )}\n`,
  );
  console.log('\nSaved data/star-catalogue.json');
}

const bad = lost.length > 0 || worst[0].off > 8;
console.log(bad ? '\nThe table does not match the catalogue.' : '\nThe table matches the catalogue.');
process.exit(bad ? 1 : 0);
