import { SEA_LEVEL_HPA, ESCAPE_SPEED_M_S, standardAir, pressureAtHpa, airAboveKgPerM2, scaleHeightM, molecularSpeedMS, sealedPressureHpa } from '../atmosphere.js';

// Places to compare, with their heights above sea level in metres.
const PLACES = [
  ['Sea level', 0],
  ['Three floors up', 10],
  ['Denver', 1609],
  ['El Alto airport, Bolivia', 4062],
  ['The top of Everest', 8849],
  ['An airliner cruising', 11000],
  ['A weather balloon', 30000],
];

const hPa = (p) => `${p >= 100 ? Math.round(p).toLocaleString('en-US') : p >= 1 ? p.toFixed(1) : p.toPrecision(2)} hPa`;

export default {
  id: 'air',
  group: 'motion',
  label: 'Air without a container',
  title: 'Does the air need a container?',
  claim: 'Gas pressure cannot exist next to a vacuum without a container. So there must be a dome.',
  ask: 'If the air were held in by a lid, with nothing pulling it down, would it be any thinner at the top of a mountain?',
  check: 'Carry a phone with a barometer app up a tall building or a hill. The pressure falls by about 1.2 hPa for every 10 m you climb.',
  tool: 'flight',
  pair: 'outside',
  controls: [
    { id: 'km', label: 'Height above the sea', min: 0.01, max: 80, scale: 'log', value: 11, show: (v, { fmtH }) => fmtH(v * 1000) },
  ],
  apply({ state }) {
    Object.assign(state, { speedKmh: 900, altitudeM: 11000, flightMinutes: 10, flying: false });
  },
  body(fl, { fmtH }, own) {
    const heightM = own.km * 1000;
    const here = pressureAtHpa(heightM);
    const rows = [...PLACES.map(([name, m]) => [m > 0 ? `${name}, ${fmtH(m)}` : name, m]), [`<b>Your height, ${fmtH(heightM)}</b>`, heightM]]
      .sort((a, b) => a[1] - b[1])
      .map(
        ([name, m]) =>
          `<tr><td>${name}</td><td>${hPa(pressureAtHpa(m))}</td>
           <td class="bad">${hPa(sealedPressureHpa())}</td></tr>`,
      )
      .join('');
    const speed = molecularSpeedMS();
    return `
    <p>A gas does spread out to fill an empty space, when nothing else acts on it. Something does act on the air:
    its own weight. The air at any height is squeezed by the weight of all the air above it, and that squeeze is
    the pressure. At sea level there are <b class="g">${Math.round(airAboveKgPerM2(0)).toLocaleString('en-US')} kg</b>
    of air above every square metre.</p>
    <p>Climb, and there is less air above you, so the pressure is lower. It never meets a vacuum at an edge. It
    thins out, falling by about a third for every ${fmtH(Math.round(scaleHeightM() * Math.log(1.5) / 100) * 100)}
    climbed, and there is no height where it stops.</p>
    <p>A container with nothing pulling the gas down predicts something else: the same pressure at every height.
    This can be measured, and every aircraft altimeter is a barometer that relies on the answer.</p>
    <table class="data"><thead><tr><th>Where</th><th class="globe">Held down by gravity</th><th class="flat">Sealed in, no gravity</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>At ${fmtH(heightM)} the air is at <b class="g">${hPa(here)}</b>, ${((here / SEA_LEVEL_HPA) * 100).toPrecision(2)}% of
    what it is at the sea, and about ${Math.round(standardAir(heightM).tempK - 273.15)} °C. An airliner's cabin is
    a real container: it is pumped up because the air outside is too thin to breathe.</p>
    <p>What stops the air leaving is speed. An air molecule moves at about ${(speed / 1000).toFixed(1)} km a second.
    To leave the Earth for good it would need ${(ESCAPE_SPEED_M_S / 1000).toFixed(1)}, over twenty times more.
    The moon's pull is weaker, a molecule there needs only 2.4 km a second, and the moon has kept no air.</p>
    <p class="try">Try: drag "Height above the sea" and watch the pressure fall. Then check three floors of it
    yourself with a phone.</p>`;
  },
  checks({ check, near }) {
    check('air argument: the standard atmosphere is 1013.25 hPa at sea level and 226 hPa at 11 km', near(pressureAtHpa(0), 1013.25, 1e-9) && near(pressureAtHpa(11019), 226.3, 0.3), pressureAtHpa(11019).toFixed(2));
    check('air argument: and about 55 hPa at 20 km, 8.7 at 32 km and 1.1 at 47 km',
      near(pressureAtHpa(20063), 54.75, 0.1) && near(pressureAtHpa(32162), 8.68, 0.02) && near(pressureAtHpa(47350), 1.109, 0.005),
      [20063, 32162, 47350].map((m) => pressureAtHpa(m).toFixed(3)).join(', '));
    check('air argument: on top of Everest the air is about a third of what it is at the sea', near(pressureAtHpa(8849) / SEA_LEVEL_HPA, 0.31, 0.01), pressureAtHpa(8849).toFixed(1));
    check('air argument: climbing 10 m from the sea lowers the pressure by about 1.2 hPa', near(pressureAtHpa(0) - pressureAtHpa(10), 1.2, 0.02), (pressureAtHpa(0) - pressureAtHpa(10)).toFixed(3));
    check('air argument: about ten tonnes of air stand over every square metre at sea level', near(airAboveKgPerM2(0), 10332, 2));
    check('air argument: the pressure falls to 1/e in about 8.4 km, and is always lower higher up',
      near(scaleHeightM(), 8434, 5) && [0, 10, 1000, 11000, 20000, 47000, 71000].every((m, i, all) => i === 0 || pressureAtHpa(m) < pressureAtHpa(all[i - 1])));
    check('air argument: a small step in height changes the pressure by the weight of the air in that step',
      (() => {
        const air = standardAir(5000);
        const density = (air.hPa * 100 * 0.0289644) / (8.31446 * air.tempK);
        // Gravity is a little weaker 5 km up, which the standard allows for.
        const g = 9.80665 * (6356766 / (6356766 + 5000)) ** 2;
        return near((pressureAtHpa(5000) - pressureAtHpa(5001)) * 100, density * g, 0.001);
      })());
    check('air argument: an air molecule moves at about half a kilometre a second, a twentieth of what it takes to leave',
      near(molecularSpeedMS(), 498, 2) && ESCAPE_SPEED_M_S / molecularSpeedMS() > 20);
    check('air argument: a sealed container with no gravity has the same pressure at every height', sealedPressureHpa(0) === sealedPressureHpa(8849));
  },
};
