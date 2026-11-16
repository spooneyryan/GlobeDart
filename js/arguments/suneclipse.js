import { DEG, EARTH_RADIUS_KM, MOON_RADIUS_KM, wrap180, subsolarPoint, moonPoint, observedSun, observedMoon, nextSolarEclipse, solarEclipseNear, solarEclipses, newMoons } from '../astro.js';
import { globeAngleDeg, globePredict, globePredictNear, flatBendPerKm, discCovered, sunCovered, moonShadowGlobe, moonShadowFlat, bestFlatMoonHeightKm } from '../models.js';

// The eclipses offered. Each of the dated ones is the first total eclipse on or after the day given.
const LISTED = [
  ['next', 'The next total one'],
  ['2026', '12 August 2026, Iceland and Spain'],
  ['2024', '8 April 2024, North America'],
  ['2017', '21 August 2017, United States'],
];
const FROM = { 2026: Date.UTC(2026, 7, 1), 2024: Date.UTC(2024, 3, 1), 2017: Date.UTC(2017, 7, 1) };

const INK = {
  text: '#e6edf5',
  muted: '#93a4b8',
  globe: '#7fb4ff',
  flat: '#ffb224',
  real: '#45d6c8',
  sun: '#ffe08a',
  moon: '#0b1118',
  edge: '#3b4c60',
  sea: '#0e1722',
  land: '#223346',
  panel: 'rgba(255, 255, 255, 0.045)',
};

const KIND = { total: 'total', annular: 'ring-shaped', partial: 'partial' };

const kmBetween = (a, b) => globeAngleDeg(a.lat, a.lon, b.lat, b.lon) * DEG * EARTH_RADIUS_KM;
const placeName = (p) => `${Math.abs(p.lat).toFixed(1)}° ${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(1)}° ${p.lon >= 0 ? 'E' : 'W'}`;
const day = (date, month = 'long') => date.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month, year: 'numeric' });
const share = (fraction) => (fraction <= 0 ? 'none' : fraction >= 1 ? '100%' : `${Math.min(99, Math.max(1, Math.round(fraction * 100)))}%`);

/** What the flat model is told about its sun, its moon and its light, from the app's settings. */
const flatOf = (state) => ({
  sunHeightKm: state.sunHeightKm,
  moonHeightKm: state.moonHeightKm,
  bendPerKm: flatBendPerKm({ sunHeightKm: state.sunHeightKm, bendSetKm: state.flatLight === 'bent' ? state.lightRangeKm : 0 }),
});

// Looking an eclipse up takes a search, and so does following its shadow, so each is done once and kept.
const kept = new Map();
function keep(key, make) {
  if (!kept.has(key)) {
    if (kept.size > 40) kept.clear();
    kept.set(key, make());
  }
  return kept.get(key);
}

/** The published eclipse an entry of the list stands for. "Next" means the next after today. */
function listed(which) {
  const from = FROM[which] ?? Math.floor(Date.now() / 86400000) * 86400000;
  return keep(`listed ${from}`, () => nextSolarEclipse(new Date(from), true));
}

/** The published eclipse of the sun going on at a moment, or null. */
let lastLooked = { hour: null, found: null };
function publishedAt(date) {
  const t = date.getTime();
  if (lastLooked.found && Math.abs(lastLooked.found.peak.getTime() - t) <= 4 * 3600000) return lastLooked.found;
  const hour = Math.floor(t / 3600000);
  if (lastLooked.hour !== hour) lastLooked = { hour, found: solarEclipseNear(date) };
  return lastLooked.found;
}

/** Where the sun and the moon are overhead at a moment, and the shadow the globe makes of that. */
function moment(date) {
  const sub = subsolarPoint(date);
  const moon = moonPoint(date);
  return { date, sub, moon, globe: moonShadowGlobe(sub, moon) };
}

