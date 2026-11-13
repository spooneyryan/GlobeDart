export default {
  id: 'eclipse',
  group: 'moon',
  label: 'Lunar eclipse',
  title: 'What darkens the moon in an eclipse?',
  claim: 'Eclipses of the moon are caused by an unseen "shadow object", not by the Earth.',
  ask: "For the Earth's shadow to fall on the moon, where must the Earth be? Where is it on the flat model?",
  check: "Watch the next eclipse of the moon. The edge of the shadow is always part of a circle, nearly three times the moon's width.",
  tool: 'sky',
  pair: 'sky',
  apply({ state, setObserver, nextLunarEclipse, cityUnderMoon, MOON_DEMO }) {
    state.date = nextLunarEclipse(state.date, true).peak;
    Object.assign(state, MOON_DEMO);
    setObserver(cityUnderMoon(state.date), true);
  },
  body(c, { state, deg, km, MOON_OFF }) {
    const m = c.moon;
    if (!m) return MOON_OFF;
    const s = m.shadow;
    const inShadow = s.kind !== 'none';
    return `
    <p>${
      inShadow
        ? `This is the middle of a ${m.published === 'none' ? s.kind : m.published} eclipse of the moon.`
        : 'There is no eclipse at this moment. Press "Next eclipse" in the Moon panel to go to one.'
    }</p>
    <p>On the globe the Earth casts a shadow straight away from the sun. Out at the moon's distance that shadow is
    <b class="g">${km(s.shadowKm * 2)}</b> across, a disc ${(s.shadowDeg / s.moonDeg).toFixed(1)} times as wide as the
    moon. Right now the moon is <b class="g">${deg(s.offDeg, 2)}</b> from the middle of it, and the shadow reaches
    ${deg(s.shadowDeg, 2)} from the middle: ${
      s.kind === 'total' ? 'the whole moon is inside' : s.kind === 'partial' ? 'part of the moon is inside' : 'the moon is outside'
    }.</p>
    <p>That one sum, tried on every full moon from 2020 to 2035, picks out exactly the partial and total eclipses
    published for those years, and no others. Eclipses are worked out centuries ahead this way.</p>
    <p>On the flat model the sun and the moon are both above the surface, ${km(state.sunHeightKm)} and
    ${km(state.moonHeightKm)} up. The Earth is never between them, so its shadow can never reach the moon. The
    model needs something extra and unseen to do the job, the right size, in the right place, every time.</p>
    <p class="try">Try: the round inset on the globe side shows the shadow on the moon. Step the time back an
    hour and forward again to watch it cross.</p>`;
  },
};
