// Well-known long views across water, for the "Over the horizon" tool.
//
// Every figure here has a source, listed with it, because a preset is only
// worth having if a sceptical reader can check it. Nothing is rounded to make
// a result come out: the distance is worked out from the two positions, and
// the heights the tool uses are worked out from the elevations given.
//
// Elevations are in metres above sea level:
//   waterM   the surface of the water the line of sight crosses
//   from.groundM  the ground (or deck) the observer stands on
//   to.baseM      the foot of the target
//   to.heightM    how tall the target is, from its foot to the point named in `to.top`
//
// `statedKm` is a distance somebody else has published for the same view. The
// checks fail if the distance worked out from the positions is more than 3%
// (or 1.5 km) away from it. It is left out where the only published figure is
// too loose to test against, and the comment on that view says so.
//
// Where the figures were read: see docs/views.md, which also lists the views
// that were looked into and left out.
import { globeDistanceKm } from './distances.js';

/** How far above the ground a standing person's eye is taken to be. */
export const STANDING_EYE_M = 1.7;

// The long-term average levels of the two lakes, 1918 to 2025, on the Great
// Lakes datum (IGLD 1985). The lakes rise and fall about half a metre either
// side of these over the years, which changes nothing that shows here.
const LAKE_MICHIGAN_M = 176.45;
const LAKE_ONTARIO_M = 74.77;

const LAKE_MICHIGAN_SOURCE = {
  label: 'Lake Michigan level (Canadian Hydrographic Service)',
  url: 'https://tides.gc.ca/en/historical-monthly-mean-water-levels-coordinated-network-lake-michiganhuron',
};
const usgs = (lat, lon) => ({
  label: 'ground height there (US Geological Survey)',
  url: `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&units=Meters&wkid=4326`,
});

const WILLIS_TOWER = {
  name: 'The Willis Tower',
  lat: 41.8789,
  lon: -87.6358,
  baseM: 180.9,
  heightM: 442.1, // the architectural height; the antennas reach 527 m
  top: 'the roof',
};
const WILLIS_SOURCES = [
  { label: 'tower height (Council on Tall Buildings)', url: 'https://www.skyscrapercenter.com/building/willis-tower/169' },
  { label: 'tower position', url: 'https://en.wikipedia.org/wiki/Willis_Tower' },
  usgs(41.8789, -87.6358),
];

const CANIGOU = {
  name: 'The Pic du Canigou',
  lat: 42.51889,
  lon: 2.45667,
  baseM: 0, // a mountain has no foot to measure from: its height is the summit above the sea
  heightM: 2784.7,
  top: 'the summit',
};
const CANIGOU_SOURCES = [
  { label: 'the Canigou', url:'https://en.wikipedia.org/wiki/Canigou' },
  { label: 'The Connexion, 2024', url: 'https://www.connexionfrance.com/practical/photos-see-the-pyrenees-from-marseille/635172' },
];

