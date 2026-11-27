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
// Lengths in the scene are in Earth radii. The body the camera stays with is
// always at the middle of the scene, and everything else is placed from there.
// Each body is drawn from its own middle, and where that middle is from the
// camera is worked out with sixteen figures before the graphics card sees it.
// A graphics card's own seven figures would otherwise show as a wobble: the
// Earth is 23,000 of its own radii from the Sun.
//
// The camera has two ways of moving. On its circle it goes round the body it
// stays with and always looks at it. Moving freely it can be turned and taken
// anywhere, and taken round any body in any direction. It still keeps its
// place beside the body it stays with as the time runs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEG, EARTH_RADIUS_KM, SUN_RADIUS_KM } from '../astro.js';
import { globeVec, SHADOW_GROWTH } from '../models.js';
import { STARS } from '../stars.js';
import { SPACE_BODIES, SPACE_BODY, PLANET_NAMES, MOON_MONTH_DAYS, placeDirection, planetPath, moonPath, starDirection, nearestSurface, ballPoint } from '../space.js';
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

// Moving freely. Each second the camera covers this share of the distance to the nearest surface, so that it
// slows down as it comes near something and is quick across the empty stretches. Shift makes it this many times faster.
const FLY_RATE = 0.7;
const FLY_FAST = 3;
// The speed is worked out as if the nearest surface were never closer than this, in km, so that there is always a way off again.
const FLY_SLOWEST_KM = 50;
// How near a body the camera may come when moving freely: this many of the body's radii from its middle.
const FLY_CLEAR = 1.02;
// One notch of a mouse wheel reports about 100, and takes the camera a fifth of the way to the nearest surface.
const WHEEL_SHARE = 0.002;
// The most that one turn of a wheel, or one movement of a pinch, may cover: half the way to the nearest surface.
const MOST_AT_ONCE = 0.5;
// How far up or down the camera can be turned: just short of straight up, where left and right would lose their meaning.
const STEEPEST = 88 * DEG;
// A drag with the right button takes hold of a ball round a body and turns it. Where the body is large in the
// picture the ball is the body. From far off the body is too small to hold, and the ball is larger: seen from
// the camera, its edge is never nearer its middle than this share of the angle from the middle of the picture
// to the top.
const BALL_LEAST = 0.6;
// The six ways the camera can be moved, in the order of their buttons: three across, two down. `move` is how
// far forward, to the right and upward each one goes. `key` is the letter that does the same.
const WAYS = {
  up: { text: 'Up', key: 'E', move: [0, 0, 1] },
  forward: { text: 'Forward', key: 'W', move: [1, 0, 0] },
  down: { text: 'Down', key: 'Q', move: [0, 0, -1] },
  left: { text: 'Left', key: 'A', move: [0, -1, 0] },
  back: { text: 'Back', key: 'S', move: [-1, 0, 0] },
  right: { text: 'Right', key: 'D', move: [0, 1, 0] },
};
// The keys that move it, by where they are on the keyboard, not by the letter printed on them.
const KEYS = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyE: 'up', KeyQ: 'down' };

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

