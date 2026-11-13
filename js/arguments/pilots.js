import { pitchRateDegPerMin, hoursRound, climbIfStraightM, schulerMinutes } from '../flight.js';

export default {
  id: 'pilots',
  group: 'motion',
  label: 'Pilots and the nose',
  title: 'Do pilots have to keep pushing the nose down?',
  claim: 'On a ball, pilots would have to keep dipping the nose to follow the curve. They never do.',
  ask: "How fast would a pilot have to push the nose down to follow the curve? Guess a number, in degrees a minute.",
  check: "Ask a pilot what keeps an aircraft level, or look up how an inertial navigation unit allows for the Earth's radius.",
  tool: 'flight',
  pair: 'outside',
  apply({ state }) {
    Object.assign(state, { speedKmh: 900, altitudeM: 11000, flightMinutes: 10, flying: true });
  },
  body: (fl, { fmtSpeed, fmtH, fmtAngle, fmtTime }) => `
    <p>An airliner at ${fmtSpeed(fl.speedKmh)} holds its height above a globe by going round it, once every
    <b class="g">${fmtTime(fl.hoursRound * 60)}</b>. Its nose comes down at the same rate:
    <b class="g">${fmtAngle(fl.rateDegPerMin)} a minute</b>. The minute hand of a clock turns ${Math.round(6 / fl.rateDegPerMin)}
    times faster.</p>
    <p>Nobody has to push. "Level" means square to the pull of gravity, and gravity points at the middle of the
    Earth, so level turns with the aircraft. Holding the height on the altimeter <em>is</em> the nose coming
    down.</p>
    <p>If the nose really were held still against the stars, the aircraft would be
    <b class="g">${fmtH(fl.climbM)}</b> higher after ${fmtTime(fl.minutes)}, and still climbing.</p>
    <p>So the cockpit feels the same on both models, and this argument cannot tell them apart. An instrument that
    senses turning against the stars can: see the table.</p>
    <p class="try">Try: the speed and the length of the stretch. The bottom drawings are to true scale, which is
    why the curve is so hard to see.</p>`,
  checks({ check, near }) {
    check('pilots argument: at 900 km/h the nose comes down about 0.13 degrees a minute', near(pitchRateDegPerMin(900), 0.135, 0.001));
    check('pilots argument: once round takes about 44.5 hours', near(hoursRound(900), 44.5, 0.1));
    check('pilots argument: the turn over one lap is 360 degrees', near(pitchRateDegPerMin(900, 11000) * hoursRound(900, 11000) * 60, 360, 1e-9));
    check('pilots argument: flying dead straight for 10 minutes gains about 1.76 km', near(climbIfStraightM(900, 10, 11000), 1762, 5));
    check('pilots argument: and about 17.6 m in the first minute', near(climbIfStraightM(900, 1, 11000), 17.6, 0.1));
    check('pilots argument: an inertial navigator is tuned to 84.4 minutes', near(schulerMinutes(), 84.4, 0.05));
  },
};