export const VIEWS = [
  {
    id: 'chicago-warren-dunes',
    name: 'Chicago from Warren Dunes, Michigan',
    shape: 'building',
    note:
      'The position is the one listed for the park, on a dune 63 m above the lake. From the beach below, set your eye to 2 m and far more is hidden. ' +
      'On evenings when cold lake air bends light more than usual, more of the skyline shows: raise the bending to see it.',
    waterM: LAKE_MICHIGAN_M,
    from: { name: 'the top of the dunes at Warren Dunes State Park', lat: 41.90528, lon: -86.59944, groundM: 239.4 },
    to: WILLIS_TOWER,
    statedKm: 85.3, // "about 53 miles", ABC57
    sources: [
      { label: 'viewpoint', url: 'https://en.wikipedia.org/wiki/Warren_Dunes_State_Park' },
      usgs(41.90528, -86.59944),
      ...WILLIS_SOURCES.slice(0, 2),
      LAKE_MICHIGAN_SOURCE,
      { label: 'ABC57 News, 2016', url: 'https://www.abc57.com/news/skyline-skepticism-the-lake-michigan-mirage' },
    ],
  },
  {
    id: 'chicago-grand-mere',
    name: 'Chicago from Grand Mere, Michigan',
    shape: 'building',
    note:
      'A photograph of the skyline taken from this park in April 2015 was reported as a mirage. In standard air the globe hides the tower past its roof, leaving only the antennas. ' +
      'It shows when cold lake air bends light more than usual: raise the bending to see how much that takes.',
    waterM: LAKE_MICHIGAN_M,
    // The news report says "almost 60 miles". That is too loose to test against: the positions give 57.
    from: { name: 'the shore at Grand Mere State Park', lat: 42.00806, lon: -86.54417, groundM: 177.1 },
    to: WILLIS_TOWER,
    sources: [
      { label: 'viewpoint', url: 'https://en.wikipedia.org/wiki/Grand_Mere_State_Park' },
      usgs(42.00806, -86.54417),
      ...WILLIS_SOURCES.slice(0, 2),
      LAKE_MICHIGAN_SOURCE,
      { label: 'ABC57 News, 2015', url: 'https://www.abc57.com/news/mirage-of-chicago-skyline-seen-from-michigan-shoreline' },
    ],
  },
  {
    id: 'toronto-fort-niagara',
    name: 'Toronto from Fort Niagara, New York',
    shape: 'building',
    note:
      'From here the tops of the tower and the skyscrapers show across Lake Ontario, and the Canadian shore does not. ' +
      'The distance is often rounded to 30 miles; the two positions give 31.',
    waterM: LAKE_ONTARIO_M,
    // Published as "30 mi (48 km)", a round figure to the city rather than the tower, so it is not tested against.
    from: { name: 'the bluff at Fort Niagara State Park', lat: 43.262, lon: -79.055, groundM: 85.6 },
    to: { name: 'The CN Tower', lat: 43.642556, lon: -79.387083, baseM: 83.0, heightM: 553.33, top: 'the tip of its antenna' },
    sources: [
      { label: 'viewpoint and what is seen', url: 'https://en.wikipedia.org/wiki/Fort_Niagara_State_Park' },
      usgs(43.262, -79.055),
      { label: 'tower height (CN Tower)', url: 'https://www.cntower.ca/explore-the-tower' },
      { label: 'tower position', url: 'https://en.wikipedia.org/wiki/CN_Tower' },
      { label: 'ground height at the tower (Natural Resources Canada)', url: 'https://geogratis.gc.ca/services/elevation/cdem/altitude?lat=43.642556&lon=-79.387083' },
      { label: 'Lake Ontario level (Canadian Hydrographic Service)', url: 'https://tides.gc.ca/en/historical-monthly-mean-water-levels-coordinated-network-lake-ontario' },
    ],
  },
  {
    id: 'canigou-marseille',
    name: 'The Pyrenees from Marseille',
    shape: 'mountain',
    note:
      'Seen across the sea on a few evenings a year, as a silhouette against the setting sun. It was first recorded from this hill in 1808. ' +
      'Over a line this long, through air this high, the standard bending is only a guide.',
    waterM: 0,
    // The hill is 149 m and the crypt 162 m (Wikipedia). 160 m for the terrace is Alain Origné's figure.
    from: { name: 'the terrace of Notre-Dame de la Garde, Marseille', lat: 43.2841, lon: 5.371, groundM: 160 },
    to: CANIGOU,
    statedKm: 252.7,
    sources: [
      { label: 'viewpoint', url: 'https://en.wikipedia.org/wiki/Notre-Dame_de_la_Garde' },
      { label: "Alain Origné's list of viewpoints", url: 'http://canigou.allauch.free.fr/Sites.htm' },
      ...CANIGOU_SOURCES,
    ],
  },
  {
    id: 'canigou-allauch',
    name: 'The Pyrenees from Allauch, near Marseille',
    shape: 'mountain',
    note:
      'Alain Origné has photographed the peak from here since 2005. On 1 November 2005 he found that nothing below about 2,450 m showed above the horizon. ' +
      'Compare that with what each model hides.',
    waterM: 0,
    from: { name: 'the chapel above Allauch', lat: 43.33667, lon: 5.48639, groundM: 310 },
    to: CANIGOU,
    statedKm: 263.5,
    /** The lowest part of the mountain seen from here on 1 November 2005, in metres above the sea. */
    lowestSeenM: 2450,
    sources: [
      { label: "Alain Origné's list of viewpoints", url: 'http://canigou.allauch.free.fr/Sites.htm' },
      { label: 'his account of the 2005 photographs', url: 'http://canigou.allauch.free.fr/Presentation.htm' },
      ...CANIGOU_SOURCES,
    ],
  },
];

/** The numbers the horizon tool needs for a view, worked out from its sourced figures. */
export function viewSizes(view) {
  return {
    distanceKm: globeDistanceKm(view.from, view.to),
    eyeM: view.from.groundM - view.waterM + STANDING_EYE_M,
    targetM: view.to.baseM - view.waterM + view.to.heightM,
  };
}

export const viewById = (id) => VIEWS.find((v) => v.id === id) ?? null;
