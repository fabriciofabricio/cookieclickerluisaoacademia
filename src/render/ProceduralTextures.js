import * as THREE from 'three';
import { mulberry32, clamp } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Texturas PBR procedurais (albedo + normal + roughness + AO).
//  Geradas em canvas, tileáveis e determinísticas. Usadas quando as
//  texturas reais (Poly Haven) não estão em /public/assets/textures.
// ════════════════════════════════════════════════════════════════

class TileNoise {
  constructor(seed) {
    const rng = mulberry32(seed);
    this.perm = new Uint16Array(512);
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.vals[i] = rng();
  }

  lattice(ix, iy, period) {
    ix = ((ix % period) + period) % period;
    iy = ((iy % period) + period) % period;
    return this.vals[this.perm[(ix & 255) + this.perm[iy & 255]]];
  }

  /** Value noise tileável. u,v em [0,1), freq inteiro. */
  noise(u, v, freq) {
    const x = u * freq;
    const y = v * freq;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.lattice(ix, iy, freq);
    const b = this.lattice(ix + 1, iy, freq);
    const c = this.lattice(ix, iy + 1, freq);
    const d = this.lattice(ix + 1, iy + 1, freq);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  fbm(u, v, freq, octaves = 5, gain = 0.5) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise(u, v, freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Ruído "celular" barato (manchas). */
  ridge(u, v, freq, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise(u, v, freq) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Converte um mapa de altura em normal map (tangent space). */
function heightToNormal(height, size, strength) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;
      const yu = (y - 1 + size) % size;
      const yd = (y + 1) % size;
      const dx = (height[y * size + xr] - height[y * size + xl]) * strength;
      const dy = (height[yd * size + x] - height[yu * size + x]) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function floatToCanvas(arr, size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = clamp(arr[i], 0, 1) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function rgbToCanvas(rgb, size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = clamp(rgb[i * 3], 0, 1) * 255;
    img.data[i * 4 + 1] = clamp(rgb[i * 3 + 1], 0, 1) * 255;
    img.data[i * 4 + 2] = clamp(rgb[i * 3 + 2], 0, 1) * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ── Receitas ───────────────────────────────────────────────────────
// Cada receita preenche rgb (0..1), height (0..1), rough (0..1), ao (0..1).

const RECIPES = {
  concrete_floor(n, u, v, out, opt) {
    const base = n.fbm(u, v, 4, 6);
    const fine = n.fbm(u, v, 64, 3);
    const stain = n.fbm(u + 0.37, v + 0.11, 3, 4);
    const crack = n.ridge(u, v, 6, 3);
    const oil = opt.oil ? clamp((n.fbm(u + 0.7, v + 0.2, 2, 4) - 0.62) * 6, 0, 1) : 0;
    let g = 0.42 + base * 0.18 + fine * 0.08 - (stain > 0.6 ? (stain - 0.6) * 0.5 : 0);
    const isCrack = crack > 0.93 ? (crack - 0.93) * 14 : 0;
    g -= isCrack * 0.25;
    const r = g * 1.02 * (1 - oil * 0.65);
    const gg = g * (1 - oil * 0.62);
    const b = g * 0.98 * (1 - oil * 0.55);
    out.rgb = [r, gg, b];
    out.h = base * 0.4 + fine * 0.6 - isCrack * 0.6;
    out.rough = clamp(0.88 - oil * 0.55 + fine * 0.08, 0.2, 1);
    out.ao = 1 - isCrack * 0.5;
  },

  plaster_wall(n, u, v, out, opt) {
    const base = n.fbm(u, v, 3, 5);
    const fine = n.fbm(u, v, 48, 3);
    const grime = clamp(1 - v * 1.6 + (n.fbm(u, v, 8, 4) - 0.5) * 0.6, 0, 1); // sujeira embaixo (v=0 é baixo)
    const [cr, cg, cb] = opt.color ?? [0.78, 0.8, 0.72];
    const k = 0.9 + base * 0.15 + fine * 0.05 - grime * 0.25;
    // Blocos de concreto pintados (linhas de argamassa).
    let mortar = 0;
    if (opt.blocks) {
      const by = (v * 8) % 1;
      const row = Math.floor(v * 8);
      const bx = (u * 4 + (row % 2) * 0.5) % 1;
      mortar = by < 0.04 || bx < 0.02 ? 1 : 0;
    }
    out.rgb = [cr * k - mortar * 0.08, cg * k - mortar * 0.08, cb * k - mortar * 0.08];
    out.h = fine * 0.5 + base * 0.3 - mortar * 0.5;
    out.rough = 0.85 + fine * 0.1;
    out.ao = 1 - mortar * 0.35 - grime * 0.1;
  },

  rusty_metal(n, u, v, out) {
    const rust = n.fbm(u, v, 5, 6);
    const pits = n.fbm(u, v, 40, 3);
    const r = clamp((rust - 0.45) * 3, 0, 1);
    const metal = [0.42, 0.43, 0.45];
    const rustC = [0.45, 0.22, 0.09];
    out.rgb = [metal[0] + (rustC[0] - metal[0]) * r, metal[1] + (rustC[1] - metal[1]) * r, metal[2] + (rustC[2] - metal[2]) * r];
    out.rgb = out.rgb.map((c) => c * (0.85 + pits * 0.3));
    out.h = pits * 0.6 + r * 0.4;
    out.rough = 0.35 + r * 0.6;
    out.metal = 1 - r * 0.85;
    out.ao = 1;
  },

  wood(n, u, v, out, opt) {
    const warp = n.fbm(u, v, 3, 4) * 0.25;
    const rings = Math.sin((u + warp) * 60 + n.fbm(u, v, 8, 3) * 6) * 0.5 + 0.5;
    const fine = n.fbm(u * 0.2, v, 64, 2);
    const plank = opt.planks ? ((v * 6) % 1 < 0.02 ? 1 : 0) : 0;
    const [r, g, b] = opt.color ?? [0.45, 0.29, 0.16];
    const k = 0.7 + rings * 0.35 + fine * 0.1 - plank * 0.4;
    out.rgb = [r * k, g * k, b * k];
    out.h = rings * 0.3 + fine * 0.4 - plank * 0.8;
    out.rough = 0.65 + rings * 0.2;
    out.ao = 1 - plank * 0.4;
  },

  asphalt(n, u, v, out) {
    const base = n.fbm(u, v, 6, 5);
    const grains = n.noise(u, v, 200);
    const g = 0.12 + base * 0.08 + (grains > 0.8 ? 0.12 : 0);
    out.rgb = [g, g, g * 1.05];
    out.h = grains * 0.7 + base * 0.3;
    out.rough = 0.92;
    out.ao = 1;
  },

  sidewalk(n, u, v, out) {
    // Ladrilho de calçada (quadrados com rejunte).
    const tiles = 4;
    const tu = (u * tiles) % 1;
    const tv = (v * tiles) % 1;
    const grout = tu < 0.03 || tv < 0.03 ? 1 : 0;
    const id = Math.floor(u * tiles) + Math.floor(v * tiles) * 7;
    const tint = (Math.sin(id * 12.9898) * 43758.5453) % 1;
    const base = n.fbm(u, v, 8, 4);
    const g = 0.55 + base * 0.15 + Math.abs(tint) * 0.06 - grout * 0.2;
    out.rgb = [g * 1.03, g * 0.98, g * 0.92];
    out.h = base * 0.4 - grout * 0.6;
    out.rough = 0.85;
    out.ao = 1 - grout * 0.4;
  },

  rubber_floor(n, u, v, out) {
    const fleck = n.noise(u, v, 180);
    const base = n.fbm(u, v, 16, 3);
    const g = 0.08 + base * 0.03;
    const f = fleck > 0.82 ? 0.25 : 0;
    out.rgb = [g + f * 0.4, g + f * 0.5, g + f * 0.8];
    out.h = base * 0.5 + fleck * 0.2;
    out.rough = 0.8;
    out.ao = 1;
  },

  marble(n, u, v, out) {
    const w = n.fbm(u, v, 3, 6);
    const vein = Math.pow(1 - Math.abs(Math.sin((u + v + w * 1.5) * 9)), 18);
    const g = 0.92 - vein * 0.35 + n.fbm(u, v, 16, 3) * 0.04;
    out.rgb = [g, g * 0.99, g * 0.97];
    out.h = 0.5;
    out.rough = 0.12 + vein * 0.2;
    out.ao = 1;
  },

  cardboard(n, u, v, out) {
    const corr = Math.sin(u * 220) * 0.5 + 0.5;
    const base = n.fbm(u, v, 6, 4);
    const k = 0.85 + base * 0.2;
    const ink = (u > 0.2 && u < 0.6 && v > 0.42 && v < 0.5) || (u > 0.25 && u < 0.55 && v > 0.53 && v < 0.57) ? 0.35 : 0;
    out.rgb = [0.62 * k - ink, 0.46 * k - ink, 0.28 * k - ink];
    out.h = corr * 0.3 + base * 0.3;
    out.rough = 0.95;
    out.ao = 1;
  },

  fabric(n, u, v, out) {
    const weave = (Math.sin(u * 400) * Math.sin(v * 400)) * 0.5 + 0.5;
    const base = n.fbm(u, v, 8, 3);
    out.rgb = [1, 1, 1].map((c) => c * (0.88 + weave * 0.08 + base * 0.06));
    out.h = weave * 0.6 + base * 0.2;
    out.rough = 0.9;
    out.ao = 1;
  },

  skin(n, u, v, out) {
    const pores = n.noise(u, v, 160);
    const base = n.fbm(u, v, 12, 4);
    out.rgb = [1, 1, 1].map((c) => c * (0.95 + base * 0.05));
    out.h = base * 0.4 + (pores > 0.78 ? -0.3 : 0);
    out.rough = 0.5 + base * 0.15;
    out.ao = 1;
  },

  corrugated(n, u, v, out) {
    // Porta de enrolar da garagem (chapa ondulada).
    const wave = Math.sin(v * Math.PI * 2 * 18) * 0.5 + 0.5;
    const rust = clamp((n.fbm(u, v, 4, 5) - 0.55) * 3, 0, 1);
    const g = 0.5 + wave * 0.1;
    out.rgb = [g * (1 - rust * 0.2) + rust * 0.2, g * (1 - rust * 0.5), g * (1 - rust * 0.7)];
    out.h = wave;
    out.rough = 0.45 + rust * 0.4;
    out.metal = 0.8 - rust * 0.6;
    out.ao = 0.85 + wave * 0.15;
  },
};

const cache = new Map();

/**
 * Gera (ou pega do cache) um conjunto PBR procedural.
 * @returns {{map, normalMap, roughnessMap, aoMap, metalnessMap?}}
 */
export function proceduralSet(kind, { size = 512, seed = 7, normalStrength = 2.5, repeat = [1, 1], ...opt } = {}) {
  const key = `${kind}|${size}|${seed}|${JSON.stringify(opt)}`;
  let set = cache.get(key);
  if (!set) {
    const n = new TileNoise(seed);
    const recipe = RECIPES[kind];
    const rgb = new Float32Array(size * size * 3);
    const h = new Float32Array(size * size);
    const r = new Float32Array(size * size);
    const ao = new Float32Array(size * size);
    const m = new Float32Array(size * size);
    let hasMetal = false;
    const out = {};
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = 1 - y / size;
        out.metal = undefined;
        recipe(n, u, v, out, opt);
        const i = y * size + x;
        rgb[i * 3] = out.rgb[0];
        rgb[i * 3 + 1] = out.rgb[1];
        rgb[i * 3 + 2] = out.rgb[2];
        h[i] = out.h;
        r[i] = out.rough;
        ao[i] = out.ao ?? 1;
        if (out.metal !== undefined) {
          m[i] = out.metal;
          hasMetal = true;
        }
      }
    }
    const tex = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      return t;
    };
    set = {
      map: tex(rgbToCanvas(rgb, size), true),
      normalMap: tex(heightToNormal(h, size, normalStrength), false),
      roughnessMap: tex(floatToCanvas(r, size), false),
      aoMap: tex(floatToCanvas(ao, size), false),
    };
    if (hasMetal) set.metalnessMap = tex(floatToCanvas(m, size), false);
    cache.set(key, set);
  }
  // Clona as texturas pra cada uso ter o próprio repeat (a imagem é compartilhada).
  const result = {};
  for (const [k, t] of Object.entries(set)) {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    result[k] = c;
  }
  return result;
}

/** Textura de rótulo/estampa desenhada em canvas (camiseta de banda, placas etc.). */
export function labelTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Sprite de brilho radial (partículas, auras). */
export function glowTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return labelTexture((ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }, size, size);
}
