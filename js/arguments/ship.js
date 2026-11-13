import { K_STANDARD, horizonDistanceKm, hiddenHeightM } from '../horizon.js';

export default {
  id: 'ship',
  label: 'Ship over the horizon',
  title: 'A ship sailing over the horizon',
  claim: 'Ships do not go over a curve. They get too small to see, and a zoom lens brings them back.',
  ask: "If a ship only gets too small to see, what should a telescope show when it is far away: all of it, or only the top?",
  check: "Watch a ship or a far shore across water through binoculars, from the water's edge and then from higher up.",
  tool: 'horizon',
  pair: 'sky',
  apply({ state, nearKm }) {
    Object.assign(state, { shape: 'ship', targetM: 50, eyeM: 1.7, k: K_STANDARD, layers: false });
    state.targetKm = nearKm();
    state.sailing = true;
  },
  body: (hz, { fmtH, fmtD }) => `
    <p>A cargo ship ${fmtH(hz.targetM)} tall, watched from the water's edge with your eye ${fmtH(hz.eyeM)} up. It is
    <b>${fmtD(hz.distanceKm)}</b> away.</p>
    ${
      Number.isFinite(hz.horizonKm)
        ? `<p>On the globe your horizon is only <b class="g">${fmtD(hz.horizonKm)}</b> off. Past that the sea itself
           is in the way and the ship goes from the bottom up: ${
             hz.hiddenM > 0 ? `<b class="g">${fmtH(hz.hiddenM)}</b> hidden so far` : 'nothing hidden yet'
           }, and all of it by ${fmtD(hz.goneKm)}.</p>`
        : `<p>With the air bending light this strongly, the globe hides nothing either. Set the bending back to
           standard air to carry on.</p>`
    }
    <p>On the flat model nothing is ever in the way. The ship only shrinks, and a telescope would bring all of
    it back, hull included. It never does.</p>
    <p class="try">Try: raise the height of your eye. On the globe, climbing a hill brings the hull back. On the
    flat model it changes nothing. Then look at a tall building 60 km away.</p>`,
  checks({ check, near }) {
    check('ship argument: the horizon is about 5.1 km off for an eye at 1.7 m in standard air',
      near(horizonDistanceKm(1.7, K_STANDARD), 5.11, 0.01));
    check('ship argument: a 50 m ship is gone by about 32.8 km',
      near(horizonDistanceKm(1.7, K_STANDARD) + horizonDistanceKm(50, K_STANDARD), 32.8, 0.1) &&
        hiddenHeightM(1.7, 33, K_STANDARD) > 50);
  },
};
