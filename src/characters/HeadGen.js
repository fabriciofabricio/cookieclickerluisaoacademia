import * as THREE from 'three';
import { smoothstep, clamp } from '../core/utils.js';
import { faceMap, hairMaps, irisMap, skinNormal } from './CharTextures.js';

// ════════════════════════════════════════════════════════════════
//  Cabeça esculpida: uma malha só (crânio, mandíbula, maçãs do rosto,
//  órbitas, nariz, lábios, queixo) parametrizada em (θ, φ) — o mesmo
//  espaço usado pra pintar o rosto. Olhos com íris e pálpebras, orelhas,
//  boca que abre na fala e cabelo modelado com linha de cabelo.
// ════════════════════════════════════════════════════════════════

export const HEAD_CENTER = new THREE.Vector3(0, 0.1, 0.012);
const DIMS = { m: [0.077, 0.112, 0.098], f: [0.072, 0.106, 0.094] };

const g2 = (th, ph, t0, p0, st, sp) => Math.exp(-(((th - t0) / st) ** 2) - (((ph - p0) / sp) ** 2));

// Traços do rosto: [θ, φ, σθ, σφ, amplitude masculina, amplitude feminina]
const FEATURES = [
  [0.4, 1.5, 0.16, 0.1, -0.0105, -0.0095], // órbitas
  [-0.4, 1.5, 0.16, 0.1, -0.0105, -0.0095],
  [0.36, 1.3, 0.28, 0.07, 0.0042, 0.0018], // arco das sobrancelhas
  [-0.36, 1.3, 0.28, 0.07, 0.0042, 0.0018],
  [0, 1.56, 0.06, 0.17, 0.011, 0.008], // dorso do nariz
  [0, 1.8, 0.085, 0.07, 0.021, 0.016], // ponta do nariz
  [0.13, 1.83, 0.06, 0.05, 0.008, 0.006], // asas do nariz
  [-0.13, 1.83, 0.06, 0.05, 0.008, 0.006],
  [0.75, 1.62, 0.22, 0.12, 0.0055, 0.0065], // maçãs do rosto
  [-0.75, 1.62, 0.22, 0.12, 0.0055, 0.0065],
  [0, 2.02, 0.2, 0.048, 0.0065, 0.0075], // lábio superior
  [0, 2.078, 0.18, 0.017, -0.005, -0.005], // linha da boca
  [0, 2.135, 0.17, 0.05, 0.0068, 0.0085], // lábio inferior
  [0, 2.43, 0.19, 0.12, 0.0105, 0.0075], // queixo
  [1.1, 1.35, 0.2, 0.15, -0.004, -0.003], // têmporas
  [-1.1, 1.35, 0.2, 0.15, -0.004, -0.003],
];

const _d = new THREE.Vector3();

/** Superfície da cabeça (relativa ao centro). features=false → só crânio (pro cabelo). */
export function headSurface(female, th, ph, features = true, out = new THREE.Vector3()) {
  const [rx, ry, rz] = female ? DIMS.f : DIMS.m;
  const sp = Math.sin(ph);
  const dx = sp * Math.sin(th);
  const dy = Math.cos(ph);
  const dz = sp * Math.cos(th);
  // Crânio maior atrás e em cima
  const crown = 1 + 0.06 * Math.max(0, -dz) * smoothstep(-0.3, 0.4, dy) + 0.02 * Math.max(0, dy);
  let x = dx * rx * crown;
  let y = dy * ry * crown;
  let z = dz * rz * crown;
  // Mandíbula: estreita embaixo, pescoço por trás
  const k = smoothstep(1.78, 2.75, ph);
  x *= 1 - (female ? 0.34 : 0.26) * k;
  if (dz < 0) z *= 1 - 0.42 * smoothstep(1.85, 2.6, ph);
  else z += (female ? 0.005 : 0.009) * k * dz;
  if (features) {
    let a = 0;
    for (const f of FEATURES) {
      const amp = female ? f[5] : f[4];
      a += amp * g2(th, ph, f[0], f[1], f[2], f[3]);
    }
    _d.set(dx, dy, dz).normalize();
    x += _d.x * a;
    y += _d.y * a;
    z += _d.z * a;
  }
  return out.set(x, y, z);
}

