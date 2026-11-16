// The ground the observer stands on: a mown field where two farm tracks cross,
// one running north to south and one east to west, with hay bales, a fence, a
// tree and a farmhouse to give a sense of size. None of it belongs to either
// model. It is scenery, the same in both views, so that the sky reads as seen
// from a place. Only the light on it and the shadows follow the view's own sun.
//
// East = +x, up = +y, north = -z, in metres. The eye is at the origin and the
// ground is EYE below it. Nothing in the east or the west stands taller than the
// eye, so the horizon there stays clear for sunrise and sunset.
import * as THREE from 'three';
import { DEG } from '../astro.js';

export const EYE = 1.7;

const NIGHT_LIGHT = [0.08, 0.09, 0.13];
const DUSK_TINT = [1.1, 0.9, 0.72];

// [bearing in degrees, distance in metres, seen end-on]
const BALES = [
  [22, 14, 0], [58, 31, 1], [77, 64, 0], [104, 19, 1], [127, 44, 0], [146, 76, 0], [201, 26, 0],
  [226, 58, 1], [247, 13, 0], [262, 38, 0], [291, 70, 1], [312, 22, 1], [330, 47, 0], [36, 82, 0],
];
const BALE_M = 1.45;
const TREE = { az: 345, dist: 60, size: 12.5 };
const SMALL_TREE = { az: 171.5, dist: 128, size: 9 };
const HOUSE = { az: 163, dist: 120, width: 15, height: 7.5 };
const FENCE = { z: -2.6, from: 6, to: 180, gap: 4, post: 1.1 };

const place = (az, dist) => [dist * Math.sin(az * DEG), -dist * Math.cos(az * DEG)];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  return new THREE.CanvasTexture(canvas);
}

