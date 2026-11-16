import * as THREE from 'three';
import { GARAGE } from '../config/gyms.js';
import { ASSETS } from '../config/assets.manifest.js';
import { createSky } from './Sky.js';
import * as P from './Props.js';
import { rand, clamp } from '../core/utils.js';
import { labelTexture } from '../render/ProceduralTextures.js';
import { buildNeighborhood } from './Neighborhood.js';

// ════════════════════════════════════════════════════════════════
//  GARAGEM DO SEU ZÉ — garagem de bairro ao entardecer.
//  Lâmpada piscando, pesos enferrujados, rádio velho, manchas de óleo,
//  o Biscoito dormindo no canto e a rua vista pelo portão aberto.
// ════════════════════════════════════════════════════════════════

const Y = new THREE.Vector3(0, 1, 0);

export class GarageGym {
  constructor(loader, quality) {
    this.def = GARAGE;
    this.loader = loader;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'garagem';
    this.structure = new THREE.Group(); // escondido se houver garagem.glb
    this.group.add(this.structure);
    this.obstacles = []; // AABBs {x0,x1,z0,z1}
    this.cameraColliders = [];
    this.floorMeshes = [];
    this.machines = new Map(); // id → { def, group, hit, pos, yaw, upgradeGroup, ... }
    this.genVisuals = {};
    this.flicker = { light: null, bulb: null, t: 0, next: 2 };
    this.anim = []; // funções update(dt, t)
    this.t = 0;
  }

  async build() {
    const L = this.loader;
    const [floorTex, wallTex, ceilTex, metalTex, woodTex, asphaltTex, sidewalkTex, gateTex] = await Promise.all([
      L.pbr('concrete_floor', 'concrete_floor', { size: 512, seed: 3, oil: true, repeat: [3, 2.25] }),
      L.pbr('plaster_wall', 'plaster_wall', { size: 512, seed: 9, blocks: true, color: [0.78, 0.82, 0.7], repeat: [3, 1] }),
      L.pbr('concrete_floor', 'concrete_floor', { size: 256, seed: 21, repeat: [3, 2] }),
      L.pbr('rusty_metal', 'rusty_metal', { size: 256, seed: 4, repeat: [1, 1] }),
      L.pbr('wood', 'wood', { size: 256, seed: 8, repeat: [1, 1] }),
      L.pbr('asphalt', 'asphalt', { size: 256, seed: 12, repeat: [8, 2] }),
      L.pbr('sidewalk', 'sidewalk', { size: 256, seed: 2, repeat: [7, 1] }),
      L.pbr('rusty_metal', 'corrugated', { size: 256, seed: 6, repeat: [1, 1] }),
    ]);
    const wallTex2 = await L.pbr('plaster_wall', 'plaster_wall', { size: 512, seed: 9, blocks: false, color: [0.92, 0.92, 0.9], repeat: [1, 1] });
    this.tex = { floorTex, wallTex, metalTex, woodTex, wallTex2 };

    const mat = (set, extra = {}) => new THREE.MeshStandardMaterial({ ...set, ...extra });
    this.mats = {
      floor: mat(floorTex, { roughness: 1, metalness: 0 }),
      wall: mat(wallTex, { roughness: 1 }),
      ceiling: mat(ceilTex, { color: 0x9a9a9a, roughness: 1 }),
      metal: mat(metalTex, { metalness: 1, roughness: 1 }),
      wood: mat(woodTex, { roughness: 1 }),
      asphalt: mat(asphaltTex, { roughness: 1 }),
      sidewalk: mat(sidewalkTex, { roughness: 1 }),
      gate: mat(gateTex, { metalness: 1, roughness: 1, side: THREE.DoubleSide }),
    };

    this._structure();
    this._street();
    this._lights();
    this._props();
    this._machines();
    await this._tryEnvironmentGLB();
    return this;
  }

