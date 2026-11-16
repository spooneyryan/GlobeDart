// The tides.
//
// Most coasts have two high waters each time the moon comes round, and the
// biggest tides at new moon and at full moon. This demonstration works out the
// rhythm each account gives.
//
// There is no measured column here: the app holds no tide tables. What is
// taken from the almanac is where the sun and the moon are overhead at each
// moment and how far away they are (astro.js), and the dates of the moon's
// phases. Both accounts are handed the same places:
//
//   globe   the stretch a far-off body puts on a sea covering a ball (models.js, tideHeightM), from
//           the moon and from the sun, added together. In metres
//   flat    the flat model has no gravity and no agreed account of the tides. It is given the only
//           pull its layout allows: straight toward its moon, and toward its sun (models.js,
//           flatPullShare). That is a share of the pull straight underneath, not a height in metres,
//           so only its rhythm is compared with the globe's, never its size
import { subsolarPoint, moonPoint, moonQuarters, EARTH_RADIUS_KM } from '../astro.js';
import { tideHeightM, flatPullShare, MOON_MASS, SUN_MASS } from '../models.js';
import { INK, label, disc, line, day, keeper } from './sketch.js';

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
// From one time the moon is highest to the next, on average: 24 hours 50 minutes. The moon moves on about
// 13° a day among the stars, so the turning of the sky takes that much longer to bring it back.
const LUNAR_DAY_MS = 24.8412 * HOUR_MS;
const MONTH_DAYS = 30;
// The average distances of the moon and the sun from the Earth, in km.
const MOON_AVERAGE_KM = 384400;
const SUN_AVERAGE_KM = 149597870.7;
// The sun's share of the tide against the moon's, at their average distances. The stretch goes as mass ÷ distance³:
//   (sun's mass ÷ moon's mass) × (moon's distance ÷ sun's distance)³ = 0.46
// The flat model has no figure of its own, so its sun is given the same share.
const SUN_SHARE = (SUN_MASS / MOON_MASS) * Math.pow(MOON_AVERAGE_KM / SUN_AVERAGE_KM, 3);
const PHASES = ['new moon', 'first quarter', 'full moon', 'last quarter'];

const keep = keeper();

/**
 * What each account makes of the sea at one place and moment.
 *
 *   fromMoon, fromSun   the globe's stretch from each body alone, in metres above or below the average
 *   globe               the two added together
 *   flatMoon            the flat model: one pull upward toward its moon, as a share of what it is straight beneath
 *   flat                that with a second pull toward its sun added, for the month
 */
function at(t, lat, lon, flat) {
  const date = new Date(t);
  const sun = subsolarPoint(date);
  const moon = moonPoint(date);
  const fromMoon = tideHeightM(moon, MOON_MASS, lat, lon);
  const fromSun = tideHeightM(sun, SUN_MASS, lat, lon);
  const flatMoon = flatPullShare(moon, flat.moonHeightKm, lat, lon);
  return {
    t,
    fromMoon,
    fromSun,
    globe: fromMoon + fromSun,
    flatMoon,
    flat: flatMoon + SUN_SHARE * flatPullShare(sun, flat.sunHeightKm, lat, lon),
  };
}

/** That, at one place, every `stepMin` minutes for a number of hours. */
function series(from, hours, stepMin, lat, lon, flat) {
  const list = [];
  for (let t = from; t <= from + hours * HOUR_MS; t += stepMin * MINUTE_MS) list.push(at(t, lat, lon, flat));
  return list;
}

/**
 * The moments a curve tops out: its high waters. A sample that is higher than
 * the one before and no lower than the one after has a top near it. The top is
 * placed by the curve y = p + q x + r x² through those three samples, a, b and
 * c, one step apart:
 *
 *   shift   = ½ (a − c) ÷ (a − 2b + c)     how far from the middle sample the top is, in steps
 *   height  = b − ¼ (a − c) × shift        how high the curve is there
 */
