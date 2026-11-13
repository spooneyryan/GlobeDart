export default {
  id: 'sunset',
  label: 'Sunset',
  title: 'Why does the sun set at all?',
  claim: 'The sun never goes below the horizon. It moves away until perspective makes it vanish.',
  tool: 'sky',
  pair: 'sky',
  apply({ state, city, setObserver, sunEvents, SUN_DEMO }) {
    setObserver(city('London'), true);
    const ev = sunEvents(state.date, state.lat, state.lon);
    if (ev.set) state.date = new Date(ev.set.getTime() - 150000);
    Object.assign(state, SUN_DEMO);
  },
  body: (c, { state, deg, km }) => `
    <p>The sun is sinking into the horizon in London: measured elevation <b class="m">${deg(c.obs.el)}</b>,
    bottom edge already hidden.</p>
    <p>A sun ${km(state.sunHeightKm)} above a flat plane is still <b class="f">${deg(c.flat.el)}</b> up at this
    moment, and has shrunk to <b class="f">${Math.round((c.flat.sizeDeg / c.obs.sizeDeg) * 100)}%</b> of its
    noon width. It can never reach the horizon, let alone go below it.</p>
    <p>"Refraction" is the usual reply. ${
      c.obs.lift > 0
        ? `The air here lifts the real sun by <b class="m">${deg(c.obs.lift, 2)}</b>`
        : 'With the air switched on, it lifts the real sun by about 0.6°'
    }. To hide the flat sun it would have to push it <b class="f">${deg(Math.max(0, c.flat.trueEl - c.obs.el))}</b>
    the other way.</p>
    <p class="try">Try: drag the sun-height slider. No height puts the flat sun on the horizon. Press Play and
    watch the two round insets.</p>`,
};