/** The middle of an eclipse: the moment itself, and how high the sun is from the published place. */
function middleOf(eclipse) {
  return keep(`middle ${eclipse.peak.getTime()}`, () => ({
    ...moment(eclipse.peak),
    sunEl: eclipse.lat === null ? null : observedSun(eclipse.peak, eclipse.lat, eclipse.lon).el,
  }));
}

/** The globe's shadow every three minutes for as long as the line through the sun and moon meets the ground. */
function trackOf(eclipse) {
  return keep(`track ${eclipse.peak.getTime()}`, () => {
    const list = [];
    for (let minutes = -240; minutes <= 240; minutes += 3) {
      const at = moment(new Date(eclipse.peak.getTime() + minutes * 60000));
      if (at.globe.centre) list.push(at);
    }
    return list;
  });
}

/** The moment of every new moon from 2020 to 2035: the sample both models are tried on. */
const SAMPLE_YEARS = [2020, 2035];
const everyNewMoon = () => keep('new moons', () => newMoons(...SAMPLE_YEARS).map(moment));

/** Where the flat model's shadow is at one of those moments, if it is anywhere on the map. */
function flatCentre(at, flat) {
  const shade = moonShadowFlat(at.sub, at.moon, flat);
  return shade.centre && !shade.offMap ? shade.centre : null;
}