function sphereGrid(nU, nV, fn) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((nU + 1) * (nV + 1) * 3);
  const uv = new Float32Array((nU + 1) * (nV + 1) * 2);
  const v3 = new THREE.Vector3();
  for (let i = 0; i <= nV; i++) {
    for (let j = 0; j <= nU; j++) {
      const k = i * (nU + 1) + j;
      fn(j / nU, i / nV, v3);
      pos[k * 3] = v3.x;
      pos[k * 3 + 1] = v3.y;
      pos[k * 3 + 2] = v3.z;
      uv[k * 2] = j / nU;
      uv[k * 2 + 1] = 1 - i / nV;
    }
  }
  const idx = [];
  for (let i = 0; i < nV; i++) {
    for (let j = 0; j < nU; j++) {
      const a = i * (nU + 1) + j;
      const b = a + nU + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const n = g.attributes.normal.array;
  for (let i = 0; i <= nV; i++) {
    const a = i * (nU + 1) * 3;
    const b = (i * (nU + 1) + nU) * 3;
    for (let c = 0; c < 3; c++) n[a + c] = n[b + c] = (n[a + c] + n[b + c]) / 2;
  }
  return g;
}

/**
 * Monta a cabeça completa.
 * o: { female, skin, eyeColor, hairColor, hairStyle, brow, lips, stubble, freckles, makeup, glasses, cap, mustache }
 */
export function buildHead(o) {
  const group = new THREE.Group();
  group.position.copy(HEAD_CENTER);
  const female = !!o.female;
  const normal = skinNormal();
  normal.repeat.set(6, 3);
  const faceMat = new THREE.MeshPhysicalMaterial({
    map: faceMap({ skin: o.skin, brow: o.brow ?? o.hairColor, lips: o.lips ?? (female ? 0xc0606a : 0xb07068), female, stubble: o.stubble, freckles: o.freckles, makeup: o.makeup }),
    normalMap: normal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.48,
    sheen: 0.55,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xff8a70),
    clearcoat: 0.08,
    clearcoatRoughness: 0.45,
  });
  const head = new THREE.Mesh(sphereGrid(96, 72, (u, v, out) => headSurface(female, -Math.PI + u * Math.PI * 2, v * Math.PI, true, out)), faceMat);
  head.castShadow = head.receiveShadow = true;
  group.add(head);

  // Ponto entre os olhos (pra olhar/câmera)
  const eyeAnchor = new THREE.Object3D();
  const s0 = headSurface(female, 0, 1.5, true);
  eyeAnchor.position.set(0, s0.y, s0.z);
  group.add(eyeAnchor);

  // Olhos
  const eyeR = 0.0118;
  const irisTex = irisMap(o.eyeColor ?? 0x4a3020);
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lidMat = new THREE.MeshPhysicalMaterial({ color: o.skin, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xff8a70) });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.6 });
  const eyes = [];
  for (const s of [1, -1]) {
    const surf = headSurface(female, s * 0.4, 1.5, true);
    const n = surf.clone().normalize();
    const c = surf.clone().addScaledVector(n, -eyeR * 0.5);
    const holder = new THREE.Group();
    holder.position.copy(c);
    group.add(holder);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 28, 18), eyeMat);
    ball.rotation.y = -Math.PI / 2;
    const ballPivot = new THREE.Group();
    ballPivot.add(ball);
    holder.add(ballPivot);
    // Pálpebras
    const up = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.13, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat);
    holder.add(up);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.14, female ? 0.0011 : 0.0007, 4, 24, Math.PI), lashMat);
    lash.rotation.x = Math.PI / 2;
    up.add(lash);
    const low = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 24, 6, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32), lidMat);
    low.rotation.x = 0.15;
    holder.add(low);
    eyes.push({ holder, ballPivot, up });
  }

  // Boca (abre na fala) + dentes
  const ms = headSurface(female, 0, 2.078, true);
  const mn = ms.clone().normalize();
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshStandardMaterial({ color: 0x2a0d0d, roughness: 0.8 }));
  mouth.position.copy(ms).addScaledVector(mn, -0.0015);
  mouth.scale.set(female ? 0.017 : 0.019, 0.0016, 0.005);
  group.add(mouth);
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.004), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3 }));
  teeth.position.copy(ms).addScaledVector(mn, -0.004).add(new THREE.Vector3(0, 0.002, 0));
  teeth.visible = false;
  group.add(teeth);
  if (o.braces) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0018, 0.002), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 }));
    br.position.copy(teeth.position).add(new THREE.Vector3(0, 0, 0.0025));
    teeth.add(br);
    br.position.set(0, 0, 0.0025);
  }

  // Orelhas
  for (const s of [1, -1]) {
    const p = headSurface(female, s * Math.PI * 0.5, 1.62, false);
    const ear = new THREE.Group();
    ear.position.copy(p).add(new THREE.Vector3(s * 0.002, 0, -0.004));
    ear.rotation.y = s * -0.35;
    group.add(ear);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), lidMat);
    shell.scale.set(0.006, female ? 0.026 : 0.029, 0.017);
    shell.castShadow = true;
    ear.add(shell);
    const helix = new THREE.Mesh(new THREE.TorusGeometry(female ? 0.0155 : 0.017, 0.0035, 6, 18, Math.PI * 1.35), lidMat);
    helix.rotation.set(0, Math.PI / 2, -Math.PI * 0.62);
    helix.position.x = s * 0.003;
    helix.scale.set(1, 1.15, 0.85);
    ear.add(helix);
  }

  // Bigode
  if (o.mustache) {
    const { map, normalMap } = hairMaps(o.hairColor);
    const mm = new THREE.MeshPhysicalMaterial({ map, normalMap, roughness: 0.55, sheen: 0.5 });
    const p = headSurface(female, 0, 1.97, true);
    const must = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mm);
    must.position.copy(p).add(new THREE.Vector3(0, -0.002, 0.004));
    must.scale.set(0.03, 0.008, 0.012);
    must.castShadow = true;
    group.add(must);
  }

  if (o.glasses) group.add(buildGlasses(eyes, female));
  const hair = buildHair(o, female);
  if (hair) group.add(hair.group);
  if (o.cap) group.add(buildCap(o.cap, female));

  return {
    group,
    head,
    eyes,
    mouth,
    teeth,
    eyeAnchor,
    hair,
    faceMat,
    setMouth(open) {
      mouth.scale.y = 0.0016 + open * 0.0075;
      teeth.visible = open > 0.35;
    },
    setBlink(closed, lookYaw = 0, lookPitch = 0) {
      for (const e of eyes) {
        e.up.rotation.x = -0.32 + closed * 1.25 + Math.max(0, lookPitch) * 0.3;
        e.ballPivot.rotation.y = clamp(lookYaw, -0.45, 0.45);
        e.ballPivot.rotation.x = clamp(lookPitch, -0.3, 0.3);
      }
    },
  };
}

