import * as THREE from 'three';
import * as P from './Props.js';
import { labelTexture } from '../render/ProceduralTextures.js';
import { createSky } from './Sky.js';
import { createRig } from '../characters/Character.js';
import { PASSENGER_BY_U, passengerName } from '../config/passengers.js';
import { damp, mulberry32, pick, rand } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  O SUBARU LEGACY AZUL do Uber.
//
//  1) EXTERIOR: o carro estacionado no meio-fio, na frente da garagem. É o "botão" do emprego:
//     o Luisão anda até ele (ou clica nele) pra começar a rodar.
//  2) INTERIOR: uma cena separada, LONGE do bairro (CAR_ORIGIN), com a câmera interna do carro.
//     Mostra o Luisão dirigindo (de frente) e os passageiros no banco de trás / do carona, com o
//     cenário passando pelas janelas. A cena só existe visualmente enquanto ele está dirigindo.
//
//  Convenções do interior (coordenadas locais): o carro olha pra +Z, a ESQUERDA é +X (volante
//  do lado esquerdo), o chão é y = 0. A câmera fica no teto, perto do para-brisa, olhando pra trás.
// ════════════════════════════════════════════════════════════════

/** Onde a cena interna mora (bem longe; a neblina e o limite de câmera escondem o bairro). */
export const CAR_ORIGIN = new THREE.Vector3(1800, 0, 0);

const BLUE = 0x1c4fb8;
const LOOP = 160; // comprimento da "pista" que se repete
const HALF = LOOP / 2;

// Lugares dos passageiros (local). O banco da frente é o do carona.
const SEATS = {
  rl: { x: 0.4, z: -0.95 }, // atrás do motorista
  rc: { x: 0.0, z: -0.95 },
  rr: { x: -0.4, z: -0.95 }, // atrás do carona
  front: { x: -0.38, z: -0.02 }, // carona
};
const DRIVER = { x: 0.38, z: -0.02 };

const CAM = { pos: [-0.05, 1.34, 0.8], look: [0.14, 0.95, -0.6] };

/** Aparências dos passageiros (o mesmo @usuário sempre tem a mesma aparência). */
const SKINS = [0xf0c6a2, 0xe0b090, 0xc68b66, 0xb07a55, 0x8d5a3b, 0xd9a582, 0x6b4630, 0xecc6a5];
const HAIRS = [0x111014, 0x2a1c12, 0x4a3020, 0x7a5a30, 0xcfa65a, 0x6b4b3a, 0x1c1410, 0x8a3a1a];
const TOPS = [0xd65a8a, 0x3aa37a, 0xd8a03a, 0x4f86c6, 0xe8e8e8, 0x2a2a30, 0xc8523a, 0x7a5ad8, 0x2a8a5a, 0xf0c040];
const BOTTOMS = [0x2a3550, 0x2a2a3a, 0x5a4a3a, 0x3a4a6a, 0x1c1c20, 0x6b5b4b];
const POOL = 8;

function variantLook(i) {
  const r = mulberry32(1000 + i * 7919);
  const f = (arr) => arr[Math.floor(r() * arr.length)];
  const female = i % 2 === 1;
  return {
    female,
    skin: f(SKINS),
    hairColor: f(HAIRS),
    hairStyle: female ? f(['bun', 'ponytail', 'longStraight', 'curly']) : f(['short', 'short', 'long', 'grey']),
    top: f(TOPS),
    topStyle: f(['tee', 'tee', 'tank', 'polo', 'hoodie']),
    bottom: f(BOTTOMS),
    bottomStyle: female && r() < 0.35 ? 'skirt' : 'pants',
    shoes: f([0xf4f4f4, 0x222222, 0xb08060]),
    height: 0.84 + r() * 0.16,
    build: 0.15 + r() * 0.4,
    glasses: r() < 0.2,
    freckles: r() < 0.15,
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const easeOutBack = (t) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** UV em metros: a textura de janelas repete sem esticar. */
function metricBox(w, h, d, x, y, z, cell = [6, 24]) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, 0.01, 0.99);
    else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, p.getZ(i) / cell[0], p.getY(i) / cell[1]);
    else uv.setXY(i, p.getX(i) / cell[0], p.getY(i) / cell[1]);
  }
  return g;
}

