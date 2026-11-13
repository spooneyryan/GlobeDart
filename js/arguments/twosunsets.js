import { subsolarPoint } from '../astro.js';
import { K_STANDARD, dipDeg, sunSinkDegPerHour, secondSunsetSeconds } from '../horizon.js';

export default {
  id: 'twosunsets',
  group: 'horizon',
  label: 'Two sunsets',
  title: 'Can you watch the sun set twice?',
  claim: 'Sunset is the sun shrinking into the distance, not the Earth turning away from it.',
  ask: 'If you watch the sun set lying on a beach and then jump to your feet, will you see it set a second time?',
  check: 'Do it: lie down, start a stopwatch as the last of the sun goes, stand up, and stop it when the sun goes again.',
  tool: 'horizon',
  pair: 'outside',
  apply({ state, nearKm }) {
    Object.assign(state, { shape: 'ship', targetM: 50, eyeM: 1.7, k: K_STANDARD, layers: false, sailing: false });
    Object.assign(state, { sunsetLowM: 0.2, sunsetHighM: 1.7, sunsetSeconds: null });
    state.targetKm = nearKm() * 3;
  },
  body(hz, { state, deg, fmtH, fmtTime }) {
    const sunLat = subsolarPoint(state.date).lat;
    const rate = sunSinkDegPerHour(state.lat, sunLat);
    const low = state.sunsetLowM;
    const high = state.sunsetHighM;
    if (rate === null) {
      return `<p>At this latitude the sun does not set on this date. Change the latitude under "Two sunsets" in the
      results to try the experiment somewhere it does.</p>`;
    }
    const wait = secondSunsetSeconds(low, high, state.lat, sunLat, hz.k);
    const tower = secondSunsetSeconds(2, 555, state.lat, sunLat, hz.k);
    return `
    <p>On a globe the horizon sits a little below eye level, and drops further as you rise. With your eye
    ${fmtH(low)} up it is <b class="g">${deg(dipDeg(low, hz.k), 3)}</b> below level. At ${fmtH(high)} it is
    <b class="g">${deg(dipDeg(high, hz.k), 3)}</b> below.</p>
    <p>So when the sun has just gone for someone lying down, it is still above the horizon of someone standing.
    The sun sinks ${deg(rate / 60, 2)} a minute here today, which means it sets a second time
    <b class="g">${Math.round(wait)} seconds</b> later. From the top of a tower 555 m high it would set
    ${fmtTime(tower / 60)} after it did on the ground.</p>
    <p>On the flat model the horizon is at eye level from any height. Standing up changes nothing, and there is
    no second sunset. Neither is there a first: the flat sun never reaches the horizon at all.</p>
    <p class="try">Try it for real, then enter your timing under "Two sunsets" in the results. It works out the
    size of the Earth from your stopwatch.</p>`;
  },
  checks({ check, near }) {
    check('two sunsets argument: at the equator on an equinox the sun sinks 15 degrees an hour', near(sunSinkDegPerHour(0, 0), 15, 1e-9));
    check('two sunsets argument: lying down then standing gives about 6 seconds there', near(secondSunsetSeconds(0.2, 1.7, 0, 0, K_STANDARD), 6.0, 0.2));
    check('two sunsets argument: from a 555 m tower at latitude 25 it is about three minutes', near(secondSunsetSeconds(2, 555, 25.2, 0, K_STANDARD) / 60, 2.9, 0.15));
    check('two sunsets argument: where the sun does not set there is no answer', sunSinkDegPerHour(80, 23) === null && secondSunsetSeconds(0.2, 1.7, 80, 23) === null);
  },
};