function highs(list, key) {
  const found = [];
  for (let i = 1; i + 1 < list.length; i++) {
    const [a, b, c] = [list[i - 1][key], list[i][key], list[i + 1][key]];
    if (!(b > a && b >= c)) continue;
    const shift = (0.5 * (a - c)) / (a - 2 * b + c);
    found.push({ t: list[i].t + shift * (list[i + 1].t - list[i].t), height: b - 0.25 * (a - c) * shift });
  }
  return found;
}

/**
 * How far a curve rises and falls in each passage of the moon, over a month:
 * the highest less the lowest of its samples, taken every half hour.
 */
function monthOf(from, lat, lon, flat) {
  const days = [];
  for (let d = 0; d < MONTH_DAYS; d++) {
    const list = series(from + d * LUNAR_DAY_MS, LUNAR_DAY_MS / HOUR_MS, 30, lat, lon, flat);
    const range = (key) => Math.max(...list.map((x) => x[key])) - Math.min(...list.map((x) => x[key]));
    days.push({ t: from + (d + 0.5) * LUNAR_DAY_MS, globe: range('globe'), flat: range('flat') });
  }
  return days;
}

/** Of a month's passages of the moon, the one whose middle is nearest a moment. */
const dayNearest = (days, t) => days.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));

/** What the flat model is told about its sun and moon, from the app's settings. */
const flatOf = (state) => ({ sunHeightKm: state.sunHeightKm, moonHeightKm: state.moonHeightKm });
// The sums are done for the place on the equator on the observer's own line of longitude. The moon is highest
// there at the same moment as for the observer, and the two high waters are alike there, which they are not
// further north or south.
const LAT = 0;
// What the kept answers depend on besides the time: where the observer is, east to west, and the flat model's two heights.
const placeKey = (state) => `${state.lon.toFixed(2)} ${state.sunHeightKm} ${state.moonHeightKm}`;

/** Two days round the moment on show, every ten minutes: kept for the hour. */
function twoDays(state) {
  const from = Math.floor(state.date.getTime() / HOUR_MS) * HOUR_MS - 6 * HOUR_MS;
  return keep(`days ${from} ${placeKey(state)}`, () => series(from, 48, 10, LAT, state.lon, flatOf(state)));
}

/** The month from the day on show: kept for the day. */
function month(state) {
  const from = Math.floor(state.date.getTime() / (24 * HOUR_MS)) * 24 * HOUR_MS;
  return keep(`month ${from} ${placeKey(state)}`, () => ({ from, days: monthOf(from, LAT, state.lon, flatOf(state)), quarters: moonQuarters(new Date(from), (MONTH_DAYS * LUNAR_DAY_MS) / (24 * HOUR_MS)) }));
}

const metres = (m) => `${m.toFixed(2)} m`;

