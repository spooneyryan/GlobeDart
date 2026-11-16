// Mars doubles back.
//
// About every 26 months Mars stops among the stars, goes backward for some
// weeks and then carries on. This demonstration follows it for 100 days either
// side of one such time, three ways:
//
//   measured     where the almanac puts Mars each day (astro.js, planetSeen). This is the published
//                figure, the thing to be explained. Neither of the other two is given it, except as below
//   two orbits   where Mars should be seen if it and the Earth each go round the sun on an ellipse
//                (planets.js, seenFromEarth). It is given six published numbers for each orbit and no
//                positions in the sky
//   steady       the flat model has no agreed rule for a planet, so it is given the kindest simple one:
//                a light that moves at a steady rate, and is handed the measured place on the first
//                day and on the last, so that it starts and ends right
//
// Places are measured in degrees along the sun's yearly path among the stars
// (`lon`) and north of it (`lat`).
import { wrap360, planetSeen, nextInLine } from '../astro.js';
import { seenFromEarth, orbitPlace, stations } from '../planets.js';
import { INK, label, disc, line, day, turn, keeper } from './sketch.js';

// The oppositions offered. Each dated one is the first on or after the day given.
// An entry of this list that is the same one as "the next" is left off it.
const ALL_LISTED = [
  ['next', 'The next'],
  ['2027', 'February 2027'],
  ['2025', 'January 2025'],
  ['2022', 'December 2022'],
];
const FROM = { 2027: Date.UTC(2027, 1, 1), 2025: Date.UTC(2025, 0, 1), 2022: Date.UTC(2022, 10, 1) };
const SPAN_DAYS = 100; // how long before and after opposition the path is followed
const SIGHT_EVERY_DAYS = 25; // how far apart the faint lines of sight in the lower drawing are
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MARS = '#ff8f6b';
// How long each planet takes to go once round the sun, in days. Used only to draw each orbit as a closed ring.
const EARTH_YEAR_DAYS = 365.256;
const MARS_YEAR_DAYS = 686.98;
// The furthest Mars gets from the sun, in astronomical units (the Earth's own distance from the sun).
const MARS_FURTHEST_AU = 1.67;

const keep = keeper();

/** The moment of the opposition an entry of the list stands for, as published. "Next" means the next after today. */
function opposition(which) {
  const from = FROM[which] ?? Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return keep(`when ${from}`, () => nextInLine('Mars', new Date(from)).getTime());
}

const LISTED = ALL_LISTED.filter(([which]) => which === 'next' || opposition(which) !== opposition('next'));
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * Mars day by day round one opposition, three ways: as published, as two
 * planets going round the sun make it, and as a light that goes steadily from
 * where it starts to where it ends. Each is a list of { t, lon, lat }, one a
 * day at the same moments, so that the three can be compared day for day.
 */
function pathOf(which) {
  const mid = opposition(which);
  return keep(`path ${mid}`, () => {
    const times = [];
    for (let d = -SPAN_DAYS; d <= SPAN_DAYS; d++) times.push(mid + d * DAY_MS);
    const seen = times.map((t) => ({ t, ...planetSeen('Mars', new Date(t)) }));
    const sum = times.map((t) => ({ t, ...seenFromEarth('Mars', new Date(t)) }));
    // The steady light: the same share of the whole way each day, in both directions.
    //   lon = first + (last − first) × (day ÷ days in all)        and the same for lat
    // Over this stretch Mars ends ahead of where it began, so the shorter way round from first to last is the way it went.
    const [first, last] = [seen[0], seen[seen.length - 1]];
    const whole = turn(first.lon, last.lon);
    const steady = times.map((t, i) => {
      const part = i / (times.length - 1);
      return { t, lon: first.lon + whole * part, lat: first.lat + (last.lat - first.lat) * part };
    });
    // The days each path stops and turns round, found the same way for both (planets.js, stations).
    return { mid, seen, sum, steady, turns: { seen: stations(seen), sum: stations(sum) } };
  });
}

