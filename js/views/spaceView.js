// The view from space: the Sun, the Earth and Moon and the planets the eye can
// see, each where the almanac puts it, with a camera that can go to any of them.
//
// This view decides nothing. It is handed where everything is and how the
// Earth is turned (js/space.js) and it draws that.
//
// Everything is to scale: sizes, distances and the Earth's tilt. That is why,
// from far enough off to see an orbit, the bodies themselves are too small to
// see. Each one therefore also has a dot and a name. The dots are markers of a
// fixed size on screen, not the bodies. Three things are not real:
//   - the lines of the orbits, the Earth's axis and the grid on the Earth
//   - the colours of the planets, which are plain, and the Moon's, a plain grey
//   - Saturn's rings, which are left out
//
// Lengths in the scene are in Earth radii. The thing being looked at is always
// at the middle of the scene, and everything else is placed from there. The
// numbers stay small near the camera that way, where a graphics card's seven
// figures of precision would otherwise show as a wobble: the Earth is 23,000
// of its own radii from the Sun.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEG, EARTH_RADIUS_KM, SUN_RADIUS_KM } from '../astro.js';
import { globeVec, SHADOW_GROWTH } from '../models.js';
import { STARS } from '../stars.js';
import { SPACE_BODIES, SPACE_BODY, PLANET_NAMES, MOON_MONTH_DAYS, placeDirection, planetPath, moonPath, starDirection } from '../space.js';
import { View3D, COLORS, buildCoastPositions, buildGraticulePositions, buildLatitudePositions, lineSegments, PointCloud, scale3, outsideStarSize } from '../scene-utils.js';
import { setEclipse } from './eclipseShade.js';
import { makeEarthBall } from './earthBall.js';

const UNIT_KM = EARTH_RADIUS_KM; // one unit of length in the scene
const DAY_MS = 86400000;
// Lines and dots on the Earth are drawn a hair above it, as in the globe model's own view.
const SURFACE = 1.003;
const onSphere = (lat, lon) => scale3(globeVec(lat, lon), SURFACE);
// The Earth's axis is drawn this far out through each pole, in Earth radii.
const AXIS_REACH = 1.7;
// How far the camera can back away: 3 million Earth radii, about 128 times the Earth's distance from the Sun.
const FARTHEST = 3e6;
// The stars are dots on a shell this far from the camera, in every direction. Their directions are true.
// Their distances cannot be shown: the nearest is 270,000 times as far off as the Sun.
const STAR_SHELL = 4e6;
// A body's name is dropped once the body itself is this many pixels across, and a dot may be clicked from this near.
const NAMED_UNDER_PX = 70;
const CLICK_REACH_PX = 22;
// Which name is kept where two would collide, and the room a name takes on screen: pixels for each letter, and its height.
const NAME_ORDER = ['Sun', 'Earth', 'Jupiter', 'Saturn', 'Mars', 'Venus', 'Mercury', 'Moon'];
const NAME_LETTER_PX = 7;
const NAME_HIGH_PX = 13;

// A plain colour for each body, and the size of its marker dot in CSS pixels.
const LOOKS = {
  Sun: { colour: 0xffe9a8, dot: 8 },
  Mercury: { colour: 0xa9a39a, dot: 4 },
  Venus: { colour: 0xe8d9a8, dot: 5 },
  Earth: { colour: 0x7fb4ff, dot: 5 },
  Moon: { colour: 0xc9ced6, dot: 3.5 },
  Mars: { colour: 0xd9744a, dot: 4.5 },
  Jupiter: { colour: 0xd8b48a, dot: 6 },
  Saturn: { colour: 0xe3cf9a, dot: 5.5 },
};

