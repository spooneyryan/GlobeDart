import { DEG, EARTH_RADIUS_KM } from '../astro.js';
import { levelDropDeg, shadowHeightKm, globeCloudLight, flatCloudLight, litBelowMinutes } from '../clouds.js';

// Kinds of cloud to compare, with a usual height for each in km.
const KINDS = [
  ['Low cloud', 1.5],
  ['Middle cloud', 4],
  ['High cloud', 10],
  ['Night-shining', 82],
];

const INK = {
  text: '#e6edf5',
  muted: '#93a4b8',
  globe: '#7fb4ff',
  flat: '#ffb224',
  ground: '#15202d',
  edge: '#3b4c60',
  sun: '#ffe08a',
  glow: '#ff7847',
  lit: '#f6f1e2',
  shade: '#5b6877',
  dark: '#2c3642',
  sky: 'rgba(255, 190, 120, 0.14)',
};

const WORDS = { top: 'lit on top', under: 'lit from beneath', dark: 'no sunlight' };

/** What the flat model is told about its sun, from the app's settings. */
const flatSun = (state) => ({
  sunHeightKm: state.sunHeightKm,
  lightRangeKm: state.lightRangeKm,
  bendSetKm: state.flatLight === 'bent' ? state.lightRangeKm : 0,
});

