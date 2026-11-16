import * as THREE from 'three';

// Céu em gradiente com sol baixo e estrelinhas (entardecer do bairro).
export function createSky({ top = 0x1d2a6b, mid = 0x9a4a7a, horizon = 0xffa060, sunDir = new THREE.Vector3(-0.4, 0.12, 1).normalize(), sunColor = 0xffd6a0, stars = 0.6 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uMid: { value: new THREE.Color(mid) },
      uHorizon: { value: new THREE.Color(horizon) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(sunColor) },
      uStars: { value: stars },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunColor;
      uniform float uStars;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uTop, smoothstep(0.18, 0.75, h));
        col = mix(col, uHorizon * 0.5, smoothstep(0.0, -0.2, h));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sd, 600.0) * 6.0;
        col += uSunColor * pow(sd, 12.0) * 0.45;
        // estrelas só no alto
        vec3 g = floor(d * 280.0);
        float s = step(0.9975, hash(g)) * smoothstep(0.25, 0.7, h) * uStars;
        col += vec3(s) * 1.4;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}
