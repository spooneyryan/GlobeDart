// Outside view of the globe model: a sphere lit by a very distant sun.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { globeVec, globeFrame, frameDirection } from '../models.js';
import { DEG } from '../astro.js';
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
  scale3,
} from '../scene-utils.js';

const SURFACE = 1.003;
const onSphere = (lat, lon) => scale3(globeVec(lat, lon), SURFACE);
const STAR_DISTANCE = 40; // stand-in for "very far away": the stars are a backdrop here
const km = (n) => `${Math.round(n).toLocaleString('en-US')} km`;

export class GlobeView extends View3D {
  constructor(container, land, landCanvas, cities, { onPick }) {
    super(container);
    this.cities = cities;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.camera.position.set(0.6, 1.4, 4.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minDistance = 1.3;
    this.controls.maxDistance = 14;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => (this.userMoved = true));
    this.scene.background = new THREE.Color(0x05080f);

    this.uniforms = {
      map: { value: makeLandTexture(landCanvas) },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
    };
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        vertexShader: `
          varying vec3 vN;
          void main() {
            vN = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D map;
          uniform vec3 sunDir;
          varying vec3 vN;
          void main() {
            vec3 n = normalize(vN);
            float lon = atan(-n.z, n.x);
            float lat = asin(clamp(n.y, -1.0, 1.0));
            vec3 c = texture2D(map, vec2(lon / 6.28318531 + 0.5, lat / 3.14159265 + 0.5)).rgb;
            float d = dot(n, sunDir);
            float day = smoothstep(-0.015, 0.015, d);
            float twilight = smoothstep(-0.31, 0.0, d);
            gl_FragColor = vec4(c * (0.2 + 0.18 * twilight + 0.62 * day), 1.0);
          }`,
      }),
    );
    this.scene.add(this.earth);
    this.scene.add(lineSegments(buildCoastPositions(land, onSphere), COLORS.coast, 0.75));
    this.scene.add(lineSegments(buildGraticulePositions(onSphere), COLORS.grid, 0.22));
    this.scene.add(lineSegments(buildLatitudePositions(onSphere, 0), COLORS.grid, 0.6));

    // Direction to the sun. It cannot be drawn to scale: it is about 23,000 Earth radii away.
    this.sunRay = new DynamicSegments(1, COLORS.flat, 0.9);
    this.scene.add(this.sunRay.object);
    this.sunGlow = makeGlowSprite();
    this.sunGlow.scale.setScalar(0.5);
    this.scene.add(this.sunGlow);
    this.subsolarDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 16, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.flat }),
    );
    this.scene.add(this.subsolarDot);

    this.observerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 20, 14),
      new THREE.MeshBasicMaterial({ color: COLORS.observer }),
    );
    this.scene.add(this.observerDot);
    this.observerLine = new DynamicSegments(1, COLORS.measured, 1);
    this.scene.add(this.observerLine.object);

    const dots = new Float32Array(cities.flatMap((c) => onSphere(c.lat, c.lon)));
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

    // The stars as a distant backdrop, and the shortest route between two chosen places.
    this.starCloud = new PointCloud(120, COLORS.star, { depthTest: true });
    this.starCloud.object.visible = false;
    this.scene.add(this.starCloud.object);
    this.routeLine = new DynamicSegments(96, COLORS.route, 1);
    this.scene.add(this.routeLine.object);

    // Labels
    const facing = (pos) => (camera) => pos.dot(camera.position) > pos.lengthSq();
    this.routeLabels = ['route', 'route', 'route distance'].map((cls) => {
      const item = this.labels.add('', cls);
      item.test = facing(item.pos);
      item.visible = false;
      return item;
    });
    this.sunLabel = this.labels.add('', 'sun');
    this.observerLabel = this.labels.add('Observer', 'observer');
    this.observerLabel.test = (camera) => facing(this.observerLabel.pos)(camera);
    this.cityLabels = cities.map((c) => {
      const item = this.labels.add(c.name, 'city');
      item.pos.fromArray(onSphere(c.lat, c.lon));
      item.test = facing(item.pos);
      return item;
    });

    const raycaster = new THREE.Raycaster();
    this.onClick((e) => {
      raycaster.setFromCamera(this.ndc(e), this.camera);
      const hit = raycaster.intersectObject(this.earth)[0];
      if (!hit) return;
      const p = hit.point.normalize();
      onPick(Math.asin(p.y) / DEG, Math.atan2(-p.z, p.x) / DEG);
    });
  }

  update(state, c) {
    const sun = globeVec(c.sub.lat, c.sub.lon);
    this.uniforms.sunDir.value.fromArray(sun);
    this.subsolarDot.position.fromArray(scale3(sun, SURFACE));
    this.sunRay.begin();
    this.sunRay.add(scale3(sun, SURFACE), scale3(sun, 2.3));
    this.sunRay.end();
    this.sunGlow.position.fromArray(scale3(sun, 2.3));
    this.sunLabel.pos.fromArray(scale3(sun, 2.3));
    this.sunLabel.el.textContent = `To the sun, ${(c.sub.distKm / 1e6).toFixed(1)} million km →`;

    const here = onSphere(state.lat, state.lon);
    this.observerDot.position.fromArray(here);
    this.observerLabel.pos.fromArray(here);
    this.observerLine.begin();
    if (c.sight.obs.el > -1) {
      const dir = frameDirection(globeFrame(state.lat, state.lon), c.sight.obs.az, c.sight.obs.el);
      this.observerLine.add(here, add3(here, dir, 1.1));
    }
    this.observerLine.end();

    this.sightLines.begin();
    if (state.sightLines) {
      for (const city of c.sight.cities) {
        if (city.obs.el <= 0) continue;
        const from = onSphere(city.lat, city.lon);
        const dir = frameDirection(globeFrame(city.lat, city.lon), city.obs.az, city.obs.el);
        this.sightLines.add(from, add3(from, dir, 0.9));
      }
    }
    this.sightLines.end();
    this.ownLines.begin();
    for (const m of c.ownLines) {
      const from = onSphere(m.lat, m.lon);
      this.ownLines.add(from, add3(from, frameDirection(globeFrame(m.lat, m.lon), m.az, m.el), 1.3));
    }
    this.ownLines.end();
    for (const label of this.cityLabels) label.visible = state.sightLines;
    this.cityDots.visible = state.sightLines;

    this.starCloud.object.visible = !!c.stars;
    if (c.stars) {
      this.starCloud.begin();
      c.stars.points.forEach((p, i) => {
        const size = i === c.stars.selected ? 6.5 : Math.max(1.8, 4.2 - 0.9 * c.stars.mags[i]);
        this.starCloud.add(scale3(globeVec(p.lat, p.lon), STAR_DISTANCE), size);
      });
      this.starCloud.end(0.9);
    }

    this.routeLine.begin();
    for (const label of this.routeLabels) label.visible = !!c.route;
    if (c.route) {
      const pts = c.route.path.map((p) => scale3(globeVec(p.lat, p.lon), SURFACE + 0.004));
      for (let k = 1; k < pts.length; k++) this.routeLine.add(pts[k - 1], pts[k]);
      const [a, b, mid] = this.routeLabels;
      a.pos.fromArray(pts[0]);
      a.el.textContent = c.route.a.name;
      b.pos.fromArray(pts[pts.length - 1]);
      b.el.textContent = c.route.b.name;
      mid.pos.fromArray(pts[pts.length >> 1]);
      mid.el.textContent = km(c.route.globeKm);
    }
    this.routeLine.end();
    this.dirty = true;
  }

  fitCamera() {
    if (this.userMoved || !this.controls) return;
    const half = Math.tan((this.camera.fov / 2) * DEG) * Math.min(1, this.camera.aspect);
    this.camera.position.setLength(1.22 / Math.sin(Math.atan(half)));
    this.controls.update();
  }

  /** Swing the camera round so the given place faces the viewer. */
  focus(lat, lon) {
    const dist = this.camera.position.length();
    const tilt = Math.max(-55, Math.min(55, lat * 0.6 + 12));
    this.camera.position.fromArray(scale3(globeVec(tilt, lon - 18), dist));
    this.controls.update();
    this.dirty = true;
  }
}
