import * as THREE from 'three';

// ════════════════════════════════════════════════════════════════
//  Material de holograma: textura + borda brilhante, scanlines e
//  tremulação. Usado pela waifu no smartwatch e no projetor (WaifuFit).
// ════════════════════════════════════════════════════════════════

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    float scan = 0.82 + 0.18 * sin(vUv.y * 260.0 - time * 7.0);
    float band = smoothstep(0.0, 0.04, abs(fract(vUv.y * 1.5 - time * 0.35) - 0.5));
    float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x) * smoothstep(0.0, 0.04, vUv.y);
    float flicker = 0.92 + 0.08 * sin(time * 37.0) * sin(time * 11.0);
    vec3 col = mix(c.rgb, tint, 0.28) * scan * flicker;
    col += tint * (1.0 - band) * 0.35;
    float a = c.a * opacity * edge * (0.75 + 0.25 * band);
    gl_FragColor = vec4(col * 1.4, a);
  }
`;

export function hologramMaterial(texture, tint = 0x7fe8ff) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, time: { value: 0 }, tint: { value: new THREE.Color(tint) }, opacity: { value: 0.9 } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Painel holográfico (billboard opcional) com base emissiva. */
export function hologramPanel(texture, w, h, tint) {
  const g = new THREE.Group();
  const mat = hologramMaterial(texture, tint);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.y = h / 2;
  g.add(plane);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.32, w * 0.36, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.8, roughness: 0.3, emissive: tint ?? 0x7fe8ff, emissiveIntensity: 0.6 }));
  base.position.y = 0.015;
  g.add(base);
  g.userData.mat = mat;
  g.userData.plane = plane;
  return g;
}
