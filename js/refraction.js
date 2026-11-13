// How much the air lifts the apparent position of something in the sky.
//
// This is the only place the lift is worked out. The measured position, the
// globe prediction and the flat prediction all call it with the same air, so
// neither model is favoured.
//
// "Air" is either null (no atmosphere) or { tempC, pressureHpa }.

const DEG = Math.PI / 180;

/** The conditions the standard formula assumes. */
export const STANDARD_AIR = Object.freeze({ tempC: 10, pressureHpa: 1010 });

/** Limits on what can be entered: the coldest and hottest air, and the thinnest and thickest, people stand in. */
export const AIR_LIMITS = Object.freeze({ tempC: [-80, 60], pressureHpa: [300, 1100] });

/**
 * Lift in degrees for a true (geometric) elevation in standard air, from
 * Sæmundsson's formula as given by Meeus, "Astronomical Algorithms", chapter 16.
 * Written to give the same numbers as astronomy-engine's 'normal' setting:
 * held constant below one degree under the horizon, then faded out toward the
 * point straight down, where it means nothing anyway.
 */
export function standardLift(trueElDeg) {
  if (!(trueElDeg >= -90 && trueElDeg <= 90)) return 0;
  const h = Math.max(trueElDeg, -1);
  const lift = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG) / 60;
  return trueElDeg < -1 ? (lift * (trueElDeg + 90)) / 89 : lift;
}

/**
 * How the lift scales with the weather: in proportion to the air's density,
 * so up with pressure and down with temperature. Exactly 1 for standard air.
 */
export function airFactor(air) {
  if (!air) return 0;
  return (air.pressureHpa / STANDARD_AIR.pressureHpa) * ((273 + STANDARD_AIR.tempC) / (273 + air.tempC));
}

/** Lift in degrees for a true elevation in the given air. */
export function lift(trueElDeg, air = STANDARD_AIR) {
  return air ? standardLift(trueElDeg) * airFactor(air) : 0;
}

/** Where something appears, given where it geometrically is. */
export function apparentElevation(trueElDeg, air = STANDARD_AIR) {
  return trueElDeg + lift(trueElDeg, air);
}

/**
 * The reverse: where something geometrically is, given where it appears.
 * The lift changes far more slowly than the elevation, so stepping back and
 * forth settles within a few rounds.
 */
export function trueElevation(apparentElDeg, air = STANDARD_AIR) {
  let el = apparentElDeg;
  for (let i = 0; i < 60; i++) {
    const next = apparentElDeg - lift(el, air);
    if (Math.abs(next - el) < 1e-12) return next;
    el = next;
  }
  return el;
}