/** Keeps a press belonging to the element it began on, wherever the pointer goes next. A press made by a script has no pointer to keep. */
function capture(el, e) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // The press still counts. Its release is seen only if it happens over the same element.
  }
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
   * `onGo(name)` is called when a body's dot is clicked, and `onMove()` when
   * the camera is turned or moved freely. `readout`, if given, is an element
   * whose text is kept saying what is being looked at and from how far.
   */
  constructor(container, land, landCanvas, { onGo, onMove = null, readout = null }) {
    super(container);
    this.readout = readout;
    // Moving freely: off its circle, the camera can be turned and taken anywhere.
    this.free = false;
    this.onMove = onMove;
    this.keys = new Set(); // the keys held down, of those in KEYS
    this.pressed = new Set(); // the ways whose buttons are held down
    this.fast = false; // Shift is down
    this.flewAt = null; // when the camera was last moved by a held key or button
    this.fingers = new Map(); // where each finger or mouse button that is down was last seen
    this.held = null; // the body a drag with the right button has hold of
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
      // The dot sits at the body's middle, and is placed with the body.
      body.dot = new PointCloud(1, look.colour, { depthTest: true });
      body.dot.begin();
      body.dot.add([0, 0, 0], look.dot);
      body.dot.end(1);
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
    this.onClick((e) => {
      const name = this.bodyAt(e);
      if (name && (this.free || name !== this.focus)) onGo(name);
    });

    // ----- moving freely -----
    // A drag turns the camera, a drag with the right button takes it round a body, and a wheel or a pinch
    // takes it towards whatever is under the pointer, or back from it.
    const el = this.renderer.domElement;
    let spread = 0; // how far apart two fingers were, for a pinch
    el.addEventListener('pointerdown', (e) => {
      if (!this.free) return;
      capture(el, e);
      this.fingers.set(e.pointerId, [e.clientX, e.clientY]);
      spread = 0;
    });
    el.addEventListener('pointermove', (e) => {
      const was = this.fingers.get(e.pointerId);
      if (!this.free || !was) return;
      this.fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.fingers.size === 1) {
        if (e.buttons & 2) this.swing(was, [e.clientX, e.clientY]);
        else this.turn(e.clientX - was[0], e.clientY - was[1]);
      }
      if (this.fingers.size === 2) {
        const [a, b] = [...this.fingers.values()];
        const now = Math.hypot(a[0] - b[0], a[1] - b[1]);
        // Two fingers moved to twice as far apart go forward 0.69 of the way to the nearest surface: the
        // natural logarithm of 2. Brought together to half as far apart, they come back as much. The camera
        // goes along the line through the point half way between them.
        if (spread > 0 && now > 0) this.advance(Math.log(now / spread), this.ndc({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }));
        spread = now;
      }
    });
    const lift = (e) => {
      this.fingers.delete(e.pointerId);
      this.held = null;
      spread = 0;
    };
    el.addEventListener('pointerup', lift);
    el.addEventListener('pointercancel', lift);
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.free) return;
        e.preventDefault(); // the page would otherwise scroll
        // Some browsers count a wheel in lines, not pixels: about three lines to the notch.
        const turned = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        this.advance(-turned * WHEEL_SHARE, this.ndc(e));
      },
      { passive: false },
    );
    // The right button is for going round a body, so it brings up no menu.
    el.addEventListener('contextmenu', (e) => {
      if (this.free) e.preventDefault();
    });

    // Held keys move it, unless they are being typed into a list or a box.
    const typing = (e) => e.target instanceof Element && !!e.target.closest('select, textarea, input:not([type=checkbox])');
    window.addEventListener('keydown', (e) => {
      this.fast = e.shiftKey;
      if (!KEYS[e.code] || !this.free || this.hidden || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // the arrow keys would otherwise scroll the page
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.fast = e.shiftKey;
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    // The buttons do the same for a finger or a mouse. Each moves the camera for as long as it is held.
    this.pad = document.createElement('div');
    this.pad.className = 'fly-pad';
    this.pad.hidden = true;
    this.pad.setAttribute('role', 'group');
    this.pad.setAttribute('aria-label', 'Move the camera');
    for (const [way, { text, key }] of Object.entries(WAYS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.title = `${text}: hold this, or the ${key} key`;
      const hold = (on) => {
        if (on) this.pressed.add(way);
        else this.pressed.delete(way);
        button.classList.toggle('held', on);
      };
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        capture(button, e);
        hold(true);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => hold(false));
      button.addEventListener('contextmenu', (e) => e.preventDefault());
      // Pressed from the keyboard, a button moves one step: a quarter of the way to the nearest surface.
      button.addEventListener('click', (e) => {
        if (e.detail === 0) this.shift(...WAYS[way].move.map((v) => v * 0.25));
      });
      this.pad.appendChild(button);
    }
    container.appendChild(this.pad);
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
   * The body whose dot or ball is under a pointer, or null. Of those within
   * reach it is the one whose middle is nearest the pointer in the picture.
   * `e` is anything with a clientX and a clientY.
   */
  bodyAt(e) {
    const at = this.ndc(e);
    const seen = new THREE.Vector3();
    let best = null;
    for (const body of Object.values(this.bodies)) {
      seen.copy(body.at).project(this.camera);
      if (seen.z < -1 || seen.z > 1) continue; // behind the camera
      const px = Math.hypot(((seen.x - at.x) * this.width) / 2, ((seen.y - at.y) * this.height) / 2);
      const reach = Math.max(CLICK_REACH_PX, this.pixelsAcross(body) / 2);
      if (px < reach && (!best || px < best.px)) best = { px, name: body.name };
    }
    return best?.name ?? null;
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
      body.dot.object.position.fromArray(at);
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
    // As the time runs, a body can come to where a free camera is. The camera is moved out of its way.
    if (this.free) this.keepClear();
    this.dirty = true;
  }

  /**
   * Goes to a body, looks at it, and stays with it from then on. `distKm` is
   * how far from its middle to stand, or null to stay as far off as the camera
   * is now, and no nearer than four of the body's radii. `aboveDeg` is how far
   * above the plane of the Earth's orbit to look from, or null to keep the
   * present angle. `fit` backs off further on a tall, narrow screen, so that
   * what fits across a wide one still fits. A camera that is no longer level
   * is set level again.
   */
  go(name, distKm = null, { aboveDeg = null, fit = false } = {}) {
    this.focus = name;
    this.controls.minDistance = this.bodies[name].radius * 1.15;
    let dist = distKm === null ? Math.max(this.camera.position.length(), this.bodies[name].radius * 4) : distKm / UNIT_KM;
    if (fit) dist /= Math.min(1, this.camera.aspect);
    dist = Math.min(FARTHEST, Math.max(this.controls.minDistance, dist));
    if (aboveDeg !== null) {
      // Keep the direction round the compass, and set the height above the orbit's plane.
      const round = Math.atan2(this.camera.position.z, this.camera.position.x);
      const up = aboveDeg * DEG;
      this.camera.position.set(Math.cos(up) * Math.cos(round), Math.sin(up), Math.cos(up) * Math.sin(round));
    }
    this.camera.position.setLength(dist);
    this.camera.up.set(0, 1, 0);
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

  /**
   * Changes which body the camera stays with as the time runs. On its circle
   * the camera goes to that body, as far from it as it was from the last one.
   * Moving freely it stays exactly where it is and looks the same way, and
   * only what it travels beside changes: its place is measured from the new
   * body in place of the old.
   */
  stayWith(name) {
    if (name === this.focus) return;
    if (!this.free || !this.sp) {
      this.go(name);
      return;
    }
    const [was, now] = [this.sp.at[this.focus], this.sp.at[name]];
    this.camera.position.add(new THREE.Vector3((was[0] - now[0]) / UNIT_KM, (was[1] - now[1]) / UNIT_KM, (was[2] - now[2]) / UNIT_KM));
    this.focus = name;
    this.controls.minDistance = this.bodies[name].radius * 1.15;
    this.update(this.state, this.sp);
  }

  /** Takes the camera off its circle to move freely, or puts it back. */
  setFree(on) {
    if (on === this.free) return;
    this.free = on;
    this.controls.enabled = !on;
    this.pad.hidden = !on;
    this.keys.clear();
    this.pressed.clear();
    this.fingers.clear();
    this.held = null;
    // Back on its circle, the camera is level again and looks at the body it stays with, from wherever it has got to.
    if (!on) {
      this.camera.up.set(0, 1, 0);
      this.controls.update();
    }
    this.dirty = true;
  }

  /** Where the camera is and which body's surface is nearest it: nearestSurface's answer (js/space.js). */
  nearest() {
    const from = this.sp.at[this.focus];
    const p = this.camera.position;
    return nearestSurface([from[0] + p.x * UNIT_KM, from[1] + p.y * UNIT_KM, from[2] + p.z * UNIT_KM], this.sp.at);
  }

  /**
   * Turns a free camera by a drag of `dx` pixels across and `dy` down. The
   * picture follows the pointer, as it does on the circle: the camera turns
   * the other way, by the angle one pixel takes up,
   *
   *   the angle the camera takes in from top to bottom ÷ the picture's height
   *
   * for each pixel. Left and right are measured round the camera's own "up",
   * and up and down from the level that is square to it. That "up" is the
   * north of the Earth's orbit until the camera is taken round a body (`swing`).
   */
  turn(dx, dy) {
    if (!this.free) return;
    const perPixel = (this.camera.fov * DEG) / this.height;
    const pole = this.camera.up;
    const facing = this.camera.getWorldDirection(new THREE.Vector3());
    const rise = facing.dot(pole);
    const up = Math.max(-STEEPEST, Math.min(STEEPEST, Math.asin(Math.max(-1, Math.min(1, rise))) + dy * perPixel));
    // The level part of the way it faces. Facing straight along its "up" it has none, and the top of the
    // picture, or the bottom, is what lies ahead.
    const level = facing.clone().addScaledVector(pole, -rise);
    if (level.lengthSq() < 1e-12) level.setFromMatrixColumn(this.camera.matrixWorld, 1).multiplyScalar(rise < 0 ? 1 : -1);
    level.normalize().applyAxisAngle(pole, dx * perPixel);
    this.camera.lookAt(this.camera.position.clone().addScaledVector(level, Math.cos(up)).addScaledVector(pole, Math.sin(up)));
    this.dirty = true;
    this.onMove?.();
  }

  /**
   * A drag with the right button from `was` to `now`, each [x, y] in the
   * page's pixels. It takes hold of a ball round a body and turns it, as a
   * hand turns a ball: the point of the ball that was under the pointer is
   * still under it afterwards. The body is the one the drag began on, or the
   * nearest if it began on none.
   *
   * Nothing in the scene is turned. The camera goes round the body's middle
   * the other way, and the way it faces and its own "up" go round with it. So
   * the body can be seen from any side and any way up.
   *
   * With p and q the points of the ball under the pointer before and after,
   * measured from the body's middle (ballPoint, js/space.js), the camera is
   * given the least turn that carries q to p. Off the ball there is no such
   * point. There p and q are the two lines of sight, less the part of each
   * that lies along the line to the body's middle. The least turn from one to
   * the other is round that line, so the picture twists about the body by the
   * angle the pointer goes round it.
   */
  swing(was, now) {
    if (!this.free || !this.sp) return;
    this.held ??= this.bodyAt({ clientX: was[0], clientY: was[1] }) ?? this.nearest().name;
    const body = this.bodies[this.held];
    const eye = this.camera.position;
    const far = eye.distanceTo(body.at);
    const ball = Math.max(body.radius, far * Math.sin((BALL_LEAST * this.camera.fov * DEG) / 2));
    if (far <= ball) return;
    const lines = [was, now].map(([x, y]) => this.through(this.ndc({ clientX: x, clientY: y })));
    const on = lines.map((way) => ballPoint(eye.toArray(), way.toArray(), body.at.toArray(), ball));
    const toMiddle = body.at.clone().sub(eye).normalize();
    const [p, q] = on.every(Boolean)
      ? on.map((at) => new THREE.Vector3(...at).sub(body.at).normalize())
      : lines.map((way) => way.addScaledVector(toMiddle, -way.dot(toMiddle)).normalize());
    // A line of sight straight away from the body is no way round it.
    if (p.lengthSq() === 0 || q.lengthSq() === 0) return;
    const round = new THREE.Quaternion().setFromUnitVectors(q, p);
    const facing = this.camera.getWorldDirection(new THREE.Vector3()).applyQuaternion(round);
    eye.sub(body.at).applyQuaternion(round).add(body.at);
    this.camera.up.applyQuaternion(round).normalize();
    this.camera.lookAt(eye.clone().add(facing));
    this.keepClear();
    this.dirty = true;
    this.onMove?.();
  }

  /**
   * The direction from the camera out through one point of the picture. `at`
   * is that point as `ndc` gives it: x and y each run from −1 to 1 across the
   * picture, with y upward. With `half` the tangent of half the angle the
   * camera takes in from top to bottom, the direction is
   *
   *   forward + right × x × half × (width ÷ height) + above × y × half
   *
   * made one unit long. The middle of the picture gives the way the camera faces.
   */
  through(at) {
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const above = new THREE.Vector3().crossVectors(right, forward);
    const half = Math.tan((this.camera.fov * DEG) / 2);
    return forward.addScaledVector(right, at.x * half * this.camera.aspect).addScaledVector(above, at.y * half).normalize();
  }

  /**
   * Moves a free camera: `along` the way it faces, `across` to its right and
   * `up`, each as a share of the distance to the nearest surface. Covering a
   * share of what is left each time, it can come as near a body as it likes
   * and never reach it.
   */
  shift(along, across = 0, up = 0) {
    if (!this.free || !this.sp) return;
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const above = new THREE.Vector3().crossVectors(right, forward);
    this.carry(forward.multiplyScalar(along).addScaledVector(right, across).addScaledVector(above, up));
  }

  /** Moves a free camera by `step`: a direction, times a share of the distance to the nearest surface. */
  carry(step) {
    const pace = Math.max(this.nearest().gapKm, FLY_SLOWEST_KM) / UNIT_KM;
    this.camera.position.addScaledVector(step, pace);
    this.keepClear();
    this.dirty = true;
    this.onMove?.();
  }

  /**
   * One turn of a wheel or one movement of a pinch: towards the point of the
   * picture `at` (as `ndc` gives it), or back from it for less than nothing,
   * by a share of the distance to the nearest surface. The camera moves along
   * the line through that point and does not turn, so whatever is under the
   * pointer stays under it.
   */
  advance(share, at = new THREE.Vector2()) {
    if (!this.free || !this.sp) return;
    this.carry(this.through(at).multiplyScalar(Math.max(-MOST_AT_ONCE, Math.min(MOST_AT_ONCE, share))));
  }

  /** Keeps a free camera outside every body, and no further from the body it stays with than the view reaches. */
  keepClear() {
    const out = new THREE.Vector3();
    for (const body of Object.values(this.bodies)) {
      const least = body.radius * FLY_CLEAR;
      out.copy(this.camera.position).sub(body.at);
      if (out.length() >= least) continue;
      if (out.lengthSq() === 0) out.set(0, 1, 0);
      this.camera.position.copy(body.at).add(out.setLength(least));
    }
    if (this.camera.position.length() > FARTHEST) this.camera.position.setLength(FARTHEST);
  }

  /**
   * Moves a free camera for the keys and buttons that are held, by the time
   * since the last picture. In t seconds it covers
   *
   *   FLY_RATE × t × the distance to the nearest surface
   *
   * in each of the ways being held, and FLY_FAST times that with Shift down.
   */
  fly() {
    const now = performance.now();
    // Never more than a tenth of a second at once: after a pause nothing leaps ahead.
    const dt = Math.min(0.1, (now - (this.flewAt ?? now)) / 1000);
    this.flewAt = now;
    if (!this.free || this.hidden) return;
    const held = new Set(this.pressed);
    for (const code of this.keys) held.add(KEYS[code]);
    const share = FLY_RATE * (this.fast ? FLY_FAST : 1) * dt;
    const sum = [0, 0, 0];
    for (const way of held) WAYS[way].move.forEach((v, i) => (sum[i] += v * share));
    if (sum.some((v) => v !== 0)) this.shift(...sum);
  }

  /** How far the camera is from the middle of the body it stays with, in km. */
  rangeKm() {
    return this.camera.position.length() * UNIT_KM;
  }

  /** Things that depend on where the camera is, put right just before each picture is drawn. */
  arrange() {
    // The camera draws what lies between a nearest and a farthest distance, and tells near from far less well
    // the wider that range is. The nearest is kept at a twentieth of the way to the nearest surface.
    const nearest = this.sp ? this.nearest() : { name: this.focus, gapKm: this.rangeKm() };
    this.camera.near = Math.max(0.0005, (Math.max(0, nearest.gapKm) / UNIT_KM) * 0.05);
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
    if (this.readout) {
      const called = (name) => this.bodies[name].label.el.textContent;
      const within = (name) => called(name).replace(/^The /, 'the ');
      this.readout.textContent = this.free
        ? `Moving freely, staying with ${within(this.focus)}. Nearest: ${within(nearest.name)}, ${spaceDistance(Math.max(0, nearest.gapKm))} off.`
        : `${called(this.focus)} from ${spaceDistance(this.rangeKm())}`;
    }
  }

  render() {
    this.fly();
    if (!this.dirty || this.hidden) return;
    this.arrange();
    super.render();
  }
}
