export default {
  id: 'sunrise',
  group: 'sun',
  label: 'Sunrise direction',
  title: 'Which way is sunrise?',
  claim: 'The sun circles above the flat earth. Sunrise is just the sun coming near enough to see.',
  ask: "On the flat map, where is the sun at sunrise on the equator? Which way would you have to face to see it?",
  check: "On an equinox, take a compass bearing to the rising sun. It is due east from anywhere on Earth.",
  tool: 'sky',
  pair: 'sky',
  apply({ state, city, setObserver, sunEvents, seasons, SUN_DEMO }) {
    setObserver(city('Quito'), true);
    const equinox = seasons(state.date.getUTCFullYear()).sepEquinox;
    const ev = sunEvents(equinox, state.lat, state.lon);
    state.date = ev.rise ? new Date(ev.rise.getTime() + 150000) : equinox;
    Object.assign(state, SUN_DEMO);
  },
  body: (c, { deg, bearing }) => `
    <p>It is the September equinox and the sun is coming up in Quito, on the equator. Measured bearing:
    <b class="m">${bearing(c.obs.az)}</b>. On this date the sun rises due east for everyone on Earth.</p>
    <p>On the flat map the sun is a quarter-circle away around the equator ring, which puts it at
    <b class="f">${bearing(c.flat.az)}</b> and <b class="f">${deg(c.flat.el)}</b> up. A compass at dawn is
    enough to tell the two models apart.</p>
    <p class="try">Try: pick any other place and press Sunrise. The measured bearing stays near 90°.</p>`,
};
