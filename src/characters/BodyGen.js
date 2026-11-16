import * as THREE from 'three';
import { smoothstep } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Corpo procedural CONTÍNUO: cada parte (tronco, braços, pernas e
//  roupas) é um "loft" de seções elípticas, deformado por perfis
//  anatômicos (peitoral, dorsais, deltoide, bíceps, tríceps, gomos do
//  abdômen, quadríceps, panturrilha) e preso ao esqueleto por skinning
//  suave — então o corpo dobra nas juntas sem emendas.
// ════════════════════════════════════════════════════════════════

/** Esqueleto em pose de descanso (metros, espaço do corpo, olhando pra +Z). */
export const SK = {
  hipY: 1.01,
  spine: 0.1,
  chest: 0.24,
  neck: 0.27,
  head: 0.07,
  clav: [0.04, 0.22, -0.015],
  armDrop: -0.02,
  upper: 0.29,
  fore: 0.26,
  thighX: 0.095,
  thighY: -0.04,
  L1: 0.46,
  L2: 0.44,
};
export const REST = {
  spineY: SK.hipY + SK.spine,
  chestY: SK.hipY + SK.spine + SK.chest,
  neckY: SK.hipY + SK.spine + SK.chest + SK.neck,
  headY: SK.hipY + SK.spine + SK.chest + SK.neck + SK.head,
  armY: SK.hipY + SK.spine + SK.chest + SK.clav[1] + SK.armDrop,
  thighY: SK.hipY + SK.thighY,
};
REST.elbowY = REST.armY - SK.upper;
REST.wristY = REST.elbowY - SK.fore;
REST.kneeY = REST.thighY - SK.L1;
REST.ankleY = REST.kneeY - SK.L2;

const bell = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (w * w));
const pos0 = (v) => (v > 0 ? v : 0);

/** Interpolação suave entre chaves [[x, a, b...], ...]. */
function keys(table, x, col) {
  if (x <= table[0][0]) return table[0][col];
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t);
      return a[col] + (b[col] - a[col]) * s;
    }
  }
  return table[table.length - 1][col];
}

const ellipse = (rx, rz, th) => {
  const s = Math.sin(th);
  const c = Math.cos(th);
  return (rx * rz) / Math.sqrt(rz * rz * s * s + rx * rx * c * c);
};

// ── Perfis base (magrelo) ───────────────────────────────────────────
// Tronco: [y relativo ao quadril, raio X, raio Z]
const TORSO_M = [
  [-0.155, 0.02, 0.02], [-0.14, 0.11, 0.08], [-0.1, 0.158, 0.106], [0.0, 0.156, 0.103], [0.11, 0.132, 0.092],
  [0.22, 0.14, 0.098], [0.33, 0.156, 0.108], [0.43, 0.166, 0.112], [0.505, 0.178, 0.1], [0.55, 0.15, 0.085],
  [0.58, 0.092, 0.068], [0.61, 0.057, 0.058], [0.7, 0.052, 0.055], [0.77, 0.045, 0.05],
];
const TORSO_F = [
  [-0.155, 0.02, 0.02], [-0.14, 0.13, 0.085], [-0.1, 0.18, 0.11], [0.0, 0.174, 0.106], [0.11, 0.122, 0.087],
  [0.22, 0.127, 0.091], [0.33, 0.136, 0.097], [0.43, 0.143, 0.099], [0.495, 0.155, 0.09], [0.54, 0.128, 0.076],
  [0.57, 0.08, 0.06], [0.6, 0.049, 0.051], [0.69, 0.045, 0.049], [0.76, 0.04, 0.044],
];
// Braço: [distância abaixo do ombro, raio]
const ARM = [
  [-0.085, 0.004], [-0.072, 0.03], [-0.045, 0.046], [0.0, 0.05], [0.06, 0.044], [0.14, 0.039], [0.24, 0.035],
  [0.29, 0.034], [0.34, 0.037], [0.42, 0.031], [0.5, 0.025], [0.545, 0.023], [0.565, 0.004],
];
// Perna: [distância abaixo do quadril, raio]
const LEG = [
  [-0.095, 0.004], [-0.08, 0.05], [-0.04, 0.078], [0.02, 0.083], [0.12, 0.075], [0.26, 0.063], [0.38, 0.053],
  [0.46, 0.048], [0.52, 0.048], [0.6, 0.05], [0.7, 0.042], [0.8, 0.033], [0.88, 0.028], [0.91, 0.026], [0.935, 0.004],
];

