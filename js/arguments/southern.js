export default {
  id: 'southern',
  label: 'Southern stars',
  title: 'Southern stars: everyone looks south',
  claim: 'The stars turn in a single dome, centred above the north pole.',
  tool: 'sky',
  pair: 'sky',
  apply({ state, city, setObserver, goToMidnight, STAR_DEMO }) {
    setObserver(city('Sydney'), true);
    goToMidnight();
    Object.assign(state, STAR_DEMO, { star: 'Sigma Octantis' });
  },
  body(c, { bearing, STARS_OFF }) {
    if (!c.stars) return STARS_OFF;
    const rows = ['Sydney', 'Cape Town', 'Santiago']
      .map((name) => c.stars.cities.find((x) => x.name === name))
      .map((x) => `<tr><td>${x.name}</td><td>${bearing(x.obs.az)}</td>
        <td class="bad">${bearing(x.flat.az)}</td></tr>`)
      .join('');
    return `
    <p>${c.stars.name} is a faint star that sits almost exactly over the south pole. The southern sky turns around
    it: the trails in the globe's sky are circles centred due south.</p>
    <p>At this moment, three cities on three continents measure it in the same direction:</p>
    <table class="data"><thead><tr><th>City</th><th class="measured">Measured</th><th class="flat">Flat says</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p>On the flat map "south" means outwards, toward the rim, so these three are looking in three different
    directions. One star cannot be in all of them. And the flat model has one hub for the sky, above the north
    pole, so nothing in it can circle a point in the south.</p>
    <p class="try">Try: press Play and watch both skies, or pick Acrux, the foot of the Southern Cross.</p>`;
  },
};