function buildGlasses(eyes, female) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.35, metalness: 0.2 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.22, clearcoat: 1 });
  for (const e of eyes) {
    const p = e.holder.position.clone().add(new THREE.Vector3(0, 0.001, 0.017));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0028, 8, 24), frame);
    ring.position.copy(p);
    g.add(ring);
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.019, 20), lens);
    l.position.copy(p);
    g.add(l);
    const s = Math.sign(p.x);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), frame);
    arm.position.set(p.x + s * 0.042, p.y + 0.003, p.z - 0.05);
    arm.rotation.y = s * 0.12;
    g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), frame);
  bridge.position.set(0, eyes[0].holder.position.y + 0.005, eyes[0].holder.position.z + 0.02);
  g.add(bridge);
  void female;
  return g;
}

function buildCap(color, female) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const dome = new THREE.Mesh(
    sphereGrid(48, 16, (u, v, out) => {
      const th = -Math.PI + u * Math.PI * 2;
      const ph = v * 1.2;
      headSurface(female, th, ph, false, out);
      out.multiplyScalar(1.12);
    }),
    m,
  );
  dome.castShadow = true;
  g.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 24, 1, false, -Math.PI / 2, Math.PI), m);
  brim.position.set(0, 0.035, -0.1);
  brim.rotation.set(-0.15, Math.PI, 0);
  brim.scale.set(1, 1, 0.9);
  g.add(brim);
  return g;
}