/**
 * Forma do corpo. M = { peito, costas, ... } em 0..1 (visual), absLevel = nível 0..100 do abdômen.
 */
export class BodyShape {
  constructor({ female = false, belly = 0, armX = 0.19 } = {}) {
    this.female = female;
    this.belly = belly;
    this.armX = armX;
    this.M = { peito: 0, costas: 0, ombros: 0, biceps: 0, triceps: 0, abdomen: 0, pernas: 0, panturrilhas: 0 };
    this.absLevel = 0;
    this.pump = { peito: 0, costas: 0, ombros: 0, biceps: 0, triceps: 0, abdomen: 0, pernas: 0, panturrilhas: 0 };
  }

  get avg() {
    const m = this.M;
    return (m.peito + m.costas + m.ombros + m.biceps + m.triceps + m.abdomen + m.pernas + m.panturrilhas) / 8;
  }

  _m(k) {
    return this.M[k] * (1 + this.pump[k] * 0.08);
  }

  /** Raio do tronco em (y absoluto, θ). k.bulge escala músculos (roupa suaviza), k.abs liga gomos. */
  torso(y, th, k = { bulge: 1, abs: 1 }) {
    const yr = y - SK.hipY;
    const T = this.female ? TORSO_F : TORSO_M;
    let rx = keys(T, yr, 1);
    let rz = keys(T, yr, 2);
    const neck = smoothstep(0.57, 0.62, yr);
    const strong = this.avg;
    rx += neck * strong * 0.012;
    rz += neck * strong * 0.012;
    let r = ellipse(rx, rz, th);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const side = Math.abs(s);
    const front = pos0(c);
    const back = pos0(-c);
    const B = k.bulge;
    const pe = this._m('peito');
    const co = this._m('costas');
    const om = this._m('ombros');
    const ab = this._m('abdomen');

    // Dorsais (V) e parte alta das costas
    r += B * co * 0.05 * bell(yr, 0.36, 0.12) * (side * 0.8 + back * 0.5);
    r += B * co * 0.02 * bell(yr, 0.45, 0.08) * back;
    // Ombros / trapézio
    r += B * om * 0.03 * bell(yr, 0.5, 0.04) * side;
    r += B * (om * 0.016 + co * 0.008) * bell(yr, 0.565, 0.025) * (back + side * 0.5);
    // Peitoral: dois volumes com borda inferior marcada
    if (!this.female) {
      const pv = yr < 0.375 ? smoothstep(0.3, 0.375, yr) : 1 - smoothstep(0.375, 0.5, yr);
      const lobes = bell(th, 0.5, 0.42) + bell(th, -0.5, 0.42);
      r += B * (0.003 + pe * 0.034) * pv * Math.min(1, lobes) * front;
      r -= B * pe * 0.004 * bell(th, 0, 0.07) * pv;
    } else {
      // Silhueta feminina discreta sob a roupa
      const lobes = bell(th, 0.48, 0.38) + bell(th, -0.48, 0.38);
      r += 0.024 * bell(yr, 0.365, 0.055) * Math.min(1, lobes) * front;
    }
    // Barriga (NPCs) e abdômen
    if (this.belly) r += this.belly * 0.06 * bell(yr, 0.12, 0.11) * Math.pow(front, 1.4) + this.belly * 0.018 * bell(yr, 0.1, 0.12) * side;
    r -= ab * 0.004 * bell(yr, 0.13, 0.08) * front;
    if (k.abs && !this.female) {
      const L = this.absLevel;
      const outline = smoothstep(10, 22, L) * 0.3;
      const rows = [0.215, 0.157, 0.1, 0.045];
      const show = [28, 28, 48, 72];
      let a = 0;
      for (let i = 0; i < 4; i++) {
        const full = smoothstep(show[i] - 6, show[i] + 4, L);
        const amp = Math.max(outline, full) * (i === 3 ? 0.8 : 1);
        if (amp <= 0) continue;
        a += amp * bell(yr, rows[i], 0.021) * (bell(th, 0.17, 0.075) + bell(th, -0.17, 0.075));
      }
      const vis = smoothstep(14, 40, L);
      r += k.abs * (a * 0.0062 - vis * 0.0022 * bell(th, 0, 0.035) * smoothstep(0.02, 0.06, yr) * (1 - smoothstep(0.24, 0.28, yr))) * front;
    }
    return r;
  }

