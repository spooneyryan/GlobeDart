import { globeDistanceKm, flatDistanceKm, flatSheetLayout } from '../distances.js';

// Sets of four cities. The first three are laid out flat; the fourth is the one that will not fit.
const SETS = {
  north: { cities: ['London', 'New York', 'Tokyo', 'Los Angeles'], note: 'All six of these are flown non-stop every day.' },
  south: { cities: ['Sydney', 'Johannesburg', 'Santiago', 'Perth'], note: 'Four of these six are flown non-stop. "Southern flights" checks them against the timetable.' },
  both: { cities: ['London', 'Tokyo', 'Sydney', 'Santiago'], note: 'Two in the north and two in the south.' },
};

const INK = { text: '#e6edf5', muted: '#93a4b8', line: '#3f86bd', flat: '#ffb224', bad: '#ff7847', real: '#45d6c8' };

/** The four cities of a set, their six distances, and where a flat sheet would have to put them. */
function work(setId, city) {
  const names = (SETS[setId] ?? SETS.north).cities;
  const [a, b, c, d] = names.map(city);
  const km = (p, q) => globeDistanceKm(p, q);
  const sides = { ab: km(a, b), ac: km(a, c), bc: km(b, c), ad: km(a, d), bd: km(b, d) };
  return { names, places: [a, b, c, d], sides, real: km(c, d), sheet: flatSheetLayout(sides) };
}

