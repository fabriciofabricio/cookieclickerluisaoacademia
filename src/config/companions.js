// ════════════════════════════════════════════════════════════════
//  EQUIPE DO LUISÃO — personals (te dão mais Ganhos por rep) e
//  waifus do app WaifuFit (fazem você cansar mais devagar).
//  Números em balance.js (companions), textos em pt-BR.js (STR.team).
//
//  tier: academia onde abre (0 garagem, 1 iron, 2 olympus).
//  hire: preço de contratação/instalação (escala da garagem; ×tierMult).
//  trait: traço único tratado em Training/Companions.
//  look: visual procedural (personal) ou da ilustração (waifu).
// ════════════════════════════════════════════════════════════════

export const COMPANIONS = [
  // ── Personals ──────────────────────────────────────────────────
  {
    id: 'cleiton', slot: 'personal', tier: 0, hire: 1800, levelBase: 1300, trait: 'soMaisUma', perLevel: 0.12,
    unlock: 'cleitonArrived', icon: '📣',
    look: { skin: 0xc68b66, hairColor: 0x1a1410, hairStyle: 'short', eyeColor: 0x3a2a1a, height: 0.96, build: 0.55, top: 0x2a8ad8, topStyle: 'polo', bottom: 0x2a2a30, bottomStyle: 'shorts', shoes: 0xf4f4f4, shoeAccent: 0xffd34d, cap: 0xd82a2a },
  },
  {
    id: 'tati', slot: 'personal', tier: 1, hire: 2500, levelBase: 1800, trait: 'treinoMontado', perLevel: 0.12,
    unlock: 'gym', icon: '⚡',
    look: { female: true, skin: 0xd9a27a, hairColor: 0x3a1c10, hairStyle: 'ponytail', eyeColor: 0x3a2a1a, height: 0.94, build: 0.55, top: 0x1fe0a0, topStyle: 'tank', bottom: 0x222831, bottomStyle: 'pants', shoes: 0xffffff, shoeAccent: 0x1fe0a0 },
  },
  {
    id: 'rafa', slot: 'personal', tier: 1, hire: 3200, levelBase: 2200, trait: 'treinoMonstro', perLevel: 0.18,
    unlock: 'level5', icon: '🦍',
    look: { skin: 0xb07a55, hairColor: 0x111111, hairStyle: 'short', eyeColor: 0x2a1a10, height: 1.0, build: 1.0, top: 0x111111, topStyle: 'tank', bottom: 0x3a3a3a, bottomStyle: 'shorts', shoes: 0xff3b8a, shoeAccent: 0x111111, stubble: 0x1a1410 },
  },
  {
    id: 'atena', slot: 'personal', tier: 2, hire: 4000, levelBase: 2800, trait: 'periodizacao', perLevel: 0.12,
    unlock: 'gym', icon: '🧪',
    look: { female: true, skin: 0xf0c6a2, hairColor: 0x2a2018, hairStyle: 'bun', eyeColor: 0x3a5a3a, height: 0.95, build: 0.45, top: 0xf4f4f4, topStyle: 'tee', bottom: 0x2a3550, bottomStyle: 'pants', shoes: 0xffffff, shoeAccent: 0x4fd1ff, glasses: true },
  },
  {
    id: 'brayan', slot: 'personal', tier: 2, hire: 5000, levelBase: 3200, trait: 'rivalidade', perLevel: 0.14,
    unlock: 'brayanFriend', icon: '🥤', rig: 'brayan',
  },

  // ── Waifus (app WaifuFit) ──────────────────────────────────────
  {
    id: 'aiko', slot: 'waifu', tier: 0, hire: 1500, levelBase: 1100, trait: 'energia', perLevel: 0.04,
    unlock: 'waifuAd', icon: '🌸',
    look: { hair: '#ff8fc8', hair2: '#ff5aa8', eyes: '#ff6a3a', outfit: '#ff9a3a', outfit2: '#fff0e0', bg: ['#ffd0e8', '#ff7ab8'], style: 'sideTail', mood: 'genki' },
  },
  {
    id: 'mei', slot: 'waifu', tier: 1, hire: 2200, levelBase: 1600, trait: 'baka', perLevel: 0.04,
    unlock: 'level6', icon: '😤',
    look: { hair: '#e8463a', hair2: '#a82020', eyes: '#ffb21f', outfit: '#1c1c24', outfit2: '#ff4f7b', bg: ['#ffc8b0', '#ff5a3c'], style: 'long', mood: 'tsundere' },
  },
  {
    id: 'yume', slot: 'waifu', tier: 2, hire: 3000, levelBase: 2200, trait: 'respiracao', perLevel: 0.04,
    unlock: 'level9', icon: '🌙',
    look: { hair: '#dfe6f4', hair2: '#9aa6c8', eyes: '#7d6bff', outfit: '#b8a8ff', outfit2: '#2a2a40', bg: ['#d8e4ff', '#7d8bff'], style: 'bob', mood: 'kuudere', glasses: true },
  },
];

export const COMPANION_BY_ID = Object.fromEntries(COMPANIONS.map((c) => [c.id, c]));

/** Duplas com química (+10% em tudo dos dois). */
export const PAIRS = [
  { id: 'animada', personal: 'cleiton', waifu: 'aiko' },
  { id: 'monstroBaka', personal: 'rafa', waifu: 'mei' },
  { id: 'fogoGelo', personal: 'tati', waifu: 'yume' },
  { id: 'laboratorio', personal: 'atena', waifu: 'yume' },
];

/** Aparelhos do WaifuFit (mudam como a waifu aparece e multiplicam o efeito). */
export const DEVICES = ['celular', 'smartwatch', 'projetor'];