/**
 * A plain ball lit by the Sun, for the Moon and the planets. With n the
 * direction from the ball's middle to a point on it and sunDir the direction
 * to the Sun, both one unit long, the point is in sunlight where
 *
 *   d = n · sunDir     is above zero
 *
 * and is drawn brighter the more squarely the light falls on it. The unlit
 * side is left just bright enough to make out.
 *
 * The Moon is also dimmed by the Earth's shadow. A point p, measured from the
 * Earth's middle in Earth radii, is `behind` the Earth by its distance along
 * the line away from the Sun, and `off` that line by its distance to the side.
 * With S the Sun's radius and D its distance, both in Earth radii:
 *
 *   full shadow reaches out to   1 − behind × (S − 1) ÷ D
 *   part shadow reaches out to   1 + behind × (S + 1) ÷ D
 *
 * both made 2% larger for the Earth's air, as in earthShadow (js/models.js).
 * The brightness and the red of the shadowed Moon are chosen for the drawing,
 * as is the softness of the full shadow's edge (3% of its radius either side).
 */
function litBall(radius, colour) {
  const uniforms = {
    colour: { value: new THREE.Color(colour) },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    ballRadius: { value: radius },
    shadowed: { value: 0 }, // 1 for the Moon, 0 for a planet
    fromEarth: { value: new THREE.Vector3(60, 0, 0) }, // the ball's middle, from the Earth's
    awayFromSun: { value: new THREE.Vector3(-1, 0, 0) }, // the direction of the Earth's shadow
    sunRadius: { value: SUN_RADIUS_KM / UNIT_KM },
    sunDist: { value: 23455 },
    growth: { value: SHADOW_GROWTH },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec3 vN;
        void main() {
          vN = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 colour;
        uniform vec3 sunDir;
        uniform float ballRadius;
        uniform float shadowed;
        uniform vec3 fromEarth;
        uniform vec3 awayFromSun;
        uniform float sunRadius;
        uniform float sunDist;
        uniform float growth;
        varying vec3 vN;
        void main() {
          vec3 n = normalize(vN);
          float d = dot(n, sunDir);
          float lit = smoothstep(-0.02, 0.02, d) * (0.35 + 0.65 * max(d, 0.0));
          float partLit = 1.0; // falls to 0 across the part shadow, as more of the Sun is hidden
          float outside = 1.0; // 0 inside the full shadow, with a narrow soft edge
          if (shadowed > 0.5) {
            vec3 p = fromEarth + n * ballRadius;
            float behind = dot(p, awayFromSun);
            if (behind > 0.0) {
              float off = length(p - awayFromSun * behind);
              float full = growth * (1.0 - behind * (sunRadius - 1.0) / sunDist);
              float part = growth * (1.0 + behind * (sunRadius + 1.0) / sunDist);
              partLit = smoothstep(full, part, off);
              outside = smoothstep(full * 0.97, full * 1.03, off);
            }
          }
          // In the part shadow the Moon is only a little dimmer, as it is to the eye. In the full shadow it is a dull red.
          vec3 sunlit = colour * (0.05 + 0.95 * lit) * (0.55 + 0.45 * partLit);
          vec3 eclipsed = vec3(0.42, 0.13, 0.07) * (0.05 + 0.95 * lit);
          gl_FragColor = vec4(mix(eclipsed, sunlit, outside), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  return { mesh, uniforms };
}

/** A closed or open line through a list of points [x, y, z], in scene units. */
function pathLine(points, colour, closed) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3));
  const mat = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.5 });
  const line = closed ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

