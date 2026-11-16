export default {
  id: 'sunset',
  group: 'sun',
  label: 'Sunset',
  title: 'Why does the sun set at all?',
  claim: 'The sun never goes below the horizon. It moves away until perspective makes it vanish.',
  ask: "If the sun only moves away and never drops, how high above the horizon should it still be at the moment we call sunset?",
  check: "Watch a sunset over the sea through binoculars or a zoom lens. The sun goes down behind the horizon, bottom first, at full size.",
  tool: 'sky',
  pair: 'sky',
  apply({ state, city, setObserver, sunEvents, SUN_DEMO }) {
    setObserver(city('London'), true);
    const ev = sunEvents(state.date, state.lat, state.lon);
    if (ev.set) state.date = new Date(ev.set.getTime() - 150000);
    Object.assign(state, SUN_DEMO);
  },
  body(c, { state, deg, km }) {
    // The height at which this model's light gives out: the sun seen from the edge of the patch it lights.
    const fadesAt = Math.atan2(state.sunHeightKm, state.lightRangeKm) * (180 / Math.PI);
    const bent = state.flatLight === 'bent';
    const reach = bent
      ? `<p>The flat model is set to its other account, light that curves upward, which does give it a sunset. The
        "i" beside "Its light travels" says what that costs it.</p>`
      : `<p>The flat model's own account of night is that its sun's light reaches only so far: here,
        ${km(state.lightRangeKm)}. ${
          c.flat.lit
            ? 'This place is still inside that, so the model has full daylight here.'
            : 'This place is now outside that, so the model does have it dark here. Its sky is drawn dark, with its sun a dull disc.'
        } But by that account night falls with the sun still <b class="f">${deg(fadesAt)}</b> up, going dim in the
        middle of the sky. What is seen is a sun at full size and full brightness going down behind the horizon,
        bottom edge first.</p>`;
    // What height would put the flat sun where each city measures it.
    const here = c.obs.el > 0 ? c.flat.groundKm * Math.tan((c.obs.el * Math.PI) / 180) : null;
    const elsewhere = (x) => Math.abs(x.lat - state.lat) > 0.05 || Math.abs(x.lon - state.lon) > 0.05;
    const others = c.cities.filter((x) => elsewhere(x) && x.obs.el > 0 && x.implied !== null).map((x) => x.implied);
    const oneHeight =
      here !== null && others.length > 1
        ? `<p>A low enough sun would sit on this horizon: about <b class="f">${km(here)}</b> up, which is lower than
          airliners fly. At the same moment the other cities with the sun in their sky need it anywhere from
          <b class="f">${km(Math.min(...others))} to ${km(Math.max(...others))}</b> up ("Observers, right now"). No
          one height serves them all.</p>`
        : '';
    return `
    <p>The sun is sinking into the horizon in London: measured elevation <b class="m">${deg(c.obs.el)}</b>,
    bottom edge already hidden.</p>
    <p>A sun ${km(state.sunHeightKm)} above a flat plane is still <b class="f">${deg(c.flat.el)}</b> up at this
    moment, and has shrunk to <b class="f">${Math.round((c.flat.sizeDeg / c.obs.sizeDeg) * 100)}%</b> of its
    noon width. With light in straight lines it cannot reach the horizon from here, let alone go below it.</p>
    ${reach}
    <p>"Refraction" is the usual reply. ${
      c.obs.lift > 0
        ? `The air here lifts the real sun by <b class="m">${deg(c.obs.lift, 2)}</b>`
        : 'With the air switched on, it lifts the real sun by about 0.6°'
    }. To hide the flat sun it would have to push it <b class="f">${deg(Math.max(0, c.flat.trueEl - c.obs.el))}</b>
    the other way.</p>
    ${oneHeight}
    <p class="try">Try: drag the sun-height slider and watch "Observers, right now". Then set "Its light travels"
    to the curving kind, the version in which the flat sun can set. Press Play and watch the two round insets.</p>`;
  },
};
