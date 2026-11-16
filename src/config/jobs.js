// ════════════════════════════════════════════════════════════════
//  EMPREGOS — estrutura (ids, desbloqueio, stat de sinergia, upgrades).
//  Números em balance.js (work / jobs), textos em pt-BR.js (STR.jobs).
//  A lógica de cada emprego fica em src/systems/jobs/<id>.js.
//
//  unlock:
//    'metodoIntro'  → liberado quando o Matheus apresenta o Método
//    'gym'          → liberado ao CHEGAR na academia do campo `gym`
//    'level6'       → idem, mas só a partir do nível 6 de história
//  playable: já tem módulo em systems/jobs/ (os outros são da Fase 2).
// ════════════════════════════════════════════════════════════════

export const JOBS = [
  {
    id: 'uber',
    icon: '🚗',
    gym: 'garagem',
    unlock: 'metodoIntro',
    stat: 'resistencia',
    upgrades: ['carro', 'agua', 'palheta', 'suporte', 'primo'],
    phase: 1,
    playable: true,
    station: 'car', // o carro estacionado na rua
  },
  {
    id: 'vibecoder',
    icon: '💻',
    gym: 'iron', // só abre quando o Luisão vai pra academia nova
    unlock: 'gym',
    stat: 'carisma',
    upgrades: ['notebook', 'iaPro', 'testes', 'landing', 'cs', 'servidor'],
    phase: 2,
    playable: true,
    station: 'desk', // o caixote com o notebook da Marlene
  },
  // ── Fase 2 (chegam com o Iron Temple e o Olympus) ────────────────
  { id: 'instrutor', icon: '🏋️', gym: 'iron', unlock: 'gym', stat: 'estetica', upgrades: [], phase: 2 },
  { id: 'seguranca', icon: '🕶️', gym: 'iron', unlock: 'level6', stat: 'forca', upgrades: [], phase: 2 },
  { id: 'modelo', icon: '📸', gym: 'olympus', unlock: 'gym', stat: 'estetica', upgrades: [], phase: 2 },
];

export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));
export const PLAYABLE_JOBS = JOBS.filter((j) => j.playable).map((j) => j.id);
