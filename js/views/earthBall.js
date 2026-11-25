// The ball of the Earth, as the two views that show it from outside draw it:
// the globe model's own view and the view from space. One ball, one way of
// lighting it, so the two cannot disagree.
//
// The ball's radius is one. Its north pole is +y, and a place on it is where
// globeVec in js/models.js puts that latitude and longitude.
import * as THREE from 'three';
import { makeLandTexture } from '../scene-utils.js';
import { ECLIPSE_GLSL, eclipseUniforms } from './eclipseShade.js';

/**
 * Makes the ball. Its shader is given one fact about the sun, the direction to
 * it (sunDir, measured along the ball's own axes), and shades each place by the
 * sun's height there. With n the direction from the centre to a place, both of
 * length one:
 *
 *   d = n · sunDir = the sine of the sun's height at that place, by geometry alone
 *
 * which is globePredict's formula in js/models.js, written with vectors. It is
 * day where d is above zero. The edge is softened over 0.015 either side (0.9°
 * of the sun's height), and the dark side is lifted a little while the sun is
 * less than 18° down (d above -0.31), the usual end of twilight. The brightness
 * figures (0.2 at night, up to 1 by day) are chosen so the map can be read on
 * both sides.
 *
 * Returns the ball and its `uniforms`: set `uniforms.sunDir`, and call
 * setEclipse (js/views/eclipseShade.js) with them for the moon's shadow.
 */
export function makeEarthBall(landCanvas) {
  const uniforms = {
    map: { value: makeLandTexture(landCanvas) },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    ...eclipseUniforms(),
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 64),
    new THREE.ShaderMaterial({
      uniforms,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      vertexShader: `
        varying vec3 vN;
        void main() {
          vN = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 sunDir;
        varying vec3 vN;
        ${ECLIPSE_GLSL}
        void main() {
          vec3 n = normalize(vN);
          // This point's longitude and latitude, in radians, to look up land or sea in the picture of the map.
          float lon = atan(-n.z, n.x);
          float lat = asin(clamp(n.y, -1.0, 1.0));
          vec3 c = texture2D(map, vec2(lon / 6.28318531 + 0.5, lat / 3.14159265 + 0.5)).rgb;
          // The sine of the sun's height here: day above zero, night below.
          float d = dot(n, sunDir);
          float day = smoothstep(-0.015, 0.015, d);
          float twilight = smoothstep(-0.31, 0.0, d);
          // The moon's shadow, when it is on the Earth: an eclipse of the sun. It only darkens the day side.
          gl_FragColor = vec4(c * (0.2 + 0.18 * twilight + 0.62 * day) * mix(1.0, globeShade(n), day), 1.0);
        }`,
    }),
  );
  return { mesh, uniforms };
}