  // ── Estrutura ────────────────────────────────────────────────────
  _box(w, h, d, material, x, y, z, { collider = true, camera = true, parent = this.structure, obstacle = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (camera) this.cameraColliders.push(m);
    if (obstacle || collider) this.obstacles.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    // UV em metros (texturas não esticam)
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

  _structure() {
    const { x0, x1, z0, z1, h } = this.def.size;
    const W = x1 - x0;
    const D = z1 - z0;
    const t = 0.25;
    const S = this.structure;

    // Piso
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    S.add(floor);
    this.floorMeshes.push(floor);

    // Paredes (fundo, laterais, frente com o vão do portão)
    this._box(W + t * 2, h, t, this.mats.wall, 0, h / 2, z0 - t / 2);
    this._box(t, h, D, this.mats.wall, x0 - t / 2, h / 2, 0);
    this._box(t, h, D, this.mats.wall, x1 + t / 2, h / 2, 0);
    const g0 = this.def.gate.x0;
    const g1 = this.def.gate.x1;
    this._box(g0 - x0 + t, h, t, this.mats.wall, (x0 - t + g0) / 2, h / 2, z1 + t / 2);
    this._box(x1 - g1 + t, h, t, this.mats.wall, (g1 + x1 + t) / 2, h / 2, z1 + t / 2);
    this._box(g1 - g0, h - 2.65, t, this.mats.wall, 0, (h + 2.65) / 2, z1 + t / 2, { collider: false });
    // Teto
    this._box(W + t * 2 + 0.6, 0.18, D + t * 2 + 0.8, this.mats.ceiling, 0, h + 0.09, 0.2, { collider: false });
    // Rodapé escuro (sujeira)
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x3d3a34, roughness: 0.95 });
    for (const [w, d, x, z] of [[W, 0.02, 0, z0 + 0.01], [0.02, D, x0 + 0.01, 0], [0.02, D, x1 - 0.01, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), baseMat);
      m.position.set(x, 0.06, z);
      S.add(m);
    }

    // Porta de enrolar (enrolada no alto) + trilhos
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, g1 - g0 + 0.2, 24), this.mats.gate);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, h - 0.32, z1 - 0.22);
    roll.castShadow = true;
    S.add(roll);
    for (const x of [g0 + 0.04, g1 - 0.04]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.65, 0.1), this.mats.metal);
      rail.position.set(x, 1.325, z1 - 0.02);
      rail.castShadow = true;
      S.add(rail);
    }
    // Faixa de porta pendurada um pouco (abaixo do rolo)
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(g1 - g0, 0.35), this.mats.gate);
    flap.position.set(0, 2.48, z1 - 0.06);
    S.add(flap);

    // Escada de 3 degraus pra porta da casa (parede esquerda)
    const stepMat = new THREE.MeshStandardMaterial({ ...this.tex.floorTex, color: 0xb8b2a8, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const sw = 0.25 * (3 - i);
      this._box(sw, 0.18, 1.6, stepMat, x0 + sw / 2, 0.09 + i * 0.18, -2.8, { camera: false });
    }
    // Porta da casa
    const doorMat = new THREE.MeshStandardMaterial({ ...this.tex.woodTex, color: 0x8a5a3a, roughness: 0.8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.0, 0.9), doorMat);
    door.position.set(x0 + 0.02, 0.54 + 1.0, -2.8);
    S.add(door);
    const knob = P.mesh(new THREE.SphereGeometry(0.03, 10, 8), P.M.metal(0.3, 0xd4af37), x0 + 0.07, 1.5, -2.45, S);
    knob.castShadow = false;
    // Corrimão (onde o Luisão se apoia na panturrilha)
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), P.M.metal(0.5, 0x6a6a6a));
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x0 + 0.1, 1.25, -2.8);
    S.add(rail);
  }

  _street() {
    const S = this.structure;
    const z1 = this.def.size.z1 + 0.25;
    // Calçada
    // Calçada no mesmo nível do piso da garagem (topo em y = 0)
    const sw = this._box(30, 0.12, 2.9, this.mats.sidewalk, 0, -0.061, z1 + 1.45, { collider: false, camera: false });
    this.floorMeshes.push(sw);
    // Meio-fio
    const curb = new THREE.Mesh(new THREE.BoxGeometry(30, 0.16, 0.14), new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.9 }));
    curb.position.set(0, -0.02, z1 + 2.95);
    curb.receiveShadow = curb.castShadow = true;
    S.add(curb);
    // Rua
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
    // Calçada do outro lado
    const far = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 2.6), this.mats.sidewalk);
    far.position.set(0, -0.04, z1 + 11.8);
    far.receiveShadow = true;
    S.add(far);

    // Casas vizinhas dos lados e do outro lado da rua
    const houseColors = [0xe8b86a, 0x9ac4b8, 0xe89a8a, 0xb8a8e0, 0xf0e0a8, 0x8ab0d8];
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb860, emissiveIntensity: 1.4, roughness: 0.4 });
    const dimWin = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.2, metalness: 0.4 });
    const house = (x, z, w, d, hh, color, faceZ = -1, windows = 3) => {
      const m = new THREE.MeshStandardMaterial({ ...this.tex.wallTex, color, roughness: 1 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
      b.position.set(x, hh / 2 - 0.1, z);
      b.castShadow = b.receiveShadow = true;
      S.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.2, d + 0.4), new THREE.MeshStandardMaterial({ color: 0x8a4a32, roughness: 0.8 }));
      roof.position.set(x, hh, z);
      S.add(roof);
      for (let i = 0; i < windows; i++) {
        const wx = x - w / 2 + ((i + 0.5) / windows) * w;
        const lit = Math.random() < 0.6;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lit ? winMat : dimWin);
        win.position.set(wx, hh * 0.6, z + (faceZ * d) / 2 + faceZ * 0.01);
        if (faceZ < 0) win.rotation.y = Math.PI;
        S.add(win);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.04), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 }));
        frame.position.copy(win.position).add(new THREE.Vector3(0, 0, faceZ * -0.02));
        S.add(frame);
      }
      return b;
    };
    // Lado esquerdo e direito da garagem (fachadas que fecham a vista)
    house(-10.2, 0, 8, 9.5, 3.8, houseColors[0], 1, 3);
    house(10.2, 0, 8, 9.5, 4.2, houseColors[1], 1, 3);
    // Andar de cima da casa (a garagem é o térreo), sacada, caixa d'água e fundos
    this._upperFloor(winMat, dimWin);
    // O resto do bairro: rua infinita, casas, prédios, morro e horizonte
    this.neighborhood = buildNeighborhood({ z1, wallTex: this.tex.wallTex2 });
    this.group.add(this.neighborhood);

    // Postes com luz
    this.streetLights = [];
    for (const px of [-8, 8]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.5, 10), P.M.metal(0.6, 0x5a5a5a));
      pole.position.set(px, 2.65, z1 + 2.6);
      pole.castShadow = true;
      S.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), P.M.metal(0.6, 0x5a5a5a));
      arm.rotation.x = Math.PI / 2;
      arm.position.set(px, 5.3, z1 + 3.2);
      S.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), P.M.emissive(0xffd29a, 3));
      head.position.set(px, 5.25, z1 + 3.9);
      S.add(head);
      const l = new THREE.PointLight(0xffc488, 30, 14, 2);
      l.position.set(px, 5.0, z1 + 3.9);
      S.add(l);
      this.streetLights.push(l);
    }

    // Céu
    this.sky = createSky();
    this.group.add(this.sky);
  }

  _upperFloor(winMat, dimWin) {
    const S = this.structure;
    const { x0, x1, z0, z1, h } = this.def.size;
    const top = h + 0.18;
    const H2 = 2.9;
    const color = new THREE.MeshStandardMaterial({ ...this.tex.wallTex2, color: 0xe8c890, roughness: 1 });
    // Pavimento de cima (mesma planta da garagem) + fundos da casa
    this._box(x1 - x0 + 0.5, H2, z1 - z0 + 0.5, color, 0, top + H2 / 2, 0, { collider: false });
    this._box(x1 - x0 + 0.5, h + H2 + 0.2, 8, color, 0, (h + H2 + 0.2) / 2, z0 - 4.25, { collider: false, camera: false });
    // Platibanda e caixa d'água azul (clássico brasileiro)
    this._box(x1 - x0 + 0.7, 0.45, z1 - z0 + 0.7, color, 0, top + H2 + 0.22, 0, { collider: false });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.65, 1.05, 20), new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.45 }));
    tank.position.set(3.2, top + H2 + 0.75, -1.5);
    tank.castShadow = true;
    S.add(tank);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0x2a5ab8, roughness: 0.4 }));
    lid.position.set(3.2, top + H2 + 1.3, -1.5);
    S.add(lid);
    // Janelas da fachada (algumas acesas)
    const fz = z1 + 0.27;
    for (const [wx, lit] of [[-4.2, true], [-1.4, false], [1.4, true], [4.2, false]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.2), lit ? winMat : dimWin);
      win.position.set(wx, top + 1.5, fz);
      S.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.35, 0.05), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }));
      frame.position.set(wx, top + 1.5, fz - 0.02);
      S.add(frame);
    }
    // Sacada em cima do portão, com grade
    const slabMat = new THREE.MeshStandardMaterial({ ...this.tex.floorTex, color: 0xc8c0b4, roughness: 1 });
    this._box(7.2, 0.16, 1.45, slabMat, 0, top - 0.08 + 0.12, z1 + 0.25 + 0.72, { collider: false });
    const rail = P.M.metal(0.5, 0x2a2a2e);
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.05, 0.05), rail);
    railTop.position.set(0, top + 1.05, z1 + 1.65);
    S.add(railTop);
    for (let x = -3.55; x <= 3.56; x += 0.18) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.0, 0.025), rail);
      bar.position.set(x, top + 0.55, z1 + 1.65);
      S.add(bar);
    }
    // Vaso de planta e varal de roupa na sacada (vida no cenário)
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 14), new THREE.MeshStandardMaterial({ color: 0xa8502a, roughness: 0.8 }));
    pot.position.set(-3.0, top + 0.3, z1 + 1.2);
    S.add(pot);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.9, flatShading: true }));
    plant.position.set(-3.0, top + 0.7, z1 + 1.2);
    S.add(plant);
    const clothes = [0xff4f7b, 0xffffff, 0x4fb3ff, 0xffd34d];
    clothes.forEach((c, i) => {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
      cl.position.set(0.5 + i * 0.6, top + 1.35, z1 + 0.9);
      cl.userData.sway = i;
      S.add(cl);
      (this.clothesLine ??= []).push(cl);
    });
  }

  _lights() {
    const g = this.group;
    // Luz do pôr do sol entrando pelo portão
    const sun = new THREE.DirectionalLight(0xffa868, 2.6);
    sun.position.set(-9, 6.5, 22);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.userData.castsShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.near = 1;
    sc.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    g.add(sun, sun.target);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(0x8090d0, 0x3a2a20, 0.45);
    g.add(hemi);

    // Lâmpada que pisca
    const h = this.def.size.h;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    wire.position.set(0, h - 0.22, -0.2);
    g.add(wire);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
    socket.position.set(0, h - 0.47, -0.2);
    g.add(socket);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070, emissiveIntensity: 6, roughness: 0.2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), bulbMat);
    bulb.position.set(0, h - 0.55, -0.2);
    g.add(bulb);
    const light = new THREE.PointLight(0xffb870, 14, 0, 1.6);
    light.position.copy(bulb.position).add(new THREE.Vector3(0, -0.06, 0));
    light.castShadow = true;
    light.userData.shadowTier = 'point';
    light.userData.castsShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.002;
    light.shadow.radius = 3;
    g.add(light);
    this.flicker.light = light;
    this.flicker.bulb = bulbMat;
    this.flicker.base = 14;

    // Lâmpada fluorescente velha na parede do fundo (mais fraca)
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), P.M.emissive(0xd8f0ff, 2.2));
    tube.rotation.z = Math.PI / 2;
    tube.position.set(3.2, h - 0.4, this.def.size.z0 + 0.12);
    g.add(tube);
    const tl = new THREE.PointLight(0xcfe6ff, 4, 7, 2);
    tl.position.set(3.2, h - 0.6, this.def.size.z0 + 0.5);
    g.add(tl);
    const tl2 = new THREE.PointLight(0xffd0a0, 3, 7, 2);
    tl2.position.set(-3.5, h - 0.6, -2.5);
    g.add(tl2);
  }

  // ── Props de ambientação ─────────────────────────────────────────
  _props() {
    const g = this.group;
    const { x0, x1, z0, z1, h } = this.def.size;

    // Bancada de ferramentas (fundo direito)
    const bench = new THREE.Group();
    P.mesh(P.rbox(1.8, 0.07, 0.65, 0.01), this.mats.wood, 0, 0.9, 0, bench);
    for (const [bx, bz] of [[-0.82, -0.27], [0.82, -0.27], [-0.82, 0.27], [0.82, 0.27]]) P.mesh(new THREE.BoxGeometry(0.06, 0.88, 0.06), this.mats.wood, bx, 0.44, bz, bench);
    P.mesh(new THREE.BoxGeometry(1.7, 0.03, 0.55), this.mats.wood, 0, 0.25, 0, bench);
    const toolbox = P.mesh(P.rbox(0.45, 0.2, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: 0xc02a2a, metalness: 0.5, roughness: 0.4 }), -0.5, 1.04, -0.08, bench);
    toolbox.rotation.y = 0.2;
    P.mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), P.M.metal(0.4, 0x3a5a8a), 0.7, 1.0, 0.1, bench); // morsa
    for (let i = 0; i < 4; i++) P.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 14), new THREE.MeshStandardMaterial({ color: [0xe8e8e8, 0x3a7ad8, 0xd8a03a, 0x8a3ad8][i], metalness: 0.6, roughness: 0.4 }), -0.6 + i * 0.18, 0.33, 0.05, bench);
    bench.position.set(4.6, 0, z0 + 0.42);
    g.add(bench);
    this.obstacles.push({ x0: 3.65, x1: 5.55, z0: z0, z1: z0 + 0.8 });
    this.benchTop = new THREE.Vector3(4.6, 0.94, z0 + 0.42);

    // Estante com latas + rádio velho
    const shelf = new THREE.Group();
    for (let i = 0; i < 3; i++) P.mesh(new THREE.BoxGeometry(1.6, 0.04, 0.4), this.mats.wood, 0, 0.6 + i * 0.55, 0, shelf);
    for (const sx of [-0.78, 0.78]) P.mesh(new THREE.BoxGeometry(0.04, 1.8, 0.4), this.mats.metal, sx, 0.9, 0, shelf);
    const canColors = [0xd84a4a, 0x4ad87a, 0xe8e8e8, 0x4a7ad8, 0xe8c84a];
    for (let i = 0; i < 7; i++) {
      const c = P.mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.17, 14), new THREE.MeshStandardMaterial({ color: canColors[i % 5], metalness: 0.5, roughness: 0.45 }), -0.65 + i * 0.2, 0.71, (i % 2) * 0.08 - 0.04, shelf);
      c.rotation.y = i;
    }
    const radio = P.oldRadio();
    radio.position.set(-0.3, 1.17, 0.0);
    radio.rotation.y = 0.15;
    shelf.add(radio);
    this.radioDial = radio.getObjectByName('dial');
    shelf.position.set(-1.2, 0, z0 + 0.25);
    g.add(shelf);
    this.obstacles.push({ x0: -2.05, x1: -0.35, z0, z1: z0 + 0.5 });
    this.radioPos = new THREE.Vector3(-1.5, 1.3, z0 + 0.3);
    this.shelfTop = new THREE.Vector3(-1.2, 1.72, z0 + 0.25);

    // Pilha de pneus (frente esquerda)
    for (let i = 0; i < 3; i++) {
      const t = P.tire();
      t.position.set(x0 + 0.65, 0.12 + i * 0.24, z1 - 0.8);
      t.rotation.z = i * 0.3;
      g.add(t);
    }
    this.obstacles.push({ x0: x0, x1: x0 + 1.1, z0: z1 - 1.25, z1: z1 });

    // Sacos de cimento empilhados (frente direita)
    for (let i = 0; i < 4; i++) {
      const b = P.cementBag();
      b.position.set(x1 - 0.55 + (i % 2) * 0.05, 0.07 + i * 0.14, z1 - 0.7 + (i % 2) * 0.1);
      b.rotation.y = i * 0.2;
      g.add(b);
    }
    this.obstacles.push({ x0: x1 - 0.95, x1: x1, z0: z1 - 1.05, z1: z1 });

    // Anilhas enferrujadas encostadas na parede (instanciadas)
    const plateGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.035, 26);
    const plateMat = new THREE.MeshStandardMaterial({ ...this.tex.metalTex, metalness: 1, roughness: 1 });
    const plates = new THREE.InstancedMesh(plateGeo, plateMat, 9);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 9; i++) {
      const r = 0.6 + (i % 3) * 0.25;
      dummy.position.set(1.0 + i * 0.075, 0.2 * r + 0.0, z0 + 0.15);
      dummy.rotation.set(Math.PI / 2 - 0.2, 0, 0);
      dummy.scale.set(r, 1, r);
      dummy.updateMatrix();
      plates.setMatrixAt(i, dummy.matrix);
    }
    plates.castShadow = plates.receiveShadow = true;
    g.add(plates);
    // Halteres velhos no chão
    for (let i = 0; i < 3; i++) {
      const d = P.dumbbell(0.32, 0x4a3226);
      d.position.set(1.4 + i * 0.4, 0.06, z0 + 0.65);
      d.rotation.y = rand(-0.3, 0.3);
      g.add(d);
    }

    // Banquinho do Seu Zé
    const st = P.stool();
    const sz = this.def.npcs.seuze.pos;
    st.position.set(sz[0], 0, sz[1]);
    g.add(st);
    this.obstacles.push({ x0: sz[0] - 0.3, x1: sz[0] + 0.3, z0: sz[1] - 0.3, z1: sz[1] + 0.3 });

    // Caminha do Biscoito
    const dog = this.def.npcs.dog.pos;
    const bed = P.mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.1, 24), P.M.cloth(0x8a3a3a), dog[0], 0.05, dog[1], g);
    bed.scale.z = 0.75;
    const rim = P.mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 24), P.M.cloth(0x9a4a4a), dog[0], 0.1, dog[1], g);
    rim.rotation.x = Math.PI / 2;
    rim.scale.y = 0.75;
    this.obstacles.push({ x0: dog[0] - 0.45, x1: dog[0] + 0.45, z0: dog[1] - 0.35, z1: dog[1] + 0.35 });
    this._dog(dog);

    // Pôster/calendário e bandeirinhas
    const cal = P.poster((ctx, w, hh) => {
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#c0302a';
      ctx.fillRect(0, 0, w, hh * 0.22);
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${w * 0.1}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BORRACHARIA DO ZÉ', w / 2, hh * 0.14);
      ctx.fillStyle = '#333';
      ctx.font = `700 ${w * 0.08}px sans-serif`;
      ctx.fillText('Calendário 1998', w / 2, hh * 0.32);
      ctx.strokeStyle = '#999';
      for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) ctx.strokeRect(w * 0.08 + c * w * 0.12, hh * 0.4 + r * hh * 0.1, w * 0.12, hh * 0.1);
    });
    cal.position.set(2.2, 1.9, z0 + 0.13);
    g.add(cal);
    const sign = P.poster((ctx, w, hh) => {
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#ffd34d';
      ctx.font = `900 ${w * 0.15}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('NO PAIN', w / 2, hh * 0.42);
      ctx.fillText('NO GAIN', w / 2, hh * 0.68);
      ctx.fillStyle = '#aaa';
      ctx.font = `700 ${w * 0.07}px sans-serif`;
      ctx.fillText('(e sem reclamar)', w / 2, hh * 0.86);
    }, 0.7, 0.5);
    sign.position.set(x1 - 0.13, 1.9, 1.6);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    const bunt = P.bunting([x0 + 0.3, h - 0.15, -3.5], [x1 - 0.3, h - 0.15, 3.5], 0.35, 20);
    g.add(bunt);
    const bunt2 = P.bunting([x1 - 0.3, h - 0.15, -3.5], [x0 + 0.3, h - 0.15, 3.5], 0.35, 20);
    g.add(bunt2);
    this.bunting = [bunt, bunt2];

    // Mancha de óleo extra (decal)
    const stainTex = labelTexture((ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(10,8,6,0.85)');
      gr.addColorStop(0.6, 'rgba(15,12,10,0.5)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, w);
    }, 128, 128);
    for (const [sx, sz2, s] of [[-0.4, -0.4, 1.4], [3.4, 2.5, 0.9], [-3.6, 1.2, 0.7]]) {
      const st2 = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.7), new THREE.MeshStandardMaterial({ map: stainTex, transparent: true, roughness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
      st2.rotation.x = -Math.PI / 2;
      st2.rotation.z = rand(0, 3);
      st2.position.set(sx, 0.003, sz2);
      st2.receiveShadow = true;
      g.add(st2);
    }
  }

  _dog(pos) {
    // Biscoito: vira-lata caramelo dormindo (respira e abana o rabo quando o Luisão chega perto)
    const d = new THREE.Group();
    const fur = new THREE.MeshPhysicalMaterial({ color: 0xc8823a, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xffc080) });
    const light = new THREE.MeshStandardMaterial({ color: 0xf0d0a0, roughness: 0.9 });
    const body = P.mesh(new THREE.CapsuleGeometry(0.15, 0.32, 6, 14), fur, 0, 0.17, 0, d);
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 0.9);
    const head = new THREE.Group();
    head.position.set(0.3, 0.17, 0.05);
    d.add(head);
    P.mesh(new THREE.SphereGeometry(0.11, 16, 12), fur, 0, 0, 0, head);
    P.mesh(new THREE.SphereGeometry(0.06, 12, 10), light, 0.09, -0.03, 0.0, head).scale.set(1.3, 0.8, 0.9);
    P.mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }), 0.16, -0.01, 0, head);
    for (const z of [-0.06, 0.06]) {
      const ear = P.mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9a5a2a, roughness: 0.9 }), -0.02, 0.06, z, head);
      ear.scale.set(0.6, 1.2, 0.4);
      ear.rotation.x = z > 0 ? 0.6 : -0.6;
      // olhinhos fechados
      P.mesh(new THREE.BoxGeometry(0.004, 0.004, 0.025), new THREE.MeshStandardMaterial({ color: 0x222 }), 0.08, 0.03, z * 0.6, head);
    }
    const tail = new THREE.Group();
    tail.position.set(-0.3, 0.2, 0);
    d.add(tail);
    const tm = P.mesh(new THREE.CapsuleGeometry(0.025, 0.18, 4, 8), fur, -0.09, 0.03, 0, tail);
    tm.rotation.z = 1.1;
    for (const [lx, lz] of [[0.15, 0.1], [0.18, -0.08], [-0.18, 0.1], [-0.16, -0.09]]) {
      const leg = P.mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), fur, lx, 0.05, lz, d);
      leg.rotation.x = Math.PI / 2;
    }
    d.position.set(pos[0], 0.04, pos[1]);
    d.rotation.y = this.def.npcs.dog.yaw;
    this.group.add(d);
    this.dog = { group: d, body, head, tail, wag: 0, pos: new THREE.Vector3(pos[0], 0, pos[1]) };
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
        def,
        group,
        pos: new THREE.Vector3(def.pos[0], 0, def.pos[1]),
        yaw: def.yaw,
        props: {},
        upgradeGroup: new THREE.Group(),
        metalMats: [],
        level: -1,
        shakeT: 0,
      };
      group.add(m.upgradeGroup);
      this._buildMachineProp(m);
      // Caixa invisível pra clique
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.1;
      hit.userData.machineId = def.id;
      group.add(hit);
      m.hit = hit;
      // Câmera cinematográfica
      m.camPos = new THREE.Vector3(...def.cam).applyAxisAngle(Y, def.yaw).add(m.pos);
      m.camLook = new THREE.Vector3(...def.look).applyAxisAngle(Y, def.yaw).add(m.pos);
      m.promptPos = m.pos.clone().add(new THREE.Vector3(0, 2.25, 0));
      this.machines.set(def.id, m);
    }
  }

  _buildMachineProp(m) {
    const g = m.group;
    const id = m.def.prop;
    switch (id) {
      case 'towel': {
        const tw = P.towel(0xd84a4a);
        tw.position.set(0, 0.012, 1.25);
        g.add(tw);
        m.props.towel = tw;
        break;
      }
      case 'gatebar': {
        const barMat = P.M.metal(0.45, 0x8a8f96);
        m.metalMats.push(barMat);
        const bar = P.mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 12), barMat, 0, 2.45, 0, g);
        bar.rotation.z = Math.PI / 2;
        for (const x of [-0.6, 0.6]) P.mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), barMat, x, 2.56, 0, g);
        m.props.bar = bar;
        break;
      }
      case 'jugs': {
        const a = P.waterJug();
        const b = P.waterJug();
        a.position.set(0.35, 0, 0.25);
        b.position.set(-0.35, 0, 0.25);
        g.add(a, b);
        m.props.jugs = [a, b];
        // Copias que vão pras mãos durante o treino
        m.props.handJugs = [P.waterJug(), P.waterJug()];
        break;
      }
      case 'bucket': {
        const b = P.sandBucket();
        b.position.set(0.3, 0, 0.35);
        g.add(b);
        m.props.bucket = b;
        m.props.handBucket = P.sandBucket();
        break;
      }
      case 'chairs': {
        for (const sx of [1, -1]) {
          const c = P.plasticChair();
          c.position.set(sx * 0.5, 0, -0.15);
          g.add(c);
          (m.props.chairs ??= []).push(c);
        }
        break;
      }
      case 'cardboard': {
        const cb = P.cardboard();
        cb.position.set(0, 0.006, -0.75);
        g.add(cb);
        m.props.cardboard = cb;
        break;
      }
      case 'cementbag': {
        const b = P.cementBag();
        b.position.set(0.55, 0.07, 0.2);
        b.rotation.y = 0.4;
        g.add(b);
        m.props.bag = b;
        m.props.handBag = P.cementBag();
        break;
      }
      case 'steps': {
        // A escada faz parte da estrutura; aqui só fita antiderrapante (upgrade).
        break;
      }
      case 'sidewalkmark': {
        const mark = P.poster((ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(w * 0.2, h * 0.2);
          ctx.lineTo(w * 0.8, h * 0.8);
          ctx.moveTo(w * 0.8, h * 0.2);
          ctx.lineTo(w * 0.2, h * 0.8);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
          ctx.stroke();
        }, 1, 1);
        mark.material.transparent = true;
        mark.material.depthWrite = false;
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = 0.005;
        g.add(mark);
        const cone = P.trafficCone();
        cone.position.set(0.9, 0, -0.3);
        g.add(cone);
        break;
      }
      case 'neighbors': {
        // Mesinha de plástico com garrafa térmica (os vizinhos são NPCs).
        const t = new THREE.Group();
        const pm = P.M.plasticWhite();
        P.mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 24), pm, 0, 0.7, 0, t);
        P.mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 10), pm, 0, 0.35, 0, t);
        P.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 14), new THREE.MeshStandardMaterial({ color: 0xc03030, metalness: 0.4, roughness: 0.4 }), 0.1, 0.85, 0, t);
        for (let i = 0; i < 3; i++) P.mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), -0.12 + i * 0.07, 0.74, 0.1, t);
        t.position.set(0, 0, 1.25);
        g.add(t);
        break;
      }
      default:
        break;
    }
  }

  /** Visual das melhorias: tapete → giz → anilhas → LED → troféu; metal mais brilhante. */
  setMachineLevel(id, level) {
    const m = this.machines.get(id);
    if (!m || m.level === level) return;
    m.level = level;
    const u = m.upgradeGroup;
    while (u.children.length) u.remove(u.children[0]);
    const prop = m.def.prop;
    const outdoor = prop === 'sidewalkmark' || prop === 'neighbors';
    const lying = prop === 'towel' || prop === 'cardboard';
    if (level >= 1 && !outdoor) {
      const matSize = lying ? [1.0, 2.2] : [1.3, 1.3];
      const mat = P.mesh(P.rbox(matSize[0], 0.02, matSize[1], 0.008), P.M.rubber(), 0, 0.01, lying ? (prop === 'towel' ? 0.9 : -0.7) : 0, u);
      mat.castShadow = false;
    }
    if (level >= 3) {
      const bowl = P.mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 }), -0.75, 0.04, 0.3, u);
      const chalk = P.mesh(new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 1 }), -0.75, 0.06, 0.3, u);
      chalk.scale.y = 0.3;
      bowl.castShadow = true;
    }
    if (level >= 5) {
      const n = Math.min(5, level - 4);
      for (let i = 0; i < n; i++) {
        const p = P.weightPlate(0.2 - i * 0.015, false, i % 2 ? 0x1f4fa0 : 0x222222);
        p.position.set(0.75, 0.02 + i * 0.037, -0.35);
        u.add(p);
      }
    }
    if (level >= 7) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.012, 6, 48), P.M.emissive(level >= 9 ? 0xffd34d : 0x4fd1ff, 2.2));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      if (lying) ring.position.z = prop === 'towel' ? 0.9 : -0.7;
      ring.scale.set(1, lying ? 1.6 : 1, 1);
      u.add(ring);
    }
    if (level >= 10) {
      const trophy = new THREE.Group();
      P.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), P.M.gold(), 0, 0.03, 0, trophy);
      P.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), P.M.gold(), 0, 0.11, 0, trophy);
      P.mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.1, 14), P.M.gold(), 0, 0.2, 0, trophy);
      trophy.position.set(-0.7, 0, -0.4);
      u.add(trophy);
    }
    // Brilho do metal / cor dos props sobem com o nível
    for (const mm of m.metalMats) mm.roughness = clamp(0.5 - level * 0.045, 0.06, 0.5);
    if (m.props.towel) m.props.towel.material.color.set(level >= 6 ? 0x2a6ad8 : level >= 3 ? 0x8a4ad8 : 0xd84a4a);
    if (m.props.bucket) {
      m.props.bucket.children[0].material.color.set(level >= 6 ? 0xffc94a : level >= 3 ? 0xe84a4a : 0x2f7ad8);
      m.props.handBucket.children[0].material.color.copy(m.props.bucket.children[0].material.color);
    }
    if (m.props.chairs) for (const c of m.props.chairs) c.children.forEach((ch) => ch.material?.color?.set(level >= 8 ? 0xd8d8d8 : level >= 4 ? 0xd83a3a : 0xf3f3ef));
    if (m.props.cardboard) m.props.cardboard.material.color.set(level >= 8 ? 0x5a8ad8 : level >= 4 ? 0x7ad85a : 0xffffff);
    if (prop === 'steps' && level >= 2) {
      for (let i = 0; i < 3; i++) {
        const tape = P.mesh(new THREE.BoxGeometry(0.05, 0.005, 1.5), P.M.emissive(level >= 7 ? 0xffd34d : 0xffe040, level >= 7 ? 1.5 : 0.25), 0.08, 0.183 + i * 0.18, 0, u);
        // escada fica no -X do mundo; o grupo está girado (yaw −90°) → local +Z = mundo −X
        tape.position.set(0, 0.183 + i * 0.18, 0.12 + i * 0.25);
        tape.rotation.y = Math.PI / 2;
      }
    }
  }

  /** "Esse equipamento não aguenta mais você!" — treme e range. */
  creak(id) {
    const m = this.machines.get(id);
    if (m) m.shakeT = 0.6;
  }

  // ── Visual dos geradores (o lado tycoon aparece no mundo) ─────────
  setGeneratorVisual(id, count) {
    const prev = this.genVisuals[id];
    if (prev?.count === count) return;
    if (prev) this.group.remove(prev.group);
    if (count <= 0) {
      delete this.genVisuals[id];
      return;
    }
    const group = new THREE.Group();
    const v = { group, count };
    if (id === 'g_shake') {
      const n = Math.min(3, 1 + Math.floor(count / 10));
      for (let i = 0; i < n; i++) {
        const b = P.blender();
        b.position.set(this.benchTop.x + 0.15 + i * 0.28, this.benchTop.y, this.benchTop.z + 0.05);
        group.add(b);
      }
    } else if (id === 'g_playlist') {
      const b = P.boombox();
      b.position.set(this.shelfTop.x + 0.35, this.shelfTop.y - 0.55 + 0.02, this.shelfTop.z + 0.02);
      group.add(b);
      v.cones = b.userData.cones;
      if (count >= 10) {
        const b2 = P.boombox();
        b2.scale.setScalar(1.5);
        b2.position.set(-5.5, 0, 1.0);
        b2.rotation.y = Math.PI / 2;
        group.add(b2);
        v.cones = [...v.cones, ...b2.userData.cones];
      }
    } else if (id === 'g_halteres') {
      const n = Math.min(10, count);
      for (let i = 0; i < n; i++) {
        const d = P.concreteDumbbell();
        d.position.set(5.65, 0.09 + Math.floor(i / 5) * 0.19, 0.6 + (i % 5) * 0.2 + 0.9);
        d.rotation.y = Math.PI / 2;
        group.add(d);
      }
    }
    // g_parceiro vira NPC (criado pelo Game)
    this.group.add(group);
    this.genVisuals[id] = v;
  }

  // ── Garagem .glb opcional ─────────────────────────────────────────
  async _tryEnvironmentGLB() {
    const gltf = await this.loader.loadGLTF(ASSETS.environments.garagem);
    if (!gltf) return;
    const env = gltf.scene;
    env.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    this.group.add(env);
    // Mantém as colisões procedurais; esconde só as malhas de estrutura.
    for (const c of this.structure.children) c.visible = false;
    this.structure.visible = true;
    for (const fm of this.floorMeshes) {
      fm.visible = true;
      fm.material = new THREE.MeshBasicMaterial({ visible: false });
    }
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
          // Dentro da caixa: empurra pro lado mais próximo
          const pushes = [
            [o.x0 - r - pos.x, 0], [o.x1 + r - pos.x, 0], [0, o.z0 - r - pos.z], [0, o.z1 + r - pos.z],
          ];
          pushes.sort((a, b2) => Math.abs(a[0] + a[1]) - Math.abs(b2[0] + b2[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
      }
    }
  }

  // ── Atualização ──────────────────────────────────────────────────
  update(dt, ctx) {
    this.t += dt;
    const t = this.t;
    // Lâmpada piscando (às vezes dá umas falhadas)
    const f = this.flicker;
    f.next -= dt;
    let k = 1 + Math.sin(t * 50) * 0.015 + Math.sin(t * 7.3) * 0.02;
    if (f.next < 0) {
      f.burst = rand(0.15, 0.5);
      f.next = rand(3, 9);
    }
    if (f.burst > 0) {
      f.burst -= dt;
      k *= Math.random() < 0.5 ? 0.25 : 0.95;
    }
    f.light.intensity = f.base * k;
    f.bulb.emissiveIntensity = 6 * k;

    // Roupas no varal balançando
    if (this.clothesLine) for (const c of this.clothesLine) c.rotation.x = Math.sin(t * 1.3 + c.userData.sway) * 0.12;

    // Rádio
    if (this.radioDial) this.radioDial.material.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.2;

    // Bandeirinhas balançando
    for (const b of this.bunting) for (const c of b.children) if (c.userData.sway !== undefined) c.rotation.x = Math.sin(t * 1.6 + c.userData.sway) * 0.18;

    // Cachorro: respira; abana o rabo se o Luisão está perto
    if (this.dog && ctx?.playerPos) {
      const near = ctx.playerPos.distanceTo(this.dog.pos) < 2.2;
      this.dog.wag += ((near ? 1 : 0) - this.dog.wag) * Math.min(1, dt * 3);
      this.dog.body.scale.y = 1 + Math.sin(t * 2.2) * 0.03;
      this.dog.tail.rotation.y = Math.sin(t * 14) * 0.7 * this.dog.wag;
      this.dog.head.rotation.z = this.dog.wag * 0.25;
    }

    // Caixinhas de som pulsando
    const pl = this.genVisuals.g_playlist;
    if (pl?.cones) {
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.6)), 8);
      for (const c of pl.cones) c.scale.setScalar(1 + beat * 0.12);
    }

    // Máquina rangendo no limite
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
