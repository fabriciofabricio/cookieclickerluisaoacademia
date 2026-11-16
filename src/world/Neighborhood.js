import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  "Cenário infinito" do bairro: a rua continua pros dois lados com
//  casas, muros, árvores, carros e postes; atrás vêm prédios, um morro
//  com luzinhas e um horizonte de cidade. Tudo estático é mesclado em
//  poucas malhas (poucas draw calls). A neblina do entardecer esconde
//  o fim do mundo — nada de vazio nem "noclip".
// ════════════════════════════════════════════════════════════════

/** Junta geometrias com cor por vértice num único Mesh. */
class Batch {
  constructor() {
    this.geos = [];
  }

  add(geo, color) {
    // Tudo não-indexado: algumas geometrias (RoundedBox) não têm índice e o merge exige uniformidade.
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    this.geos.push(g);
  }

  mesh(material, { cast = false, receive = true } = {}) {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}

/** Caixa com UV em metros (textura não estica). */
function box(w, h, d, x, y, z, uvScale = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
    else if (ax > 0.5) uv.setXY(i, p.getZ(i) / uvScale, p.getY(i) / uvScale);
    else uv.setXY(i, p.getX(i) / uvScale, p.getY(i) / uvScale);
  }
  return g;
}

/** Telhado de duas águas (prisma com faces planas), cumeeira ao longo de X. */
function gableRoof(w, d, h, x, y, z) {
  const hw = w / 2;
  const hd = d / 2;
  const v = [
    // água da frente
    [-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0],
    // água de trás
    [hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0],
    // oitões
    [-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0],
    [hw, 0, hd], [hw, 0, -hd], [hw, h, 0],
  ];
  const pos = new Float32Array(v.flat());
  const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
  const uv = new Float32Array(v.length * 2);
  v.forEach((p, i) => {
    uv[i * 2] = (p[0] + x) / 1.2;
    uv[i * 2 + 1] = (p[1] + p[2]) / 1.2;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.translate(x, y, z);
  return g;
}

function skylineTexture(seed, color, winColor, density, maxH) {
  const W = 2048;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  ctx.clearRect(0, 0, W, H);
  let x = 0;
  while (x < W) {
    const bw = 18 + rng() * 60;
    const bh = H * (0.15 + rng() * maxH);
    ctx.fillStyle = color;
    ctx.fillRect(x, H - bh, bw, bh);
    if (rng() < 0.15) ctx.fillRect(x + bw * 0.4, H - bh - 14, 3, 14); // antena
    for (let wy = H - bh + 6; wy < H - 4; wy += 7) {
      for (let wx = x + 4; wx < x + bw - 4; wx += 6) {
        if (rng() < density) {
          ctx.fillStyle = winColor;
          ctx.globalAlpha = 0.5 + rng() * 0.5;
          ctx.fillRect(wx, wy, 2.5, 3);
          ctx.globalAlpha = 1;
        }
      }
    }
    x += bw + rng() * 4;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.anisotropy = 4;
  return t;
}

/**
 * Monta o bairro em volta da garagem.
 * opts: { z1: frente da garagem (calçada começa), wallTex, keepClear: [{x0,x1,z0,z1}] }
 */
export function buildNeighborhood(opts) {
  const group = new THREE.Group();
  group.name = 'bairro';
  const rng = mulberry32(42);
  const R = (a, b) => a + rng() * (b - a);
  const pickc = (arr) => arr[Math.floor(rng() * arr.length)];
  const z1 = opts.z1;
  const nearCurb = z1 + 2.9; // meio-fio do lado da garagem
  const farCurb = z1 + 10.5; // meio-fio do outro lado
  const farLot = z1 + 13.1; // muro das casas da frente
  const EXT = 92; // a rua vai até ±92 m

  const walls = new Batch();
  const roofs = new Batch();
  const litWin = new Batch();
  const darkWin = new Batch();
  const ground = new Batch();
  const metal = new Batch();
  const foliage = new Batch();
  const glow = new Batch();
  const cars = new Batch();

  const houseColors = [0xe8b86a, 0x9ac4b8, 0xe89a8a, 0xb8a8e0, 0xf0e0a8, 0x8ab0d8, 0xf2f0e6, 0xd8c8a8, 0xa8d8a0, 0xe0a0b8];
  const roofColors = [0x9a4a32, 0x8a3a2a, 0xa85a3a, 0x6a6a6a];

  // ── Chão e rua estendidos ───────────────────────────────────────
  ground.add(box(600, 0.1, 600, 0, -0.2, 0), 0x2a2924);
  // Pedaços que faltam além da área jogável (a parte central já existe na garagem)
  for (const s of [-1, 1]) {
    const cx = s * (20 + (EXT - 20) / 2);
    ground.add(box(EXT - 20, 0.02, 7.5, cx, -0.11, z1 + 6.75, 2), 0x2c2c30); // asfalto
    ground.add(box(EXT - 15, 0.12, 2.9, s * (15 + (EXT - 15) / 2), -0.06, z1 + 1.45, 2), 0x9a958a); // calçada de cá
    ground.add(box(EXT - 20, 0.12, 2.6, cx, -0.04, z1 + 11.8, 2), 0x9a958a); // calçada de lá
    ground.add(box(EXT - 15, 0.16, 0.14, s * (15 + (EXT - 15) / 2), -0.02, nearCurb, 2), 0xa8a49a);
  }
  // Faixa amarela tracejada estendida
  for (let x = -EXT; x < EXT; x += 3) {
    if (Math.abs(x) < 19) continue;
    glow.add(box(1.6, 0.01, 0.12, x, -0.095, z1 + 6.75), 0xc8a030);
  }
  // Quarteirão de cada ponta (fecha a rua)
  for (const s of [-1, 1]) {
    const x = s * (EXT + 6);
    for (let k = 0; k < 4; k++) {
      const h = R(9, 18);
      const zc = z1 - 10 + k * 9;
      walls.add(box(12, h, 8.5, x, h / 2 - 0.1, zc), pickc(houseColors));
      for (let fy = 2; fy < h - 1; fy += 3) {
        for (let wz = zc - 3; wz <= zc + 3; wz += 2) (rng() < 0.45 ? litWin : darkWin).add(box(0.05, 1, 0.9, x - s * 6.03, fy, wz), 0xffffff);
      }
    }
  }

  // ── Casas ───────────────────────────────────────────────────────
  const house = (x, zFront, w, d, floors, facing) => {
    const h = floors * 3 + R(0.2, 0.8);
    const zc = zFront - facing * (d / 2);
    const color = pickc(houseColors);
    walls.add(box(w, h, d, x, h / 2 - 0.1, zc), color);
    // Telhado: laje com caixa d'água ou telhado de duas águas
    if (rng() < 0.55) {
      roofs.add(gableRoof(w + 0.5, d + 0.6, R(1.1, 1.8), x, h - 0.1, zc), pickc(roofColors));
    } else {
      walls.add(box(w + 0.1, 0.5, d + 0.1, x, h + 0.15, zc), color); // platibanda
      metal.add(new THREE.CylinderGeometry(0.55, 0.5, 0.9, 12).translate(x + R(-w / 4, w / 4), h + 0.8, zc), 0x3a7ad8);
    }
    // Janelas na fachada
    const fz = zFront + facing * 0.02;
    for (let f = 0; f < floors; f++) {
      const n = Math.max(1, Math.round(w / 2.6));
      for (let i = 0; i < n; i++) {
        const wx = x - w / 2 + ((i + 0.5) / n) * w;
        if (f === 0 && i === Math.floor(n / 2)) {
          darkWin.add(box(1.0, 2.1, 0.05, wx, 1.0, fz), 0x5a3a2a); // porta
          continue;
        }
        (rng() < 0.55 ? litWin : darkWin).add(box(1.0, 1.1, 0.05, wx, f * 3 + 1.6, fz), 0xffffff);
        walls.add(box(1.25, 0.12, 0.18, wx, f * 3 + 0.98, fz + facing * 0.06), 0xf2f2f2); // peitoril
      }
    }
    return h;
  };

  // Muro + portão na frente de cada lote
  const lotWall = (x, w, z, facing) => {
    const wallH = R(1.2, 1.9);
    const color = pickc([0xd8d0c0, 0xc8b8a0, 0xe0e0d8, 0xb8c8c0]);
    const gate = R(2.4, 3.2);
    const side = (w - gate) / 2;
    walls.add(box(side, wallH, 0.2, x - w / 2 + side / 2, wallH / 2 - 0.1, z), color);
    walls.add(box(side, wallH, 0.2, x + w / 2 - side / 2, wallH / 2 - 0.1, z), color);
    metal.add(box(gate, wallH + 0.2, 0.06, x, (wallH + 0.2) / 2 - 0.1, z + facing * 0.02), pickc([0x2a2a2a, 0x4a5a6a, 0x6a2a2a, 0x2a4a3a]));
  };

  // Lado da garagem: além das casas vizinhas já existentes (|x| > 14,2)
  for (const s of [-1, 1]) {
    let x = 14.6;
    while (x < EXT - 2) {
      const w = R(6, 9.5);
      const cx = s * (x + w / 2);
      const fr = z1 - R(1.8, 3.5);
      house(cx, fr, w, R(8, 11), rng() < 0.4 ? 2 : 1, 1);
      lotWall(cx, w, z1 - 0.1, 1);
      x += w + 0.25;
    }
  }
  // Lado de lá da rua (casas viradas pra garagem)
  {
    let x = -EXT;
    while (x < EXT) {
      const w = R(5.5, 9);
      const cx = x + w / 2;
      house(cx, farLot + R(1.5, 3), w, R(7, 10), rng() < 0.45 ? 2 : 1, -1);
      lotWall(cx, w, farLot, -1);
      x += w + 0.25;
    }
  }
  // Segunda fileira: prédios mais altos atrás das casas da frente
  {
    let x = -EXT - 10;
    while (x < EXT + 10) {
      const w = R(8, 16);
      const floors = Math.floor(R(3, 9));
      const h = floors * 3;
      const zc = farLot + R(17, 24);
      walls.add(box(w, h, 10, x + w / 2, h / 2 - 0.1, zc), pickc(houseColors));
      for (let f = 0; f < floors; f++) {
        for (let wx = x + 1.2; wx < x + w - 1; wx += 2.2) (rng() < 0.4 ? litWin : darkWin).add(box(1.1, 1.2, 0.05, wx + 0.5, f * 3 + 1.6, zc - 5.03), 0xffffff);
      }
      x += w + R(1, 4);
    }
  }
  // E atrás da garagem: os fundos das casas (aparecem por cima dos telhados)
  {
    let x = -EXT;
    while (x < EXT) {
      const w = R(7, 12);
      const floors = Math.floor(R(1, 4));
      const h = floors * 3 + 0.5;
      walls.add(box(w, h, 9, x + w / 2, h / 2 - 0.1, z1 - R(20, 26)), pickc(houseColors));
      if (rng() < 0.5) roofs.add(gableRoof(w + 0.4, 9.5, 1.5, x + w / 2, h - 0.1, z1 - 23), pickc(roofColors));
      x += w + R(0.3, 2);
    }
  }

  // ── Árvores (ipês e mangueiras), postes e carros ────────────────
  const tree = (x, z) => {
    const h = R(2.4, 3.6);
    foliage.add(new THREE.CylinderGeometry(0.1, 0.16, h, 7).translate(x, h / 2 - 0.1, z), 0x5a3e2a);
    const col = rng() < 0.3 ? pickc([0xff7ab8, 0xffd23a, 0xd090ff]) : pickc([0x3a7a3a, 0x4a8a3a, 0x2f6a34]);
    for (let k = 0; k < 3; k++) {
      const r = R(0.9, 1.4);
      foliage.add(new THREE.SphereGeometry(r, 8, 6).translate(x + R(-0.6, 0.6), h + R(0.1, 0.8), z + R(-0.6, 0.6)), col);
    }
  };
  for (let x = -EXT + 4; x < EXT; x += R(9, 16)) {
    if (Math.abs(x) > 12) tree(x, z1 + 2.4);
    tree(x + R(-3, 3), z1 + 12.4);
  }
  for (let x = -EXT + 8; x < EXT; x += 18) {
    for (const [z, armDir] of [[nearCurb - 0.3, 1], [farCurb + 0.3, -1]]) {
      if (Math.abs(x - 8) < 3 || Math.abs(x + 8) < 3) continue; // os postes de verdade já existem
      metal.add(new THREE.CylinderGeometry(0.06, 0.09, 5.5, 8).translate(x, 2.65, z), 0x5a5a5a);
      glow.add(box(0.3, 0.1, 0.5, x, 5.25, z + armDir * 0.9), 0xffd29a);
    }
  }
  const car = (x, z, rot) => {
    const col = pickc([0xd83a3a, 0xf0f0f0, 0x2a2a2a, 0x3a6ad8, 0xc8c8c8, 0xe8c040, 0x2a8a5a]);
    const g = [];
    const body = new RoundedBoxGeometry(4.0, 0.75, 1.75, 2, 0.2);
    body.translate(0, 0.62, 0);
    g.push([body, col]);
    const cab = new RoundedBoxGeometry(2.1, 0.6, 1.6, 2, 0.18);
    cab.translate(-0.2, 1.2, 0);
    g.push([cab, 0x1a2230]);
    for (const [wx, wz] of [[-1.3, 0.85], [1.3, 0.85], [-1.3, -0.85], [1.3, -0.85]]) {
      const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12);
      w.rotateX(Math.PI / 2);
      w.translate(wx, 0.33, wz);
      g.push([w, 0x111111]);
    }
    for (const [geo, c] of g) {
      geo.rotateY(rot);
      geo.translate(x, -0.1, z);
      cars.add(geo, c);
    }
  };
  for (let x = -EXT + 10; x < EXT - 10; x += R(10, 22)) {
    if (Math.abs(x) < 10) continue;
    if (rng() < 0.6) car(x, nearCurb + 1.2, rng() < 0.5 ? 0 : Math.PI);
    if (rng() < 0.6) car(x + R(-4, 4), farCurb - 1.2, rng() < 0.5 ? 0 : Math.PI);
  }

  // ── Materiais e malhas mescladas ────────────────────────────────
  const wallMat = new THREE.MeshStandardMaterial({ ...opts.wallTex, vertexColors: true, roughness: 0.95 });
  const add = (b, mat, o) => {
    const m = b.mesh(mat, o);
    if (m) group.add(m);
    return m;
  };
  add(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  add(walls, wallMat);
  add(roofs, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  add(litWin, new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb860, emissiveIntensity: 1.3, roughness: 0.4 }));
  add(darkWin, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2a3550, roughness: 0.2, metalness: 0.4 }));
  add(metal, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
  add(foliage, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  add(glow, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffd29a, emissiveIntensity: 0.6, roughness: 0.5 }));
  add(cars, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 }));

  // ── Morro com luzinhas e horizonte da cidade ─────────────────────
  const far = new THREE.Group();
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x241a30, fog: false });
  const lightsPos = [];
  const hills = [
    [-150, 175, 85, 38, 50],
    [40, 205, 110, 48, 60],
    [190, 150, 80, 30, 50],
    [-60, -190, 120, 40, 60],
    [170, -140, 90, 34, 50],
  ];
  for (const [hx, hz, rx, ry, rz] of hills) {
    const geo = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setY(i, y * (1 + Math.sin(p.getX(i) * 9) * 0.06 + Math.cos(p.getZ(i) * 7) * 0.05));
    }
    geo.computeVertexNormals();
    const h = new THREE.Mesh(geo, hillMat);
    h.position.set(hx, -4, hz);
    h.scale.set(rx, ry, rz);
    far.add(h);
    // Casinhas acesas no morro (pontos quentes)
    for (let k = 0; k < 260; k++) {
      const a = rng() * Math.PI * 2;
      const e = Math.pow(rng(), 0.7) * 0.85;
      const lx = hx + Math.cos(a) * rx * e;
      const lz = hz + Math.sin(a) * rz * e;
      const ly = -4 + ry * Math.sqrt(Math.max(0, 1 - e * e)) * 0.98;
      lightsPos.push(lx, ly + 0.3, lz);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lightsPos, 3));
  far.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffc070, size: 1.1, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 })));
  // Três camadas de prédios no horizonte
  const layers = [
    [230, 70, '#2c2340', '#ffcf80', 0.08, 0.55, 9],
    [300, 90, '#3b2d4e', '#ffd9a0', 0.05, 0.7, 13],
    [370, 110, '#4a3a5c', '#ffe0b0', 0.03, 0.85, 17],
  ];
  for (const [r, h, col, win, dens, maxH, seed] of layers) {
    const mat = new THREE.MeshBasicMaterial({ map: skylineTexture(seed, col, win, dens, maxH), transparent: true, fog: false, side: THREE.BackSide, depthWrite: false });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72, 1, true), mat);
    cyl.position.y = h / 2 - 6;
    cyl.renderOrder = -5;
    far.add(cyl);
  }
  group.add(far);
  group.userData.far = far;
  return group;
}
