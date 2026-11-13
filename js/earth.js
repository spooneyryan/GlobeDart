// Getting a view out of GlobeDart and into Google Earth: a link that opens
// Google Earth at a place, and a KML file that carries places and a route.
//
// Google Earth is itself a globe, so nothing here is evidence for one model
// over the other. It is a way to look at the real ground.

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const xml = (text) => String(text).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
const coord = (n) => Number(n.toFixed(5));

/**
 * A link that opens Google Earth in a browser, looking straight down at a place
 * from `rangeKm` away. Google publishes no specification for these links; this
 * is the form Google Earth puts in its own address bar.
 */
export function earthUrl(lat, lon, rangeKm = 1000) {
  const range = Math.round(Math.min(60000, Math.max(0.2, rangeKm)) * 1000);
  return `https://earth.google.com/web/@${coord(lat)},${coord(lon)},0a,${range}d,35y,0h,0t,0r`;
}

function point(name, description, place) {
  return `    <Placemark>
      <name>${xml(name)}</name>
      <description>${xml(description)}</description>
      <Point><coordinates>${coord(place.lon)},${coord(place.lat)},0</coordinates></Point>
    </Placemark>`;
}

/**
 * A KML document for Google Earth.
 *
 * @param view.title     name of the document
 * @param view.observer  { lat, lon }
 * @param view.overhead  list of { name, description, lat, lon }: places something is directly overhead
 * @param view.route     { name, description, from: {name, lat, lon}, to: {...}, path: [{lat, lon}] } or null
 */
export function buildKml({ title, observer, overhead = [], route = null }) {
  const parts = [
    point('Observer', 'The place the observer is standing in GlobeDart.', observer),
    ...overhead.map((p) => point(p.name, p.description, p)),
  ];
  if (route) {
    parts.push(
      point(route.from.name, 'One end of the route.', route.from),
      point(route.to.name, 'The other end of the route.', route.to),
      `    <Placemark>
      <name>${xml(route.name)}</name>
      <description>${xml(route.description)}</description>
      <Style><LineStyle><color>fffaf6f2</color><width>3</width></LineStyle></Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${route.path.map((p) => `${coord(p.lon)},${coord(p.lat)},0`).join(' ')}</coordinates>
      </LineString>
    </Placemark>`,
    );
  }
  // Open looking at the route if there is one, otherwise at the observer.
  const look = route ? route.path[route.path.length >> 1] : observer;
  const range = route ? Math.max(500, route.lengthKm * 1.6) : 1500;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xml(title)}</name>
    <LookAt>
      <longitude>${coord(look.lon)}</longitude>
      <latitude>${coord(look.lat)}</latitude>
      <altitude>0</altitude>
      <range>${Math.round(range * 1000)}</range>
      <tilt>0</tilt>
      <heading>0</heading>
    </LookAt>
${parts.join('\n')}
  </Document>
</kml>
`;
}
