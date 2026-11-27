// Outside view of the flat model: the usual map centred on the north pole,
// with a small sun circling above it at a height the user sets.
//
// This view decides nothing. The place the sun is overhead comes from the
// almanac, the same for both models. The sun's height, the reach of its light
// and the heights of the moon and stars are the flat model's own figures, set
// by the user. Where the model then puts things is worked out in js/models.js
// and handed to this view to draw.
//
// Lengths are in Earth radii (6,371 km). The map lies in the plane y = 0 with
// the north pole at the middle. Every place is at its true distance from the
// pole, which is (90° − latitude) in radians, so the equator is a circle π ÷ 2
// out and the south pole is the rim, π out (flatVec in js/models.js). Heights
// are to the same scale as the map. Only the sun's ball is drawn too large:
// see the note in update().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { globeVec, flatVec, flatFrame, frameDirection } from '../models.js';
import { DEG, EARTH_RADIUS_KM } from '../astro.js';
import {
  View3D,
  COLORS,
  makeLandTexture,
  buildCoastPositions,
  buildGraticulePositions,
  buildLatitudePositions,
  lineSegments,
  cityDots,
  DynamicSegments,
  PointCloud,
  makeGlowSprite,
  add3,
  kmText,
  outsideStarSize,
} from '../scene-utils.js';
import { ECLIPSE_GLSL, eclipseUniforms, setEclipse, ring } from './eclipseShade.js';

// Lines are drawn a hair above the map (0.004 of a radius is 25 km), in layers, so that one does not hide another.
const LIFT = 0.004;
/** A place on the map, `layers` hairs above it. */
const onMap = (lat, lon, layers = 1) => {
  const p = flatVec(lat, lon);
  p[1] = LIFT * layers;
  return p;
};
/** The point `height` Earth radii above a place on the map. */
const above = (place, height) => {
  const p = flatVec(place.lat, place.lon);
  p[1] = height;
  return p;
};
/** A level circle: gives the point at angle a round it, for ring(). */
const circle = (cx, cz, radius, y) => (a) => [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
// A line that is continuous on the real Earth can leap across this map where it passes the south pole, which
// the map spreads round its whole rim. Two points in a row further apart than this are not joined.
const RIM_JUMP = 0.6;
const joined = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]) < RIM_JUMP;
// The rings round the moon's shadow are markers of a fixed size, in Earth radii, not the shadow's width.
const SHADOW_RING = 0.05;
const PUBLISHED_RING = 0.085;

