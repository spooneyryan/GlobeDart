// The phases of Venus.
//
// Through a small telescope Venus shows a disc with phases like the moon's,
// and the disc is widest when least of it is lit. This demonstration follows
// its width and the share of its face that is lit over the 584 days from one
// far side of the sun to the next, three ways:
//
//   measured     the almanac's figures for each day (astro.js, planetSeen): how far away Venus is, which
//                gives its width, and how much of its face is lit. The published thing to be explained
//   two orbits   what Venus should show if it and the Earth each go round the sun on an ellipse
//                (planets.js, seenFromEarth). It is given six published numbers for each orbit and
//                nothing seen in the sky
//   flat         a ball at the height the flat model gives its stars, over the place Venus is overhead
//                (that place is taken from the almanac, and handed to it), lit by the flat model's sun
//
// Widths are in seconds of arc, 3,600 to a degree.
import { subsolarPoint, starPoints, planetSeen, nextInLine } from '../astro.js';
import { flatPlace, flatMapDistanceKm, litFraction } from '../models.js';
import { seenFromEarth, widthSec, AU_KM } from '../planets.js';
import { INK, label, line, day, keeper } from './sketch.js';

// The times Venus passes between us and the sun that are offered. Each dated one is the first on or after the day given.
// An entry of this list that is the same one as "the next" is left off it.
const ALL_LISTED = [
  ['next', 'The next'],
  ['2026', 'October 2026'],
  ['2025', 'March 2025'],
  ['2023', 'August 2023'],
];
const FROM = { 2026: Date.UTC(2026, 9, 1), 2025: Date.UTC(2025, 2, 1), 2023: Date.UTC(2023, 7, 1) };
const SPAN_DAYS = 292; // half the 584 days from one such passing to the next
const STEP_DAYS = 73; // how far apart the pictures in the drawing are: an eighth of the 584
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const TWILIGHT_MS = 25 * 60000; // how long after sunset, or before sunrise, the scene is set
const VENUS = { body: 'Venus' }; // how astro.js is asked for a planet's place in place of a star's

const keep = keeper();

/** The moment an entry of the list stands for, as published. "Next" means the next after today. */
function passing(which) {
  const from = FROM[which] ?? Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return keep(`when ${from}`, () => nextInLine('Venus', new Date(from)).getTime());
}

const LISTED = ALL_LISTED.filter(([which]) => which === 'next' || passing(which) !== passing('next'));
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * Venus through a telescope at a moment, as published (`seen`) and as two
 * planets going round the sun make it (`sum`). Each has the share of its face
 * that is lit, its width in seconds of arc and its distance in astronomical
 * units. Both widths come from the one rule, in planets.js: the real width of
 * Venus, 12,104 km, seen from each one's own distance.
 */
function both(t) {
  const date = new Date(t);
  const seen = planetSeen('Venus', date);
  return { seen: { lit: seen.lit, widthSec: widthSec('Venus', seen.distAu), distAu: seen.distAu }, sum: seenFromEarth('Venus', date) };
}

/** Day by day over the whole stretch, for the widest, the narrowest and the worst the sum does. */
function cycleOf(which) {
  const mid = passing(which);
  return keep(`cycle ${mid}`, () => {
    const list = [];
    for (let d = -SPAN_DAYS; d <= SPAN_DAYS; d++) list.push(both(mid + d * DAY_MS));
    return { mid, days: list };
  });
}

/**
 * How wide something looks, in seconds of arc, when it is really w across and
 * a distance s away:
 *   2 × atan(w ÷ 2s)      in degrees, times 3,600
 */
const looksSec = (widthKm, awayKm) => (2 * Math.atan(widthKm / 2 / awayKm) * 3600 * 180) / Math.PI;

/**
 * The flat model's Venus at a moment: a ball at the height H of its stars, over
 * the place Venus is overhead, lit by the flat sun. `realKm` is the width the
 * ball really has. With d the distance over the map from the observer to the
 * place under it:
 *
 *   s      = √(d² + H²)            the straight-line distance to it
 *   width  = 2 × atan(w ÷ 2s)      how wide it then looks
 *   lit    = (1 + cos angle) ÷ 2   with the angle at the ball between the flat sun and the observer,
 *                                  the same rule as serves both models for the moon (models.js, litFraction)
 */
