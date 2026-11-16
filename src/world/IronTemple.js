import * as THREE from 'three';
import { IRON } from '../config/gyms.js';
import { ASSETS } from '../config/assets.manifest.js';
import { createSky } from './Sky.js';
import * as P from './Props.js';
import { rand, clamp, mulberry32 } from '../core/utils.js';
import { labelTexture } from '../render/ProceduralTextures.js';
import { buildNeighborhood } from './Neighborhood.js';

// ════════════════════════════════════════════════════════════════
//  IRON TEMPLE — a academia "de verdade" (academia 2).
//  Piso de borracha, parede de espelho no fundo, neon roxo/vermelho/ciano,
//  painéis de LED no teto preto, fachada de vidro pra avenida e o letreiro
//  "IRON TEMPLE" brilhando por cima da porta. Mesma interface da GarageGym
//  (machines, obstacles, cameraColliders, floorMeshes, collide, update...).
// ════════════════════════════════════════════════════════════════

const Y = new THREE.Vector3(0, 1, 0);
const NEON = { roxo: 0xa84dff, vermelho: 0xff2a5a, ciano: 0x2ad8ff, ouro: 0xffd34d };

/** Letreiro de neon (texto com brilho, fundo transparente). */
function neonSign(text, color, w, h, font = 'Impact, "Arial Black", sans-serif', sub = null) {
  const tex = labelTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    const css = `#${new THREE.Color(color).getHexString()}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${H * (sub ? 0.5 : 0.62)}px ${font}`;
    c.shadowColor = css;
    c.shadowBlur = H * 0.12;
    c.fillStyle = css;
    for (let i = 0; i < 2; i++) c.fillText(text, W / 2, H * (sub ? 0.4 : 0.52));
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.75;
    c.fillText(text, W / 2, H * (sub ? 0.4 : 0.52));
    c.globalAlpha = 1;
    if (sub) {
      c.font = `700 ${H * 0.2}px sans-serif`;
      c.fillStyle = css;
      c.fillText(sub, W / 2, H * 0.82);
    }
  }, 1024, Math.round((1024 * h) / w));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
  m.renderOrder = 2;
  return m;
}

