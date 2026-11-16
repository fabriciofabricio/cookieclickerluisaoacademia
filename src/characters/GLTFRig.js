import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MUSCLES } from '../config/balance.js';
import { clamp, damp, rand } from '../core/utils.js';
import { EXERCISES } from './Poses.js';

// ════════════════════════════════════════════════════════════════
//  Adaptador para personagens reais (.glb do Mixamo ou similar).
//  Mesma interface do ProceduralRig, então o jogo não sabe a diferença.
//  Músculos: 1) morph targets com nome do músculo, se existirem;
//            2) senão, escala por osso (com compensação nos filhos e
//               valores travados pra malha nunca "quebrar").
// ════════════════════════════════════════════════════════════════

// Nomes de ossos aceitos (com ou sem prefixo "mixamorig:" / "mixamorig").
const BONE_ALIASES = {
  hips: ['Hips'],
  spine: ['Spine', 'Spine1'],
  chest: ['Spine2', 'Chest', 'UpperChest'],
  neck: ['Neck'],
  head: ['Head'],
  clavL: ['LeftShoulder'],
  clavR: ['RightShoulder'],
  armL: ['LeftArm', 'LeftUpperArm'],
  armR: ['RightArm', 'RightUpperArm'],
  foreL: ['LeftForeArm', 'LeftLowerArm'],
  foreR: ['RightForeArm', 'RightLowerArm'],
  handL: ['LeftHand'],
  handR: ['RightHand'],
  thighL: ['LeftUpLeg', 'LeftUpperLeg'],
  thighR: ['RightUpLeg', 'RightUpperLeg'],
  shinL: ['LeftLeg', 'LeftLowerLeg'],
  shinR: ['RightLeg', 'RightLowerLeg'],
  footL: ['LeftFoot'],
  footR: ['RightFoot'],
};

// Nomes de morph targets aceitos por músculo.
const MORPH_ALIASES = {
  peito: ['peito', 'chest', 'pecs', 'pectorals'],
  costas: ['costas', 'back', 'lats', 'vtaper'],
  ombros: ['ombros', 'shoulders', 'delts'],
  biceps: ['biceps', 'bíceps'],
  triceps: ['triceps', 'tríceps'],
  abdomen: ['abdomen', 'abs', 'abdômen', 'sixpack'],
  pernas: ['pernas', 'legs', 'quads', 'thighs'],
  panturrilhas: ['panturrilhas', 'calves', 'calf'],
};

// Escala por osso: [osso, músculos que influenciam, eixo de espessura]
const BONE_SCALE = [
  { joint: 'chest', muscles: { costas: [0.24, 0, 0.06], peito: [0.06, 0, 0.16] }, children: ['neck', 'clavL', 'clavR'] },
  { joint: 'spine', muscles: { abdomen: [0.05, 0, 0.04], costas: [0.06, 0, 0] }, children: ['chest'] },
  { joint: 'clavL', muscles: { ombros: [0.18, 0.12, 0.18] }, children: ['armL'] },
  { joint: 'clavR', muscles: { ombros: [0.18, 0.12, 0.18] }, children: ['armR'] },
  { joint: 'armL', muscles: { biceps: [0.24, 0, 0.24], triceps: [0.2, 0, 0.2] }, children: ['foreL'] },
  { joint: 'armR', muscles: { biceps: [0.24, 0, 0.24], triceps: [0.2, 0, 0.2] }, children: ['foreR'] },
  { joint: 'foreL', muscles: { biceps: [0.1, 0, 0.1], triceps: [0.1, 0, 0.1] }, children: ['handL'] },
  { joint: 'foreR', muscles: { biceps: [0.1, 0, 0.1], triceps: [0.1, 0, 0.1] }, children: ['handR'] },
  { joint: 'thighL', muscles: { pernas: [0.36, 0, 0.36] }, children: ['shinL'] },
  { joint: 'thighR', muscles: { pernas: [0.36, 0, 0.36] }, children: ['shinR'] },
  { joint: 'shinL', muscles: { panturrilhas: [0.34, 0, 0.34] }, children: ['footL'] },
  { joint: 'shinR', muscles: { panturrilhas: [0.34, 0, 0.34] }, children: ['footR'] },
];

function findBone(root, aliases) {
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    const n = o.name.replace(/^mixamorig[:_]?/i, '').replace(/^.*[:|]/, '');
    if (aliases.some((a) => a.toLowerCase() === n.toLowerCase())) found = o;
  });
  return found;
}