// ── Cabelo ───────────────────────────────────────────────────────────
const STYLES = {
  blond: { front: 0.95, side: 1.3, back: 2.0, thick: 0.011, quiff: 0.024, clump: 0.003 },
  short: { front: 0.93, side: 1.3, back: 1.95, thick: 0.007, quiff: 0.006, clump: 0.002 },
  grey: { front: 1.2, side: 1.4, back: 1.95, thick: 0.006, crown: 1.0, clump: 0.002 },
  long: { front: 0.9, side: 1.22, back: 1.85, thick: 0.013, drop: 0.33, clump: 0.004, part: true },
  longStraight: { front: 0.88, side: 1.2, back: 1.85, thick: 0.012, drop: 0.36, clump: 0.003, part: true },
  curly: { front: 0.85, side: 1.18, back: 1.8, thick: 0.03, drop: 0.26, clump: 0.012, curly: true },
  bun: { front: 0.9, side: 1.32, back: 2.0, thick: 0.008, clump: 0.002, bun: true },
  ponytail: { front: 0.9, side: 1.32, back: 1.95, thick: 0.008, clump: 0.002, tail: true },
};

function buildHair(o, female) {
  const st = STYLES[o.hairStyle];
  if (!st) return null;
  const { map, normalMap } = hairMaps(o.hairColor);
  map.repeat.set(3, 1);
  normalMap.repeat.set(3, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.42,
    sheen: 0.9,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(o.hairColor).lerp(new THREE.Color(0xffffff), 0.35),
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  const NU = 72;
  const NC = 22;
  const ND = st.drop ? 26 : 0;
  const rows = NC + ND;
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const phiMax = (th) => {
    const a = Math.abs(th);
    return st.front + (st.side - st.front) * smoothstep(0, Math.PI / 2, a) + (st.back - st.side) * smoothstep(Math.PI / 2, Math.PI, a);
  };
  const phiMin = (th) => (st.crown ? st.crown - 0.25 * smoothstep(Math.PI * 0.6, Math.PI, Math.abs(th)) : 0);
  const dropLen = (th) => {
    if (!st.drop) return 0;
    const a = Math.abs(th);
    return st.drop * smoothstep(0.85, 1.5, a) * (1 + 0.1 * Math.sin(th * 13) + 0.06 * Math.sin(th * 29));
  };
  const geo = new THREE.BufferGeometry();
  const count = (NU + 1) * (rows + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const swayW = new Float32Array(count);
  for (let j = 0; j <= NU; j++) {
    const th = -Math.PI + (j / NU) * Math.PI * 2;
    const p0 = phiMin(th);
    const p1 = phiMax(th);
    const L = dropLen(th);
    const lrel = st.drop ? L / st.drop : 0;
    let edge = null;
    for (let i = 0; i <= rows; i++) {
      const k = i * (NU + 1) + j;
      if (i <= NC) {
        const v = i / NC;
        const ph = p0 + (p1 - p0) * v;
        headSurface(female, th, ph, false, tmp);
        nrm.copy(tmp).normalize();
        let thick = st.thick;
        // Afina na linha do cabelo (onde não continua em mecha)
        thick *= 1 - (1 - lrel) * smoothstep(0.75, 1, v) * 0.92;
        if (st.crown) thick *= smoothstep(0, 0.2, v);
        if (st.quiff) thick += st.quiff * g2(th, ph, 0.12, 0.62, 0.55, 0.32);
        if (st.part) thick += 0.004 * g2(th, ph, 0.5, 0.5, 0.6, 0.35) - 0.003 * g2(th, ph, 0.2, 0.5, 0.05, 0.4);
        thick += st.clump * (Math.sin(th * 23 + ph * 9) * 0.5 + Math.sin(th * 41 - ph * 17) * 0.5);
        if (st.curly) thick += 0.008 * Math.sin(th * 30) * Math.sin(ph * 25);
        tmp.addScaledVector(nrm, Math.max(0.0015, thick + 0.0015));
        if (i === NC) edge = tmp.clone();
        pos[k * 3] = tmp.x;
        pos[k * 3 + 1] = tmp.y;
        pos[k * 3 + 2] = tmp.z;
      } else {
        const s = (i - NC) / ND;
        const out = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
        const curl = st.curly ? Math.sin(s * 18 + th * 5) * 0.012 : 0;
        pos[k * 3] = edge.x + out.x * (0.004 + 0.035 * s * s + curl);
        pos[k * 3 + 1] = edge.y - L * s;
        pos[k * 3 + 2] = edge.z + out.z * (0.004 + 0.035 * s * s + curl) - 0.01 * s;
        swayW[k] = Math.pow(s, 1.5) * lrel;
      }
      uv[k * 2] = (j / NU) * 3;
      uv[k * 2 + 1] = 1 - i / rows;
    }
  }
  const idx = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < NU; j++) {
      const a = i * (NU + 1) + j;
      const b = a + NU + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  if (st.bun) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 16), mat);
    const p = headSurface(female, Math.PI, 0.6, false).multiplyScalar(1.08);
    bun.position.copy(p).add(new THREE.Vector3(0, 0.025, -0.012));
    bun.scale.set(1, 0.85, 0.9);
    bun.castShadow = true;
    group.add(bun);
  }
  let tail = null;
  if (st.tail) {
    tail = new THREE.Group();
    const p = headSurface(female, Math.PI, 1.15, false).multiplyScalar(1.1);
    tail.position.copy(p);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.06, -0.035), new THREE.Vector3(0, -0.18, -0.04), new THREE.Vector3(0, -0.3, -0.02)]);
    const tg = new THREE.TubeGeometry(curve, 24, 0.024, 12, false);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const taper = 1 - smoothstep(-0.05, -0.3, y) * 0.7;
      tp.setX(i, tp.getX(i) * taper);
      const zc = curve.getPoint(clamp(-y / 0.3, 0, 1)).z;
      tp.setZ(i, zc + (tp.getZ(i) - zc) * taper);
    }
    tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, mat);
    tm.castShadow = true;
    tail.add(tm);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 16), new THREE.MeshStandardMaterial({ color: 0xff4f7b, roughness: 0.5 }));
    tie.rotation.x = Math.PI / 2 - 0.4;
    tie.position.set(0, -0.012, -0.008);
    tail.add(tie);
    group.add(tail);
  }

  // Balanço do cabelo: mola simples, limitada (nunca "explode")
  const base = pos.slice();
  const state = { x: 0, z: 0, vx: 0, vz: 0, prev: null, prevV: new THREE.Vector3(), t: Math.random() * 10 };
  const wp = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return {
    group,
    update(dt, anchor) {
      if (dt <= 0 || (!ND && !tail)) return;
      state.t += dt;
      anchor.getWorldPosition(wp);
      if (!state.prev) state.prev = wp.clone();
      const vel = wp.clone().sub(state.prev).divideScalar(dt);
      const acc = vel.clone().sub(state.prevV).divideScalar(dt);
      state.prev.copy(wp);
      state.prevV.copy(vel);
      anchor.getWorldQuaternion(q);
      acc.applyQuaternion(q.invert()).clampLength(0, 25);
      const k = 60;
      const d = 9;
      const tx = clamp(-acc.x * 0.0018, -0.04, 0.04) + Math.sin(state.t * 1.3) * 0.003;
      const tz = clamp(-acc.z * 0.0018, -0.04, 0.04);
      state.vx += (k * (tx - state.x) - d * state.vx) * dt;
      state.vz += (k * (tz - state.z) - d * state.vz) * dt;
      state.x = clamp(state.x + state.vx * dt, -0.05, 0.05);
      state.z = clamp(state.z + state.vz * dt, -0.05, 0.05);
      if (ND) {
        for (let i = 0; i < count; i++) {
          const w = swayW[i];
          if (!w) continue;
          pos[i * 3] = base[i * 3] + state.x * w;
          pos[i * 3 + 2] = base[i * 3 + 2] + state.z * w;
        }
        geo.attributes.position.needsUpdate = true;
      }
      if (tail) {
        tail.rotation.z = -state.x * 6;
        tail.rotation.x = state.z * 6;
      }
    },
  };
}
