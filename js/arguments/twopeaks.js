// Two mountains in one view: which summit looks higher?
//
// No almanac figure is used. What goes in is where two summits are and how
// high (sources in docs/views.md), where the observer stands, and how high
// their eye is. Each model then says how far above eye level each summit
// appears (js/horizon.js, topAngleDeg):
//   flat    atan((summit − eye) ÷ d)                  nothing drops with distance
//   globe   atan((summit − eye − d² ÷ 2R′) ÷ d)       everything d away has dropped d² ÷ 2R′
// with d the distance to the summit and R′ the Earth's radius made a little
// larger to allow for the air bending light.
//
// Distance alone makes the further mountain look smaller on both models, so
// "the taller one looks shorter" settles nothing. What differs is the drop,
// which grows as the square of the distance and so takes far more from the
// further summit than from the nearer.
//
// Three things here favour the flat model, or at least do not count against it:
//   - Both models are given the same distances, the ones over the ground, with
//     no stretching from the flat map.
//   - Only the summits are worked out. Nothing is claimed about how much of
//     either mountain's base is hidden, because nearer hills cover the bases
//     on either model.
//   - The flat model's light is straight. Given the same bending air as the
//     globe, its figures move further from the globe's, not nearer.
//
// What is observed is the "check" below: a photograph from a known spot.
import { DEG, EARTH_RADIUS_KM } from '../astro.js';
import { K_STANDARD, topAngleDeg, dipDeg, horizonDistanceKm, hiddenHeightM } from '../horizon.js';
import { globeDistanceKm, bearingDeg, placeAlong } from '../distances.js';
import { INK, label as sketchLabel, line, turn, keeper } from './sketch.js';

// The two summits: where they are, and their height above the sea in metres.
const HELENS = { name: 'Mount St Helens', short: 'St Helens', lat: 46.1912, lon: -122.1944, heightM: 2549 };
const RAINIER = { name: 'Mount Rainier', short: 'Rainier', lat: 46.8517, lon: -121.7603, heightM: 4392 };
// Where the observer starts: Pittock Mansion, in the hills on the west side of Portland, Oregon.
// The ground there is 284.3 m above the sea, and a standing eye is 1.7 m above the ground.
const START = { name: 'Pittock Mansion', lat: 45.5252, lon: -122.7163 };
const START_EYE_M = 286;
// The observer backs away to the south-west, which keeps the two summits side by side.
const WALK_DEG = 225;
const MAX_BACK_KM = 300;

// Rough outlines, for the drawing only: [km to the side of the summit, height in metres]. Nothing is worked
// out from them but where to put the pen.
const HELENS_SHAPE = [[-9, 300], [-5.5, 900], [-4.2, 1350], [-2.4, 1950], [-1.1, 2420], [-0.6, 2530], [0, 2549], [0.5, 2520], [1.1, 2400], [2.5, 1900], [4.3, 1300], [5.5, 900], [9, 300]];
const RAINIER_SHAPE = [[-14, 400], [-9, 1300], [-7, 2100], [-5, 2850], [-3, 3500], [-1.4, 4150], [-0.5, 4350], [0, 4392], [0.6, 4340], [1.6, 4050], [3.2, 3400], [5.2, 2750], [7.2, 2050], [9, 1300], [14, 400]];
// How far to each side of a summit the drawing makes room for, in km. The lowest slopes may run off its edges.
const HELENS_ROOM_KM = 4.5;
const RAINIER_ROOM_KM = 7;
// Heights are drawn at least this many times larger than widths, so that the summits stand clear of each other.
const STRETCH = 2;
// Snow is drawn down to this height, in metres.
const SNOW_LINE_M = 1900;
// How wide the full moon looks, in degrees: something to judge the small angles here against.
const MOON_WIDE_DEG = 0.5;

/**
 * What an observer sees of the two summits after backing `backKm` away from
 * the start, with their eye `eyeM` above the sea and the air bending light by k.
 * For each summit: how far off it is, its compass direction, and how far above
 * eye level each model puts it, in degrees.
 */
