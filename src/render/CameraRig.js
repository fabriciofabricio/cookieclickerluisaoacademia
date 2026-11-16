import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDelta } from '../core/utils.js';
import { BALANCE } from '../config/balance.js';

// ════════════════════════════════════════════════════════════════
//  Câmera em terceira pessoa que respeita o cenário:
//   • conhece os TETOS (volumes cobertos) e abaixa o ângulo pra caber,
//     em vez de bater no teto e "pular" pra perto;
//   • colisão com sonda "grossa" (5 raios), que não deixa o plano da
//     câmera atravessar parede;
//   • quando fica espremida, testa posições alternativas (mais alta / de
//     lado) e escolhe a com melhor visão;
//   • aproxima rápido (evita atravessar) e afasta devagar (sem tranco).
//  Modos: follow | shot (máquina, diálogo, close-up) | orbit (Espelho) | path (fly-through)
// ════════════════════════════════════════════════════════════════

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _o = new THREE.Vector3();
const _v = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'follow';
    this.yaw = Math.PI;
    this.pitch = 0.34;
    this.distance = BALANCE.camera.followDistance;
    this.targetFn = () => _v.set(0, 0, 0);
    this.colliders = [];
    this.ceilings = [];
    this.floorY = 0;
    this.raycaster = new THREE.Raycaster();
    this.probeRadius = 0.22;
    this.wallMargin = 0.3;
    this.minDist = 0.55;
    this.indoorMaxDist = 4.0;

    this.pos = new THREE.Vector3(0, 3, 8);
    this.look = new THREE.Vector3(0, 1, 0);
    this.wantPos = new THREE.Vector3();
    this.wantLook = new THREE.Vector3();
    this.shotLerp = 4;

    this.orbitYaw = 0;
    this.orbitPitch = 0.12;
    this.orbitDist = 2.9;
    this.orbitCenter = new THREE.Vector3();
    this.orbitHeight = 1.15;

    this.path = null;
    this.shake = 0;
    this.shakeEnabled = true;
    this.autoAlign = true;
    this.fovBase = 50;
    this.fovKick = 0;
    this.closeness = 10; // distância câmera → alvo (o jogo esconde o Luisão se ficar perto demais)
    this._t = 0;
  }

  /** colliders: malhas que bloqueiam a câmera; ceilings: [{x0,x1,z0,z1,y}] áreas cobertas. */
  setEnvironment({ colliders = [], ceilings = [], floorY = 0 } = {}) {
    this.colliders = colliders;
    this.ceilings = ceilings;
    this.floorY = floorY;
  }

  setColliders(list) {
    this.colliders = list;
  }

  /** Altura do teto no ponto (Infinity = céu aberto). */
  ceilingAt(x, z) {
    let c = Infinity;
    for (const v of this.ceilings) if (x >= v.x0 && x <= v.x1 && z >= v.z0 && z <= v.z1) c = Math.min(c, v.y);
    return c;
  }

  follow(targetFn) {
    if (targetFn) this.targetFn = targetFn;
    this.mode = 'follow';
  }

  setShot(pos, look, lerp = 4) {
    this.mode = 'shot';
    this.wantPos.copy(pos);
    this.wantLook.copy(look);
    this.shotLerp = lerp;
  }

  orbit(center, height = 1.15, startYaw = 0) {
    this.mode = 'orbit';
    this.orbitCenter.copy(center);
    this.orbitHeight = height;
    this.orbitYaw = startYaw;
    this.orbitPitch = 0.1;
    this.orbitDist = 2.9;
  }

  playPath(points, dur = 2.2, onDone) {
    const pos = points.map((p) => new THREE.Vector3(...p.pos));
    const look = points.map((p) => new THREE.Vector3(...p.look));
    this.path = {
      posCurve: new THREE.CatmullRomCurve3(pos, false, 'centripetal'),
      lookCurve: new THREE.CatmullRomCurve3(look, false, 'centripetal'),
      t: 0,
      total: dur * (points.length - 1),
      onDone,
    };
    this.mode = 'path';
    this.pos.copy(pos[0]);
    this.look.copy(look[0]);
  }

  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.shake = Math.min(1, this.shake + amount);
  }

  kickFov(amount) {
    this.fovKick = Math.max(this.fovKick, amount);
  }

  onDrag(dx, dy) {
    if (this.mode === 'follow') {
      this.yaw -= dx * 0.006;
      this.pitch = clamp(this.pitch + dy * 0.004, -0.15, 1.1);
      this._lastManual = this._t;
    } else if (this.mode === 'orbit') {
      this.orbitYaw -= dx * 0.008;
      this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -0.35, 0.9);
    }
  }

  onZoom(d) {
    if (this.mode === 'follow') {
      this.distance = clamp(this.distance + d, BALANCE.camera.minDistance, BALANCE.camera.maxDistance);
    } else if (this.mode === 'orbit') {
      this.orbitDist = clamp(this.orbitDist + d * 0.5, 1.2, 5);
    }
  }

  nudgeBehind(yaw, dt, strength = 1) {
    if (!this.autoAlign || this.mode !== 'follow') return;
    if (this._lastManual && this._t - this._lastManual < 2.5) return;
    this.yaw = dampAngle(this.yaw, yaw + Math.PI, 0.9 * strength, dt);
  }

  // ── Colisão ──────────────────────────────────────────────────────
  /**
   * Sonda grossa de `from` até `to`: 5 raios (centro + 4 em volta).
   * Devolve a posição segura (em `out`) e a distância livre.
   */
  _probe(from, to, out) {
    _dir.subVectors(to, from);
    const len = _dir.length();
    if (len < 1e-4 || !this.colliders.length) {
      out.copy(to);
      return len;
    }
    _dir.divideScalar(len);
    _right.crossVectors(_dir, UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _dir).normalize();
    const r = this.probeRadius;
    const offsets = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    let free = len;
    for (const [a, b] of offsets) {
      _o.copy(from).addScaledVector(_right, a).addScaledVector(_up, b);
      this.raycaster.set(_o, _dir);
      this.raycaster.near = 0;
      this.raycaster.far = len + this.wallMargin;
      const hit = this.raycaster.intersectObjects(this.colliders, false)[0];
      if (hit) free = Math.min(free, hit.distance - this.wallMargin);
    }
    // Nunca empurra a câmera pra dentro da parede: se não há espaço, fica perto (o jogo esconde o Luisão)
    free = clamp(free, 0.12, len);
    out.copy(from).addScaledVector(_dir, free);
    return free;
  }

  /** Respeita teto e chão no ponto. */
  _clampVertical(p, margin = 0.25) {
    const c = this.ceilingAt(p.x, p.z);
    if (p.y > c - margin) p.y = c - margin;
    if (p.y < this.floorY + 0.3) p.y = this.floorY + 0.3;
    return p;
  }

  _spherical(center, yaw, pitch, dist, out) {
    return out.set(
      center.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      center.y + Math.sin(pitch) * dist,
      center.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
  }

  /** Pitch máximo pra câmera caber debaixo do teto a essa distância. */
  _fitPitch(lookAt, pitch, dist, ceilY) {
    if (!Number.isFinite(ceilY)) return pitch;
    const room = ceilY - 0.3 - lookAt.y;
    const s = clamp(room / Math.max(0.1, dist), -0.25, 1);
    return Math.min(pitch, Math.asin(s));
  }

  _follow(dt) {
    const target = this.targetFn();
    const lookAt = new THREE.Vector3(target.x, target.y + 1.45, target.z);
    const ceilHere = this.ceilingAt(target.x, target.z);
    if (Number.isFinite(ceilHere)) lookAt.y = Math.min(lookAt.y, ceilHere - 0.45);
    let dist = this.distance;
    if (Number.isFinite(ceilHere)) dist = Math.min(dist, this.indoorMaxDist);

    // Candidatos: posição ideal + alternativas quando fica espremida (parede atrás):
    // mais alta, e deslizando pro lado ao longo da parede (como nos bons jogos de 3ª pessoa).
    const candidates = [
      [this.yaw, this.pitch, dist, 0],
      [this.yaw, this.pitch + 0.45, dist * 0.85, 0.3],
      [this.yaw + 0.55, this.pitch + 0.1, dist * 0.9, 0.4],
      [this.yaw - 0.55, this.pitch + 0.1, dist * 0.9, 0.4],
      [this.yaw + 1.2, this.pitch + 0.15, dist * 0.85, 0.55],
      [this.yaw - 1.2, this.pitch + 0.15, dist * 0.85, 0.55],
      [this.yaw + 1.9, this.pitch + 0.2, dist * 0.8, 0.75],
      [this.yaw - 1.9, this.pitch + 0.2, dist * 0.8, 0.75],
    ];
    // Prefere ficar do lado onde a câmera já está (não fica pulando de um lado pro outro)
    const curYaw = Math.atan2(this.pos.x - lookAt.x, this.pos.z - lookAt.z);
    let best = null;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < candidates.length; i++) {
      const [yaw, p0, d, basePenalty] = candidates[i];
      const penalty = basePenalty + (i ? 0.2 * (Math.abs(angleDelta(curYaw, yaw)) / Math.PI) : 0);
      const want = this._spherical(lookAt, yaw, 0, d, new THREE.Vector3());
      const pitch = this._fitPitch(lookAt, p0, d, Math.min(ceilHere, this.ceilingAt(want.x, want.z)));
      this._spherical(lookAt, yaw, pitch, d, want);
      this._clampVertical(want);
      const free = this._probe(lookAt, want, tmp);
      const score = free / d - penalty;
      if (!best || score > best.score) best = { pos: tmp.clone(), free, score };
      // A ideal está livre o bastante? Nem testa as outras.
      if (i === 0 && free >= Math.min(d, 1.7)) break;
    }
    const safe = best.pos;
    // Aproxima rápido (não atravessa parede), afasta devagar (sem tranco)
    const cur = this.pos.distanceTo(lookAt);
    const lambda = best.free < cur - 0.05 ? 18 : 6;
    this.pos.x = damp(this.pos.x, safe.x, lambda, dt);
    this.pos.y = damp(this.pos.y, safe.y, lambda, dt);
    this.pos.z = damp(this.pos.z, safe.z, lambda, dt);
    this._clampVertical(this.pos, 0.2);
    this.look.x = damp(this.look.x, lookAt.x, 10, dt);
    this.look.y = damp(this.look.y, lookAt.y, 10, dt);
    this.look.z = damp(this.look.z, lookAt.z, 10, dt);
  }

  update(dt) {
    this._t += dt;
    const cam = this.camera;

    if (this.mode === 'path' && this.path) {
      const p = this.path;
      p.t += dt;
      const u = clamp(p.t / p.total, 0, 1);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      p.posCurve.getPoint(e, this.pos);
      p.lookCurve.getPoint(e, this.look);
      if (u >= 1) {
        const done = p.onDone;
        this.path = null;
        this.mode = 'follow';
        done?.();
      }
    } else if (this.mode === 'follow') {
      this._follow(dt);
    } else if (this.mode === 'shot') {
      const want = this._clampVertical(_v.copy(this.wantPos));
      const safe = new THREE.Vector3();
      this._probe(this.wantLook, want, safe);
      this.pos.x = damp(this.pos.x, safe.x, this.shotLerp, dt);
      this.pos.y = damp(this.pos.y, safe.y, this.shotLerp, dt);
      this.pos.z = damp(this.pos.z, safe.z, this.shotLerp, dt);
      this.look.x = damp(this.look.x, this.wantLook.x, this.shotLerp * 1.3, dt);
      this.look.y = damp(this.look.y, this.wantLook.y, this.shotLerp * 1.3, dt);
      this.look.z = damp(this.look.z, this.wantLook.z, this.shotLerp * 1.3, dt);
    } else if (this.mode === 'orbit') {
      const c = this.orbitCenter;
      const lookAt = new THREE.Vector3(c.x, c.y + this.orbitHeight, c.z);
      const ceil = this.ceilingAt(c.x, c.z);
      const pitch = this._fitPitch(lookAt, this.orbitPitch, this.orbitDist, ceil);
      const want = this._clampVertical(this._spherical(lookAt, this.orbitYaw, pitch, this.orbitDist, new THREE.Vector3()));
      const safe = new THREE.Vector3();
      this._probe(lookAt, want, safe);
      this.pos.x = damp(this.pos.x, safe.x, 8, dt);
      this.pos.y = damp(this.pos.y, safe.y, 8, dt);
      this.pos.z = damp(this.pos.z, safe.z, 8, dt);
      this.look.x = damp(this.look.x, lookAt.x, 8, dt);
      this.look.y = damp(this.look.y, lookAt.y, 8, dt);
      this.look.z = damp(this.look.z, lookAt.z, 8, dt);
    }

    cam.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.09;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.4);
      // O tremor também não atravessa o teto
      const c = this.ceilingAt(cam.position.x, cam.position.z);
      if (cam.position.y > c - 0.12) cam.position.y = c - 0.12;
    }
    cam.lookAt(this.look);
    this.closeness = this.pos.distanceTo(this.look);
    // Direção em que a câmera REALMENTE olha (o movimento usa ela, não a ideal)
    this.viewYaw = Math.atan2(this.pos.x - this.look.x, this.pos.z - this.look.z);

    this.fovKick = Math.max(0, this.fovKick - dt * 8);
    const fov = this.fovBase - this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 14, dt);
      cam.updateProjectionMatrix();
    }
  }
}
