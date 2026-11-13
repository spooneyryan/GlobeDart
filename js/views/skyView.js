// First-person view of the sky from the observer's position.
// East = +x, up = +y, north = -z. Both sky views share one look direction and zoom.
import * as THREE from 'three';
import { DEG } from '../astro.js';
import { View3D, COLORS, lineSegments, DynamicSegments, PointCloud, makeGlowSprite } from '../scene-utils.js';

const FAR = 500;
const SCOPE_PX_PER_DEG = 150;

function skyDir(azDeg, elDeg, dist = 1) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return new THREE.Vector3(
    Math.cos(e) * Math.sin(a) * dist,
    Math.sin(e) * dist,
    -Math.cos(e) * Math.cos(a) * dist,
  );
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const NIGHT_TOP = new THREE.Color(0x060a16);
const NIGHT_LOW = new THREE.Color(0x0d1426);
const DAY_TOP = new THREE.Color(0x2a69bf);
const DAY_LOW = new THREE.Color(0xa6caee);
const DUSK_LOW = new THREE.Color(0xe58c55);
const GROUND_DAY = new THREE.Color(0x35432f);
const GROUND_NIGHT = new THREE.Color(0x0a0e0b);
const SUN_LOW = new THREE.Color(0xff7b3a);
const SUN_HIGH = new THREE.Color(0xfff4d2);

export class SkyView extends View3D {
  constructor(container, { onLook }) {
    super(container);
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 2000);
    this.camera.rotation.order = 'YXZ';
    this.look = { az: 180, pitch: 20, fov: 60 };

