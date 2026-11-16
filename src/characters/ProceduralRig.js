import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { POSES, EXERCISES, JOINTS, emptyPose, resetPose } from './Poses.js';
import { BodyShape, Loft, SK, REST, bell, smoothstep } from './BodyGen.js';
import { buildHead } from './HeadGen.js';
import { skinMap, skinNormal, clothMaps, shoeMap } from './CharTextures.js';
import { MUSCLES } from '../config/balance.js';
import { clamp, damp, lerp, rand } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Humanoide procedural "realista": esqueleto de verdade (Bones) +
//  corpo contínuo com skinning (BodyGen), cabeça esculpida com rosto
//  pintado (HeadGen), mãos com dedos, tênis e roupas que acompanham o
//  corpo. Cada músculo muda a forma da malha de modo independente.
//  Usado quando não existe o .glb do personagem em /public/assets.
// ════════════════════════════════════════════════════════════════

const DEFAULTS = {
  skin: 0xe9b995,
  hairColor: 0x3a2a1a,
  hairStyle: 'short',
  eyeColor: 0x3b5d8a,
  height: 1,
  build: 0.35,
  female: false,
  top: 0x777777,
  topStyle: 'tee', // tee | tank | band | hoodie | polo | none
  bottom: 0x2a3550,
  bottomStyle: 'shorts', // shorts | pants | skirt
  shoes: 0xeeeeee,
  shoeAccent: 0x3a6ad8,
  belly: 0,
  mustache: false,
  glasses: false,
  braces: false,
  freckles: false,
  stubble: null,
  makeup: null,
  apron: null,
  cap: null,
  bandPrint: null, // função print(ctx, w, h) da estampa
  muscular: false,
};

const _tmp = new THREE.Vector3();

function skinMaterial(color, vertexColors) {
  const n = skinNormal().clone();
  n.repeat.set(10, 10);
  n.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({
    map: skinMap(color),
    normalMap: n,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.5,
    sheen: 0.6,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xff8466),
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    vertexColors,
  });
}

function fabricMaterial(color, kind, print) {
  const maps = clothMaps(print ? color : 0xeeeeee, kind, print ? `print${color}` : null, print);
  return new THREE.MeshPhysicalMaterial({
    color: print ? 0xffffff : color,
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.86,
    sheen: 0.5,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(print ? 0xffffff : color).lerp(new THREE.Color(0xffffff), 0.5),
  });
}

export class ProceduralRig {
  constructor(options = {}) {
    this.o = { ...DEFAULTS, ...options };
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.j = {};
    this.vis = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
    this.pump = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
    this.state = 'idle';
    this.t = rand(0, 10);
    this.phase = 0;
    this.repQueue = 0;
    this.repDuration = 0.5;
    this.speed = 1;
    this.slouch = 0;
    this.talking = false;
    this.lookTarget = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.blinkT = rand(1, 4);
    this.target = emptyPose();
    // Rotação suavizada da pose, separada da rotação final do osso
    this.cur = Object.fromEntries(JOINTS.map((n) => [n, [0, 0, 0]]));
    this.ctx = { phase: 0, speed: 1, slouch: 0, bulk: 0 };
    this.shirtless = false;
    this.props = [];
    this._dirty = true;
    this._rebuildT = 0;
    this._build();
    this.setMuscles(this.vis);
    this._rebuild();
    this.setShirtless(false);
  }

  get object3D() {
    return this.root;
  }

