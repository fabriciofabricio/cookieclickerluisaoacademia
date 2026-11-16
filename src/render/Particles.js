import * as THREE from 'three';
import { rand } from '../core/utils.js';

// Sistema de partículas com pool fixo (zero alocação por frame).
// Dois lotes: aditivo (brilhos, faíscas douradas) e normal (suor, giz, confete).

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aSpin;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSpin;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vSpin = aSpin;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uSquare;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSpin;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    uv = mat2(c, -s, s, c) * uv;
    vec4 tex;
    if (uSquare > 0.5) {
      // Confete: retângulo achatado (gira com aSpin).
      float inside = step(abs(uv.x), 0.38) * step(abs(uv.y), 0.18);
      tex = vec4(1.0, 1.0, 1.0, inside);
    } else {
      tex = texture2D(uMap, uv + 0.5);
    }
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

class ParticleBatch {
  constructor(capacity, { additive = false, map, square = false }) {
    this.capacity = capacity;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSpin', new THREE.BufferAttribute(this.spin, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: map }, uScale: { value: 300 }, uSquare: { value: square ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    // Estado por partícula
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.spinVel = new Float32Array(capacity);
    this.cursor = 0;
  }

  spawn(p) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx;
    this.vel[i * 3 + 1] = p.vy;
    this.vel[i * 3 + 2] = p.vz;
    this.col[i * 3] = p.r;
    this.col[i * 3 + 1] = p.g;
    this.col[i * 3 + 2] = p.b;
    this.life[i] = p.life;
    this.maxLife[i] = p.life;
    this.baseSize[i] = p.size;
    this.grow[i] = p.grow ?? 0;
    this.gravity[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.spin[i] = Math.random() * 6.28;
    this.spinVel[i] = p.spin ?? 0;
  }

  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const k = 1 - Math.min(1, this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01 && this.gravity[i] > 0) {
        this.pos[i * 3 + 1] = 0.01;
        this.vel[i * 3] *= 0.5;
        this.vel[i * 3 + 2] *= 0.5;
        this.vel[i * 3 + 1] *= -0.2;
      }
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * t);
      this.alpha[i] = t < 0.1 ? t * 10 : 1 - Math.pow(Math.max(0, (t - 0.1) / 0.9), 2);
      this.spin[i] += this.spinVel[i] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSpin.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene, glowMap) {
    this.add = new ParticleBatch(900, { additive: true, map: glowMap });
    this.norm = new ParticleBatch(900, { additive: false, map: glowMap });
    this.confetti = new ParticleBatch(500, { additive: false, map: glowMap, square: true });
    scene.add(this.add.points, this.norm.points, this.confetti.points);
    this._c = new THREE.Color();
  }

  /** projScale = altura do buffer em px / (2·tan(fov/2)) — tamanho em metros vira pixels. */
  setScale(projScale) {
    for (const b of [this.add, this.norm, this.confetti]) b.mat.uniforms.uScale.value = projScale;
  }

  sweat(pos, n = 3) {
    for (let i = 0; i < n; i++) {
      this.norm.spawn({
        x: pos.x + rand(-0.12, 0.12), y: pos.y + rand(-0.05, 0.08), z: pos.z + rand(-0.12, 0.12),
        vx: rand(-0.6, 0.6), vy: rand(0.6, 1.6), vz: rand(-0.6, 0.6),
        r: 0.75, g: 0.88, b: 1.0, life: rand(0.5, 0.8), size: rand(0.035, 0.06), gravity: 6, drag: 0.5,
      });
    }
  }

  chalk(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      this.norm.spawn({
        x: pos.x + rand(-0.1, 0.1), y: pos.y + rand(-0.05, 0.05), z: pos.z + rand(-0.1, 0.1),
        vx: rand(-0.5, 0.5), vy: rand(0.1, 0.6), vz: rand(-0.5, 0.5),
        r: 0.95, g: 0.95, b: 0.92, life: rand(0.8, 1.5), size: rand(0.08, 0.16), grow: 2.2, gravity: -0.05, drag: 2.2,
      });
    }
  }

  dust(pos, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.6, 1.4);
      this.norm.spawn({
        x: pos.x, y: pos.y + 0.05, z: pos.z,
        vx: Math.cos(a) * s, vy: rand(0.1, 0.5), vz: Math.sin(a) * s,
        r: 0.6, g: 0.56, b: 0.5, life: rand(0.6, 1.1), size: rand(0.12, 0.2), grow: 1.6, drag: 2.6,
      });
    }
  }

  sparkle(pos, n = 10, color = 0xffd34d, speed = 1.6) {
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      this.add.spawn({
        x: pos.x + rand(-0.1, 0.1), y: pos.y + rand(-0.1, 0.1), z: pos.z + rand(-0.1, 0.1),
        vx: rand(-1, 1) * speed, vy: rand(-0.3, 1.2) * speed, vz: rand(-1, 1) * speed,
        r: this._c.r, g: this._c.g, b: this._c.b, life: rand(0.4, 0.9), size: rand(0.05, 0.12), gravity: 1.5, drag: 1.8,
      });
    }
  }

  /** Onda de choque horizontal (crítico / mega rep). */
  ring(pos, color = 0xffd34d, n = 36, speed = 3.5) {
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * speed, vy: 0, vz: Math.sin(a) * speed,
        r: this._c.r, g: this._c.g, b: this._c.b, life: 0.5, size: 0.12, drag: 3,
      });
    }
  }

  confettiBurst(pos, n = 120) {
    const colors = [0xff4f7b, 0xffd34d, 0x4fd1ff, 0x7dff8a, 0xb07cff, 0xffffff];
    for (let i = 0; i < n; i++) {
      this._c.set(colors[i % colors.length]);
      this.confetti.spawn({
        x: pos.x + rand(-0.3, 0.3), y: pos.y, z: pos.z + rand(-0.3, 0.3),
        vx: rand(-2.5, 2.5), vy: rand(3, 6.5), vz: rand(-2.5, 2.5),
        r: this._c.r, g: this._c.g, b: this._c.b, life: rand(2, 3.2), size: rand(0.1, 0.16), gravity: 4.5, drag: 1.4, spin: rand(-12, 12),
      });
    }
  }

  /** Brilho contínuo (shake dourado, aura). */
  aura(pos, color = 0xffd34d, radius = 0.4) {
    this._c.set(color);
    const a = Math.random() * Math.PI * 2;
    this.add.spawn({
      x: pos.x + Math.cos(a) * radius, y: pos.y + rand(-0.2, 0.2), z: pos.z + Math.sin(a) * radius,
      vx: 0, vy: rand(0.3, 0.8), vz: 0,
      r: this._c.r, g: this._c.g, b: this._c.b, life: rand(0.6, 1.2), size: rand(0.04, 0.09), drag: 0.5,
    });
  }

  update(dt) {
    this.add.update(dt);
    this.norm.update(dt);
    this.confetti.update(dt);
  }
}
