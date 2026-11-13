// The air above the ground: how its pressure falls with height when gravity
// holds it down, and what would happen in a sealed container with no gravity.
//
// The figures are the International Standard Atmosphere, the yearly average of
// measurements at middle latitudes that aircraft altimeters are built on. It is
// defined up to about 85 km.
//
// Heights are in metres, pressures in hectopascals (the same as millibars),
// temperatures in kelvin unless a name says otherwise.

export const SEA_LEVEL_HPA = 1013.25;
const SEA_LEVEL_K = 288.15;
const GRAVITY = 9.80665; // metres per second squared
const GAS_CONSTANT = 8.31446; // joules per mole per kelvin
const AIR_KG_PER_MOLE = 0.0289644;
/** The radius the standard uses to turn height above the ground into the height its layers are defined in. */
const STANDARD_RADIUS_M = 6356766;
/** The greatest height the standard atmosphere is defined for here. */
export const AIR_TOP_M = 84000;
/** The speed needed to leave the Earth from its surface, in metres per second. */
export const ESCAPE_SPEED_M_S = 11186;

// Each layer: the height it starts at, and how its temperature changes with height (kelvin per metre).
const LAYERS = [
  [0, -0.0065],
  [11000, 0],
  [20000, 0.001],
  [32000, 0.0028],
  [47000, 0],
  [51000, -0.0028],
  [71000, -0.002],
];

/** How the pressure changes with height at a steady temperature: it falls to 1/e in this many metres. */
export function scaleHeightM(tempK = SEA_LEVEL_K) {
  return (GAS_CONSTANT * tempK) / (AIR_KG_PER_MOLE * GRAVITY);
}

/**
 * Temperature and pressure of the standard atmosphere at a height above sea
 * level. In each layer the weight of the air above is what the pressure holds
 * up, so the pressure falls by (density x gravity) for each metre climbed.
 */
export function standardAir(heightM) {
  const z = Math.min(AIR_TOP_M, Math.max(0, heightM));
  // Gravity weakens with height. The standard allows for it by squeezing the height scale.
  const h = (STANDARD_RADIUS_M * z) / (STANDARD_RADIUS_M + z);
  const fall = (AIR_KG_PER_MOLE * GRAVITY) / GAS_CONSTANT; // kelvin per metre: 0.0342
  let tempK = SEA_LEVEL_K;
  let hPa = SEA_LEVEL_HPA;
  for (let i = 0; i < LAYERS.length; i++) {
    const [base, lapse] = LAYERS[i];
    const top = Math.min(h, LAYERS[i + 1]?.[0] ?? Infinity);
    if (top <= base) break;
    const next = tempK + lapse * (top - base);
    hPa *= lapse === 0 ? Math.exp((-fall * (top - base)) / tempK) : Math.pow(next / tempK, -fall / lapse);
    tempK = next;
  }
  return { tempK, hPa };
}

export const pressureAtHpa = (heightM) => standardAir(heightM).hPa;

/** The mass of air above each square metre at a height, in kilograms: the pressure is its weight. */
export const airAboveKgPerM2 = (heightM) => (pressureAtHpa(heightM) * 100) / GRAVITY;

/** The typical speed of an air molecule at a temperature, in metres per second. */
export function molecularSpeedMS(tempK = SEA_LEVEL_K) {
  return Math.sqrt((3 * GAS_CONSTANT * tempK) / AIR_KG_PER_MOLE);
}

/**
 * The pressure at a height in a sealed container with no gravity. With nothing
 * pulling the gas down it spreads evenly, so the answer is the same at every height.
 */
export const sealedPressureHpa = () => SEA_LEVEL_HPA;
