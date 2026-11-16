// ════════════════════════════════════════════════════════════════
//  Poses procedurais. Cada função escreve rotações das juntas em `p`.
//  Convenções (personagem olhando pra +Z, esquerda = +X):
//   - rot.x negativo num membro pendurado = balança pra FRENTE
//   - rot.z positivo no braço ESQUERDO = abre pro lado (s = +1 esq, −1 dir)
//   - joelho dobra com rot.x positivo; cotovelo dobra com rot.x negativo
//  Campos do corpo: p.bodyY (sobe/desce), p.bodyZ, p.pitch (deita).
// ════════════════════════════════════════════════════════════════

export const L1 = 0.46; // coxa
export const L2 = 0.44; // canela
export const HIP = L1 + L2 + 0.11; // altura do quadril em pé (tornozelo a 8 cm do chão)

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'clavL', 'clavR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
];

export function emptyPose() {
  const p = { bodyY: 0, bodyZ: 0, pitch: 0, lerp: 10 };
  for (const j of JOINTS) p[j] = [0, 0, 0];
  return p;
}

export function resetPose(p) {
  p.bodyY = 0;
  p.bodyZ = 0;
  p.pitch = 0;
  p.lerp = 10;
  for (const j of JOINTS) {
    const r = p[j];
    r[0] = r[1] = r[2] = 0;
  }
}

/** Perna dobrada mantendo o pé no chão: a = flexão do quadril, b = dobra do joelho. */
function legBend(p, side, a, b) {
  p['thigh' + side][0] = -a;
  p['shin' + side][0] = b;
  p['foot' + side][0] = a - b;
}

function legDrop(a, b) {
  return {
    y: L1 * Math.cos(a) + L2 * Math.cos(b - a) - (L1 + L2),
    z: -(L1 * Math.sin(a) - L2 * Math.sin(b - a)),
  };
}

function armsRelaxed(p, ctx, t) {
  const open = 0.09 + ctx.bulk * 0.16;
  const sway = Math.sin(t * 1.6) * 0.02;
  p.armL[2] = open + sway;
  p.armR[2] = -open - sway;
  p.foreL[0] = -0.12;
  p.foreR[0] = -0.12;
}

function posture(p, ctx) {
  // Postura: curvado (inseguro) → ereto e confiante.
  const s = ctx.slouch;
  p.spine[0] += s * 0.16;
  p.chest[0] += s * 0.1;
  p.neck[0] += s * 0.12;
  p.head[0] -= s * 0.05;
  p.clavL[1] -= s * 0.12;
  p.clavR[1] += s * 0.12;
}

const breathe = (t) => Math.sin(t * 1.9) * 0.02;

