// Outside view of the globe model: a ball lit by a very distant sun.
//
// This view decides nothing. It is handed the place on Earth the sun is
// overhead, the directions observers measure and the rest, all worked out
// already (js/astro.js, js/models.js, js/main.js), and it draws them.
//
// Lengths are in Earth radii, from the centre of the ball. The north pole is
// +y. The ball itself is to scale. The sun and the stars cannot be: see the
// notes where they are drawn.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { globeVec, globeFrame, frameDirection } from '../models.js';
import { DEG } from '../astro.js';
import {
  View3D,
  COLORS,
  buildCoastPositions,
  buildGraticulePositions,
  buildLatitudePositions,
  lineSegments,
  cityDots,
  DynamicSegments,
  PointCloud,
  makeGlowSprite,
  add3,
  scale3,
  kmText,
  outsideStarSize,
} from '../scene-utils.js';
import { setEclipse, ring } from './eclipseShade.js';
import { makeEarthBall } from './earthBall.js';

// Lines and dots are drawn a hair above the ball (0.003 of a radius is 19 km), so that the ball does not hide them.
const SURFACE = 1.003;
const onSphere = (lat, lon) => scale3(globeVec(lat, lon), SURFACE);
const TRACK = SURFACE + 0.003; // the track of the moon's shadow, a little above the coastlines
const ROUTE = SURFACE + 0.004; // a route between two places, above that
// The sun is about 23,500 Earth radii away and the stars far beyond it. Neither fits in the picture, so the
// line toward the sun stops 2.3 radii out and the stars are dots 40 radii out. Their directions are true.
const SUN_ARROW = 2.3;
const STAR_DISTANCE = 40;
// The rings round the middle of the moon's shadow are markers of a fixed size, not the shadow's width:
// this many degrees round the Earth from the middle to the ring (1° is 111 km).
const SHADOW_RING_DEG = 1.6;
const PUBLISHED_RING_DEG = 3.2;

