export default {
  id: 'december',
  label: 'December daylight',
  title: 'December: daylight where the flat sun cannot reach',
  claim: 'The sun is a spotlight that lights one patch of the flat earth at a time.',
  tool: 'sky',
  pair: 'outside',
  apply({ state, city, setObserver, sunEvents, seasons, SUN_DEMO }) {
    setObserver(city('McMurdo Station'), true);
    const solstice = seasons(state.date.getUTCFullYear()).decSolstice;
    const noon = sunEvents(solstice, state.lat, state.lon).noon ?? solstice;
    state.date = new Date(noon.getTime() + 12 * 3600000);
    Object.assign(state, SUN_DEMO, { flatLighting: 'observed' });
  },
  body: (c, { deg }) => `
    <p>It is midnight at McMurdo Station, Antarctica, on the December solstice, and the sun is
    <b class="m">${deg(c.obs.el)}</b> above the horizon. It stays up all day.</p>
    <p>The flat map is shaded with the places that are <em>really</em> in daylight right now. Night is a blob
    around the north pole and daylight wraps the entire rim. One spotlight circling the middle cannot light a
    ring all the way round the outside.</p>
    <p class="try">Try: switch "Flat map shading" to the model's spotlight and compare it with the orange
    line, then press Play.</p>`,
};
