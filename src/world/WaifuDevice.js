import * as THREE from 'three';
import * as P from './Props.js';
import { hologramPanel } from '../render/Hologram.js';
import { rand } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  WaifuFit: a waifu aparece na tela do celular (Garagem), num
//  mini-holograma (smartwatch, Iron) ou em tamanho real (projetor,
//  Olympus). Sem PNG em /public/assets/textures/waifus, ela é desenhada
//  em canvas: estilo anime, proporções adultas, roupa de treino.
// ════════════════════════════════════════════════════════════════

const SKIN = '#ffe3d0';
const SKIN_SHADE = '#f4c6ae';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Desenha a waifu (busto) num canvas.
 * face: { blink 0..1, mouth 0..1, bob, bg = true }
 */
export function drawWaifu(ctx, W, H, look, face = {}, img = null) {
  const { blink = 0, mouth = 0, bob = 0, bg = true } = face;
  ctx.clearRect(0, 0, W, H);
  if (bg) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, look.bg[0]);
    g.addColorStop(1, look.bg[1]);
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, W, H, W * 0.08);
    ctx.fill();
    // brilhinhos
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 9; i++) {
      const x = ((i * 97) % 100) / 100 * W;
      const y = ((i * 53) % 100) / 100 * H * 0.6;
      const s = 2 + (i % 3) * 2;
      ctx.fillRect(x - s / 2, y, s, 1.5);
      ctx.fillRect(x, y - s / 2, 1.5, s);
    }
  }
  if (img) {
    const r = Math.min(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * r) / 2, H - img.height * r + bob, img.width * r, img.height * r);
    return;
  }
  const cx = W / 2;
  const s = W / 256;
  const hy = H * 0.36 + bob; // centro da cabeça
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Cabelo de trás
  ctx.fillStyle = look.hair2;
  ctx.beginPath();
  if (look.style === 'long') {
    ctx.moveTo(cx - 78 * s, hy - 20 * s);
    ctx.quadraticCurveTo(cx - 100 * s, hy + 150 * s, cx - 70 * s, hy + 210 * s);
    ctx.lineTo(cx + 70 * s, hy + 210 * s);
    ctx.quadraticCurveTo(cx + 100 * s, hy + 150 * s, cx + 78 * s, hy - 20 * s);
  } else if (look.style === 'bob') {
    ctx.moveTo(cx - 80 * s, hy - 20 * s);
    ctx.quadraticCurveTo(cx - 92 * s, hy + 60 * s, cx - 62 * s, hy + 78 * s);
    ctx.lineTo(cx + 62 * s, hy + 78 * s);
    ctx.quadraticCurveTo(cx + 92 * s, hy + 60 * s, cx + 80 * s, hy - 20 * s);
  } else {
    ctx.moveTo(cx - 76 * s, hy - 20 * s);
    ctx.quadraticCurveTo(cx - 86 * s, hy + 60 * s, cx - 58 * s, hy + 70 * s);
    ctx.lineTo(cx + 58 * s, hy + 70 * s);
    ctx.quadraticCurveTo(cx + 86 * s, hy + 60 * s, cx + 76 * s, hy - 20 * s);
  }
  ctx.closePath();
  ctx.fill();
  if (look.style === 'sideTail') {
    // rabo de cavalo de lado
    ctx.beginPath();
    ctx.moveTo(cx + 62 * s, hy - 40 * s);
    ctx.quadraticCurveTo(cx + 132 * s, hy - 10 * s, cx + 112 * s, hy + 110 * s);
    ctx.quadraticCurveTo(cx + 96 * s, hy + 40 * s, cx + 58 * s, hy - 6 * s);
    ctx.fill();
  }

  // Corpo: moletom com capuz
  ctx.fillStyle = look.outfit;
  ctx.beginPath();
  ctx.moveTo(cx - 34 * s, hy + 86 * s);
  ctx.quadraticCurveTo(cx - 108 * s, hy + 104 * s, cx - 118 * s, H);
  ctx.lineTo(cx + 118 * s, H);
  ctx.quadraticCurveTo(cx + 108 * s, hy + 104 * s, cx + 34 * s, hy + 86 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = look.outfit2;
  ctx.beginPath();
  ctx.moveTo(cx - 30 * s, hy + 90 * s);
  ctx.lineTo(cx, hy + 128 * s);
  ctx.lineTo(cx + 30 * s, hy + 90 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = look.outfit2;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 10 * s, hy + 128 * s);
  ctx.lineTo(cx - 14 * s, hy + 170 * s);
  ctx.moveTo(cx + 10 * s, hy + 128 * s);
  ctx.lineTo(cx + 14 * s, hy + 170 * s);
  ctx.stroke();
  // Pescoço
  ctx.fillStyle = SKIN_SHADE;
  ctx.fillRect(cx - 16 * s, hy + 50 * s, 32 * s, 44 * s);

  // Rosto
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.moveTo(cx - 62 * s, hy - 10 * s);
  ctx.quadraticCurveTo(cx - 62 * s, hy + 44 * s, cx - 20 * s, hy + 68 * s);
  ctx.quadraticCurveTo(cx, hy + 78 * s, cx + 20 * s, hy + 68 * s);
  ctx.quadraticCurveTo(cx + 62 * s, hy + 44 * s, cx + 62 * s, hy - 10 * s);
  ctx.quadraticCurveTo(cx + 62 * s, hy - 74 * s, cx, hy - 74 * s);
  ctx.quadraticCurveTo(cx - 62 * s, hy - 74 * s, cx - 62 * s, hy - 10 * s);
  ctx.fill();
  // Bochechas
  ctx.fillStyle = 'rgba(255,120,150,0.35)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * 36 * s, hy + 30 * s, 12 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Olhos
  const eyeY = hy + 8 * s;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 27 * s;
    if (blink > 0.5) {
      ctx.strokeStyle = '#3a2028';
      ctx.lineWidth = 3.5 * s;
      ctx.beginPath();
      ctx.arc(ex, eyeY - 2 * s, 13 * s, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 14 * s, 17 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const ig = ctx.createLinearGradient(0, eyeY - 15 * s, 0, eyeY + 15 * s);
    ig.addColorStop(0, '#2a1830');
    ig.addColorStop(0.5, look.eyes);
    ig.addColorStop(1, '#fff6d8');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.ellipse(ex + sx * 1 * s, eyeY + 1 * s, 10.5 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0e14';
    ctx.beginPath();
    ctx.ellipse(ex + sx * 1 * s, eyeY + 2 * s, 4.5 * s, 6.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex - 4 * s, eyeY - 6 * s, 4 * s, 4.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 4 * s, eyeY + 6 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    // Pálpebra
    ctx.strokeStyle = '#2a1420';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.arc(ex, eyeY + 4 * s, 16 * s, 1.12 * Math.PI, 1.88 * Math.PI);
    ctx.stroke();
  }
  // Sobrancelhas por personalidade
  ctx.strokeStyle = look.hair2;
  ctx.lineWidth = 3.5 * s;
  for (const sx of [-1, 1]) {
    const bx = cx + sx * 27 * s;
    const by = eyeY - 26 * s;
    ctx.beginPath();
    if (look.mood === 'tsundere') {
      ctx.moveTo(bx - sx * 12 * s, by - 4 * s);
      ctx.lineTo(bx + sx * 12 * s, by + 4 * s);
    } else if (look.mood === 'genki') {
      ctx.arc(bx, by + 8 * s, 13 * s, 1.2 * Math.PI, 1.8 * Math.PI);
    } else {
      ctx.moveTo(bx - 11 * s, by);
      ctx.lineTo(bx + 11 * s, by);
    }
    ctx.stroke();
  }
  // Boca
  const my = hy + 46 * s;
  if (mouth > 0.15) {
    ctx.fillStyle = '#a8304a';
    ctx.beginPath();
    ctx.ellipse(cx, my + 2 * s, 7 * s, (3 + mouth * 7) * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#a8304a';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    if (look.mood === 'kuudere') {
      ctx.moveTo(cx - 6 * s, my);
      ctx.lineTo(cx + 6 * s, my);
    } else if (look.mood === 'tsundere') {
      ctx.arc(cx, my + 7 * s, 7 * s, 1.2 * Math.PI, 1.8 * Math.PI);
    } else {
      ctx.arc(cx, my - 3 * s, 8 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();
  }
  // Óculos
  if (look.glasses) {
    ctx.strokeStyle = 'rgba(40,30,60,0.85)';
    ctx.lineWidth = 3 * s;
    for (const sx of [-1, 1]) {
      roundRect(ctx, cx + sx * 27 * s - 19 * s, eyeY - 15 * s, 38 * s, 30 * s, 8 * s);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 8 * s, eyeY - 4 * s);
    ctx.lineTo(cx + 8 * s, eyeY - 4 * s);
    ctx.stroke();
  }

  // Franja
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.moveTo(cx - 70 * s, hy - 2 * s);
  ctx.quadraticCurveTo(cx - 74 * s, hy - 84 * s, cx, hy - 86 * s);
  ctx.quadraticCurveTo(cx + 74 * s, hy - 84 * s, cx + 70 * s, hy - 2 * s);
  const spikes = look.style === 'bob' ? 7 : 6;
  for (let i = spikes; i >= 0; i--) {
    const x = cx - 66 * s + (132 * s * i) / spikes;
    const tip = hy - (i % 2 ? 10 : 28) * s;
    ctx.lineTo(x + (66 * s) / spikes, tip);
    ctx.lineTo(x, hy - 46 * s);
  }
  ctx.closePath();
  ctx.fill();
  // brilho no cabelo
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.arc(cx, hy - 40 * s, 44 * s, 1.15 * Math.PI, 1.45 * Math.PI);
  ctx.stroke();
  // Acessório
  if (look.mood === 'genki') {
    ctx.fillStyle = '#ffd34d';
    star(ctx, cx - 50 * s, hy - 52 * s, 11 * s);
  } else if (look.mood === 'tsundere') {
    ctx.fillStyle = '#1c1c24';
    ctx.beginPath();
    ctx.moveTo(cx + 44 * s, hy - 62 * s);
    ctx.lineTo(cx + 66 * s, hy - 76 * s);
    ctx.lineTo(cx + 64 * s, hy - 50 * s);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(cx - 48 * s, hy - 54 * s, 9 * s, 0.3, Math.PI * 1.7);
    ctx.arc(cx - 44 * s, hy - 56 * s, 7 * s, Math.PI * 1.7, 0.3, true);
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const _portraits = new Map();
/** Retrato pra cartões/HUD (data URL, em cache). */
export function waifuPortrait(id, look, img = null) {
  const key = id + (img ? ':img' : '');
  if (_portraits.has(key)) return _portraits.get(key);
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 200;
  const ctx = c.getContext('2d');
  // enquadra só o rosto (desenha maior e desloca)
  ctx.save();
  ctx.translate(-48, -50);
  drawWaifu(ctx, 256, 512, look, { bg: false }, img);
  ctx.restore();
  const g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, look.bg[0]);
  g.addColorStop(1, look.bg[1]);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 160, 200);
  const url = c.toDataURL('image/png');
  _portraits.set(key, url);
  return url;
}

export class WaifuDevice {
  constructor(loader) {
    this.loader = loader;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.id = null;
    this.look = null;
    this.img = null;
    this.device = -1;
    this.blinkT = rand(1, 3);
    this.talkT = 0;
    this.drawT = 0;
    this.t = 0;
    this._buildPhone();
    this.holo = null;
  }

  _buildPhone() {
    const phone = new THREE.Group();
    const body = P.mesh(P.rbox(0.085, 0.17, 0.01, 0.008), new THREE.MeshStandardMaterial({ color: 0x15151c, metalness: 0.6, roughness: 0.3 }), 0, 0.12, 0, phone);
    body.rotation.x = -0.32;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.074, 0.148), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    screen.position.set(0, 0, 0.0056);
    body.add(screen);
    // rachadura na tela (é celular de garagem)
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.002), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    crack.position.set(0.018, 0.05, 0.0058);
    crack.rotation.z = 0.7;
    body.add(crack);
    // suporte (um chinelo dobrado... digo, um suporte de verdade)
    P.mesh(new THREE.BoxGeometry(0.07, 0.012, 0.06), new THREE.MeshStandardMaterial({ color: 0x3a3a46, roughness: 0.6 }), 0, 0.006, 0.02, phone);
    const glow = new THREE.PointLight(0xff8fd0, 0.35, 0.9, 2);
    glow.position.set(0, 0.14, 0.08);
    phone.add(glow);
    this.phone = phone;
    this.group.add(phone);
  }

  async setWaifu(id, look) {
    if (this.id === id) return;
    this.id = id;
    this.look = look;
    this.img = id ? await this.loader.loadWaifuImage(id) : null;
    this._draw();
  }

  setDevice(n) {
    if (n === this.device) return;
    this.device = n;
    if (this.holo) {
      this.group.remove(this.holo);
      this.holo = null;
    }
    this.phone.visible = n === 0;
    if (n >= 1) {
      const big = n >= 2;
      this.holo = hologramPanel(this.tex, big ? 0.8 : 0.22, big ? 1.6 : 0.44, 0x9af0ff);
      if (!big) this.holo.position.y = 0.95;
      this.group.add(this.holo);
    }
  }

  /** Mostra numa posição do mundo, virada pra um ponto (câmera/Luisão). */
  placeAt(pos, lookAt) {
    this.group.visible = true;
    this.group.position.copy(pos);
    if (lookAt) this.group.rotation.y = Math.atan2(lookAt.x - pos.x, lookAt.z - pos.z);
  }

  hide() {
    this.group.visible = false;
  }

  /** Faz a boca mexer por um tempo (ela "fala"). */
  talk(sec = 1.6) {
    this.talkT = sec;
  }

  get speechAnchor() {
    const h = this.device >= 2 ? 1.75 : this.device === 1 ? 1.5 : 0.36;
    return this.group.position.clone().add(new THREE.Vector3(0, h, 0));
  }

  _draw(blink = 0, mouth = 0, bob = 0) {
    if (!this.look) return;
    drawWaifu(this.ctx, 256, 512, this.look, { blink, mouth, bob, bg: this.device <= 0 }, this.img);
    this.tex.needsUpdate = true;
  }

  update(dt) {
    if (!this.group.visible || !this.look) return;
    this.t += dt;
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = rand(2, 4.5);
    this.talkT = Math.max(0, this.talkT - dt);
    this.drawT -= dt;
    if (this.drawT <= 0) {
      this.drawT = 1 / 12;
      const mouth = this.talkT > 0 ? Math.abs(Math.sin(this.t * 14)) : 0;
      this._draw(this.blinkT < 0 ? 1 : 0, mouth, Math.sin(this.t * 2.2) * 3);
    }
    if (this.holo) {
      this.holo.userData.mat.uniforms.time.value = this.t;
      this.holo.position.y = (this.device >= 2 ? 0 : 0.95) + Math.sin(this.t * 1.6) * 0.015;
    }
  }
}
