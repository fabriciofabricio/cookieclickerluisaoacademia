import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { labelTexture } from '../render/ProceduralTextures.js';

// Fábrica de props procedurais (equipamentos improvisados da garagem etc.).
// Tudo com materiais PBR; quando houver .glb correspondente, ele substitui.

export const M = {
  plasticWhite: () => new THREE.MeshPhysicalMaterial({ color: 0xf3f3ef, roughness: 0.35, clearcoat: 0.3 }),
  plasticBlue: () => new THREE.MeshPhysicalMaterial({ color: 0x4f8fd6, roughness: 0.15, transmission: 0.55, thickness: 0.05, transparent: true, opacity: 0.85 }),
  water: () => new THREE.MeshPhysicalMaterial({ color: 0x7fc4ff, roughness: 0.05, transmission: 0.8, thickness: 0.2, transparent: true, opacity: 0.7 }),
  metal: (rough = 0.35, color = 0x9aa0a8) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.18, emissive: 0x3a2400, emissiveIntensity: 0.4 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.92 }),
  sand: () => new THREE.MeshStandardMaterial({ color: 0xd9bc84, roughness: 1 }),
  paper: (color = 0xcdb98e) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  cloth: (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }),
  emissive: (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
};

export const rbox = (w, h, d, r = 0.02, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));

export function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}

export function plasticChair(color = 0xf3f3ef) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.3 });
  mesh(rbox(0.44, 0.04, 0.42, 0.015), mat, 0, 0.45, 0, g);
  const back = mesh(rbox(0.42, 0.42, 0.035, 0.015), mat, 0, 0.7, -0.2, g);
  back.rotation.x = -0.12;
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.45, 8), mat, x, 0.225, z, g);
    leg.rotation.z = x > 0 ? -0.06 : 0.06;
  }
  for (const x of [-0.21, 0.21]) mesh(rbox(0.03, 0.03, 0.36, 0.01), mat, x, 0.62, -0.02, g);
  return g;
}

export function waterJug(big = false) {
  const g = new THREE.Group();
  const s = big ? 1.35 : 1;
  const body = mesh(rbox(0.16 * s, 0.24 * s, 0.13 * s, 0.04 * s), M.plasticBlue(), 0, 0.12 * s, 0, g);
  body.castShadow = true;
  mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.05 * s, 12), M.plasticBlue(), 0, 0.26 * s, 0, g);
  mesh(new THREE.CylinderGeometry(0.028 * s, 0.028 * s, 0.02 * s, 12), new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.4 }), 0, 0.29 * s, 0, g);
  const handle = mesh(new THREE.TorusGeometry(0.04 * s, 0.01 * s, 6, 14, Math.PI), M.plasticBlue(), 0, 0.24 * s, 0, g);
  handle.rotation.y = Math.PI / 2;
  return g;
}

export function sandBucket(color = 0x2f7ad8) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.2, side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 20, 1, true), mat, 0, 0.13, 0, g);
  mesh(new THREE.CircleGeometry(0.1, 20), mat, 0, 0.002, 0, g).rotation.x = -Math.PI / 2;
  const sand = mesh(new THREE.SphereGeometry(0.125, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.sand(), 0, 0.2, 0, g);
  sand.scale.y = 0.35;
  sand.name = 'sand';
  const handle = mesh(new THREE.TorusGeometry(0.13, 0.006, 6, 20, Math.PI), M.metal(0.4), 0, 0.26, 0, g);
  handle.name = 'handle';
  return g;
}