  torsoCenter(y) {
    const yr = y - SK.hipY;
    return [0, -0.006 * smoothstep(0.55, 0.65, yr)];
  }

  /** Músculos que "ruborizam" no pump (cor por vértice). */
  torsoFlush(y, th) {
    const yr = y - SK.hipY;
    const c = Math.cos(th);
    const p = this.pump;
    return Math.max(
      p.peito * bell(yr, 0.38, 0.08) * pos0(c),
      p.costas * bell(yr, 0.38, 0.12) * pos0(-c + 0.3),
      p.abdomen * bell(yr, 0.13, 0.09) * pos0(c),
      p.ombros * bell(yr, 0.52, 0.05),
    );
  }

  /** Braço: d = distância abaixo da junta do ombro; s = lado (+1 esq, −1 dir). */
  arm(d, th, s, k = { bulge: 1 }) {
    const f = this.female ? 0.86 : 1;
    let r = keys(ARM, d, 1) * f;
    const c = Math.cos(th);
    const out = s * Math.sin(th);
    const B = k.bulge;
    const om = this._m('ombros');
    const bi = this._m('biceps');
    const tr = this._m('triceps');
    r += B * om * 0.03 * bell(d, 0.0, 0.07) * (0.55 + 0.45 * out) * f;
    r += B * bi * 0.03 * bell(d, 0.17, 0.075) * Math.pow(pos0(c), 1.2) * f;
    r += B * tr * 0.028 * bell(d, 0.13, 0.08) * Math.pow(pos0(-c), 1.1) * f;
    r += B * tr * 0.01 * bell(d, 0.08, 0.06) * pos0(out) * f;
    r += B * bi * 0.006 * bell(d, 0.22, 0.05) * pos0(out);
    r += B * (bi + tr) * 0.5 * (0.014 * bell(d, 0.35, 0.06) * (0.6 + 0.4 * pos0(c)) + 0.004 * bell(d, 0.2, 0.3));
    return r;
  }

  armCenter(d, s) {
    return [s * (this.armX + this._m('ombros') * 0.012 * bell(d, 0, 0.08)), 0];
  }

  armFlush(d, th) {
    const c = Math.cos(th);
    const p = this.pump;
    return Math.max(p.ombros * bell(d, 0, 0.07), p.biceps * bell(d, 0.17, 0.08) * pos0(c), p.triceps * bell(d, 0.13, 0.09) * pos0(-c));
  }

  /** Perna: d = distância abaixo da junta do quadril. */
  leg(d, th, s, k = { bulge: 1 }) {
    let r = keys(LEG, d, 1);
    if (this.female) r += 0.012 * bell(d, 0.05, 0.12) - 0.003 * bell(d, 0.65, 0.2);
    const c = Math.cos(th);
    const out = s * Math.sin(th);
    const B = k.bulge;
    const pn = this._m('pernas');
    const pa = this._m('panturrilhas');
    r += B * pn * 0.034 * bell(d, 0.2, 0.11) * Math.pow(pos0(c), 0.8);
    r += B * pn * 0.016 * bell(d, 0.22, 0.12) * pos0(out);
    r += B * pn * 0.018 * bell(d, 0.37, 0.05) * pos0(-out) * pos0(c + 0.3);
    r += B * pn * 0.02 * bell(d, 0.2, 0.1) * pos0(-c);
    r += B * pn * 0.02 * bell(d, -0.02, 0.06) * pos0(-c);
    r += B * pn * 0.006 * bell(d, 0.2, 0.25);
    r += B * pa * 0.03 * bell(d, 0.6, 0.07) * Math.pow(pos0(-c), 0.9);
    r += B * pa * 0.008 * bell(d, 0.64, 0.05) * pos0(-out);
    r += B * pa * (0.005 * bell(d, 0.62, 0.08) * pos0(c) + 0.004 * bell(d, 0.65, 0.15));
    return r;
  }

  legCenter(d, s) {
    return [s * (SK.thighX - 0.01 * smoothstep(0, 0.46, d)), 0.004 * bell(d, 0.46, 0.05)];
  }

  legFlush(d, th) {
    const c = Math.cos(th);
    const p = this.pump;
    return Math.max(p.pernas * bell(d, 0.22, 0.14), p.panturrilhas * bell(d, 0.6, 0.08) * pos0(-c + 0.2));
  }
}

