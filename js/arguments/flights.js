export default {
  id: 'flights',
  group: 'travel',
  label: 'Southern flights',
  title: 'Southern flights: how far is it really?',
  claim: 'The flat map shows the true distances between places.',
  ask: "How long should a non-stop flight from Sydney to Santiago take, if the flat map's distances are right?",
  check: "Look up the scheduled time of a southern non-stop flight, and divide each map's distance by it.",
  tool: 'sky',
  pair: 'outside',
  apply({ state, focusRoute, SUN_DEMO }) {
    Object.assign(state, SUN_DEMO, { route: { from: 'Sydney', to: 'Santiago' } });
    focusRoute();
  },
  body(c, { km, kmh, hoursMinutes, esc, SOUND_KMH }) {
    const r = c.route;
    if (!r || !r.preset) {
      return `<p>Pick one of the flights listed under "Distances and flight times" to see it drawn on both
      maps.</p>`;
    }
    return `
    <p>${esc(r.preset.flights)} fly ${r.preset.from} to ${r.preset.to} non-stop in about
    ${hoursMinutes(r.preset.there)}, and back in about ${hoursMinutes(r.preset.back)}.</p>
    <p>On the globe the two are <b class="g">${km(r.globeKm)}</b> apart, so the plane averages
    <b class="g">${kmh(r.globeKmh)}</b>: an ordinary airliner.</p>
    <p>On the flat map they are <b class="f">${km(r.flatKm)}</b> apart in a straight line. The same flight would
    have to average <b class="f">${kmh(r.flatKmh)}</b>${
      r.flatKmh > SOUND_KMH
        ? `, which is ${(r.flatKmh / SOUND_KMH).toFixed(1)} times the speed of sound. No airliner in service
           can do that.`
        : '. Here the two maps nearly agree, because the route runs mostly north and south.'
    }</p>
    <p class="try">Try: the other flights in the list on the right. The white line is the route really flown;
    the amber line is the shortest path the flat map allows.</p>`;
  },
};
