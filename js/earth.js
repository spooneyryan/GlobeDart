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

// ---------- a line of sight ----------

function placemarkAt(name, description, place) {
  return `    <Placemark>
      <name>${xml(name)}</name>
      <description>${xml(description)}</description>
      <Point><altitudeMode>absolute</altitudeMode><coordinates>${coord(place.lon)},${coord(place.lat)},${Math.round(place.altM)}</coordinates></Point>
    </Placemark>`;
}

/**
 * A KML document showing a line of sight across water.
 *
 * @param sight.title  name of the document
 * @param sight.from   { name, description, lat, lon, altM }: the eye, with its height above sea level
 * @param sight.to     the same for the top of the target
 * @param sight.track  [{lat, lon}]: the way along the ground, which Google Earth drapes over the real terrain
 * @param sight.lines  [{ name, description, colour, path: [{lat, lon, altM}] }]: the line of sight itself,
 *                     once for each way light might travel. Heights are above sea level. `colour` is
 *                     KML's order: opacity, blue, green, red, two hexadecimal digits each.
 */
export function buildSightKml({ title, from, to, track, lines }) {
  const middle = track[track.length >> 1];
  const parts = [
    placemarkAt(from.name, from.description, from),
    placemarkAt(to.name, to.description, to),
    `    <Placemark>
      <name>The ground under the line of sight</name>
      <description>Draped over the real ground. In Google Earth Pro, right-click it and choose "Show Elevation Profile".</description>
      <Style><LineStyle><color>80ffffff</color><width>2</width></LineStyle></Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${track.map((p) => `${coord(p.lon)},${coord(p.lat)},0`).join(' ')}</coordinates>
      </LineString>
    </Placemark>`,
    ...lines.map(
      (line) => `    <Placemark>
      <name>${xml(line.name)}</name>
      <description>${xml(line.description)}</description>
      <Style><LineStyle><color>${line.colour}</color><width>3</width></LineStyle></Style>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${line.path.map((p) => `${coord(p.lon)},${coord(p.lat)},${Number(p.altM.toFixed(1))}`).join(' ')}</coordinates>
      </LineString>
    </Placemark>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xml(title)}</name>
    <LookAt>
      <longitude>${coord(middle.lon)}</longitude>
      <latitude>${coord(middle.lat)}</latitude>
      <altitude>0</altitude>
      <range>${Math.round(Math.max(2, sightLengthKm(track) * 1.6) * 1000)}</range>
      <tilt>0</tilt>
      <heading>0</heading>
    </LookAt>
${parts.join('\n')}
  </Document>
</kml>
`;
}

/** The length of a path of {lat, lon} points over the globe, in km. */
function sightLengthKm(track) {
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 1; i < track.length; i++) {
    const [a, b] = [track[i - 1], track[i]];
    const h =
      Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
    total += 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

// ---------- reading a KML file ----------

export const KML_LIMITS = Object.freeze({ bytes: 2_000_000, points: 200, lines: 20, lineCoords: 5000 });

const XML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** The text inside a tag, with CDATA wrapping and XML escapes undone, and any tags inside it dropped. */
function plain(text) {
  return String(text ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
      if (code[0] !== '#') return XML_NAMED[code.toLowerCase()] ?? whole;
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** "lon,lat,alt lon,lat,alt ..." as a list of places. Anything that is not a place on the Earth is dropped. */
function coordinates(text, most) {
  const out = [];
  for (const part of String(text).trim().split(/\s+/)) {
    const [lon, lat, alt] = part.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ lat, lon, altM: Number.isFinite(alt) ? alt : 0 });
    if (out.length >= most) break;
  }
  return out;
}

/**
 * The places and lines in a KML file.
 *
 * Returns { points: [{name, lat, lon, altM}], lines: [{name, path: [{lat, lon, altM}]}], problem }.
 * `problem` is null, or says why nothing could be read. A KMZ file is a zipped
 * KML and has to be unzipped first. Only the two simplest kinds of shape are
 * read: a place (Point) and a path (LineString).
 */
export function parseKml(text) {
  const empty = (problem) => ({ points: [], lines: [], problem });
  if (typeof text !== 'string' || !text.trim()) return empty('The file is empty.');
  if (text.startsWith('PK')) return empty('That is a KMZ file, which is zipped. Save it as KML from Google Earth, or unzip it, and load the .kml file.');
  if (text.length > KML_LIMITS.bytes) return empty('The file is too large to read here.');
  if (!/<(\w+:)?kml[\s>]/i.test(text) && !/<(\w+:)?Placemark[\s>]/i.test(text)) return empty('That does not look like a KML file.');
  const points = [];
  const lines = [];
  // A tag and what is inside it, whether or not its name carries a prefix such as "kml:".
  const tag = (name) => new RegExp(String.raw`<(?:\w+:)?${name}\b[^>]*>([\s\S]*?)</(?:\w+:)?${name}>`, 'i');
  const each = (source, name) => source.match(new RegExp(tag(name).source, 'gi')) ?? [];
  for (const block of each(text, 'Placemark')) {
    const name = plain(block.match(tag('name'))?.[1]);
    for (const shape of each(block, 'Point')) {
      const [place] = coordinates(shape.match(tag('coordinates'))?.[1] ?? '', 1);
      if (place && points.length < KML_LIMITS.points) points.push({ name: name || `Place ${points.length + 1}`, ...place });
    }
    for (const shape of each(block, 'LineString')) {
      const path = coordinates(shape.match(tag('coordinates'))?.[1] ?? '', KML_LIMITS.lineCoords);
      if (path.length >= 2 && lines.length < KML_LIMITS.lines) lines.push({ name: name || `Line ${lines.length + 1}`, path });
    }
  }
  return { points, lines, problem: points.length || lines.length ? null : 'No places or paths were found in that file.' };
}