/**
 * One of those three at a moment between two of its days, taken as the same
 * share of the way from the day before to the day after. `perDay` is how far
 * it moves between those two days, in degrees: below zero is backward.
 */
function at(list, t) {
  const i = Math.min(list.length - 2, Math.max(0, Math.floor((t - list[0].t) / DAY_MS)));
  const part = Math.min(1, Math.max(0, (t - list[i].t) / DAY_MS));
  const perDay = turn(list[i].lon, list[i + 1].lon);
  return { lon: list[i].lon + perDay * part, lat: list[i].lat + (list[i + 1].lat - list[i].lat) * part, perDay };
}

/** A day's movement in words: "0.31° back". */
const motion = (perDay) => (Math.abs(perDay) < 0.005 ? 'none' : `${Math.abs(perDay).toFixed(2)}° ${perDay < 0 ? 'back' : 'on'}`);

export default {
  id: 'retrograde',
  group: 'stars',
  label: 'Mars doubles back',
  title: 'Why does Mars stop and go backward?',
  claim: 'The planets are wandering stars: lights that move across the dome. Nothing goes round the sun, least of all the Earth.',
  ask: 'About every two years Mars slows to a stop among the stars, goes backward for eleven weeks, stops again and carries on. What would a light on a turning dome have to do to manage that?',
  check: 'Mark where Mars is among the stars once a week for the three months round its next opposition. It stops, backs up and sets off again on dates that were worked out years ahead.',
  tool: 'sky',
  pair: 'sky',
  controls: [
    { id: 'which', label: 'Opposition of Mars', value: 'next', options: LISTED, sets: true },
    { id: 'days', label: 'Days from opposition', value: 0, min: -SPAN_DAYS, max: SPAN_DAYS, step: 2, sets: true, show: (v) => (v === 0 ? 'the day itself' : `${Math.abs(v)} ${v < 0 ? 'before' : 'after'}`) },
  ],
  apply({ state, goToMidnight, STAR_DEMO }, own) {
    state.date = new Date(opposition(own.which) + own.days * DAY_MS);
    // Round opposition Mars is opposite the sun, so it is highest in the middle of the night.
    goToMidnight();
    Object.assign(state, STAR_DEMO, { star: 'Mars', sightLines: false, trails: false });
  },
  drawHeight: 330,
  /**
   * Above: the path of Mars against the stars, with east to the left as the sky has it.
   * Below: the Earth and Mars going round the sun, seen from above, with the line of sight from one to the other.
   */
  draw(ctx, { w, h }, c, { state }, own) {
    const path = pathOf(own.which);
    // The moment on show, held inside the stretch the path covers.
    const now = Math.min(path.seen[path.seen.length - 1].t, Math.max(path.seen[0].t, state.date.getTime()));
    const inSpan = Math.abs(state.date.getTime() - path.mid) <= SPAN_DAYS * DAY_MS;

    // ----- among the stars -----
    // A chart of the sky: degrees along the sun's path across, counted from where Mars is at opposition,
    // and degrees north of that path up. One scale serves both ways, so the loop keeps its true shape:
    // as many pixels to a degree as fit the width, and no more than make the chart 120 pixels tall.
    const mid = at(path.seen, path.mid);
    const off = (p) => turn(mid.lon, p.lon);
    const all = [...path.seen, ...path.sum, ...path.steady];
    const [lo, hi] = [Math.min(...all.map(off)) - 2, Math.max(...all.map(off)) + 2];
    const [latLo, latHi] = [Math.min(...all.map((p) => p.lat), 0) - 2.6, Math.max(...all.map((p) => p.lat), 0) + 2.6];
    const top = 18;
    const scale = Math.min((w - 8) / (hi - lo), 120 / (latHi - latLo)); // pixels to a degree
    const chartH = (latHi - latLo) * scale;
    const x0 = (w - (hi - lo) * scale) / 2;
    const X = (p) => x0 + (hi - off(p)) * scale; // east, the way Mars usually goes, is to the left
    const Y = (p) => top + (latHi - p.lat) * scale;
    ctx.fillStyle = INK.panel;
    ctx.fillRect(x0, top, (hi - lo) * scale, chartH);
    // The sun's own path, as a dashed line.
    line(ctx, [[x0, Y({ lat: 0 })], [x0 + (hi - lo) * scale, Y({ lat: 0 })]], INK.line, 1, [4, 4]);
    label(ctx, 'Mars among the stars', x0 + 2, 7, INK.text, 'left', 600);
    label(ctx, '← east', x0 + (hi - lo) * scale - 2, 7, INK.muted, 'right');
    // The three paths. The sum is drawn wide and the measured path thin on top of it, so that both show where they agree.
    line(ctx, path.sum.map((p) => [X(p), Y(p)]), INK.globe, 4);
    line(ctx, path.steady.map((p) => [X(p), Y(p)]), INK.flat, 1.5, [5, 4]);
    line(ctx, path.seen.map((p) => [X(p), Y(p)]), INK.real, 1.5);
    // A dot every ten days, so the slowing shows.
    path.seen.forEach((p, i) => {
      if (i % 10 === 0) disc(ctx, X(p), Y(p), 1.8, INK.real);
    });
    // Where it turns, with the date.
    for (const stop of path.turns.seen) {
      const p = at(path.seen, stop.t);
      const side = stop.backward ? 1 : -1;
      // The first turn is the left-hand end of the loop. Its date is written over it, and the other's under it.
      const x = Math.min(x0 + (hi - lo) * scale - 44, Math.max(x0 + 44, X(p)));
      label(ctx, `${stop.backward ? 'turns back' : 'goes on'} ${day(stop.t, 'short', null)}`, x, Y(p) + side * -13, INK.real, 'center', 400, 11);
    }
    // Where each of the three has Mars at the moment on show.
    if (inSpan) {
      const [seen, sum, steady] = [at(path.seen, now), at(path.sum, now), at(path.steady, now)];
      disc(ctx, X(steady), Y(steady), 4, INK.flat, INK.dark);
      disc(ctx, X(sum), Y(sum), 7, null, INK.globe);
      disc(ctx, X(seen), Y(seen), 3.5, INK.real, INK.dark);
    }
    const under = top + chartH + 10;
    label(ctx, 'measured', x0 + 2, under, INK.real, 'left', 600);
    label(ctx, 'two orbits', x0 + 62, under, INK.globe, 'left', 600);
    label(ctx, 'steady light', x0 + 128, under, INK.flat, 'left', 600);

    // ----- from above the sun -----
    // A plan of the two orbits with the sun in the middle, looking down on the Earth's orbit from its north
    // side. The scale is pixels to an astronomical unit, set so that the furthest Mars gets from the sun
    // sits 12 pixels inside the rim. The rim itself stands for the far-off stars.
    const room = h - under - 14;
    if (room < 60) return;
    const r = Math.min(w / 2 - 6, room / 2);
    const cx = w / 2;
    const cy = under + 12 + r;
    const au = (r - 12) / MARS_FURTHEST_AU;
    const P = (v) => [cx + v[0] * au, cy - v[1] * au];
    disc(ctx, cx, cy, r, INK.panel, INK.edge);
    // Each orbit as a ring: the planet's place at 73 moments spread over one trip round the sun.
    const orbit = (name, period) => {
      const points = [];
      for (let k = 0; k <= 72; k++) points.push(P(orbitPlace(name, new Date(path.mid + ((k / 72) * period - period / 2) * DAY_MS))));
      line(ctx, points, INK.line, 1);
    };
    orbit('Earth', EARTH_YEAR_DAYS);
    orbit('Mars', MARS_YEAR_DAYS);
    disc(ctx, cx, cy, 4, INK.sun);
    // The line of sight from the Earth through Mars, out to the stars, every 25 days and now.
    const sight = (t, strong) => {
      const s = seenFromEarth('Mars', new Date(t));
      const [e, m] = [P(s.earth), P(s.planet)];
      const dir = [m[0] - e[0], m[1] - e[1]];
      const len = Math.hypot(...dir);
      // Where that line meets the rim. With E the Earth's place measured from the middle of the drawing
      // and u the direction of the line, the point a distance t along it is on the rim when |E + t × u| = r:
      //   b = E · u
      //   t = −b + √(b² − (|E|² − r²))
      const [ex, ey] = [e[0] - cx, e[1] - cy];
      const b = (ex * dir[0] + ey * dir[1]) / len;
      const reach = -b + Math.sqrt(b * b - (ex * ex + ey * ey - r * r));
      const end = [e[0] + (dir[0] / len) * reach, e[1] + (dir[1] / len) * reach];
      line(ctx, [e, end], strong ? INK.globe : 'rgba(127, 180, 255, 0.3)', strong ? 1.8 : 1);
      disc(ctx, e[0], e[1], strong ? 4 : 2, strong ? INK.globe : 'rgba(127, 180, 255, 0.55)');
      disc(ctx, m[0], m[1], strong ? 4 : 2, strong ? MARS : 'rgba(255, 143, 107, 0.55)');
      disc(ctx, end[0], end[1], strong ? 3.5 : 2, strong ? INK.text : INK.muted);
      return { e, m };
    };
    for (let d = -SPAN_DAYS; d <= SPAN_DAYS; d += SIGHT_EVERY_DAYS) sight(path.mid + d * DAY_MS, false);
    if (inSpan) {
      const { e, m } = sight(now, true);
      label(ctx, 'Earth', e[0], e[1] + 11, INK.globe, 'center', 600);
      label(ctx, 'Mars', m[0], m[1] - 11, MARS, 'center', 600);
    }
    label(ctx, 'From above: the Earth overtakes Mars', w / 2, h - 7, INK.muted, 'center');
  },
  body(c, { state, deg, hoursMinutes }, own) {
    const path = pathOf(own.which);
    const t = state.date.getTime();
    const daysOff = (t - path.mid) / DAY_MS;
    if (Math.abs(daysOff) > SPAN_DAYS + 0.6) {
      return `<p>The time has been moved more than ${SPAN_DAYS} days from the opposition of ${day(path.mid)}. Bring the
      slider above back, or choose an opposition from the list.</p>`;
    }
    const [seen, sum, steady] = [at(path.seen, t), at(path.sum, t), at(path.steady, t)];
    // A cell of the table is marked as wrong when it is further from the measured figure than `limit`, in degrees.
    const bad = (a, b, limit) => (Math.abs(turn(a, b)) > limit ? ' class="bad"' : '');
    // The two turns: where Mars stops and sets off backward, and where it stops again and goes on.
    const [back, on] = [path.turns.seen.find((s) => s.backward), path.turns.seen.find((s) => !s.backward)];
    const [backSum, onSum] = [path.turns.sum.find((s) => s.backward), path.turns.sum.find((s) => !s.backward)];
    const when = (s) => (s ? day(s.t, 'short', null) : 'never');
    // How far it goes backward, in degrees: from its place at the first turn to its place at the second.
    const arc = (list, a, b) => (a && b ? Math.abs(turn(at(list, a.t).lon, at(list, b.t).lon)) : 0);
    const weeks = back && on ? (on.t - back.t) / (7 * DAY_MS) : 0;
    // The most each of the other two is out from the measured place on any day of the stretch, in degrees along the sun's path.
    const worst = Math.max(...path.seen.map((p, i) => Math.abs(turn(p.lon, path.sum[i].lon))));
    const worstSteady = Math.max(...path.seen.map((p, i) => Math.abs(turn(p.lon, path.steady[i].lon))));
    // How far the sum's turns are from the measured ones in time, taking the worse of the two, in hours.
    const late = back && on && backSum && onSum ? Math.max(Math.abs(backSum.t - back.t), Math.abs(onSum.t - on.t)) / HOUR_MS : 0;
    // The scene is put at the middle of the night, which can be most of a day from the slider's moment. So the
    // days are the slider's own unless the time has been moved somewhere else.
    const n = Math.abs(daysOff - own.days) <= 1 ? own.days : Math.round(daysOff);
    const where = n === 0 ? 'This is the night of the opposition' : `This is ${days(Math.abs(n))} ${n < 0 ? 'before' : 'after'} the opposition`;
    return `
    <p>${where} of ${day(path.mid)}, when the Earth passes between Mars and the sun. Mars is then at its nearest and
    brightest, and up all night.</p>
    <table class="data"><thead><tr><th></th><th class="measured">Measured</th><th class="globe">Two orbits</th><th class="flat">Steady</th></tr></thead><tbody>
    <tr><td>Place along the sun's path</td><td>${deg(wrap360(seen.lon), 2)}</td><td${bad(seen.lon, sum.lon, 0.2)}>${deg(wrap360(sum.lon), 2)}</td><td${bad(seen.lon, steady.lon, 0.2)}>${deg(wrap360(steady.lon), 2)}</td></tr>
    <tr><td>Moves each day</td><td>${motion(seen.perDay)}</td><td${Math.abs(seen.perDay - sum.perDay) > 0.02 ? ' class="bad"' : ''}>${motion(sum.perDay)}</td><td${Math.abs(seen.perDay - steady.perDay) > 0.05 ? ' class="bad"' : ''}>${motion(steady.perDay)}</td></tr>
    <tr><td>Turns back</td><td>${when(back)}</td><td>${when(backSum)}</td><td class="bad">never</td></tr>
    <tr><td>Goes on again</td><td>${when(on)}</td><td>${when(onSum)}</td><td class="bad">never</td></tr>
    <tr><td>Goes backward by</td><td>${deg(arc(path.seen, back, on), 1)}</td><td>${deg(arc(path.sum, backSum, onSum), 1)}</td><td class="bad">0°</td></tr>
    </tbody></table>
    <p>Night by night Mars drifts east among the stars. Then it slows, stops on <b class="m">${when(back)}</b>, goes
    backward for <b class="m">${weeks.toFixed(0)} weeks</b>, stops again on <b class="m">${when(on)}</b> and carries on.
    The teal line in the drawing is that path, with a dot every ten days.</p>
    <p>The globe model belongs to a larger picture, in which the Earth is one of the planets going round the sun. The
    blue line is what that picture gives. It uses six published numbers for the shape and place of each of the two
    orbits and nothing else: no positions in the sky. The Earth is on the inside lane and goes faster, so about every
    26 months it overtakes Mars, and Mars seems to fall back against the far stars, as a slower car does when you pass
    it. In the lower drawing the lines of sight from the Earth through Mars show it: their far ends go one way, then
    back, then on again.</p>
    <p>Over these ${2 * SPAN_DAYS} days that sum is never more than <b class="g">${deg(worst, 2)}</b> from the
    measured place, and it has each turn within <b class="g">${late < 1.5 ? 'about an hour' : hoursMinutes(late)}</b> of
    the right moment.</p>
    <p>The flat model has no agreed rule for how a planet moves. Its sun goes round the dome at a steady rate, so the
    amber line gives Mars the same: a steady light that starts and ends this stretch in the right places. It is out by
    up to <b class="f">${deg(worstSteady, 1)}</b>, about ${Math.round(worstSteady / 0.5)} times the width of the full
    moon, and it never turns. To follow the real path, the light would have to be told when to stop and when to go
    back, at every opposition separately, because no two loops are alike. That is a record of what Mars does. It is
    not a reason for it.</p>
    <p>Where the two lines come from: the teal one is the published almanac position, worked out by Astronomy
    Engine, and the blue one uses the orbit figures published by NASA's Jet Propulsion Laboratory. Both rest on
    the same centuries of observations, so their agreeing is not an independent test and is not offered as one.
    What it shows is that six numbers for each orbit are enough to draw the loop. The independent test is the
    teal line against Mars itself, which anyone with a star chart and a notebook can make.</p>
    <p>The two large views show where each model puts Mars in tonight's sky. They are both simply told where it is
    overhead, so neither is being tested on its path there. The test is in the drawing.</p>
    <p class="try">Try: drag "Days from opposition" from one end to the other and watch the far end of the line of
    sight go forward, back, and forward again. Then choose another opposition: the loop is a different shape each
    time, and the same sum draws it.</p>`;
  },
  checks({ check, near }) {
    const dated = Object.keys(FROM).sort().map((which) => new Date(opposition(which)).toISOString().slice(0, 10));
    check('Mars argument: the dated oppositions in its list are the ones named', dated.join(' ') === '2022-12-08 2025-01-16 2027-02-19', dated.join(' '));
    const paths = Object.keys(FROM).map(pathOf);
    // The miss on the sky each day: the difference along the sun's path and the difference north of it, taken together.
    const worst =Math.max(...paths.flatMap((p) => p.seen.map((s, i) => Math.hypot(turn(s.lon, p.sum[i].lon), s.lat - p.sum[i].lat))));
    check('Mars argument: two ellipses round the sun put Mars within 0.05° of its published place on every day of all three stretches', worst < 0.05, `worst ${worst.toFixed(3)}°`);
    check('Mars argument: the published path turns back once and goes on once in each, and so does the sum',
      paths.every((p) => p.turns.seen.length === 2 && p.turns.sum.length === 2 && p.turns.seen[0].backward && !p.turns.seen[1].backward && p.turns.sum[0].backward && !p.turns.sum[1].backward));
    const late = Math.max(...paths.flatMap((p) => p.turns.seen.map((s, i) => Math.abs(s.t - p.turns.sum[i].t) / HOUR_MS)));
    check('Mars argument: the sum has every one of those turns within two hours of the published moment', late < 2, `worst ${late.toFixed(1)} h`);
    const arcs = paths.map((p) => Math.abs(turn(at(p.seen, p.turns.seen[0].t).lon, at(p.seen, p.turns.seen[1].t).lon)));
    const lengths = paths.map((p) => (p.turns.seen[1].t - p.turns.seen[0].t) / DAY_MS);
    check('Mars argument: Mars goes backward by between 15° and 21°, for between 10 and 12 weeks, and no two loops are alike',
      arcs.every((a) => a > 15 && a < 21) && lengths.every((d) => d > 70 && d < 84) && Math.max(...arcs) - Math.min(...arcs) > 1,
      arcs.map((a, i) => `${a.toFixed(1)}° in ${lengths[i].toFixed(0)} days`).join(', '));
    const steady = Math.min(...paths.map((p) => Math.max(...p.seen.map((s, i) => Math.abs(turn(s.lon, p.steady[i].lon))))));
    check('Mars argument: a steady light that starts and ends in the right places never turns, and is over 10° out at some point of each stretch',
      steady > 10 && paths.every((p) => stations(p.steady).length === 0), `least ${steady.toFixed(1)}°`);
    // The Earth's own orbit, which every one of these lines of sight starts from.
    const year = orbitPlace('Earth', new Date(Date.UTC(2025, 0, 4)));
    const half = orbitPlace('Earth', new Date(Date.UTC(2025, 6, 4)));
    check('Mars argument: the sum has the Earth 0.983 of its average distance from the sun in early January and 1.017 in early July',
      near(Math.hypot(...year), 0.9833, 0.0005) && near(Math.hypot(...half), 1.0167, 0.0005), `${Math.hypot(...year).toFixed(4)} and ${Math.hypot(...half).toFixed(4)}`);
  },
};
