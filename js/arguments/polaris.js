export default {
  id: 'polaris',
  group: 'stars',
  label: 'Pole star',
  title: 'The pole star: one star, many latitudes',
  claim: 'Polaris sinks as you travel south because of perspective, not because the ground curves.',
  ask: "If Polaris sinks only because of perspective, should it ever drop below the horizon altogether?",
  check: "Measure the height of Polaris with a protractor and a weighted string. It matches your latitude.",
  tool: 'sky',
  pair: 'outside',
  apply({ state, city, setObserver, goToMidnight, STAR_DEMO }) {
    setObserver(city('London'), true);
    goToMidnight();
    Object.assign(state, STAR_DEMO, { star: 'Polaris' });
  },
  body(c, { state, deg, km, REF_CITIES, STARS_OFF }) {
    if (!c.stars) return STARS_OFF;
    const i = c.stars.selected;
    const south = c.stars.cities.filter((x) => x.obs.el < 0);
    const heights = c.stars.cities.map((x) => x.implied).filter((h) => h !== null);
    return `
    <p>${c.stars.name} is measured <b class="m">${deg(c.stars.measured[i].el)}</b> above the horizon here, at
    latitude ${deg(Math.abs(state.lat))}. Anywhere in the north, its height is your latitude to within a degree.
    That is how sailors found their latitude for centuries.</p>
    <p>The teal lines are the directions people in ${REF_CITIES.length} cities measure to it right now. On the globe
    they are parallel. On the flat map they would put the star anywhere from
    <b class="f">${heights.length ? `${km(Math.min(...heights))} to ${km(Math.max(...heights))}` : 'nowhere'}</b> up.</p>
    <p>From ${south.length} of those cities it cannot be seen at all, because the ground is in the way. On a flat
    earth nothing is in the way: in ${south[0]?.name ?? 'the south'} it would stand
    <b class="f">${deg(south[0]?.flat.el ?? 0)}</b> up in plain view.</p>
    <p class="try">Try: move the observer south, or change the height of the flat model's stars. Then pick
    "Southern stars".</p>`;
  },
};
