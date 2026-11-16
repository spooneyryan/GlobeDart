// The view from where the observer stands: the sky as one model predicts it,
// over the ground of the place (see ground.js). There are two of these side by
// side, one for each model, and they share one direction of looking and one zoom.
//
// This view decides nothing. It is handed a bearing and a height for the sun,
// the moon and each star, already worked out by the model (js/models.js), and
// the bearing and height that are measured (js/astro.js). It draws the model's
// as the thing itself and the measured as a teal ring, so that any gap between
// the two can be seen.
//
// Angles are in degrees: a bearing clockwise from north, and a height above the
// horizon. In the scene east is +x, up is +y and north is −z, and the eye is at
// the middle. Everything in the sky is drawn on a ball FAR units out. The
// distance means nothing; only directions and widths as angles are real.
import * as THREE from 'three';
import { DEG } from '../astro.js';
import { View3D, COLORS, lineSegments, DynamicSegments, PointCloud, makeGlowSprite, smooth } from '../scene-utils.js';
import { Ground } from './ground.js';

const FAR = 500;

// The inset in the corner shows the sun at one fixed zoom, whatever the main view is doing: 150 pixels to a
// degree. Its lens is 120 pixels across (css/style.css), so it shows a patch of sky 0.8° wide.
const SCOPE_PX_PER_DEG = 150;
const SCOPE_LENS_PX = 120;

// The sizes of the marks, in degrees from the middle to the edge as seen. They are markers, not widths of anything.
const MEASURED_RING_DEG = 1.6; // the ring where the sun or the moon is measured to be
const STAR_RING_DEG = 1.1; // the ring where the chosen star is measured to be
const OWN_MARK_DEG = 1.15; // the diamond at the user's own measurement
// The moon is drawn no smaller than this, nearly twice its true 0.26°, so that it can be found. The sun is always true size.
const MOON_SHOWN_DEG = 0.45;

/**
 * The point `dist` out from the eye in a direction of the sky. With a the
 * bearing and e the height:
 *   east  = cos e × sin a
 *   up    = sin e
 *   north = cos e × cos a        (north is −z in the scene)
 */
function skyDir(azDeg, elDeg, dist = 1) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return new THREE.Vector3(
    Math.cos(e) * Math.sin(a) * dist,
    Math.sin(e) * dist,
    -Math.cos(e) * Math.cos(a) * dist,
  );
}

/** Adds the line from a to b to a flat list of numbers for lineSegments. */
const segment = (out, a, b) => out.push(a.x, a.y, a.z, b.x, b.y, b.z);

/** A flat shape of radius one that is always drawn, whatever is in front: a disc or a ring to be put on the sky. */
function flatMark(geometry, color, order) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide }));
  mesh.renderOrder = order;
  return mesh;
}

/**
 * Puts such a shape on the sky at a bearing and height, facing the eye, and
 * `radiusDeg` from its middle to its edge as seen. Something that far out
 * needs a radius of
 *   FAR × tan(radiusDeg)
 * which is returned.
 */
function setOnSky(mesh, azDeg, elDeg, radiusDeg) {
  const radius = FAR * Math.tan(radiusDeg * DEG);
  mesh.position.copy(skyDir(azDeg, elDeg, FAR));
  mesh.lookAt(0, 0, 0);
  mesh.scale.setScalar(radius);
  return radius;
}

// The colours of the sky and the sun. They are chosen to look right; none is worked out from anything.
const NIGHT_TOP = new THREE.Color(0x060a16);
const NIGHT_LOW = new THREE.Color(0x0d1426);
const DAY_TOP = new THREE.Color(0x2a69bf);
const DAY_LOW = new THREE.Color(0xa6caee);
const DUSK_LOW = new THREE.Color(0xe58c55);
const SUN_LOW = new THREE.Color(0xff7b3a);
const SUN_HIGH = new THREE.Color(0xfff4d2);

