// Drawing tools shared by the three.js views: a base view with its own
// renderer, labels in HTML that follow points in the 3D scene, and builders for
// the map, the coastlines and the grid.
//
// Nothing in this file works out where anything is. It is handed positions that
// js/models.js and the rest have already worked out, and puts them on screen.
import * as THREE from 'three';

/** One colour for each kind of thing, the same in every view and in the tables beside them. */
export const COLORS = {
  measured: 0x45d6c8, // what observers actually record
  globe: 0x7fb4ff, // globe-model prediction
  flat: 0xffb224, // flat-model prediction
  own: 0xc79bff, // a measurement the user entered themselves
  observer: 0xff5d6c,
  coast: 0xcfe0ec,
  grid: 0x7f93a8,
  terminator: 0xff7847, // the real edge between day and night
  star: 0xf4f7ff,
  route: 0xf2f6fa, // the real route between two places
};

// ---------- small sums used by more than one view ----------

export const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/**
 * A smooth step from 0 at a to 1 at b, for fading one thing into another:
 *   t = (x − a) ÷ (b − a), held between 0 and 1
 *   3t² − 2t³
 * It is only ever used for how a drawing looks, never for where something is.
 */
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A distance as text, to the nearest km. */
export const kmText = (n) => `${Math.round(n).toLocaleString('en-US')} km`;

/**
 * How large a star's dot is in the two outside views, in CSS pixels. A star's
 * magnitude is lower the brighter it is, so the dot shrinks as the magnitude
 * rises, down to a smallest size. The chosen star is drawn largest of all.
 */
export const outsideStarSize = (mag, chosen) => (chosen ? 6.5 : Math.max(1.8, 4.2 - 0.9 * mag));

// ---------- labels ----------

/** Labels made of HTML, laid over a view and moved to follow points in its scene. */
export class LabelLayer {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.className = 'labels';
    container.appendChild(this.root);
    this.items = [];
    this.v = new THREE.Vector3();
  }

  /**
   * Adds a label. The view sets `pos` to the point it belongs to, `visible` to
   * show or hide it, and may give a `test(camera)` that hides it when, say, its
   * point is round the back of the globe.
   */
  add(text, className = '') {
    const el = document.createElement('div');
    el.className = `label ${className}`;
    el.textContent = text;
    this.root.appendChild(el);
    const item = { el, pos: new THREE.Vector3(), visible: true, test: null };
    this.items.push(item);
    return item;
  }

  /** Moves every label to where the camera now sees its point, and hides those that are out of the picture. */
  update(camera, width, height) {
    for (const item of this.items) {
      let show = item.visible && (!item.test || item.test(camera));
      if (show) {
        // The camera turns the point into a place on screen: x and y from −1 to 1 across the picture, z its depth.
        this.v.copy(item.pos).project(camera);
        show = this.v.z > -1 && this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
        if (show) {
          const x = (this.v.x * 0.5 + 0.5) * width;
          const y = (-this.v.y * 0.5 + 0.5) * height;
          item.el.style.left = `${x.toFixed(1)}px`;
          item.el.style.top = `${y.toFixed(1)}px`;
        }
      }
      item.el.style.display = show ? '' : 'none';
    }
  }
}

// ---------- the base of every three.js view ----------

/**
 * A view with its own canvas, scene and labels. A view that extends this makes
 * `this.camera`, and may have a `fitCamera()` that is called when its panel
 * changes shape. It is redrawn only when `dirty` has been set.
 */
export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.labels = new LabelLayer(container);
    this.width = 1;
    this.height = 1;
    this.dirty = true;
    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    // A view that is not on screen (the other pair on a phone) is skipped until it comes back.
    this.hidden = !w || !h;
    if (this.hidden) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera?.();
    // Resizing clears the canvas, so redraw straight away rather than a frame later.
    this.dirty = true;
    this.render();
  }

  render() {
    if (!this.dirty || this.hidden) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.camera, this.width, this.height);
  }

  /** Calls `handler(event)` for a click that was not part of a drag. */
  onClick(handler) {
    const el = this.renderer.domElement;
    let start = null;
    let down = 0;
    el.addEventListener('pointerdown', (e) => {
      down++;
      // A second finger means a pinch or a two-finger drag, never a tap.
      start = e.button === 0 && down === 1 ? [e.clientX, e.clientY] : null;
    });
    const release = (e, cancelled) => {
      down = Math.max(0, down - 1);
      // How far, in pixels, a press may wander and still count as a click. A finger is less steady than a mouse.
      const slop = e.pointerType === 'touch' ? 12 : 5;
      if (!cancelled && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < slop) handler(e);
      start = null;
    };
    el.addEventListener('pointerup', (e) => release(e, false));
    el.addEventListener('pointercancel', (e) => release(e, true));
  }

  /** Where a pointer is in the picture, from −1 to 1 across and up, as three.js wants it for finding what was clicked. */
  ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }
}

// ---------- the map ----------
//
// The land is one picture, shared by both outside views: a plain grid of
// longitude across (−180° to 180°) and latitude down (90° to −90°). Each view's
// shader looks up the colour of a place in it by that place's latitude and
// longitude, so both models are painted from the same coastlines.