export function cementBag() {
  const g = new THREE.Group();
  const tex = labelTexture((ctx, w, h) => {
    ctx.fillStyle = '#b8a37a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8a1f1f';
    ctx.font = `900 ${w * 0.16}px Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('CIMENTO', w / 2, h * 0.45);
    ctx.font = `700 ${w * 0.11}px sans-serif`;
    ctx.fillStyle = '#333';
    ctx.fillText('50 kg', w / 2, h * 0.68);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const b = mesh(rbox(0.55, 0.14, 0.36, 0.06, 4), mat, 0, 0, 0, g);
  b.scale.set(1, 1, 1);
  return g;
}

export function cardboard() {
  const tex = labelTexture((ctx, w, h) => {
    ctx.fillStyle = '#a07a4a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 4) {
      ctx.fillStyle = i % 8 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(i, 0, 2, h);
    }
    ctx.fillStyle = 'rgba(30,30,30,0.65)';
    ctx.font = `900 ${w * 0.1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('FRÁGIL ▲ ESTE LADO P/ CIMA', 0, 0);
    ctx.restore();
  }, 256, 512);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.012, 1.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

export function towel(color = 0xd84a4a) {
  const m = new THREE.Mesh(rbox(0.5, 0.02, 0.9, 0.008), M.cloth(color));
  m.receiveShadow = true;
  return m;
}

export function weightPlate(radius = 0.2, rusty = true, color) {
  const mat = rusty ? new THREE.MeshStandardMaterial({ color: color ?? 0x5a3a28, metalness: 0.7, roughness: 0.75 }) : M.metal(0.3, color ?? 0x222222);
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(radius, radius, 0.035, 28), mat, 0, 0, 0, g);
  mesh(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, 0.04, 14), M.metal(0.5, 0x333333), 0, 0, 0, g);
  return g;
}

export function dumbbell(len = 0.34, color = 0x444444) {
  const g = new THREE.Group();
  const bar = mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 10), M.metal(0.3), 0, 0, 0, g);
  bar.rotation.z = Math.PI / 2;
  for (const x of [-len / 2 + 0.04, len / 2 - 0.04]) {
    const p = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.6 }), x, 0, 0, g);
    p.rotation.z = Math.PI / 2;
  }
  return g;
}

/** Halter de concreto: lata de tinta + cabo de vassoura. */
export function concreteDumbbell() {
  const g = new THREE.Group();
  const conc = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.95 });
  const can = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.8, roughness: 0.4 });
  const stick = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.8 }), 0, 0, 0, g);
  stick.rotation.z = Math.PI / 2;
  for (const x of [-0.24, 0.24]) {
    const c = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16, 1, true), can, x, 0, 0, g);
    c.rotation.z = Math.PI / 2;
    const f = mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.115, 16), conc, x, 0, 0, g);
    f.rotation.z = Math.PI / 2;
  }
  return g;
}

export function tire() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 14, 28), M.rubber());
  m.rotation.x = Math.PI / 2;
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function oldRadio() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4024, roughness: 0.55 });
  mesh(rbox(0.42, 0.24, 0.16, 0.03), wood, 0, 0.12, 0, g);
  const grill = labelTexture((ctx, w, h) => {
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4a3e34';
    for (let y = 6; y < h; y += 10) for (let x = 6; x < w; x += 10) ctx.fillRect(x, y, 5, 5);
  }, 128, 128);
  mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshStandardMaterial({ map: grill, roughness: 0.8 }), -0.09, 0.12, 0.081, g);
  const dial = mesh(new THREE.PlaneGeometry(0.15, 0.05), M.emissive(0xffa040, 1.6), 0.1, 0.16, 0.081, g);
  dial.name = 'dial';
  for (const x of [0.06, 0.14]) {
    const k = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), M.metal(0.3, 0xcccccc), x, 0.07, 0.085, g);
    k.rotation.x = Math.PI / 2;
  }
  const ant = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.45, 6), M.chrome(), 0.15, 0.45, -0.03, g);
  ant.rotation.z = -0.5;
  return g;
}

export function boombox() {
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: 0x1a1a22, roughness: 0.35, clearcoat: 0.6 });
  mesh(rbox(0.5, 0.26, 0.16, 0.04), body, 0, 0.13, 0, g);
  const cones = [];
  for (const x of [-0.15, 0.15]) {
    const c = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.02, 20), M.metal(0.5, 0x333333), x, 0.13, 0.085, g);
    c.rotation.x = Math.PI / 2;
    const ring = mesh(new THREE.TorusGeometry(0.085, 0.008, 6, 24), M.emissive(0x3ad6ff, 2.5), x, 0.13, 0.085, g);
    cones.push(c, ring);
  }
  g.userData.cones = cones;
  return g;
}

export function blender() {
  const g = new THREE.Group();
  mesh(rbox(0.16, 0.12, 0.16, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xe8e8e8, roughness: 0.3, clearcoat: 0.5 }), 0, 0.06, 0, g);
  const jar = mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.22, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.85, roughness: 0.05, thickness: 0.02, transparent: true }), 0, 0.23, 0, g);
  jar.castShadow = false;
  const shake = mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.13, 16), new THREE.MeshStandardMaterial({ color: 0xf3df9a, roughness: 0.6 }), 0, 0.19, 0, g);
  shake.name = 'shake';
  // Cacho de banana
  const ban = new THREE.MeshStandardMaterial({ color: 0xf2cf3a, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 12, Math.PI * 0.6), ban, 0.17, 0.02 + i * 0.004, -0.02 + i * 0.025, g);
    b.rotation.set(Math.PI / 2, 0, i * 0.15);
  }
  return g;
}