export class GLTFRig {
  /**
   * @param gltf resultado do GLTFLoader
   * @param clips { idle: AnimationClip, ... } (podem vir de arquivos separados)
   * @param opts  { height: metros, muscular: bool }
   */
  constructor(gltf, clips = {}, opts = {}) {
    this.o = { height: 1.95, muscular: false, ...opts };
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    this.model.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        if (c.material) c.material = c.material.clone();
      }
    });

    // Normaliza a altura
    const box = new THREE.Box3().setFromObject(this.model);
    const h = box.max.y - box.min.y || 1;
    const s = this.o.height / h;
    this.model.scale.multiplyScalar(s);
    this.model.position.y -= box.min.y * s;

    this.j = {};
    for (const [k, aliases] of Object.entries(BONE_ALIASES)) {
      const b = findBone(this.model, aliases);
      if (b) {
        this.j[k] = b;
        b.userData.restScale = b.scale.clone();
      }
    }
    // Pontos de encaixe garantidos (mesmo sem osso)
    for (const k of ['handR', 'handL', 'head', 'chest', 'spine', 'armL', 'thighL', 'shinL', 'neck']) {
      if (!this.j[k]) this.j[k] = this.root;
    }

    this.morphs = [];
    this.model.traverse((c) => {
      if (c.isMesh && c.morphTargetDictionary) {
        const map = {};
        for (const [mus, names] of Object.entries(MORPH_ALIASES)) {
          for (const [key, idx] of Object.entries(c.morphTargetDictionary)) {
            if (names.includes(key.toLowerCase())) map[mus] = idx;
          }
        }
        if (Object.keys(map).length) this.morphs.push({ mesh: c, map });
      }
    });
    this.useMorphs = this.morphs.length > 0;

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const c = clip.clone();
      // Sem trilhas de escala (a escala é nossa) nem deslocamento horizontal do quadril.
      c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale'));
      for (const t of c.tracks) {
        if (/hips\.position$/i.test(t.name.replace(/^mixamorig[:_]?/i, ''))) {
          for (let i = 0; i < t.values.length; i += 3) {
            t.values[i] = t.values[0];
            t.values[i + 2] = t.values[2];
          }
        }
      }
      const a = this.mixer.clipAction(c);
      if (EXERCISES.has(name) || name === 'armwrestle') {
        a.play();
        a.paused = true;
        a.setEffectiveWeight(0);
      }
      this.actions[name] = a;
    }
    this.vis = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
    this.pump = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
    this.state = null;
    this.current = null;
    this.phase = 0;
    this.repQueue = 0;
    this.repDuration = 0.5;
    this.lookTarget = null;
    this.lookYaw = 0;
    this.talking = false;
    this.t = rand(0, 10);
    this.props = [];
    this.setState('idle');
  }

  get object3D() {
    return this.root;
  }

  setMuscles(visual) {
    Object.assign(this.vis, visual);
  }

  setPump(muscle, amount) {
    this.pump[muscle] = amount;
  }

  setShirtless(v) {
    this.model.traverse((c) => {
      if (c.isMesh && /shirt|top|camisa|regata/i.test(c.name)) c.visible = !v;
    });
  }

  setOutfit() {}

  setPosture(slouch) {
    this.slouch = slouch;
  }

  _actionFor(name) {
    if (this.actions[name]) return this.actions[name];
    if (name === 'talkRep') return this.actions.talk ?? this.actions.idle;
    if (name === 'typing') return this.actions.sit ?? this.actions.idle;
    if (name === 'driving' || name === 'seated') return this.actions.sit ?? this.actions.idle; // no carro (Uber)
    if (name === 'bench') return this.actions.crunch ?? this.actions.idle; // supino (Iron)
    if (name === 'treadmill') return this.actions.run ?? this.actions.walk ?? this.actions.idle; // esteira (Iron)
    if (name === 'coach') return this.actions.talk ?? this.actions.idle;
    if (name === 'walk' && this.speed > 1.25) return this.actions.run ?? this.actions.walk;
    return this.actions.idle ?? null;
  }

  setState(name, opts = {}) {
    if (opts.speed != null) this.speed = opts.speed;
    const want = name === 'walk' && this.speed > 1.25 && this.actions.run ? 'run' : name;
    if (want === this.state) return;
    this.state = want;
    const next = this._actionFor(want);
    if (next === this.current) return;
    const ex = EXERCISES.has(name) || name === 'armwrestle';
    if (next) {
      if (ex) {
        next.paused = true;
        next.setEffectiveWeight(1);
        next.enabled = true;
        next.play();
      } else {
        next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
      }
    }
    if (this.current) this.current.fadeOut(0.25);
    this.current = next;
    this.phase = 0;
    this.repQueue = 0;
  }

  rep(duration = 0.5) {
    this.repDuration = duration;
    this.repQueue = Math.min(this.repQueue + 1, 3);
  }

  setPhase(v) {
    this.phase = v;
  }

  lookAt(p) {
    this.lookTarget = p;
  }

  attach(obj, joint = 'handR') {
    const bone = this.j[joint] ?? this.root;
    // Bones do Mixamo vêm em cm-escala; compensa pra prop ficar no tamanho certo.
    const ws = new THREE.Vector3();
    bone.getWorldScale(ws);
    obj.scale.divideScalar(ws.x || 1);
    bone.add(obj);
    this.props.push(obj);
    return obj;
  }

  detach(obj) {
    obj.parent?.remove(obj);
  }

  get headWorld() {
    return this.j.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
  }

  muscleAnchor(m) {
    const map = { peito: 'chest', costas: 'chest', ombros: 'clavL', biceps: 'armL', triceps: 'armL', abdomen: 'spine', pernas: 'thighL', panturrilhas: 'shinL' };
    return this.j[map[m]] ?? this.root;
  }

  _applyMuscles() {
    if (!this.o.muscular) return;
    const v = this.vis;
    if (this.useMorphs) {
      for (const { mesh, map } of this.morphs) {
        for (const [m, idx] of Object.entries(map)) mesh.morphTargetInfluences[idx] = clamp(v[m] + this.pump[m] * 0.05, 0, 1);
      }
      return;
    }
    // Escala por osso. Base "palito" = 0,82; máximo travado em ~1,3.
    const scales = {};
    for (const rule of BONE_SCALE) {
      const bone = this.j[rule.joint];
      if (!bone?.isBone) continue;
      let sx = 0.86;
      let sy = 1;
      let sz = 0.86;
      for (const [m, [kx, ky, kz]] of Object.entries(rule.muscles)) {
        const val = v[m] + this.pump[m] * 0.06;
        sx += kx * val * 1.4;
        sy += ky * val;
        sz += kz * val * 1.4;
      }
      sx = clamp(sx, 0.8, 1.32);
      sy = clamp(sy, 0.95, 1.12);
      sz = clamp(sz, 0.8, 1.32);
      const rs = bone.userData.restScale;
      bone.scale.set(rs.x * sx, rs.y * sy, rs.z * sz);
      scales[rule.joint] = [sx, sy, sz];
    }
    // Compensação: filhos não herdam a espessura do pai.
    for (const rule of BONE_SCALE) {
      const s = scales[rule.joint];
      if (!s) continue;
      for (const c of rule.children) {
        const child = this.j[c];
        if (!child?.isBone) continue;
        const own = scales[c] ?? [1, 1, 1];
        const rs = child.userData.restScale;
        child.scale.set((rs.x * own[0]) / s[0], (rs.y * own[1]) / s[1], (rs.z * own[2]) / s[2]);
      }
    }
  }

  update(dt) {
    this.t += dt;
    const ex = EXERCISES.has(this.state) || this.state === 'armwrestle';
    if (ex && this.state !== 'armwrestle') {
      if (this.repQueue > 0) {
        this.phase += (dt / this.repDuration) * (1 + (this.repQueue - 1) * 0.8);
        if (this.phase >= 1) {
          this.phase = 0;
          this.repQueue--;
        }
      }
    }
    if (ex && this.current) {
      const d = this.current.getClip().duration;
      this.current.time = this.phase * d * 0.999;
    }
    // Restaura a cabeça antes do mixer (o "olhar" é aditivo e não pode acumular).
    if (this._headQ && this.j.head?.isBone) this.j.head.quaternion.copy(this._headQ);
    this.mixer.update(dt);
    if (this.j.head?.isBone) (this._headQ ??= new THREE.Quaternion()).copy(this.j.head.quaternion);
    this._applyMuscles();

    if (this.lookTarget && !ex && this.j.head?.isBone) {
      const hp = this.j.head.getWorldPosition(new THREE.Vector3());
      let rel = Math.atan2(this.lookTarget.x - hp.x, this.lookTarget.z - hp.z) - this.root.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      this.lookYaw = damp(this.lookYaw, Math.abs(rel) < 1.9 ? clamp(rel, -1.1, 1.1) : 0, 5, dt);
    } else {
      this.lookYaw = damp(this.lookYaw, 0, 4, dt);
    }
    if (this.j.head?.isBone && Math.abs(this.lookYaw) > 0.001) {
      this.j.head.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), this.lookYaw);
    }
  }
}