export class SkyView extends View3D {
  /**
   * @param container  a .view element
   * @param onLook     called with { az, pitch, fov } when the user drags or zooms, so both sky views can follow
   * @param onPick     called with a direction { az, el } and the zoom when the sky is clicked, or null
   */
  constructor(container, { onLook, onPick = null }) {
    super(container);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.2, 2000);
    this.camera.rotation.order = 'YXZ';
    this.look = { az: 180, pitch: 20, fov: 60 };

    // The sky itself: a colour that runs from uLow at the horizon to uTop overhead, and a glow round the sun.
    // With d the direction of a point of the sky and s the cosine of its angle from the sun:
    //
    //   colour = uLow → uTop by (sin height)^0.45        most of the change is near the horizon
    //   glow   = uGlow × (0.35 × s^400 + 0.10 × s^24)    a tight glow, down to half 3° from the sun,
    //                                                    and a wide one, down to half 14° away
    //
    // Both are for looks. The sun's own disc is drawn separately, at its true width.
    this.skyUniforms = {
      uTop: { value: DAY_TOP.clone() },
      uLow: { value: DAY_LOW.clone() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, // toward this model's sun
      uGlow: { value: 1 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uTop;
          uniform vec3 uLow;
          uniform vec3 uSunDir;
          uniform float uGlow;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            vec3 c = mix(uLow, uTop, pow(clamp(d.y, 0.0, 1.0), 0.45));
            float s = max(dot(d, uSunDir), 0.0);
            c += uGlow * vec3(1.0, 0.85, 0.6) * (pow(s, 400.0) * 0.35 + pow(s, 24.0) * 0.10);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.renderOrder = 0;
    this.scene.add(sky);

    // A faint grid for reading angles off the sky: a circle of equal height every 10° and a line of equal
    // bearing every 30°. Off unless asked for: see setGrid.
    const grid = [];
    for (let el = 10; el < 90; el += 10) {
      for (let az = 0; az < 360; az += 3) segment(grid, skyDir(az, el, FAR), skyDir(az + 3, el, FAR));
    }
    for (let az = 0; az < 360; az += 30) {
      for (let el = 0; el < 90; el += 5) segment(grid, skyDir(az, el, FAR), skyDir(az, el + 5, FAR));
    }
    this.grid = lineSegments(grid, 0xffffff, 0.16);
    this.grid.material.depthTest = false;
    this.grid.renderOrder = 1;
    this.grid.visible = false;
    this.scene.add(this.grid);

    // Stars, drawn only when the app passes them in: where each is measured to be
    // (teal, underneath) and where this model puts it (white, on top).
    this.starMeasured = new PointCloud(120, COLORS.measured);
    this.starMeasured.object.renderOrder = 1.2;
    this.starTrails = new DynamicSegments(120 * 36, COLORS.star, 0.28);
    this.starTrails.object.renderOrder = 1.3;
    this.starLines = new DynamicSegments(80, COLORS.star, 0.4);
    this.starLines.object.renderOrder = 1.4;
    // The fainter stars of the full catalogue, drawn behind the named ones.
    this.starField = new PointCloud(9000, COLORS.star);
    this.starField.object.renderOrder = 1.1;
    this.starPoints = new PointCloud(120, COLORS.star);
    this.starPoints.object.renderOrder = 1.5;
    this.starParts = [this.starMeasured, this.starTrails, this.starLines, this.starPoints, this.starField];
    for (const part of this.starParts) {
      part.object.material.depthTest = false;
      part.object.visible = false;
      this.scene.add(part.object);
    }
    this.starRing = flatMark(new THREE.RingGeometry(0.8, 1, 48), COLORS.measured, 1.6);
    this.starRing.visible = false;
    this.scene.add(this.starRing);

    // Where the sun is actually measured to be (same marker in both views).
    this.measuredRing = flatMark(new THREE.RingGeometry(0.86, 1, 64), COLORS.measured, 2);
    this.scene.add(this.measuredRing);

    // Where this model puts the sun: a disc of the width the model gives it, and a glow.
    this.glow = makeGlowSprite('255, 226, 160');
    this.glow.renderOrder = 3;
    this.scene.add(this.glow);
    this.sun = flatMark(new THREE.CircleGeometry(1, 64), 0xfff4d2, 4);
    this.scene.add(this.sun);

    // The moon, drawn only when the app passes it in: a ring where it is measured
    // to be and a disc where this model puts it.
    this.moonRing = flatMark(new THREE.RingGeometry(0.86, 1, 64), COLORS.measured, 4.1);
    this.moonRing.visible = false;
    this.scene.add(this.moonRing);
    this.moon = flatMark(new THREE.CircleGeometry(1, 48), 0xdfe5ec, 4.2);
    this.moon.visible = false;
    this.scene.add(this.moon);

    // The user's own measurement, when one matches the time and place on show:
    // a diamond if they measured a bearing too, otherwise a ring at their elevation.
    this.ownMark = flatMark(new THREE.RingGeometry(0.74, 1, 4), COLORS.own, 4.5);
    this.ownMark.visible = false;
    this.scene.add(this.ownMark);
    this.ownCircle = new DynamicSegments(180, COLORS.own, 0.95);
    this.ownCircle.object.material.depthTest = false;
    this.ownCircle.object.renderOrder = 4.5;
    this.scene.add(this.ownCircle.object);

    // The ground: everything below the horizon is hidden, as it is in life.
    this.ground = new Ground(this.scene);
    const horizon = [];
    for (let az = 0; az < 360; az += 2) segment(horizon, skyDir(az, 0, FAR), skyDir(az + 2, 0, FAR));
    this.horizonLine = lineSegments(horizon, 0xffffff, 0.5);
    this.horizonLine.material.depthTest = false;
    this.horizonLine.renderOrder = 6;
    this.horizonLine.visible = false;
    this.scene.add(this.horizonLine);

    // Labels. The eight compass points always show; the finer bearings and the elevations come with the grid.
    this.gridLabels = [];
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let az = 0; az < 360; az += 15) {
      const major = az % 45 === 0;
      if (!major && az % 30 !== 0) continue;
      const item = this.labels.add(major ? `${compass[az / 45]} ${az}°` : `${az}°`, major ? 'compass' : 'compass minor');
      item.pos.copy(skyDir(az, 0, FAR));
      if (!major) this.gridLabels.push(item);
    }
    for (const az of [0, 90, 180, 270]) {
      for (let el = 10; el < 90; el += 10) {
        const item = this.labels.add(`${el}°`, 'elev');
        item.pos.copy(skyDir(az + 1.5, el, FAR));
        this.gridLabels.push(item);
      }
    }
    for (const item of this.gridLabels) item.visible = false;
    this.sunLabel = this.labels.add('', 'sun');
    this.measuredLabel = this.labels.add('measured position', 'measured');
    this.ownLabel = this.labels.add('', 'own');
    this.ownLabel.visible = false;
    this.starLabel = this.labels.add('', 'star');
    this.starLabel.visible = false;
    this.starMeasuredLabel = this.labels.add('', 'measured');
    this.starMeasuredLabel.visible = false;
    this.moonLabel = this.labels.add('moon', 'star');
    this.moonLabel.visible = false;
    this.moonMeasuredLabel = this.labels.add('moon, measured', 'measured');
    this.moonMeasuredLabel.visible = false;

    // Readout chip and the fixed-magnification "solar filter" inset.
    this.readout = document.createElement('div');
    this.readout.className = 'readout';
    container.appendChild(this.readout);
    this.scope = document.createElement('div');
    this.scope.className = 'scope';
    this.scope.innerHTML =
      '<div class="scope-lens"><div class="scope-sun"></div><div class="scope-ground"></div>' +
      '<canvas class="scope-moon" width="240" height="240"></canvas></div>' +
      '<div class="scope-caption"></div>';
    container.appendChild(this.scope);
    this.scopeSun = this.scope.querySelector('.scope-sun');
    this.scopeGround = this.scope.querySelector('.scope-ground');
    this.scopeCaption = this.scope.querySelector('.scope-caption');
    this.scopeMoon = this.scope.querySelector('.scope-moon');

    // Drag to look around; wheel or a two-finger pinch to zoom.
    const el = this.renderer.domElement;
    const pointers = new Map();
    let pinch = null;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    };
    // A press that is let go where it started is a click on the sky, not a drag.
    let press = null;
    el.addEventListener('pointerdown', (e) => {
      press = pointers.size === 0 ? [e.clientX, e.clientY] : null;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) pinch = { spread: spread(), fov: this.look.fov };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety (it keeps a drag alive outside the view); carry on without it.
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size >= 2) {
        // Fingers twice as far apart show half as much sky.
        onLook({ ...this.look, fov: (pinch.fov * pinch.spread) / spread() });
        return;
      }
      // The view shows `fov` degrees from top to bottom, so a drag of one pixel turns it by this many degrees.
      const perPx = this.look.fov / this.height;
      onLook({
        az: this.look.az - (e.clientX - prev[0]) * perPx,
        pitch: this.look.pitch + (e.clientY - prev[1]) * perPx,
        fov: this.look.fov,
      });
    });
    const stop = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    el.addEventListener('pointerup', (e) => {
      if (onPick && press && Math.hypot(e.clientX - press[0], e.clientY - press[1]) < 5) {
        // The direction under the pointer: out from the eye, through that point on the screen. Its bearing
        // and height are skyDir's sums turned round.
        const box = el.getBoundingClientRect();
        const ray = new THREE.Vector3(((e.clientX - box.left) / box.width) * 2 - 1, 1 - ((e.clientY - box.top) / box.height) * 2, 0.5)
          .unproject(this.camera)
          .normalize();
        onPick({ az: ((Math.atan2(ray.x, -ray.z) / DEG) + 360) % 360, el: Math.asin(ray.y) / DEG }, this.look.fov);
      }
      press = null;
    });
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        onLook({ ...this.look, fov: this.look.fov * Math.exp(e.deltaY * 0.0012) });
      },
      { passive: false },
    );
    this.setLook(this.look);
  }

  /** Changes the scenery under the sky to suit a kind of place (see js/place.js). */
  setPlace(kind) {
    if (this.ground.kind === kind) return;
    this.ground.setPlace(kind);
    this.dirty = true;
  }

  /** Shows or hides the lines of equal elevation and bearing, their labels and the line of the horizon. */
  setGrid(on) {
    if (this.grid.visible === on) return;
    this.grid.visible = this.horizonLine.visible = on;
    for (const item of this.gridLabels) item.visible = on;
    this.dirty = true;
  }

  /** How far down from the top of the view the readout reaches, in pixels. */
  coveredTop() {
    return this.hidden ? 0 : this.readout.offsetTop + this.readout.offsetHeight;
  }

  /**
   * Turns the eye. `az` is the bearing looked along, `pitch` how far above
   * level, and `fov` how many degrees of sky the view shows from top to bottom
   * (less is more zoom). Each is kept within what the view can show.
   */
  setLook(look) {
    this.look = {
      az: ((look.az % 360) + 360) % 360,
      pitch: Math.min(89, Math.max(-55, look.pitch)),
      fov: Math.min(100, Math.max(2, look.fov)),
    };
    this.camera.rotation.set(this.look.pitch * DEG, -this.look.az * DEG, 0);
    this.camera.fov = this.look.fov;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /**
   * @param sun       {az, el, sizeDeg} this model's prediction
   * @param measured  {az, el} the measured position
   * @param lit       whether this model says it is daytime here
   * @param text      readout text
   * @param own       {az, el, star, nearAz} the user's own measurement for this moment, or null (az may be null;
   *                  star is the star's name, or null for the sun; nearAz is the bearing to put its label beside)
   * @param stars     null, or { model, measured, mags, lines, trails, selected, name }: this model's
   *                  and the measured {az, el} of every star, the index and name of the chosen one
   * @param moon      null, or { model, measured, lit, side, shadow, cover }: where this model puts the moon and
   *                  where it is measured ({az, el, sizeDeg}), the fraction of its face this model lights,
   *                  which way the lit side faces, the Earth's shadow on it if this model has one, and the
   *                  share of the sun this model has it hiding
   */
  update(sun, measured, lit, text, own = null, stars = null, moon = null) {
    const el = sun.el;
    // How light the sky is. It follows this model's own sun: the height the model gives it here, and whether
    // the model says its light reaches here. The figures are chosen to look like a real sky. They colour
    // the picture and nothing else: where the sun is drawn does not depend on them.
    //
    //   day    = 0 with the sun 6° below the horizon, rising smoothly to 1 with it 8° above
    //   bright = day × (0.16 + 0.84 × (1 − hidden)^¼)
    //   dusk   = strongest with the sun just below the horizon, gone by 12° below and by 14° above
    //
    // `hidden` is the share of the sun this model has the moon covering. In an eclipse of the sun the
    // daylight goes slowly at first, as the eye sees it, and when all of the sun is hidden there is dusk
    // all round the horizon.
    const hidden = moon?.cover ?? 0;
    const day = lit ? smooth(-6, 8, el) : 0;
    const bright = day * (0.16 + 0.84 * Math.pow(1 - hidden, 0.25));
    const dusk = lit ? Math.max(smooth(-12, -2, el) * (1 - smooth(0, 14, el)), 0.8 * day * Math.pow(hidden, 12)) : 0;
    this.skyUniforms.uTop.value.copy(NIGHT_TOP).lerp(DAY_TOP, bright);
    this.skyUniforms.uLow.value.copy(NIGHT_LOW).lerp(DAY_LOW, bright).lerp(DUSK_LOW, dusk * 0.85);
    this.skyUniforms.uSunDir.value.copy(skyDir(sun.az, el));
    this.skyUniforms.uGlow.value = (lit ? 0.4 + 0.6 * smooth(-4, 4, el) : 0.25) * (1 - 0.8 * hidden);
    this.ground.update({ bright, dusk, low: this.skyUniforms.uLow.value, sunDir: this.skyUniforms.uSunDir.value, sunEl: el, lit, hidden });

    // The sun: a disc at the bearing and height the model gives, and as wide as the model says it looks
    // from here (`sizeDeg`). It reddens below 14° up, for looks.
    const sunColor = SUN_LOW.clone().lerp(SUN_HIGH, smooth(0, 14, el));
    const radius = setOnSky(this.sun, sun.az, el, sun.sizeDeg / 2);
    // A model can say its sun is up but that its light does not reach this place. Then the sun is drawn where the
    // model has it, as a dull disc with no glow, under a dark sky.
    const unlit = !lit && el + sun.sizeDeg / 2 > 0; // up: some of its disc is above the horizon
    this.sun.material.color.copy(sunColor).multiplyScalar(unlit ? 0.3 : 1);
    this.glow.position.copy(this.sun.position);
    this.glow.scale.setScalar(radius * 14);
    this.glow.material.color.copy(sunColor);
    this.glow.material.opacity = unlit ? 0.06 : 1 - 0.8 * hidden;

    // The ring where the sun is measured to be. Where the model is right, the disc sits in the middle of it.
    setOnSky(this.measuredRing, measured.az, measured.el, MEASURED_RING_DEG);
    this.measuredRing.visible = measured.el > -1.5;
    this.measuredLabel.pos.copy(skyDir(measured.az, measured.el + 2.6, FAR));
    this.measuredLabel.visible = measured.el > 0;

    this.ownMark.visible = !!own && own.az !== null;
    this.ownLabel.visible = !!own;
    this.ownCircle.begin();
    if (own && own.az !== null) {
      setOnSky(this.ownMark, own.az, own.el, OWN_MARK_DEG);
      this.ownLabel.pos.copy(this.ownMark.position);
      this.ownLabel.el.textContent = own.star ? `you measured ${own.star}` : 'you measured';
    } else if (own) {
      // A height with no bearing could be anywhere round the sky at that height, so it is drawn as the whole circle.
      for (let az = 0; az < 360; az += 2) {
        this.ownCircle.add(skyDir(az, own.el, FAR).toArray(), skyDir(az + 2, own.el, FAR).toArray());
      }
      // The label sits on the ring beside what was measured: the sun, or the star.
      this.ownLabel.pos.copy(skyDir((own.nearAz ?? measured.az) + 7, own.el, FAR));
      this.ownLabel.el.textContent = `you measured ${own.star ? `${own.star} ` : ''}${own.el.toFixed(1)}° up`;
    }
    this.ownCircle.end();

    this.updateStars(stars, bright);

    this.sunLabel.pos.copy(skyDir(sun.az, el - 2.2, FAR));
    this.sunLabel.el.textContent = unlit ? 'sun, out of its light' : 'sun';
    this.sunLabel.visible = el > 2.5;
    this.readout.textContent = text;

    // Inset: the sun at a fixed magnification, with the horizon if it is close. The sun stays in the middle
    // of the lens and the ground's top edge is put `el` degrees below it, as a percentage of the lens's
    // height. Beyond 1° either way the horizon is well out of the lens, so it is taken no further.
    const px = Math.max(2, sun.sizeDeg * SCOPE_PX_PER_DEG);
    this.scopeSun.style.width = this.scopeSun.style.height = `${px.toFixed(1)}px`;
    this.scopeSun.style.background = `#${this.sun.material.color.getHexString()}`;
    const groundTop = 50 + (Math.max(-1, Math.min(1, el)) * SCOPE_PX_PER_DEG * 100) / SCOPE_LENS_PX;
    this.scopeGround.style.top = `${groundTop.toFixed(1)}%`;
    this.scopeCaption.textContent =
      el < -sun.sizeDeg / 2 - 0.05
        ? 'Sun is below the horizon'
        : `Sun at the same zoom: ${sun.sizeDeg.toFixed(2)}° wide`;
    this.updateMoon(moon);
    this.dirty = true;
  }

  /** Draws the moon in the sky and its face in the inset, or hides both when `moon` is null. See update(). */
  updateMoon(moon) {
    const show = !!moon;
    this.moon.visible = show;
    this.moonRing.visible = show && moon.measured.el > -1.5;
    this.moonLabel.visible = show && moon.model.el > 1;
    this.moonMeasuredLabel.visible = show && moon.measured.el > 0;
    // The inset shows the moon's lit face in place of the sun.
    this.scopeMoon.style.display = show ? 'block' : 'none';
    this.scopeSun.style.display = this.scopeGround.style.display = show ? 'none' : '';
    if (!show) return;

    // Drawn a little larger than life so it can be found; the inset shows its true face. In front of the sun it
    // is its true size and dark, so that it hides no more of the sun than this model says.
    const eclipsing = moon.cover > 0;
    setOnSky(this.moon, moon.model.az, moon.model.el, Math.max(moon.model.sizeDeg / 2, eclipsing ? 0 : MOON_SHOWN_DEG));
    this.moon.material.color.set(eclipsing ? 0x10131a : 0xdfe5ec);
    this.moonLabel.pos.copy(skyDir(moon.model.az, moon.model.el - 2.2, FAR));
    setOnSky(this.moonRing, moon.measured.az, moon.measured.el, MEASURED_RING_DEG);
    this.moonMeasuredLabel.pos.copy(skyDir(moon.measured.az, moon.measured.el + 2.6, FAR));

    // The moon's face in the inset, as this model lights it.
    const ctx = this.scopeMoon.getContext('2d');
    const size = this.scopeMoon.width;
    const r = size * 0.36;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    // The unlit face, then the lit part: half the edge, closed by the curved line between light and dark.
    // On a ball that line is seen as half an ellipse. With f the fraction of the face that is lit, the
    // ellipse reaches r × |2f − 1| from the middle of the face: nothing at half moon, where the line is
    // straight, and all the way to the edge at new and at full.
    ctx.fillStyle = '#2a3038';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.rotate((moon.side - 90) * DEG); // the lit edge is drawn on the right, then turned to face the sun
    const curve = 2 * moon.lit - 1; // -1 new, 0 half, 1 full
    ctx.fillStyle = '#e9edf2';
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, Math.max(0.001, r * Math.abs(curve)), r, 0, Math.PI / 2, curve < 0 ? -Math.PI / 2 : (3 * Math.PI) / 2, curve < 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const eclipsed = moon.shadow && moon.shadow.kind !== 'none';
    if (eclipsed) {
      // The Earth's shadow, a disc far wider than the moon, sliding across it from the side away from the sun.
      // It is to the same scale as the moon's face: the shadow's radius and its distance from the middle of
      // the moon are both in degrees (earthShadow in js/models.js), and `scale` is pixels to a degree.
      const scale = r / moon.shadow.moonDeg;
      const toward = (moon.side + 180 - 90) * DEG;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(70, 18, 10, 0.88)';
      ctx.beginPath();
      ctx.arc(Math.cos(toward) * moon.shadow.offDeg * scale, Math.sin(toward) * moon.shadow.offDeg * scale, moon.shadow.shadowDeg * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.scopeCaption.textContent = eclipsed
      ? `In the Earth's shadow: a ${moon.shadow.kind} eclipse`
      : `Moon as this model lights it: ${Math.round(moon.lit * 100)}% lit`;
  }

  /**
   * Draws the stars, or hides them when `stars` is null. See update() for what
   * `stars` holds. `bright` is how light the sky is, 0 to 1.
   */
  updateStars(stars, bright) {
    const show = !!stars;
    for (const part of this.starParts) part.object.visible = show;
    this.starRing.visible = false;
    this.starLabel.visible = false;
    this.starMeasuredLabel.visible = false;
    if (!show) return;

    // Stars fade in daylight but stay faintly visible, so the comparison works at any hour.
    const alpha = Math.max(0.35, 1 - bright);
    const at = (p) => skyDir(p.az, p.el, FAR).toArray();
    // A white dot where this model puts each named star, and a larger teal one underneath where it is measured
    // to be. Where the two agree the teal shows as a rim round the white. A dot's size, in pixels, only says
    // how bright the star is: a lower magnitude is a brighter star.
    this.starPoints.begin();
    this.starMeasured.begin();
    stars.model.forEach((p, i) => {
      const size = Math.max(2.2, 5.4 - 1.15 * stars.mags[i]) + (i === stars.selected ? 2.5 : 0);
      this.starPoints.add(at(p), size);
      this.starMeasured.add(at(stars.measured[i]), size + 4.5);
    });
    this.starPoints.end(alpha);
    this.starMeasured.end(alpha * 0.6);

    // The rest of the catalogue: where this model puts each star, smaller the fainter it is.
    this.starField.begin();
    if (stars.field) {
      const { model, mags } = stars.field;
      for (let i = 0; i < model.length; i++) {
        if (model[i].el > -1) this.starField.add(at(model[i]), Math.max(1.1, 3.3 - 0.34 * mags[i]));
      }
    }
    this.starField.end(alpha * 0.8);

    // The lines that join stars into their familiar figures, where either end is up.
    this.starLines.begin();
    for (const [a, b] of stars.lines) {
      const p = stars.model[a];
      const q = stars.model[b];
      if (p.el > -3 || q.el > -3) this.starLines.add(at(p), at(q));
    }
    this.starLines.end();
    this.starLines.object.material.opacity = 0.42 * alpha;

    // The path this model has each star follow across the sky.
    this.starTrails.begin();
    for (const trail of stars.trails ?? []) {
      for (let k = 1; k < trail.length; k++) {
        if (trail[k - 1].el > -2 || trail[k].el > -2) this.starTrails.add(at(trail[k - 1]), at(trail[k]));
      }
    }
    this.starTrails.end();
    this.starTrails.object.material.opacity = 0.3 * alpha;

    // The chosen star: a ring where it is measured to be, and its name where this model puts it.
    const model = stars.model[stars.selected];
    const real = stars.measured[stars.selected];
    setOnSky(this.starRing, real.az, real.el, STAR_RING_DEG);
    this.starRing.visible = real.el > -1.2;
    this.starMeasuredLabel.pos.copy(skyDir(real.az, real.el + 2.1, FAR));
    this.starMeasuredLabel.el.textContent = `${stars.name}, measured`;
    this.starMeasuredLabel.visible = real.el > 0;
    this.starLabel.pos.copy(skyDir(model.az, model.el - 1.9, FAR));
    this.starLabel.el.textContent = stars.name;
    this.starLabel.visible = model.el > 1;
  }
}
