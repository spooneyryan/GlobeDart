// The moon's shadow drawn on the ground of the two outside views.
//
// Every place on the map is asked the question the observer is asked in
// models.js: how far apart do the sun and the moon look from here, and how
// wide is each? Where the moon overlaps the sun the ground is dimmed, and
// where it covers all of it the ground goes dark. So the shadow on show is
// each model's own, worked out from where that model has the sun and moon.
import * as THREE from 'three';
import { globeVec } from '../models.js';
import { EARTH_RADIUS_KM, SUN_RADIUS_KM, MOON_RADIUS_KM } from '../astro.js';
import { scale3 } from '../scene-utils.js';

// The sum itself is eclipseDepth in models.js. It is written out again here for
// the graphics card, which works it out for every point of the map.

export const ECLIPSE_GLSL = `
  uniform vec3 sunAt;       // the sun and the moon on the globe model, in Earth radii from the Earth's centre
  uniform vec3 moonAt;
  uniform float sunRadius;
  uniform float moonRadius; // nothing when there is no moon on show

  float eclipseDepth(float s, float m, float x) {
    return clamp((s + m - x) / (2.0 * s), 0.0, min(1.0, m / s));
  }

  // How bright the ground is left: dimmer the more of the sun is covered, and dark where all of it is.
  float eclipseShade(float depth) {
    return 1.0 - 0.55 * depth * depth - 0.33 * step(0.9995, depth);
  }

  // The globe's shadow at a place on a ball of radius one.
  float globeShade(vec3 n) {
    if (moonRadius <= 0.0) return 1.0;
    vec3 toSun = sunAt - n;
    vec3 toMoon = moonAt - n;
    float sunDist = length(toSun);
    float moonDist = length(toMoon);
    if (dot(toSun, toMoon) <= 0.0) return 1.0;
    // Two directions this close: the length of their cross product is the angle between them.
    float sep = length(cross(toSun / sunDist, toMoon / moonDist));
    return eclipseShade(eclipseDepth(sunRadius / sunDist, moonRadius / moonDist, sep));
  }`;

export function eclipseUniforms() {
  return {
    sunAt: { value: new THREE.Vector3(23000, 0, 0) },
    moonAt: { value: new THREE.Vector3(0, 60, 0) },
    sunRadius: { value: SUN_RADIUS_KM / EARTH_RADIUS_KM },
    moonRadius: { value: 0 },
  };
}

/** Tells the shader where the sun and moon are. `moon` is null when the moon is not on show. */
export function setEclipse(uniforms, sub, moon) {
  uniforms.sunAt.value.fromArray(scale3(globeVec(sub.lat, sub.lon), sub.distKm / EARTH_RADIUS_KM));
  uniforms.moonRadius.value = moon ? MOON_RADIUS_KM / EARTH_RADIUS_KM : 0;
  if (moon) uniforms.moonAt.value.fromArray(scale3(globeVec(moon.lat, moon.lon), moon.distKm / EARTH_RADIUS_KM));
}

/** A ring of line segments: `at(angle)` gives each point round it. */
export function ring(target, at, n = 40) {
  let prev = at(0);
  for (let i = 1; i <= n; i++) {
    const next = at((i / n) * 2 * Math.PI);
    target.add(prev, next);
    prev = next;
  }
}