function label(ctx, string, x, y, colour = INK.muted, align = 'left', weight = 400) {
  ctx.font = `${weight} 12px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
  ctx.strokeText(string, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(string, x, y);
}

function disc(ctx, x, y, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** The sun with the moon where one account puts it, as if through eclipse glasses. */
function glasses(ctx, cx, cy, side, sun, moon, cover) {
  const half = side / 2;
  const perDeg = side / 1.3; // the square is 1.3° across
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - half, cy - half, side, side);
  ctx.fillStyle = INK.panel;
  ctx.fill();
  ctx.clip();
  const dx = wrap180(moon.az - sun.az) * Math.cos(sun.el * DEG) * perDeg;
  const dy = -(moon.el - sun.el) * perDeg;
  const sunR = (sun.sizeDeg / 2) * perDeg;
  const drawSun = () => {
    // The sun's faint outer glow, which is what is left to see when the moon hides all of the disc.
    const glow = ctx.createRadialGradient(cx, cy, sunR * 0.9, cx, cy, sunR * 2.1);
    glow.addColorStop(0, 'rgba(255, 244, 214, 0.5)');
    glow.addColorStop(1, 'rgba(255, 244, 214, 0)');
    disc(ctx, cx, cy, sunR * 2.1, glow);
    disc(ctx, cx, cy, sunR, INK.sun);
  };
  const drawMoon = () => disc(ctx, cx + dx, cy + dy, (moon.sizeDeg / 2) * perDeg, INK.moon, INK.edge);
  // Only the flat model can put its moon further off than its sun, and then the sun is the one in front.
  if (cover.inFront) {
    drawSun();
    drawMoon();
  } else {
    drawMoon();
    drawSun();
  }
  ctx.restore();
}

export default {
  id: 'suneclipse',
  group: 'moon',
  label: 'Solar eclipse',
  title: "Where does the moon's shadow fall?",
  claim: 'Eclipses are predicted from old tables of dates that repeat. Nobody needs a globe to do it.',
  ask: 'A total eclipse of the sun is seen from a strip of ground about 150 km wide. What would you have to know to say which towns it will cross, and at what minute?',
  check: 'Look up the published track and times for the next eclipse you can travel to, and time it with your own watch. Millions of people did that in 2017 and 2024, and the shadow came where and when the sum said.',
  tool: 'sky',
  pair: 'sky',
  controls: [{ id: 'which', label: 'Eclipse', value: 'next', options: LISTED, sets: true }],
  apply({ state, setObserver, MOON_DEMO }, own) {
    const eclipse = listed(own.which);
    state.date = eclipse.peak;
    Object.assign(state, MOON_DEMO);
    // Nothing fixes the height of the flat model's moon, so it is given the one that suits this eclipse best.
    const at = middleOf(eclipse);
    const best = bestFlatMoonHeightKm(at.sub, at.moon, eclipse, flatOf(state));
    if (best) state.moonHeightKm = Math.max(100, best.heightKm);
    setObserver({ lat: eclipse.lat, lon: eclipse.lon }, true);
  },
  drawHeight: 300,
  /**
   * Above: the sun and moon as the measurement and each model put them for the observer.
   * Below: a map of the world with the track of the middle of the shadow under each model.
   */
  draw(ctx, { w, h }, c, { state, land }) {
    const m = c.moon;
    if (!m?.cover) {
      label(ctx, 'Turn on "Show the moon" to see this drawing.', w / 2, h / 2, INK.muted, 'center');
      return;
    }
    // ----- through eclipse glasses -----
    const rowH = Math.min(118, h * 0.4);
    const side = Math.max(20, Math.min(w / 3 - 10, rowH - 34));
    const views = [
      ['Measured', INK.real, c.obs, m.obs, m.cover.measured],
      ['Globe', INK.globe, c.globe, m.globe, m.cover.globe],
      ['Flat', INK.flat, c.flat, m.flat, m.cover.flat],
    ];
    views.forEach(([name, colour, sun, moon, cover], i) => {
      const cx = (w * (i + 0.5)) / 3;
      const cy = 17 + side / 2;
      label(ctx, name, cx, 8, colour, 'center', 600);
      glasses(ctx, cx, cy, side, sun, moon, cover);
      const words = sun.el < -1 ? 'sun is down' : cover.fraction >= 1 ? 'all covered' : cover.fraction > 0 ? `${share(cover.fraction)} covered` : cover.inFront ? 'not covered' : 'moon behind sun';
      label(ctx, words, cx, cy + side / 2 + 10, INK.text, 'center');
    });

    // ----- the map -----
    const top = 17 + side + 24;
    const room = h - top - 18;
    if (room < 40) return;
    const mw = Math.min(w, room * 2);
    const mh = mw / 2;
    const x0 = (w - mw) / 2;
    const X = (lon) => x0 + ((wrap180(lon) + 180) / 360) * mw;
    const Y = (lat) => top + ((90 - lat) / 180) * mh;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, mw, mh);
    ctx.fillStyle = INK.sea;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = INK.land;
    for (const polygon of land?.polygons ?? []) {
      ctx.beginPath();
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i += 2) {
          if (i === 0) ctx.moveTo(X(ring[i]), Y(ring[i + 1]));
          else ctx.lineTo(X(ring[i]), Y(ring[i + 1]));
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
    const path = (places, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let last = null;
      for (const p of places) {
        // A gap, or a hop across the edge of the map, lifts the pen.
        if (!p || !last || Math.abs(wrap180(p.lon) - wrap180(last.lon)) > 180) {
          if (p) ctx.moveTo(X(p.lon), Y(p.lat));
        } else ctx.lineTo(X(p.lon), Y(p.lat));
        last = p;
      }
      ctx.stroke();
    };
    const eclipse = publishedAt(state.date);
    const flat = flatOf(state);
    if (eclipse && eclipse.lat !== null) {
      const track = trackOf(eclipse);
      path(track.map((at) => flatCentre(at, flat)), INK.flat);
      path(track.map((at) => at.globe.centre), INK.globe);
      // The published place for the middle of the eclipse.
      ctx.strokeStyle = INK.real;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(eclipse.lon), Y(eclipse.lat), 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Where each shadow is at this moment.
    const flatNow = m.shade.flat.centre && !m.shade.flat.offMap ? m.shade.flat.centre : null;
    if (flatNow) disc(ctx, X(flatNow.lon), Y(flatNow.lat), 4, INK.flat, INK.moon);
    if (m.shade.globe.centre) disc(ctx, X(m.shade.globe.centre.lon), Y(m.shade.globe.centre.lat), 4, INK.globe, INK.moon);
    // The observer.
    ctx.strokeStyle = INK.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(state.lon) - 5, Y(state.lat));
    ctx.lineTo(X(state.lon) + 5, Y(state.lat));
    ctx.moveTo(X(state.lon), Y(state.lat) - 5);
    ctx.lineTo(X(state.lon), Y(state.lat) + 5);
    ctx.stroke();
    ctx.restore();
    const under = top + mh + 10;
    label(ctx, 'globe', x0 + 2, under, INK.globe, 'left', 600);
    label(ctx, 'flat', x0 + 46, under, INK.flat, 'left', 600);
    label(ctx, '○ published', x0 + 78, under, INK.real, 'left', 600);
    label(ctx, '+ you', x0 + mw - 2, under, INK.text, 'right');
  },
  body(c, { state, km, deg, fmtTime, hoursMinutes, MOON_OFF }) {
    const m = c.moon;
    if (!m) return MOON_OFF;
    const { cover, shade } = m;
    const flat = flatOf(state);
    const eclipse = publishedAt(state.date);
    const central = eclipse && eclipse.lat !== null;
    const minutes = eclipse ? (state.date.getTime() - eclipse.peak.getTime()) / 60000 : 0;
    const named = eclipse ? `the ${KIND[eclipse.kind]} eclipse of the sun of ${day(eclipse.peak)}` : '';
    const opening = !eclipse
      ? 'There is no eclipse of the sun at this moment. Choose one from the list above.'
      : Math.abs(minutes) < 1
      ? `This is the middle of ${named}.${central && kmBetween(state, eclipse) < 30 ? ' The observer is standing where the middle of the shadow is.' : ''}`
      : `This is ${fmtTime(Math.abs(minutes))} ${minutes < 0 ? 'before' : 'after'} the middle of ${named}.`;
    const out = (a, b, limit) => (Math.abs(a - b) > limit ? ' class="bad"' : '');
    const seen = `
    <table class="data"><thead><tr><th></th><th class="measured">Measured</th><th class="globe">Globe</th><th class="flat">Flat</th></tr></thead><tbody>
    <tr><td>Sun covered here</td><td>${share(cover.measured.fraction)}</td><td${out(cover.globe.fraction, cover.measured.fraction, 0.05)}>${share(cover.globe.fraction)}</td>
      <td${out(cover.flat.fraction, cover.measured.fraction, 0.05)}>${cover.flat.inFront ? share(cover.flat.fraction) : 'none'}</td></tr>
    <tr><td>Moon's middle from the sun's</td><td>${deg(cover.measured.sepDeg, 2)}</td><td${out(cover.globe.sepDeg, cover.measured.sepDeg, 0.05)}>${deg(cover.globe.sepDeg, 2)}</td>
      <td${out(cover.flat.sepDeg, cover.measured.sepDeg, 0.05)}>${deg(cover.flat.sepDeg, 2)}</td></tr>
    </tbody></table>
    ${c.obs.el < -1 ? '<p>The sun is below the horizon here at this moment, so none of it can be seen from this spot.</p>' : ''}`;

    // ----- the globe -----
    const g = shade.globe;
    const lands = g.centre
      ? `meets the ground at <b class="g">${placeName(g.centre)}</b>. ${
          g.kind === 'total'
            ? `The fully dark part of the shadow is only <b class="g">${km(2 * g.darkKm)}</b> across there, measured square to the light. That is why a total eclipse is seen from so narrow a strip.`
            : 'Today the moon is far enough away that the fully dark part of its shadow comes to a point before it reaches the ground, and a ring of sun is left showing round the moon.'
        }`
      : `misses the Earth by ${km(g.missKm - EARTH_RADIUS_KM)}${g.kind === 'partial' ? ', though the wider, lighter shadow round it still brushes the ground' : ''}.`;
    const mid = central ? middleOf(eclipse) : null;
    const againstPublished =
      mid?.globe.centre
        ? `<p>For the middle of this eclipse the published place is <b class="m">${placeName(eclipse)}</b>. The sum gives
          <b class="g">${placeName(mid.globe.centre)}</b>, ${km(kmBetween(mid.globe.centre, eclipse))} away.</p>`
        : '';

    // ----- the flat model -----
    const f = shade.flat;
    const heights = `its sun ${km(flat.sunHeightKm)} up and its moon ${km(flat.moonHeightKm)}`;
    const best = mid ? bestFlatMoonHeightKm(mid.sub, mid.moon, eclipse, flat) : null;
    const tuned = best && Math.abs(best.heightKm - flat.moonHeightKm) < 0.6;
    let flatNow;
    if (!f.centre) {
      flatNow = `<p>On the flat model, to pass in front of the sun for anyone on the ground the moon has to be the lower of the
        two. Here the model has ${heights}, ${km(f.gapKm)} apart over the map, and no line through the two comes down to
        the ground: <b class="f">it has no eclipse at all</b>.${best ? ` The height that suits this eclipse best is ${km(best.heightKm)}.` : ''}</p>`;
    } else {
      const apart = g.centre && !f.offMap ? kmBetween(f.centre, g.centre) : null;
      flatNow = `<p>On the flat model, to pass in front of the sun for anyone on the ground the moon has to be the lower of the
        two. Nothing in the model says by how much, ${
          tuned
            ? `so it has been given the height that suits this eclipse best: ${heights}`
            : `and it has ${heights}${best ? ` (${km(best.heightKm)} would suit this eclipse best)` : ''}`
        }. The two are ${km(f.gapKm)} apart over the map, so the line through them comes down
        <b class="f">${km(f.fromMoonKm)}</b> beyond the place under the moon${
          f.offMap ? ', which is beyond the rim of the map.' : `, at <b class="f">${placeName(f.centre)}</b>.`
        } ${apart === null ? '' : `At this moment that is <b class="f">${km(apart)}</b> from the globe's place.`}</p>`;
    }
    let along = '';
    const track = central ? trackOf(eclipse) : [];
    if (track.length > 1 && f.centre) {
      const ends = [track[0], track[track.length - 1]].map((at) => {
        const p = flatCentre(at, flat);
        return p ? `<b class="f">${km(kmBetween(p, at.globe.centre))}</b> away` : '<b class="f">nowhere on the map</b>';
      });
      along = `<p>The moon cannot change height part way through. The real shadow takes
        ${hoursMinutes((track[track.length - 1].date - track[0].date) / 3600000)} to cross the Earth, from a place where the sun
        is rising to one where it is setting. Where it starts, the flat model's shadow is ${ends[0]}. Where it ends, it is
        ${ends[1]}.</p>`;
    }
    // How often a moon at this height would get in the way.
    const moons = everyNewMoon();
    const flatCount = moons.filter((at) => flatCentre(at, flat)).length;
    const often = flatCount
      ? `<p>A moon that sits just under the sun also gets in the way far too often. Taking the moment of each new moon from
        ${SAMPLE_YEARS[0]} to ${SAMPLE_YEARS[1]}, the line through the flat model's sun and moon comes down on the map at
        <b class="f">${flatCount} of the ${moons.length}</b>. The globe's meets the ground at
        <b class="g">${moons.filter((at) => at.globe.centre).length}</b> of them, which is how many total and ring-shaped
        eclipses there were.</p>`
      : '';
    const seenAlready = new Set();
    const rows = LISTED.map(([which]) => listed(which))
      .filter((e) => !seenAlready.has(e.peak.getTime()) && seenAlready.add(e.peak.getTime()))
      .sort((a, b) => a.peak - b.peak)
      .map((e) => {
        const at = middleOf(e);
        const p = flatCentre(at, flat);
        const current = eclipse && e.peak.getTime() === eclipse.peak.getTime();
        const date = day(e.peak, 'short');
        return `<tr><td>${current ? `<b>${date}</b>` : date}</td><td>${deg(at.sunEl, 0)}</td><td>${km(kmBetween(at.globe.centre, e))}</td>
          <td class="bad">${p ? km(kmBetween(p, e)) : 'no shadow'}</td></tr>`;
      })
      .join('');
    const others = `
    <p>Nor can it change height from one eclipse to the next. With the flat moon left at ${km(flat.moonHeightKm)}, this
    is how far each model's shadow is from the published place at the middle of each eclipse:</p>
    <table class="data"><thead><tr><th>Eclipse</th><th>Sun's height there</th><th class="globe">Globe out by</th><th class="flat">Flat out by</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>The lower the sun is during an eclipse, the further out the flat shadow lands. It is the failure shown in
    "Sun angles from many cities", turning up somewhere that millions of people travel to on purpose.</p>`;

    return `
    <p>${opening}</p>
    ${seen}
    <p>Tables of dates that repeat do exist, and they say roughly when the next eclipse will be. They do not say where.
    That takes the shapes and distances of the sun, the moon and the Earth.</p>
    <p>On the globe the moon is a ball ${km(2 * MOON_RADIUS_KM)} wide and ${km(m.point.distKm)} away, passing between us and the
    sun. A straight line from the middle of the sun through the middle of the moon ${lands}</p>
    ${againstPublished}
    <p>That one sum, tried at every new moon from 2020 to 2035, picks out exactly the 34 eclipses of the sun published
    for those years, and says rightly which were total, which left a ring and which were partial. In the 24 where the
    line met the ground it did so within 65 km of the published place. The real Earth is very slightly flattened and
    this ball is not, and that is the whole of the difference.</p>
    ${flatNow}
    ${along}
    ${others}
    ${often}
    <p class="try">Try: press Play, or step the time, and watch the two shadows part on the map. Then drag "Flat model:
    height of the moon" in the panel on the left and see how near the orange track can be brought to the blue one.</p>`;
  },
  checks({ check, near }) {
    // The share of the sun hidden.
    check('solar eclipse argument: discs that do not touch hide nothing, a larger moon dead centre hides everything, a smaller one leaves a ring',
      discCovered(0.26, 0.27, 0.6) === 0 && discCovered(0.26, 0.27, 0.005) === 1 && near(discCovered(0.27, 0.25, 0.01), (0.25 / 0.27) ** 2, 1e-12));
    check('solar eclipse argument: two equal discs with each centre on the other edge share 39.1% of their area',
      near(discCovered(1, 1, 1), 2 / 3 - Math.sqrt(3) / (2 * Math.PI), 1e-12), discCovered(1, 1, 1).toFixed(4));

    // The globe: every new moon from 2020 to 2035, against what is published.
    const published = solarEclipses(2020, 2035);
    const moons = newMoons(2020, 2035);
    let wrong = 0;
    let found = 0;
    for (const moon of moons) {
      // The nearest the line through the sun and moon comes to the Earth's centre: every ten minutes, then every minute.
      const nearest = (from, to, step) => {
        let best = null;
        for (let t = from; t <= to; t += step) {
          const at = moment(new Date(t));
          if (!best || at.globe.missKm < best.globe.missKm) best = at;
        }
        return best;
      };
      const rough = nearest(moon.getTime() - 8 * 3600000, moon.getTime() + 8 * 3600000, 600000);
      const fine = nearest(rough.date.getTime() - 600000, rough.date.getTime() + 600000, 60000);
      const match = published.find((e) => Math.abs(e.peak.getTime() - fine.date.getTime()) < 6 * 3600000);
      if (fine.globe.kind !== 'none') found++;
      if (fine.globe.kind !== (match?.kind ?? 'none')) wrong++;
    }
    check(`solar eclipse argument: of ${moons.length} new moons from 2020 to 2035 the globe's sum picks out the 34 published eclipses, each of the right kind, and no others`,
      published.length === 34 && found === 34 && wrong === 0, `${found} found, ${wrong} wrong`);
    const central = published.filter((e) => e.lat !== null);
    const offs = central.map((e) => kmBetween(middleOf(e).globe.centre, e));
    check('solar eclipse argument: in the 24 where the line meets the ground, it does so within 65 km of the published place',
      central.length === 24 && Math.max(...offs) < 65, `worst ${Math.max(...offs).toFixed(1)} km`);
    // The same line met with the Earth as it really is: 6,378.137 km across the equator, 6,356.752 km through the poles.
    const onFlattened = (at) => {
      const [a, b] = [6378.137, 6356.752];
      const squash = a / b; // stretching the polar axis by this much turns the flattened Earth into a ball of radius a
      const place = (p, distKm) => {
        const [lat, lon] = [p.lat * DEG, p.lon * DEG];
        return [distKm * Math.cos(lat) * Math.cos(lon), distKm * Math.sin(lat) * squash, -distKm * Math.cos(lat) * Math.sin(lon)];
      };
      const sun = place(at.sub, at.sub.distKm);
      const moon = place(at.moon, at.moon.distKm);
      const gap = Math.hypot(moon[0] - sun[0], moon[1] - sun[1], moon[2] - sun[2]);
      const dir = moon.map((v, i) => (v - sun[i]) / gap);
      const along = moon[0] * dir[0] + moon[1] * dir[1] + moon[2] * dir[2];
      const t = -along - Math.sqrt(along * along - (moon[0] ** 2 + moon[1] ** 2 + moon[2] ** 2 - a * a));
      const hit = moon.map((v, i) => v + dir[i] * t);
      // Latitude as maps give it: the tilt of the ground there, not the angle at the Earth's centre.
      return { lat: Math.atan2((hit[1] / squash) * squash * squash, Math.hypot(hit[0], hit[2])) / DEG, lon: Math.atan2(-hit[2], hit[0]) / DEG };
    };
    const offsFlattened = central.map((e) => kmBetween(onFlattened(middleOf(e)), e));
    check('solar eclipse argument: met with the Earth as flattened as it really is, the same line is within a km of the published place every time',
      Math.max(...offsFlattened) < 1, `worst ${Math.max(...offsFlattened).toFixed(2)} km`);
    check("solar eclipse argument: and it passes the Earth's centre at the published distance, to within a km",
      published.every((e) => near(middleOf(e).globe.missKm, e.axisKm, 1)));
    // At the place the sum names, the published sun and moon line up.
    const lined = central.map((e) => {
      const p = middleOf(e).globe.centre;
      return sunCovered(observedSun(e.peak, p.lat, p.lon, null), observedMoon(e.peak, p.lat, p.lon, null)).sepDeg;
    });
    check("solar eclipse argument: seen from the place the sum names, the published moon is within a hundredth of a degree of the sun's middle",
      Math.max(...lined) < 0.01, `worst ${Math.max(...lined).toFixed(4)}°`);
    const seenGlobe = central.map((e) => {
      const at = middleOf(e);
      const there = sunCovered(globePredict(at.sub, e.lat, e.lon, null), globePredictNear(at.moon, e.lat, e.lon, null));
      const real = sunCovered(observedSun(e.peak, e.lat, e.lon, null), observedMoon(e.peak, e.lat, e.lon, null));
      return Math.abs(there.fraction - real.fraction);
    });
    check('solar eclipse argument: at the published place the globe hides the same share of the sun as is measured, to within a hundredth',
      Math.max(...seenGlobe) < 0.01, `worst ${Math.max(...seenGlobe).toFixed(4)}`);

    // The flat model.
    const sub = { lat: 60, lon: 0 };
    const moon = { lat: 60, lon: 10 };
    const gap = moonShadowFlat(sub, moon, { sunHeightKm: 5000, moonHeightKm: 5000 }).gapKm;
    check('solar eclipse argument: a flat moon level with the sun, or above it, casts no shadow on the ground',
      moonShadowFlat(sub, moon, { sunHeightKm: 5000, moonHeightKm: 5000 }).centre === null && moonShadowFlat(sub, moon, { sunHeightKm: 5000, moonHeightKm: 6000 }).centre === null);
    const low = moonShadowFlat(sub, moon, { sunHeightKm: 5000, moonHeightKm: 4000 });
    check('solar eclipse argument: a flat moon 4,000 km up under a sun at 5,000 km throws its shadow four times their distance apart beyond itself',
      near(low.fromMoonKm, 4 * gap, 1e-6), `${low.fromMoonKm.toFixed(1)} against ${(4 * gap).toFixed(1)}`);
    check('solar eclipse argument: and straight beneath the sun it throws it straight down',
      near(moonShadowFlat(sub, sub, { sunHeightKm: 5000, moonHeightKm: 4000 }).centre.lat, 60, 1e-9));
    // With bending light the place found has to be one from which a single curved path passes through both.
    const bend = flatBendPerKm({ sunHeightKm: 5000, bendSetKm: 10000 });
    const close = { lat: 60, lon: 0.5 };
    const bent = moonShadowFlat(sub, close, { sunHeightKm: 5000, moonHeightKm: 4900, bendPerKm: bend });
    const slope = (4900 - (bend * bent.fromMoonKm ** 2) / 2) / bent.fromMoonKm;
    const atSun = slope * (bent.fromMoonKm + bent.gapKm) + (bend * (bent.fromMoonKm + bent.gapKm) ** 2) / 2;
    check('solar eclipse argument: with bending light, the path from the place it names passes through the moon and then the sun', near(atSun, 5000, 1e-6), atSun.toFixed(4));
    check('solar eclipse argument: and where the two are too far apart for any one path to pass through both, there is no shadow',
      moonShadowFlat(sub, moon, { sunHeightKm: 5000, moonHeightKm: 4900, bendPerKm: bend }).centre === null);

    // Giving the flat moon its best height for each eclipse in turn.
    const flat = { sunHeightKm: 5000, bendPerKm: 0 };
    const fits = central.map((e) => ({ e, sunEl: middleOf(e).sunEl, ...bestFlatMoonHeightKm(middleOf(e).sub, middleOf(e).moon, e, flat) }));
    const lowSun = fits.filter((x) => x.sunEl < 35);
    check('solar eclipse argument: with its best height for each eclipse, the flat shadow is still over 500 km out whenever the sun is under 35° up',
      lowSun.length >= 5 && lowSun.every((x) => x.missKm > 500), lowSun.map((x) => Math.round(x.missKm)).join(', '));
    const heights = fits.map((x) => x.heightKm);
    check('solar eclipse argument: and the best height is not the same from one eclipse to the next',
      Math.max(...heights) - Math.min(...heights) > 20, `${Math.min(...heights)} to ${Math.max(...heights)} km`);
    const sample = everyNewMoon();
    const counts = [Math.min(...heights), Math.max(...heights)].map((moonHeightKm) => sample.filter((at) => flatCentre(at, { ...flat, moonHeightKm })).length);
    const real = sample.filter((at) => at.globe.centre).length;
    check('solar eclipse argument: a flat moon at any of those heights casts a shadow on the map at more than twice as many new moons as have a real one',
      real === 24 && Math.min(...counts) > 2 * real, `${counts.join(' and ')} against ${real}`);
    const dated = Object.keys(FROM).map((which) => listed(which).peak.toISOString().slice(0, 10)).sort();
    check('solar eclipse argument: the dated eclipses in its list are the ones named',
      dated.join(' ') === '2017-08-21 2024-04-08 2026-08-12' && LISTED.every(([which]) => listed(which).kind === 'total'), dated.join(' '));
    const y2026 = listed('2026');
    const y2027 = solarEclipses(2027, 2027).find((e) => e.kind === 'total');
    const forOne = bestFlatMoonHeightKm(middleOf(y2027).sub, middleOf(y2027).moon, y2027, flat);
    const onOther = flatCentre(middleOf(y2026), { ...flat, moonHeightKm: forOne.heightKm });
    check('solar eclipse argument: the height that suits the eclipse of August 2027 puts the shadow of August 2026 over 1,000 km out',
      forOne.missKm < 100 && kmBetween(onOther, y2026) > 1000, `${Math.round(forOne.missKm)} km, then ${Math.round(kmBetween(onOther, y2026))} km`);
  },
};
