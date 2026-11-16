import * as THREE from 'three';
import { ProceduralRig } from './ProceduralRig.js';
import { GLTFRig } from './GLTFRig.js';
import { GIRL_LOOKS } from '../config/story.js';
import { COMPANIONS } from '../config/companions.js';
import { angleDelta, dampAngle, clamp } from '../core/utils.js';

// ── Visual de cada personagem (stand-in procedural) ───────────────
/** Estampa da banda fictícia do Matheus ("FERRUGEM"), pintada na frente da camiseta. */
function bandPrint(ctx, W, H) {
  const cx = W * 0.5;
  const cy = H * 0.3;
  const s = W / 512;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = '#d8d4cc';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-20, 28, 40, 20);
  ctx.fillStyle = '#1c1c22';
  ctx.beginPath();
  ctx.ellipse(-13, -2, 9, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(13, -2, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(-5, 20);
  ctx.lineTo(5, 20);
  ctx.fill();
  for (let i = -15; i <= 15; i += 7.5) ctx.fillRect(i - 1.5, 36, 3, 12);
  ctx.fillStyle = '#e8462a';
  ctx.font = '900 30px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FERRUGEM', 0, 86);
  ctx.restore();
}

export const LOOKS = {
  luisao: {
    skin: 0xf0c6a2, hairColor: 0xe9c25a, hairStyle: 'blond', eyeColor: 0x4f86c6, height: 1.0, muscular: true,
    top: 0x8c8f96, topStyle: 'tee', bottom: 0x2b3a5c, shoes: 0xf4f4f4, shoeAccent: 0x3a6ad8, lips: 0xc07a70,
  },
  matheus: {
    skin: 0xecc6a5, hairColor: 0x111014, hairStyle: 'long', eyeColor: 0x4a3020, height: 0.92, build: 0.02,
    top: 0x1c1c22, topStyle: 'band', bandPrint: true, bottom: 0x3f4a3c, shoes: 0x2a2a2a, shoeAccent: 0xe8462a,
  },
  seuze: {
    skin: 0xc68b66, hairColor: 0xcfcfcf, hairStyle: 'grey', eyeColor: 0x3a2a1a, height: 0.87, build: 0.4,
    top: 0xf0f0ea, topStyle: 'tank', bottom: 0x3b3b3b, shoes: 0x6b4a2a, shoeAccent: 0x4a3020, mustache: true, belly: 1, stubble: 0x8a8a8a,
  },
  brayan: {
    skin: 0xd4a077, hairColor: 0x161414, hairStyle: 'short', eyeColor: 0x2a1a10, height: 0.97, build: 0.95,
    top: 0xff3b8a, topStyle: 'tank', bottom: 0x111111, shoes: 0x1fe0a0, shoeAccent: 0x111111, stubble: 0x1a1410,
  },
  vizinha: {
    female: true, skin: 0xd9a582, hairColor: 0x6b4b3a, hairStyle: 'bun', eyeColor: 0x3a2a1a, height: 0.84, build: 0.45,
    top: 0xd65a8a, topStyle: 'tee', bottom: 0x5a3b6b, bottomStyle: 'skirt', shoes: 0xb08060, belly: 0.6,
  },
  vizinho: {
    skin: 0xc8946e, hairColor: 0xbdbdbd, hairStyle: 'grey', eyeColor: 0x3a2a1a, height: 0.88, build: 0.35,
    top: 0x5a8ac8, topStyle: 'polo', bottom: 0x6b5b4b, bottomStyle: 'pants', shoes: 0x3a2a1a, belly: 0.5,
  },
  passante: {
    skin: 0xb07a55, hairColor: 0x201814, hairStyle: 'short', eyeColor: 0x2a1a10, height: 0.95, build: 0.4,
    top: 0x3aa37a, topStyle: 'tee', bottom: 0x2a2a3a, bottomStyle: 'pants', shoes: 0xdddddd,
  },
  // ── Iron Temple ──────────────────────────────────────────────────
  // Dona Ivone "Ferro": dona do Iron, ex-campeã de fisiculturismo, cabelo grisalho curto.
  ivone: {
    female: true, skin: 0xc8946e, hairColor: 0xd0d0d0, hairStyle: 'bun', eyeColor: 0x3a2a1a, height: 0.9, build: 1,
    top: 0x15151a, topStyle: 'tank', bottom: 0x2a2a30, bottomStyle: 'pants', shoes: 0xffd34d, shoeAccent: 0x15151a, lips: 0xa85a5a,
  },
  // Kelly da recepção (atrás do balcão de suplementos)
  kelly: {
    female: true, skin: 0xe0b090, hairColor: 0xb8282a, hairStyle: 'ponytail', eyeColor: 0x4a3020, height: 0.86, build: 0.4,
    top: 0x8a3ad8, topStyle: 'polo', bottom: 0x1c1c22, bottomStyle: 'pants', shoes: 0xffffff,
  },
  // Brutus, o marombeiro que vive encostado no balcão
  brutus: {
    skin: 0x8d5a3b, hairColor: 0x111014, hairStyle: 'short', eyeColor: 0x2a1a10, height: 1.0, build: 1,
    top: 0xc8203a, topStyle: 'tank', bottom: 0x1c1c22, bottomStyle: 'shorts', shoes: 0x111111, stubble: 0x1a1410,
  },
  frequentador1: {
    female: true, skin: 0xd9a582, hairColor: 0x2a1c12, hairStyle: 'ponytail', eyeColor: 0x3a2a1a, height: 0.88, build: 0.45,
    top: 0x2ad8ff, topStyle: 'tank', bottom: 0x1c1c22, bottomStyle: 'shorts', shoes: 0xff4f7b,
  },
  frequentador2: {
    skin: 0xf0c6a2, hairColor: 0x7a5a30, hairStyle: 'short', eyeColor: 0x4f86c6, height: 0.95, build: 0.7,
    top: 0x2a2a30, topStyle: 'tee', bottom: 0x3a4a6a, bottomStyle: 'shorts', shoes: 0xeeeeee,
  },
  frequentador3: {
    skin: 0xb07a55, hairColor: 0x111014, hairStyle: 'grey', eyeColor: 0x2a1a10, height: 0.92, build: 0.6,
    top: 0xf0c040, topStyle: 'tank', bottom: 0x2a2a3a, bottomStyle: 'shorts', shoes: 0x222222,
  },
};

