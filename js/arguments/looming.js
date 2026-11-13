import { K_STANDARD, hiddenHeightM } from '../horizon.js';
import { makeAir, traceView } from '../raytrace.js';

const SIZES = { eyeM: 2, targetM: 150, distanceKm: 45 };
const COLD_WATER = { tempC: 15, surfaceC: 9, layerM: 15 };

export default {
  id: 'looming',
  label: 'Seen from too far away',
  title: 'A skyline that "should" be hidden',
  claim: 'We can photograph things the curve should hide. So there is no curve.',
  ask: "If a photograph shows a skyline that should be hidden, what would you want to know about the day it was taken?",
  check: "Photograph the same far shore on a cold-water day and on an ordinary day, noting the air and water temperatures.",
  tool: 'horizon',
  pair: 'sky',
  apply({ state }) {
    Object.assign(state, {
      shape: 'building',
      targetM: SIZES.targetM,
      targetKm: SIZES.distanceKm,
      eyeM: SIZES.eyeM,
      layers: true,
      airC: COLD_WATER.tempC,
      waterC: COLD_WATER.surfaceC,
      layerM: COLD_WATER.layerM,
      lapse100: -0.65,
      sailing: false,
    });
  },
  body(hz, { fmtH, fmtD }) {
    const amount = (m) => (m > 0 ? fmtH(m) : 'none');
    return `
    <p>A ${fmtH(hz.targetM)} building ${fmtD(hz.distanceKm)} away across water, seen from ${fmtH(hz.eyeM)} up. In
    standard air the globe hides the bottom <b class="g">${amount(hz.hiddenStandardM)}</b>.</p>
    <p>The air on show is not standard. ${
      hz.traced
        ? `Followed through it ray by ray, the globe hides <b class="g">${amount(hz.hiddenM)}</b> and the flat
           model <b class="f">${amount(hz.flatHiddenM)}</b>.`
        : 'Tick "Follow light through layers of air" to trace it.'
    } Air chilled by cold water bends light down along the sea, and brings into view what is usually hidden. The
    image is often squashed or stretched as well.</p>
    <p>So a photograph taken on such a day fits the globe. What it cannot do is tell the models apart: on that
    day they agree. The test is the ordinary day, when the bottom of the same building is gone. The flat model
    has no way to hide it then, and no reason for the view to change with the weather at all.</p>
    <p class="try">Try: press "Even", then "Warm water", and watch the same building from the same spot. Note the
    air and water temperatures when you take a photograph of your own.</p>`;
  },
  checks({ check, near }) {
    const standard = hiddenHeightM(SIZES.eyeM, SIZES.distanceKm, K_STANDARD);
    check('looming argument: in standard air about 101 m of the building is hidden', near(standard, 101, 1.5));
    const cold = traceView(makeAir(COLD_WATER), { ...SIZES, curved: true });
    check('looming argument: over cold water much less of it is hidden', cold.hiddenM < standard * 0.5, `${cold.hiddenM.toFixed(1)} m`);
  },
};
