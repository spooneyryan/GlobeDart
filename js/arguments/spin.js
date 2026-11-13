import { TURN_DEG_PER_HOUR, groundSpeedKmh, weightLost, pendulumDegPerHour } from '../rotation.js';

export default {
  id: 'spin',
  group: 'motion',
  label: 'Feeling the spin',
  title: 'Would we feel the Earth spin?',
  claim: 'If the Earth spun at a thousand miles an hour we would feel it, and be flung off.',
  ask: 'In an airliner at 900 km/h, what do you feel? Is it speed that people feel, or a change of speed?',
  check: 'Visit a Foucault pendulum, or look one up. The floor turns under it at a rate set by its latitude.',
  tool: 'sky',
  pair: 'sky',
  apply({ state, city, setObserver, goToMidnight, STAR_DEMO }) {
    setObserver(city('London'), true);
    goToMidnight();
    Object.assign(state, STAR_DEMO, { star: 'Polaris', sightLines: false });
  },
  body(c, { state, deg, kmh }) {
    const lat = state.lat;
    const lost = weightLost(lat);
    const swing = pendulumDegPerHour(lat);
    return `
    <p>The sky turns once a day: ${deg(TURN_DEG_PER_HOUR, 1)} an hour, which the star trails show. Either
    everything in the heavens circles us every day, or we turn.</p>
    <p>If we turn, the ground here moves at <b class="g">${kmh(groundSpeedKmh(lat))}</b>. But speed cannot be
    felt: in an airliner at 900 km/h a drink sits still on the tray. What is felt is a <em>change</em> of speed or
    direction, and this turn is slow. It is half the rate of a clock's hour hand.</p>
    <p>The turn does throw you outward, a little. At this latitude it takes <b class="g">${(lost * 100).toFixed(2)}%</b>
    off your weight, ${Math.round(lost * 70000)} g for a 70 kg person. At the equator gravity is
    ${Math.round(1 / weightLost(0))} times stronger than the turn.</p>
    <p>And it can be measured. A long pendulum keeps its line of swing while the floor turns under it. Here the
    line would turn <b class="g">${deg(Math.abs(swing), 1)} an hour</b>${
      Math.abs(swing) > 0.05 ? `, once round in ${(360 / Math.abs(swing)).toFixed(1)} hours` : ''
    }${swing < 0 ? ', and the opposite way to the north' : ''}. The rate is nothing at the equator and
    ${deg(TURN_DEG_PER_HOUR, 1)} an hour at the poles, exactly as a turning globe needs. On a still, flat earth
    there is no reason for it to turn at all.</p>
    <p class="try">Try: move the observer to the equator, then to the far south, and watch the numbers and the
    star trails change.</p>`;
  },
  checks({ check, near }) {
    check('spin argument: the ground at the equator moves at about 1,670 km/h', near(groundSpeedKmh(0), 1672, 3));
    check('spin argument: and at 60 degrees, half that', near(groundSpeedKmh(60) / groundSpeedKmh(0), 0.5, 1e-9));
    check('spin argument: the turn takes about a third of one percent off your weight at the equator, nothing at the poles',
      near(weightLost(0), 0.00345, 0.00002) && weightLost(90) < 1e-12);
    check("spin argument: a pendulum in Paris turns about 11.3 degrees an hour, once round in about 32 hours",
      near(pendulumDegPerHour(48.85), 11.3, 0.05) && near(360 / pendulumDegPerHour(48.85), 31.8, 0.2));
    check('spin argument: it does not turn at the equator, and turns the other way in the south',
      near(pendulumDegPerHour(0), 0, 1e-12) && pendulumDegPerHour(-30) < 0);
  },
};