/** A distance in km as text: "384,400 km", "147.7 million km", "1.43 billion km". */
export function spaceDistance(km) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)} billion km`;
  if (km >= 1e6) return `${Number((km / 1e6).toPrecision(4))} million km`;
  return `${Number(km.toPrecision(4)).toLocaleString('en-US')} km`;
}

export class SpaceView extends View3D {
  /**
   * `onGo(name)` is called when a body's dot is clicked. `readout`, if given,
   * is an element whose text is kept saying what is being looked at and from
   * how far.
   */
  constructor(container, land, landCanvas, { onGo, readout = null }) {
    super(container);
    this.readout = readout;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 2 * STAR_SHELL);
    this.camera.position.set(2.2, 1.6, 5.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.zoomSpeed = 2;
    this.controls.maxDistance = FARTHEST;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.scene.background = new THREE.Color(0x05080f);
    this.focus = 'Earth';
    this.sp = null;

    // The stars, so that there is something fixed to judge the turning and the tilt against.
    this.starCloud = new PointCloud(STARS.length, COLORS.star, { depthTest: true });
    this.starCloud.begin();
    for (const s of STARS) this.starCloud.add(scale3(starDirection(s.ra, s.dec), STAR_SHELL), outsideStarSize(s.mag, false));
    this.starCloud.end(0.85);
    this.scene.add(this.starCloud.object);
    const polaris = STARS.find((s) => s.name === 'Polaris');
    this.polarisAt = polaris ? scale3(starDirection(polaris.ra, polaris.dec), STAR_SHELL) : null;

    // The bodies. Each has a ball of its true size, a marker dot, and a name.
    this.bodies = {};
    for (const { name, radiusKm } of SPACE_BODIES) {
      const look = LOOKS[name];
      const radius = radiusKm / UNIT_KM;
      const body = { name, radius, at: new THREE.Vector3(), named: true };
      if (name === 'Sun') {
        // The Sun gives light and is not lit by anything, so it is one plain colour.
        body.object = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.MeshBasicMaterial({ color: look.colour }));
      } else if (name === 'Earth') {
        const ball = makeEarthBall(landCanvas);
        body.uniforms = ball.uniforms;
        body.ball = ball.mesh;
        body.object = new THREE.Group();
        body.object.add(ball.mesh);
        body.object.add(lineSegments(buildCoastPositions(land, onSphere), COLORS.coast, 0.75));
        body.object.add(lineSegments(buildGraticulePositions(onSphere), COLORS.grid, 0.22));
        body.object.add(lineSegments(buildLatitudePositions(onSphere, 0), COLORS.grid, 0.6));
        // The axis the Earth turns on, drawn out through both poles.
        body.object.add(lineSegments([0, -AXIS_REACH, 0, 0, AXIS_REACH, 0], COLORS.grid, 0.8));
        this.observerDot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), new THREE.MeshBasicMaterial({ color: COLORS.observer }));
        body.object.add(this.observerDot);
      } else {
        const ball = litBall(radius, look.colour);
        body.uniforms = ball.uniforms;
        body.object = ball.mesh;
      }
      this.scene.add(body.object);
      body.dot = new PointCloud(1, look.colour, { depthTest: true });
      this.scene.add(body.dot.object);
      body.label = this.labels.add(name === 'Sun' || name === 'Moon' || name === 'Earth' ? `The ${name}` : name, 'space');
      body.label.test = () => body.named;
      this.bodies[name] = body;
    }
    this.bodies.Moon.uniforms.shadowed.value = 1;

    this.observerLabel = this.labels.add('Observer', 'observer');
    this.northLabel = this.labels.add('North pole', 'space minor');
    this.polarisLabel = this.labels.add('Polaris', 'star');
    this.polarisLabel.visible = !!this.polarisAt;

    // The orbits: each planet's own path round the Sun, and the Moon's round the Earth. They are made when
    // the first moment arrives, since each is the almanac's places for a stretch of time joined up.
    this.orbits = null;
    this.moonOrbit = null;
    this.moonOrbitAt = null;

    // A click on a dot or a ball goes to that body.
    const seen = new THREE.Vector3();
    this.onClick((e) => {
      const click = this.ndc(e);
      let best = null;
      for (const body of Object.values(this.bodies)) {
        seen.copy(body.at).project(this.camera);
        if (seen.z < -1 || seen.z > 1) continue; // behind the camera
        const px = Math.hypot(((seen.x - click.x) * this.width) / 2, ((seen.y - click.y) * this.height) / 2);
        const reach = Math.max(CLICK_REACH_PX, this.pixelsAcross(body) / 2);
        if (px < reach && (!best || px < best.px)) best = { px, name: body.name };
      }
      if (best && best.name !== this.focus) onGo(best.name);
    });
  }

  /**
   * How many pixels wide a body is on screen. Something of radius r at a
   * distance d fills an angle of about 2r ÷ d, and the picture is `height`
   * pixels for the angle the camera takes in from top to bottom.
   */
  pixelsAcross(body) {
    const d = Math.max(1e-9, this.camera.position.distanceTo(body.at));
    return ((2 * body.radius) / d) * (this.height / (this.camera.fov * DEG));
  }

  /**
   * Draws one moment. `sp` is spaceScene's answer (js/space.js): where
   * everything is, in km from the Sun, and how the Earth is turned. `state` is
   * the app's settings, for the observer's place and what to show.
   */
  update(state, sp) {
    this.sp = sp;
    this.state = state;
    const origin = sp.at[this.focus];
    // Everything is placed from the thing being looked at, in Earth radii. The subtraction is done here, with
    // sixteen figures, before the graphics card sees it.
    const from = (km) => [(km[0] - origin[0]) / UNIT_KM, (km[1] - origin[1]) / UNIT_KM, (km[2] - origin[2]) / UNIT_KM];
    const sunAt = from(sp.at.Sun);
    for (const body of Object.values(this.bodies)) {
      const at = from(sp.at[body.name]);
      body.at.fromArray(at);
      body.object.position.fromArray(at);
      body.label.pos.fromArray(at);
      body.dot.begin();
      body.dot.add(at, LOOKS[body.name].dot);
      body.dot.end(1);
      // Light comes from the Sun: the direction from this body to it.
      if (body.name !== 'Sun' && body.name !== 'Earth') body.uniforms.sunDir.value.set(sunAt[0] - at[0], sunAt[1] - at[1], sunAt[2] - at[2]).normalize();
    }

    // The Earth, turned as the almanac says it is at this moment. Its ball is lit from the place the Sun is
    // overhead, as in the globe model's own view, and that place is worked out from this picture: the
    // direction from the Earth to the Sun, measured along the Earth's own axes (overheadPlace in js/space.js).
    const earth = this.bodies.Earth;
    const { x, y, z } = sp.turn;
    earth.object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
    earth.uniforms.sunDir.value.fromArray(globeVec(sp.sun.lat, sp.sun.lon));
    setEclipse(earth.uniforms, sp.sun, sp.moon);
    this.observerDot.position.fromArray(onSphere(state.lat, state.lon));
    this.observerLabel.pos.copy(earth.at).add(new THREE.Vector3(...placeDirection(sp.turn, state.lat, state.lon)).multiplyScalar(SURFACE));
    this.northLabel.pos.copy(earth.at).add(new THREE.Vector3(...y).multiplyScalar(AXIS_REACH));

    // The Moon, and the Earth's shadow that falls on it at an eclipse of the moon.
    const moon = this.bodies.Moon;
    moon.uniforms.fromEarth.value.copy(moon.at).sub(earth.at);
    moon.uniforms.awayFromSun.value.copy(earth.at).sub(this.bodies.Sun.at).normalize();
    moon.uniforms.sunDist.value = sp.sun.distKm / UNIT_KM;

    // The orbits. A planet's is the same path year after year, near enough, so it is made once. The Moon's
    // never repeats, so it is made again once the moment has moved half a day from the middle of the last one.
    if (!this.orbits) {
      this.orbits = PLANET_NAMES.map((name) => {
        const points = planetPath(name, sp.date, name === 'Earth' ? 1440 : 480).map((km) => km.map((v) => v / UNIT_KM));
        const line = pathLine(points, LOOKS[name].colour, true);
        this.scene.add(line);
        return line;
      });
    }
    for (const line of this.orbits) {
      line.position.fromArray(sunAt);
      line.visible = state.spaceOrbits;
    }
    if (!this.moonOrbitAt || Math.abs(sp.date - this.moonOrbitAt) > DAY_MS / 2) {
      const points = moonPath(sp.date, Math.round(MOON_MONTH_DAYS * 6)).map((km) => km.map((v) => v / UNIT_KM));
      if (this.moonOrbit) {
        this.moonOrbit.geometry.attributes.position.array.set(points.flat());
        this.moonOrbit.geometry.attributes.position.needsUpdate = true;
      } else {
        this.moonOrbit = pathLine(points, LOOKS.Moon.colour, false);
        this.scene.add(this.moonOrbit);
      }
      this.moonOrbitAt = sp.date.getTime();
    }
    this.moonOrbit.position.copy(earth.at);
    this.moonOrbit.visible = state.spaceOrbits;
    this.dirty = true;
  }

  /**
   * Goes to a body. `distKm` is how far from its middle to stand, or null to
   * stay as far off as the camera is now. `aboveDeg` is how far above the plane
   * of the Earth's orbit to look from, or null to keep the present angle.
   * `fit` backs off further on a tall, narrow screen, so that what fits across
   * a wide one still fits.
   */
  go(name, distKm = null, { aboveDeg = null, fit = false } = {}) {
    this.focus = name;
    this.controls.minDistance = this.bodies[name].radius * 1.15;
    let dist = distKm === null ? this.camera.position.length() : distKm / UNIT_KM;
    if (fit) dist /= Math.min(1, this.camera.aspect);
    dist = Math.min(FARTHEST, Math.max(this.controls.minDistance, dist));
    if (aboveDeg !== null) {
      // Keep the direction round the compass, and set the height above the orbit's plane.
      const round = Math.atan2(this.camera.position.z, this.camera.position.x);
      const up = aboveDeg * DEG;
      this.camera.position.set(Math.cos(up) * Math.cos(round), Math.sin(up), Math.cos(up) * Math.sin(round));
    }
    this.camera.position.setLength(dist);
    this.controls.update();
    if (this.sp) this.update(this.state, this.sp);
    this.dirty = true;
  }

  /** Swings the camera round the Earth so that it looks at the sunlit side, a little off to one side and from above. */
  faceDaySide() {
    if (!this.sp) return;
    const dist = this.camera.position.length();
    const toSun = this.bodies.Sun.at.clone().sub(this.bodies.Earth.at).normalize();
    const round = Math.atan2(toSun.z, toSun.x) + 40 * DEG;
    this.camera.position.set(Math.cos(round), 0.35, Math.sin(round)).setLength(dist);
    this.controls.update();
    this.dirty = true;
  }

  /** How far the camera is from the middle of what it is looking at, in km. */
  rangeKm() {
    return this.camera.position.length() * UNIT_KM;
  }

  /** Things that depend on where the camera is, put right just before each picture is drawn. */
  arrange() {
    const dist = this.camera.position.length();
    // The camera draws what lies between a nearest and a farthest distance, and tells near from far less well
    // the wider that range is. The nearest is kept at a hundredth of the way to what is being looked at.
    this.camera.near = Math.max(0.0005, dist * 0.01);
    this.camera.updateProjectionMatrix();
    // The stars go wherever the camera goes, so that moving about never shifts them.
    this.starCloud.object.position.copy(this.camera.position);
    if (this.polarisAt) this.polarisLabel.pos.fromArray(this.polarisAt).add(this.camera.position);
    const names = this.state?.spaceNames ?? true;
    const seen = new THREE.Vector3();
    const earth = this.bodies.Earth;
    const earthPx = this.pixelsAcross(earth);
    // Names. A body that is large on screen needs none. Where two names would lie on top of each other, the
    // one that comes first in this order is kept: what is being looked at, then the Sun, then outward.
    const order = [...new Set([this.focus, ...NAME_ORDER])];
    const taken = [];
    for (const name of order) {
      const body = this.bodies[name];
      seen.copy(body.at).project(this.camera);
      const [x, y] = [(seen.x * this.width) / 2, (seen.y * this.height) / 2];
      const large = this.pixelsAcross(body) >= NAMED_UNDER_PX;
      // A name starts just right of its dot and runs for about this many pixels.
      const wide = 10 + body.label.el.textContent.length * NAME_LETTER_PX;
      const clear = taken.every(([tx, ty, twide]) => x > tx + twide || tx > x + wide || Math.abs(y - ty) > NAME_HIGH_PX);
      body.named = names && !large && clear;
      if (body.named) taken.push([x, y, wide]);
    }
    // The observer and the pole are named only when the Earth is large enough to show them, and only on the near side.
    const near = (label) => {
      const out = label.pos.clone().sub(earth.at);
      return out.dot(this.camera.position.clone().sub(earth.at)) > out.lengthSq();
    };
    this.observerLabel.test = () => names && earthPx > 120 && near(this.observerLabel);
    this.northLabel.test = () => names && earthPx > 120;
    if (this.readout) this.readout.textContent = `${this.bodies[this.focus].label.el.textContent} from ${spaceDistance(this.rangeKm())}`;
  }

  render() {
    if (!this.dirty || this.hidden) return;
    this.arrange();
    super.render();
  }
}
