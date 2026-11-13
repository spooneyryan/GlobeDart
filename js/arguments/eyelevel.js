import { K_STANDARD, dipDeg, horizonDistanceKm } from '../horizon.js';

// Places to stand, with the height of the eye above the sea in metres.
const HEIGHTS = [
  ['A beach', 1.7],
  ['A 100 m cliff', 100],
  ['A 1,000 m hill', 1000],
  ['An airliner', 10000],
];

export default {
  id: 'eyelevel',
  group: 'horizon',
  label: 'Horizon at eye level',
  title: 'Does the horizon always rise to eye level?',
  claim: 'However high you climb, the horizon rises to meet your eye. On a ball it would drop away below you.',
  ask: "From an airliner, is the horizon level with your eye, or below it? How far below would it have to be before you noticed?",
  check: "From a window seat, hold something level against the horizon and see where the horizon sits.",
  tool: 'horizon',
  pair: 'outside',
  apply({ state }) {
    Object.assign(state, {
      shape: 'building',
      targetM: 500,
      targetKm: 150,
      eyeM: 10000,
      k: K_STANDARD,
      layers: false,
      sailing: false,
    });
  },
  body(hz, { deg, fmtH, fmtD }) {
    const rows = HEIGHTS.map(
      ([name, m]) => `<tr><td>${name}, ${fmtH(m)}</td><td>${deg(dipDeg(m, hz.k), 2)}</td>
        <td>${fmtD(horizonDistanceKm(m, hz.k))}</td><td class="bad">${deg(0, 2)}</td></tr>`,
    ).join('');
    return `
    <p>It does drop, and by an amount anyone can work out. With your eye ${fmtH(hz.eyeM)} up, the globe puts the
    horizon <b class="g">${deg(hz.dipDeg, 2)}</b> below eye level, ${fmtD(hz.horizonKm)} away. The flat model
    puts it at exactly eye level from any height.</p>
    <table class="data"><thead><tr><th>Standing on</th><th class="globe">Globe: below level</th>
      <th class="globe">how far</th><th class="flat">Flat</th></tr></thead><tbody>${rows}</tbody></table>
    <p>From a beach the drop is too small to see, which is where the claim comes from. From an airliner it is
    about six widths of the full moon.</p>
    <p class="try">Try it: hold a clear tube of water level at arm's length, or use a levelling app with a camera
    view, and line it up with the horizon from a window seat. Then change the height of your eye here.</p>`;
  },
  checks({ check, near }) {
    check('eye-level argument: from an airliner the horizon is about 3 degrees below level', near(dipDeg(10000, K_STANDARD), 2.92, 0.02));
    check('eye-level argument: from a beach it is about 2.5 arcminutes', near(dipDeg(1.7, K_STANDARD) * 60, 2.3, 0.3));
  },
};
