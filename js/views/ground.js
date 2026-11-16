// The ground the observer stands on. In farming country it is a mown field
// where two farm tracks cross, one running north to south and one east to west,
// with hay bales, a fence, a tree and a farmhouse to give a sense of size.
// Elsewhere it is whatever suits the place (js/place.js): dry grass and a palm
// in the tropics, sand and a cactus in a desert, snow and a hut on the ice, a
// wooden deck on the open sea. None of it belongs to either model. It is
// scenery, the same in both views, so that the sky reads as seen from a place.
// Only the light on it and the shadows follow the view's own sun.
//
// East = +x, up = +y, north = -z, in metres. The eye is at the origin and the
// ground is EYE below it. Nothing in the east or the west stands taller than the
// eye, so the horizon there stays clear for sunrise and sunset.
import * as THREE from 'three';
import { DEG } from '../astro.js';
import { SCENERY } from '../place.js';

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

const CASTERS = 16; // how many things can cast a shadow at once
const DECK = 2.1; // at sea: half the width of the deck the observer stands on

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

function palmTexture() {
  return paint(256, 256, (g) => {
    g.strokeStyle = '#6b5236';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(118, 256);
    g.quadraticCurveTo(110, 160, 132, 74);
    g.stroke();
    // The fronds, dark beneath and lighter on top.
    for (const [colour, width, lift] of [['#2a4721', 9, 0], ['#4d7634', 4.5, -3]]) {
      const rnd = seeded(23);
      g.strokeStyle = colour;
      g.lineWidth = width;
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI * (0.02 + (i / 10) * 0.96);
        const len = 78 + rnd() * 26;
        const droop = 40 + rnd() * 30;
        g.beginPath();
        g.moveTo(132, 74);
        g.quadraticCurveTo(132 + Math.cos(a) * len * 0.6, 68 + Math.sin(a) * len * 0.75 + lift, 132 + Math.cos(a) * len, 74 + Math.sin(a) * len * 0.55 + droop * Math.abs(Math.cos(a)) + lift);
        g.stroke();
      }
    }
  });
}

function cactusTexture() {
  return paint(128, 256, (g) => {
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath();
    g.ellipse(64, 250, 34, 5, 0, 0, Math.PI * 2);
    g.fill();
    const body = g.createLinearGradient(20, 0, 110, 0);
    body.addColorStop(0, '#6a9355');
    body.addColorStop(1, '#33522c');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(52, 14, 26, 238, 13);
    g.roundRect(20, 96, 18, 62, 9);
    g.rect(28, 140, 30, 18);
    g.roundRect(92, 62, 18, 70, 9);
    g.rect(72, 114, 30, 18);
    g.fill();
    g.strokeStyle = 'rgba(20, 40, 20, 0.35)';
    g.lineWidth = 1.5;
    for (const x of [58, 65, 72]) {
      g.beginPath();
      g.moveTo(x, 24);
      g.lineTo(x, 250);
      g.stroke();
    }
  });
}

// Something low and rounded standing where a bale stands in the field: a rock, a bush or a mound of snow.
function lumpTexture(kind) {
  return paint(128, 128, (g) => {
    g.fillStyle = kind === 'mound' ? 'rgba(60, 80, 120, 0.3)' : 'rgba(0, 0, 0, 0.32)';
    g.beginPath();
    g.ellipse(64, 119, 58, 7, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'bush') {
      const rnd = seeded(41);
      const blobs = [];
      for (let i = 0; i < 16; i++) blobs.push([22 + rnd() * 84, 74 + rnd() * 30, 14 + rnd() * 12]);
      for (const [colour, dx, dy, k] of [['#2c3d1c', 2, 5, 1], ['#49622c', 0, 0, 0.95], ['#6b8440', -4, -6, 0.5]]) {
        g.fillStyle = colour;
        for (const [x, y, r] of blobs) {
          g.beginPath();
          g.arc(x + dx, y + dy, r * k, 0, Math.PI * 2);
          g.fill();
        }
      }
      return;
    }
    const fill = g.createLinearGradient(0, 20, 0, 120);
    if (kind === 'mound') {
      fill.addColorStop(0, '#ffffff');
      fill.addColorStop(1, '#aebfd8');
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(4, 120);
      g.bezierCurveTo(20, 40, 108, 40, 124, 120);
      g.fill();
      return;
    }
    fill.addColorStop(0, '#b39a7a');
    fill.addColorStop(1, '#5c4d3e');
    g.fillStyle = fill;
    g.beginPath();
    for (const [x, y] of [[12, 118], [6, 84], [28, 48], [62, 28], [98, 44], [120, 82], [114, 118]]) g.lineTo(x, y);
    g.fill();
    g.strokeStyle = 'rgba(50, 40, 30, 0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(62, 28);
    g.lineTo(52, 74);
    g.lineTo(22, 96);
    g.moveTo(52, 74);
    g.lineTo(90, 112);
    g.stroke();
  });
}