export function goldenShake() {
  const g = new THREE.Group();
  const cup = mesh(new THREE.CylinderGeometry(0.11, 0.075, 0.28, 24), M.gold(), 0, 0.14, 0, g);
  cup.material.emissive = new THREE.Color(0xffa000);
  cup.material.emissiveIntensity = 0.6;
  const cream = mesh(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffd080, emissiveIntensity: 0.5, roughness: 0.5 }), 0, 0.28, 0, g);
  cream.scale.y = 0.7;
  const straw = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 8), M.emissive(0xff4f7b, 1.2), 0.03, 0.4, 0, g);
  straw.rotation.z = -0.25;
  const light = new THREE.PointLight(0xffc040, 4, 3.5, 2);
  light.position.y = 0.3;
  g.add(light);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 40), M.emissive(0xffd34d, 3));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.02;
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

/** Lata de energético: neon verde-limão com raio, pra não confundir com o Shake dourado. */
export function energyDrink() {
  const g = new THREE.Group();
  const can = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x1b2a22, metalness: 0.9, roughness: 0.25, emissive: 0x1fe04a, emissiveIntensity: 0.35 }), 0, 0.18, 0, g);
  can.name = 'can';
  const label = labelTexture((ctx, w, h) => {
    ctx.fillStyle = '#10241a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b6ff3a';
    ctx.beginPath();
    ctx.moveTo(w * 0.56, h * 0.08);
    ctx.lineTo(w * 0.3, h * 0.55);
    ctx.lineTo(w * 0.5, h * 0.55);
    ctx.lineTo(w * 0.4, h * 0.94);
    ctx.lineTo(w * 0.72, h * 0.4);
    ctx.lineTo(w * 0.52, h * 0.4);
    ctx.closePath();
    ctx.fill();
  }, 128, 128);
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0615, 0.0615, 0.14, 24, 1, true), new THREE.MeshStandardMaterial({ map: label, emissiveMap: label, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4, side: THREE.DoubleSide }));
  lab.position.y = 0.18;
  g.add(lab);
  mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.02, 24), M.metal(0.2, 0xc8d0d8), 0, 0.295, 0, g);
  mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.02, 24), M.metal(0.2, 0xc8d0d8), 0, 0.075, 0, g);
  const light = new THREE.PointLight(0x4dff6a, 3.2, 3, 2);
  light.position.y = 0.3;
  g.add(light);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), M.emissive(0x7dff4d, 3));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.02;
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

export function trafficCone() {
  const g = new THREE.Group();
  mesh(new THREE.ConeGeometry(0.12, 0.42, 18), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5 }), 0, 0.23, 0, g);
  mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 18), M.emissive(0xffffff, 0.3), 0, 0.2, 0, g);
  mesh(rbox(0.3, 0.03, 0.3, 0.01), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5 }), 0, 0.015, 0, g);
  return g;
}

export function stool() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.7 });
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), wood, 0, 0.5, 0, g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 8), wood, Math.cos(a) * 0.12, 0.25, Math.sin(a) * 0.12, g);
    l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  return g;
}

export function bunting(from, to, sag = 0.3, count = 16) {
  // Bandeirinhas de festa junina
  const g = new THREE.Group();
  const colors = [0xff4f4f, 0xffd34d, 0x4fb3ff, 0x7dff8a, 0xff8fd0, 0xffffff];
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.004, 4), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  g.add(line);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.07, 0, 0, 0, -0.16, 0], 3));
  tri.computeVertexNormals();
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = curve.getPoint(t);
    const m = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.8 }));
    m.position.copy(p);
    const tan = curve.getTangent(t);
    m.rotation.y = Math.atan2(-tan.z, tan.x);
    m.userData.sway = Math.random() * 6;
    g.add(m);
  }
  return g;
}

export function poster(draw, w = 0.6, h = 0.8) {
  const tex = labelTexture(draw, 256, Math.round((256 * h) / w));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  m.receiveShadow = true;
  return m;
}