export default {
  id: 'tides',
  group: 'moon',
  label: 'Tides',
  title: 'Why are there two high tides a day?',
  claim: 'Gravity cannot be what moves the tides. If the moon could lift an ocean it would lift a pond, and the sea would rise once a day, under the moon.',
  ask: 'On most coasts high water comes twice a day, about 12 hours 25 minutes apart, and the moon is overhead only once. What is the second high water under?',
  check: 'Take a tide table for any port, and the times the moon is due south there. High water comes about 50 minutes later each day, as the moon does, and the biggest tides come a day or two after every new moon and every full moon.',
  tool: 'sky',
  pair: 'outside',
  apply({ state, MOON_DEMO }) {
    Object.assign(state, MOON_DEMO);
  },
  drawHeight: 300,
  /**
   * Above: the height of the sea here over two days, by each account.
   * Below: how far it rises and falls each day for a month, with the moon's phases.
   */
  draw(ctx, { w, h }, c, { state }) {
    const now = state.date.getTime();
    const two = twoDays(state);
    const [x0, x1] = [4, w - 4];
    // Each curve is drawn from its own lowest point to its own highest, filling the height of its panel. The
    // globe's is in metres and the flat model's is a share of a pull, so the two cannot share a scale up and
    // down. What the drawing compares is when each rises and falls, and how often.
    const scaleTo = (list, key) => {
      const [lo, hi] = [Math.min(...list.map((p) => p[key])), Math.max(...list.map((p) => p[key]))];
      return (v) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
    };

    // ----- two days -----
    // Time runs across: 48 hours, starting six hours before the hour on show.
    const [top, bottom] = [30, Math.max(74, h * 0.42)];
    const X = (t) => x0 + ((t - two[0].t) / (48 * HOUR_MS)) * (x1 - x0);
    label(ctx, `The sea on the equator due ${state.lat >= 0 ? 'south' : 'north'} of here`, x0, 7, INK.text, 'left', 600);
    ctx.fillStyle = INK.panel;
    ctx.fillRect(x0, top - 10, x1 - x0, bottom - top + 20);
    const curve = (key, colour, width, dash) => {
      const share = scaleTo(two, key);
      line(ctx, two.map((p) => [X(p.t), bottom - share(p[key]) * (bottom - top)]), colour, width, dash);
      return share;
    };
    curve('flatMoon', INK.flat, 1.5, [5, 4]);
    const share = curve('globe', INK.globe, 2.5);
    // High water by the globe's sum, as dots. The marks along the top are the moments the moon's own stretch is
    // greatest, which is when the moon is highest in the sky there and when it is furthest beneath.
    for (const high of highs(two, 'globe')) disc(ctx, X(high.t), bottom - share(high.height) * (bottom - top), 3.5, INK.globe, INK.dark);
    for (const up of highs(two, 'fromMoon')) line(ctx, [[X(up.t), top - 10], [X(up.t), top - 4]], INK.text, 1.5);
    line(ctx, [[X(now), top - 10], [X(now), bottom + 10]], 'rgba(230, 237, 245, 0.4)', 1, [3, 3]);
    label(ctx, 'now', X(now), bottom + 17, INK.text, 'center', 600, 11);
    for (const hours of [12, 24, 36]) {
      const x = X(now + hours * HOUR_MS);
      if (x < x1 - 14) label(ctx, `+${hours} h`, x, bottom + 17, INK.muted, 'center', 400, 11);
    }
    label(ctx, 'globe', x1 - 82, 19, INK.globe, 'right', 600, 11);
    label(ctx, 'flat, one pull', x1, 19, INK.flat, 'right', 600, 11);
    label(ctx, '| moon over, or under', x0, 19, INK.muted, 'left', 400, 11);

    // ----- a month -----
    // One bar for each passage of the moon: how far the globe's sum rises and falls in it. The tallest bar
    // fills the panel. The flat model's line is scaled the same way, to its own greatest rise and fall.
    const m = month(state);
    const [mTop, mBottom] = [bottom + 46, h - 22];
    if (mBottom - mTop < 30) return;
    label(ctx, 'Rise and fall each day, for a month', x0, mTop - 12, INK.text, 'left', 600);
    const MX = (t) => x0 + ((t - m.from) / (MONTH_DAYS * LUNAR_DAY_MS)) * (x1 - x0);
    const most = Math.max(...m.days.map((d) => d.globe));
    const barW = (x1 - x0) / MONTH_DAYS - 1.5;
    for (const d of m.days) {
      const tall = (d.globe / most) * (mBottom - mTop);
      ctx.fillStyle = 'rgba(127, 180, 255, 0.75)';
      ctx.fillRect(MX(d.t) - barW / 2, mBottom - tall, barW, tall);
    }
    const flatMost = Math.max(...m.days.map((d) => d.flat));
    line(ctx, m.days.map((d) => [MX(d.t), mBottom - (d.flat / flatMost) * (mBottom - mTop)]), INK.flat, 1.5, [5, 4]);
    // The moon's phases along the bottom.
    for (const q of m.quarters) {
      const [x, y] = [MX(q.t), mBottom + 11];
      disc(ctx, x, y, 5, q.quarter === 0 ? INK.dark : '#f4f1e6', INK.muted);
      if (q.quarter % 2 === 1) {
        // A quarter: half of the disc dark.
        ctx.beginPath();
        ctx.arc(x, y, 5, Math.PI / 2, -Math.PI / 2, q.quarter === 3);
        ctx.fillStyle = INK.dark;
        ctx.fill();
      }
    }
  },
  body(c, { state, km, hoursMinutes, percent }) {
    if (!c.moon) return '<p>Turn on "Show the moon" in the panel on the left to carry on with this demonstration.</p>';
    const now = state.date.getTime();
    const flat = flatOf(state);
    const here = at(now, LAT, state.lon, flat);
    // One passage of the moon from now, with a little either side so that a high water at either end is still found.
    const passage = series(now - 20 * MINUTE_MS, (LUNAR_DAY_MS + 40 * MINUTE_MS) / HOUR_MS, 10, LAT, state.lon, flat);
    const inPassage = (list) => list.filter((x) => x.t >= now && x.t < now + LUNAR_DAY_MS);
    const [globeHighs, flatHighs] = [inPassage(highs(passage, 'globe')), inPassage(highs(passage, 'flatMoon'))];
    // How long the globe's sum has between its next two high waters, in hours.
    const two = twoDays(state);
    const pair = highs(two, 'globe');
    const gap = pair.length > 1 ? (pair[1].t - pair[0].t) / HOUR_MS : null;
    // The month ahead: the passages of the moon with the biggest and the smallest rise and fall by the globe's
    // sum, and the phase of the moon nearest each. Phases are numbered 0 new, 1 first quarter, 2 full, 3 last quarter.
    const m = month(state);
    const big = m.days.reduce((a, b) => (b.globe > a.globe ? b : a));
    const small = m.days.reduce((a, b) => (b.globe < a.globe ? b : a));
    const nearest = (t, wanted) => m.quarters.filter((q) => wanted.includes(q.quarter)).reduce((a, b) => (!a || Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), null);
    const bigAt = nearest(big.t, [0, 2]);
    // The sum has big tides at new moon and at full moon alike: the table says so when this month shows both,
    // each with a rise and fall over three quarters of the month's biggest.
    const rangeAt = (q) => dayNearest(m.days, q.t).globe;
    const atBoth = [0, 2].every((quarter) => m.quarters.some((q) => q.quarter === quarter && rangeAt(q) > 0.75 * big.globe));
    const smallAt = nearest(small.t, [1, 3]);
    // The flat model's rise and fall, with both of its pulls, at the first new moon and the first full moon of the month.
    const flatAt = (quarter) => {
      const q = m.quarters.find((x) => x.quarter === quarter);
      return q ? dayNearest(m.days, q.t).flat : null;
    };
    const [flatNew, flatFull] = [flatAt(0), flatAt(2)];
    // The most each body can raise a settled sea from low water to high, in metres, at its distance right now.
    // The (3 cos² γ − 1) ÷ 2 of tideHeightM runs from 1 straight beneath the body to −½ a quarter of the way
    // round, so from low to high is 1½ times
    //   m × R × (R ÷ d)³
    const moonMost = MOON_MASS * EARTH_RADIUS_KM * 1000 * Math.pow(EARTH_RADIUS_KM / c.moon.point.distKm, 3) * 1.5;
    const sunMost = SUN_MASS * EARTH_RADIUS_KM * 1000 * Math.pow(EARTH_RADIUS_KM / c.sub.distKm, 3) * 1.5;
    const times = (list) => list.map((x) => `${new Date(x.t).toISOString().slice(11, 16)} UTC`).join(' and ');
    const count = (n) => ['none', 'one', 'two', 'three'][n] ?? String(n);
    return `
    <table class="data"><thead><tr><th></th><th class="globe">Globe</th><th class="flat">Flat, one pull</th></tr></thead><tbody>
    <tr><td>High waters in the next 24 h 50 min</td><td>${count(globeHighs.length)}</td><td class="${flatHighs.length === globeHighs.length ? '' : 'bad'}">${count(flatHighs.length)}</td></tr>
    <tr class="brk"><td>At</td><td>${times(globeHighs) || 'n/a'}</td><td>${times(flatHighs) || 'n/a'}</td></tr>
    <tr class="brk"><td>Biggest tides in the month from now</td><td>${atBoth ? 'at new moon and at full moon' : bigAt ? `at ${PHASES[bigAt.quarter]}` : 'n/a'}</td>${flatNew && flatFull && flatFull < 0.9 * flatNew ? '<td class="bad">at new moon only</td>' : '<td>n/a</td>'}</tr>
    </tbody></table>
    <p>The moment on show is ${day(now)}, ${new Date(now).toISOString().slice(11, 16)} UTC.</p>
    <p>These sums are for the place on the equator due ${state.lat >= 0 ? 'south' : 'north'} of the observer, where
    the moon is highest at the same moment as it is for the observer.</p>
    <p>This app holds no tide tables, so there is no measured column here. The real sea is held up by coasts and
    arrives late, by a number of hours that differs from port to port, and in a narrow bay it can pile up to ten
    times the height. What every port shares is the rhythm, and the rhythm is what the two accounts disagree about.</p>
    <p>On the globe the moon pulls the near side of the Earth a little harder than the Earth's centre, and the centre a
    little harder than the far side. What is left over stretches the sea along the line to the moon: up underneath it,
    and up again on the side facing away. The Earth turns under both, so a place passes two high waters each time the
    moon comes round${gap ? `: the sum has the next two <b class="g">${hoursMinutes(gap)}</b> apart` : ''}. The blue
    line in the drawing is that sum, and the marks along its top are the moments the moon is highest and lowest.</p>
    <p>Away from the equator the sum makes one of the two high waters larger than the other whenever the moon is well
    north or south. A real ocean answers the pull as a whole basin, which evens the two out on most coasts and leaves
    the difference plain on others, such as the Pacific coast of North America.</p>
    <p>The sum gives the size, too. At this moment the moon is ${km(c.moon.point.distKm)} away. At that distance it would raise a sea
    that covered the whole Earth by <b class="g">${metres(moonMost)}</b> from low to high at most, and the sun by
    <b class="g">${metres(sunMost)}</b>, ${percent(sunMost / moonMost)} as much. Right now the two together make
    ${metres(Math.abs(here.globe))} ${here.globe < 0 ? 'below' : 'above'} the average there. At new moon and at full moon
    the two stretches lie along the same line and add up. At the quarters they are at right angles and partly cancel.
    Over the month ahead the sum has its biggest rise and fall on <b class="g">${day(big.t, 'short')}</b>${
      bigAt ? `, ${Math.abs(big.t - bigAt.t) < 36 * HOUR_MS ? 'at' : 'near'} the ${PHASES[bigAt.quarter]} of ${day(bigAt.t, 'short')}` : ''
    }, and its smallest on ${day(small.t, 'short')}${smallAt ? `, near the ${PHASES[smallAt.quarter]} of ${day(smallAt.t, 'short')}` : ''}.
    The bars in the lower drawing are that, with the moon's phases beneath.</p>
    <p>That stretch is tiny: about a ten-millionth of the weight of the water. It moves an ocean because the water has
    thousands of kilometres to flow in from. A pond has nowhere to draw water from, and the same sum gives a pond a
    tide thinner than a hair.</p>
    <p>The flat model has no gravity and no far side. If its moon, ${km(state.moonHeightKm)} up, pulled the sea at all,
    it could only heap it up underneath: the amber line. That gives <b class="f">one high water</b> each time the moon
    comes round, not two. Give its sun a pull as well, in the proportion the real one has, and there is a second,
    smaller heap that keeps to the sun: high water at midday every day, never getting later. That is the amber line
    in the lower drawing, and it gets the month wrong. At new moon its sun and moon are together and their heaps add
    up. At full moon they are on opposite sides of the map and one heap fills the other's low water${
      flatNew && flatFull && flatFull < 0.9 * flatNew ? `: the rise and fall at full moon is <b class="f">${percent(flatFull / flatNew)}</b> of what it is at new moon` : ''
    }. Every tide table has big tides at both.</p>
    <p class="try">Try: set the speed above the views to 1 hour/sec, press Play, and watch the place under the moon go round the two views while
    "now" crosses the drawing. Then move the observer east or west and watch the high waters move with the moon.</p>`;
  },
  checks({ check, near }) {
    const moon = { lat: 0, lon: 0, distKm: MOON_AVERAGE_KM };
    const sun = { lat: 0, lon: 0, distKm: SUN_AVERAGE_KM };
    const under = tideHeightM(moon, MOON_MASS, 0, 0);
    const side = tideHeightM(moon, MOON_MASS, 0, 90);
    check('tides argument: the moon at its average distance raises a settled sea 0.36 m beneath it and on the far side, and lowers it 0.18 m half way between',
      near(under, 0.358, 0.002) && near(tideHeightM(moon, MOON_MASS, 0, 180), under, 1e-12) && near(side, -under / 2, 1e-12), `${under.toFixed(3)} and ${side.toFixed(3)} m`);
    check("tides argument: the sun's stretch is 46% of the moon's", near(tideHeightM(sun, SUN_MASS, 0, 0) / under, 0.46, 0.005) && near(SUN_SHARE, 0.46, 0.005), SUN_SHARE.toFixed(4));
    // The moon is 30° up where the distance over the map is √3 times its height. It is then twice its height
    // away in a straight line, and (1 ÷ 2)³ is an eighth. The place is that far from the pole, with the moon over the pole.
    check('tides argument: a flat pull is whole straight beneath its moon and an eighth where the moon is 30° up',
      near(flatPullShare(moon, 5000, 0, 0), 1, 1e-12) && near(flatPullShare({ lat: 90, lon: 0 }, 5000, 90 - (5000 * Math.sqrt(3) / EARTH_RADIUS_KM) * (180 / Math.PI), 0), 1 / 8, 1e-9));
    // A month at a place on the equator.
    const flat = { sunHeightKm: 5000, moonHeightKm: 5000 };
    const from = Date.UTC(2025, 2, 1);
    const list = series(from, 29.53 * 24, 10, 0, -30, flat);
    const [globeHighs, flatHighs] = [highs(list, 'globe'), highs(list, 'flatMoon')];
    const gaps = globeHighs.slice(1).map((x, i) => (x.t - globeHighs[i].t) / HOUR_MS);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    check('tides argument: on the equator the sum has 57 high waters in a month of the moon, 12 h 25 min apart on average, and the single pull has half as many',
      globeHighs.length === 57 && near(mean, 12.42, 0.02) && (flatHighs.length === 28 || flatHighs.length === 29), `${globeHighs.length} at ${mean.toFixed(2)} h, and ${flatHighs.length}`);
    const month = monthOf(from, 0, -30, flat);
    const quarters = moonQuarters(new Date(from), 30);
    const dayNear = (q) => dayNearest(month, q.t);
    const springs = quarters.filter((q) => q.quarter % 2 === 0).map((q) => dayNear(q).globe);
    const neaps = quarters.filter((q) => q.quarter % 2 === 1).map((q) => dayNear(q).globe);
    check('tides argument: by the sum the rise and fall at each new and full moon that month is over twice what it is at each quarter',
      springs.length >= 2 && neaps.length >= 2 && Math.min(...springs) > 2 * Math.max(...neaps), `${springs.map((x) => x.toFixed(2)).join(', ')} m against ${neaps.map((x) => x.toFixed(2)).join(', ')} m`);
    const flatNew = dayNear(quarters.find((q) => q.quarter === 0)).flat;
    const flatFull = dayNear(quarters.find((q) => q.quarter === 2)).flat;
    check('tides argument: by a single pull from each of the flat sun and moon the rise and fall at full moon is under three quarters of what it is at new moon', flatFull < 0.75 * flatNew, `${(flatFull / flatNew).toFixed(2)}`);
  },
};