function treeTexture() {
  return paint(256, 256, (g) => {
    g.fillStyle = '#4b3b2b';
    g.beginPath();
    g.moveTo(116, 256);
    g.lineTo(122, 140);
    g.lineTo(136, 140);
    g.lineTo(142, 256);
    g.fill();
    const rnd = seeded(11);
    const blobs = [];
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 76;
      blobs.push([128 + Math.cos(a) * r * 1.2, 104 + Math.sin(a) * r * 0.82, 20 + rnd() * 20]);
    }
    // Shade underneath, the leaves themselves, then the light catching the tops.
    for (const [colour, dx, dy, k] of [['#263a1c', 3, 7, 1], ['#3a5627', 0, 0, 0.96], ['#52733a', -6, -9, 0.55]]) {
      g.fillStyle = colour;
      for (const [x, y, r] of blobs) {
        g.beginPath();
        g.arc(x + dx, y + dy, r * k, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

// The farmhouse and its barn. `lights` paints only the lit windows, for the dark.
function houseTexture(lights) {
  const windows = [[66, 158, 32, 40], [124, 158, 32, 40], [66, 92, 26, 26], [150, 92, 26, 26]];
  return paint(512, 256, (g) => {
    if (lights) {
      g.fillStyle = '#ffd98a';
      g.shadowColor = '#ffc35a';
      g.shadowBlur = 14;
      for (const [x, y, w, h] of windows.slice(0, 3)) g.fillRect(x, y, w, h);
      return;
    }
    g.fillStyle = '#7d4d3d';
    g.fillRect(272, 162, 206, 90);
    g.fillStyle = '#3d3d43';
    g.beginPath();
    g.moveTo(262, 166);
    g.lineTo(302, 108);
    g.lineTo(450, 108);
    g.lineTo(488, 166);
    g.fill();
    g.fillStyle = '#2b2321';
    g.fillRect(346, 186, 62, 66);
    g.fillStyle = '#b9ac96';
    g.fillRect(40, 132, 212, 120);
    g.fillStyle = '#7b5c4c';
    g.fillRect(190, 40, 22, 46);
    g.fillStyle = '#5c4338';
    g.beginPath();
    g.moveTo(28, 136);
    g.lineTo(70, 68);
    g.lineTo(222, 68);
    g.lineTo(264, 136);
    g.fill();
    g.fillStyle = '#27313c';
    for (const [x, y, w, h] of windows.slice(0, 2)) g.fillRect(x, y, w, h);
    g.fillStyle = '#3b2f28';
    g.fillRect(196, 182, 32, 70);
    const shade = g.createLinearGradient(0, 60, 0, 252);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = shade;
    g.fillRect(0, 0, 512, 256);
  });
}

function baleTexture(endOn) {
  return paint(128, 128, (g) => {
    g.fillStyle = 'rgba(0, 0, 0, 0.32)';
    g.beginPath();
    g.ellipse(64, 119, 56, 7, 0, 0, Math.PI * 2);
    g.fill();
    const straw = g.createLinearGradient(0, 10, 0, 120);
    straw.addColorStop(0, '#dcc474');
    straw.addColorStop(0.55, '#c2a655');
    straw.addColorStop(1, '#8f7638');
    g.fillStyle = straw;
    g.beginPath();
    if (endOn) g.arc(64, 64, 55, 0, Math.PI * 2);
    else g.roundRect(10, 9, 108, 110, 24);
    g.fill();
    g.strokeStyle = 'rgba(92, 72, 28, 0.5)';
    g.lineWidth = 2;
    if (endOn) {
      for (let r = 9; r < 52; r += 9) {
        g.beginPath();
        g.arc(64, 64, r, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      const rnd = seeded(5);
      for (let i = 0; i < 16; i++) {
        const y = 16 + rnd() * 96;
        const x = 14 + rnd() * 60;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 20 + rnd() * 30, y + (rnd() - 0.5) * 3);
        g.stroke();
      }
      g.strokeStyle = 'rgba(70, 56, 24, 0.75)';
      for (const x of [44, 84]) {
        g.beginPath();
        g.moveTo(x, 10);
        g.lineTo(x, 118);
        g.stroke();
      }
    }
  });
}

const VERTEX_DIR = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const GROUND_FRAGMENT = `
  uniform vec3 uLight;
  uniform vec3 uHaze;
  uniform vec3 uSun;
  uniform float uShade;
  uniform float uSheen;
  uniform vec4 uCast[CASTERS];
  uniform float uLift[CASTERS];
  varying vec3 vDir;

  const float EYE = ${EYE.toFixed(2)};

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y) - 0.5;
  }
  // 1 within w of zero and 0 beyond it, softened over s.
  float band(float a, float w, float s) {
    return 1.0 - smoothstep(w - s, w + s, abs(a));
  }
  // How bare the earth is on a farm track running along the second coordinate: two ruts and worn grass between.
  float track(vec2 p) {
    float a = p.x - 0.5 * sin(p.y * 0.045) * smoothstep(6.0, 40.0, abs(p.y));
    float s = 0.1 + fwidth(a);
    float ruts = max(band(a - 0.72, 0.2, s), band(a + 0.72, 0.2, s));
    return band(a, 1.25, s + 0.15) * (0.4 + 0.6 * ruts) * (1.0 - smoothstep(1.5, 5.0, fwidth(a)));
  }
  // Half the width of a standing person at a height, or -1 above the head.
  float person(float h) {
    if (h < 0.0 || h > 1.74) return -1.0;
    if (h > 1.5) {
      float k = (h - 1.62) / 0.12;
      return 0.115 * sqrt(max(1.0 - k * k, 0.0));
    }
    return mix(0.16 + 0.08 * smoothstep(0.8, 1.3, h), 0.06, smoothstep(1.36, 1.46, h));
  }

  void main() {
    vec3 d = normalize(vDir);
    float down = max(-d.y, 1e-4);
    // The place on the ground this line of sight meets, in metres east and south of the feet.
    vec2 p = d.xz * (EYE / down);
    // How much ground one pixel covers there. Detail finer than that is left out, so the distance does not shimmer.
    float px = max(fwidth(p.x), fwidth(p.y));

    float rough =
      noise(p * 0.008) * 0.7 * (1.0 - smoothstep(0.3, 1.0, px * 0.008)) +
      noise(p * 0.035) * 0.6 * (1.0 - smoothstep(0.3, 1.0, px * 0.035)) +
      noise(p * 0.4) * 0.45 * (1.0 - smoothstep(0.3, 1.0, px * 0.4)) +
      noise(p * 6.0) * 0.4 * (1.0 - smoothstep(0.3, 1.0, px * 6.0)) +
      noise(p * vec2(31.0, 23.0)) * 0.34 * (1.0 - smoothstep(0.3, 1.0, px * 31.0)) +
      noise(p * vec2(97.0, 131.0)) * 0.26 * (1.0 - smoothstep(0.3, 1.0, px * 131.0));

    // The observer's own field is mown, in strips. The fields beyond it are whatever their neighbours grow.
    vec2 q = (p + 80.0) / 160.0;
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float kind = hash(cell + 7.0);
    vec3 beyond = kind < 0.3 ? vec3(0.56, 0.51, 0.27) : kind < 0.55 ? vec3(0.36, 0.29, 0.21) : kind < 0.8 ? vec3(0.26, 0.40, 0.18) : vec3(0.62, 0.57, 0.22);
    vec3 mown = mix(vec3(0.31, 0.39, 0.16), vec3(0.48, 0.53, 0.25), 0.5 + rough);
    float strips = smoothstep(-0.4, 0.4, sin(p.x * 1.2566)) - 0.5;
    mown *= 1.0 + 0.09 * strips * (1.0 - smoothstep(0.8, 2.5, fwidth(p.x)));
    bool home = cell.x == 0.0 && cell.y == 0.0;
    vec3 col = home ? mown : beyond * (1.0 + 0.5 * rough);

    // A hedge along every field edge, with a gap where a track goes through.
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 160.0;
    float hedge = band(edge, 1.5, 0.3 + fwidth(edge)) * (1.0 - smoothstep(3.0, 12.0, fwidth(edge)));
    col = mix(col, vec3(0.13, 0.2, 0.1), hedge);

    float bare = max(track(p), track(p.yx));
    vec3 earth = vec3(0.49, 0.42, 0.31) * (1.0 + 0.3 * noise(p * 1.7) * (1.0 - smoothstep(0.3, 1.0, px * 1.7)));
    col = mix(col, earth, bare);

    // Shadows, cast away from this model's sun: the bales, the tree, and the observer.
    float shade = 0.0;
    if (uShade > 0.0) {
      vec2 away = -normalize(uSun.xz + vec2(1e-6));
      float run = min(length(uSun.xz) / max(uSun.y, 1e-3), 30.0); // length of shadow for each metre of height
      for (int i = 0; i < CASTERS; i++) {
        vec2 a = uCast[i].xy + away * (uLift[i] * run);
        vec2 ba = away * ((uCast[i].w - uLift[i]) * run);
        vec2 pa = p - a;
        float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
        float soft = 0.06 + 0.012 * length(p - uCast[i].xy) + px;
        shade = max(shade, 1.0 - smoothstep(uCast[i].z - soft, uCast[i].z + soft, length(pa - ba * t)));
      }
      float along = dot(p, away);
      float half_ = person(along / run);
      if (half_ >= 0.0) {
        float soft = 0.02 + 0.012 * along + px;
        shade = max(shade, 1.0 - smoothstep(half_ - soft, half_ + soft, abs(dot(p, vec2(-away.y, away.x)))));
      }
    }
    col *= 1.0 - 0.52 * uShade * shade;
    col *= uLight;

    // Towards a low sun the ground glints, and towards the horizon it fades into the air.
    float air = exp(-down * 16.0);
    float toSun = max(dot(normalize(d.xz + vec2(1e-6)), normalize(uSun.xz + vec2(1e-6))), 0.0);
    col += uSheen * vec3(1.0, 0.78, 0.5) * pow(toSun, 12.0) * air * 0.3;
    col = mix(col, uHaze, 0.6 * air);
    gl_FragColor = vec4(col, 1.0);
  }`;

const SPRITE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SPRITE_FRAGMENT = `
  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform vec3 uLight;
  uniform vec3 uHaze;
  uniform float uFade;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a * uAlpha < 0.02) discard;
    gl_FragColor = vec4(mix(t.rgb * uTint * uLight, uHaze, uFade), t.a * uAlpha);
  }`;

export class Ground {
  constructor(scene) {
    this.light = { value: new THREE.Vector3(1, 1, 1) };
    this.haze = { value: new THREE.Color() };
    this.full = { value: new THREE.Vector3(1, 1, 1) };
    this.none = { value: new THREE.Color(0, 0, 0) };
    this.windows = { value: 0 };
    this.objects = [];

    const bales = BALES.map(([az, dist, endOn]) => ({ at: place(az, dist), endOn }));
    const tree = place(TREE.az, TREE.dist);
    // What casts a shadow: [east, south, half-width, top] and the height its shadow starts from.
    const casters = bales.map((b) => [b.at[0], b.at[1], 0.62, 1.25, 0]);
    casters.push([tree[0], tree[1], 0.4, TREE.size * 0.45, 0]);
    casters.push([tree[0], tree[1], TREE.size * 0.36, TREE.size * 0.88, TREE.size * 0.42]);

    this.uniforms = {
      uLight: this.light,
      uHaze: this.haze,
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uShade: { value: 0 },
      uSheen: { value: 0 },
      uCast: { value: casters.map((c) => new THREE.Vector4(c[0], c[1], c[2], c[3])) },
      uLift: { value: casters.map((c) => c[4]) },
    };
    // Opaque, but drawn with the see-through things so that it comes after the stars and hides the ones below the horizon.
    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(900, 96, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        defines: { CASTERS: casters.length },
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        vertexShader: VERTEX_DIR,
        fragmentShader: GROUND_FRAGMENT,
      }),
    );
    surface.renderOrder = 5;
    surface.frustumCulled = false;
    scene.add(surface);
    this.objects.push(surface);

    this.addFence(scene);
    const baleMaps = [baleTexture(false), baleTexture(true)];
    for (const b of bales) this.addSprite(scene, baleMaps[b.endOn], b.at, BALE_M, BALE_M);
    const treeMap = treeTexture();
    this.addSprite(scene, treeMap, tree, TREE.size, TREE.size);
    this.addSprite(scene, treeMap, place(SMALL_TREE.az, SMALL_TREE.dist), -SMALL_TREE.size, SMALL_TREE.size);
    const house = place(HOUSE.az, HOUSE.dist);
    this.addSprite(scene, houseTexture(false), house, HOUSE.width, HOUSE.height);
    this.addSprite(scene, houseTexture(true), house, HOUSE.width, HOUSE.height, { light: this.full, haze: this.none, alpha: this.windows, order: 6.6 });
  }

  material(map, at, { light = this.light, haze = this.haze, alpha = { value: 1 }, tint = [1, 1, 1] } = {}) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uTint: { value: new THREE.Vector3(...tint) },
        uLight: light,
        uHaze: haze,
        uFade: { value: haze === this.none ? 0 : 1 - Math.exp(-Math.hypot(...at) / 700) },
        uAlpha: alpha,
      },
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
    });
  }

  /** A flat picture standing on the ground at a place, turned to face the observer. A negative width mirrors it. */
  addSprite(scene, map, at, width, height, options = {}) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(width), height), this.material(map, at, options));
    mesh.position.set(at[0], height / 2 - EYE, at[1]);
    mesh.rotation.y = Math.atan2(-at[0], -at[1]);
    if (width < 0) mesh.scale.x = -1;
    mesh.renderOrder = options.order ?? 6.5;
    scene.add(mesh);
    this.objects.push(mesh);
  }

  /** A post-and-wire fence along the north side of the east-west track, lower than the eye. */
  addFence(scene) {
    const white = paint(2, 2, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 2, 2);
    });
    const posts = [];
    const wires = [];
    const base = -EYE;
    for (const side of [-1, 1]) {
      let last = null;
      for (let d = FENCE.from; d <= FENCE.to; d += FENCE.gap) {
        const x = side * d;
        const z = FENCE.z;
        // Each post is a strip turned to face the observer.
        const far = Math.hypot(x, z);
        const tx = (-z / far) * 0.045;
        const tz = (x / far) * 0.045;
        const top = base + FENCE.post;
        posts.push(
          x - tx, base, z - tz, x + tx, base, z + tz, x + tx, top, z + tz,
          x - tx, base, z - tz, x + tx, top, z + tz, x - tx, top, z - tz,
        );
        if (last !== null) {
          for (const h of [0.45, 0.95]) wires.push(last, base + h, z, x, base + h, z);
        }
        last = x;
      }
    }
    const postGeometry = new THREE.BufferGeometry();
    postGeometry.setAttribute('position', new THREE.Float32BufferAttribute(posts, 3));
    postGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((posts.length / 3) * 2).fill(0.5), 2));
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    wireGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((wires.length / 3) * 2).fill(0.5), 2));
    const fence = [
      new THREE.Mesh(postGeometry, this.material(white, [20, 0], { tint: [0.43, 0.36, 0.28] })),
      new THREE.LineSegments(wireGeometry, this.material(white, [20, 0], { tint: [0.3, 0.3, 0.3], alpha: { value: 0.7 } })),
    ];
    for (const part of fence) {
      part.renderOrder = 6.4;
      part.frustumCulled = false;
      scene.add(part);
      this.objects.push(part);
    }
  }

  /**
   * @param bright  how light it is, 0 (night) to 1 (day)
   * @param dusk    how much of the low sun's warmth is in the light, 0 to 1
   * @param low     the colour of the sky at the horizon
   * @param sunDir  unit vector towards this model's sun
   * @param sunEl   its elevation in degrees
   * @param lit     whether this model says the sun is lighting this place
   * @param hidden  the share of the sun the moon hides, 0 to 1
   */
  update({ bright, dusk, low, sunDir, sunEl, lit, hidden = 0 }) {
    this.light.value.set(
      ...NIGHT_LIGHT.map((night, i) => (night + (1 - night) * bright) * (1 + (DUSK_TINT[i] - 1) * dusk)),
    );
    this.haze.value.copy(low);
    this.uniforms.uSun.value.copy(sunDir);
    this.uniforms.uShade.value = lit ? smooth(0.4, 6, sunEl) * (1 - hidden) : 0;
    this.uniforms.uSheen.value = lit ? smooth(-3, 2, sunEl) * (1 - smooth(25, 60, sunEl)) * (1 - hidden) : 0;
    this.windows.value = 1 - smooth(0.12, 0.4, bright);
  }
}