/** Piso de borracha em placas 1×1 m com granulado (textura procedural). */
function rubberFloorTexture() {
  const t = labelTexture((c, W, H) => {
    const rng = mulberry32(4242);
    c.fillStyle = '#1b1b20';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const v = 30 + Math.floor(rng() * 40);
      c.fillStyle = rng() < 0.08 ? `rgb(${v + 60},${v + 20},${v + 90})` : `rgb(${v},${v},${v + 4})`;
      c.fillRect(rng() * W, rng() * H, 1.5, 1.5);
    }
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.lineWidth = 3;
    c.strokeRect(1, 1, W - 2, H - 2);
  }, 256, 256);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class IronTemple {
  constructor(loader, quality) {
    this.def = IRON;
    this.loader = loader;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'iron';
    this.structure = new THREE.Group();
    this.group.add(this.structure);
    this.obstacles = [];
    this.cameraColliders = [];
    this.floorMeshes = [];
    this.machines = new Map();
    this.genVisuals = {};
    this.neonTubes = [];
    this.radioPos = new THREE.Vector3(0, 3.4, -6.4); // caixas de som do Templo (música ambiente)
    this.belts = [];
    this.spinWheels = [];
    this.t = 0;
  }

  async build() {
    const L = this.loader;
    const [wallTex, ceilTex, metalTex, asphaltTex, sidewalkTex] = await Promise.all([
      L.pbr('plaster_wall', 'plaster_wall', { size: 512, seed: 31, blocks: true, color: [0.3, 0.3, 0.34], repeat: [3, 1] }),
      L.pbr('concrete_floor', 'concrete_floor', { size: 256, seed: 22, repeat: [3, 2] }),
      L.pbr('rusty_metal', 'rusty_metal', { size: 256, seed: 5, repeat: [1, 1] }),
      L.pbr('asphalt', 'asphalt', { size: 256, seed: 13, repeat: [8, 2] }),
      L.pbr('sidewalk', 'sidewalk', { size: 256, seed: 3, repeat: [7, 1] }),
    ]);
    const wallTex2 = await L.pbr('plaster_wall', 'plaster_wall', { size: 512, seed: 9, blocks: false, color: [0.92, 0.92, 0.9], repeat: [1, 1] });
    this.tex = { wallTex, metalTex, wallTex2 };
    const mat = (set, extra = {}) => new THREE.MeshStandardMaterial({ ...set, ...extra });
    const rubber = rubberFloorTexture();
    this.mats = {
      floor: new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.92, metalness: 0 }),
      wall: mat(wallTex, { roughness: 0.95, color: 0x55555e }),
      ceiling: mat(ceilTex, { color: 0x1a1a1f, roughness: 1 }),
      black: new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.55, metalness: 0.4 }),
      steel: P.M.metal(0.28, 0x9aa2ac),
      darkSteel: P.M.metal(0.35, 0x2a2c32),
      pad: new THREE.MeshPhysicalMaterial({ color: 0x18181c, roughness: 0.5, clearcoat: 0.4 }),
      padRed: new THREE.MeshPhysicalMaterial({ color: 0xa8182e, roughness: 0.45, clearcoat: 0.5 }),
      asphalt: mat(asphaltTex, { roughness: 1 }),
      sidewalk: mat(sidewalkTex, { roughness: 1 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x9fc8ff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide }),
      mirror: new THREE.MeshStandardMaterial({ color: 0xb8c4d0, metalness: 1, roughness: 0.035 }),
    };
    this.metalMats = [this.mats.steel];

    this._structure();
    this._facade();
    this._street();
    this._lights();
    this._props();
    this._machines();
    await this._tryEnvironmentGLB();
    return this;
  }

  // ── Utilidades ───────────────────────────────────────────────────
  _box(w, h, d, material, x, y, z, { collider = true, camera = true, parent = this.structure, obstacle = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (camera) this.cameraColliders.push(m);
    if (obstacle || collider) this.obstacles.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    const uv = m.geometry.attributes.uv;
    const pos = m.geometry.attributes.position;
    const nrm = m.geometry.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i));
      const ny = Math.abs(nrm.getY(i));
      const px = pos.getX(i) + x;
      const py = pos.getY(i) + y;
      const pz = pos.getZ(i) + z;
      if (ny > 0.5) uv.setXY(i, px / 4, pz / 4);
      else if (nx > 0.5) uv.setXY(i, pz / 4, py / 3.2);
      else uv.setXY(i, px / 4, py / 3.2);
    }
    uv.needsUpdate = true;
    return m;
  }

  /** Obstáculo a partir de uma caixa no espaço LOCAL de uma estação (já girada/posicionada). */
  _obstacleLocal(m, x0, x1, z0, z1) {
    const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(Y, m.yaw).add(m.pos));
    this.obstacles.push({
      x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
      z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)),
    });
  }

  _neonTube(a, b, color, radius = 0.025, flicker = false) {
    const v = new THREE.Vector3().subVectors(b, a);
    const mat = P.M.emissive(color, 3.2);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, v.length(), 8), mat);
    m.position.copy(a).addScaledVector(v, 0.5);
    m.quaternion.setFromUnitVectors(Y, v.clone().normalize());
    this.group.add(m);
    this.neonTubes.push({ mat, base: 3.2, flicker, next: rand(2, 6), burst: 0 });
    return m;
  }

  // ── Estrutura ────────────────────────────────────────────────────
  _structure() {
    const { x0, x1, z0, z1, h } = this.def.size;
    const W = x1 - x0;
    const D = z1 - z0;
    const t = 0.25;
    const S = this.structure;

    // Piso de borracha (placas de 1 m)
    const fg = new THREE.PlaneGeometry(W, D);
    const fuv = fg.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * W, fuv.getY(i) * D);
    const floor = new THREE.Mesh(fg, this.mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    floor.receiveShadow = true;
    S.add(floor);
    this.floorMeshes.push(floor);
    // Faixa amarela/preta de "área de peso livre" no chão
    const stripe = labelTexture((c, w, hh) => {
      for (let i = -2; i < 14; i++) {
        c.fillStyle = i % 2 ? '#ffd34d' : '#151515';
        c.beginPath();
        c.moveTo(i * 32, 0);
        c.lineTo(i * 32 + 32, 0);
        c.lineTo(i * 32 + 16, hh);
        c.lineTo(i * 32 - 16, hh);
        c.fill();
      }
    }, 256, 32);
    stripe.wrapS = THREE.RepeatWrapping;
    stripe.repeat.set(10, 1);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.12), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
    st.rotation.x = -Math.PI / 2;
    st.position.set(0.2, 0.004, -3.9);
    S.add(st);

    // Paredes (fundo, laterais) — a frente é a fachada de vidro (_facade)
    this._box(W + t * 2, h, t, this.mats.wall, 0, h / 2, z0 - t / 2);
    this._box(t, h, D, this.mats.wall, x0 - t / 2, h / 2, (z0 + z1) / 2);
    this._box(t, h, D, this.mats.wall, x1 + t / 2, h / 2, (z0 + z1) / 2);
    // Teto preto + vigas
    this._box(W + t * 2 + 0.6, 0.2, D + t * 2 + 0.4, this.mats.ceiling, 0, h + 0.1, (z0 + z1) / 2, { collider: false });
    for (let z = z0 + 1.5; z < z1; z += 3) this._box(W, 0.3, 0.2, this.mats.black, 0, h - 0.15, z, { collider: false, camera: false });
    // Rodapé de borracha
    const base = new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.9 });
    for (const [w, d, x, z] of [[W, 0.02, 0, z0 + 0.01], [0.02, D, x0 + 0.01, (z0 + z1) / 2], [0.02, D, x1 - 0.01, (z0 + z1) / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), base);
      m.position.set(x, 0.075, z);
      S.add(m);
    }

    // Parede de espelho no fundo (reflete o ambiente — e o ego do Brayan)
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, 2.3), this.mats.mirror);
    mirror.position.set(0, 1.5, z0 + 0.015);
    S.add(mirror);
    const frameMat = P.M.metal(0.3, 0xc0c4cc);
    for (const y of [0.34, 2.66]) this._box(W - 0.5, 0.04, 0.04, frameMat, 0, y, z0 + 0.03, { collider: false, camera: false });
    // Neon ciano em cima do espelho e o letreiro gigante
    this._neonTube(new THREE.Vector3(x0 + 0.4, 2.85, z0 + 0.06), new THREE.Vector3(x1 - 0.4, 2.85, z0 + 0.06), NEON.ciano, 0.022);
    const logo = neonSign('IRON TEMPLE', NEON.vermelho, 6, 1.0, undefined, 'desde 1994 • sem desculpas');
    logo.position.set(0, 3.5, z0 + 0.05);
    S.add(logo);
    // Neon roxo nas laterais, um vermelho que pisca
    this._neonTube(new THREE.Vector3(x0 + 0.06, 3.6, z0 + 0.4), new THREE.Vector3(x0 + 0.06, 3.6, z1 - 0.4), NEON.roxo);
    this._neonTube(new THREE.Vector3(x1 - 0.06, 3.6, z0 + 0.4), new THREE.Vector3(x1 - 0.06, 3.6, z1 - 0.4), NEON.vermelho, 0.025, true);
    // Placa "NO PAIN NO GAIN" (versão da casa) na parede direita
    const sign = neonSign('SHAPE É ATITUDE', NEON.roxo, 3.2, 0.6, '"Arial Black", sans-serif');
    sign.position.set(x1 - 0.05, 2.9, -2.4);
    sign.rotation.y = -Math.PI / 2;
    S.add(sign);
  }

  // ── Fachada de vidro com a porta no meio ─────────────────────────
  _facade() {
    const { x0, x1, z1, h } = this.def.size;
    const S = this.structure;
    const g0 = this.def.gate.x0;
    const g1 = this.def.gate.x1;
    const glassH = 3.0;
    // Vidros (bloqueiam a passagem, a câmera também respeita)
    for (const [a, b] of [[x0, g0], [g1, x1]]) {
      const w = b - a;
      const pane = this._box(w, glassH, 0.06, this.mats.glass, (a + b) / 2, glassH / 2, z1, { collider: true, camera: false });
      pane.castShadow = false;
      // Montantes pretos a cada ~2 m
      for (let x = a; x <= b + 0.01; x += w / Math.max(1, Math.round(w / 2))) this._box(0.08, glassH, 0.1, this.mats.black, x, glassH / 2, z1, { collider: false, camera: false });
    }
    this._box(x1 - x0 + 0.5, 0.1, 0.12, this.mats.black, 0, 0.05, z1, { collider: false, camera: false });
    // Faixa sólida acima do vidro (com o letreiro por fora)
    this._box(x1 - x0 + 0.5, h - glassH, 0.25, this.mats.black, 0, glassH + (h - glassH) / 2, z1 + 0.05, { collider: false });
    // Porta de correr aberta (as folhas ficam encostadas nas laterais)
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 0.04), this.mats.glass);
      leaf.position.set(sx * (g1 + 0.55), 1.3, z1 + 0.09);
      S.add(leaf);
      this._box(0.1, glassH, 0.14, this.mats.darkSteel, sx * g1, glassH / 2, z1, { collider: true, camera: false });
    }
    // Capacho
    const mat = P.mesh(P.rbox(2.2, 0.015, 1.0, 0.005), new THREE.MeshStandardMaterial({ color: 0x2a0a14, roughness: 1 }), 0, 0.008, z1 - 0.7, this.group);
    mat.castShadow = false;
    // Marquise + letreiro externo
    this._box(4.4, 0.14, 1.3, this.mats.black, 0, 3.3, z1 + 0.65, { collider: false });
    const outLogo = neonSign('IRON TEMPLE', NEON.vermelho, 5, 0.95);
    outLogo.position.set(0, 3.62, z1 + 0.19);
    S.add(outLogo);
    // Andares de cima do prédio comercial (fecha a vista de fora)
    const upper = new THREE.MeshStandardMaterial({ ...this.tex.wallTex2, color: 0x6a6a74, roughness: 0.95 });
    this._box(x1 - x0 + 0.5, 6.2, 12.5, upper, 0, h + 0.2 + 3.1, (this.def.size.z0 + z1) / 2, { collider: false });
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb860, emissiveIntensity: 1.3, roughness: 0.4 });
    const dimWin = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.2, metalness: 0.4 });
    for (let fl = 0; fl < 2; fl++) {
      for (let i = 0; i < 6; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), Math.random() < 0.5 ? winMat : dimWin);
        win.position.set(x0 + 1.4 + i * 2.65, h + 1.8 + fl * 2.9, z1 + 0.27);
        S.add(win);
      }
    }
  }

  // ── Avenida (mesmo esquema da rua da garagem: calçada, rua, bairro infinito) ──
  _street() {
    const S = this.structure;
    const z1 = this.def.size.z1 + 0.25;
    const sw = this._box(34, 0.12, 2.9, this.mats.sidewalk, 0, -0.061, z1 + 1.45, { collider: false, camera: false });
    this.floorMeshes.push(sw);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(34, 0.16, 0.14), new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.9 }));
    curb.position.set(0, -0.02, z1 + 2.95);
    curb.receiveShadow = curb.castShadow = true;
    S.add(curb);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 7.5), this.mats.asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.1, z1 + 6.75);
    road.receiveShadow = true;
    S.add(road);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8c040, roughness: 0.7 });
    for (let x = -18; x < 18; x += 3) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, -0.095, z1 + 6.75);
      S.add(l);
    }
    // Faixa de pedestre na frente da academia
    for (let i = 0; i < 7; i++) {
      const zb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 }));
      zb.rotation.x = -Math.PI / 2;
      zb.position.set(4.2 + i * 0.9, -0.094, z1 + 6.75);
      S.add(zb);
    }
    const far = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 2.6), this.mats.sidewalk);
    far.position.set(0, -0.04, z1 + 11.8);
    far.receiveShadow = true;
    S.add(far);
    // Lojas vizinhas dos lados (fecham a vista)
    const shop = (x, w, hh, color, label) => {
      const m = new THREE.MeshStandardMaterial({ ...this.tex.wallTex2, color, roughness: 1 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 12.5), m);
      b.position.set(x, hh / 2 - 0.1, this.def.size.z1 - 6);
      b.castShadow = b.receiveShadow = true;
      S.add(b);
      const sg = neonSign(label, label === 'FARMÁCIA' ? 0x5dff9e : 0xffd34d, 3.2, 0.6, '"Arial Black", sans-serif');
      sg.position.set(x, 3.0, this.def.size.z1 + 0.27);
      S.add(sg);
    };
    shop(-12.5, 8.5, 7.5, 0xb8a8e0, 'FARMÁCIA');
    shop(12.5, 8.5, 9.0, 0x8ab0d8, 'AÇAÍ 24H');
    this.neighborhood = buildNeighborhood({ z1, wallTex: this.tex.wallTex2 });
    this.group.add(this.neighborhood);
    // Postes
    for (const px of [-8, 8]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.5, 10), P.M.metal(0.6, 0x5a5a5a));
      pole.position.set(px, 2.65, z1 + 2.6);
      pole.castShadow = true;
      S.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), P.M.emissive(0xffd29a, 3));
      head.position.set(px, 5.25, z1 + 3.9);
      S.add(head);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), P.M.metal(0.6, 0x5a5a5a));
      arm.rotation.x = Math.PI / 2;
      arm.position.set(px, 5.3, z1 + 3.2);
      S.add(arm);
      const l = new THREE.PointLight(0xffc488, 26, 14, 2);
      l.position.set(px, 5.0, z1 + 3.9);
      S.add(l);
    }
    this.sky = createSky();
    this.group.add(this.sky);
  }

  // ── Luzes ────────────────────────────────────────────────────────
  _lights() {
    const g = this.group;
    const { z0, z1, h } = this.def.size;
    // Pôr do sol entrando pelo vidro da frente (sombras longas no piso)
    const sun = new THREE.DirectionalLight(0xffa868, 1.7);
    sun.position.set(-9, 6.5, 24);
    sun.target.position.set(0, 0, -1);
    sun.castShadow = true;
    sun.userData.castsShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 70;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    g.add(sun, sun.target);
    this.sun = sun;
    g.add(new THREE.HemisphereLight(0x8a90c8, 0x2a2a30, 0.4));
    // Painéis de LED no teto (3 fileiras) + luzes frias
    const ledMat = P.M.emissive(0xf2f6ff, 1.8);
    for (let z = z0 + 2; z < z1 - 0.5; z += 3) {
      for (const x of [-5, -1.7, 1.7, 5]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), ledMat);
        p.position.set(x, h - 0.03, z);
        g.add(p);
      }
    }
    const cool = [[-4.5, -3.0, true], [4.5, -3.0, false], [0, 1.6, false]];
    for (const [x, z, shadow] of cool) {
      const l = new THREE.PointLight(0xeaf0ff, 34, 15, 2);
      l.position.set(x, h - 0.35, z);
      if (shadow) {
        l.castShadow = true;
        l.userData.shadowTier = 'point';
        l.userData.castsShadow = true;
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.002;
        l.shadow.radius = 3;
      }
      g.add(l);
    }
    // Neon colorindo os cantos
    for (const [x, z, c] of [[-7.3, -3.2, NEON.roxo], [7.3, -3.2, NEON.vermelho]]) {
      const l = new THREE.PointLight(c, 7, 8, 2);
      l.position.set(x, 3.3, z);
      g.add(l);
    }
  }

  // ── Ambientação ──────────────────────────────────────────────────
  _props() {
    const g = this.group;
    const { x0, x1, z0, z1 } = this.def.size;

    // Rack de halteres comprido no fundo (atrás da rosca)
    const rack = new THREE.Group();
    for (const [y, zz] of [[0.42, 0.12], [0.78, -0.08]]) {
      P.mesh(new THREE.BoxGeometry(4.2, 0.04, 0.3), this.mats.black, 0, y, zz, rack);
      for (let i = 0; i < 10; i++) {
        const d = P.dumbbell(0.3 + (i % 5) * 0.015, i % 3 === 0 ? 0xa8182e : 0x2a2a30);
        d.scale.setScalar(0.9 + (i % 5) * 0.08);
        d.position.set(-1.9 + i * 0.42, y + 0.07, zz);
        rack.add(d);
      }
    }
    for (const x of [-2.05, 0, 2.05]) P.mesh(new THREE.BoxGeometry(0.06, 0.82, 0.5), this.mats.black, x, 0.41, 0, rack);
    rack.position.set(4.2, 0, z0 + 0.45);
    g.add(rack);
    this.obstacles.push({ x0: 2.0, x1: 6.4, z0, z1: z0 + 0.75 });

    // Árvore de anilhas (perto do agachamento)
    const tree = new THREE.Group();
    P.mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 10), this.mats.darkSteel, 0, 0.6, 0, tree);
    P.mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.05, 20), this.mats.darkSteel, 0, 0.025, 0, tree);
    const colors = [0xa8182e, 0x1f4fa0, 0xffd34d, 0x2a8a5a, 0x222222];
    for (let i = 0; i < 6; i++) {
      const p = P.weightPlate(0.24 - (i % 3) * 0.04, false, colors[i % 5]);
      p.rotation.x = Math.PI / 2;
      p.position.set(i % 2 ? 0.08 : -0.08, 0.3 + Math.floor(i / 2) * 0.3, 0);
      p.rotation.z = Math.PI / 2;
      tree.add(p);
    }
    tree.position.set(-0.7, 0, -2.6);
    g.add(tree);
    this.obstacles.push({ x0: -1.0, x1: -0.4, z0: -2.9, z1: -2.3 });

    // Armários (canto do fundo à esquerda)
    const lockerMat = new THREE.MeshStandardMaterial({ color: 0x3a3a46, metalness: 0.6, roughness: 0.45 });
    for (let i = 0; i < 4; i++) {
      const lk = P.mesh(P.rbox(0.5, 1.9, 0.5, 0.01), lockerMat, x0 + 0.3, 0.95, z0 + 0.6 + i * 0.52, g);
      void lk;
      const tag = P.mesh(new THREE.BoxGeometry(0.01, 0.08, 0.12), P.M.emissive(i === 2 ? NEON.vermelho : 0xffffff, 0.8), x0 + 0.56, 1.6, z0 + 0.6 + i * 0.52, g);
      tag.castShadow = false;
    }
    this.obstacles.push({ x0, x1: x0 + 0.6, z0, z1: z0 + 2.4 });

    // Bebedouro
    const water = new THREE.Group();
    P.mesh(P.rbox(0.42, 1.0, 0.36, 0.03), P.M.metal(0.3, 0xd8dce4), 0, 0.5, 0, water);
    P.mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.38, 16), P.M.water(), 0, 1.2, 0, water);
    water.position.set(x1 - 0.35, 0, 0.4);
    g.add(water);
    this.obstacles.push({ x0: x1 - 0.6, x1, z0: 0.2, z1: 0.6 });

    // Banco reto de enfeite (perto do centro)
    const fb = new THREE.Group();
    P.mesh(P.rbox(0.32, 0.1, 1.2, 0.03), this.mats.pad, 0, 0.45, 0, fb);
    for (const zz of [-0.45, 0.45]) P.mesh(new THREE.BoxGeometry(0.28, 0.42, 0.06), this.mats.black, 0, 0.21, zz, fb);
    fb.position.set(1.4, 0, -0.9);
    fb.rotation.y = 0.35;
    g.add(fb);
    this.obstacles.push({ x0: 1.0, x1: 1.8, z0: -1.5, z1: -0.3 });

    // Esteira de enfeite (a frequentadora corre nela)
    const t2 = this._treadmill();
    t2.position.set(-2.2, 0, 2.2);
    g.add(t2);

    // Pôsteres
    const poster = P.poster((ctx, w, hh) => {
      const gr = ctx.createLinearGradient(0, 0, 0, hh);
      gr.addColorStop(0, '#2a0a2a');
      gr.addColorStop(1, '#0a0a1a');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#ff2a5a';
      ctx.font = `900 ${w * 0.13}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('CAMPEONATO', w / 2, hh * 0.2);
      ctx.fillText('IRON 1998', w / 2, hh * 0.34);
      ctx.fillStyle = '#ffd34d';
      ctx.font = `800 ${w * 0.075}px sans-serif`;
      ctx.fillText('campeã: IVONE "FERRO"', w / 2, hh * 0.9);
      ctx.fillStyle = '#c8946e';
      ctx.beginPath();
      ctx.ellipse(w / 2, hh * 0.58, w * 0.16, hh * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }, 0.7, 1.0);
    poster.position.set(x0 + 0.03, 1.9, -1.9);
    poster.rotation.y = Math.PI / 2;
    g.add(poster);
    const rules = P.poster((ctx, w, hh) => {
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#a8182e';
      ctx.fillRect(0, 0, w, hh * 0.2);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${w * 0.1}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('REGRAS DO TEMPLO', w / 2, hh * 0.13);
      ctx.fillStyle = '#222';
      ctx.font = `700 ${w * 0.058}px sans-serif`;
      ['1. Guardou o peso? Guardou.', '2. Selfie no espelho: 5 min', '3. Grito só no PR', '4. Leg day não se negocia', '5. A Ivone sempre tem razão'].forEach((l, i) => ctx.fillText(l, w / 2, hh * (0.32 + i * 0.13)));
    }, 0.6, 0.8);
    rules.position.set(x1 - 0.03, 1.7, 0.95);
    rules.rotation.y = -Math.PI / 2;
    g.add(rules);
    void z1;
  }

  /** Esteira: base, lona animada, console e corrimãos. */
  _treadmill() {
    const t = new THREE.Group();
    P.mesh(P.rbox(0.86, 0.06, 1.8, 0.02), this.mats.black, 0, 0.02, 0, t);
    const beltTex = labelTexture((c, w, h) => {
      c.fillStyle = '#18181c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#26262c';
      for (let i = 0; i < 8; i++) c.fillRect(0, i * (h / 8), w, 3);
    }, 32, 128);
    beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(1, 3);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.6), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
    belt.rotation.x = -Math.PI / 2;
    belt.position.y = 0.052;
    t.add(belt);
    this.belts.push({ tex: beltTex, speed: 0 });
    for (const x of [-0.4, 0.4]) {
      const post = P.mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), this.mats.darkSteel, x, 0.62, 0.78, t);
      post.rotation.x = -0.15;
      const rail = P.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), this.mats.steel, x, 1.05, 0.5, t);
      rail.rotation.x = Math.PI / 2;
    }
    P.mesh(P.rbox(0.86, 0.32, 0.12, 0.03), this.mats.black, 0, 1.22, 0.85, t).rotation.x = -0.5;
    const screen = P.mesh(new THREE.PlaneGeometry(0.4, 0.16), P.M.emissive(NEON.ciano, 1.4), 0, 1.25, 0.79, t);
    screen.rotation.x = -0.5 + Math.PI;
    screen.rotation.z = Math.PI;
    return t;
  }

  /** Barra olímpica com anilhas (eixo X). */
  _barbell(len = 1.8, plateColor = 0x222222) {
    const b = new THREE.Group();
    const bar = P.mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 12), this.mats.steel, 0, 0, 0, b);
    bar.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const p = P.weightPlate(0.22 - i * 0.05, false, i ? 0xa8182e : plateColor);
        p.rotation.z = Math.PI / 2;
        p.position.x = s * (len / 2 - 0.22 - i * 0.045);
        b.add(p);
      }
      const col = P.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), this.mats.steel, s * (len / 2 - 0.3), 0, 0, b);
      col.rotation.z = Math.PI / 2;
    }
    return b;
  }

  // ── Máquinas ─────────────────────────────────────────────────────
  _machines() {
    for (const def of this.def.machines) {
      const group = new THREE.Group();
      group.position.set(def.pos[0], 0, def.pos[1]);
      group.rotation.y = def.yaw;
      group.name = def.id;
      this.group.add(group);
      const m = {
        def, group, pos: new THREE.Vector3(def.pos[0], 0, def.pos[1]), yaw: def.yaw,
        props: {}, upgradeGroup: new THREE.Group(), metalMats: [], level: -1, shakeT: 0,
      };
      group.add(m.upgradeGroup);
      this._buildMachineProp(m);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 1.1, def.anim === 'bench' || def.anim === 'crunch' ? -0.9 : 0);
      hit.userData.machineId = def.id;
      group.add(hit);
      m.hit = hit;
      m.camPos = new THREE.Vector3(...def.cam).applyAxisAngle(Y, def.yaw).add(m.pos);
      m.camLook = new THREE.Vector3(...def.look).applyAxisAngle(Y, def.yaw).add(m.pos);
      m.promptPos = m.pos.clone().add(new THREE.Vector3(0, 2.25, 0));
      this.machines.set(def.id, m);
    }
  }

  _buildMachineProp(m) {
    const g = m.group;
    const steel = P.M.metal(0.3, 0x9aa2ac);
    m.metalMats.push(steel);
    const post = (x, z, h, w = 0.07) => P.mesh(new THREE.BoxGeometry(w, h, w), this.mats.black, x, h / 2, z, g);
    switch (m.def.prop) {
      case 'bench': {
        // Banco: o corpo deitado vai da origem (pés) até z ≈ −1,9 (cabeça)
        P.mesh(P.rbox(0.32, 0.1, 1.25, 0.03), this.mats.padRed, 0, 0.4, -1.42, g);
        for (const zz of [-1.95, -0.9]) P.mesh(new THREE.BoxGeometry(0.28, 0.36, 0.06), this.mats.black, 0, 0.18, zz, g);
        P.mesh(new THREE.BoxGeometry(0.06, 0.04, 1.1), this.mats.black, 0, 0.05, -1.42, g);
        // Suporte da barra na cabeceira
        for (const x of [-0.55, 0.55]) {
          P.mesh(new THREE.BoxGeometry(0.07, 1.22, 0.07), this.mats.black, x, 0.61, -1.92, g);
          P.mesh(new THREE.BoxGeometry(0.12, 0.04, 0.1), steel, x, 1.04, -1.87, g);
          P.mesh(new THREE.BoxGeometry(0.07, 0.06, 0.5), this.mats.black, x, 0.03, -1.92, g);
        }
        const bar = this._barbell(1.7);
        bar.position.set(0, 1.08, -1.85);
        g.add(bar);
        m.props.rackBar = bar;
        m.props.benchBar = this._barbell(1.7); // vai pras mãos durante o treino
        this._obstacleLocal(m, -0.62, 0.62, -2.0, -1.84);
        break;
      }
      case 'rackbar': {
        // Rack de força com barra fixa em cima (2,45 m, igual à barra do portão)
        for (const [x, z] of [[-0.65, -0.55], [0.65, -0.55], [-0.65, 0.45], [0.65, 0.45]]) post(x, z, 2.6);
        for (const z of [-0.55, 0.45]) P.mesh(new THREE.BoxGeometry(1.37, 0.07, 0.07), this.mats.black, 0, 2.6, z, g);
        for (const x of [-0.65, 0.65]) P.mesh(new THREE.BoxGeometry(0.07, 0.07, 1.07), this.mats.black, x, 2.6, -0.05, g);
        const bar = P.mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 12), steel, 0, 2.45, 0, g);
        bar.rotation.z = Math.PI / 2;
        for (const x of [-0.65, 0.65]) P.mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), this.mats.black, x, 2.45, 0, g);
        for (const [x, z] of [[-0.65, -0.55], [0.65, -0.55]]) this._obstacleLocal(m, x - 0.05, x + 0.05, z - 0.05, z + 0.05);
        break;
      }
      case 'dumbbells':
      case 'dbrack': {
        // Par de halteres no chão (some quando vai pras mãos)
        const pair = [P.dumbbell(0.32, 0xa8182e), P.dumbbell(0.32, 0xa8182e)];
        pair[0].position.set(0.45, 0.06, 0.25);
        pair[1].position.set(0.45, 0.06, 0.45);
        for (const d of pair) {
          d.rotation.y = Math.PI / 2;
          g.add(d);
        }
        m.props.floorDumbbells = pair;
        m.props.handDumbbells = [P.dumbbell(0.32, 0xa8182e), P.dumbbell(0.32, 0xa8182e)];
        // Banquinho de apoio
        P.mesh(P.rbox(0.36, 0.06, 0.36, 0.02), this.mats.pad, -0.6, 0.45, -0.1, g);
        P.mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.43, 10), this.mats.black, -0.6, 0.215, -0.1, g);
        break;
      }
      case 'dipstation': {
        // Paralelas: barras a ±0,42 m, ~0,92 m de altura
        for (const x of [-0.42, 0.42]) {
          const b = P.mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 12), steel, x, 0.93, -0.1, g);
          b.rotation.x = Math.PI / 2;
          for (const z of [-0.5, 0.3]) post(x, z, 0.93, 0.06);
          P.mesh(new THREE.BoxGeometry(0.06, 0.05, 1.0), this.mats.black, x, 0.03, -0.1, g);
        }
        P.mesh(new THREE.BoxGeometry(0.9, 0.05, 0.06), this.mats.black, 0, 0.03, -0.5, g);
        break;
      }
      case 'mat': {
        const mat = P.mesh(P.rbox(0.7, 0.014, 1.95, 0.006), new THREE.MeshStandardMaterial({ color: 0x5a2a8a, roughness: 0.95 }), 0, 0.008, -0.95, g);
        mat.castShadow = false;
        m.props.mat = mat;
        // Kettlebell e bola de pilates
        const kb = new THREE.Group();
        P.mesh(new THREE.SphereGeometry(0.11, 16, 12), this.mats.black, 0, 0.11, 0, kb);
        P.mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16, Math.PI), this.mats.black, 0, 0.21, 0, kb);
        kb.position.set(0.6, 0, -0.2);
        g.add(kb);
        P.mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0x2ad8ff, roughness: 0.3, clearcoat: 0.8 }), -0.7, 0.3, -1.7, g);
        break;
      }
      case 'squatrack': {
        // Rack de agachamento atrás do Luisão + barra guardada no gancho
        for (const x of [-0.7, 0.7]) {
          post(x, -0.4, 2.3);
          P.mesh(new THREE.BoxGeometry(0.07, 0.06, 0.6), this.mats.black, x, 0.03, -0.25, g);
          P.mesh(new THREE.BoxGeometry(0.1, 0.04, 0.12), steel, x, 1.4, -0.34, g);
          this._obstacleLocal(m, x - 0.05, x + 0.05, -0.45, -0.35);
        }
        P.mesh(new THREE.BoxGeometry(1.47, 0.07, 0.07), this.mats.black, 0, 2.3, -0.4, g);
        const bar = this._barbell(1.8, 0x1f4fa0);
        bar.position.set(0, 1.44, -0.34);
        g.add(bar);
        m.props.rackBar = bar;
        m.props.shoulderBar = this._barbell(1.8, 0x1f4fa0);
        break;
      }
      case 'calfblock': {
        // Step de 0,18 m (a pose de panturrilha fica em cima dele) + corrimão na frente
        P.mesh(P.rbox(0.6, 0.18, 0.42, 0.02), this.mats.pad, 0, 0.09, 0, g);
        for (const x of [-0.4, 0.4]) post(x, 0.55, 1.2, 0.05);
        const rail = P.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 10), steel, 0, 1.2, 0.55, g);
        rail.rotation.z = Math.PI / 2;
        break;
      }
      case 'treadmill': {
        const t = this._treadmill();
        g.add(t);
        m.props.belt = this.belts[this.belts.length - 1];
        this._obstacleLocal(m, -0.45, 0.45, 0.72, 0.92);
        break;
      }
      case 'counter': {
        // Balcão de suplementos (à frente do Luisão = local +Z), Kelly atrás
        const top = new THREE.MeshPhysicalMaterial({ color: 0x15151a, roughness: 0.25, clearcoat: 1 });
        P.mesh(P.rbox(1.9, 1.05, 0.6, 0.03), this.mats.black, 0, 0.525, 1.1, g);
        P.mesh(P.rbox(2.0, 0.05, 0.7, 0.02), top, 0, 1.075, 1.1, g);
        const strip = P.mesh(new THREE.BoxGeometry(1.86, 0.03, 0.01), P.M.emissive(NEON.roxo, 2.6), 0, 0.85, 0.79, g);
        strip.castShadow = false;
        // Potes de whey + coqueteleiras em cima do balcão
        for (let i = 0; i < 5; i++) {
          P.mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 16), new THREE.MeshStandardMaterial({ color: [0x111111, 0xa8182e, 0xffd34d, 0x111111, 0x2ad8ff][i], roughness: 0.4 }), -0.75 + i * 0.16, 1.22, 1.2, g);
        }
        P.mesh(P.rbox(0.3, 0.12, 0.22, 0.02), this.mats.black, 0.6, 1.16, 1.15, g); // maquininha
        const sg = neonSign('SUPLEMENTOS', NEON.ouro, 1.6, 0.3, '"Arial Black", sans-serif');
        sg.position.set(0, 0.55, 0.785);
        sg.rotation.y = Math.PI;
        g.add(sg);
        this._obstacleLocal(m, -0.98, 0.98, 0.78, 1.42);
        break;
      }
      default:
        break;
    }
  }

  /** Visual das melhorias: giz → anilhas → anel de LED (ciano, depois dourado) → troféu; metal mais brilhante. */
  setMachineLevel(id, level) {
    const m = this.machines.get(id);
    if (!m || m.level === level) return;
    m.level = level;
    const u = m.upgradeGroup;
    while (u.children.length) u.remove(u.children[0]);
    const lying = m.def.anim === 'bench' || m.def.anim === 'crunch';
    const cz = lying ? -0.95 : 0;
    if (level >= 2) {
      P.mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 }), -0.8, 0.04, cz + 0.35, u);
      const chalk = P.mesh(new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 1 }), -0.8, 0.06, cz + 0.35, u);
      chalk.scale.y = 0.3;
    }
    if (level >= 4) {
      const n = Math.min(5, level - 3);
      for (let i = 0; i < n; i++) {
        const p = P.weightPlate(0.22 - i * 0.015, false, i % 2 ? 0xa8182e : 0x222222);
        p.position.set(0.85, 0.02 + i * 0.037, cz - 0.4);
        u.add(p);
      }
    }
    if (level >= 7) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.012, 6, 48), P.M.emissive(level >= 10 ? NEON.ouro : NEON.ciano, 2.4));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.02, cz);
      ring.scale.set(1, lying ? 1.6 : 1, 1);
      u.add(ring);
    }
    if (level >= 12) {
      const trophy = new THREE.Group();
      P.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), P.M.gold(), 0, 0.03, 0, trophy);
      P.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), P.M.gold(), 0, 0.11, 0, trophy);
      P.mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.1, 14), P.M.gold(), 0, 0.2, 0, trophy);
      trophy.position.set(-0.75, 0, cz - 0.45);
      u.add(trophy);
    }
    for (const mm of m.metalMats) mm.roughness = clamp(0.4 - level * 0.03, 0.05, 0.4);
    if (m.props.mat) m.props.mat.material.color.set(level >= 8 ? 0xffd34d : level >= 4 ? 0xa8182e : 0x5a2a8a);
  }

  creak(id) {
    const m = this.machines.get(id);
    if (m) m.shakeT = 0.6;
  }

  /** Esteira da estação de Cardio: a lona corre enquanto o Luisão treina. */
  setBeltRunning(id, on) {
    const b = this.machines.get(id)?.props.belt;
    if (b) b.target = on ? 1.6 : 0;
  }

  // ── Geradores no mundo (lado tycoon do Iron) ──────────────────────
  setGeneratorVisual(id, count) {
    if (!['i_whey', 'i_aulas', 'i_dj', 'i_patrocinio'].includes(id)) return;
    const prev = this.genVisuals[id];
    if (prev?.count === count) return;
    if (prev) this.group.remove(prev.group);
    if (count <= 0) {
      delete this.genVisuals[id];
      return;
    }
    const group = new THREE.Group();
    const v = { group, count };
    const { x1, x0 } = this.def.size;
    if (id === 'i_whey') {
      // Prateleira de whey importado atrás da Kelly (enche com a quantidade)
      P.mesh(new THREE.BoxGeometry(0.35, 0.04, 2.0), this.mats.black, x1 - 0.22, 1.45, 2.5, group);
      P.mesh(new THREE.BoxGeometry(0.35, 0.04, 2.0), this.mats.black, x1 - 0.22, 1.95, 2.5, group);
      const n = Math.min(16, 2 + count);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 8);
        P.mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 14), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xffd34d : 0x111111, metalness: 0.2, roughness: 0.35 }), x1 - 0.22, 1.61 + row * 0.5, 1.65 + (i % 8) * 0.24, group);
      }
    } else if (id === 'i_aulas') {
      // Aulas coletivas: bikes de spinning (1, 3, 5 bikes) com o tablado
      const n = count >= 25 ? 5 : count >= 5 ? 3 : 1;
      P.mesh(P.rbox(n * 1.0 + 0.4, 0.05, 1.3, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a0a2a, roughness: 0.8 }), 3.2, 0.025, 0.0, group);
      for (let i = 0; i < n; i++) {
        const bike = new THREE.Group();
        P.mesh(new THREE.BoxGeometry(0.08, 0.06, 0.9), this.mats.black, 0, 0.05, 0, bike);
        P.mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), this.mats.black, 0, 0.45, 0.2, bike).rotation.x = 0.25;
        P.mesh(P.rbox(0.18, 0.05, 0.26, 0.02), this.mats.padRed, 0, 0.88, 0.3, bike);
        P.mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), this.mats.black, 0, 0.5, -0.3, bike).rotation.x = -0.2;
        P.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), this.mats.steel, 0, 0.98, -0.42, bike).rotation.z = Math.PI / 2;
        const wheel = P.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 24), this.mats.steel, 0, 0.3, -0.25, bike);
        wheel.rotation.z = Math.PI / 2;
        this.spinWheels.push(wheel);
        bike.position.set(3.2 - (n - 1) * 0.5 + i * 1.0, 0, 0.0);
        group.add(bike);
      }
      this.obstacles.push({ x0: 3.2 - n * 0.5 - 0.2, x1: 3.2 + n * 0.5 + 0.2, z0: -0.6, z1: 0.6 });
      v.obstacle = this.obstacles[this.obstacles.length - 1];
    } else if (id === 'i_dj') {
      // Cabine de DJ na parede da esquerda, caixas de som pulsando
      P.mesh(P.rbox(0.7, 1.0, 1.5, 0.03), this.mats.black, x0 + 0.45, 0.5, -2.7, group);
      const deck = P.mesh(new THREE.BoxGeometry(0.5, 0.05, 1.2), P.M.emissive(NEON.ciano, 1.2), x0 + 0.45, 1.03, -2.7, group);
      deck.castShadow = false;
      v.cones = [];
      for (const zz of [-3.75, -1.65]) {
        const sp = new THREE.Group();
        P.mesh(P.rbox(0.45, 1.1, 0.45, 0.03), this.mats.black, 0, 0.55, 0, sp);
        for (const y of [0.35, 0.8]) {
          const c = P.mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.03, 20), this.mats.darkSteel, 0.23, y, 0, sp);
          c.rotation.z = Math.PI / 2;
          const r = P.mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 24), P.M.emissive(NEON.roxo, 2.5), 0.235, y, 0, sp);
          r.rotation.y = Math.PI / 2;
          v.cones.push(c, r);
        }
        sp.position.set(x0 + 0.3, 0, zz);
        group.add(sp);
      }
      this.obstacles.push({ x0, x1: x0 + 0.85, z0: -4.0, z1: -1.4 });
      v.obstacle = this.obstacles[this.obstacles.length - 1];
    } else if (id === 'i_patrocinio') {
      const banner = neonSign('FERRO WHEY', NEON.ouro, 3.4, 0.9, undefined, 'patrocinador oficial do Luisão');
      banner.position.set(x1 - 0.06, 3.1, 2.6);
      banner.rotation.y = -Math.PI / 2;
      group.add(banner);
      if (count >= 5) {
        // Pote gigante inflável na calçada, do lado da porta (todo patrocínio que se preze)
        P.mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 24), new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.3, clearcoat: 1 }), 3.2, 0.75, 6.2, group);
        P.mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.2, 24), P.M.gold(), 3.2, 1.6, 6.2, group);
        this.obstacles.push({ x0: 2.6, x1: 3.8, z0: 5.6, z1: 6.8 });
        v.obstacle = this.obstacles[this.obstacles.length - 1];
      }
    }
    if (prev?.obstacle) this.obstacles = this.obstacles.filter((o) => o !== prev.obstacle);
    this.group.add(group);
    this.genVisuals[id] = v;
  }

  // ── .glb opcional (models/environments/iron.glb) ─────────────────
  async _tryEnvironmentGLB() {
    const path = ASSETS.environments.iron;
    if (!path) return;
    const gltf = await this.loader.loadGLTF(path);
    if (!gltf) return;
    const env = gltf.scene;
    env.traverse((c) => {
      if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });
    this.group.add(env);
    for (const c of this.structure.children) c.visible = false;
    for (const fm of this.floorMeshes) fm.material = new THREE.MeshBasicMaterial({ visible: false });
  }

  // ── Colisão ──────────────────────────────────────────────────────
  collide(pos, r) {
    const b = this.def.walkBounds;
    pos.x = clamp(pos.x, b.x0 + r, b.x1 - r);
    pos.z = clamp(pos.z, b.z0 + r, b.z1 - r);
    for (const o of this.obstacles) {
      const cx = clamp(pos.x, o.x0, o.x1);
      const cz = clamp(pos.z, o.z0, o.z1);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          const pushes = [[o.x0 - r - pos.x, 0], [o.x1 + r - pos.x, 0], [0, o.z0 - r - pos.z], [0, o.z1 + r - pos.z]];
          pushes.sort((a, b2) => Math.abs(a[0] + a[1]) - Math.abs(b2[0] + b2[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
      }
    }
  }

  // ── Atualização ──────────────────────────────────────────────────
  update(dt) {
    this.t += dt;
    const t = this.t;
    // Neon: um deles falha de vez em quando
    for (const n of this.neonTubes) {
      let k = 1 + Math.sin(t * 40 + n.base) * 0.02;
      if (n.flicker) {
        n.next -= dt;
        if (n.next < 0) {
          n.burst = rand(0.15, 0.6);
          n.next = rand(4, 10);
        }
        if (n.burst > 0) {
          n.burst -= dt;
          k *= Math.random() < 0.5 ? 0.15 : 1;
        }
      }
      n.mat.emissiveIntensity = n.base * k;
    }
    // Lona das esteiras (a de enfeite sempre corre; a da estação só com o Luisão)
    this.belts.forEach((b, i) => {
      const target = b.target ?? (i === 0 ? 1.4 : 0);
      b.speed += (target - b.speed) * Math.min(1, dt * 3);
      b.tex.offset.y -= b.speed * dt;
    });
    for (const w of this.spinWheels) w.rotation.x += dt * 7;
    const dj = this.genVisuals.i_dj;
    if (dj?.cones) {
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2.1)), 8);
      for (const c of dj.cones) c.scale.setScalar(1 + beat * 0.14);
    }
    for (const m of this.machines.values()) {
      if (m.shakeT > 0) {
        m.shakeT -= dt;
        const s = m.shakeT * 0.05;
        m.group.position.x = m.pos.x + (Math.random() - 0.5) * s;
        m.group.position.z = m.pos.z + (Math.random() - 0.5) * s;
        m.group.rotation.z = (Math.random() - 0.5) * s;
        if (m.shakeT <= 0) {
          m.group.position.copy(m.pos);
          m.group.rotation.z = 0;
        }
      }
    }
  }
}
