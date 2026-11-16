import * as THREE from 'three';
import { rand } from '../core/utils.js';

// Números flutuantes em 3D ("+12", "CRÍTICO! +96") como sprites que
// sempre olham pra câmera. Pool fixo: cada sprite tem o próprio canvas.

const STYLES = {
  normal: { color: '#ffe9a8', stroke: '#5a3a00', size: 1, glow: 'rgba(255,200,60,0.55)' },
  crit: { color: '#ff5a3c', stroke: '#3a0a00', size: 1.45, glow: 'rgba(255,90,40,0.8)' },
  pump: { color: '#7dffb2', stroke: '#00301a', size: 1.15, glow: 'rgba(80,255,160,0.6)' },
  gold: { color: '#ffd34d', stroke: '#4a2a00', size: 1.3, glow: 'rgba(255,210,80,0.9)' },
  info: { color: '#ffffff', stroke: '#1a1a2a', size: 0.85, glow: 'rgba(160,190,255,0.5)' },
  carisma: { color: '#ff8fd0', stroke: '#3a0024', size: 1, glow: 'rgba(255,120,200,0.6)' },
  money: { color: '#9dffb8', stroke: '#003a1a', size: 1.05, glow: 'rgba(80,255,150,0.6)' },
};

export class FloatingText {
  constructor(scene, count = 48) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 20;
      scene.add(sprite);
      this.items.push({ sprite, canvas, ctx: canvas.getContext('2d'), tex, life: 0, max: 1, vel: new THREE.Vector3(), scale: 1 });
    }
    this.cursor = 0;
  }

  spawn(text, pos, style = 'normal') {
    const s = STYLES[style] ?? STYLES.normal;
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    const { ctx, canvas } = it;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `900 ${Math.round(72)}px "Baloo 2", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = s.glow;
    ctx.shadowBlur = 22;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = s.stroke;
    ctx.strokeText(text, 256, 66);
    ctx.shadowBlur = 0;
    ctx.fillStyle = s.color;
    ctx.fillText(text, 256, 66);
    it.tex.needsUpdate = true;
    it.sprite.position.set(pos.x + rand(-0.15, 0.15), pos.y, pos.z + rand(-0.15, 0.15));
    it.vel.set(rand(-0.15, 0.15), rand(0.9, 1.25), rand(-0.15, 0.15));
    it.life = it.max = style === 'crit' || style === 'gold' ? 1.4 : 1.05;
    it.scale = 0.42 * s.size;
    it.sprite.visible = true;
    it.sprite.material.opacity = 1;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      const t = 1 - it.life / it.max;
      it.sprite.position.addScaledVector(it.vel, dt);
      it.vel.y *= 1 - dt * 1.6;
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 0.6);
      const s = it.scale * pop;
      it.sprite.scale.set(s * 4, s, 1);
      it.sprite.material.opacity = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      if (it.life <= 0) it.sprite.visible = false;
    }
  }
}
