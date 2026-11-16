// Things seen from "too far away".
//
// No almanac figure is used. The same view is worked out on two kinds of day
// by following rays of light through air whose temperature changes with height
// (js/raytrace.js). The one routine serves both models: only the ground under
// the rays differs, curved for the globe and level for the flat model.
import { K_STANDARD, hiddenHeightM } from '../horizon.js';
import { makeAir, traceView } from '../raytrace.js';

// The view: an eye 2 m up, and a building 150 m tall, 45 km away across water.
const SIZES = { eyeM: 2, targetM: 150, distanceKm: 45 };
// The cold-water day: air at 15 °C over water at 9 °C, which chills the bottom 15 m of the air. On the
// ordinary day the water is at 15 °C as well.
const COLD_WATER = { tempC: 15, surfaceC: 9, layerM: 15 };

export default {
  id: 'looming',
  group: 'horizon',
  label: 'Seen from too far away',
  title: 'A skyline that "should" be hidden',
  claim: 'We can photograph things the curve should hide. So there is no curve.',
  ask: "If a photograph shows a skyline that should be hidden, what would you want to know about the day it was taken?",
  check: "Photograph the same far shore on a cold-water day and on an ordinary day, noting the air and water temperatures.",
  tool: 'horizon',
  pair: 'sky',
  controls: [{ id: 'day', label: 'The day', value: 'ordinary', options: [['ordinary', 'An ordinary day'], ['cold', 'Warm air over cold water']], sets: true }],
  apply({ state }, own) {
    const cold = own.day === 'cold';
    Object.assign(state, {
      shape: 'building',
      targetM: SIZES.targetM,
      targetKm: SIZES.distanceKm,
      eyeM: SIZES.eyeM,
      layers: true,
      airC: COLD_WATER.tempC,
      waterC: cold ? COLD_WATER.surfaceC : COLD_WATER.tempC,
      layerM: COLD_WATER.layerM,
      lapse100: -0.65, // above that layer the air cools by the standard 0.65 °C for each 100 m of height
      sailing: false,
    });
  },
  body(hz, { fmtH, fmtD }, own) {
    const amount = (m) => (m > 0 ? fmtH(m) : 'none');
    const traced = hz.traced
      ? `Followed through this air ray by ray, the globe hides <b class="g">${amount(hz.hiddenM)}</b> and the flat
         model <b class="f">${amount(hz.flatHiddenM)}</b>.`
      : 'Tick "Follow light through layers of air" to trace it.';
    const today =
      own.day === 'cold'
        ? `<p>This is the other kind of day: warm air lying over cold water. ${traced} Air chilled by the water bends
          light down along the sea and brings into view what is usually hidden. The image is often squashed or
          stretched as well. This is the day the photographs that "should be impossible" are taken on.</p>`
        : `<p>This is an ordinary day, with the air and the water at the same temperature. ${traced} The bottom of
          the building is behind the water, as the globe says and as is usually seen.</p>`;
    return `
    <p>A ${fmtH(hz.targetM)} building ${fmtD(hz.distanceKm)} away across water, seen from ${fmtH(hz.eyeM)} up. In
    standard air the globe hides the bottom <b class="g">${amount(hz.hiddenStandardM)}</b>.</p>
    ${today}
    <p>So a photograph taken over cold water fits the globe. What it cannot do is tell the models apart: on that
    day they nearly agree. The test is the ordinary day, when the bottom of the same building is gone. The flat
    model has no way to hide it then, and no reason for the view to change with the weather at all.</p>
    <p class="try">Try: switch "The day" above between the two and watch the same building from the same spot.
    Note the air and water temperatures when you take a photograph of your own.</p>`;
  },
  checks({ check, near }) {
    const standard = hiddenHeightM(SIZES.eyeM, SIZES.distanceKm, K_STANDARD);
    check('looming argument: in standard air about 101 m of the building is hidden', near(standard, 101, 1.5));
    const cold = traceView(makeAir(COLD_WATER), { ...SIZES, curved: true });
    check('looming argument: over cold water much less of it is hidden', cold.hiddenM < standard * 0.5, `${cold.hiddenM.toFixed(1)} m`);
    const even = traceView(makeAir({ ...COLD_WATER, surfaceC: COLD_WATER.tempC }), { ...SIZES, curved: true });
    check('looming argument: on the ordinary day it opens with, most of what standard air hides is still hidden', even.hiddenM > standard * 0.8, `${even.hiddenM.toFixed(1)} m`);
  },
};
