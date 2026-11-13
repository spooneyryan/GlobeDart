export default {
  id: 'angles',
  group: 'sun',
  label: 'Sun angles from many cities',
  title: 'Where is the sun? Ask many cities at once',
  claim: 'The sun is small and close, a few thousand kilometres up, circling above a flat earth.',
  ask: "If the sun is a few thousand kilometres up, people in different cities should all work out the same height for it. Do they?",
  check: "Measure a stick's shadow at an agreed moment with friends in other cities, and work out the sun's height from each.",
  tool: 'sky',
  pair: 'outside',
  apply({ state, city, setObserver, isoDay, SUN_DEMO }) {
    setObserver(city('Cairo'), true);
    state.date = new Date(Date.parse(`${isoDay(state.date)}T11:00:00Z`));
    Object.assign(state, SUN_DEMO, { sightLines: true });
  },
  body(c, { km }) {
    const heights = c.cities.map((x) => x.implied).filter((h) => h !== null);
    const range = heights.length ? `${km(Math.min(...heights))} to ${km(Math.max(...heights))}` : 'nothing consistent';
    return `
    <p>Each teal line starts at a city and points to where people there measure the sun <em>right now</em>.</p>
    <p>On the globe the lines are parallel, exactly as they must be for a source 150 million km away.</p>
    <p>Draw the same measured angles on the flat map and they cross at heights from <b class="f">${range}</b>.
    There is no single place the sun could be.</p>
    <p class="try">Try: orbit the flat map to look along the lines, then compare the last column of the table
    below.</p>`;
  },
};
