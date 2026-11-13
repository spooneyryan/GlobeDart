export default {
  id: 'sameface',
  group: 'moon',
  label: 'Same face of the moon',
  title: 'Everyone sees the same face of the moon',
  claim: 'The moon is close: a few thousand kilometres above the flat earth.',
  ask: 'If the moon were 5,000 km up, would someone 8,000 km away from you be looking at the same side of it as you?',
  check: 'Compare photographs of the moon taken on the same night from different continents. The same markings face the camera in all of them.',
  tool: 'sky',
  pair: 'outside',
  apply({ state, setObserver, nextFullMoon, cityUnderMoon, MOON_DEMO }) {
    state.date = nextFullMoon(state.date);
    Object.assign(state, MOON_DEMO, { sightLines: true });
    setObserver(cityUnderMoon(state.date), true);
  },
  body(c, { state, deg, km, MOON_OFF }) {
    const m = c.moon;
    if (!m) return MOON_OFF;
    const seen = m.cities.filter((x) => x.obs.el > 0);
    const far = seen.reduce((a, b) => (b.turnFlat > a.turnFlat ? b : a), seen[0]);
    if (!far) return '<p>The moon is not up in any of the cities at this moment. Press "Next full moon".</p>';
    return `
    <p>The moon always shows the Earth the same markings. Photographs taken on one night from different continents
    show the same face, never the side or the back.</p>
    <p>On the globe that is no surprise. The Earth is 12,742 km across and the moon is ${km(m.point.distKm)} away,
    so the views of two people at opposite ends of the Earth differ by under 2°. From ${far.name} the view is
    turned <b class="g">${deg(far.turnGlobe, 1)}</b> from yours.</p>
    <p>On the flat model the moon is ${km(state.moonHeightKm)} up and people look at it from thousands of
    kilometres apart, so they would see quite different sides of it. From ${far.name} the view would be turned
    <b class="f">${deg(far.turnFlat, 0)}</b> from yours.</p>
    <p>The moon does look upside down from the southern hemisphere. That is the same face turned over, because
    the person looking is standing the other way up. It is not a different side.</p>
    <p class="try">Try: the teal lines are the directions people measure to the moon. On the flat map they come
    at it from all sides. The last column of the table lists how far each city's view would be turned.</p>`;
  },
};