function windowTexture(lit) {
  const t = labelTexture((c, w, h) => {
    const rng = mulberry32(77);
    c.fillStyle = lit ? '#000' : '#fff';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const on = rng() < 0.45;
        const px = 4 + x * 15;
        const py = 6 + y * 15;
        if (lit) {
          if (on) {
            c.fillStyle = '#ffc97a';
            c.fillRect(px, py, 9, 10);
          }
        } else {
          c.fillStyle = on ? '#f4e2b8' : '#39425a';
          c.fillRect(px, py, 9, 10);
        }
      }
    }
  }, 64, 128);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function noShadow(obj) {
  obj.traverse((c) => {
    if (c.isMesh) c.castShadow = c.receiveShadow = false;
  });
  return obj;
}

export class UberCar {
  /**
   * @param {object} o { scene, def: gym.uberSpot, loader, clips, rigFactory? }
   */
  constructor({ scene, def, loader, clips, rigFactory }) {
    this.scene = scene;
    this.def = def;
    this.loader = loader;
    this.clips = clips;
    this.rigFactory = rigFactory ?? ((look) => createRig('passante', loader, clips, look));
    this.t = 0;
    this.locked = true;
    this.active = false;
    this.speed = 4;
    this.boost = 0;
    this.rainOn = false;
    this.entries = []; // passageiros (com animação de embarque/desembarque)
    this.variants = []; // aparências já construídas { rig, used }
    this.warming = null;
    this._pendingRiders = null;
    this._ridersKey = '';
    this._gaze = 0;

    // ── Exterior (no bairro) ───────────────────────────────────────
    const [sx, sz] = def.stand;
    this.pos = new THREE.Vector3(sx, 0, sz); // onde o Luisão fica de pé pra entrar
    this.yaw = def.standYaw ?? 0;
    this.carPos = new THREE.Vector3(def.car[0], 0, def.car[1]);
    this.promptPos = new THREE.Vector3(def.car[0], 1.9, def.car[1]);
    this.exterior = new THREE.Group();
    this.exterior.name = 'uberCarExterior';
    this.exterior.position.set(def.car[0], -0.1, def.car[1]); // o asfalto da rua fica em y = -0.1
    this.exterior.rotation.y = def.yaw;
    scene.add(this.exterior);
    this._buildExterior();

    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5.0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.8, 0);
    hit.userData.workStation = 'uber';
    this.exterior.add(hit);
    this.hit = hit;

    // ── Interior (cena separada, longe) ────────────────────────────
    this.root = new THREE.Group();
    this.root.name = 'uberCarScene';
    this.root.position.copy(CAR_ORIGIN);
    scene.add(this.root);
    this.interior = new THREE.Group(); // tudo que é visível; escondido quando não está dirigindo
    this.interior.visible = false;
    this.root.add(this.interior);
    // A luz fica fora do grupo escondido (o nº de luzes da cena não pode mudar ao entrar/sair: recompilaria os shaders)
    this.domeLight = new THREE.PointLight(0xffe6c0, 0, 4.2, 2);
    this.domeLight.position.set(0, 1.15, -0.2);
    this.root.add(this.domeLight);
    this._buildInterior();
    this._buildScenery();

