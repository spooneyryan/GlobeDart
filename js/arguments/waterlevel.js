import { K_STANDARD, middleMarkRiseM } from '../horizon.js';

/**
 * How far the surface of still water stands above a straight line joining two
 * points on it, at the middle, in metres: d² ÷ 8R for a stretch d across.
 */
export const bulgeM = (distanceKm) => middleMarkRiseM(distanceKm, 0);

// Stretches of water to compare, in km, with something of that size.
const STRETCHES = [
  ['A bathtub, 2 m', 0.002],
  ['A swimming pool, 50 m', 0.05],
  ['1 km', 1],
  ['10 km', 10],
  ['50 km', 50],
];

/** A small height in words, since these run from thousandths of a millimetre to tens of metres. */
function small(m, fmtH) {
  if (m >= 0.01) return fmtH(m);
  const mm = m * 1000;
  return mm >= 0.01 ? `${mm.toFixed(2)} mm` : `${(mm * 1000).toFixed(2)} thousandths of a mm`;
}

export default {
  id: 'waterlevel',
  group: 'horizon',
  label: 'Water finds its level',
  title: 'Does water not always lie flat?',
  claim: 'Water always finds its level. It cannot curve round a ball.',
  ask: 'What does "level" mean: flat, or square to the pull of gravity? How could you tell the two apart across a bathtub?',
  check: 'Look across a wide lake from the waterline at a far shore or a lighthouse, on a day when the air and the water are about the same temperature.',
  tool: 'horizon',
  pair: 'outside',
  apply({ state }) {
    Object.assign(state, {
      shape: 'lighthouse',
      targetM: 30,
      targetKm: 20,
      eyeM: 1.7,
      k: K_STANDARD,
      layers: false,
      sailing: false,
    });
  },
  body(hz, { fmtH, fmtD }) {
    const rows = STRETCHES.map(([name, km]) => `<tr><td>${name}</td><td>${small(bulgeM(km), fmtH)}</td></tr>`).join('');
    return `
    <p>Water does find its level. But "level" means square to the pull of gravity, not flat. On a globe gravity
    pulls toward the middle, so a level surface curves with the Earth. Still water is level everywhere and flat
    nowhere.</p>
    <p>Nobody notices, because over any distance you can take in at a glance the curve is tiny. This is how far
    the middle of a stretch of still water stands above a straight line joining its two ends:</p>
    <table class="data"><thead><tr><th>Across</th><th class="globe">Rise in the middle</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>It grows with the square of the distance. Across the <b>${fmtD(hz.distanceKm)}</b> on show it is
    <b class="g">${fmtH(bulgeM(hz.distanceKm))}</b>: the hump in the top-left drawing. From ${fmtH(hz.eyeM)} up, that
    hides the bottom ${hz.hiddenM > 0 ? `<b class="g">${fmtH(hz.hiddenM)}</b>` : 'nothing'} of what stands on the
    far side.</p>
    <p>A spirit level cannot show it, and neither can a canal a few hundred metres long. A sight line tens of
    kilometres long across open water can.</p>
    <p class="try">Try: drag the distance. Then raise your eye, and watch how much of the lighthouse comes back.</p>`;
  },
  checks({ check, near }) {
    check('water level argument: still water rises about 2 m in the middle of a 10 km stretch', near(bulgeM(10), 1.96, 0.01));
    check('water level argument: and about 49 m across 50 km, twenty-five times as much', near(bulgeM(50), 49.05, 0.05) && near(bulgeM(50) / bulgeM(10), 25, 1e-9));
    check('water level argument: across a bathtub it is under a ten-thousandth of a millimetre', bulgeM(0.002) * 1000 < 0.0001);
  },
};