function label(ctx, string, x, y, colour = INK.text, align = 'center', weight = 400) {
  ctx.font = `${weight} 11px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
  ctx.strokeText(string, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(string, x, y);
}

export default {
  id: 'anymap',
  group: 'travel',
  label: 'Any flat map',
  title: 'Could a different flat map fix it?',
  claim: 'The usual flat map is only one attempt. The true map of the flat earth has not been drawn yet.',
  ask: 'If you know the six distances between four cities, can you tell whether they lie on a flat surface without using any map at all?',
  check: 'Take four far-apart cities joined by non-stop flights. Draw three of them to scale on paper, then try to place the fourth so that all three of its distances are right.',
  tool: 'sky',
  pair: 'outside',
  controls: [
    {
      id: 'set',
      label: 'Four cities',
      value: 'north',
      options: Object.entries(SETS).map(([id, set]) => [id, set.cities.join(', ')]),
    },
  ],
  apply({ state, focusRoute, SUN_DEMO }) {
    Object.assign(state, SUN_DEMO, { route: { from: 'Tokyo', to: 'Los Angeles' } });
    focusRoute();
  },
  drawHeight: 250,
  /** The first three cities laid out flat, and the two places the sheet allows for the fourth. */
  draw(ctx, { w, h }, c, { city, km }, own) {
    const { names, sides, sheet, real } = work(own.set, city);
    const [A, B, C] = [sheet.a, sheet.b, sheet.c];
    const all = [A, B, C, ...sheet.d];
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const pad = 34;
    const scale = Math.min((w - 2 * pad) / (Math.max(...xs) - Math.min(...xs)), (h - 2 * pad) / (Math.max(...ys) - Math.min(...ys)));
    const X = (p) => w / 2 + (p[0] - (Math.max(...xs) + Math.min(...xs)) / 2) * scale;
    const Y = (p) => h / 2 - (p[1] - (Math.max(...ys) + Math.min(...ys)) / 2) * scale;
    const line = (p, q, colour, dash = []) => {
      ctx.strokeStyle = colour;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(X(p), Y(p));
      ctx.lineTo(X(q), Y(q));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    // The two distances that fix the fourth city: a circle round each of the first two.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(147, 164, 184, 0.35)';
    for (const [centre, radius] of [[A, sides.ad], [B, sides.bd]]) {
      ctx.beginPath();
      ctx.arc(X(centre), Y(centre), radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    line(A, B, INK.line);
    line(A, C, INK.line);
    line(B, C, INK.line);
    // From the third city to each place the sheet allows for the fourth.
    sheet.d.forEach((D, i) => {
      line(C, D, INK.bad, [5, 4]);
      const along = i === 0 ? 0.4 : 0.72; // the two labels sit at different places, so they do not run into each other
      label(ctx, km(sheet.cd[i]), X(C) + (X(D) - X(C)) * along, Y(C) + (Y(D) - Y(C)) * along, INK.bad, 'center', 600);
    });
    const dot = (p, colour) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(X(p), Y(p), 4, 0, Math.PI * 2);
      ctx.fill();
    };
    [A, B, C].forEach((p, i) => {
      dot(p, INK.text);
      label(ctx, names[i], X(p), Y(p) + (p[1] > 0 ? -12 : 12));
    });
    sheet.d.forEach((D, i) => {
      dot(D, INK.flat);
      label(ctx, `${names[3]}?`, X(D), Y(D) + (i === 0 ? -12 : 12), INK.flat);
    });
    label(ctx, `really ${km(real)} from ${names[2]} to ${names[3]}`, w - 8, h - 10, INK.real, 'right', 600);
  },
  body(c, { city, km }, own) {
    const { names, places, sides, sheet, real } = work(own.set, city);
    const [a, b, cc, d] = names;
    const usual = flatDistanceKm(places[2], places[3]);
    const nearest = sheet.cd.reduce((best, v) => (Math.abs(v - real) < Math.abs(best - real) ? v : best));
    const row = (p, q, v) => `<tr><td>${p} to ${q}</td><td>${km(v)}</td></tr>`;
    return `
    <p>There is a way to test every flat map at once, including ones nobody has drawn. It needs no map: only the
    distances between four places.</p>
    <table class="data"><thead><tr><th>From</th><th class="measured">Distance</th></tr></thead><tbody>
    ${row(a, b, sides.ab)}${row(a, cc, sides.ac)}${row(b, cc, sides.bc)}${row(a, d, sides.ad)}${row(b, d, sides.bd)}
    </tbody></table>
    <p>Three places can always be drawn to scale on a flat sheet: the picture has ${a}, ${b} and ${cc}. The fourth
    is then fixed by its distances to two of them. ${d} has to be where the two circles cross, and they cross in
    only two places.</p>
    <p>That leaves the sheet no choice about the sixth distance. From ${cc} to ${d} it must be
    <b class="f">${km(sheet.cd[0])}</b> or <b class="f">${km(sheet.cd[1])}</b>. The real distance is
    <b class="m">${km(real)}</b>, so the nearest a flat sheet can come is <b class="f">${km(Math.abs(nearest - real))}</b>
    out. No way of drawing the map changes that, because every flat map is drawn on a flat sheet.</p>
    <p>The usual flat map makes this distance ${km(usual)}. It can only get some distances right by getting others
    wrong.</p>
    <p>On a ball 6,371 km in radius all six fit together exactly. ${SETS[own.set]?.note ?? ''}</p>
    <p class="try">Try: the other sets of cities. Then do it on paper with a ruler and a pair of compasses.</p>`;
  },
  checks({ check, near }) {
    const place = { A: { lat: 0, lon: 0 }, B: { lat: 0, lon: 90 }, C: { lat: 90, lon: 0 }, D: { lat: 0, lon: 45 } };
    // Four places that really are on a flat sheet: the corners of a 3 by 4 rectangle.
    const flat = flatSheetLayout({ ab: 3, ac: 5, bc: 4, ad: 4, bd: 5 });
    check('any flat map argument: on a flat sheet the fourth corner of a rectangle comes out where it should', near(flat.cd[0], 3, 1e-9), flat.cd.map((v) => v.toFixed(3)).join(' or '));
    // Three places a quarter of the way round a globe from each other make a triangle no flat sheet can hold with a fourth.
    const q = globeDistanceKm(place.A, place.B);
    const sheet = flatSheetLayout({ ab: q, ac: globeDistanceKm(place.A, place.C), bc: globeDistanceKm(place.B, place.C), ad: globeDistanceKm(place.A, place.D), bd: globeDistanceKm(place.B, place.D) });
    const real = globeDistanceKm(place.C, place.D);
    check('any flat map argument: a pole and three places on the equator cannot be drawn flat: the sixth distance is thousands of km out',
      near(real, q, 1e-6) && sheet.cd.every((v) => Math.abs(v - real) > 1000), `${Math.round(real)} against ${sheet.cd.map((v) => Math.round(v)).join(' or ')}`);
    for (const [id, set] of Object.entries(SETS)) {
      const cities = { London: [51.51, -0.13], 'New York': [40.71, -74.01], Tokyo: [35.68, 139.69], 'Los Angeles': [34.05, -118.24], Sydney: [-33.87, 151.21], Johannesburg: [-26.2, 28.05], Santiago: [-33.45, -70.67], Perth: [-31.95, 115.86] };
      const w = work(id, (name) => ({ lat: cities[name][0], lon: cities[name][1] }));
      const out = Math.min(...w.sheet.cd.map((v) => Math.abs(v - w.real)));
      check(`any flat map argument: ${set.cities.join(', ')} are at least 1,000 km from fitting any flat sheet`, out > 1000, `${Math.round(out)} km out`);
    }
  },
};