function label(ctx, string, x, y, colour = INK.muted, align = 'left', weight = 400) {
  ctx.font = `${weight} 11px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
  ctx.strokeText(string, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(string, x, y);
}

/** One puff of cloud, its top and its underside coloured by the light on it. */
function puff(ctx, x, y, rx, ry, lit) {
  const half = (from, to, colour) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, from, to);
    ctx.closePath();
    ctx.fill();
  };
  half(Math.PI, Math.PI * 2, lit === 'top' ? INK.lit : lit === 'under' ? INK.shade : INK.dark);
  half(0, Math.PI, lit === 'under' ? INK.glow : lit === 'top' ? INK.shade : INK.dark);
}

/** A ray of light along a list of points, with an arrowhead where it arrives (the first point). */
function ray(ctx, points, colour, broken = false) {
  if (points.length < 2) return;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(broken ? [3, 4] : []);
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.setLineDash([]);
  const [[x0, y0], [x1, y1]] = points;
  const a = Math.atan2(y0 - y1, x0 - x1);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 - 7 * Math.cos(a - 0.4), y0 - 7 * Math.sin(a - 0.4));
  ctx.lineTo(x0 - 7 * Math.cos(a + 0.4), y0 - 7 * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

function aircraft(ctx, x, y) {
  ctx.strokeStyle = INK.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x + 8, y);
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 11, y - 5);
  ctx.moveTo(x + 1, y);
  ctx.lineTo(x - 4, y + 4);
  ctx.stroke();
}

const below = (el, deg) => `${deg(Math.abs(el))} ${el < 0 ? 'below' : 'above'} level`;

export default {
  id: 'clouds',
  group: 'sun',
  label: 'Clouds lit from beneath',
  title: 'What lights the underside of a cloud?',
  claim: 'The sun is always above the Earth and above the clouds. It never goes down; it only moves away.',
  ask: 'After sunset the clouds overhead often glow red underneath. If the sun is thousands of km above them, which side of a cloud can it light?',
  check: 'Watch the clouds for a quarter of an hour after sunset. They are lit from beneath, the low ones go dark first and the highest last. From a window seat at dusk, the cloud tops below you are in shade.',
  tool: 'sky',
  pair: 'sky',
  controls: [{ id: 'km', label: 'Height of the cloud', min: 0.5, max: 13, step: 0.5, value: 5, show: (v, { fmtH }) => fmtH(v * 1000) }],
  apply({ state, city, setObserver, sunEvents, SUN_DEMO }) {
    setObserver(city('London'), true);
    const ev = sunEvents(state.date, state.lat, state.lon);
    if (ev.set) state.date = new Date(ev.set.getTime() + 6 * 60000);
    Object.assign(state, SUN_DEMO);
  },
  drawHeight: 280,
  /**
   * Two side-on pictures, the globe above the flat model, looking across the light with the sun off to the right.
   * Heights are stretched, by the same amount in both. Stretching keeps straight light straight.
   */
  draw(ctx, { w, h }, c, { state, deg }, own) {
    const cloudKm = own.km;
    const R = EARTH_RADIUS_KM;
    const sunEl = c.globe.trueEl;
    const halfKm = 1.15 * Math.sqrt(2 * R * cloudKm); // a little beyond the cloud's own horizon
    const lowKm = -(halfKm * halfKm) / (2 * R); // how far the globe's surface has fallen away at the edges
    const highKm = 1.6 * cloudKm;
    const gap = 8;
    const ph = (h - gap) / 2;
    const sx = (w / 2 - 4) / halfKm;
    const sy = (ph - 22) / (highKm - lowKm);
    const X = (x) => w / 2 + x * sx;
    const puffs = Array.from({ length: 11 }, (_, i) => ((i - 5) / 5) * 0.92 * halfKm);
    const aimed = [puffs[2], puffs[5], puffs[8]];
    const rx = Math.max(6, (0.92 * halfKm * sx) / 5 / 2 - 1);
    const ry = Math.max(3.5, Math.min(8, 0.17 * cloudKm * sy));

    // `shadowTop(x)` is the height below which no sunlight comes; `unlit(x)` is true where light is on its way but is said not to arrive.
    const panel = (top, ground, lightAt, pathTo, title, colour, shadowTop, unlit = () => false) => {
      const Y = (y) => top + ph - 3 - (y - lowKm) * sy;
      const across = (i, n) => -halfKm + (2 * halfKm * i) / n;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, w, ph);
      ctx.clip();
      // The sky the sun is shining through. What is left dark is shadow.
      ctx.fillStyle = INK.sky;
      ctx.beginPath();
      ctx.moveTo(X(-halfKm), top);
      ctx.lineTo(X(halfKm), top);
      for (let i = 120; i >= 0; i--) {
        const x = across(i, 120);
        ctx.lineTo(X(x), Math.max(top, Y(Math.min(highKm * 2, Math.max(ground(x), shadowTop(x))))));
      }
      ctx.closePath();
      ctx.fill();
      // The ground.
      ctx.fillStyle = INK.ground;
      ctx.strokeStyle = INK.edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const x = across(i, 60);
        if (i) ctx.lineTo(X(x), Y(ground(x)));
        else ctx.moveTo(X(x), Y(ground(x)));
      }
      ctx.stroke();
      ctx.lineTo(X(halfKm), top + ph);
      ctx.lineTo(X(-halfKm), top + ph);
      ctx.closePath();
      ctx.fill();
      // The clouds, then the light arriving at three of them.
      for (const x of puffs) puff(ctx, X(x), Y(ground(x) + cloudKm), rx, ry, lightAt(x).side);
      for (const x of aimed) {
        const lit = lightAt(x).side;
        if (lit === 'dark' && !unlit(x)) continue;
        const shift = lit === 'under' ? ry + 1 : -ry - 1;
        const points = [];
        for (let i = 0; i <= 24; i++) {
          const at = x + ((halfKm * 1.05 - x) * i) / 24;
          const y = pathTo(x, ground(x) + cloudKm, at);
          if (y === null) break;
          points.push([X(at), Y(y) + shift]);
        }
        ray(ctx, points, lit === 'top' ? INK.sun : lit === 'under' ? INK.glow : INK.muted, lit === 'dark');
      }
      // Somebody on the ground, and an aircraft above the cloud.
      ctx.fillStyle = INK.text;
      ctx.beginPath();
      ctx.arc(X(0), Y(ground(0)) - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      aircraft(ctx, X(0), Y(ground(0) + cloudKm * 1.38));
      label(ctx, 'you', X(0) + 8, Y(ground(0)) - 5, INK.muted);
      ctx.restore();
      label(ctx, `${title}: ${WORDS[lightAt(0).side]}`, 6, top + 9, colour, 'left', 600);
    };

    // Globe: the surface falls away as x² ÷ 2R, and the light is parallel.
    const slope = Math.tan(Math.max(-89, Math.min(89, sunEl)) * DEG);
    panel(
      0,
      (x) => -(x * x) / (2 * R),
      (x) => globeCloudLight(cloudKm, sunEl + x / R / DEG), // nearer the sun, it is higher in the sky
      (x, y, at) => y + (at - x) * slope,
      'Globe',
      INK.globe,
      // The Earth's shadow: everything under the ray that just clears the curve, on the far side of where it touches.
      (x) => (sunEl < 0 && x < -slope * R ? (slope * slope * R) / 2 + slope * x : -Infinity),
    );
    label(ctx, `sun ${below(sunEl, deg)}`, w - 6, 9, INK.muted, 'right');

    // Flat: level ground, and light from a sun at one height, which may be made to curve.
    const sun = flatSun(state);
    const awayKm = c.flat.groundKm;
    panel(
      ph + gap,
      () => 0,
      (x) => flatCloudLight(cloudKm, awayKm - x, sun),
      (x, y, at) => {
        const from = awayKm - x; // how far the light has come when it arrives
        const travelled = awayKm - at;
        if (from < 1 || travelled < 0) return null;
        const { leavesAt, bend } = flatCloudLight(y, from, sun);
        return sun.sunHeightKm + leavesAt * travelled + (bend * travelled * travelled) / 2;
      },
      'Flat',
      INK.flat,
      (x) => {
        const from = awayKm - x;
        if (!sun.bendSetKm) return from <= sun.lightRangeKm ? -Infinity : Infinity;
        // Bending light clears the ground and climbs again: beyond its reach it is above H × (distance ÷ reach − 1)².
        return from <= sun.bendSetKm ? -Infinity : sun.sunHeightKm * (from / sun.bendSetKm - 1) ** 2;
      },
      () => !sun.bendSetKm,
    );
    const flatHere = flatCloudLight(cloudKm, awayKm, sun);
    label(ctx, sun.bendSetKm && !flatHere.reaches ? 'its light has curved away' : `sun ${below(flatHere.el, deg)}`, w - 6, ph + gap + 9, INK.muted, 'right');
    label(ctx, `heights stretched ${Math.max(1, Math.round(sy / sx))} times`, w - 6, h - 9, INK.muted, 'right');
  },
  body(c, { state, deg, km, fmtH, fmtTime }, own) {
    const cloudKm = own.km;
    const high = (v) => fmtH(v * 1000);
    const sunEl = c.globe.trueEl;
    const globe = globeCloudLight(cloudKm, sunEl);
    const sun = flatSun(state);
    const flat = flatCloudLight(cloudKm, c.flat.groundKm, sun);
    const minutes = (v) => {
      const m = litBelowMinutes(v, state.lat, c.sub.lat);
      return m === null ? 'the sun does not set here today' : fmtTime(m);
    };
    const rows = [...KINDS.map(([name, v]) => [`${name}, ${high(v)}`, v]), [`<b>Your cloud, ${high(cloudKm)}</b>`, cloudKm]]
      .sort((a, b) => a[1] - b[1])
      .map(([name, v]) => `<tr><td>${name}</td><td>${minutes(v)}</td>${sun.bendSetKm ? '' : '<td class="bad">never</td>'}</tr>`)
      .join('');
    const shadow = shadowHeightKm(sunEl);
    const globeNow = {
      top: `The globe's sun is still <b class="g">${deg(sunEl)}</b> above level here, so its light comes down onto the
        cloud and lights the top.`,
      under: `The globe's sun is <b class="g">${deg(-sunEl)}</b> below level here. Its light has skimmed over the curve and
        is travelling upward when it arrives, so it lights the <b class="g">underside</b> and leaves the top in shade.
        The Earth's shadow has climbed to ${high(shadow)} overhead.`,
      dark: `The globe's sun is <b class="g">${deg(-sunEl)}</b> below level here, and the Earth's shadow has climbed to
        ${Number.isFinite(shadow) && shadow < 1000 ? high(shadow) : 'far above any cloud'} overhead. This cloud is inside
        it and gets no sunlight. Anything higher than the shadow is still lit from beneath.`,
    }[globe.side];
    const flatNow = sun.bendSetKm
      ? {
          top: `With its light bending, the flat sun's light still arrives from <b class="f">${deg(flat.el)}</b> above
            level, and lights the top.`,
          under: `With its light bending, the flat sun's light arrives from <b class="f">${deg(-flat.el)}</b> below level,
            and lights the underside too.`,
          dark: `With its light bending, the flat sun's light has curved away overhead before it gets here, and the
            cloud is dark.`,
        }[flat.side] +
        ` Bending light can do this because it is the curve of the globe moved into the light. Near the ground, light
          that bends this much over a flat surface behaves as straight light does over a ball
          ${km(1 / flat.bend)} in radius. The real Earth is ${km(EARTH_RADIUS_KM)} in radius, and "Sun angles from
          many cities" shows how far out the bent light still is.`
      : flat.reaches
      ? `The flat sun is ${km(state.sunHeightKm)} up and ${km(c.flat.groundKm)} away over the map, so its light comes
        <b class="f">down</b> onto the cloud at <b class="f">${deg(flat.el)}</b>. It lights the top. To light the
        underside the sun would have to be lower than the cloud: under ${high(cloudKm)}.`
      : `The flat sun is ${km(c.flat.groundKm)} away over the map, beyond the ${km(state.lightRangeKm)} its light is said
        to reach, so the model leaves the cloud unlit on both sides. If the light did reach, it would come
        <b class="f">down</b> at ${deg(flat.el)} and light the top.`;
    return `
    <p>Light can only strike the underside of a cloud if it is travelling upward when it gets there. So the question
    for each model is where the sun is, seen from the cloud: above level, or below it. The heights here are by
    geometry alone, without the half a degree the air lifts a setting sun by.</p>
    <p>${globeNow}</p>
    <p>${flatNow}</p>
    <p>On a globe the ground curves away, so the higher something is, the further below level it can see: a cloud
    ${high(cloudKm)} up sees <b class="g">${deg(levelDropDeg(cloudKm))}</b> below. That sets how long the globe
    lights each cloud from beneath as the sun goes down:</p>
    <table class="data"><thead><tr><th>Cloud</th><th class="globe">Lit beneath for</th>${sun.bendSetKm ? '' : '<th class="flat">Flat</th>'}</tr></thead>
    <tbody>${rows}</tbody></table>
    <p>That is the order people see: low clouds go grey first, high ones stay red longest, and the night-shining
    clouds of summer, far above the weather, are still lit when the sky is dark. From an aircraft above the clouds, the globe says the
    sun is below level at dusk, with the cloud tops in shade and the glow underneath them. A sun that is always
    overhead lights the tops at every hour.</p>
    <p class="try">Try: press Play and watch the shadow climb. Then drag "Height of the cloud".</p>`;
  },
  checks({ check, near }) {
    check('clouds argument: from 10 km up the globe lets you see 3.2 degrees below level', near(levelDropDeg(10), 3.21, 0.005), levelDropDeg(10).toFixed(3));
    check("clouds argument: the Earth's shadow reaches a cloud's height exactly when the sun is as far below level as the cloud can see",
      [0.5, 5, 13, 82].every((h) => near(shadowHeightKm(-levelDropDeg(h)), h, 1e-9)) && shadowHeightKm(2) === 0);
    check('clouds argument: on a globe a cloud 5 km up is lit on top by day, from beneath just after sunset, and not at all later',
      globeCloudLight(5, 20).side === 'top' && globeCloudLight(5, -1).side === 'under' && globeCloudLight(5, -3).side === 'dark');
    check('clouds argument: low clouds go dark before high ones', globeCloudLight(1.5, -2).side === 'dark' && globeCloudLight(10, -2).side === 'under');
    check('clouds argument: at the equator on an equinox a cloud 10 km up is lit from beneath for about 13 minutes',
      near(litBelowMinutes(10, 0, 0), 12.84, 0.02) && litBelowMinutes(10, 80, 23) === null, litBelowMinutes(10, 0, 0).toFixed(2));
    const straight = { sunHeightKm: 5000, lightRangeKm: 10000, bendSetKm: 0 };
    let wrong = 0;
    for (const h of [0.5, 5, 13]) for (let d = 0; d <= 10000; d += 250) if (flatCloudLight(h, d, straight).side !== 'top') wrong++;
    check('clouds argument: a flat sun 5,000 km up lights the top of every cloud within reach of its light, from any distance', wrong === 0, `${wrong} wrong`);
    check('clouds argument: and beyond that reach it lights neither side', flatCloudLight(5, 12000, straight).side === 'dark' && flatCloudLight(5, 12000, straight).el > 20);
    const bent = { sunHeightKm: 5000, lightRangeKm: 10000, bendSetKm: 10000 };
    const edge = 10000 * (1 + Math.sqrt(5 / 5000));
    check('clouds argument: bending light lights the top, then the underside, then nothing, as the flat sun moves off',
      flatCloudLight(5, 9000, bent).side === 'top' && flatCloudLight(5, 10100, bent).side === 'under' && flatCloudLight(5, edge - 1, bent).side === 'under' && flatCloudLight(5, edge + 1, bent).side === 'dark');
    check('clouds argument: at ground level bending light gives the same height for the sun as the flat model itself',
      near(flatCloudLight(0, 7000, bent).el, Math.atan2(5000 - (2 * 5000 * 7000 * 7000) / 1e8 / 2, 7000) / DEG, 1e-9));
    // Light curving by c over a flat surface is straight light over a ball of radius 1 ÷ c.
    const ball = 1 / flatCloudLight(5, 10000, bent).bend;
    check('clouds argument: bending light lights the underside over the same distance as a ball of radius 1 ÷ c would',
      near(edge - 10000, Math.sqrt(2 * ball * 5), 1e-6) && near(ball, 10000, 1e-6), `${(edge - 10000).toFixed(1)} km on a ball of ${Math.round(ball)} km`);
  },
};
