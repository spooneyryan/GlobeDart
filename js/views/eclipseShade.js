// The moon's shadow drawn on the ground of the two outside views.
//
// Every place on the map is asked the question the observer is asked in
// models.js: how far apart do the sun and the moon look from here, and how
// wide is each? Where the moon overlaps the sun the ground is dimmed, and
// where it covers all of it the ground goes dark. So the shadow on show is
// each model's own, worked out from where that model has the sun and moon.
//
// Distances here are in Earth radii, measured from the centre of the Earth.
import * as THREE from 'three';
import { globeVec } from '../models.js';
import { EARTH_RADIUS_KM, SUN_RADIUS_KM, MOON_RADIUS_KM } from '../astro.js';
import { scale3 } from '../scene-utils.js';

// The sum itself is eclipseDepth in models.js. It is written out again here for
// the graphics card, which works it out for every point of the map.
//
// Two shortcuts are taken, both good to a small part of a percent for discs
// half a degree wide and less than a degree apart:
//   a disc's radius as an angle  = its radius ÷ its distance     (in place of the atan of that)
//   the angle between two discs  = |a × b| for unit directions   (the sine of the angle, in place of the angle)
//
// eclipseDepth: how much of the sun's width the moon covers, 0 to 1. With s and
// m the radii of the two discs as angles, and x the angle between their centres:
//
//   (s + m − x) ÷ 2s      no less than 0, and no more than 1 or m ÷ s
//
// eclipseShade: how bright the ground is left. These figures are chosen for the
// drawing, not measured: full brightness with none of the sun covered, falling
// to 45% as the last of it goes, and a step down to 12% where all of it is
// covered (a depth of 1, to within 0.0005).
//
//   1 − 0.55 × depth² − 0.33 where the sun is all covered
//
// The notes inside the shader are kept to plain letters, which is all that
// some graphics cards' compilers will read.

export const ECLIPSE_GLSL = `
  uniform vec3 sunAt;       // the sun and the moon on the globe model, in Earth radii from the Earth's centre
  uniform vec3 moonAt;
  uniform float sunRadius;  // the real radius of each, in Earth radii
  uniform float moonRadius; // nothing when there is no moon on show

  float eclipseDepth(float s, float m, float x) {
    return clamp((s + m - x) / (2.0 * s), 0.0, min(1.0, m / s));
  }

  // How bright the ground is left: dimmer the more of the sun is covered, and dark where all of it is.
  float eclipseShade(float depth) {
    return 1.0 - 0.55 * depth * depth - 0.33 * step(0.9995, depth);
  }

  // The globe's shadow at a place n on a ball of radius one. From that place the sun and the moon each
  // have a direction, a distance and so a width, and those go into the sum above.
  float globeShade(vec3 n) {
    if (moonRadius <= 0.0) return 1.0;
    vec3 toSun = sunAt - n;
    vec3 toMoon = moonAt - n;
    float sunDist = length(toSun);
    float moonDist = length(toMoon);
    // The moon more than a right angle from the sun covers none of it.
    if (dot(toSun, toMoon) <= 0.0) return 1.0;
    // Two directions this close: the length of their cross product is the angle between them.
    float sep = length(cross(toSun / sunDist, toMoon / moonDist));
    return eclipseShade(eclipseDepth(sunRadius / sunDist, moonRadius / moonDist, sep));
  }`;

/** The uniforms ECLIPSE_GLSL reads. The places are stand-ins until setEclipse is first called. */
export function eclipseUniforms() {
  return {
    sunAt: { value: new THREE.Vector3(23000, 0, 0) },
    moonAt: { value: new THREE.Vector3(0, 60, 0) },
    sunRadius: { value: SUN_RADIUS_KM / EARTH_RADIUS_KM },
    moonRadius: { value: 0 },
  };
}

/**
 * Tells the shader where the sun and moon are. `sub` and `moon` are each the
 * place on Earth the body is overhead and its distance in km, as astro.js gives
 * them. `moon` is null when the moon is not on show.
 */
export function setEclipse(uniforms, sub, moon) {
  uniforms.sunAt.value.fromArray(scale3(globeVec(sub.lat, sub.lon), sub.distKm / EARTH_RADIUS_KM));
  uniforms.moonRadius.value = moon ? MOON_RADIUS_KM / EARTH_RADIUS_KM : 0;
  if (moon) uniforms.moonAt.value.fromArray(scale3(globeVec(moon.lat, moon.lon), moon.distKm / EARTH_RADIUS_KM));
}

/**
 * A closed ring of n line segments added to `target` (a DynamicSegments).
 * `at(angle)` gives the point of the ring at an angle in radians, 0 to 2π.
 */
export function ring(target, at, n = 40) {
  let prev = at(0);
  for (let i = 1; i <= n; i++) {
    const next = at((i / n) * 2 * Math.PI);
    target.add(prev, next);
    prev = next;
  }
}