// Personals da Equipe (visual em config/companions.js)
for (const c of COMPANIONS) if (c.slot === 'personal' && c.look) LOOKS[c.id] = c.look;

const GIRL_STYLE = { bun: 'bun', ponytail: 'ponytail', long: 'longStraight', curly: 'curly' };
for (const [k, g] of Object.entries(GIRL_LOOKS)) {
  LOOKS[k] = {
    female: true, skin: g.skin, hairColor: g.hair, hairStyle: GIRL_STYLE[g.hairStyle] ?? 'longStraight', eyeColor: 0x4a3020,
    height: g.height, build: g.build, top: g.top, topStyle: 'tee', bottom: g.bottom, bottomStyle: 'pants', shoes: g.shoes,
    glasses: g.glasses, braces: k === 'marlene', freckles: g.freckles, apron: g.apron ?? null, cap: g.cap ?? null,
    lips: g.lips ?? 0xc8606a, makeup: g.makeup ?? null, eyeColor: g.eyeColor ?? 0x4a3020, shoeAccent: g.top,
  };
}

/** Cria o rig de um personagem: .glb real se existir, senão procedural. */
export async function createRig(key, loader, clips, extra = {}) {
  const look = { ...(LOOKS[key] ?? LOOKS.passante), ...extra };
  const gltf = await loader.loadCharacter(key);
  if (gltf) {
    try {
      const height = 1.95 * (look.height ?? 1);
      return new GLTFRig(gltf, clips, { height, muscular: !!look.muscular });
    } catch (err) {
      console.warn(`[Character] .glb de ${key} falhou, usando procedural`, err);
    }
  }
  const opts = { ...look };
  if (opts.bandPrint === true) opts.bandPrint = bandPrint;
  const rig = new ProceduralRig(opts);
  rig.root.scale.setScalar(look.height ?? 1);
  return rig;
}

