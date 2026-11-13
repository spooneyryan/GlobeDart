export default {
  id: 'phases',
  group: 'moon',
  label: 'Moon phases',
  title: 'Why does everyone see the same phase?',
  claim: 'The moon is a small light circling above the flat earth, at about the height of the sun.',
  ask: 'At full moon, where does the sun have to be for you to see the whole face lit? Can it be there on the flat model?',
  check: 'Ring someone in another country tonight and compare the shape of the moon. It is the same for both of you.',
  tool: 'sky',
  pair: 'sky',
  apply({ state, setObserver, nextFullMoon, cityUnderMoon, MOON_DEMO }) {
    state.date = nextFullMoon(state.date);
    Object.assign(state, MOON_DEMO);
    setObserver(cityUnderMoon(state.date), true);
  },
  body(c, { state, km, percent, MOON_OFF }) {
    const m = c.moon;
    if (!m) return MOON_OFF;
    const seen = m.cities.filter((x) => x.obs.el > 0);
    const lits = seen.map((x) => x.litFlat);
    return `
    <p>The moon is a ball, lit on the side that faces the sun. How much of the lit side you see depends on one
    thing: the angle at the moon between the sun and you.</p>
    <p>Right now <b class="m">${percent(m.lit.measured)}</b> of its face is lit, and that is what everyone on the
    night side of the Earth sees. On the globe the sun is 400 times further away than the moon, so the whole Earth
    looks at the moon from almost the same direction: <b class="g">${percent(m.lit.globe)}</b>, for everybody.</p>
    <p>On the flat model the sun and the moon are both about ${km(state.moonHeightKm)} up, and you look up at the
    moon from underneath while the sun lights it from the side. Here that gives <b class="f">${percent(m.lit.flat)}</b>.
    Across the ${seen.length} cities that can see it, anything from <b class="f">${percent(Math.min(...lits))}</b> to
    <b class="f">${percent(Math.max(...lits))}</b>, all at the same moment.</p>
    <p class="try">Try: the round insets show the moon as each model lights it. Move the observer, or press Play
    and watch a month go by. If the moon made its own light instead, the flat model would have no account of
    phases at all.</p>`;
  },
};