export const POSES = {
  idle(p, t, ctx) {
    armsRelaxed(p, ctx, t);
    p.chest[0] = -breathe(t);
    p.head[1] = Math.sin(t * 0.37) * 0.12;
    p.head[0] = Math.sin(t * 0.53) * 0.04;
    p.hips[2] = Math.sin(t * 0.8) * 0.015;
    // Peso numa perna
    p.thighL[2] = 0.02;
    p.thighR[2] = -0.04;
    posture(p, ctx);
  },

  walk(p, t, ctx) {
    const sp = ctx.speed ?? 1;
    const run = sp > 1.25;
    const f = t * (run ? 10.5 : 7.6) * Math.min(1.25, Math.max(0.6, sp));
    const amp = run ? 0.75 : 0.5;
    const s = Math.sin(f);
    const c = Math.cos(f);
    p.thighL[0] = s * amp;
    p.thighR[0] = -s * amp;
    p.shinL[0] = Math.max(0, -c) * (run ? 1.3 : 0.75) + 0.08;
    p.shinR[0] = Math.max(0, c) * (run ? 1.3 : 0.75) + 0.08;
    p.footL[0] = -s * 0.15;
    p.footR[0] = s * 0.15;
    p.armL[0] = -s * amp * 0.75;
    p.armR[0] = s * amp * 0.75;
    p.armL[2] = 0.1 + ctx.bulk * 0.15;
    p.armR[2] = -0.1 - ctx.bulk * 0.15;
    p.foreL[0] = run ? -1.25 : -0.25 - Math.max(0, s) * 0.2;
    p.foreR[0] = run ? -1.25 : -0.25 - Math.max(0, -s) * 0.2;
    p.bodyY = Math.abs(c) * (run ? 0.06 : 0.03) - (run ? 0.03 : 0.01);
    p.spine[0] = run ? 0.15 : 0.04;
    p.hips[1] = s * 0.08;
    p.chest[1] = -s * 0.12;
    posture(p, ctx);
  },

  talk(p, t, ctx) {
    POSES.idle(p, t, ctx);
    const g = Math.sin(t * 2.3);
    p.armR[0] = -0.35 - Math.max(0, g) * 0.35;
    p.foreR[0] = -1.1 - g * 0.25;
    p.armL[0] = -0.1 + Math.max(0, -g) * -0.25;
    p.foreL[0] = -0.4 + Math.min(0, g) * 0.5;
    p.head[0] = Math.sin(t * 3.1) * 0.06;
    p.head[1] = Math.sin(t * 0.9) * 0.15;
  },

  celebrate(p, t, ctx) {
    const b = Math.abs(Math.sin(t * 6));
    p.armL[2] = 2.55 + Math.sin(t * 6) * 0.15;
    p.armR[2] = -2.55 - Math.sin(t * 6) * 0.15;
    p.foreL[2] = 0.3;
    p.foreR[2] = -0.3;
    p.bodyY = b * 0.12;
    p.head[0] = -0.2;
    p.spine[0] = -0.06;
    p.thighL[0] = -b * 0.2;
    p.shinL[0] = b * 0.4;
  },

  flex(p, t, ctx) {
    // Duplo bíceps de frente (pose de fisiculturista).
    const pulse = Math.sin(t * 5) * 0.04;
    p.armL[2] = 1.5;
    p.armR[2] = -1.5;
    p.armL[0] = -0.1;
    p.armR[0] = -0.1;
    p.foreL[2] = 1.75 + pulse;
    p.foreR[2] = -1.75 - pulse;
    p.chest[0] = -0.08;
    p.head[0] = -0.08;
    p.thighL[2] = 0.12;
    p.thighR[2] = -0.12;
    p.lerp = 7;
  },

  sit(p, t, ctx) {
    legBend(p, 'L', 1.5, 1.5);
    legBend(p, 'R', 1.5, 1.5);
    p.footL[0] = 0;
    p.footR[0] = 0;
    p.bodyY = 0.55 - HIP;
    p.armL[0] = -0.55;
    p.armR[0] = -0.55;
    p.foreL[0] = -0.7;
    p.foreR[0] = -0.7;
    p.armL[2] = 0.15;
    p.armR[2] = -0.15;
    p.spine[0] = 0.12 + breathe(t);
    p.head[1] = Math.sin(t * 0.4) * 0.2;
  },

  sleep(p, t) {
    // Só pro cachorro não ficar sozinho: personagem deitado de lado.
    p.pitch = -Math.PI / 2;
    p.bodyY = 0.1;
    p.chest[0] = breathe(t) * 2;
  },

  // ── Exercícios (ctx.phase 0..1 controla a repetição) ─────────────
  pushup(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    const P = 1.17 + 0.2 * r;
    p.pitch = P;
    p.armL[0] = -P + 0.9 * r;
    p.armR[0] = -P + 0.9 * r;
    p.armL[2] = 0.22;
    p.armR[2] = -0.22;
    p.foreL[0] = -1.5 * r;
    p.foreR[0] = -1.5 * r;
    p.handL[0] = P - 0.4;
    p.handR[0] = P - 0.4;
    p.head[0] = -0.35;
    p.footL[0] = 0.9;
    p.footR[0] = 0.9;
    p.lerp = 26;
  },

  pullup(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.armL[2] = 2.9 - 1.3 * r;
    p.armR[2] = -(2.9 - 1.3 * r);
    p.foreL[2] = 1.96 * r;
    p.foreR[2] = -1.96 * r;
    p.bodyY = 0.28 + 0.3 * r;
    legBend(p, 'L', 0.25, 0.75);
    legBend(p, 'R', 0.3, 0.8);
    p.head[0] = -0.12 * r;
    p.lerp = 24;
  },

  press(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.armL[2] = 1.45 + 1.4 * r;
    p.armR[2] = -(1.45 + 1.4 * r);
    p.foreL[2] = 1.55 - 1.35 * r;
    p.foreR[2] = -(1.55 - 1.35 * r);
    p.armL[0] = -0.12;
    p.armR[0] = -0.12;
    p.chest[0] = -0.04 * r;
    p.thighL[2] = 0.08;
    p.thighR[2] = -0.08;
    p.lerp = 24;
  },

  curl(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.armL[0] = -0.12 - r * 0.18;
    p.armR[0] = -0.12 - r * 0.18;
    p.armL[2] = -0.04;
    p.armR[2] = 0.04;
    p.armL[1] = -0.35;
    p.armR[1] = 0.35;
    p.foreL[0] = -0.35 - 1.85 * r;
    p.foreR[0] = -0.35 - 1.85 * r;
    p.spine[0] = 0.03 - r * 0.05;
    p.thighL[2] = 0.06;
    p.thighR[2] = -0.06;
    p.lerp = 24;
  },

  dip(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    const top = 0.55;
    const h = top - 0.3 * r;
    const a = Math.acos(Math.min(0.99, (h - 0.08) / (L1 + L2)));
    p.bodyY = h - HIP;
    p.thighL[0] = -a;
    p.thighR[0] = -a;
    p.footL[0] = a - 0.3;
    p.footR[0] = a - 0.3;
    p.armL[0] = 0.15 + 0.85 * r;
    p.armR[0] = 0.15 + 0.85 * r;
    p.armL[2] = 0.22;
    p.armR[2] = -0.22;
    p.foreL[0] = -0.95 * r;
    p.foreR[0] = -0.95 * r;
    p.handL[0] = -0.6;
    p.handR[0] = -0.6;
    p.spine[0] = 0.12;
    p.lerp = 24;
  },

  crunch(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.pitch = -Math.PI / 2;
    p.bodyY = 0.12;
    p.thighL[0] = -1.0;
    p.thighR[0] = -1.0;
    p.shinL[0] = 1.9;
    p.shinR[0] = 1.9;
    p.footL[0] = -0.4;
    p.footR[0] = -0.4;
    p.spine[0] = 0.5 * r;
    p.chest[0] = 0.25 * r;
    p.neck[0] = 0.2 + 0.15 * r;
    p.armL[2] = 2.55;
    p.armR[2] = -2.55;
    p.foreL[2] = 2.0;
    p.foreR[2] = -2.0;
    p.lerp = 24;
  },

  squat(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    const a = 0.05 + 1.25 * r;
    const b = 0.08 + 1.75 * r;
    legBend(p, 'L', a, b);
    legBend(p, 'R', a, b);
    p.thighL[2] = 0.14;
    p.thighR[2] = -0.14;
    const d = legDrop(a, b);
    p.bodyY = d.y;
    p.bodyZ = d.z;
    p.spine[0] = 0.5 * r;
    p.chest[0] = 0.1 * r;
    p.head[0] = -0.45 * r;
    // Saco de cimento nos ombros (mãos segurando atrás da cabeça)
    p.armL[2] = 1.5;
    p.armR[2] = -1.5;
    p.armL[0] = 0.25;
    p.armR[0] = 0.25;
    p.foreL[2] = 1.9;
    p.foreR[2] = -1.9;
    p.lerp = 24;
  },

  /**
   * Supino reto (Iron Temple): deitado de costas no banco (o pé é o pivô, igual ao abdominal),
   * pernas dobradas com o pé no chão e a barra subindo e descendo no peito.
   * phase 0 = braços estendidos; meio da rep = barra no peito.
   */
  bench(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.pitch = -Math.PI / 2;
    p.bodyY = 0.57; // banco de 0,45 m + espessura das costas
    // coxa quase reta (um tiquinho pra baixo) e canela pra baixo: o pé encosta no chão (~0,1 m)
    p.thighL[0] = 0.05;
    p.thighR[0] = 0.05;
    p.thighL[2] = 0.12;
    p.thighR[2] = -0.12;
    p.shinL[0] = 1.5;
    p.shinR[0] = 1.5;
    p.footL[0] = -0.2;
    p.footR[0] = -0.2;
    p.armL[0] = -1.5 + 1.15 * r;
    p.armR[0] = -1.5 + 1.15 * r;
    p.armL[2] = 0.25 + 0.7 * r;
    p.armR[2] = -(0.25 + 0.7 * r);
    p.foreL[0] = -1.6 * r;
    p.foreR[0] = -1.6 * r;
    p.neck[0] = 0.1;
    p.chest[0] = -0.06 * r;
    p.lerp = 24;
  },

  /** Correndo na esteira (sem sair do lugar: quem anda é a esteira). */
  treadmill(p, t, ctx) {
    POSES.walk(p, t, { ...ctx, speed: 1.55 });
    p.lerp = 16;
  },

  calf(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.bodyY = 0.18 + 0.09 * r;
    p.footL[0] = 0.15 + 0.55 * r;
    p.footR[0] = 0.15 + 0.55 * r;
    p.armL[0] = -1.25;
    p.armR[0] = -1.25;
    p.armL[2] = 0.25;
    p.armR[2] = -0.25;
    p.foreL[0] = -0.35;
    p.foreR[0] = -0.35;
    p.lerp = 24;
  },

  jacks(p, t, ctx) {
    const r = Math.sin(ctx.phase * Math.PI);
    p.armL[2] = 0.15 + 2.75 * r;
    p.armR[2] = -(0.15 + 2.75 * r);
    p.thighL[2] = 0.32 * r;
    p.thighR[2] = -0.32 * r;
    p.footL[2] = -0.25 * r;
    p.footR[2] = 0.25 * r;
    p.bodyY = Math.sin(ctx.phase * Math.PI * 2) > 0 ? Math.sin(ctx.phase * Math.PI * 2) * 0.1 : 0;
    p.lerp = 26;
  },

  talkRep(p, t, ctx) {
    POSES.talk(p, t, ctx);
    const r = Math.sin(ctx.phase * Math.PI);
    p.armR[0] = -0.5 - r * 0.9;
    p.armR[2] = -0.2 - r * 0.6;
    p.foreR[0] = -1.4 + r * 0.4;
    p.head[0] = -0.12 * r + Math.sin(t * 9) * 0.05 * r;
    p.spine[0] = -0.05 * r;
  },

  /** Sentado no caixote digitando no notebook (cada tarefa = rajada de teclas). */
  typing(p, t, ctx) {
    legBend(p, 'L', 1.45, 1.5);
    legBend(p, 'R', 1.45, 1.5);
    p.footL[0] = 0.05;
    p.footR[0] = 0.05;
    p.thighL[2] = 0.08;
    p.thighR[2] = -0.08;
    p.bodyY = 0.47 - HIP;
    const r = Math.sin(ctx.phase * Math.PI);
    const k = Math.sin(t * 22) * 0.04 * (0.3 + r);
    p.spine[0] = 0.22 + breathe(t);
    p.chest[0] = 0.05;
    p.neck[0] = 0.18;
    p.head[0] = 0.12 - r * 0.05;
    p.head[1] = Math.sin(t * 0.6) * 0.06;
    p.armL[0] = -0.62 + k;
    p.armR[0] = -0.62 - k;
    p.armL[2] = 0.1;
    p.armR[2] = -0.1;
    p.foreL[0] = -0.95 - r * 0.12;
    p.foreR[0] = -0.95 - (1 - r) * 0.12;
    p.foreL[1] = 0.25;
    p.foreR[1] = -0.25;
    p.handL[0] = 0.25 + k * 2;
    p.handR[0] = 0.25 - k * 2;
    posture(p, ctx);
    p.lerp = 16;
  },

  /**
   * Motorista no banco do carro (visto de frente pela câmera interna): coxas quase horizontais,
   * pés nos pedais e as duas mãos no volante, que balança de leve com o trânsito.
   */
  driving(p, t, ctx) {
    legBend(p, 'L', 1.35, 0.55);
    legBend(p, 'R', 1.35, 0.55);
    p.thighL[2] = 0.05;
    p.thighR[2] = -0.05;
    p.bodyY = 0.47 - HIP;
    const sway = Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.015;
    p.spine[0] = 0.08 + breathe(t);
    p.chest[0] = 0.02;
    p.neck[0] = 0.04;
    p.head[0] = 0.02;
    p.head[1] = Math.sin(t * 0.45) * 0.05;
    p.armL[0] = -1.0;
    p.armR[0] = -1.0;
    p.armL[2] = 0.1 + sway;
    p.armR[2] = -0.1 + sway;
    p.foreL[0] = -0.65;
    p.foreR[0] = -0.65;
    p.foreL[1] = 0.2;
    p.foreR[1] = -0.2;
    p.handL[0] = 0.15;
    p.handR[0] = 0.15;
    posture(p, ctx);
    p.lerp = 10;
  },

  /** Passageiro no banco do carro: mãos no colo, balançando de leve com o movimento. */
  seated(p, t, ctx) {
    legBend(p, 'L', 1.38, 0.58);
    legBend(p, 'R', 1.38, 0.58);
    p.thighL[2] = 0.1;
    p.thighR[2] = -0.1;
    p.bodyY = 0.47 - HIP;
    p.spine[0] = -0.03 + breathe(t);
    p.chest[0] = 0.01;
    p.armL[0] = -0.5;
    p.armR[0] = -0.5;
    p.armL[2] = 0.13;
    p.armR[2] = -0.13;
    p.foreL[0] = -0.85;
    p.foreR[0] = -0.85;
    p.foreL[1] = 0.3;
    p.foreR[1] = -0.3;
    p.head[0] = 0.02 + Math.sin(t * 0.7) * 0.015;
    p.head[1] = Math.sin(t * 0.4) * 0.12;
    p.hips[2] = Math.sin(t * 0.9) * 0.012;
    p.lerp = 8;
  },

  /** Personal orientando: conta as reps com a mão e aponta. */
  coach(p, t, ctx) {
    POSES.idle(p, t, ctx);
    const c = Math.sin(t * 4.2);
    p.armR[0] = -0.9 - Math.max(0, c) * 0.5;
    p.armR[2] = -0.25;
    p.foreR[0] = -1.2 + c * 0.25;
    p.armL[0] = -0.35;
    p.armL[2] = 0.35;
    p.foreL[0] = -1.6;
    p.foreL[1] = 0.6;
    p.head[0] = Math.sin(t * 4.2) * 0.05;
    p.spine[0] = 0.05;
  },

  armwrestle(p, t, ctx) {
    // ctx.phase aqui = quem está ganhando (0 = perdendo, 1 = ganhando).
    const w = (ctx.phase - 0.5) * 2;
    legBend(p, 'L', 0.35, 0.5);
    legBend(p, 'R', 0.15, 0.3);
    const d = legDrop(0.25, 0.4);
    p.bodyY = d.y;
    p.spine[0] = 0.55;
    p.chest[0] = 0.15;
    p.head[0] = -0.5;
    p.armR[0] = -1.15;
    p.armR[2] = -0.25;
    p.foreR[0] = -1.15;
    p.foreR[2] = -w * 0.55;
    p.armL[0] = -0.8;
    p.armL[2] = 0.35;
    p.foreL[0] = -0.4;
    p.chest[1] = Math.sin(t * 30) * 0.015;
    p.lerp = 18;
  },
};

export const EXERCISES = new Set(['pushup', 'pullup', 'press', 'curl', 'dip', 'crunch', 'squat', 'calf', 'jacks', 'talkRep', 'typing', 'bench']);