// A pole with a flag, to mark the way to the hut on the ice.
function mastTexture() {
  return paint(64, 256, (g) => {
    g.fillStyle = '#5b626c';
    g.fillRect(30, 8, 4, 248);
    g.fillStyle = '#c93a2e';
    g.beginPath();
    g.moveTo(34, 10);
    g.lineTo(62, 22);
    g.lineTo(34, 36);
    g.fill();
  });
}

function boatTexture() {
  return paint(256, 256, (g) => {
    g.fillStyle = '#f1efe6';
    g.beginPath();
    g.moveTo(132, 24);
    g.lineTo(132, 196);
    g.lineTo(226, 196);
    g.fill();
    g.fillStyle = '#dcd9cc';
    g.beginPath();
    g.moveTo(122, 60);
    g.lineTo(122, 196);
    g.lineTo(52, 196);
    g.fill();
    g.fillStyle = '#2b3440';
    g.fillRect(125, 16, 4, 200);
    g.beginPath();
    g.moveTo(26, 206);
    g.lineTo(238, 206);
    g.lineTo(212, 240);
    g.lineTo(52, 240);
    g.fill();
  });
}

function buoyTexture() {
  return paint(64, 128, (g) => {
    g.fillStyle = '#c63b2f';
    g.beginPath();
    g.moveTo(8, 124);
    g.lineTo(22, 52);
    g.lineTo(42, 52);
    g.lineTo(56, 124);
    g.fill();
    g.fillStyle = '#f0ede4';
    g.fillRect(17, 78, 30, 12);
    g.fillStyle = '#2b3440';
    g.fillRect(30, 12, 4, 42);
    g.fillRect(24, 6, 16, 10);
  });
}

// The other dwellings: a thatched hut, a mud-brick house and a hut on the ice. `lights` paints only what is lit at night.
const HUTS = {
  thatch: { lit: [[236, 182, 40, 70]] },
  adobe: { lit: [[150, 162, 36, 40], [330, 162, 36, 40]] },
  cabin: { lit: [[176, 172, 40, 34], [304, 172, 40, 34]] },
};
function hutTexture(style, lights) {
  return paint(512, 256, (g) => {
    if (lights) {
      g.fillStyle = '#ffd98a';
      g.shadowColor = '#ffc35a';
      g.shadowBlur = 14;
      for (const [x, y, w, h] of HUTS[style].lit) g.fillRect(x, y, w, h);
      return;
    }
    const dark = '#27313c';
    if (style === 'thatch') {
      g.fillStyle = '#b08a5a';
      g.fillRect(160, 150, 192, 102);
      g.fillStyle = '#8c7440';
      g.beginPath();
      g.moveTo(120, 164);
      g.lineTo(256, 42);
      g.lineTo(392, 164);
      g.fill();
      g.strokeStyle = 'rgba(70, 56, 24, 0.5)';
      g.lineWidth = 2;
      for (let x = 140; x <= 372; x += 18) {
        g.beginPath();
        g.moveTo(256, 44);
        g.lineTo(x, 162);
        g.stroke();
      }
      g.fillStyle = '#2b2321';
      g.fillRect(236, 182, 40, 70);
    } else if (style === 'adobe') {
      g.fillStyle = '#c9a47a';
      g.fillRect(110, 124, 300, 128);
      g.fillRect(300, 92, 110, 34);
      g.fillStyle = '#8a6a4a';
      for (let x = 126; x < 400; x += 34) g.fillRect(x, 132, 8, 8);
      g.fillStyle = dark;
      for (const [x, y, w, h] of HUTS.adobe.lit) g.fillRect(x, y, w, h);
      g.fillStyle = '#4a372a';
      g.fillRect(238, 172, 38, 80);
    } else {
      g.fillStyle = '#a33a30';
      g.fillRect(140, 132, 240, 120);
      g.fillStyle = '#6b6f78';
      g.fillRect(320, 60, 16, 40);
      g.fillStyle = '#eef3fa';
      g.beginPath();
      g.moveTo(118, 138);
      g.lineTo(260, 62);
      g.lineTo(402, 138);
      g.lineTo(402, 150);
      g.lineTo(260, 78);
      g.lineTo(118, 150);
      g.fill();
      g.fillStyle = dark;
      for (const [x, y, w, h] of HUTS.cabin.lit) g.fillRect(x, y, w, h);
      g.fillStyle = '#51201b';
      g.fillRect(244, 178, 34, 74);
    }
    const shade = g.createLinearGradient(0, 40, 0, 252);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = shade;
    g.fillRect(0, 0, 512, 256);
  });
}