    this.skyUniforms = {
      uTop: { value: DAY_TOP.clone() },
      uLow: { value: DAY_LOW.clone() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
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

    // Faint elevation / bearing grid.
    const grid = [];
    const seg = (a, b) => grid.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let el = 10; el < 90; el += 10) {
      for (let az = 0; az < 360; az += 3) seg(skyDir(az, el, FAR), skyDir(az + 3, el, FAR));
    }
    for (let az = 0; az < 360; az += 30) {
      for (let el = 0; el < 90; el += 5) seg(skyDir(az, el, FAR), skyDir(az, el + 5, FAR));
    }
    this.grid = lineSegments(grid, 0xffffff, 0.16);
    this.grid.material.depthTest = false;
    this.grid.renderOrder = 1;
    this.scene.add(this.grid);

    // Stars, drawn only when the app passes them in: where each is measured to be
    // (teal, underneath) and where this model puts it (white, on top).
    this.starMeasured = new PointCloud(120, COLORS.measured);
    this.starMeasured.object.renderOrder = 1.2;
    this.starTrails = new DynamicSegments(120 * 36, COLORS.star, 0.28);
    this.starTrails.object.renderOrder = 1.3;
    this.starLines = new DynamicSegments(80, COLORS.star, 0.4);
    this.starLines.object.renderOrder = 1.4;
    this.starPoints = new PointCloud(120, COLORS.star);
    this.starPoints.object.renderOrder = 1.5;
    for (const part of [this.starMeasured, this.starTrails, this.starLines, this.starPoints]) {
      part.object.material.depthTest = false;
      part.object.visible = false;
      this.scene.add(part.object);
    }
    this.starRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.measured, depthTest: false, side: THREE.DoubleSide }),
    );
    this.starRing.renderOrder = 1.6;
    this.starRing.visible = false;
    this.scene.add(this.starRing);

    // Where the sun is actually measured to be (same marker in both views).
    this.measuredRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.measured, depthTest: false, side: THREE.DoubleSide }),
    );
    this.measuredRing.renderOrder = 2;
    this.scene.add(this.measuredRing);

    this.glow = makeGlowSprite('255, 226, 160');
    this.glow.renderOrder = 3;
    this.scene.add(this.glow);
    this.sun = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: 0xfff4d2, depthTest: false, side: THREE.DoubleSide }),
    );
    this.sun.renderOrder = 4;
    this.scene.add(this.sun);

    // The moon, drawn only when the app passes it in: a ring where it is measured
    // to be and a disc where this model puts it.
    this.moonRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.measured, depthTest: false, side: THREE.DoubleSide }),
    );
    this.moonRing.renderOrder = 4.1;
    this.moonRing.visible = false;
    this.scene.add(this.moonRing);
    this.moon = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: 0xdfe5ec, depthTest: false, side: THREE.DoubleSide }),
    );
    this.moon.renderOrder = 4.2;
    this.moon.visible = false;
    this.scene.add(this.moon);

    // The user's own measurement, when one matches the time and place on show:
    // a diamond if they measured a bearing too, otherwise a ring at their elevation.
    this.ownMark = new THREE.Mesh(
      new THREE.RingGeometry(0.74, 1, 4),
      new THREE.MeshBasicMaterial({ color: COLORS.own, depthTest: false, side: THREE.DoubleSide }),
    );
    this.ownMark.renderOrder = 4.5;
    this.ownMark.visible = false;
    this.scene.add(this.ownMark);
    this.ownCircle = new DynamicSegments(180, COLORS.own, 0.95);
    this.ownCircle.object.material.depthTest = false;
    this.ownCircle.object.renderOrder = 4.5;
    this.scene.add(this.ownCircle.object);

    // Opaque ground: everything below the horizon is hidden, as it is in life.
    this.ground = new THREE.Mesh(
      new THREE.SphereGeometry(900, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: GROUND_DAY.clone(), side: THREE.BackSide, depthTest: false }),
    );
    this.ground.renderOrder = 5;
    this.scene.add(this.ground);
    const horizon = [];
    for (let az = 0; az < 360; az += 2) {
      const a = skyDir(az, 0, FAR);
      const b = skyDir(az + 2, 0, FAR);
      horizon.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const horizonLine = lineSegments(horizon, 0xffffff, 0.5);
    horizonLine.material.depthTest = false;
    horizonLine.renderOrder = 6;
    this.scene.add(horizonLine);

    // Labels
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let az = 0; az < 360; az += 15) {
      const major = az % 45 === 0;
      if (!major && az % 30 !== 0) continue;
      const item = this.labels.add(major ? `${compass[az / 45]} ${az}°` : `${az}°`, major ? 'compass' : 'compass minor');
      item.pos.copy(skyDir(az, 0, FAR));
    }
    for (const az of [0, 90, 180, 270]) {
      for (let el = 10; el < 90; el += 10) {
        const item = this.labels.add(`${el}°`, 'elev');
        item.pos.copy(skyDir(az + 1.5, el, FAR));
      }
    }
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
    el.addEventListener('pointerdown', (e) => {
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
        onLook({ ...this.look, fov: (pinch.fov * pinch.spread) / spread() });
        return;
      }
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

  setLook(look) {
    this.look = {
      az: ((look.az % 360) + 360) % 360,
      pitch: Math.min(89, Math.max(-12, look.pitch)),
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
   * @param own       {az, el} the user's own measurement for this moment, or null (az may be null)
   * @param stars     null, or { model, measured, mags, lines, trails, selected, name }: this model's
   *                  and the measured {az, el} of every star, the index and name of the chosen one
   * @param moon      null, or { model, measured, lit, side, shadow }: where this model puts the moon and
   *                  where it is measured ({az, el, sizeDeg}), the fraction of its face this model lights,
   *                  which way the lit side faces, and the Earth's shadow on it if this model has one
   */
  update(sun, measured, lit, text, own = null, stars = null, moon = null) {
    const el = sun.el;
    const bright = lit ? smooth(-6, 8, el) : 0;
    const dusk = lit ? smooth(-12, -2, el) * (1 - smooth(0, 14, el)) : 0;
    this.skyUniforms.uTop.value.copy(NIGHT_TOP).lerp(DAY_TOP, bright);
    this.skyUniforms.uLow.value.copy(NIGHT_LOW).lerp(DAY_LOW, bright).lerp(DUSK_LOW, dusk * 0.85);
    this.skyUniforms.uSunDir.value.copy(skyDir(sun.az, el));
    this.skyUniforms.uGlow.value = lit ? 0.4 + 0.6 * smooth(-4, 4, el) : 0.25;
    this.ground.material.color.copy(GROUND_NIGHT).lerp(GROUND_DAY, bright);

    const sunColor = SUN_LOW.clone().lerp(SUN_HIGH, smooth(0, 14, el));
    const radius = FAR * Math.tan((sun.sizeDeg / 2) * DEG);
    this.sun.position.copy(skyDir(sun.az, el, FAR));
    this.sun.lookAt(0, 0, 0);
    this.sun.scale.setScalar(radius);
    this.sun.material.color.copy(sunColor);
    this.glow.position.copy(this.sun.position);
    this.glow.scale.setScalar(radius * 14);
    this.glow.material.color.copy(sunColor);

    this.measuredRing.position.copy(skyDir(measured.az, measured.el, FAR));
    this.measuredRing.lookAt(0, 0, 0);
    this.measuredRing.scale.setScalar(FAR * Math.tan(1.6 * DEG));
    this.measuredRing.visible = measured.el > -1.5;
    this.measuredLabel.pos.copy(skyDir(measured.az, measured.el + 2.6, FAR));
    this.measuredLabel.visible = measured.el > 0;

    this.ownMark.visible = !!own && own.az !== null;
    this.ownLabel.visible = !!own;
    this.ownCircle.begin();
    if (own && own.az !== null) {
      this.ownMark.position.copy(skyDir(own.az, own.el, FAR));
      this.ownMark.lookAt(0, 0, 0);
      this.ownMark.scale.setScalar(FAR * Math.tan(1.15 * DEG));
      this.ownLabel.pos.copy(this.ownMark.position);
      this.ownLabel.el.textContent = 'you measured';
    } else if (own) {
      for (let az = 0; az < 360; az += 2) {
        this.ownCircle.add(skyDir(az, own.el, FAR).toArray(), skyDir(az + 2, own.el, FAR).toArray());
      }
      this.ownLabel.pos.copy(skyDir(measured.az + 7, own.el, FAR));
      this.ownLabel.el.textContent = `you measured ${own.el.toFixed(1)}° up`;
    }
    this.ownCircle.end();

    this.updateStars(stars, bright);

    this.sunLabel.pos.copy(skyDir(sun.az, el - 2.2, FAR));
    this.sunLabel.el.textContent = 'sun';
    this.sunLabel.visible = el > 2.5;
    this.readout.textContent = text;

    // Inset: the sun at a fixed magnification, with the horizon if it is close.
    const px = Math.max(2, sun.sizeDeg * SCOPE_PX_PER_DEG);
    this.scopeSun.style.width = this.scopeSun.style.height = `${px.toFixed(1)}px`;
    this.scopeSun.style.background = `#${sunColor.getHexString()}`;
    const groundTop = 50 + (Math.max(-1, Math.min(1, el)) * SCOPE_PX_PER_DEG * 100) / 120;
    this.scopeGround.style.top = `${groundTop.toFixed(1)}%`;
    this.scopeCaption.textContent =
      el < -sun.sizeDeg / 2 - 0.05
        ? 'Sun is below the horizon'
        : `Sun at the same zoom: ${sun.sizeDeg.toFixed(2)}° wide`;
    this.updateMoon(moon);
    this.dirty = true;
  }

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

    // Drawn a little larger than life so it can be found; the inset shows its true face.
    const radius = FAR * Math.tan(Math.max(moon.model.sizeDeg / 2, 0.45) * DEG);
    this.moon.position.copy(skyDir(moon.model.az, moon.model.el, FAR));
    this.moon.lookAt(0, 0, 0);
    this.moon.scale.setScalar(radius);
    this.moonLabel.pos.copy(skyDir(moon.model.az, moon.model.el - 2.2, FAR));
    this.moonRing.position.copy(skyDir(moon.measured.az, moon.measured.el, FAR));
    this.moonRing.lookAt(0, 0, 0);
    this.moonRing.scale.setScalar(FAR * Math.tan(1.6 * DEG));
    this.moonMeasuredLabel.pos.copy(skyDir(moon.measured.az, moon.measured.el + 2.6, FAR));

    const ctx = this.scopeMoon.getContext('2d');
    const size = this.scopeMoon.width;
    const r = size * 0.36;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    // The unlit face, then the lit part: half the edge, closed by the curved line between light and dark.
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
    if (moon.shadow && moon.shadow.kind !== 'none') {
      // The Earth's shadow, a disc far wider than the moon, sliding across it from the side away from the sun.
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
    const percent = Math.round(moon.lit * 100);
    this.scopeCaption.textContent =
      moon.shadow && moon.shadow.kind !== 'none'
        ? `In the Earth's shadow: a ${moon.shadow.kind} eclipse`
        : `Moon as this model lights it: ${percent}% lit`;
  }

  updateStars(stars, bright) {
    const show = !!stars;
    for (const part of [this.starMeasured, this.starTrails, this.starLines, this.starPoints]) {
      part.object.visible = show;
    }
    this.starRing.visible = false;
    this.starLabel.visible = false;
    this.starMeasuredLabel.visible = false;
    if (!show) return;

    // Stars fade in daylight but stay faintly visible, so the comparison works at any hour.
    const alpha = Math.max(0.35, 1 - bright);
    const at = (p) => skyDir(p.az, p.el, FAR).toArray();
    this.starPoints.begin();
    this.starMeasured.begin();
    stars.model.forEach((p, i) => {
      const size = Math.max(2.2, 5.4 - 1.15 * stars.mags[i]) + (i === stars.selected ? 2.5 : 0);
      this.starPoints.add(at(p), size);
      this.starMeasured.add(at(stars.measured[i]), size + 4.5);
    });
    this.starPoints.end(alpha);
    this.starMeasured.end(alpha * 0.6);

    this.starLines.begin();
    for (const [a, b] of stars.lines) {
      const p = stars.model[a];
      const q = stars.model[b];
      if (p.el > -3 || q.el > -3) this.starLines.add(at(p), at(q));
    }
    this.starLines.end();
    this.starLines.object.material.opacity = 0.42 * alpha;

    this.starTrails.begin();
    for (const trail of stars.trails ?? []) {
      for (let k = 1; k < trail.length; k++) {
        if (trail[k - 1].el > -2 || trail[k].el > -2) this.starTrails.add(at(trail[k - 1]), at(trail[k]));
      }
    }
    this.starTrails.end();
    this.starTrails.object.material.opacity = 0.3 * alpha;

    const model = stars.model[stars.selected];
    const real = stars.measured[stars.selected];
    this.starRing.position.copy(skyDir(real.az, real.el, FAR));
    this.starRing.lookAt(0, 0, 0);
    this.starRing.scale.setScalar(FAR * Math.tan(1.1 * DEG));
    this.starRing.visible = real.el > -1.2;
    this.starMeasuredLabel.pos.copy(skyDir(real.az, real.el + 2.1, FAR));
    this.starMeasuredLabel.el.textContent = `${stars.name}, measured`;
    this.starMeasuredLabel.visible = real.el > 0;
    this.starLabel.pos.copy(skyDir(model.az, model.el - 1.9, FAR));
    this.starLabel.el.textContent = stars.name;
    this.starLabel.visible = model.el > 1;
  }
}