function flatVenus(t, state, realKm) {
  const date = new Date(t);
  const sub = subsolarPoint(date);
  const under = starPoints(date, [VENUS])[0];
  const groundKm = flatMapDistanceKm(state.lat, state.lon, under.lat, under.lon);
  const slantKm = Math.hypot(groundKm, state.starHeightKm);
  return {
    slantKm,
    widthSec: looksSec(realKm, slantKm),
    lit: litFraction(flatPlace(sub.lat, sub.lon, state.sunHeightKm), flatPlace(under.lat, under.lon, state.starHeightKm), flatPlace(state.lat, state.lon)),
  };
}

/** The flat ball hour by hour for a day from a moment: what it would show while the sky turns once. */
function flatThroughDay(t, state, realKm) {
  const list = [];
  for (let hour = 0; hour < 24; hour++) list.push(flatVenus(t + hour * HOUR_MS, state, realKm));
  return list;
}

/**
 * How wide the flat ball has to be. Nothing in the model says, so it is made
 * to show a width in the middle of the range that is measured, 24 seconds of
 * arc, to someone straight beneath it, H below:
 *   w = 2 × H × tan(24″ ÷ 2)
 * The app does the same for the flat sun (models.js, flatPredict).
 */
const MIDDLE_WIDTH_SEC = 24;
const flatRealKm = (state) => 2 * state.starHeightKm * Math.tan((MIDDLE_WIDTH_SEC / 2 / 3600) * (Math.PI / 180));

/**
 * A planet as a telescope shows it: a dark disc of radius `r` pixels with the
 * lit part on one side. The line between light and dark on a ball is half an
 * ellipse, as tall as the disc and |1 − 2 × lit| of its width: a straight line
 * when half the face is lit, and the full edge when all or none of it is.
 */