export class FlatView extends View3D {
  constructor(container, land, landCanvas, cities, { onPick }) {
    super(container);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 400);
    this.camera.position.set(0, 8.2, 10.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.2, 0);
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => (this.userMoved = true));
    this.controls.update();
    this.scene.background = new THREE.Color(0x05080f);

    // The map. Its shader paints day and night in one of two ways, as the user chooses.
    //
    // The model's own (observedMix = 0): the sun is a spotlight. A place is lit if it is within `range`
    // of the point under the sun, measured across the map:
    //
    //   lit where |place − place under the sun| < range        (softened over 0.04 radii, 255 km, either side)
    //
    // As it is observed (observedMix = 1): the half of the real world that is in daylight, drawn onto
    // this map. A place is in daylight when the sun is above its horizon, which is when the place is less
    // than 90° round the Earth from the place the sun is overhead:
    //
    //   n = (cos φ cos λ, sin φ, −cos φ sin λ)      the place's latitude φ and longitude λ as a direction
    //   lit where n · sunDirGlobe > 0
    //
    // The moon's shadow is the model's own in the first case (flatShade below) and the real one in the
    // second (globeShade in eclipseShade.js).
    //
    // `seen` is the direction in which something h up over a place on the map is seen from a point p, a
    // distance g away across the map. It is flatPredict in js/models.js, with the model's bending light:
    //
    //   across = the place − p
    //   up     = h − bend × g² ÷ 2
    this.uniforms = {
      map: { value: makeLandTexture(landCanvas) },
      subXZ: { value: new THREE.Vector2() }, // the point on the map under the sun
      range: { value: 1.5 }, // how far the model says the sun's light reaches
      observedMix: { value: 0 },
      plain: { value: 0 }, // 1 lights the whole map evenly, with no day and no night
      sunDirGlobe: { value: new THREE.Vector3(1, 0, 0) }, // the place the sun is overhead, as a direction on the globe
      // The flat model's own sun and moon, for its moon's shadow: heights and half-widths in Earth radii.
      sunH: { value: 1 },
      sunHalf: { value: 0.004 },
      moonXZ: { value: new THREE.Vector2() },
      moonH: { value: 0 }, // nothing when there is no moon on show
      moonHalf: { value: 0.004 },
      bend: { value: 0 }, // how much its light curves upward, per Earth radius travelled
      ...eclipseUniforms(),
    };
    const disc = new THREE.CircleGeometry(Math.PI, 180);
    disc.rotateX(-Math.PI / 2);
    this.disc = new THREE.Mesh(
      disc,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        vertexShader: `
          varying vec2 vP;
          void main() {
            vP = position.xz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D map;
          uniform vec2 subXZ;
          uniform float range;
          uniform float observedMix;
          uniform float plain;
          uniform vec3 sunDirGlobe;
          uniform float sunH;
          uniform float sunHalf;
          uniform vec2 moonXZ;
          uniform float moonH;
          uniform float moonHalf;
          uniform float bend;
          varying vec2 vP;
          ${ECLIPSE_GLSL}
          // The direction something h up over a place on the map is seen in from the point p (flatPredict in models.js).
          vec3 seen(vec2 p, vec2 under, float h) {
            vec2 d = under - p;
            float g = length(d);
            return normalize(vec3(d.x, h - 0.5 * bend * g * g, d.y));
          }
          // The flat model's shadow: its moon in front of its sun, from p.
          float flatShade(vec2 p) {
            if (moonH <= 0.0) return 1.0;
            float sunDist = length(vec3(subXZ - p, sunH));
            float moonDist = length(vec3(moonXZ - p, moonH));
            // A moon further off than the sun is behind it, and hides nothing.
            if (moonDist >= sunDist) return 1.0;
            float sep = length(cross(seen(p, subXZ, sunH), seen(p, moonXZ, moonH)));
            return eclipseShade(eclipseDepth(sunHalf / sunDist, moonHalf / moonDist, sep));
          }
          void main() {
            // This point of the map as a latitude and longitude, in radians: its distance from the pole
            // is (90 degrees - latitude), so the latitude is a quarter turn less that distance.
            float r = length(vP);
            float lon = atan(-vP.y, vP.x);
            float lat = 1.57079633 - r;
            vec3 c = texture2D(map, vec2(lon / 6.28318531 + 0.5, lat / 3.14159265 + 0.5)).rgb;
            // Flat model: a spotlight sun lights everything within "range" of the point below it.
            float spot = 1.0 - smoothstep(range - 0.04, range + 0.04, distance(vP, subXZ));
            // Observed: the half of the real world that is in daylight, drawn onto this map.
            vec3 n = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
            float real = smoothstep(-0.015, 0.015, dot(n, sunDirGlobe));
            float day = mix(spot, real, observedMix);
            // The moon's shadow: the flat model's own, or the real one when the real daylight is drawn.
            float shade = mix(flatShade(vP), mix(1.0, globeShade(n), real), observedMix);
            gl_FragColor = vec4(c * mix((0.26 + 0.74 * day) * shade, 0.82, plain), 1.0);
          }`,
      }),
    );
    this.scene.add(this.disc);
    this.scene.add(lineSegments(buildCoastPositions(land, onMap), COLORS.coast, 0.75));
    this.scene.add(lineSegments(buildGraticulePositions(onMap, 30, 89.5), COLORS.grid, 0.22));
    this.scene.add(lineSegments(buildLatitudePositions(onMap, 0), COLORS.grid, 0.6));
    // The rim: the south pole, drawn out into a circle.
    this.scene.add(lineSegments(buildLatitudePositions(onMap, -89.999), 0xe8f3ff, 0.9));

    // The flat model's sun, a line down to the point beneath it, the circle it goes round in a day, the edge
    // of its light, and the real edge between day and night for comparison.
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    this.scene.add(this.sun);
    this.sunGlow = makeGlowSprite();
    this.scene.add(this.sunGlow);
    this.sunDrop = new DynamicSegments(1, COLORS.flat, 0.6);
    this.scene.add(this.sunDrop.object);
    this.sunTrack = new DynamicSegments(180, COLORS.flat, 0.3);
    this.scene.add(this.sunTrack.object);
    this.spotRing = new DynamicSegments(180, COLORS.flat, 0.55);
    this.scene.add(this.spotRing.object);
    this.terminator = new DynamicSegments(360, COLORS.terminator, 0.95);
    this.scene.add(this.terminator.object);

    // An eclipse of the sun: the track of the middle of the shadow as this model has it and as the globe has it,
    // the line through this model's sun and moon down to the ground, and the published place.
    this.shadowTrack = new DynamicSegments(170, COLORS.flat, 1);
    this.scene.add(this.shadowTrack.object);
    this.shadowTrackGlobe = new DynamicSegments(170, COLORS.globe, 1);
    this.scene.add(this.shadowTrackGlobe.object);
    this.shadowLine = new DynamicSegments(32, COLORS.flat, 0.8);
    this.scene.add(this.shadowLine.object);
    this.shadowRing = new DynamicSegments(40, 0xffffff, 1);
    this.scene.add(this.shadowRing.object);
    this.publishedRing = new DynamicSegments(40, COLORS.measured, 1);
    this.scene.add(this.publishedRing.object);
    this.shadowLabel = this.labels.add("Flat model's shadow", 'shadow');
    this.shadowLabel.visible = false;

    // The observer, with the direction they measure (teal) and the line to where the model puts the thing (amber).
    this.observerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 20, 14),
      new THREE.MeshBasicMaterial({ color: COLORS.observer }),
    );
    this.scene.add(this.observerDot);
    this.observerMeasured = new DynamicSegments(1, COLORS.measured, 1);
    this.scene.add(this.observerMeasured.object);
    this.observerModel = new DynamicSegments(1, COLORS.flat, 0.9);
    this.scene.add(this.observerModel.object);

    // The directions measured from each of the cities.
    this.cityDots = cityDots(cities, onMap);
    this.scene.add(this.cityDots);
    this.sightLines = new DynamicSegments(cities.length, COLORS.measured, 0.85);
    this.scene.add(this.sightLines.object);
    // Sight lines from the user's own measurements taken around the moment on show.
    this.ownLines = new DynamicSegments(40, COLORS.own, 1);
    this.scene.add(this.ownLines.object);

    // The flat model's stars: a layer at one height that turns about the pole once a day.
    this.starCloud = new PointCloud(120, COLORS.star, { depthTest: true });
    this.starCloud.object.visible = false;
    this.scene.add(this.starCloud.object);
    this.starDrop = new DynamicSegments(1, COLORS.star, 0.5);
    this.scene.add(this.starDrop.object);
    this.starTrack = new DynamicSegments(180, COLORS.star, 0.25);
    this.scene.add(this.starTrack.object);
    this.starLabel = this.labels.add('', 'star');
    this.starLabel.visible = false;

    // A route between two places: the map's straight line, and the path really travelled.
    this.routeStraight = new DynamicSegments(1, COLORS.flat, 1);
    this.scene.add(this.routeStraight.object);
    this.routeReal = new DynamicSegments(96, COLORS.route, 1);
    this.scene.add(this.routeReal.object);
    this.routeLabels = ['route', 'route', 'route distance'].map((cls) => {
      const item = this.labels.add('', cls);
      item.visible = false;
      return item;
    });

    this.sunLabel = this.labels.add('', 'sun');
    this.observerLabel = this.labels.add('Observer', 'observer');
    const pole = this.labels.add('North Pole', 'note');
    pole.pos.set(0, LIFT, 0);
    const rim = this.labels.add('Antarctica (the rim)', 'note');
    rim.pos.fromArray(onMap(-89.9, -90));
    this.cityLabels = cities.map((c) => {
      const item = this.labels.add(c.name, 'city');
      item.pos.fromArray(onMap(c.lat, c.lon));
      return item;
    });

    // A click on the map moves the observer there. The point that was hit is turned back into a latitude
    // (90° less its distance from the pole) and a longitude (its angle round the pole).
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    this.onClick((e) => {
      raycaster.setFromCamera(this.ndc(e), this.camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const r = Math.hypot(hit.x, hit.z);
      if (r > Math.PI) return;
      onPick(90 - r / DEG, Math.atan2(-hit.z, hit.x) / DEG);
    });
  }

  /**
   * Draws one moment. `state` is the app's settings (js/main.js), with the flat
   * model's own figures among them: `sunHeightKm`, `lightRangeKm`,
   * `moonHeightKm`, `starHeightKm`. `c` is everything worked out for the
   * moment: `c.sub` the place the sun is overhead, `c.flat` this model's
   * prediction for the observer, `c.sight` what is measured, and `c.moon`,
   * `c.stars` and `c.route` when those are on show.
   */
  update(state, c) {
    const h = state.sunHeightKm / EARTH_RADIUS_KM;
    const range = state.lightRangeKm / EARTH_RADIUS_KM;
    const below = flatVec(c.sub.lat, c.sub.lon);
    const sunPos = [below[0], h, below[2]];
    const observedLighting = state.flatLighting === 'observed';
    // The sun can be left out. Then nothing marks it or its light, and the whole map is lit evenly.
    const showSun = state.sun !== false;
    for (const part of [this.sun, this.sunGlow, this.sunDrop.object, this.sunTrack.object, this.terminator.object, this.sunLabel]) part.visible = showSun;
    this.uniforms.plain.value = showSun ? 0 : 1;
    // What is sighted is the sun, unless the stars or the moon are on show. With no sun there is then nothing to sight.
    const sighting = showSun || !!c.stars || !!c.moon;
    const showObserver = state.observer !== false;

    this.uniforms.subXZ.value.set(below[0], below[2]);
    this.uniforms.range.value = range;
    this.uniforms.observedMix.value = observedLighting ? 1 : 0;
    this.uniforms.sunDirGlobe.value.fromArray(globeVec(c.sub.lat, c.sub.lon));

    // The sun's ball is the one thing here not to scale. The model's sun is only tens of km wide (flatPredict
    // in js/models.js gives the figure), too small to see, so the ball is never drawn less than 0.03 radii
    // (191 km) in radius. The shadow sums below use the true width.
    this.sun.scale.setScalar(Math.max(c.flat.sunWidthKm / 2 / EARTH_RADIUS_KM, 0.03));
    this.sun.position.fromArray(sunPos);
    this.sunGlow.position.fromArray(sunPos);
    this.sunGlow.scale.setScalar(0.55);
    this.sunLabel.pos.fromArray(sunPos);
    this.sunLabel.el.textContent = `Flat-model sun, ${kmText(state.sunHeightKm)} up`;
    this.sunDrop.begin();
    this.sunDrop.add(sunPos, [below[0], LIFT, below[2]]);
    this.sunDrop.end();

    // The circle the sun goes round in a day: at its own height, over the latitude it is overhead.
    this.sunTrack.begin();
    ring(this.sunTrack, circle(0, 0, (90 - c.sub.lat) * DEG, h), 180);
    this.sunTrack.end();
    // The edge of the sun's light, as the model has it.
    this.spotRing.begin();
    ring(this.spotRing, circle(below[0], below[2], range, LIFT * 1.5), 180);
    this.spotRing.end();
    this.spotRing.object.visible = !observedLighting && showSun;

    // The real edge between day and night: every place 90° round the Earth from the place the sun is
    // overhead. With s the direction of that place on the globe, u and v are two directions square to it and
    // to each other, and the edge is  u cos a + v sin a  for a all the way round. Each point is then put
    // on this map at its latitude and longitude.
    const s = new THREE.Vector3().fromArray(globeVec(c.sub.lat, c.sub.lon));
    const u = new THREE.Vector3(0, 1, 0).cross(s).normalize();
    const v = new THREE.Vector3().crossVectors(s, u);
    const edge = (i) => {
      const a = (i / 360) * 2 * Math.PI;
      const p = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      return onMap(Math.asin(p.y) / DEG, Math.atan2(-p.z, p.x) / DEG, 2);
    };
    this.terminator.begin();
    let prev = edge(0);
    for (let i = 1; i <= 360; i++) {
      const next = edge(i);
      if (joined(prev, next)) this.terminator.add(prev, next);
      prev = next;
    }
    this.terminator.end();

    // The moon's shadow. The shading is done by the map's shader, from this model's own sun and moon.
    const m = c.moon;
    setEclipse(this.uniforms, c.sub, m?.point ?? null);
    this.uniforms.sunH.value = h;
    this.uniforms.sunHalf.value = c.flat.sunWidthKm / 2 / EARTH_RADIUS_KM;
    this.uniforms.moonH.value = m ? state.moonHeightKm / EARTH_RADIUS_KM : 0;
    this.shadowTrack.begin();
    this.shadowTrackGlobe.begin();
    this.shadowLine.begin();
    this.shadowRing.begin();
    this.publishedRing.begin();
    let flatDark = null;
    if (m) {
      const under = flatVec(m.point.lat, m.point.lon);
      this.uniforms.moonXZ.value.set(under[0], under[2]);
      this.uniforms.moonHalf.value = m.flat.sunWidthKm / 2 / EARTH_RADIUS_KM;
      // The bend is per km in js/models.js. Here lengths are in Earth radii, which makes it R times as much.
      this.uniforms.bend.value = m.shade.bendPerKm * EARTH_RADIUS_KM;
      const around = (p, radius, layers) => {
        const mid = onMap(p.lat, p.lon, layers);
        return circle(mid[0], mid[2], radius, mid[1]);
      };
      const path = m.shade.path;
      if (path) {
        const draw = (target, places, layers) => {
          let last = null;
          for (const p of places) {
            const next = p && onMap(p.lat, p.lon, layers);
            // A gap in the track, or the jump across the far rim of this map, lifts the pen.
            if (next && last && joined(last, next)) target.add(last, next);
            last = next;
          }
        };
        draw(this.shadowTrackGlobe, path.globe, 2.5);
        draw(this.shadowTrack, path.flat, 3);
        ring(this.publishedRing, around(path.published, PUBLISHED_RING, 3));
      }
      const f = m.shade.flat;
      if (f.centre) {
        // The path of the light from the ground through the moon to the sun: straight, or curved if the
        // model's light is. With x the distance along the ground from where the shadow falls, c the bend,
        // and the moon h up at a distance x₁ along (moonShadowFlat in js/models.js):
        //
        //   height = slope × x + c × x² ÷ 2,      slope = (h − c × x₁² ÷ 2) ÷ x₁
        //
        // which passes through the moon, and through the sun at the far end.
        const ground = onMap(f.centre.lat, f.centre.lon, 3);
        const whole = f.fromMoonKm + f.gapKm;
        const curve = m.shade.bendPerKm;
        const slope = f.fromMoonKm > 0 ? (state.moonHeightKm - (curve * f.fromMoonKm * f.fromMoonKm) / 2) / f.fromMoonKm : 0;
        const along = (t) => {
          const x = whole * t;
          const up = whole > 0 ? slope * x + (curve * x * x) / 2 : state.sunHeightKm * t;
          return [ground[0] + (sunPos[0] - ground[0]) * t, up / EARTH_RADIUS_KM, ground[2] + (sunPos[2] - ground[2]) * t];
        };
        for (let k = 0; k < 32; k++) this.shadowLine.add(along(k / 32), along((k + 1) / 32));
        if (!f.offMap) {
          flatDark = ground;
          ring(this.shadowRing, around(f.centre, SHADOW_RING, 3));
        }
      }
    }
    this.shadowTrack.end();
    this.shadowTrackGlobe.end();
    this.shadowLine.end();
    this.shadowRing.end();
    this.publishedRing.end();
    this.shadowLabel.visible = !!flatDark;
    if (flatDark) this.shadowLabel.pos.fromArray(flatDark);

    const here = onMap(state.lat, state.lon);
    this.observerDot.position.fromArray(here);
    this.observerLabel.pos.fromArray(here);
    this.observerDot.visible = this.observerLabel.visible = showObserver;
    // The amber line runs to wherever the model puts the thing being sighted: the sun, or the chosen star.
    this.observerModel.begin();
    if (showObserver && sighting) this.observerModel.add(here, above(c.sight.flat, c.sight.flat.heightKm / EARTH_RADIUS_KM));
    this.observerModel.end();
    // A teal line leaves the ground in the direction that is measured there: the bearing counted round from
    // the map's north (toward the pole) and the height up from the flat ground (flatFrame in js/models.js).
    // It is drawn until it is 1.7 radii (10,800 km) up, or 4.5 radii long if that comes first. If the
    // earth were flat, the lines from every city would meet at the thing they point to.
    const sightEnd = (from, lat, lon, obs) => {
      const dir = frameDirection(flatFrame(lat, lon), obs.az, obs.el);
      const length = Math.min(4.5, 1.7 / Math.max(Math.sin(obs.el * DEG), 1e-3));
      return add3(from, dir, length);
    };
    this.observerMeasured.begin();
    if (showObserver && sighting && c.sight.obs.el > 0) this.observerMeasured.add(here, sightEnd(here, state.lat, state.lon, c.sight.obs));
    this.observerMeasured.end();

    this.sightLines.begin();
    if (state.sightLines && sighting) {
      for (const city of c.sight.cities) {
        if (city.obs.el <= 0) continue;
        const from = onMap(city.lat, city.lon);
        this.sightLines.add(from, sightEnd(from, city.lat, city.lon, city.obs));
      }
    }
    this.sightLines.end();
    this.ownLines.begin();
    for (const own of c.ownLines) {
      const from = onMap(own.lat, own.lon);
      const end = sightEnd(from, own.lat, own.lon, own);
      // Slightly longer than the teal line so both stay visible when they agree.
      this.ownLines.add(from, add3(from, [end[0] - from[0], end[1] - from[1], end[2] - from[2]], 1.12));
    }
    this.ownLines.end();
    for (const label of this.cityLabels) label.visible = state.sightLines;
    this.cityDots.visible = state.sightLines;

    // The stars: each at the model's height for them, over the place on Earth it is overhead.
    const stars = c.stars;
    this.starCloud.object.visible = !!stars;
    this.starLabel.visible = !!stars;
    this.starDrop.begin();
    this.starTrack.begin();
    if (stars) {
      const hs = state.starHeightKm / EARTH_RADIUS_KM;
      this.starCloud.begin();
      stars.points.forEach((p, i) => {
        this.starCloud.add(above(p, hs), outsideStarSize(stars.mags[i], i === stars.selected));
      });
      this.starCloud.end(0.9);
      // The chosen star: a line down to the place it is overhead, and the circle it goes round in a day.
      const sel = stars.points[stars.selected];
      const top = above(sel, hs);
      this.starDrop.add(top, onMap(sel.lat, sel.lon));
      this.starLabel.pos.fromArray(top);
      this.starLabel.el.textContent = `${stars.name} on the flat model, ${kmText(state.starHeightKm)} up`;
      ring(this.starTrack, circle(0, 0, (90 - sel.lat) * DEG, hs), 180);
    }
    if (c.moon && !stars) {
      // The same marker serves for the moon: a line down to the place it is overhead.
      const top = above(c.moon.point, state.moonHeightKm / EARTH_RADIUS_KM);
      this.starDrop.add(top, onMap(c.moon.point.lat, c.moon.point.lon));
      this.starLabel.pos.fromArray(top);
      this.starLabel.el.textContent = `The moon on the flat model, ${kmText(state.moonHeightKm)} up`;
      this.starLabel.visible = true;
    }
    this.starDrop.end();
    this.starTrack.end();

    // A route between two places: the straight line this map gives, with its length on the map, and the
    // path that is really travelled, drawn onto the map place by place.
    this.routeStraight.begin();
    this.routeReal.begin();
    for (const label of this.routeLabels) label.visible = !!c.route;
    if (c.route) {
      const pts = c.route.path.map((p) => onMap(p.lat, p.lon, 3));
      for (let k = 1; k < pts.length; k++) {
        if (joined(pts[k - 1], pts[k])) this.routeReal.add(pts[k - 1], pts[k]);
      }
      const from = pts[0];
      const to = pts[pts.length - 1];
      this.routeStraight.add(from, to);
      const [a, b, mid] = this.routeLabels;
      a.pos.fromArray(from);
      a.el.textContent = c.route.a.name;
      b.pos.fromArray(to);
      b.el.textContent = c.route.b.name;
      mid.pos.set((from[0] + to[0]) / 2, LIFT * 3, (from[2] + to[2]) / 2);
      mid.el.textContent = `${kmText(c.route.flatKm)} in a straight line on this map`;
    }
    this.routeStraight.end();
    this.routeReal.end();
    this.dirty = true;
  }

  fitCamera() {
    if (this.userMoved || !this.controls) return;
    // Pull back far enough that the whole disc fits the current panel shape. With θ half the angle the camera
    // shows from top to bottom, something of half-width r fills the panel's width from a distance
    // r ÷ (tan θ × the panel's width ÷ its height). The disc reaches π from its middle, taken as 1.1π for a
    // margin. The camera never comes nearer than 2.7 ÷ tan θ, which is what counts in a wide panel.
    const half = Math.tan((this.camera.fov / 2) * DEG);
    const distance = Math.max((Math.PI * 1.1) / (half * this.camera.aspect), 2.7 / half);
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(offset.normalize(), distance);
    this.controls.update();
  }

  /** Swing the camera round so the given place is on the near side of the map. */
  focus(lat, lon) {
    const t = this.controls.target;
    const offset = this.camera.position.clone().sub(t);
    const horizontal = Math.hypot(offset.x, offset.z);
    const l = lon * DEG;
    this.camera.position.set(t.x + Math.cos(l) * horizontal, t.y + offset.y, t.z - Math.sin(l) * horizontal);
    this.controls.update();
    this.dirty = true;
  }
}
