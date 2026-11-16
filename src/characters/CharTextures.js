import * as THREE from 'three';
import { mulberry32 } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Texturas dos personagens geradas em canvas: pele com variação de
//  tom, rosto pintado (sobrancelha, lábios, bochecha, barba), cabelo
//  em fios, tecidos, tênis e íris. Tudo cacheado por parâmetro.
// ════════════════════════════════════════════════════════════════

const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const css = (c, a = 1) => {
  const col = new THREE.Color(c);
  return `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
};

function shade(hex, k) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(k);
}

/** Variação orgânica (manchinhas) por cima de uma cor base. */
function mottle(ctx, w, h, rng, base, n = 2500, alpha = 0.05, size = [1, 6]) {
  for (let i = 0; i < n; i++) {
    const dark = rng() < 0.5;
    const r = size[0] + rng() * (size[1] - size[0]);
    ctx.fillStyle = dark ? css(shade(base, 0.82).lerp(new THREE.Color(0xb04030), 0.15), alpha * rng()) : css(shade(base, 1.12), alpha * rng());
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Pele do corpo (tileável o suficiente pro corpo). */
export function skinMap(color) {
  return memo(`skin|${color}`, () => {
    const c = canvas(512, 512);
    const ctx = c.getContext('2d');
    const rng = mulberry32(7);
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, 512, 512);
    mottle(ctx, 512, 512, rng, color, 3000, 0.06, [2, 14]);
    mottle(ctx, 512, 512, rng, color, 6000, 0.05, [0.5, 1.6]);
    return tex(c, true, true);
  });
}

/** Normal map de poros + linhas finas de pele. */
export function skinNormal() {
  return memo('skinNormal', () => {
    const S = 256;
    const h = new Float32Array(S * S);
    const rng = mulberry32(3);
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(rng() * S);
      const y = Math.floor(rng() * S);
      const r = 1 + Math.floor(rng() * 2);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d <= 1) h[((y + dy + S) % S) * S + ((x + dx + S) % S)] -= (1 - d) * 0.6;
      }
    }
    return normalFromHeight(h, S, 1.4);
  });
}

function normalFromHeight(h, S, strength) {
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)];
      const r = h[y * S + ((x + 1) % S)];
      const u = h[((y - 1 + S) % S) * S + x];
      const d = h[((y + 1) % S) * S + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, false, true);
}

/**
 * Rosto pintado no espaço UV da cabeça (u = ângulo em volta, frente em 0,5;
 * v = de cima pra baixo). Recebe a função de posicionamento uv(θ, φ).
 */
export function faceMap(o) {
  const key = `face|${o.skin}|${o.brow}|${o.lips}|${o.female}|${o.stubble}|${o.freckles}|${o.makeup}`;
  return memo(key, () => {
    const W = 1024;
    const H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rng = mulberry32(11);
    const X = (th) => (0.5 + th / (Math.PI * 2)) * W;
    const Y = (ph) => (ph / Math.PI) * H;
    ctx.fillStyle = css(o.skin);
    ctx.fillRect(0, 0, W, H);
    mottle(ctx, W, H, rng, o.skin, 2500, 0.05, [2, 10]);
    mottle(ctx, W, H, rng, o.skin, 5000, 0.04, [0.5, 1.5]);

    const blob = (th, ph, rx, ry, color, a, rot = 0) => {
      ctx.save();
      ctx.translate(X(th), Y(ph));
      ctx.rotate(rot);
      ctx.scale(rx * W, ry * H);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, css(color, a));
      g.addColorStop(1, css(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Bochechas e nariz levemente rosados, olheira suave
    for (const s of [1, -1]) {
      blob(s * 0.62, 1.7, 0.05, 0.1, 0xd8605a, o.female ? 0.22 : 0.12);
      blob(s * 0.38, 1.62, 0.03, 0.05, 0x7a4a5a, 0.08);
    }
    blob(0, 1.8, 0.018, 0.05, 0xd06a60, 0.15);

    // Barba por fazer
    if (o.stubble) {
      ctx.fillStyle = css(o.stubble, 0.12);
      for (let i = 0; i < 9000; i++) {
        const th = (rng() - 0.5) * 2.4;
        const ph = 1.95 + rng() * 0.75;
        if (Math.abs(th) < 0.25 && ph < 2.2 && ph > 2.0) continue;
        ctx.fillRect(X(th), Y(ph), 1.4, 1.4);
      }
    }

    // Sombra das pálpebras / maquiagem
    for (const s of [1, -1]) {
      blob(s * 0.4, 1.43, 0.035, 0.04, o.makeup ?? 0x6a4040, o.makeup ? 0.45 : 0.12);
    }

    // Sobrancelhas (fios desenhados)
    const browCol = new THREE.Color(o.brow);
    for (const s of [1, -1]) {
      for (let i = 0; i < 160; i++) {
        const t = rng();
        const th = s * (0.16 + t * 0.42);
        const ph = 1.31 - Math.sin(t * Math.PI) * 0.05 + (t > 0.7 ? (t - 0.7) * 0.18 : 0) + (rng() - 0.5) * (o.female ? 0.02 : 0.035);
        ctx.strokeStyle = css(browCol, 0.35 + rng() * 0.4);
        ctx.lineWidth = o.female ? 1.6 : 2.4;
        ctx.beginPath();
        ctx.moveTo(X(th), Y(ph));
        ctx.lineTo(X(th) + s * (5 + rng() * 5), Y(ph) - 2 - rng() * 2);
        ctx.stroke();
      }
    }

    // Lábios
    const lip = new THREE.Color(o.lips);
    ctx.fillStyle = css(lip, 0.85);
    ctx.beginPath();
    const mx = X(0);
    const up = Y(2.0);
    const mid = Y(2.075);
    const lo = Y(2.15);
    const wdt = 0.2 * (W / (Math.PI * 2));
    ctx.moveTo(mx - wdt, mid);
    ctx.quadraticCurveTo(mx - wdt * 0.5, up - 2, mx - wdt * 0.12, up);
    ctx.quadraticCurveTo(mx, up + 3, mx + wdt * 0.12, up);
    ctx.quadraticCurveTo(mx + wdt * 0.5, up - 2, mx + wdt, mid);
    ctx.quadraticCurveTo(mx, lo + 4, mx - wdt, mid);
    ctx.fill();
    ctx.strokeStyle = css(shade(lip, 0.45), 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - wdt, mid);
    ctx.quadraticCurveTo(mx, mid + 2, mx + wdt, mid);
    ctx.stroke();

    // Sardas
    if (o.freckles) {
      for (let i = 0; i < 140; i++) {
        const th = (rng() - 0.5) * 1.6;
        const ph = 1.6 + rng() * 0.25;
        ctx.fillStyle = `rgba(150,80,40,${0.25 + rng() * 0.3})`;
        ctx.beginPath();
        ctx.arc(X(th), Y(ph), 1 + rng() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return tex(c);
  });
}

/** Cabelo: fios finos ao longo de v (raiz → ponta). */
export function hairMaps(color) {
  return memo(`hair|${color}`, () => {
    const W = 512;
    const H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rng = mulberry32(5);
    const base = new THREE.Color(color);
    ctx.fillStyle = css(shade(color, 0.75));
    ctx.fillRect(0, 0, W, H);
    const h = new Float32Array(W * H);
    for (let i = 0; i < 2600; i++) {
      const x = rng() * W;
      const k = 0.55 + rng() * 0.75;
      ctx.strokeStyle = css(base.clone().multiplyScalar(k), 0.35 + rng() * 0.5);
      ctx.lineWidth = 0.6 + rng() * 1.6;
      ctx.beginPath();
      const wav = rng() * 6;
      ctx.moveTo(x, 0);
      for (let y = 0; y <= H; y += 16) ctx.lineTo(x + Math.sin(y * 0.02 + wav) * 3, y);
      ctx.stroke();
      const xi = Math.floor(x) % W;
      for (let y = 0; y < H; y++) h[y * W + xi] += 0.5 * k;
    }
    // altura → normal (blur horizontal leve)
    const S = 256;
    const hs = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hs[y * S + x] = h[y * 2 * W + x * 2] + h[y * 2 * W + ((x * 2 + 1) % W)];
    return { map: tex(c, true, true), normalMap: normalFromHeight(hs, S, 0.8) };
  });
}

/**
 * Tecido: cor + trama + leve sujeira. kind: cotton | denim | knit | sport.
 * print(ctx, w, h) desenha estampa (ex.: banda do Matheus) — frente em u = 0,5.
 */
export function clothMaps(color, kind = 'cotton', printKey = null, print = null) {
  return memo(`cloth|${color}|${kind}|${printKey}`, () => {
    const W = 512;
    const H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rng = mulberry32(9);
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, W, H);
    if (kind === 'denim') {
      for (let i = 0; i < W * 2; i += 3) {
        ctx.strokeStyle = `rgba(255,255,255,${0.04 + rng() * 0.05})`;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - H, H);
        ctx.stroke();
      }
    }
    if (kind === 'sport') {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(W * 0.2, 0, 6, H);
      ctx.fillRect(W * 0.8 - 6, 0, 6, H);
    }
    mottle(ctx, W, H, rng, color, 1800, 0.05, [3, 18]);
    // Costura lateral (u = 0,25 e 0,75 ≈ lados do corpo)
    ctx.strokeStyle = css(shade(color, 0.6), 0.5);
    ctx.lineWidth = 2;
    for (const u of [0.25, 0.75]) {
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(u * W, 0);
      ctx.lineTo(u * W, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (print) print(ctx, W, H);
    // Normal: trama + dobras
    const S = 256;
    const hh = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const weave = kind === 'knit' ? Math.sin(x * 1.6) * Math.sin(y * 0.8) : Math.sin(x * 2.4) * 0.5 + Math.sin(y * 2.4) * 0.5;
        const fold = Math.sin(y * 0.09 + Math.sin(x * 0.05) * 2) * 2.2 + Math.sin(y * 0.21 + x * 0.03) * 0.8;
        hh[y * S + x] = weave * 0.35 + fold * 0.25;
      }
    }
    return { map: tex(c, true, false), normalMap: normalFromHeight(hh, S, 0.9) };
  });
}

export function shoeMap(base, accent) {
  return memo(`shoe|${base}|${accent}`, () => {
    const W = 256;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, W, H);
    // Faixa lateral e cadarços
    ctx.strokeStyle = css(accent);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(W * 0.15, H * 0.75);
    ctx.quadraticCurveTo(W * 0.45, H * 0.35, W * 0.85, H * 0.55);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.42, H * (0.1 + i * 0.05), W * 0.16, 4);
    return tex(c);
  });
}

export function irisMap(color) {
  // Canvas 2:1 casa com as UVs da esfera: íris de ~28° centrada em u = 0,5 (frente do olho).
  return memo(`iris|${color}`, () => {
    const W = 512;
    const H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const rng = mulberry32(2);
    const sclera = ctx.createLinearGradient(0, 0, W, 0);
    sclera.addColorStop(0, '#e8d6d0');
    sclera.addColorStop(0.35, '#f6f3ee');
    sclera.addColorStop(0.65, '#f6f3ee');
    sclera.addColorStop(1, '#e8d6d0');
    ctx.fillStyle = sclera;
    ctx.fillRect(0, 0, W, H);
    // Veinhas discretas nas laterais
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(200,80,80,${0.08 + rng() * 0.1})`;
      ctx.lineWidth = 0.8;
      const x0 = rng() < 0.5 ? W * (0.3 + rng() * 0.05) : W * (0.65 + rng() * 0.05);
      ctx.beginPath();
      ctx.moveTo(x0, H * (0.3 + rng() * 0.4));
      ctx.lineTo(x0 + (rng() - 0.5) * 40, H * (0.3 + rng() * 0.4));
      ctx.stroke();
    }
    const cx = W / 2;
    const cy = H / 2;
    const R = 40;
    const col = new THREE.Color(color);
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, R);
    g.addColorStop(0, css(col.clone().multiplyScalar(1.5)));
    g.addColorStop(0.65, css(col));
    g.addColorStop(0.9, css(col.clone().multiplyScalar(0.5)));
    g.addColorStop(1, 'rgba(30,25,25,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 140; i++) {
      const a = rng() * Math.PI * 2;
      ctx.strokeStyle = `rgba(255,255,255,${rng() * 0.18})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
      ctx.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
      ctx.stroke();
    }
    ctx.fillStyle = '#0a0706';
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fill();
    return tex(c);
  });
}