// A plain white picture, for things that are one colour.
function whiteTexture() {
  return paint(2, 2, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 2, 2);
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
  uniform float uKind; // which scenery: its place in SCENERY
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

    vec3 col;
    float water = 0.0;
    if (uKind > 3.5) {
      // The open sea: a swell, and under the observer's feet a wooden deck.
      float swell =
        noise(p * vec2(0.22, 0.09)) * (1.0 - smoothstep(0.3, 1.0, px * 0.22)) +
        noise(p * vec2(1.3, 0.6)) * 0.6 * (1.0 - smoothstep(0.3, 1.0, px * 1.3)) +
        noise(p * vec2(5.0, 3.0)) * 0.35 * (1.0 - smoothstep(0.3, 1.0, px * 5.0));
      col = vec3(0.05, 0.19, 0.28) * (1.0 + 1.1 * swell);
      float deck = band(p.x, ${DECK.toFixed(2)}, 0.02 + px) * band(p.y, ${DECK.toFixed(2)}, 0.02 + px);
      float seam = smoothstep(0.42, 0.5, abs(fract(p.x / 0.22) - 0.5)) * (1.0 - smoothstep(0.02, 0.1, px));
      vec3 wood = vec3(0.47, 0.38, 0.27) * (1.0 + 0.3 * noise(vec2(floor(p.x / 0.22) * 7.0, p.y * 0.7)) + 0.25 * rough);
      col = mix(col, wood * (1.0 - 0.45 * seam), deck);
      water = 1.0 - deck;
    } else if (uKind > 2.5) {
      // Snow: drifts, with ridges the wind has cut, and a trodden trail.
      float drift = noise(p * 0.015) * (1.0 - smoothstep(0.3, 1.0, px * 0.015)) + noise(p * 0.12) * 0.5 * (1.0 - smoothstep(0.3, 1.0, px * 0.12));
      float ridges = sin((p.x * 0.5 - p.y * 0.22) * 4.0 + noise(p * 0.35) * 6.0) * (1.0 - smoothstep(0.06, 0.3, px));
      col = mix(vec3(0.74, 0.82, 0.93), vec3(0.97, 0.98, 1.0), clamp(0.62 + drift + 0.1 * ridges + 0.25 * rough, 0.0, 1.0));
      col = mix(col, vec3(0.68, 0.76, 0.89), 0.6 * track(p));
    } else if (uKind > 1.5) {
      // Desert: sand in low dunes, rippled by the wind, with stones here and there.
      float dune = noise(p * 0.011) * (1.0 - smoothstep(0.3, 1.0, px * 0.011)) + noise(p * 0.06) * 0.5 * (1.0 - smoothstep(0.3, 1.0, px * 0.06));
      float ripple = sin((p.x * 0.9 + p.y * 0.4) * 7.0 + noise(p * 0.5) * 7.0) * (1.0 - smoothstep(0.04, 0.2, px));
      col = vec3(0.80, 0.66, 0.43) * (1.0 + 0.45 * dune + 0.05 * ripple + 0.22 * rough);
      float stones = smoothstep(0.3, 0.38, noise(p * 2.3)) * (1.0 - smoothstep(0.3, 1.0, px * 2.3));
      col = mix(col, vec3(0.5, 0.42, 0.33), 0.5 * stones);
      col = mix(col, vec3(0.70, 0.57, 0.38), 0.45 * track(p));
    } else if (uKind > 0.5) {
      // The tropics: dry grass and green in patches, red earth showing through, and one track.
      float patches = noise(p * 0.018) * (1.0 - smoothstep(0.3, 1.0, px * 0.018)) + noise(p * 0.09) * 0.6 * (1.0 - smoothstep(0.3, 1.0, px * 0.09));
      col = mix(vec3(0.55, 0.49, 0.24), vec3(0.33, 0.42, 0.17), smoothstep(-0.2, 0.2, patches)) * (1.0 + 0.55 * rough);
      float worn = smoothstep(0.2, 0.34, noise(p * 0.27 + 9.0)) * (1.0 - smoothstep(0.3, 1.0, px * 0.27));
      vec3 red = vec3(0.62, 0.37, 0.23) * (1.0 + 0.3 * noise(p * 1.7) * (1.0 - smoothstep(0.3, 1.0, px * 1.7)));
      col = mix(col, red, max(track(p), 0.7 * worn));
    } else {
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
    col = home ? mown : beyond * (1.0 + 0.5 * rough);

    // A hedge along every field edge, with a gap where a track goes through.
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 160.0;
    float hedge = band(edge, 1.5, 0.3 + fwidth(edge)) * (1.0 - smoothstep(3.0, 12.0, fwidth(edge)));
    col = mix(col, vec3(0.13, 0.2, 0.1), hedge);

    float bare = max(track(p), track(p.yx));
    vec3 earth = vec3(0.49, 0.42, 0.31) * (1.0 + 0.3 * noise(p * 1.7) * (1.0 - smoothstep(0.3, 1.0, px * 1.7)));
    col = mix(col, earth, bare);
    }

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
    col *= 1.0 - 0.52 * uShade * shade * (1.0 - 0.6 * water);
    col *= uLight;

    // Towards a low sun the ground glints, and towards the horizon it fades into the air.
    float air = exp(-down * 16.0);
    float toSun = max(dot(normalize(d.xz + vec2(1e-6)), normalize(uSun.xz + vec2(1e-6))), 0.0);
    col += uSheen * vec3(1.0, 0.78, 0.5) * pow(toSun, 12.0) * air * 0.3;
    if (water > 0.0) {
      // Water mirrors the sky, more so the more it is looked along, and glitters toward the sun.
      float glance = pow(1.0 - down, 5.0);
      col = mix(col, uHaze, water * (0.08 + 0.62 * glance));
      col += water * uSheen * vec3(1.0, 0.85, 0.6) * pow(toSun, 40.0) * (0.25 + glance) * 0.8;
    }
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
    this.scene = scene;
    this.maps = {}; // pictures, each painted the first time it is wanted
    this.sets = {}; // the scenery of each kind of place, built the first time the observer goes there
    this.kind = null;

    this.uniforms = {
      uLight: this.light,
      uHaze: this.haze,
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uShade: { value: 0 },
      uSheen: { value: 0 },
      uKind: { value: 0 },
      uCast: { value: Array.from({ length: CASTERS }, () => new THREE.Vector4(1e6, 1e6, 0, 0)) },
      uLift: { value: new Array(CASTERS).fill(0) },
    };
    // Opaque, but drawn with the see-through things so that it comes after the stars and hides the ones below the horizon.
    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(900, 96, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        defines: { CASTERS },
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
    this.setPlace('field');
  }

  /** A picture by name, painted once. */
  map(name, make) {
    return (this.maps[name] ??= make());
  }

  /**
   * Everything that stands on one kind of ground. The same few spots are used
   * everywhere: where the field has bales, a tree, a smaller tree and a farmhouse.
   * Returns what was put in the scene, and what casts a shadow:
   * [east, south, half-width, top, the height its shadow starts from].
   */
  build(kind) {
    const set = { objects: [], casters: [] };
    this.into = set;
    const scene = this.scene;
    const spots = BALES.map(([az, dist, endOn]) => ({ at: place(az, dist), endOn }));
    const tall = place(TREE.az, TREE.dist);
    const small = place(SMALL_TREE.az, SMALL_TREE.dist);
    const home = place(HOUSE.az, HOUSE.dist);
    const dwelling = (name, day, night) => {
      this.addSprite(scene, this.map(name, day), home, HOUSE.width, HOUSE.height);
      this.addSprite(scene, this.map(`${name} lit`, night), home, HOUSE.width, HOUSE.height, { light: this.full, haze: this.none, alpha: this.windows, order: 6.6 });
    };
    const lumps = (name, list, size, halfWidth, top) => {
      for (const s of list) {
        this.addSprite(scene, this.map(name, () => lumpTexture(name)), s.at, size, size);
        set.casters.push([s.at[0], s.at[1], halfWidth, top, 0]);
      }
    };
    if (kind === 'field') {
      this.addFence(scene);
      for (const b of spots) {
        this.addSprite(scene, this.map(`bale ${b.endOn}`, () => baleTexture(b.endOn)), b.at, BALE_M, BALE_M);
        set.casters.push([b.at[0], b.at[1], 0.62, 1.25, 0]);
      }
      const tree = this.map('tree', treeTexture);
      this.addSprite(scene, tree, tall, TREE.size, TREE.size);
      this.addSprite(scene, tree, small, -SMALL_TREE.size, SMALL_TREE.size);
      set.casters.push([tall[0], tall[1], 0.4, TREE.size * 0.45, 0], [tall[0], tall[1], TREE.size * 0.36, TREE.size * 0.88, TREE.size * 0.42]);
      dwelling('house', () => houseTexture(false), () => houseTexture(true));
    } else if (kind === 'tropics') {
      lumps('bush', spots.slice(0, 11), 1.9, 0.75, 1.0);
      const palm = this.map('palm', palmTexture);
      this.addSprite(scene, palm, tall, 11, 11);
      this.addSprite(scene, palm, small, -8, 8);
      set.casters.push([tall[0], tall[1], 0.25, 8, 0], [tall[0], tall[1], 2.6, 9.4, 7.2]);
      dwelling('thatch', () => hutTexture('thatch', false), () => hutTexture('thatch', true));
    } else if (kind === 'desert') {
      lumps('rock', spots.slice(0, 12), 1.5, 0.6, 1.05);
      const cactus = this.map('cactus', cactusTexture);
      this.addSprite(scene, cactus, tall, 3.2, 6.4);
      this.addSprite(scene, cactus, small, -2.4, 4.8);
      set.casters.push([tall[0], tall[1], 0.35, 6.2, 0]);
      dwelling('adobe', () => hutTexture('adobe', false), () => hutTexture('adobe', true));
    } else if (kind === 'snow') {
      lumps('mound', spots.slice(0, 10), 2.4, 0.95, 0.8);
      this.addSprite(scene, this.map('mast', mastTexture), tall, 2, 8);
      set.casters.push([tall[0], tall[1], 0.07, 7.8, 0]);
      dwelling('cabin', () => hutTexture('cabin', false), () => hutTexture('cabin', true));
    } else {
      // At sea: a post at each corner of the deck, a buoy near by and a boat a long way off.
      const white = this.map('white', whiteTexture);
      for (const [x, z] of [[DECK, DECK], [DECK, -DECK], [-DECK, DECK], [-DECK, -DECK]]) {
        this.addSprite(scene, white, [x, z], 0.12, 1.0, { tint: [0.4, 0.32, 0.23] });
        set.casters.push([x, z, 0.06, 1.0, 0]);
      }
      this.addSprite(scene, this.map('buoy', buoyTexture), place(247, 34), 1.3, 2.6);
      this.addSprite(scene, this.map('boat', boatTexture), place(24, 420), 22, 22);
    }
    for (const part of set.objects) part.visible = false;
    return set;
  }

  /** Changes the scenery to suit a kind of place: one of SCENERY. */
  setPlace(kind) {
    if (kind === this.kind || !SCENERY.includes(kind)) return;
    for (const part of this.sets[this.kind]?.objects ?? []) part.visible = false;
    this.kind = kind;
    const set = (this.sets[kind] ??= this.build(kind));
    for (const part of set.objects) part.visible = true;
    this.uniforms.uKind.value = SCENERY.indexOf(kind);
    // Shadows that are not wanted are put where nothing looks.
    this.uniforms.uCast.value.forEach((v, i) => {
      const c = set.casters[i] ?? [1e6, 1e6, 0, 0, 0];
      v.set(c[0], c[1], c[2], c[3]);
      this.uniforms.uLift.value[i] = c[4];
    });
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
    this.into.objects.push(mesh);
  }

  /** A post-and-wire fence along the north side of the east-west track, lower than the eye. */
  addFence(scene) {
    const white = this.map('white', whiteTexture);
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
      this.into.objects.push(part);
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