    // Pontos de referência (mundo) usados pela câmera, pela Equipe e pelo energético
    this.camPos = this.worldPoint(CAM.pos);
    this.camLook = this.worldPoint(CAM.look);
    this.driverPos = this.worldPoint([DRIVER.x, 0, DRIVER.z]);
    this.driverYaw = 0;
    this.seatPos = this.driverPos;
    this.phoneSpot = this.worldPoint([0.0, 0.85, 0.1]); // o celular da waifu, flutuando sobre o console (aparece na câmera)
    this.coachSpot = this.phoneSpot.clone().add(new THREE.Vector3(0, 0, 0.6)); // (o personal não entra no carro; só pra quem pergunta)
    this.canSpot = this.worldPoint([0.0, 0.92, -0.1]); // energético: entre os bancos da frente
    this.setLocked(true);
  }

  worldPoint(a) {
    const v = Array.isArray(a) ? a : [a.x, a.y, a.z];
    return new THREE.Vector3(CAR_ORIGIN.x + v[0], CAR_ORIGIN.y + v[1], CAR_ORIGIN.z + v[2]);
  }

  // ════════════════════════════════════════════════════════════════
  //  Exterior: Subaru Legacy azul
  // ════════════════════════════════════════════════════════════════
  _buildExterior() {
    const g = this.exterior;
    const paint = new THREE.MeshPhysicalMaterial({ color: BLUE, roughness: 0.28, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1018, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.6, metalness: 0.2 });
    const silver = P.M.metal(0.25, 0xc8ccd2);
    const tire = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.95 });
    // Carroceria baixa + capô + porta-malas
    P.mesh(P.rbox(1.76, 0.5, 4.55, 0.14), paint, 0, 0.55, 0, g);
    const hood = P.mesh(P.rbox(1.68, 0.12, 1.3, 0.05), paint, 0, 0.84, 1.55, g);
    hood.rotation.x = 0.07;
    const trunk = P.mesh(P.rbox(1.66, 0.12, 0.95, 0.05), paint, 0, 0.88, -1.72, g);
    trunk.rotation.x = -0.04;
    // Cabine (vidros escuros) + teto azul
    const cab = P.mesh(P.rbox(1.52, 0.5, 2.25, 0.16), glass, 0, 1.08, -0.12, g);
    cab.castShadow = false;
    P.mesh(P.rbox(1.5, 0.05, 1.5, 0.04), paint, 0, 1.345, -0.14, g);
    for (const s of [-1, 1]) {
      // colunas
      P.mesh(new THREE.BoxGeometry(0.06, 0.5, 0.07), paint, s * 0.75, 1.08, 0.18, g);
      P.mesh(new THREE.BoxGeometry(0.06, 0.5, 0.08), paint, s * 0.75, 1.08, -0.52, g);
      // retrovisores
      P.mesh(P.rbox(0.1, 0.07, 0.14, 0.03), paint, s * 0.95, 0.96, 0.62, g);
    }
    // Para-choques, grade, faróis, lanternas
    P.mesh(P.rbox(1.74, 0.22, 0.2, 0.06), trim, 0, 0.36, 2.28, g);
    P.mesh(P.rbox(1.74, 0.22, 0.2, 0.06), trim, 0, 0.36, -2.28, g);
    P.mesh(P.rbox(0.7, 0.1, 0.05, 0.02), trim, 0, 0.62, 2.28, g);
    const hex = P.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), silver, 0, 0.62, 2.31, g); // "estrelinha" da grade
    hex.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      P.mesh(P.rbox(0.42, 0.12, 0.08, 0.03), P.M.emissive(0xfff4dc, 1.4), s * 0.6, 0.66, 2.25, g);
      P.mesh(P.rbox(0.4, 0.12, 0.07, 0.03), P.M.emissive(0xff2a2a, 1.6), s * 0.62, 0.7, -2.24, g);
    }
    // Rodas
    for (const [x, z] of [[-0.83, 1.4], [0.83, 1.4], [-0.83, -1.4], [0.83, -1.4]]) {
      const w = P.mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.22, 20), tire, x, 0.31, z, g);
      w.rotation.z = Math.PI / 2;
      const rim = P.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.235, 12), silver, x, 0.31, z, g);
      rim.rotation.z = Math.PI / 2;
    }
    // Placa
    const plate = labelTexture((c, w, h) => {
      c.fillStyle = '#f4f4f4';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1c4fb8';
      c.fillRect(0, 0, w, h * 0.22);
      c.fillStyle = '#111';
      c.font = `800 ${h * 0.5}px sans-serif`;
      c.textAlign = 'center';
      c.fillText('LEG-4C9', w / 2, h * 0.82);
    }, 128, 64);
    for (const [z, ry] of [[-2.395, Math.PI], [2.395, 0]]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5 }));
      pl.position.set(0, 0.42, z);
      pl.rotation.y = ry;
      g.add(pl);
    }
    // Adesivo no vidro de trás: o app
    const sticker = labelTexture((c, w, h) => {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = `900 ${h * 0.62}px Impact, sans-serif`;
      c.textAlign = 'center';
      c.fillText('UBER', w / 2, h * 0.78);
    }, 128, 48);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.13), new THREE.MeshBasicMaterial({ map: sticker }));
    st.position.set(0, 1.12, -1.255);
    st.rotation.y = Math.PI;
    g.add(st);
    this.headlights = g.children.filter((c) => c.material?.emissive?.getHex() && c.position.z > 2);
  }

  // ════════════════════════════════════════════════════════════════
  //  Interior
  // ════════════════════════════════════════════════════════════════
  _buildInterior() {
    const I = this.interior;
    const M = {
      carpet: new THREE.MeshStandardMaterial({ color: 0x23232a, roughness: 1 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.92 }),
      seatHi: new THREE.MeshStandardMaterial({ color: 0x4a4a56, roughness: 0.9 }),
      door: new THREE.MeshStandardMaterial({ color: 0x2c2c33, roughness: 0.8 }),
      doorHi: new THREE.MeshStandardMaterial({ color: 0x42424c, roughness: 0.7 }),
      liner: new THREE.MeshStandardMaterial({ color: 0xcdc6b6, roughness: 0.95 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.7 }),
      paint: new THREE.MeshPhysicalMaterial({ color: BLUE, roughness: 0.3, metalness: 0.4, clearcoat: 1 }),
      metal: P.M.metal(0.3, 0xb8bcc4),
    };
    const box = (w, h, d, mat, x, y, z, r = 0) => P.mesh(r ? P.rbox(w, h, d, r) : new THREE.BoxGeometry(w, h, d), mat, x, y, z, I);

    // Piso, túnel central e teto
    box(1.5, 0.04, 2.9, M.carpet, 0, -0.02, -0.25);
    box(0.22, 0.12, 1.9, M.dark, 0, 0.06, -0.1, 0.03);
    box(1.5, 0.04, 2.7, M.liner, 0, 1.43, -0.3);
    box(0.24, 0.025, 0.12, P.M.emissive(0xfff2d8, 1.4), 0, 1.405, -0.15); // luz de teto
    // Portas e colunas
    for (const s of [-1, 1]) {
      box(0.06, 0.66, 2.9, M.door, s * 0.77, 0.55, -0.25);
      box(0.05, 0.05, 2.2, M.doorHi, s * 0.74, 0.88, -0.25); // apoio de braço
      box(0.045, 0.045, 2.8, M.dark, s * 0.745, 1.4, -0.25); // moldura do teto
      box(0.09, 0.62, 0.09, M.dark, s * 0.745, 1.1, -0.55); // coluna B
      const c = box(0.09, 0.6, 0.14, M.dark, s * 0.72, 1.1, -1.4); // coluna C
      c.rotation.x = 0.35;
      const door = box(0.03, 0.12, 0.45, M.doorHi, s * 0.735, 0.7, -0.05); // maçaneta/painel
      void door;
    }
    // Banco traseiro
    box(1.45, 0.14, 0.58, M.seat, 0, 0.36, -0.98, 0.04);
    const back = box(1.45, 0.64, 0.14, M.seat, 0, 0.78, -1.28, 0.05);
    back.rotation.x = -0.12;
    for (const x of [-0.4, 0, 0.4]) {
      const hr = box(0.2, 0.17, 0.09, M.seatHi, x, 1.16, -1.33, 0.03);
      hr.rotation.x = -0.12;
    }
    // Prateleira e vidro traseiro (aberto: dá pra ver a rua indo embora)
    box(1.5, 0.04, 0.3, M.dark, 0, 1.0, -1.42);
    box(1.5, 0.04, 0.06, M.liner, 0, 1.4, -1.5);
    // Bancos da frente
    for (const x of [-0.38, 0.38]) {
      box(0.5, 0.15, 0.54, M.seat, x, 0.36, 0.0, 0.04);
      const bk = box(0.5, 0.66, 0.13, M.seat, x, 0.8, -0.3, 0.05);
      bk.rotation.x = -0.14;
      const hr = box(0.22, 0.2, 0.1, M.seatHi, x, 1.2, -0.37, 0.03);
      hr.rotation.x = -0.14;
    }
    // Console central, câmbio e porta-copos
    box(0.2, 0.2, 0.75, M.dark, 0, 0.22, 0.2, 0.04);
    const stick = P.mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 8), M.metal, 0, 0.42, 0.38, I);
    stick.rotation.x = -0.2;
    P.mesh(new THREE.SphereGeometry(0.03, 10, 8), M.dark, 0, 0.5, 0.36, I);
    P.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), M.metal, 0, 0.325, 0.05, I);
    // Painel (atrás da câmera, mas aparece nos reflexos/ombro) + volante
    box(1.5, 0.45, 0.4, M.dark, 0, 0.7, 0.98);
    const cluster = P.mesh(P.rbox(0.34, 0.12, 0.05, 0.02), P.M.emissive(0xff9a3a, 0.9), DRIVER.x, 0.99, 0.74, I);
    cluster.rotation.x = 0.25;
    this.wheel = new THREE.Group();
    this.wheel.position.set(DRIVER.x, 0.87, 0.52);
    this.wheel.rotation.x = 0.35;
    I.add(this.wheel);
    const rim = P.mesh(new THREE.TorusGeometry(0.17, 0.021, 10, 28), M.dark, 0, 0, 0, this.wheel);
    rim.castShadow = false;
    P.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 14), M.dark, 0, 0, 0, this.wheel).rotation.x = Math.PI / 2;
    for (const a of [Math.PI / 2, Math.PI * 0.9, Math.PI * 0.1 - Math.PI]) {
      const sp = P.mesh(new THREE.BoxGeometry(0.15, 0.022, 0.02), M.dark, Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0, this.wheel);
      sp.rotation.z = a;
    }
    // Estrelinhas do Subaru no volante
    const badge = P.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 6), M.metal, 0, 0, -0.03, this.wheel);
    badge.rotation.x = Math.PI / 2;
    // Celular no suporte do painel? Fica no console (a waifu usa esse ponto)
    // Árvore de cheiro pendurada no retrovisor (atrás da câmera, mas balança no reflexo da luz)
    this.fresh = P.mesh(new THREE.BoxGeometry(0.05, 0.08, 0.005), P.M.emissive(0x5dff9e, 0.6), 0.0, 1.28, 0.7, I);
    noShadow(I);
  }

  // ════════════════════════════════════════════════════════════════
  //  Cenário que passa pelas janelas (a pista se repete a cada LOOP metros)
  // ════════════════════════════════════════════════════════════════
  _buildScenery() {
    const O = new THREE.Group();
    O.name = 'uberScenery';
    this.interior.add(O);
    this.scenery = O;
    this.scroll = []; // itens que andam com o mundo: { o, speedMul }
    const rng = mulberry32(2026);
    const R = (a, b) => a + rng() * (b - a);

    // Céu próprio (o do bairro está longe)
    const sky = createSky({});
    sky.position.set(0, 0, 0);
    O.add(sky);

    // Asfalto, calçadas, faixa do meio
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2a31, roughness: 0.95 });
    const walk = new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 1 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10.2, LOOP * 1.4), asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0.7, -0.32, 0);
    O.add(road);
    for (const [cx, w] of [[-6.85, 5.1], [7.6, 3.6]]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(w, LOOP * 1.4), walk);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(cx, -0.2, 0);
      O.add(sw);
    }
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8c040 });
    const dashGeo = new THREE.BoxGeometry(0.16, 0.01, 3);
    for (let z = -HALF; z < HALF; z += 8) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.position.set(2.0, -0.31, z);
      O.add(d);
      this.scroll.push({ o: d, mul: 1 });
    }
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xcfcfcf });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, LOOP * 1.4), edgeMat);
    edge.position.set(-4.1, -0.31, 0);
    O.add(edge);

    // Prédios dos dois lados
    const wallTex = windowTexture(false);
    const emTex = windowTexture(true);
    const palette = [0x6b5a78, 0x8a6f6a, 0xa98d72, 0x5d6f86, 0x77806a, 0x9a7a8c, 0x6f6a8a];
    for (const side of [-1, 1]) {
      let z = -HALF;
      while (z < HALF) {
        const len = R(8, 13);
        const w = R(8, 13);
        const h = R(7, 22);
        const x = side * (R(9.4, 11.5) + w / 2);
        const mat = new THREE.MeshStandardMaterial({
          map: wallTex, emissiveMap: emTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.9,
          color: palette[Math.floor(rng() * palette.length)], roughness: 0.95,
        });
        const b = new THREE.Mesh(metricBox(w, h, len, 0, h / 2 - 0.3, 0), mat);
        b.position.set(x, 0, z + len / 2);
        O.add(b);
        this.scroll.push({ o: b, mul: 1 });
        z += len + R(0.8, 2.5);
      }
    }

    // Postes (os dois lados): haste + lâmpada quente
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.6, metalness: 0.5 });
    const lampMat = P.M.emissive(0xffd29a, 2.4);
    for (const side of [-1, 1]) {
      for (let z = -HALF + 5; z < HALF; z += 20) {
        const pole = new THREE.Group();
        pole.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 8), poleMat));
        pole.children[0].position.y = 2.7;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), poleMat);
        arm.position.set(-side * 0.5, 5.7, 0);
        pole.add(arm);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.22), lampMat);
        lamp.position.set(-side * 1.0, 5.62, 0);
        pole.add(lamp);
        pole.position.set(side * 5.2 + (side > 0 ? 0.6 : 0), 0, z);
        O.add(pole);
        this.scroll.push({ o: pole, mul: 1 });
      }
    }

    // Carros estacionados na direita e carros vindo na pista da esquerda
    const carColors = [0xd83a3a, 0xe8e8e8, 0x2a2a2a, 0x3a6ad8, 0xc8c8c8, 0xe8c040, 0x2a8a5a, 0x7a7a82];
    const makeCar = (color) => {
      const g = new THREE.Group();
      const body = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
      const gl = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.1, metalness: 0.6 });
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 4.2), body);
      a.position.y = 0.3;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.2), gl);
      b.position.set(0, 0.82, -0.1);
      g.add(a, b);
      for (const sz of [-1, 1]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.05), P.M.emissive(sz > 0 ? 0xfff4dc : 0xff2a2a, 1.8));
        hl.position.set(0, 0.42, sz * 2.12);
        g.add(hl);
      }
      return g;
    };
    for (let z = -HALF + 8, i = 0; z < HALF; z += R(14, 26), i++) {
      const c = makeCar(carColors[i % carColors.length]);
      c.position.set(-3.45, -0.3, z);
      O.add(c);
      this.scroll.push({ o: c, mul: 1 });
    }
    this.oncoming = [];
    for (let i = 0; i < 4; i++) {
      const c = makeCar(carColors[(i * 3 + 1) % carColors.length]);
      c.rotation.y = Math.PI; // vem de frente
      c.position.set(3.8, -0.3, -HALF + i * (LOOP / 4) + R(0, 15));
      O.add(c);
      this.scroll.push({ o: c, mul: 2.8 });
    }

    // Chuva (traços caindo em volta do carro)
    const N = 260;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) this._resetDrop(i, true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaec6e8, transparent: true, opacity: 0.5 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    O.add(this.rain);
    noShadow(O);
  }

  _resetDrop(i, anywhere = false) {
    const p = this.rainPos;
    const x = rand(-9, 9);
    const y = anywhere ? rand(0, 9) : rand(7, 9);
    const z = rand(-14, 14);
    p.set([x, y, z, x, y - 0.55, z - 0.12], i * 6);
  }

  // ════════════════════════════════════════════════════════════════
  //  Passageiros
  // ════════════════════════════════════════════════════════════════
  /** Constrói as aparências aos poucos (1 por frame) pra não travar na primeira corrida. */
  warm() {
    if (this.warming) return this.warming;
    this.warming = (async () => {
      for (let i = 0; i < POOL; i++) {
        const rig = await this.rigFactory(variantLook(i));
        rig.object3D.visible = false;
        rig.setState('seated');
        rig.t = Math.random() * 30;
        this.interior.add(rig.object3D);
        noShadow(rig.object3D);
        // object3D é o próprio root, que já leva a ALTURA da pessoa na escala: guarda pra animar sem perdê-la
        this.variants[i] = { rig, used: false, base: rig.object3D.scale.x || 1 };
        await new Promise((r) => setTimeout(r, 0));
      }
      if (this._pendingRiders) {
        const { list, instant } = this._pendingRiders;
        this._pendingRiders = null;
        this.setRiders(list, instant);
      }
    })();
    return this.warming;
  }

  get ready() {
    return this.variants.length === POOL;
  }

  _freeVariant(u) {
    let i = hashStr(u) % POOL;
    for (let k = 0; k < POOL; k++, i = (i + 1) % POOL) if (!this.variants[i].used) return i;
    return -1;
  }

  /**
   * Troca o grupo de passageiros: quem estava no carro desce, os novos entram.
   * list = [@usuário]. instant = sem animação (entrada no carro / carregar o save).
   */
  setRiders(list, instant = false) {
    const key = list.join(',');
    if (key === this._ridersKey) return;
    if (!this.ready) {
      this._pendingRiders = { list, instant };
      this.warm();
      return;
    }
    this._ridersKey = key;
    // Quem estava no carro desce
    for (const e of this.entries) {
      if (instant) e.anim = 0;
      e.dir = -1;
    }
    // Quem chega
    const used = new Set();
    const seats = this._seatsFor(list.length);
    list.forEach((u, idx) => {
      const p = PASSENGER_BY_U[u];
      if (!p) return;
      const vi = this._freeVariant(u);
      if (vi < 0) return;
      const v = this.variants[vi];
      v.used = true;
      used.add(vi);
      const seat = seats[idx];
      const e = {
        u, name: passengerName(p), sub: p.n ? `@${p.u}` : '', vi, rig: v.rig, base: v.base, seat,
        anim: instant ? 1 : 0, dir: 1, delay: instant ? 0 : 0.28 + idx * 0.12,
        gazeT: rand(0.5, 3), talkT: rand(1, 5), lookAt: null,
      };
      v.rig.object3D.position.set(seat.x, 0, seat.z);
      v.rig.object3D.rotation.y = 0;
      v.rig.object3D.scale.setScalar(v.base * (instant ? 1 : 0.001));
      v.rig.object3D.visible = instant;
      v.rig.setState('seated');
      this.entries.push(e);
    });
    if (instant) this._flushLeaving();
  }

  _seatsFor(n) {
    const frontOk = n <= 2 && Math.random() < 0.35;
    if (n === 1) return [frontOk ? SEATS.front : pick([SEATS.rr, SEATS.rl, SEATS.rc])];
    if (n === 2) return frontOk ? [SEATS.front, pick([SEATS.rl, SEATS.rr])] : [SEATS.rl, SEATS.rr];
    return [SEATS.rl, SEATS.rc, SEATS.rr].slice(0, n);
  }

  _flushLeaving() {
    this.entries = this.entries.filter((e) => {
      if (e.dir < 0 && e.anim <= 0) {
        e.rig.object3D.visible = false;
        this.variants[e.vi].used = false;
        return false;
      }
      return true;
    });
  }

  /** Nomes flutuando em cima de cada passageiro (a tela projeta). */
  labels() {
    const out = [];
    for (const e of this.entries) {
      if (e.dir < 0 || e.anim < 0.55) continue;
      // O do meio sobe mais pra os 3 nomes de trás não se sobreporem; o do carona (mais perto da câmera) fica mais baixo
      const lift = e.seat === SEATS.rc ? 0.55 : e.seat === SEATS.front ? 0.22 : 0.3;
      out.push({ key: `rider_${e.u}`, name: e.name, sub: e.sub, pos: e.rig.headWorld.add(new THREE.Vector3(0, lift, 0)) });
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════
  //  Estado / efeitos
  // ════════════════════════════════════════════════════════════════
  setLocked(v) {
    this.locked = v;
  }

  /** Liga/desliga a cena interna (só existe visualmente com o Luisão dirigindo). */
  setActive(on) {
    this.active = on;
    this.interior.visible = on;
    this.domeLight.intensity = on ? 3.2 : 0;
    for (const m of this.headlights ?? []) m.material.emissiveIntensity = on ? 3.2 : 1.4;
    if (on) this.warm();
  }

  setRain(on) {
    this.rainOn = on;
    this.rain.visible = on;
  }

  /** Cada clique (km): o carro "acelera" um pouquinho e o volante balança. */
  kick(amount = 1) {
    this.boost = Math.min(10, this.boost + 2.2 * amount);
    this.wheelKick = 0.12 * (Math.random() < 0.5 ? -1 : 1);
  }

  /** Olhar do motorista (o Luisão): estrada, retrovisor ou algum passageiro. */
  attachDriver(rig) {
    this.driver = rig;
    this._gaze = 0;
  }

  detachDriver() {
    this.driver?.lookAt(null);
    this.driver = null;
  }

  update(dt) {
    this.t += dt;
    if (!this.active) return;
    // Velocidade: ritmo calmo + impulso por clique
    this.boost = damp(this.boost, 0, 1.6, dt);
    this.speed = damp(this.speed, 4.5 + this.boost, 3, dt);
    const dz = this.speed * dt;
    for (const it of this.scroll) {
      it.o.position.z -= dz * it.mul;
      if (it.o.position.z < -HALF) it.o.position.z += LOOP;
    }
    // Volante, chuva
    this.wheelKick = damp(this.wheelKick ?? 0, 0, 5, dt);
    this.wheel.rotation.z = Math.sin(this.t * 0.9) * 0.1 + (this.wheelKick ?? 0);
    this.fresh.rotation.z = Math.sin(this.t * 2.1) * 0.25;
    if (this.rainOn) {
      const p = this.rainPos;
      for (let i = 0; i < p.length / 6; i++) {
        const o = i * 6;
        const fall = 15 * dt;
        p[o + 1] -= fall;
        p[o + 4] -= fall;
        p[o + 2] += this.speed * dt;
        p[o + 5] += this.speed * dt;
        if (p[o + 1] < -0.3) this._resetDrop(i);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    // Passageiros (entrar/sair, olhar, falar)
    let flush = false;
    for (const e of this.entries) {
      if (e.delay > 0) {
        e.delay -= dt;
        if (e.delay > 0) continue;
        e.rig.object3D.visible = true;
      }
      e.anim = Math.min(1, Math.max(0, e.anim + (e.dir * dt) / (e.dir > 0 ? 0.35 : 0.22)));
      const k = e.dir > 0 ? easeOutBack(e.anim) : e.anim;
      e.rig.object3D.scale.setScalar(Math.max(0.001, k) * e.base);
      if (e.dir < 0 && e.anim <= 0) flush = true;
      if (e.dir > 0) this._passengerLife(e, dt);
      e.rig.update(dt);
    }
    if (flush) this._flushLeaving();
    this._driverLife(dt);
  }

  _passengerLife(e, dt) {
    e.gazeT -= dt;
    if (e.gazeT <= 0) {
      e.gazeT = rand(2, 6);
      const r = Math.random();
      if (r < 0.4) e.lookAt = this.camPos;
      else if (r < 0.7) e.lookAt = this.driverHead();
      else {
        const other = pick(this.entries.filter((x) => x !== e && x.dir > 0)) ?? null;
        e.lookAt = other ? other.rig.headWorld : this.worldPoint([e.seat.x, 1.2, 4]);
      }
      e.rig.lookAt(e.lookAt);
    }
    e.talkT -= dt;
    if (e.talkT <= 0) {
      e.rig.talking = !e.rig.talking;
      e.talkT = e.rig.talking ? rand(1, 3) : rand(2, 7);
    }
  }

  driverHead() {
    return this.worldPoint([DRIVER.x, 1.2, DRIVER.z + 0.1]);
  }

  _driverLife(dt) {
    if (!this.driver) return;
    this._gaze -= dt;
    if (this._gaze > 0) return;
    this._gaze = rand(1.6, 4.5);
    const r = Math.random();
    const riders = this.entries.filter((x) => x.dir > 0);
    if (r < 0.55 || !riders.length) this.driver.lookAt(this.worldPoint([DRIVER.x - 0.1, 1.2, 4]));
    else if (r < 0.75) this.driver.lookAt(this.worldPoint([0, 1.25, -0.8])); // retrovisor
    else this.driver.lookAt(pick(riders).rig.headWorld);
  }
}

