import { EARTH_RADIUS_KM, DEG } from '../astro.js';
import { flatPoleDistanceKm } from '../models.js';

/** Once round a line of latitude, on each model, in km. */
export const roundGlobeKm = (lat) => 2 * Math.PI * EARTH_RADIUS_KM * Math.cos(lat * DEG);
export const roundFlatKm = (lat) => 2 * Math.PI * flatPoleDistanceKm(lat);

// Lines of latitude to compare, in degrees south. The one chosen with the slider is added to them.
const SOUTH = [40, 50, 60, 70];

export default {
  id: 'icewall',
  group: 'travel',
  label: 'The ice wall',
  title: 'Is Antarctica a wall round the edge?',
  claim: 'Antarctica is not a continent. It is a wall of ice around the rim of the flat earth.',
  ask: 'If Antarctica ran round the edge of the flat map, how long would a voyage round it be? How long is it really?',
  check: 'Look up the logged distance of any voyage round Antarctica, or the route a flight takes between South America and Australia.',
  tool: 'sky',
  pair: 'outside',
  controls: [{ id: 'south', label: 'Sail round at', min: 10, max: 80, step: 1, value: 60, show: (v) => `${v}° south` }],
  apply({ state, focusRoute, SUN_DEMO }) {
    Object.assign(state, SUN_DEMO, { route: { from: 'Punta Arenas', to: 'Perth' } });
    focusRoute();
  },
  body(c, { km }, own) {
    const chosen = own.south;
    const rows = [...new Set([...SOUTH, chosen])]
      .sort((a, b) => a - b)
      .map((south) => {
        const globe = roundGlobeKm(-south);
        const flat = roundFlatKm(-south);
        const name = south === chosen ? `<b>${south}° south</b>` : `${south}° south`;
        return `<tr><td>${name}</td><td>${km(globe)}</td><td class="bad">${km(flat)}</td><td class="bad">${(flat / globe).toFixed(1)} times</td></tr>`;
      })
      .join('');
    const r = c.route;
    return `
    <p>The two models disagree most about the far south. On the globe the lines of latitude shrink toward the
    south pole. On the flat map they are the outermost and longest circles of all.</p>
    <table class="data"><thead><tr><th>Once round at</th><th class="globe">Globe</th><th class="flat">Flat</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>So a ship keeping to ${chosen}° south sails <b class="g">${km(roundGlobeKm(-chosen))}</b> to come back to
    where it started on the globe, and <b class="f">${km(roundFlatKm(-chosen))}</b> on the flat map. Ships' logs
    settle which.</p>
    ${
      r
        ? `<p>It changes which way is shortest, too. From ${r.a.name} to ${r.b.name} the globe's shortest path is
           <b class="g">${km(r.globeKm)}</b>, straight across Antarctica. The flat map's is <b class="f">${km(r.flatKm)}</b>,
           and it runs up past the north pole.</p>`
        : ''
    }
    <p>There is a research station at the south pole itself. On the flat map there is no such place: the south
    pole is the whole of the rim.</p>
    <p class="try">Try: drag "Sail round at" further south. Then orbit both views to follow the two lines, and
    pick "Southern flights" for a route with a real timetable.</p>`;
  },
  checks({ check, near }) {
    check('ice wall argument: once round at 60 degrees south is about 20,000 km on the globe', near(roundGlobeKm(-60), 20015, 5));
    check('ice wall argument: and about 104,800 km on the flat map, more than five times as far',
      near(roundFlatKm(-60), 104800, 100) && roundFlatKm(-60) / roundGlobeKm(-60) > 5);
    check("ice wall argument: even the flat map's equator is more than half as long again as the real one", near(roundFlatKm(0) / roundGlobeKm(0), Math.PI / 2, 1e-9));
  },
};