function phase(ctx, cx, cy, r, lit, litOnRight, colour) {
  ctx.save();
  ctx.translate(cx, cy);
  if (!litOnRight) ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = INK.dark;
  ctx.fill();
  ctx.strokeStyle = INK.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // The lit part: the right-hand edge of the disc, and the curved line between light and dark.
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(0, 0, Math.max(0.01, r * Math.abs(1 - 2 * lit)), r, 0, Math.PI / 2, lit > 0.5 ? (3 * Math.PI) / 2 : -Math.PI / 2, lit <= 0.5);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

const sec = (n) => `${n.toFixed(n < 20 ? 1 : 0)}″`;
const millionKm = (au) => `${Math.round((au * AU_KM) / 1e6)} million km`;

export default {
  id: 'venus',
  group: 'stars',
  label: 'Phases of Venus',
  title: 'Why is Venus biggest when least of it is lit?',
  claim: 'Venus is a small light in the dome, like the stars, only brighter. It is not a world going round the sun.',
  ask: 'Through a small telescope Venus is sometimes a small round disc and sometimes a thin crescent six times as wide. What has to be true for it to be widest when least of it is lit?',
  check: 'Look at Venus through a small telescope, or binoculars held steady, every few weeks while it is the evening star. The disc grows and the lit part thins to a crescent, as Galileo saw in 1610.',
  tool: 'sky',
  pair: 'sky',
  controls: [
    { id: 'which', label: 'Venus between us and the sun', value: 'next', options: LISTED, sets: true },
    { id: 'days', label: 'Days from then', value: -70, min: -290, max: 290, step: 5, sets: true, show: (v) => (v === 0 ? 'the day itself' : `${Math.abs(v)} ${v < 0 ? 'before' : 'after'}`) },
  ],
  apply({ state, sunEvents, STAR_DEMO }, own) {
    const t = passing(own.which) + own.days * DAY_MS;
    // Before it passes between us and the sun Venus is the evening star, and after it the morning star. So the
    // scene is set 25 minutes after sunset, or 25 minutes before sunrise: when Venus is up and the sky is dim.
    const events = sunEvents(new Date(t), state.lat, state.lon);
    const dusk = own.days < 0 ? events.set && events.set.getTime() + TWILIGHT_MS : own.days > 0 ? events.rise && events.rise.getTime() - TWILIGHT_MS : events.noon?.getTime();
    state.date = new Date(dusk ?? t);
    Object.assign(state, STAR_DEMO, { star: 'Venus', sightLines: false, trails: false });
  },
  drawHeight: 236,
  /** Venus through a telescope every 73 days, in three rows: as measured, as two orbits make it, and as the flat model makes it. */
  draw(ctx, { w, h }, c, { state }, own) {
    const cycle = cycleOf(own.which);
    const now = state.date.getTime();
    // The pictures keep the time of day of the scene, since the flat model's answer changes through the night.
    const clock = ((((now - cycle.mid) % DAY_MS) + DAY_MS * 1.5) % DAY_MS) - DAY_MS / 2;
    // One column for each picture, 73 days apart, and one row for each of the three accounts.
    const steps = [];
    for (let d = -SPAN_DAYS; d <= SPAN_DAYS; d += STEP_DAYS) steps.push(d);
    const left = 4;
    const colW = (w - left * 2) / steps.length;
    // Pixels to a second of arc, the same for every disc in all three rows, so that their sizes can be compared.
    // A disc 61″ wide, which is about the widest Venus gets, fills its column at this scale.
    const perSec = Math.min(0.56, (colW - 3) / 61);
    const rowH = Math.max(40, (h - 46) / 3);
    const realKm = flatRealKm(state);
    const X = (d) => left + ((d + SPAN_DAYS) / STEP_DAYS + 0.5) * colW; // across the drawing, for a number of days from the middle
    const rows = [
      ['Measured', INK.real, (t) => both(t).seen],
      ['Two orbits round the sun', INK.globe, (t) => both(t).sum],
      ['Flat model: a ball in the dome', INK.flat, (t) => flatVenus(t, state, realKm)],
    ];
    rows.forEach(([name, colour, make], i) => {
      const top = 4 + i * rowH;
      label(ctx, name, left, top + 6, colour, 'left', 600);
      steps.forEach((d) => {
        // Before it passes between us and the sun Venus is east of the sun, and its lit side is drawn on the right.
        const v = make(cycle.mid + d * DAY_MS + clock);
        phase(ctx, X(d), top + 14 + (rowH - 14) / 2, (v.widthSec / 2) * perSec, v.lit, d < 0, colour === INK.flat ? '#f3d9a4' : '#f4f1e6');
      });
    });
    const under = 4 + 3 * rowH + 8;
    label(ctx, day(cycle.mid - SPAN_DAYS * DAY_MS, 'short', '2-digit'), left, under, INK.muted, 'left', 400, 11);
    label(ctx, 'between us and the sun', X(0), under, INK.text, 'center', 400, 11);
    label(ctx, day(cycle.mid + SPAN_DAYS * DAY_MS, 'short', '2-digit'), w - left, under, INK.muted, 'right', 400, 11);
    label(ctx, 'evening star, then morning star', w - left, 10, INK.muted, 'right', 400, 11);
    // Where the scene is along the row.
    const daysOff = (now - cycle.mid) / DAY_MS;
    if (Math.abs(daysOff) <= SPAN_DAYS + STEP_DAYS / 2) {
      const x = X(daysOff);
      line(ctx, [[x, 16], [x, under - 9]], 'rgba(230, 237, 245, 0.35)', 1, [3, 3]);
      label(ctx, 'now', x, under + 14, INK.text, 'center', 600, 11);
    }
  },
  body(c, { state, km, percent }, own) {
    const cycle = cycleOf(own.which);
    const t = state.date.getTime();
    const daysOff = (t - cycle.mid) / DAY_MS;
    const { seen, sum } = both(t);
    const realKm = flatRealKm(state);
    const flat = flatVenus(t, state, realKm);
    // A cell of the table is marked as wrong when it is further from the measured figure than `limit`.
    const bad = (a, b, limit) => (Math.abs(a - b) > limit ? ' class="bad"' : '');
    const widths = cycle.days.map((d) => d.seen.widthSec);
    const [widest, narrowest] = [Math.max(...widths), Math.min(...widths)];
    // The most the sum is out from the measured figures on any day of the stretch.
    const worstLit = Math.max(...cycle.days.map((d) => Math.abs(d.seen.lit - d.sum.lit)));
    const worstWidth = Math.max(...cycle.days.map((d) => Math.abs(d.seen.widthSec - d.sum.widthSec)));
    // The flat ball over the next day: its width follows how far off along the ground it is, and its lit share follows the flat sun.
    const through = flatThroughDay(t, state, realKm);
    const [flatWide, flatNarrow] = [Math.max(...through.map((f) => f.widthSec)), Math.min(...through.map((f) => f.widthSec))];
    const [flatMost, flatLeast] = [Math.max(...through.map((f) => f.lit)), Math.min(...through.map((f) => f.lit))];
    // The scene is put at dusk or dawn, which can be most of a day from the slider's moment. So the days are the
    // slider's own unless the time has been moved somewhere else.
    const n = Math.abs(daysOff - own.days) <= 1 ? own.days : Math.round(daysOff);
    const where = n === 0 ? 'Venus is passing between us and the sun' : `This is ${days(Math.abs(n))} ${n < 0 ? 'before' : 'after'} Venus passes between us and the sun`;
    return `
    <p>${where} (${day(cycle.mid)}). ${n < 0 ? 'It is the evening star, in the west after sunset.' : n > 0 ? 'It is the morning star, in the east before sunrise.' : 'It is lost in the glare of the sun.'}</p>
    <table class="data"><thead><tr><th></th><th class="measured">Measured</th><th class="globe">Two orbits</th><th class="flat">Flat</th></tr></thead><tbody>
    <tr><td>Width of the disc</td><td>${sec(seen.widthSec)}</td><td${bad(seen.widthSec, sum.widthSec, 0.5)}>${sec(sum.widthSec)}</td><td${bad(seen.widthSec, flat.widthSec, 0.15 * seen.widthSec)}>${sec(flat.widthSec)}</td></tr>
    <tr><td>Face lit</td><td>${percent(seen.lit)}</td><td${bad(seen.lit, sum.lit, 0.02)}>${percent(sum.lit)}</td><td${bad(seen.lit, flat.lit, 0.05)}>${percent(flat.lit)}</td></tr>
    <tr class="brk"><td>Distance</td><td>${millionKm(seen.distAu)}</td><td>${millionKm(sum.distAu)}</td><td class="bad">${km(flat.slantKm)}</td></tr>
    </tbody></table>
    <p>Widths are in seconds of arc, 3,600 to a degree. To the eye Venus is a point. Any small telescope shows a disc
    with phases like the moon's, and over 584 days it goes from <b class="m">${sec(narrowest)}</b> wide and fully lit to
    <b class="m">${sec(widest)}</b> wide and almost dark: ${(widest / narrowest).toFixed(1)} times the width. The top
    row of the drawing is that, every ${STEP_DAYS} days, with the discs to scale.</p>
    <p>The globe model belongs to a larger picture, in which the Earth and Venus both go round the sun, Venus on the
    inside. When Venus is on the far side of the sun it is far away, so it looks small, and we see nearly all of its
    lit half. When it comes round between us and the sun it is six times nearer, so it looks six times wider, and its
    lit half faces away from us. The second row is worked out from six published numbers for each orbit and from
    nothing seen in the sky. Over this whole stretch it is never more than <b class="g">${worstWidth.toFixed(2)}″</b> out in
    width or <b class="g">${(worstLit * 100).toFixed(2)}%</b> in the share that is lit.</p>
    <p>Where the first two rows come from: "Measured" is the published almanac figure, worked out by Astronomy
    Engine, and the second row uses the orbit figures published by NASA's Jet Propulsion Laboratory. Both rest on
    the same observations, so their agreeing is not an independent test. The independent test is the top row
    against Venus in a telescope, which is the check suggested above.</p>
    <p>On the flat model Venus is a light in the dome at the height of the stars, ${km(state.starHeightKm)} up. A light
    with no shape has no phases. If it is a ball lit by the flat model's sun, as its moon is, the third row is what
    that ball shows from here. Its width depends on how far off along the ground it is, and so does the lit share:
    over the next 24 hours they would go from <b class="f">${sec(flatNarrow)} to ${sec(flatWide)}</b> and from
    <b class="f">${percent(flatLeast)} to ${percent(flatMost)}</b>. Neither does the thing that is seen, which is a
    slow change over months that is the same from everywhere on Earth. Nothing in the flat model brings Venus six times nearer.</p>
    <p>Its real width had to be chosen: here it is ${realKm.toFixed(2)} km, which shows ${MIDDLE_WIDTH_SEC}″ from straight beneath,
    the middle of the range that is measured.</p>
    <p class="try">Try: drag "Days from then" from one end to the other and watch "now" cross the drawing. Then move
    the observer a long way off and see which of the three rows changes.</p>`;
  },
  checks({ check, near }) {
    const dated = Object.keys(FROM).sort().map((which) => new Date(passing(which)).toISOString().slice(0, 10));
    check('Venus argument: the dated passings in its list are the ones named', dated.join(' ') === '2023-08-13 2025-03-23 2026-10-24', dated.join(' '));
    const cycles = Object.keys(FROM).map(cycleOf);
    // Each cycle has one entry a day: entry SPAN_DAYS is the day Venus passes between us and the sun, and the
    // first and last are half a cycle either side of it.
    const all = cycles.flatMap((cy) => cy.days);
    const worstLit = Math.max(...all.map((d) => Math.abs(d.seen.lit - d.sum.lit)));
    const worstWidth = Math.max(...all.map((d) => Math.abs(d.seen.widthSec - d.sum.widthSec)));
    check('Venus argument: two ellipses round the sun give the lit share of Venus within a thousandth, and its width within a twentieth of a second of arc, on every day of all three stretches',
      worstLit < 0.001 && worstWidth < 0.05, `${worstLit.toFixed(5)} and ${worstWidth.toFixed(3)}″`);
    const mids = cycles.map((cy) => cy.days[SPAN_DAYS].seen);
    const ends = cycles.flatMap((cy) => [cy.days[0].seen, cy.days[2 * SPAN_DAYS].seen]);
    check('Venus argument: passing between us and the sun it is over 57″ wide and under 2% lit; half a cycle either side it is under 10″ and over 99% lit',
      mids.every((d) => d.widthSec > 57 && d.lit < 0.02) && ends.every((d) => d.widthSec < 10 && d.lit > 0.99),
      `${mids.map((d) => d.widthSec.toFixed(1)).join(', ')} and ${ends.map((d) => d.widthSec.toFixed(1)).join(', ')}`);
    // Left out: the fortnight round each end and the middle, where one of the two is turning round.
    const steady = (i) => Math.abs(i - SPAN_DAYS) > 14 && Math.abs(i - SPAN_DAYS) < SPAN_DAYS - 14;
    check('Venus argument: the share lit and the width go opposite ways: from day to day, wider always means less lit',
      cycles.every((cy) => cy.days.every((d, i) => !steady(i) || Math.sign(d.seen.widthSec - cy.days[i - 1].seen.widthSec) === -Math.sign(d.seen.lit - cy.days[i - 1].seen.lit))));
    // The flat ball.
    const state = { lat: 51.5, lon: -0.1, starHeightKm: 5000, sunHeightKm: 5000 };
    const realKm = flatRealKm(state);
    check('Venus argument: the flat ball is sized to show 24″ from straight beneath', near(looksSec(realKm, 5000), 24, 1e-9), `${realKm.toFixed(3)} km`);
    const t = passing('2025') - 70 * DAY_MS;
    const widths = flatThroughDay(t, state, realKm).map((f) => f.widthSec);
    check('Venus argument: from London that ball changes width by more than half in a single day, and is never as wide as Venus is measured that week',
      Math.max(...widths) / Math.min(...widths) > 1.5 && Math.max(...widths) < both(t).seen.widthSec,
      `${Math.min(...widths).toFixed(1)}″ to ${Math.max(...widths).toFixed(1)}″ against ${both(t).seen.widthSec.toFixed(1)}″`);
  },
};