/** Paints land polygons onto that picture. Each ring is a list of longitude, latitude, longitude, latitude... */
export function makeLandCanvas(land, width = 2048) {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b3f5e';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#5c8f63';
  for (const polygon of land.polygons) {
    ctx.beginPath();
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = ((ring[i] + 180) / 360) * width;
        const y = ((90 - ring[i + 1]) / 180) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  return canvas;
}

/** The picture of the land as a texture. It repeats sideways, so that it joins up at longitude 180°. */
export function makeLandTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Lines on the map are given as latitudes and longitudes. Each view supplies
// `project(lat, lon)`, which says where that place is in its own scene: on the
// ball for the globe, on the disc for the flat map. A line is cut into pieces
// no more than `stepDeg` long, so that it follows the ball's curve, or the
// curve this flat map gives a line of latitude.
function pushSegment(out, project, lat1, lon1, lat2, lon2, stepDeg = 2) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(lat2 - lat1), Math.abs(lon2 - lon1)) / stepDeg));
  let prev = project(lat1, lon1);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const next = project(lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t);
    out.push(prev[0], prev[1], prev[2], next[0], next[1], next[2]);
    prev = next;
  }
}

/**
 * Coastline segments. The map data cuts the land along longitude ±180° and
 * closes Antarctica along the south pole. Those edges are not coasts, so they
 * are left out.
 */
export function buildCoastPositions(land, project) {
  const out = [];
  for (const polygon of land.polygons) {
    for (const ring of polygon) {
      for (let i = 0; i + 3 < ring.length; i += 2) {
        const [lon1, lat1, lon2, lat2] = [ring[i], ring[i + 1], ring[i + 2], ring[i + 3]];
        const seam =
          (Math.abs(lon1) >= 179.99 && Math.abs(lon2) >= 179.99) || (lat1 <= -89.9 && lat2 <= -89.9);
        if (!seam) pushSegment(out, project, lat1, lon1, lat2, lon2);
      }
    }
  }
  return out;
}

/** Circles of latitude and lines of longitude every `step` degrees. The lines of longitude stop at `latLimit`, short of the poles. */
export function buildGraticulePositions(project, step = 30, latLimit = 90) {
  const out = [];
  for (let lat = -90 + step; lat < 90; lat += step) {
    if (lat === 0) continue; // the equator is drawn separately
    pushSegment(out, project, lat, -180, lat, 180);
  }
  for (let lon = -180; lon < 180; lon += step) {
    pushSegment(out, project, -Math.min(latLimit, 89.5), lon, Math.min(latLimit, 89.5), lon);
  }
  return out;
}

/** One circle of latitude, all the way round. */
export function buildLatitudePositions(project, lat) {
  const out = [];
  pushSegment(out, project, lat, -180, lat, 180);
  return out;
}

// ---------- lines and points ----------

/** Fixed line segments from a flat list of x, y, z, six numbers to a segment. */
export function lineSegments(positions, color, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.LineSegments(geo, mat);
}

/** A white dot at each city, placed by the view's own `project(lat, lon)`. */
export function cityDots(cities, project) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cities.flatMap((c) => project(c.lat, c.lon))), 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 4, sizeAttenuation: false }));
}

/**
 * Line segments whose ends are set afresh at every update: `begin()`, then
 * `add(a, b)` for each segment, then `end()`. Segments beyond the number made
 * room for are left out.
 */
export class DynamicSegments {
  constructor(maxSegments, color, opacity = 1) {
    this.array = new Float32Array(maxSegments * 6);
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.array, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    this.object = new THREE.LineSegments(geo, mat);
    this.object.frustumCulled = false;
  }

  begin() {
    this.count = 0;
  }

  add(a, b) {
    if ((this.count + 1) * 6 > this.array.length) return;
    this.array.set([a[0], a[1], a[2], b[0], b[1], b[2]], this.count * 6);
    this.count++;
  }

  end() {
    const geo = this.object.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, this.count * 2);
  }
}

/**
 * Round dots whose places and sizes are set afresh at every update, in the same
 * way: `begin()`, `add(place, size)`, `end(opacity)`. Sizes are in CSS pixels
 * and do not shrink with distance, so a dot is a mark, not a thing with a width.
 */
export class PointCloud {
  constructor(max, color, { depthTest = false } = {}) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 },
        uScale: { value: Math.min(window.devicePixelRatio || 1, 2) }, // screen pixels to a CSS pixel
      },
      transparent: true,
      depthTest,
      depthWrite: false,
      vertexShader: `
        attribute float size;
        uniform float uScale;
        void main() {
          gl_PointSize = size * uScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          // Each dot is drawn as a square. This cuts it to a circle and softens the outer part of it.
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, uOpacity * (1.0 - smoothstep(0.3, 0.5, d)));
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.Points(geo, this.material);
    this.object.frustumCulled = false;
  }

  begin() {
    this.count = 0;
  }

  add(p, size) {
    if (this.count >= this.max) return;
    this.positions.set([p[0], p[1], p[2]], this.count * 3);
    this.sizes[this.count] = size;
    this.count++;
  }

  end(opacity = 1) {
    const geo = this.object.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.setDrawRange(0, this.count);
    this.material.uniforms.uOpacity.value = opacity;
  }
}

/** A soft round glow, brightest in the middle and fading to nothing at its edge. `color` is red, green, blue out of 255. */
export function makeGlowSprite(color = '255, 220, 140') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color}, 1)`);
  g.addColorStop(0.25, `rgba(${color}, 0.55)`);
  g.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Sprite(mat);
}
