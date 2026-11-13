import { K_STANDARD, hiddenHeightM, middleMarkRiseM, lapseForCoefficient } from '../horizon.js';
import { impliedCoefficient } from '../observations.js';

// The figures are the experimenters' own, in the units they gave them.
//   Rowbotham: "Zetetic Astronomy", Experiment 1.
//   Wallace: "My Life" (1905), volume 2, chapter 39.
const FOOT_M = 0.3048;
const MILE_KM = 1.609344;
const SIX_MILES_KM = 6 * MILE_KM;
const ROWBOTHAM = { eyeM: (8 / 12) * FOOT_M, flagM: 5 * FOOT_M };
const WALLACE = { markM: (13 + 3 / 12) * FOOT_M, expectedM: 5 * FOOT_M };

export default {
  id: 'bedford',
  group: 'horizon',
  label: 'The Bedford Level',
  title: 'Did six miles of canal prove the Earth flat?',
  claim: 'On the Bedford Level a boat stayed in sight for six miles along a dead straight canal. The water is flat.',
  ask: 'Warm air over cool water bends light along the surface. How would you set up the test so that the air could not decide the result?',
  check: 'Put three markers the same height above a long, straight stretch of still water. Sight from the first to the last, and see where the middle one falls.',
  tool: 'horizon',
  pair: 'outside',
  controls: [{ id: 'miles', label: 'Length of water for the three marks', min: 1, max: 20, step: 0.5, value: 6, show: (v, { fmtD }) => fmtD(v * MILE_KM) }],
  apply({ state }) {
    // What Rowbotham did in 1838: an eye just above the water, and a boat with a flag.
    Object.assign(state, {
      shape: 'ship',
      targetM: ROWBOTHAM.flagM,
      targetKm: SIX_MILES_KM,
      eyeM: ROWBOTHAM.eyeM,
      k: K_STANDARD,
      layers: false,
      sailing: false,
    });
  },
  body(hz, { state, fmtH, fmtD }, own) {
    const marksKm = own.miles * MILE_KM;
    const d = SIX_MILES_KM;
    const eye = ROWBOTHAM.eyeM;
    const kFlag = impliedCoefficient(eye, d, ROWBOTHAM.flagM);
    const kBoat = impliedCoefficient(eye, d, 0);
    // The figures as the experimenters gave them, with metres alongside for anyone working in metres.
    const said = (words, m) => (state.units === 'imperial' ? words : `${words} (${fmtH(m)})`);
    const row = (name, m, cls) => `<tr><td>${name}</td><td class="${cls}">${fmtH(m)}</td></tr>`;
    // A row for the bending on show, unless it is one of the two already listed.
    const onShow = [0, K_STANDARD].some((k) => Math.abs(hz.k - k) < 0.005)
      ? ''
      : row(`Globe, the bending on show (k = ${hz.k.toFixed(2)})`, middleMarkRiseM(marksKm, hz.k), 'globe');
    return `
    <p>The Old Bedford River in the English fens runs dead straight for six miles. In 1838 Samuel Rowbotham stood
    in it with a telescope ${said('8 inches', eye)} above the water, and watched a boat carrying a flag
    ${said('5 ft', ROWBOTHAM.flagM)} high sail the whole ${fmtD(d)}. He reported that he never lost sight of it.</p>
    <p>His sum was right for a world with no air: the globe would hide the bottom
    <b class="g">${fmtH(hiddenHeightM(eye, d, 0))}</b> of anything that far off. In standard air it hides
    <b class="g">${fmtH(hiddenHeightM(eye, d, K_STANDARD))}</b>, still more than the flag. But he looked along the
    surface of cool water on a sunny summer afternoon, where air bends light most. Bending of k = ${kFlag.toFixed(2)}
    brings the top of the flag into view, and k = ${kBoat.toFixed(2)} the whole boat. That takes air only
    ${lapseForCoefficient(kFlag).toFixed(2)} to ${lapseForCoefficient(kBoat).toFixed(2)} °C warmer for each metre
    above the water. His sighting measured the air, not the water.</p>
    <p>In 1870 Alfred Russel Wallace, a trained surveyor, repeated the test so that the air could not decide it. He
    set three marks the same height above the water, ${said('13 ft 3 in', WALLACE.markM)}: his telescope on one bridge, a disc on
    a pole three miles off, and a black band on a bridge at six. On flat water the disc sits on the band. On a
    globe the water humps up in between, and the disc stands above the band by this much:</p>
    <table class="data"><thead><tr><th>Model</th><th>Disc above the band, over ${fmtD(marksKm)}</th></tr></thead><tbody>
    ${row('Globe, no air', middleMarkRiseM(marksKm, 0), 'globe')}
    ${row('Globe, standard air', middleMarkRiseM(marksKm, K_STANDARD), 'globe')}
    ${onShow}
    ${row('Flat', 0, 'flat')}
    </tbody></table>
    <p>Over his six miles Wallace expected about ${said('5 ft', WALLACE.expectedM)}. The sketches of what the telescope showed were drawn by
    the flat-earth side's own referee and printed in <i>The Field</i>. They show the disc standing above the
    band, and the umpire awarded Wallace the bet. In 1901 Henry Oldham repeated it with three poles and found the
    middle one about ${said('6 ft', 6 * FOOT_M)} high.</p>
    <p>For the flat reading to survive this test, the air at that height would have to bend light exactly
    as much as the globe curves, for the whole six miles: k = 1, and the disc back on the band.</p>
    <p class="try">Try: this is Rowbotham's view, and in standard air the boat is hidden. Drag "Bending" up and
    watch the flag appear. Then change the length of water above, to plan a three-mark test of your own.</p>`;
  },
  checks({ check, near }) {
    const d = SIX_MILES_KM;
    check("Bedford Level argument: with no air the globe hides 16 ft 8 in at six miles from 8 inches up, Rowbotham's own figure",
      near(hiddenHeightM(ROWBOTHAM.eyeM, d, 0) / FOOT_M, 16 + 8 / 12, 0.1), (hiddenHeightM(ROWBOTHAM.eyeM, d, 0) / FOOT_M).toFixed(2) + ' ft');
    check('Bedford Level argument: in standard air the flag is still hidden', hiddenHeightM(ROWBOTHAM.eyeM, d, K_STANDARD) > ROWBOTHAM.flagM);
    const kFlag = impliedCoefficient(ROWBOTHAM.eyeM, d, ROWBOTHAM.flagM);
    check('Bedford Level argument: bending of about 0.61 just shows the top of the flag',
      near(kFlag, 0.61, 0.01) && near(hiddenHeightM(ROWBOTHAM.eyeM, d, kFlag), ROWBOTHAM.flagM, 1e-6), kFlag.toFixed(3));
    check('Bedford Level argument: that takes air under a tenth of a degree warmer per metre', lapseForCoefficient(kFlag) > 0 && lapseForCoefficient(kFlag) < 0.1);
    check('Bedford Level argument: with no air the middle mark stands 6 ft above the line, the old rule of 8 inches for the first mile',
      near(middleMarkRiseM(d, 0) / FOOT_M, 6, 0.01), (middleMarkRiseM(d, 0) / FOOT_M).toFixed(3) + ' ft');
    check('Bedford Level argument: in standard air it stands 5 ft above, as Wallace expected', near(middleMarkRiseM(d, K_STANDARD) / FOOT_M, 5, 0.05));
    check('Bedford Level argument: the middle mark rises a quarter as much as the drop at the far end', near(middleMarkRiseM(d, 0) * 4, hiddenHeightM(0, d, 0), 1e-9));
    check('Bedford Level argument: light that follows the curve puts it back on the line', middleMarkRiseM(d, 1) === 0);
  },
};
