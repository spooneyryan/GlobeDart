// Outside view of the flat model: the usual north-pole-centred map with a
// small sun circling above it at an adjustable height.
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
  DynamicSegments,
  PointCloud,
  makeGlowSprite,
  add3,
} from '../scene-utils.js';

const LIFT = 0.004;
const onMap = (lat, lon) => {
  const p = flatVec(lat, lon);
  p[1] = LIFT;
  return p;
};
const km = (n) => `${Math.round(n).toLocaleString('en-US')} km`;

export class FlatView extends View3D {
  constructor(container, land, landCanvas, cities, { onPick }) {
    super(container);
    this.cities = cities;
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

    this.uniforms = {
      map: { value: makeLandTexture(landCanvas) },
      subXZ: { value: new THREE.Vector2() },
      range: { value: 1.5 },
      observedMix: { value: 0 },
      sunDirGlobe: { value: new THREE.Vector3(1, 0, 0) },
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
          uniform vec3 sunDirGlobe;
          varying vec2 vP;
          void main() {
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
            gl_FragColor = vec4(c * (0.26 + 0.74 * day), 1.0);
          }`,
      }),
    );
    this.scene.add(this.disc);
    this.scene.add(lineSegments(buildCoastPositions(land, onMap), COLORS.coast, 0.75));
    this.scene.add(lineSegments(buildGraticulePositions(onMap, 30, 89.5), COLORS.grid, 0.22));
    this.scene.add(lineSegments(buildLatitudePositions(onMap, 0), COLORS.grid, 0.6));
    this.scene.add(lineSegments(buildLatitudePositions(onMap, -89.999), 0xe8f3ff, 0.9));

    // The flat model's sun, the point beneath it and its daily track.
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

    this.observerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 20, 14),
      new THREE.MeshBasicMaterial({ color: COLORS.observer }),
    );
    this.scene.add(this.observerDot);
    this.observerMeasured = new DynamicSegments(1, COLORS.measured, 1);
    this.scene.add(this.observerMeasured.object);
    this.observerModel = new DynamicSegments(1, COLORS.flat, 0.9);
    this.scene.add(this.observerModel.object);

    const dots = new Float32Array(cities.flatMap((c) => onMap(c.lat, c.lon)));
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dots, 3));
    this.cityDots = new THREE.Points(
      dotGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 4, sizeAttenuation: false }),
    );
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

  update(state, c) {
    const h = state.sunHeightKm / EARTH_RADIUS_KM;
    const range = state.lightRangeKm / EARTH_RADIUS_KM;
    const below = flatVec(c.sub.lat, c.sub.lon);
    const sunPos = [below[0], h, below[2]];
    const observedLighting = state.flatLighting === 'observed';

    this.uniforms.subXZ.value.set(below[0], below[2]);
    this.uniforms.range.value = range;
    this.uniforms.observedMix.value = observedLighting ? 1 : 0;
    this.uniforms.sunDirGlobe.value.fromArray(globeVec(c.sub.lat, c.sub.lon));

    // True model width is only tens of km; keep a minimum size so it stays visible.
    this.sun.scale.setScalar(Math.max(c.flat.sunWidthKm / 2 / EARTH_RADIUS_KM, 0.03));
    this.sun.position.fromArray(sunPos);
    this.sunGlow.position.fromArray(sunPos);
    this.sunGlow.scale.setScalar(0.55);
    this.sunLabel.pos.fromArray(sunPos);
    this.sunLabel.el.textContent = `Flat-model sun, ${km(state.sunHeightKm)} up`;
    this.sunDrop.begin();
    this.sunDrop.add(sunPos, [below[0], LIFT, below[2]]);
    this.sunDrop.end();

    const circle = (target, cx, cz, radius, y, n) => {
      target.begin();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const b = ((i + 1) / n) * 2 * Math.PI;
        target.add(
          [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)],
          [cx + radius * Math.cos(b), y, cz + radius * Math.sin(b)],
        );
      }
      target.end();
    };
    circle(this.sunTrack, 0, 0, (90 - c.sub.lat) * DEG, h, 180);
    circle(this.spotRing, below[0], below[2], range, LIFT * 1.5, 180);
    this.spotRing.object.visible = !observedLighting;

    // The real day/night boundary: every place 90 degrees from the subsolar point.
    const s = new THREE.Vector3().fromArray(globeVec(c.sub.lat, c.sub.lon));
    const u = new THREE.Vector3(0, 1, 0).cross(s).normalize();
    const v = new THREE.Vector3().crossVectors(s, u);
    const edge = (i) => {
      const a = (i / 360) * 2 * Math.PI;
      const p = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      const pt = flatVec(Math.asin(p.y) / DEG, Math.atan2(-p.z, p.x) / DEG);
      pt[1] = LIFT * 2;
      return pt;
    };
    this.terminator.begin();
    let prev = edge(0);
    for (let i = 1; i <= 360; i++) {
      const next = edge(i);
      // Skip the jump where the boundary crosses the south pole, which this map smears round the rim.
      if (Math.hypot(next[0] - prev[0], next[2] - prev[2]) < 0.6) this.terminator.add(prev, next);
      prev = next;
    }
    this.terminator.end();

    const here = onMap(state.lat, state.lon);
    this.observerDot.position.fromArray(here);
    this.observerLabel.pos.fromArray(here);
    // The amber line runs to wherever the model puts the thing being sighted: the sun, or the chosen star.
    const target = flatVec(c.sight.flat.lat, c.sight.flat.lon);
    const targetPos = [target[0], c.sight.flat.heightKm / EARTH_RADIUS_KM, target[2]];
    this.observerModel.begin();
    this.observerModel.add(here, targetPos);
    this.observerModel.end();
    const sightEnd = (from, lat, lon, obs) => {
      const dir = frameDirection(flatFrame(lat, lon), obs.az, obs.el);
      const length = Math.min(4.5, 1.7 / Math.max(Math.sin(obs.el * DEG), 1e-3));
      return add3(from, dir, length);
    };
    this.observerMeasured.begin();
    if (c.sight.obs.el > 0) this.observerMeasured.add(here, sightEnd(here, state.lat, state.lon, c.sight.obs));
    this.observerMeasured.end();

    this.sightLines.begin();
    if (state.sightLines) {
      for (const city of c.sight.cities) {
        if (city.obs.el <= 0) continue;
        const from = onMap(city.lat, city.lon);
        this.sightLines.add(from, sightEnd(from, city.lat, city.lon, city.obs));
      }
    }
    this.sightLines.end();
    this.ownLines.begin();
    for (const m of c.ownLines) {
      const from = onMap(m.lat, m.lon);
      const end = sightEnd(from, m.lat, m.lon, m);
      // Slightly longer than the teal line so both stay visible when they agree.
      this.ownLines.add(from, add3(from, [end[0] - from[0], end[1] - from[1], end[2] - from[2]], 1.12));
    }
    this.ownLines.end();
    for (const label of this.cityLabels) label.visible = state.sightLines;
    this.cityDots.visible = state.sightLines;

    const stars = c.stars;
    this.starCloud.object.visible = !!stars;
    this.starLabel.visible = !!stars;
    this.starDrop.begin();
    this.starTrack.begin();
    if (stars) {
      const hs = state.starHeightKm / EARTH_RADIUS_KM;
      this.starCloud.begin();
      stars.points.forEach((p, i) => {
        const v = flatVec(p.lat, p.lon);
        const size = i === stars.selected ? 6.5 : Math.max(1.8, 4.2 - 0.9 * stars.mags[i]);
        this.starCloud.add([v[0], hs, v[2]], size);
      });
      this.starCloud.end(0.9);
      const sel = stars.points[stars.selected];
      const v = flatVec(sel.lat, sel.lon);
      this.starDrop.add([v[0], hs, v[2]], [v[0], LIFT, v[2]]);
      this.starLabel.pos.set(v[0], hs, v[2]);
      this.starLabel.el.textContent = `${stars.name} on the flat model, ${km(state.starHeightKm)} up`;
      const radius = (90 - sel.lat) * DEG;
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * 2 * Math.PI;
        const b = ((i + 1) / 180) * 2 * Math.PI;
        this.starTrack.add([radius * Math.cos(a), hs, radius * Math.sin(a)], [radius * Math.cos(b), hs, radius * Math.sin(b)]);
      }
    }
    if (c.moon && !stars) {
      // The same marker serves for the moon: a line down to the place it is overhead.
      const hm = state.moonHeightKm / EARTH_RADIUS_KM;
      const v = flatVec(c.moon.point.lat, c.moon.point.lon);
      this.starDrop.add([v[0], hm, v[2]], [v[0], LIFT, v[2]]);
      this.starLabel.pos.set(v[0], hm, v[2]);
      this.starLabel.el.textContent = `The moon on the flat model, ${km(state.moonHeightKm)} up`;
      this.starLabel.visible = true;
    }
    this.starDrop.end();
    this.starTrack.end();

    this.routeStraight.begin();
    this.routeReal.begin();
    for (const label of this.routeLabels) label.visible = !!c.route;
    if (c.route) {
      const lift = (p) => [p[0], LIFT * 3, p[2]];
      const pts = c.route.path.map((p) => lift(flatVec(p.lat, p.lon)));
      for (let k = 1; k < pts.length; k++) {
        // The real path can cross the far rim of this map; leave that jump undrawn.
        if (Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][2] - pts[k - 1][2]) < 0.6) this.routeReal.add(pts[k - 1], pts[k]);
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
      mid.el.textContent = `${km(c.route.flatKm)} in a straight line on this map`;
    }
    this.routeStraight.end();
    this.routeReal.end();
    this.dirty = true;
  }

  fitCamera() {
    if (this.userMoved || !this.controls) return;
    // Pull back far enough that the whole disc fits the current panel shape.
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