// ── Ator: posição, movimento, auto-caminhada ─────────────────────
const _dir = new THREE.Vector3();

export class Actor {
  constructor(rig, { radius = 0.3, walkSpeed = 3.2, runSpeed = 5.4, name = '' } = {}) {
    this.rig = rig;
    this.name = name;
    this.radius = radius;
    this.walkSpeed = walkSpeed;
    this.runSpeed = runSpeed;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speedNow = 0;
    this.moveTarget = null;
    this.onArrive = null;
    this.locked = false; // treinando / em diálogo
    this.lockState = null;
    this._stuckT = 0;
    this._lastDist = Infinity;
    this._detour = 0;
    this._detourSign = 1;
  }

  get object3D() {
    return this.rig.object3D;
  }

  place(x, z, yaw = this.yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this._sync();
  }

  _sync() {
    const o = this.rig.object3D;
    o.position.copy(this.pos);
    o.rotation.y = this.yaw;
  }

  moveTo(x, z, onArrive, stopDist = 0.12, run = false) {
    this.moveTarget = { x, z, stopDist, run };
    this.onArrive = onArrive ?? null;
    this._stuckT = 0;
    this._lastDist = Infinity;
    this._detour = 0;
  }

  cancelMove() {
    this.moveTarget = null;
    this.onArrive = null;
  }

  /** Movimento manual (jogador). dirX/dirZ no mundo, mag 0..1. */
  drive(dirX, dirZ, mag, run, dt, world) {
    if (mag > 0.05) {
      this.cancelMove();
      const speed = (run ? this.runSpeed : this.walkSpeed) * mag;
      this.speedNow = speed;
      this.yaw = dampAngle(this.yaw, Math.atan2(dirX, dirZ), 12, dt);
      this.pos.x += dirX * speed * dt;
      this.pos.z += dirZ * speed * dt;
      world?.collide(this.pos, this.radius);
    } else if (!this.moveTarget) {
      this.speedNow = 0;
    }
  }

  update(dt, world) {
    if (this.moveTarget && !this.locked) {
      const t = this.moveTarget;
      _dir.set(t.x - this.pos.x, 0, t.z - this.pos.z);
      const dist = _dir.length();
      if (dist <= t.stopDist) {
        const cb = this.onArrive;
        this.moveTarget = null;
        this.onArrive = null;
        this.speedNow = 0;
        cb?.();
      } else {
        _dir.divideScalar(dist);
        // Desvio simples se travar num obstáculo
        if (this._detour > 0) {
          this._detour -= dt;
          const a = this._detourSign * 1.1;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const x = _dir.x * c - _dir.z * s;
          const z = _dir.x * s + _dir.z * c;
          _dir.set(x, 0, z);
        }
        const speed = Math.min(t.run ? this.runSpeed : this.walkSpeed * 1.15, dist * 6 + 0.6);
        this.speedNow = speed;
        this.yaw = dampAngle(this.yaw, Math.atan2(_dir.x, _dir.z), 10, dt);
        this.pos.x += _dir.x * speed * dt;
        this.pos.z += _dir.z * speed * dt;
        world?.collide(this.pos, this.radius);
        this._stuckT += dt;
        if (this._stuckT > 0.45) {
          if (this._lastDist - dist < 0.08) {
            this._detour = 0.55;
            this._detourSign = Math.random() < 0.5 ? 1 : -1;
          }
          this._lastDist = dist;
          this._stuckT = 0;
        }
      }
    }
    if (!this.locked) {
      const moving = this.speedNow > 0.1;
      this.rig.setState(moving ? 'walk' : this.idleState ?? 'idle', { speed: clamp(this.speedNow / this.walkSpeed, 0.5, 2) });
    }
    this._sync();
    this.rig.update(dt);
  }

  faceTowards(x, z, dt, k = 8) {
    this.yaw = dampAngle(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z), k, dt);
  }

  yawTo(x, z) {
    return Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  facing(x, z) {
    return Math.abs(angleDelta(this.yaw, this.yawTo(x, z)));
  }
}