// ── Loft com skinning ──────────────────────────────────────────────
/**
 * Malha tubular de seções em y (de cima pra baixo). Cada vértice é preso a
 * até 2 ossos conforme a altura (blend suave nas juntas).
 * segs: [{ bone: índice, y: início }] em ordem crescente de y (o 1º com y = −∞).
 */
export class Loft {
  constructor({ yTop, yBot, rings, radial, th0 = -Math.PI, th1 = Math.PI, segs, blend = 0.04 }) {
    this.yTop = yTop;
    this.yBot = yBot;
    this.rings = rings;
    this.radial = radial;
    this.th0 = th0;
    this.th1 = th1;
    this.full = Math.abs(th1 - th0 - Math.PI * 2) < 1e-6;
    const nv = rings * (radial + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 3).fill(1);
    const uv = new Float32Array(nv * 2);
    const si = new Uint16Array(nv * 4);
    const sw = new Float32Array(nv * 4);
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const y = yTop + (yBot - yTop) * t;
      const w = chainWeights(y, segs, blend);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        uv[k * 2] = j / radial;
        uv[k * 2 + 1] = 1 - t;
        si[k * 4] = w[0];
        sw[k * 4] = w[1];
        si[k * 4 + 1] = w[2];
        sw[k * 4 + 1] = w[3];
      }
    }
    const idx = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.geometry = g;
  }

  /** radius(y, θ) → r; center(y) → [x, z]; flush(y, θ) → 0..1 (opcional). */
  update(radius, center, flush) {
    const { rings, radial, pos, col } = this;
    for (let i = 0; i < rings; i++) {
      const y = this.yTop + (this.yBot - this.yTop) * (i / (rings - 1));
      const [cx, cz] = center(y);
      for (let j = 0; j <= radial; j++) {
        const th = this.th0 + (this.th1 - this.th0) * (j / radial);
        const r = Math.max(0.0015, radius(y, th));
        const k = (i * (radial + 1) + j) * 3;
        pos[k] = cx + r * Math.sin(th);
        pos[k + 1] = y;
        pos[k + 2] = cz + r * Math.cos(th);
        if (flush) {
          const f = Math.min(1, flush(y, th));
          col[k] = 1;
          col[k + 1] = 1 - f * 0.2;
          col[k + 2] = 1 - f * 0.26;
        }
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    if (flush) g.attributes.color.needsUpdate = true;
    g.computeVertexNormals();
    const n = g.attributes.normal.array;
    // Costura: média das normais do primeiro/último vértice de cada anel
    if (this.full) {
      for (let i = 0; i < rings; i++) {
        const a = i * (radial + 1) * 3;
        const b = (i * (radial + 1) + radial) * 3;
        for (let c = 0; c < 3; c++) {
          const m = (n[a + c] + n[b + c]) / 2;
          n[a + c] = n[b + c] = m;
        }
      }
    }
    // Pontas fechadas: normal pra cima/baixo
    for (const [ring, ny] of [[0, 1], [rings - 1, -1]]) {
      const a = ring * (radial + 1);
      // Anel degenerado (raio ~0)? Compara z da frente com z de trás.
      const zFront = pos[(a + Math.floor(radial / 2)) * 3 + 2];
      const zBack = pos[a * 3 + 2];
      if (this.full && Math.abs(zFront - zBack) < 0.008) {
        for (let j = 0; j <= radial; j++) {
          n[(a + j) * 3] = 0;
          n[(a + j) * 3 + 1] = ny;
          n[(a + j) * 3 + 2] = 0;
        }
      }
    }
    g.attributes.normal.needsUpdate = true;
  }
}

function chainWeights(y, segs, blend) {
  let i = segs.length - 1;
  while (i > 0 && y < segs[i].y) i--;
  if (i > 0 && y - segs[i].y < blend) {
    const w = 0.5 + (0.5 * (y - segs[i].y)) / blend;
    return [segs[i].bone, w, segs[i - 1].bone, 1 - w];
  }
  if (i < segs.length - 1 && segs[i + 1].y - y < blend) {
    const w = 0.5 + (0.5 * (segs[i + 1].y - y)) / blend;
    return [segs[i].bone, w, segs[i + 1].bone, 1 - w];
  }
  return [segs[i].bone, 1, 0, 0];
}

export { bell, smoothstep };