  // ── Esqueleto ────────────────────────────────────────────────────
  _bone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    (parent ?? this.body).add(b);
    this.j[name] = b;
    return b;
  }

  _build() {
    const o = this.o;
    const f = o.female;
    const armX = f ? 0.165 : 0.19;
    this.shape = new BodyShape({ female: f, belly: o.belly, armX });
    if (!o.muscular) {
      // NPC: músculos fixos a partir do "build"
      const b = o.build;
      for (const m of MUSCLES) this.shape.M[m] = f ? b * 0.35 : b * 0.85;
      this.shape.absLevel = f ? 0 : b * 70;
    }

    const hips = this._bone('hips', this.body, 0, SK.hipY, 0);
    const spine = this._bone('spine', hips, 0, SK.spine, 0);
    const chest = this._bone('chest', spine, 0, SK.chest, 0);
    const neck = this._bone('neck', chest, 0, SK.neck, -0.01);
    this._bone('head', neck, 0, SK.head, 0.01);
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      const clav = this._bone('clav' + s, chest, sx * SK.clav[0], SK.clav[1], SK.clav[2]);
      const arm = this._bone('arm' + s, clav, sx * (armX - SK.clav[0]), SK.armDrop, -SK.clav[2]);
      const fore = this._bone('fore' + s, arm, 0, -SK.upper, 0);
      this._bone('hand' + s, fore, 0, -SK.fore, 0);
      const thigh = this._bone('thigh' + s, hips, sx * SK.thighX, SK.thighY, 0);
      const shin = this._bone('shin' + s, thigh, 0, -SK.L1, 0);
      this._bone('foot' + s, shin, 0, -SK.L2, 0);
    }
    const bones = JOINTS.map((n) => this.j[n]);
    const bi = (n) => JOINTS.indexOf(n);
    this.skeleton = new THREE.Skeleton(bones);

    // Materiais
    this.skinBody = skinMaterial(o.skin, true);
    this.skinRigid = skinMaterial(o.skin, false);
    const kindTop = o.topStyle === 'hoodie' ? 'knit' : 'cotton';
    this.topMat = fabricMaterial(o.top, kindTop, o.bandPrint);
    // Mangas: mesmo tecido, sem estampa (senão a caveira aparece nos ombros)
    this.sleeveMat = o.bandPrint ? fabricMaterial(o.top, kindTop, null) : this.topMat;
    this.bottomMat = fabricMaterial(o.bottom, o.bottomStyle === 'pants' ? 'denim' : o.bottomStyle === 'shorts' ? 'sport' : 'cotton', null);
    const torsoSegs = [
      { bone: bi('hips'), y: -Infinity },
      { bone: bi('spine'), y: REST.spineY },
      { bone: bi('chest'), y: REST.chestY },
      { bone: bi('neck'), y: REST.neckY },
      { bone: bi('head'), y: REST.headY + 0.02 },
    ];
    const armSegs = (s) => [
      { bone: bi('hand' + s), y: -Infinity },
      { bone: bi('fore' + s), y: REST.wristY },
      { bone: bi('arm' + s), y: REST.elbowY },
    ];
    const legSegs = (s) => [
      { bone: bi('foot' + s), y: -Infinity },
      { bone: bi('shin' + s), y: REST.ankleY },
      { bone: bi('thigh' + s), y: REST.kneeY },
    ];

    this.parts = [];
    const add = (loft, mat, fn, kind) => {
      const mesh = new THREE.SkinnedMesh(loft.geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.body.add(mesh);
      const part = { loft, mesh, fn, kind };
      this.parts.push(part);
      return part;
    };
    const S = this.shape;
    const yTopArm = REST.armY + 0.085;

    // Corpo
    this.torsoPart = add(new Loft({ yTop: REST.headY + 0.06, yBot: SK.hipY - 0.155, rings: 76, radial: 80, segs: torsoSegs }), this.skinBody, () => [
      (y, th) => S.torso(y, th),
      (y) => S.torsoCenter(y),
      (y, th) => S.torsoFlush(y, th),
    ]);
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      add(new Loft({ yTop: yTopArm, yBot: REST.wristY - 0.012, rings: 46, radial: 28, segs: armSegs(s) }), this.skinBody, () => [
        (y, th) => S.arm(REST.armY - y, th, sx),
        (y) => S.armCenter(REST.armY - y, sx),
        (y, th) => S.armFlush(REST.armY - y, th),
      ]);
      add(new Loft({ yTop: REST.thighY + 0.095, yBot: REST.ankleY - 0.035, rings: 58, radial: 32, segs: legSegs(s) }), this.skinBody, () => [
        (y, th) => S.leg(REST.thighY - y, th, sx),
        (y) => S.legCenter(REST.thighY - y, sx),
        (y, th) => S.legFlush(REST.thighY - y, th),
      ]);
    }

    // Roupa de cima
    const loose = () => (1 - S.avg) * (this.o.topStyle === 'tank' ? 0.005 : 0.014);
    const shirtR = (y, th) => {
      const yr = y - SK.hipY;
      let r = S.torso(y, th, { bulge: 0.6, abs: 0 }) + 0.009 + loose() * bell(yr, 0.15, 0.22);
      if (yr < -0.02) r += 0.004;
      const sn = Math.abs(Math.sin(th));
      if (this.o.topStyle === 'tank') {
        const arm = smoothstep(0.66, 0.78, sn) * smoothstep(0.33, 0.4, yr);
        const neckline = smoothstep(0.62, 0.85, Math.cos(th)) * smoothstep(0.47, 0.53, yr);
        const cut = Math.max(arm, neckline);
        r = lerp(r, S.torso(y, th) - 0.007, cut);
      }
      return r;
    };
    this.shirtPart = add(new Loft({ yTop: REST.neckY - 0.03, yBot: SK.hipY - 0.07, rings: 60, radial: 80, segs: torsoSegs }), this.topMat, () => [shirtR, (y) => S.torsoCenter(y), null], 'shirt');
    this.sleeveParts = [];
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      const long = o.topStyle === 'hoodie';
      const p = add(new Loft({ yTop: yTopArm, yBot: long ? REST.wristY + 0.01 : REST.armY - 0.16, rings: long ? 40 : 18, radial: 28, segs: armSegs(s) }), this.topMat, () => [
        (y, th) => {
          const d = REST.armY - y;
          return S.arm(d, th, sx, { bulge: 0.6 }) + 0.009 + (long ? 0.006 : 0.006 * smoothstep(0.09, 0.16, d));
        },
        (y) => S.armCenter(REST.armY - y, sx),
        null,
      ], 'sleeve');
      p.mesh.material = this.sleeveMat;
      this.sleeveParts.push(p);
    }

    // Roupa de baixo
    const bottomTop = SK.hipY + 0.075;
    this.bottomParts = [];
    if (o.bottomStyle === 'skirt') {
      this.bottomParts.push(add(new Loft({ yTop: bottomTop, yBot: SK.hipY - 0.46, rings: 18, radial: 48, segs: [{ bone: bi('hips'), y: -Infinity }] }), this.bottomMat, () => [
        (y, th) => {
          const drop = bottomTop - y;
          const base = S.torso(Math.max(y, SK.hipY - 0.1), th, { bulge: 0.4, abs: 0 }) + 0.012;
          return base + Math.max(0, drop - 0.1) * 0.22;
        },
        () => [0, 0],
        null,
      ]));
    } else {
      this.bottomParts.push(add(new Loft({ yTop: bottomTop, yBot: SK.hipY - 0.155, rings: 20, radial: 64, segs: torsoSegs }), this.bottomMat, () => [
        (y, th) => S.torso(y, th, { bulge: 0.5, abs: 0 }) + 0.012 + (this.o.belly ? 0.004 : 0),
        (y) => S.torsoCenter(y),
        null,
      ]));
      const pants = o.bottomStyle === 'pants';
      for (const [s, sx] of [['L', 1], ['R', -1]]) {
        this.bottomParts.push(add(new Loft({ yTop: REST.thighY + 0.095, yBot: pants ? REST.ankleY + 0.01 : REST.thighY - 0.27, rings: pants ? 50 : 22, radial: 32, segs: legSegs(s) }), this.bottomMat, () => [
          (y, th) => {
            const d = REST.thighY - y;
            return S.leg(d, th, sx, { bulge: 0.5 }) + 0.012 + (pants ? 0.008 * smoothstep(0.3, 0.9, d) : 0.013 * smoothstep(0.1, 0.27, d));
          },
          (y) => S.legCenter(REST.thighY - y, sx),
          null,
        ]));
      }
    }
    if (o.apron) {
      const apronMat = fabricMaterial(o.apron, 'cotton', null);
      add(new Loft({ yTop: SK.hipY + 0.36, yBot: SK.hipY - 0.32, rings: 20, radial: 24, th0: -1.05, th1: 1.05, segs: torsoSegs }), apronMat, () => [
        (y, th) => Math.max(S.torso(Math.max(y, SK.hipY - 0.1), th, { bulge: 0.5, abs: 0 }) + 0.024, 0.1),
        (y) => S.torsoCenter(y),
        null,
      ]);
    }

    // Cabeça
    this.head = buildHead({
      female: f,
      skin: o.skin,
      eyeColor: o.eyeColor,
      hairColor: o.hairColor,
      hairStyle: o.hairStyle,
      brow: new THREE.Color(o.hairColor).multiplyScalar(o.hairStyle === 'blond' ? 0.62 : 0.9).getHex(),
      stubble: o.stubble,
      freckles: o.freckles,
      makeup: o.makeup,
      glasses: o.glasses,
      braces: o.braces,
      cap: o.cap,
      mustache: o.mustache,
      lips: o.lips,
    });
    this.j.head.add(this.head.group);

    // Mãos, tênis, veias
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      this.j['hand' + s].add(this._hand(sx, f));
      this.j['foot' + s].add(this._shoe(f));
    }
    this.veinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.skin).multiply(new THREE.Color(0x9cb0d8)), roughness: 0.5, transparent: true, opacity: 0 });
    this.veins = [];

    // Bind na pose de descanso
    this.root.updateMatrixWorld(true);
    for (const p of this.parts) p.mesh.bind(this.skeleton);
  }

  _hand(sx, female) {
    const g = new THREE.Group();
    const m = this.skinRigid;
    const k = female ? 0.86 : 1;
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.027, 0.082, 0.075, 3, 0.011), m);
    palm.position.set(0, -0.046, 0.004);
    palm.castShadow = true;
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const len = [0.05, 0.058, 0.055, 0.044][i];
      const fg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, len, 4, 8), m);
      fg.position.set(-sx * 0.003, -0.087 - len / 2, 0.028 - i * 0.0185);
      fg.rotation.x = 0.06 * (i - 1.5);
      fg.rotation.z = sx * 0.12;
      fg.castShadow = true;
      g.add(fg);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.04, 4, 8), m);
    thumb.position.set(-sx * 0.006, -0.04, 0.042);
    thumb.rotation.set(0.75, 0, sx * 0.2);
    thumb.castShadow = true;
    g.add(thumb);
    g.scale.setScalar(k);
    return g;
  }

  _shoe(female) {
    const o = this.o;
    const g = new THREE.Group();
    const upper = new THREE.SphereGeometry(1, 28, 16);
    const p = upper.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i);
      const z = p.getZ(i);
      if (y < -0.35) y = -0.35;
      // Bico mais baixo, calcanhar mais alto
      y -= Math.max(0, z) * 0.25 * (y > 0 ? 1 : 0);
      p.setY(i, y);
    }
    upper.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ map: shoeMap(o.shoes, o.shoeAccent), roughness: 0.55, sheen: 0.3 });
    this.shoeMat = mat;
    const k = female ? 0.88 : 1;
    const u = new THREE.Mesh(upper, mat);
    u.scale.set(0.05 * k, 0.045, 0.128 * k);
    u.position.set(0, -0.036, 0.046);
    u.castShadow = true;
    g.add(u);
    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.102 * k, 0.024, 0.27 * k, 3, 0.01), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 }));
    sole.position.set(0, -0.06, 0.046);
    sole.castShadow = true;
    g.add(sole);
    return g;
  }

  _rebuildVeins() {
    const S = this.shape;
    const show = this.o.muscular ? smoothstep(0.58, 0.85, (S.M.biceps + S.M.triceps) / 2) : 0;
    this.veinMat.opacity = show * 0.85;
    if (show <= 0.02) {
      for (const v of this.veins) v.visible = false;
      return;
    }
    for (const v of this.veins) {
      v.parent?.remove(v);
      v.geometry.dispose();
    }
    this.veins = [];
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      const th = sx * 0.3;
      const ptsF = [];
      const ptsA = [];
      for (let i = 0; i <= 6; i++) {
        const d = SK.upper + 0.02 + (i / 6) * 0.2;
        const r = S.arm(d, th, sx) + 0.0012;
        ptsF.push(new THREE.Vector3(r * Math.sin(th) + Math.sin(i * 1.7) * 0.003, -(d - SK.upper), r * Math.cos(th)));
        const da = 0.08 + (i / 6) * 0.17;
        const thA = sx * 0.12;
        const ra = S.arm(da, thA, sx) + 0.0012;
        ptsA.push(new THREE.Vector3(ra * Math.sin(thA) + Math.sin(i * 2.1) * 0.002, -da, ra * Math.cos(thA)));
      }
      const vf = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ptsF), 24, 0.0017, 5), this.veinMat);
      const va = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ptsA), 20, 0.0015, 5), this.veinMat);
      this.j['fore' + s].add(vf);
      this.j['arm' + s].add(va);
      this.veins.push(vf, va);
    }
  }

  _rebuild() {
    for (const p of this.parts) {
      const [r, c, f] = p.fn();
      p.loft.update(r, c, f);
    }
    this._rebuildVeins();
    this._dirty = false;
  }

  // ── Músculos ───────────────────────────────────────────────────
  /** visual: { peito: 0..1, ... } (já interpolado entre os estágios). */
  setMuscles(visual) {
    Object.assign(this.vis, visual);
    if (!this.o.muscular) return;
    for (const m of MUSCLES) this.shape.M[m] = this.vis[m];
    this.shape.absLevel = levelFromVisual(this.vis.abdomen);
    this.ctx.bulk = this.shape.avg;
    this._dirty = true;
  }

  setPump(muscle, amount) {
    if (!(muscle in this.pump)) return;
    this.pump[muscle] = amount;
    this.shape.pump[muscle] = amount;
    this._dirty = true;
  }

  setShirtless(v) {
    this.shirtless = v;
    const hide = v || this.o.topStyle === 'none';
    this.shirtPart.mesh.visible = !hide;
    for (const p of this.sleeveParts) p.mesh.visible = !hide && this._sleeved();
  }

  _sleeved() {
    return ['tee', 'band', 'polo', 'hoodie'].includes(this.o.topStyle);
  }

  /** Troca o visual da roupa (upgrade por nível de história). */
  setOutfit({ top, topStyle, bottom, shoes }) {
    if (top != null && !this.o.bandPrint) {
      this.topMat.color.set(top);
      this.sleeveMat.color.set(top);
    }
    if (bottom != null) this.bottomMat.color.set(bottom);
    if (shoes != null && shoes !== this.o.shoes) {
      this.o.shoes = shoes;
      this.shoeMat.map = shoeMap(shoes, this.o.shoeAccent);
      this.shoeMat.needsUpdate = true;
    }
    if (topStyle && topStyle !== this.o.topStyle) {
      this.o.topStyle = topStyle;
      this._dirty = true;
    }
    this.setShirtless(this.shirtless);
  }

  setPosture(slouch) {
    this.slouch = slouch;
  }

  // ── Animação ───────────────────────────────────────────────────
  setState(name, opts = {}) {
    if (name !== this.state) {
      this.state = name;
      if (EXERCISES.has(name)) {
        this.phase = 0;
        this.repQueue = 0;
      }
    }
    if (opts.speed != null) this.speed = opts.speed;
  }

  rep(duration = 0.5) {
    this.repDuration = duration;
    this.repQueue = Math.min(this.repQueue + 1, 3);
  }

  setPhase(v) {
    this.phase = v;
    this.repQueue = 0;
  }

  lookAt(worldPos) {
    this.lookTarget = worldPos;
  }

  attach(obj, joint = 'handR') {
    this.j[joint].add(obj);
    this.props.push(obj);
    return obj;
  }

  detach(obj) {
    obj.parent?.remove(obj);
    this.props = this.props.filter((p) => p !== obj);
  }

  /** Altura dos olhos no mundo (alvo de olhar, câmera, números flutuantes). */
  get headWorld() {
    return this.head.eyeAnchor.getWorldPosition(new THREE.Vector3());
  }

  muscleAnchor(muscle) {
    const map = {
      peito: 'chest', costas: 'chest', ombros: 'armL', biceps: 'armL', triceps: 'armL',
      abdomen: 'spine', pernas: 'thighL', panturrilhas: 'shinL',
    };
    return this.j[map[muscle] ?? 'chest'];
  }

  update(dt) {
    this.t += dt;
    const ex = EXERCISES.has(this.state);
    if (ex) {
      if (this.repQueue > 0) {
        const speedUp = 1 + (this.repQueue - 1) * 0.8;
        this.phase += (dt / this.repDuration) * speedUp;
        if (this.phase >= 1) {
          this.phase = 0;
          this.repQueue--;
        }
      } else {
        this.phase = Math.max(0, this.phase - dt * 2);
      }
    }
    const ctx = this.ctx;
    ctx.phase = this.phase;
    ctx.speed = this.speed;
    ctx.slouch = this.slouch;

    const p = this.target;
    resetPose(p);
    (POSES[this.state] ?? POSES.idle)(p, this.t, ctx);

    const k = p.lerp;
    for (const name of JOINTS) {
      const c = this.cur[name];
      const r = p[name];
      c[0] = damp(c[0], r[0], k, dt);
      c[1] = damp(c[1], r[1], k, dt);
      c[2] = damp(c[2], r[2], k, dt);
      // Sempre a partir da pose suavizada: offsets aditivos (olhar) não acumulam.
      this.j[name].rotation.set(c[0], c[1], c[2]);
    }
    this.body.position.y = damp(this.body.position.y, p.bodyY, k, dt);
    this.body.position.z = damp(this.body.position.z, p.bodyZ, k, dt);
    this.body.rotation.x = damp(this.body.rotation.x, p.pitch, k * 0.6, dt);

    // Olhar: calculado a partir dos PRÓPRIOS olhos, com inclinação contida.
    let wantYaw = 0;
    let wantPitch = 0;
    if (this.lookTarget && !ex && this.state !== 'armwrestle') {
      const eye = this.head.eyeAnchor.getWorldPosition(_tmp);
      const dx = this.lookTarget.x - eye.x;
      const dz = this.lookTarget.z - eye.z;
      const dy = this.lookTarget.y - eye.y;
      let rel = Math.atan2(dx, dz) - this.root.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) < 1.9) {
        wantYaw = clamp(rel, -1.0, 1.0);
        wantPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)) * 0.55, -0.16, 0.16);
      }
    }
    this.lookYaw = damp(this.lookYaw, wantYaw, 5, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    this.j.head.rotation.y = clamp(this.j.head.rotation.y + this.lookYaw * 0.65, -0.9, 0.9);
    this.j.neck.rotation.y = clamp(this.j.neck.rotation.y + this.lookYaw * 0.25, -0.4, 0.4);
    this.j.head.rotation.x = clamp(this.j.head.rotation.x + this.lookPitch, -0.6, 0.6);

    // Piscar + olhos acompanham um pouco o alvo
    this.blinkT -= dt;
    let closed = 0;
    if (this.blinkT < 0.13) closed = 1 - Math.abs(this.blinkT - 0.065) / 0.065;
    if (this.blinkT < 0) this.blinkT = rand(2, 5.5);
    const effort = ex ? Math.sin(this.phase * Math.PI) : 0;
    this.head.setBlink(Math.max(closed, effort * 0.35), this.lookYaw * 0.4, this.lookPitch * 0.8);

    // Boca: fala / esforço
    const talk = this.talking || this.state === 'talk' || this.state === 'talkRep';
    const open = talk ? clamp(Math.abs(Math.sin(this.t * 13)) * 0.7 + Math.abs(Math.sin(this.t * 7.7)) * 0.4, 0, 1) : effort * 0.3;
    this.head.setMouth(open);

    // Pump some devagar
    for (const m of MUSCLES) {
      if (this.pump[m] > 0) {
        this.pump[m] = Math.max(0, this.pump[m] - dt * 0.35);
        this.shape.pump[m] = this.pump[m];
        this._dirty = true;
      }
    }
    // Reconstrói a malha no máximo ~15x/s
    this._rebuildT -= dt;
    if (this._dirty && this._rebuildT <= 0) {
      this._rebuild();
      this._rebuildT = 1 / 15;
    }

    this.head.hair?.update(dt, this.j.head);
  }
}

const STAGE_LV = [0, 15, 30, 50, 75, 100];
const STAGE_VIS = [0, 0.2, 0.4, 0.6, 0.8, 1];

function levelFromVisual(v) {
  for (let i = 0; i < STAGE_VIS.length - 1; i++) {
    if (v <= STAGE_VIS[i + 1]) return lerp(STAGE_LV[i], STAGE_LV[i + 1], (v - STAGE_VIS[i]) / (STAGE_VIS[i + 1] - STAGE_VIS[i]));
  }
  return 100;
}

/** Converte nível (0..100) em valor visual 0..1 passando pelos estágios. */
export function visualFromLevel(level, stages) {
  const vals = STAGE_VIS;
  const L = clamp(level, 0, 100);
  for (let i = 0; i < stages.length - 1; i++) {
    if (L <= stages[i + 1]) {
      const t = (L - stages[i]) / (stages[i + 1] - stages[i]);
      const e = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return lerp(vals[i], vals[i + 1], e);
    }
  }
  return 1;
}

export function stageIndex(level, stages) {
  let idx = 0;
  for (let i = 0; i < stages.length; i++) if (level >= stages[i]) idx = i;
  return idx;
}