function viewFrom(backKm, eyeM, k) {
  const at = backKm > 0 ? placeAlong(START, WALK_DEG, backKm) : START;
  const seen = (peak) => {
    const km = globeDistanceKm(at, peak);
    return {
      ...peak,
      km,
      bearing: bearingDeg(at, peak),
      globe: topAngleDeg(eyeM, peak.heightM, km, k),
      flat: topAngleDeg(eyeM, peak.heightM, km, 0, true),
      // The flat model with the same air as the globe, to show what the air does and does not change.
      flatSameAir: topAngleDeg(eyeM, peak.heightM, km, k, true),
      // On the globe the summit is out of sight once the sea-level horizon hides its whole height.
      hidden: hiddenHeightM(eyeM, km, k) >= peak.heightM,
    };
  };
  const near = seen(HELENS);
  const far = seen(RAINIER);
  return {
    at,
    near,
    far,
    // How far to the right of Rainier's summit St Helens' is. Below zero it is to the left.
    sideDeg: turn(far.bearing, near.bearing),
    // How far St Helens' summit stands above Rainier's on each model. Below zero, Rainier's is the higher.
    globeGap: near.globe - far.globe,
    flatGap: near.flat - far.flat,
    flatSameAirGap: near.flatSameAir - far.flatSameAir,
  };
}

const kept = keeper();
/**
 * How far back, in km, each change comes as the observer backs away: where
 * each model first puts Rainier's summit above St Helens', and where the globe
 * takes each summit out of sight. Null for a change that does not come within
 * the range of the slider. Found by trying each km in turn.
 */
function changes(eyeM, k) {
  return kept(`${eyeM}|${k}`, () => {
    const found = { flatSwap: null, globeSwap: null, farGone: null, nearGone: null };
    for (let back = 0; back <= MAX_BACK_KM; back++) {
      const v = viewFrom(back, eyeM, k);
      if (found.flatSwap === null && v.flatGap < 0) found.flatSwap = back;
      if (found.globeSwap === null && v.globeGap < 0 && !v.far.hidden) found.globeSwap = back;
      if (found.farGone === null && v.far.hidden) found.farGone = back;
      if (found.nearGone === null && v.near.hidden) found.nearGone = back;
    }
    return found;
  });
}

/** Which summit a model puts higher and by how much, in words. `gap` is St Helens' height above Rainier's. */
function verdict(gap, nearHidden, farHidden, deg) {
  if (nearHidden && farHidden) return 'both summits are under the horizon';
  if (farHidden) return `${RAINIER.short} is under the horizon`;
  if (nearHidden) return `${HELENS.short} is under the horizon`;
  return `${gap >= 0 ? HELENS.short : RAINIER.short} higher by ${deg(Math.abs(gap), 2)}`;
}

/** An angle to two places with a proper minus sign. */
const signed = (el, deg) => deg(el, 2).replace('-', '−');

/** Text with a dark edge, a size smaller than the shared kind. */
const label = (ctx, string, x, y, colour = INK.muted, align = 'left', weight = 400) => sketchLabel(ctx, string, x, y, colour, align, weight, 11);

