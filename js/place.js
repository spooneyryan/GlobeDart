// What kind of country the observer is standing in, for the scenery under the
// observer's sky. It is a rough sorting by the map and by latitude, made so
// that the view looks like somewhere. Neither model is told about it, and
// nothing is worked out from it.

/** The kinds of scenery, in the order the ground's shader numbers them. */
export const SCENERY = ['field', 'tropics', 'desert', 'snow', 'sea'];

export const SCENERY_NAMES = {
  field: 'farmland',
  tropics: 'the tropics',
  desert: 'desert',
  snow: 'snow and ice',
  sea: 'the open sea',
};

// The great deserts, each as a box: [south, north, west, east].
const DESERTS = [
  [16, 33, -17, 36], // the Sahara
  [13, 33, 36, 60], // Arabia
  [33, 45, 50, 68], // the Karakum and Kyzylkum
  [25, 33, 60, 72], // Baluchistan and the Thar
  [36, 46, 76, 110], // the Taklamakan and the Gobi
  [-31, -19, 116, 145], // the middle of Australia
  [-29, -18, 12, 26], // the Namib and the Kalahari
  [23, 37, -117, -102], // the Sonoran, Mojave and Chihuahuan deserts
  [-28, -15, -76, -68], // the Atacama and the coast of Peru
];

const inBox = ([south, north, west, east], lat, lon) => lat >= south && lat <= north && lon >= west && lon <= east;

/** Whether a place is inside the land polygons of the map the app draws. */
export function onLand(land, lat, lon) {
  for (const polygon of land?.polygons ?? []) {
    let inside = false;
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

/**
 * The scenery for a place: one of SCENERY. The map is coarse, so a place counts
 * as land if anywhere within about 50 km of it is.
 */
export function sceneryAt(land, lat, lon) {
  const near = 0.45;
  const widen = near / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dry = [[0, 0], [near, 0], [-near, 0], [0, widen], [0, -widen]].some(([dLat, dLon]) => onLand(land, Math.max(-89.9, Math.min(89.9, lat + dLat)), lon + dLon));
  // Ice: Antarctica, the far north (sea ice included), and Greenland.
  const greenland = lat >= 59.7 && lon >= -74 && lon <= -17 && !(lat < 67 && lon > -26);
  if (lat <= -60 ? dry || lat <= -70 : lat >= 78 || (dry && (lat >= 70 || greenland))) return 'snow';
  if (!dry) return 'sea';
  if (DESERTS.some((box) => inBox(box, lat, lon))) return 'desert';
  if (Math.abs(lat) < 23.5) return 'tropics';
  return 'field';
}