export class GlobeView extends View3D {
  constructor(container, land, landCanvas, cities, { onPick }) {
    super(container);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.camera.position.set(0.6, 1.4, 4.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minDistance = 1.3;
    this.controls.maxDistance = 14;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => (this.userMoved = true));
    this.scene.background = new THREE.Color(0x05080f);

    // The ball, lit by the direction to the sun. It is made and explained in js/views/earthBall.js, which the
    // view from space shares.
    const ball = makeEarthBall(landCanvas);
    this.uniforms = ball.uniforms;
    this.earth = ball.mesh;
    this.scene.add(this.earth);
    this.scene.add(lineSegments(buildCoastPositions(land, onSphere), COLORS.coast, 0.75));
    this.scene.add(lineSegments(buildGraticulePositions(onSphere), COLORS.grid, 0.22));
    this.scene.add(lineSegments(buildLatitudePositions(onSphere, 0), COLORS.grid, 0.6));

    // The direction to the sun, and a dot at the place it is overhead.
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

    // An eclipse of the sun: the track of the middle of the moon's shadow, where it is now, and the published place.
    this.shadowTrack = new DynamicSegments(170, COLORS.globe, 1);
    this.scene.add(this.shadowTrack.object);
    this.shadowRing = new DynamicSegments(40, 0xffffff, 1);
    this.scene.add(this.shadowRing.object);
    this.publishedRing = new DynamicSegments(40, COLORS.measured, 1);
    this.scene.add(this.publishedRing.object);

    // The observer, and the direction they measure the sun (or the chosen star) in.
    this.observerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 20, 14),
      new THREE.MeshBasicMaterial({ color: COLORS.observer }),
    );
    this.scene.add(this.observerDot);
    this.observerLine = new DynamicSegments(1, COLORS.measured, 1);
    this.scene.add(this.observerLine.object);

    // The same from each of the cities.
    this.cityDots = cityDots(cities, onSphere);
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

    // Labels. One on the far side of the ball is hidden. A point P is on the near side when the camera, at C,
    // is on the outer side of the flat sheet that touches the ball there:  P · C > P · P.
    const facing = (pos) => (camera) => pos.dot(camera.position) > pos.lengthSq();
    this.routeLabels = ['route', 'route', 'route distance'].map((cls) => {
      const item = this.labels.add('', cls);
      item.test = facing(item.pos);
      item.visible = false;
      return item;
    });
    this.sunLabel = this.labels.add('', 'sun');
    this.shadowLabel = this.labels.add('', 'shadow');
    this.shadowLabel.test = facing(this.shadowLabel.pos);
    this.shadowLabel.visible = false;
    this.observerLabel = this.labels.add('Observer', 'observer');
    this.observerLabel.test = facing(this.observerLabel.pos);
    this.cityLabels = cities.map((c) => {
      const item = this.labels.add(c.name, 'city');
      item.pos.fromArray(onSphere(c.lat, c.lon));
      item.test = facing(item.pos);
      return item;
    });

    // A click on the ball moves the observer there: the point that was hit, turned back into latitude and longitude.
    const raycaster = new THREE.Raycaster();
    this.onClick((e) => {
      raycaster.setFromCamera(this.ndc(e), this.camera);
      const hit = raycaster.intersectObject(this.earth)[0];
      if (!hit) return;
      const p = hit.point.normalize();
      onPick(Math.asin(p.y) / DEG, Math.atan2(-p.z, p.x) / DEG);
    });
  }

  /**
   * Draws one moment. `state` is the app's settings (js/main.js) and `c` is
   * everything worked out for that moment: `c.sub` the place the sun is
   * overhead, `c.sight` what is measured from the observer and from each city,
   * `c.moon`, `c.stars` and `c.route` when those are on show.
   */
  update(state, c) {
    // The sun: the direction from the centre of the Earth to the place it is overhead.
    const sun = globeVec(c.sub.lat, c.sub.lon);
    const sunEnd = scale3(sun, SUN_ARROW);
    this.uniforms.sunDir.value.fromArray(sun);
    this.subsolarDot.position.fromArray(scale3(sun, SURFACE));
    this.sunRay.begin();
    this.sunRay.add(scale3(sun, SURFACE), sunEnd);
    this.sunRay.end();
    this.sunGlow.position.fromArray(sunEnd);
    this.sunLabel.pos.fromArray(sunEnd);
    this.sunLabel.el.textContent = `To the sun, ${(c.sub.distKm / 1e6).toFixed(1)} million km →`;
    // The sun can be left out. Then nothing marks it, and the whole ball is lit evenly.
    const showSun = state.sun !== false;
    this.sunRay.object.visible = this.sunGlow.visible = this.subsolarDot.visible = this.sunLabel.visible = showSun;
    this.uniforms.plain.value = showSun ? 0 : 1;
    // What is sighted is the sun, unless the stars or the moon are on show. With no sun there is then nothing to sight.
    const sighting = showSun || !!c.stars || !!c.moon;
    const showObserver = state.observer !== false;

    // The moon's shadow. The shading is done by the ball's shader, from where the sun and moon are.
    const shade = c.moon?.shade;
    setEclipse(this.uniforms, c.sub, c.moon?.point ?? null);
    // A ring round a place, radiusDeg round the Earth from it. With ρ that angle, and a the angle round the ring:
    //   point = up × cos ρ + (east × cos a + north × sin a) × sin ρ
    const around = (place, radiusDeg) => {
      const frame = globeFrame(place.lat, place.lon);
      const [r, up] = [Math.sin(radiusDeg * DEG), Math.cos(radiusDeg * DEG) * TRACK];
      return (a) => [0, 1, 2].map((i) => frame.up[i] * up + (frame.east[i] * Math.cos(a) + frame.north[i] * Math.sin(a)) * r);
    };
    this.shadowTrack.begin();
    this.publishedRing.begin();
    if (shade?.path) {
      const pts = shade.path.globe.map((p) => scale3(globeVec(p.lat, p.lon), TRACK));
      for (let k = 1; k < pts.length; k++) this.shadowTrack.add(pts[k - 1], pts[k]);
      ring(this.publishedRing, around(shade.path.published, PUBLISHED_RING_DEG));
    }
    this.shadowTrack.end();
    this.publishedRing.end();
    this.shadowRing.begin();
    const dark = shade?.globe.centre;
    if (dark) {
      ring(this.shadowRing, around(dark, SHADOW_RING_DEG));
      this.shadowLabel.pos.fromArray(onSphere(dark.lat, dark.lon));
      this.shadowLabel.el.textContent = shade.globe.kind === 'total' ? "Moon's shadow: sun all hidden" : "Moon's shadow: a ring of sun left";
    }
    this.shadowLabel.visible = !!dark;
    this.shadowRing.end();

    // The observer. The teal line leaves the ground in the direction that is measured there: the bearing is
    // counted round from the observer's own north and the height up from their own level ground
    // (globeFrame and frameDirection in js/models.js). Its length, in Earth radii, means nothing.
    const here = onSphere(state.lat, state.lon);
    this.observerDot.position.fromArray(here);
    this.observerLabel.pos.fromArray(here);
    this.observerDot.visible = this.observerLabel.visible = showObserver;
    this.observerLine.begin();
    if (showObserver && sighting && c.sight.obs.el > -1) {
      const dir = frameDirection(globeFrame(state.lat, state.lon), c.sight.obs.az, c.sight.obs.el);
      this.observerLine.add(here, add3(here, dir, 1.1));
    }
    this.observerLine.end();

    // The same from every city where it is above the horizon. On this model the lines come out parallel.
    this.sightLines.begin();
    if (state.sightLines && sighting) {
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

    // Each star, in the direction of the place on Earth it is overhead.
    this.starCloud.object.visible = !!c.stars;
    if (c.stars) {
      this.starCloud.begin();
      c.stars.points.forEach((p, i) => {
        this.starCloud.add(scale3(globeVec(p.lat, p.lon), STAR_DISTANCE), outsideStarSize(c.stars.mags[i], i === c.stars.selected));
      });
      this.starCloud.end(0.9);
    }

    // A route between two places: the shortest way over the surface, with its length.
    this.routeLine.begin();
    for (const label of this.routeLabels) label.visible = !!c.route;
    if (c.route) {
      const pts = c.route.path.map((p) => scale3(globeVec(p.lat, p.lon), ROUTE));
      for (let k = 1; k < pts.length; k++) this.routeLine.add(pts[k - 1], pts[k]);
      const [a, b, mid] = this.routeLabels;
      a.pos.fromArray(pts[0]);
      a.el.textContent = c.route.a.name;
      b.pos.fromArray(pts[pts.length - 1]);
      b.el.textContent = c.route.b.name;
      mid.pos.fromArray(pts[pts.length >> 1]);
      mid.el.textContent = kmText(c.route.globeKm);
    }
    this.routeLine.end();
    this.dirty = true;
  }

  /**
   * Stands the camera back far enough for the whole ball to fit the panel. A
   * ball of radius r, seen from a distance D, fills an angle asin(r ÷ D) either
   * side of its middle. So with θ half the angle the panel shows across its
   * narrower side:
   *   D = r ÷ sin θ          with r = 1.22, to leave a margin
   */
  fitCamera() {
    if (this.userMoved || !this.controls) return;
    const half = Math.tan((this.camera.fov / 2) * DEG) * Math.min(1, this.camera.aspect);
    this.camera.position.setLength(1.22 / Math.sin(Math.atan(half)));
    this.controls.update();
  }

  /** Swing the camera round so the given place faces the viewer. */
  focus(lat, lon) {
    const dist = this.camera.position.length();
    // The camera looks from 18° west of the place, at a latitude kept well short of the poles so that north stays up.
    const tilt = Math.max(-55, Math.min(55, lat * 0.6 + 12));
    this.camera.position.fromArray(scale3(globeVec(tilt, lon - 18), dist));
    this.controls.update();
    this.dirty = true;
  }
}