export default {
  id: 'twopeaks',
  group: 'horizon',
  label: 'Two mountains',
  title: 'Which summit looks higher?',
  claim: 'A far mountain looks lower than a near one because of perspective, not because of any curve.',
  ask: 'Mount Rainier is taller than Mount St Helens and about twice as far from Portland. As you back away from both, which summit should end up looking higher?',
  check: 'From a hill with both summits in view, photograph them together and note where you stood. The side-to-side gap between the summits gives the scale of the photo, so you can measure how far one stands above the other.',
  tool: 'horizon',
  pair: 'sky',
  controls: [
    { id: 'back', label: 'Where you stand', min: 0, max: MAX_BACK_KM, step: 5, value: 0, sets: true, show: (v, { fmtD }) => (v ? `${fmtD(v)} south-west` : `at ${START.name}`) },
    { id: 'eye', label: 'Height of your eye above the sea', min: 2, max: 12000, scale: 'log', value: START_EYE_M, sets: true, show: (v, { fmtH }) => fmtH(v) },
  ],
  apply({ state }, own) {
    // The tool's own views show the nearer mountain alone, from the same place and height.
    // If this scene is already on show, the air is left as it is, so that dragging a slider here does not
    // undo a change made to the bending.
    const showing = state.shape === 'mountain' && state.targetM === HELENS.heightM;
    Object.assign(state, {
      shape: 'mountain',
      targetM: HELENS.heightM,
      targetKm: viewFrom(own.back, own.eye, K_STANDARD).near.km,
      eyeM: own.eye,
      layers: false,
      sailing: false,
    });
    if (!showing) state.k = K_STANDARD;
  },
  drawHeight: 360,
  /**
   * The same view twice, the globe's above the flat model's: the two mountains as each model places them,
   * looking toward the point midway between the summits. Across is compass direction and up is height above
   * eye level, both in degrees. Heights are stretched, by the same amount in both pictures.
   */
  draw(ctx, { w, h }, hz, { deg }, own) {
    const eyeM = hz?.eyeM ?? own.eye;
    const k = hz?.k ?? K_STANDARD;
    const v = viewFrom(own.back, eyeM, k);
    const dip = dipDeg(eyeM, k); // how far below eye level the globe's horizon is
    const horizonKm = horizonDistanceKm(eyeM, k);
    const gap = 8;
    const ph = (h - gap) / 2; // the height of each picture, in pixels
    const HEAD = 36; // room above the highest summit for the heading and the names
    const FOOT = 18; // room below the lowest thing shown

    // Across: degrees to the right of the point midway between the summits. Something x km to the side of a
    // summit d km away is x ÷ d to the side of it as an angle, in radians.
    const peaks = [
      { ...v.far, shape: RAINIER_SHAPE, roomKm: RAINIER_ROOM_KM, centre: -v.sideDeg / 2, colour: '#5f7186', alpha: 0.8 },
      { ...v.near, shape: HELENS_SHAPE, roomKm: HELENS_ROOM_KM, centre: v.sideDeg / 2, colour: '#7c8da2', alpha: 1 },
    ];
    const side = (peak, x) => peak.centre + x / peak.km / DEG;
    const left = Math.min(...peaks.map((p) => side(p, -p.roomKm)));
    const right = Math.max(...peaks.map((p) => side(p, p.roomKm)));
    // Up: from the lowest thing to show to the highest summit on either model.
    const tops = peaks.flatMap((p) => [p.globe, p.flat]);
    const high = Math.max(0, ...tops);
    const low = Math.min(-dip, ...tops);
    // Pixels to a degree, up and across. Heights are stretched, which the drawing says in its corner.
    const sy = (ph - HEAD - FOOT) / Math.max(0.05, high - low);
    const sx = Math.min((w - 16) / (right - left), sy / STRETCH);
    const X = (a) => w / 2 + (a - (left + right) / 2) * sx;

    const panel = (top, globe) => {
      const Y = (el) => top + ph - FOOT - (el - low) * sy;
      const up = (peak, heightM) => topAngleDeg(eyeM, heightM, peak.km, globe ? k : 0, !globe);
      const horizon = globe ? -dip : 0;
      const colour = globe ? INK.globe : INK.flat;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, w, ph);
      ctx.clip();
      ctx.fillStyle = INK.panel;
      ctx.fillRect(0, top, w, ph);
      // The ground out to the horizon, and on the globe the line of eye level above it.
      ctx.fillStyle = '#15202d';
      ctx.fillRect(0, Y(horizon), w, top + ph - Y(horizon));
      line(ctx, [[0, Y(horizon)], [w, Y(horizon)]], INK.edge, 1.5);
      const levelShown = globe && Y(0) < Y(horizon) - 3;
      if (levelShown) line(ctx, [[0, Y(0)], [w, Y(0)]], INK.line, 1, [2, 4]);
      // The mountains, the further one first. One that stands beyond the globe's horizon is cut off by it.
      for (const peak of peaks) {
        const outline = peak.shape.map(([x, heightM]) => [X(side(peak, x)), Y(up(peak, heightM))]);
        const [summitY, snowY, footY] = [Y(up(peak, peak.heightM)), Y(up(peak, SNOW_LINE_M)), Y(up(peak, 0))];
        ctx.save();
        if (globe && peak.km > horizonKm) {
          ctx.beginPath();
          ctx.rect(0, top, w, Y(horizon) - top);
          ctx.clip();
        }
        // White at the top, rock below the snow line, fading into haze toward the foot.
        const shade = ctx.createLinearGradient(0, summitY, 0, Math.max(footY, summitY + 1));
        const snowAt = Math.min(0.9, Math.max(0, (snowY - summitY) / Math.max(1, footY - summitY)));
        shade.addColorStop(0, '#eef3f8');
        shade.addColorStop(snowAt, '#dde6ef');
        shade.addColorStop(Math.min(0.95, snowAt + 0.06), peak.colour);
        shade.addColorStop(1, 'rgba(42, 56, 72, 0)');
        ctx.globalAlpha = peak.alpha;
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(outline[0][0], footY);
        for (const [x, y] of outline) ctx.lineTo(x, y);
        ctx.lineTo(outline.at(-1)[0], footY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // The words need room above the horizon's own.
      if (levelShown && Y(horizon) - Y(0) > 16) label(ctx, 'eye level', 6, Y(0) - 7, INK.muted);
      // A level line from each summit across to the other, so the two heights can be compared by eye.
      const out = (peak) => globe && peak.hidden;
      for (const peak of peaks) {
        if (out(peak)) continue;
        const y = Y(up(peak, peak.heightM));
        line(ctx, [[X(peaks[0].centre), y], [X(peaks[1].centre), y]], colour, 1, [3, 3]);
      }
      // Each summit's name and height. The names sit to the outside, so that they do not run into each other.
      for (const peak of peaks) {
        const leftOne = peak.centre <= 0;
        const x = X(peak.centre) + (leftOne ? 12 : -12);
        const align = leftOne ? 'right' : 'left';
        if (out(peak)) label(ctx, `${peak.short}: out of sight`, x, Y(horizon) - 9, INK.muted, align);
        else label(ctx, `${peak.short} ${signed(up(peak, peak.heightM), deg)}`, x, Y(up(peak, peak.heightM)) - 9, INK.text, align);
      }
      // A bar half a degree tall, about the width of the full moon, standing on the horizon.
      if (MOON_WIDE_DEG * sy < ph - HEAD - FOOT) {
        line(ctx, [[w - 8, Y(horizon)], [w - 8, Y(horizon + MOON_WIDE_DEG)]], INK.muted, 2);
        label(ctx, deg(MOON_WIDE_DEG, 1), w - 13, Y(horizon + MOON_WIDE_DEG / 2), INK.muted, 'right');
      }
      label(ctx, globe ? `horizon ${deg(dip, 2)} below eye level` : 'horizon at eye level', w - 6, Y(horizon) + 9, INK.muted, 'right');
      ctx.restore();
      const gapDeg = globe ? v.globeGap : v.flatGap;
      label(ctx, `${globe ? 'Globe' : 'Flat'}: ${verdict(gapDeg, out(peaks[1]), out(peaks[0]), deg)}`, 6, top + 10, colour, 'left', 600);
    };
    panel(0, true);
    panel(ph + gap, false);
    const stretch = sy / sx;
    label(ctx, `heights stretched ${stretch.toFixed(1)} times in both`, 6, h - 9, INK.muted);
  },
  body(hz, { deg, fmtH, fmtD }, own) {
    const eyeM = hz.eyeM ?? own.eye;
    const k = hz.k ?? K_STANDARD;
    const v = viewFrom(own.back, eyeM, k);
    const { near, far } = v;
    const where = own.back
      ? `${fmtD(own.back)} south-west of ${START.name} in Portland, Oregon, at ${v.at.lat.toFixed(2)}° N, ${Math.abs(v.at.lon).toFixed(2)}° W`
      : `at ${START.name}, in the hills on the west side of Portland, Oregon`;
    // How far everything at each summit's distance has dropped below the eye's level on the globe: d² ÷ 2R′.
    const dropM = (peak) => ((peak.km * peak.km * Math.max(0, 1 - k)) / (2 * EARTH_RADIUS_KM)) * 1000;
    const cell = (peak) => (peak.hidden ? 'under the horizon' : signed(peak.globe, deg));
    const higher = (gap) => `${gap >= 0 ? HELENS.short : RAINIER.short} by ${deg(Math.abs(gap), 2)}`;
    const globeHigher = near.hidden || far.hidden ? verdict(v.globeGap, near.hidden, far.hidden, deg) : higher(v.globeGap);

    // What changes as the observer backs away.
    const c = changes(eyeM, k);
    const back = (b) => fmtD(b);
    const flatTurn =
      c.flatSwap === null
        ? `Within ${back(MAX_BACK_KM)} the flat model keeps ${HELENS.short} on top.`
        : c.flatSwap === 0
        ? `From this height the flat model puts ${RAINIER.short}'s summit on top wherever you stand.`
        : `Back away and the flat model changes its answer. The further off you are, the less the difference in
           distance counts and the more the difference in height does, so from <b class="f">${back(c.flatSwap)}</b>
           back it puts ${RAINIER.short}'s summit on top and keeps it there.`;
    const globeTurn =
      c.globeSwap !== null
        ? c.globeSwap === 0
          ? c.flatSwap === 0
            ? `So does the globe. You are looking down on both, and the further one is nearer to eye level.`
            : `From this height the globe puts ${RAINIER.short}'s summit on top wherever you stand.`
          : `From this height the globe does the same, but not until <b class="g">${back(c.globeSwap)}</b> back.`
        : c.farGone !== null && (c.nearGone === null || c.farGone < c.nearGone)
        ? `The globe never does. It takes both summits down toward the horizon, and at
           <b class="g">${back(c.farGone)}</b> back ${RAINIER.short}, the taller of the two, is the first to go under it.`
        : `The globe never does within ${back(MAX_BACK_KM)}.`;

    // The same air over both models leaves them this far apart, whatever the air is: (d₂ − d₁) ÷ 2R.
    const apart = (far.km - near.km) / (2 * EARTH_RADIUS_KM) / DEG;
    return `
    <p>You are ${where}, with your eye ${fmtH(eyeM)} above the sea. ${HELENS.name}, ${fmtH(HELENS.heightM)} high, is
    <b>${fmtD(near.km)}</b> away. ${RAINIER.name}, ${fmtH(RAINIER.heightM)} high, is <b>${fmtD(far.km)}</b> away,
    ${deg(Math.abs(v.sideDeg), 1)} to its ${v.sideDeg >= 0 ? 'left' : 'right'}.</p>
    <table class="data"><thead><tr><th>Summit, above eye level</th><th class="globe">Globe</th><th class="flat">Flat</th></tr></thead>
    <tbody>
      <tr><td>${HELENS.short}</td><td>${cell(near)}</td><td>${signed(near.flat, deg)}</td></tr>
      <tr><td>${RAINIER.short}</td><td>${cell(far)}</td><td>${signed(far.flat, deg)}</td></tr>
      <tr><td><b>Higher</b></td><td><b class="g">${globeHigher}</b></td><td><b class="f">${higher(v.flatGap)}</b></td></tr>
    </tbody></table>
    <p>Distance makes ${RAINIER.short} look smaller on both models, so a taller mountain looking shorter settles
    nothing by itself. What differs is the drop. On the globe everything a distance d away has fallen d² ÷ 2R′
    below your own level: <b class="g">${fmtH(dropM(near))}</b> at ${HELENS.short} and
    <b class="g">${fmtH(dropM(far))}</b> at ${RAINIER.short}. On the flat model nothing falls. The full moon is
    about ${deg(MOON_WIDE_DEG, 1)} wide, for scale.</p>
    <p>${flatTurn} ${globeTurn}</p>
    <p>The air's bending is allowed for on the globe only, as elsewhere in this tool. These lines of sight run
    kilometres above the ground, where thinner air bends light less, so the figure set is only a guide. It cannot
    close the gap. Air bends light the same way over either ground, and with the same air over both, the two
    models' answers stay <b>${deg(apart, 2)}</b> apart whatever the bending: (d₂ − d₁) ÷ 2R.${
      k > 0 ? ` With this air the flat model's own answer would be ${higher(v.flatSameAirGap)}.` : ''
    }</p>
    <p>Only the summits are worked out. The shapes are sketches, and nearer hills cover the lower slopes on
    either model. Both models are given the same distances, the ones over the ground. The two large views
    show ${HELENS.short} alone, from the same place.</p>
    <p class="try">Try: drag "Where you stand" and watch which summit is on top in each picture. Then photograph
    the pair from a spot you can find on a map. From here the summits are ${deg(Math.abs(v.sideDeg), 2)} apart
    side to side, which gives your photograph its scale.</p>`;
  },
  checks({ check, near }) {
    const here = viewFrom(0, START_EYE_M, K_STANDARD);
    check('two mountains argument: from Pittock Mansion St Helens is about 84 km off and Rainier about 165 km',
      near(here.near.km, 84.3, 0.3) && near(here.far.km, 164.9, 0.3), `${here.near.km.toFixed(1)} and ${here.far.km.toFixed(1)} km`);
    check("two mountains argument: Rainier's summit is about 2.2 degrees to the left of St Helens' from there",
      near(here.sideDeg, 2.2, 0.1), here.sideDeg.toFixed(2));
    check('two mountains argument: there the flat model puts St Helens higher by about 0.11 degrees and the globe by about 0.41',
      near(here.flatGap, 0.11, 0.01) && near(here.globeGap, 0.41, 0.01), `${here.flatGap.toFixed(3)} and ${here.globeGap.toFixed(3)}`);
    // The same air over both models: the gap between their answers is (d₂ − d₁) ÷ 2R, whatever the air.
    const apart = (here.far.km - here.near.km) / (2 * EARTH_RADIUS_KM) / DEG;
    const worst = Math.max(...[0, 0.13, K_STANDARD, 0.5].map((k) => {
      const v = viewFrom(0, START_EYE_M, k);
      return Math.abs(v.globeGap - v.flatSameAirGap - apart);
    }));
    check('two mountains argument: with the same air over both, the models stay (d2 - d1) / 2R apart whatever the bending',
      near(apart, 0.362, 0.001) && worst < 0.001, `${apart.toFixed(4)} degrees, worst ${worst.toExponential(1)}`);
    const c = changes(START_EYE_M, K_STANDARD);
    check('two mountains argument: backing away, the flat model puts Rainier on top from about 15 km and the globe never does',
      c.flatSwap !== null && near(c.flatSwap, 15, 1) && c.globeSwap === null, `flat ${c.flatSwap} km, globe ${c.globeSwap}`);
    check('two mountains argument: on the globe Rainier, the taller, goes under the horizon first',
      c.farGone !== null && c.nearGone !== null && c.farGone < c.nearGone, `Rainier ${c.farGone} km, St Helens ${c.nearGone} km`);
    // A summit is just out of sight where its own horizon and the eye's meet. There it sits exactly on the
    // horizon: as far below eye level as the horizon is.
    const [eyeM, topM] = [286, 2549];
    const gone = horizonDistanceKm(eyeM, K_STANDARD) + horizonDistanceKm(topM, K_STANDARD);
    check('two mountains argument: a summit that is just out of sight sits on the horizon, to a hundredth of a degree',
      near(topAngleDeg(eyeM, topM, gone, K_STANDARD), -dipDeg(eyeM, K_STANDARD), 0.01) && near(hiddenHeightM(eyeM, gone, K_STANDARD), topM, 1),
      `${topAngleDeg(eyeM, topM, gone, K_STANDARD).toFixed(4)} against ${(-dipDeg(eyeM, K_STANDARD)).toFixed(4)}`);
    check('two mountains argument: on a flat surface with straight light a top stands at atan(height / distance)',
      near(topAngleDeg(0, 1000, 10, 0, true), Math.atan2(1, 10) / DEG, 1e-9) && near(topAngleDeg(0, 1000, 10, 0.3, true), Math.atan2(1 + (0.3 * 100) / (2 * EARTH_RADIUS_KM), 10) / DEG, 1e-9));
    // Directions and distances: due north and due east, and there and back again.
    const back = placeAlong(START, bearingDeg(START, RAINIER), globeDistanceKm(START, RAINIER));
    check('two mountains argument: setting off toward Rainier and going the distance to it arrives at Rainier',
      near(back.lat, RAINIER.lat, 1e-6) && near(back.lon, RAINIER.lon, 1e-6) && near(bearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 0 }), 0, 1e-9) && near(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 }), 90, 1e-9));
    const moved = placeAlong(START, WALK_DEG, 100);
    check('two mountains argument: 100 km south-west of the start is 100 km from it, to the south-west',
      near(globeDistanceKm(START, moved), 100, 1e-6) && near(bearingDeg(START, moved), WALK_DEG, 1e-6) && moved.lat < START.lat && moved.lon < START.lon);
  },
};
