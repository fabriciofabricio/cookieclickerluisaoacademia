// ════════════════════════════════════════════════════════════════
//  MÉTODO NEUMMAN — a árvore de habilidades vendida pelo Matheus.
//  Estrutura: ramo, pré-requisitos, efeito por nível e posição na
//  constelação. Custos em balance.js (metodo), textos em pt-BR.js.
//
//  tier: academia onde a técnica ABRE (0 garagem, 1 iron, 2 olympus).
//  caps: até que nível dá pra subir em cada academia (padrão: 30/60/100% do max).
//  effect: chave somada em MetodoRules.effects() — valor por nível.
//  pos: [ângulo em graus dentro do ramo, raio 0..1] pra desenhar.
// ════════════════════════════════════════════════════════════════

export const BRANCHES = {
  tecnica: { angle: -90, color: '#ff5a3c' }, // reps mais fortes
  rotina: { angle: 30, color: '#4fd1ff' }, // fadiga, automático e passivo
  labia: { angle: 150, color: '#ff8fd0' }, // carisma, encontros e dinheiro
};

export const NODES = [
  // ── TÉCNICA ────────────────────────────────────────────────────
  { id: 'tec_execucao', branch: 'tecnica', tier: 0, max: 10, base: 120, req: [], effect: 'progress', value: 0.15, pos: [0, 0.3] },
  { id: 'tec_carga', branch: 'tecnica', tier: 0, max: 10, base: 200, req: ['tec_execucao'], effect: 'ganhos', value: 0.2, pos: [-22, 0.52] },
  { id: 'tec_pico', branch: 'tecnica', tier: 0, max: 10, base: 200, req: ['tec_execucao'], effect: 'critChance', value: 0.015, pos: [22, 0.52] },
  { id: 'tec_ritmo', branch: 'tecnica', tier: 1, max: 6, base: 250, req: ['tec_carga'], effect: 'comboMax', value: 0.3, caps: [0, 3, 6], pos: [-26, 0.74] },
  { id: 'tec_falha', branch: 'tecnica', tier: 1, max: 8, base: 250, req: ['tec_pico'], effect: 'critMult', value: 0.25, caps: [0, 4, 8], pos: [26, 0.74] },
  { id: 'tec_furia', branch: 'tecnica', tier: 1, max: 5, base: 600, req: ['tec_ritmo', 'tec_falha'], effect: 'furia', value: 1, caps: [0, 3, 5], active: true, pos: [0, 0.82] },
  { id: 'tec_hercules', branch: 'tecnica', tier: 2, max: 1, base: 4000, req: ['tec_furia'], effect: 'hercules', value: 1, caps: [0, 0, 1], capstone: true, pos: [0, 1] },

  // ── ROTINA ─────────────────────────────────────────────────────
  { id: 'rot_descanso', branch: 'rotina', tier: 0, max: 10, base: 120, req: [], effect: 'fatigueRecover', value: 0.12, pos: [0, 0.3] },
  { id: 'rot_pump', branch: 'rotina', tier: 0, max: 10, base: 200, req: ['rot_descanso'], effect: 'pumpReps', value: 1, pos: [-22, 0.52] },
  { id: 'rot_split', branch: 'rotina', tier: 0, max: 6, base: 200, req: ['rot_descanso'], effect: 'split', value: 1, pos: [22, 0.52] },
  { id: 'rot_auto', branch: 'rotina', tier: 1, max: 5, base: 300, req: ['rot_pump'], effect: 'autoReps', value: 1, caps: [0, 3, 5], pos: [-26, 0.74] },
  { id: 'rot_fantasma', branch: 'rotina', tier: 1, max: 10, base: 250, req: ['rot_split'], effect: 'passiveTrain', value: 0.2, caps: [0, 6, 10], pos: [26, 0.74] },
  { id: 'rot_sono', branch: 'rotina', tier: 1, max: 6, base: 300, req: ['rot_auto', 'rot_fantasma'], effect: 'offlineCapH', value: 1, caps: [0, 3, 6], pos: [0, 0.82] },
  { id: 'rot_inquebravel', branch: 'rotina', tier: 2, max: 1, base: 4000, req: ['rot_sono'], effect: 'inquebravel', value: 1, caps: [0, 0, 1], capstone: true, pos: [0, 1] },

  // ── LÁBIA ──────────────────────────────────────────────────────
  { id: 'lab_papo', branch: 'labia', tier: 0, max: 10, base: 120, req: [], effect: 'carisma', value: 0.12, pos: [0, 0.3] },
  { id: 'lab_fofoca', branch: 'labia', tier: 0, max: 3, base: 250, req: ['lab_papo'], effect: 'tipLevel', value: 1, caps: [3, 3, 3], pos: [-22, 0.52] },
  { id: 'lab_rede', branch: 'labia', tier: 0, max: 10, base: 200, req: ['lab_papo'], effect: 'jobMoney', value: 0.08, pos: [22, 0.52] },
  { id: 'lab_charme', branch: 'labia', tier: 1, max: 6, base: 250, req: ['lab_fofoca'], effect: 'dateWindow', value: 0.08, caps: [0, 3, 6], pos: [-26, 0.74] },
  { id: 'lab_memoria', branch: 'labia', tier: 1, max: 5, base: 300, req: ['lab_rede'], effect: 'lembrancaMult', value: 0.1, caps: [0, 3, 5], pos: [26, 0.74] },
  { id: 'lab_olho', branch: 'labia', tier: 1, max: 6, base: 250, req: ['lab_charme', 'lab_memoria'], effect: 'golden', value: 1, caps: [0, 3, 6], pos: [0, 0.82] },
  { id: 'lab_magnetismo', branch: 'labia', tier: 2, max: 1, base: 4000, req: ['lab_olho'], effect: 'magnetismo', value: 1, caps: [0, 0, 1], capstone: true, pos: [0, 1] },
];

export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Técnica dada de graça na apresentação ("a primeira é cortesia"). */
export const FREE_NODE = 'tec_execucao';
