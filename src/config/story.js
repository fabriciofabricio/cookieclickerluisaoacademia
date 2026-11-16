// Estrutura da história: níveis, requisitos, provas e Lembranças.
// Os textos estão em src/i18n/pt-BR.js; aqui só tem números e ids.

export const LEVELS = [
  { level: 1, girl: 'marlene', gym: 'garagem', muscle: 4, resistencia: 3, carisma: 2 },
  { level: 2, girl: 'jessica', gym: 'garagem', muscle: 10, resistencia: 8, carisma: 6 },
  { level: 3, girl: 'bruna', gym: 'garagem', muscle: 18, resistencia: 16, carisma: 10 },
  { level: 4, girl: 'camila', gym: 'iron', muscle: 30, resistencia: 28, carisma: 20 },
  { level: 5, girl: 'larissa', gym: 'iron', muscle: 37, resistencia: 35, carisma: 26, simetria: 70 },
  { level: 6, girl: 'isabela', gym: 'iron', muscle: 45, resistencia: 40, carisma: 34 },
  { level: 7, girl: 'yasmin', gym: 'iron', muscle: 53, resistencia: 48, carisma: 42 },
  { level: 8, girl: 'valentina', gym: 'olympus', muscle: 68, resistencia: 62, carisma: 52 },
  { level: 9, girl: 'morgana', gym: 'olympus', muscle: 72, resistencia: 65, carisma: 75 },
  { level: 10, girl: 'aurora', gym: 'olympus', muscle: 90, resistencia: 85, carisma: 85, simetria: 95 },
];

/** Provas de saída de academia: aparecem depois do último nível de cada academia. */
export const EXAMS = {
  garagem: { afterLevel: 3, next: 'iron', muscle: 25, resistencia: 25, carisma: 12, extra: 'armwrestle' },
  iron: { afterLevel: 7, next: 'olympus', muscle: 60, resistencia: 50, carisma: 45, simetria: 80 },
};

/** Lembranças permanentes (aplicadas em Modifiers). */
export const LEMBRANCAS = {
  marlene: { xp: 0.05 },
  jessica: { offline: 0.15 },
  bruna: { critChance: 0.05 },
  camila: { genCost: -0.05 },
  larissa: { passive: 0.1 },
  isabela: { carisma: 0.1 },
  yasmin: { click: 0.15 },
  valentina: { comboDuration: 0.5 },
  morgana: { critMultSet: 3 },
  aurora: {},
};

export const GIRL_ORDER = LEVELS.map((l) => l.girl);

/**
 * Visual de cada garota (stand-in procedural). Quando o .glb dela existir,
 * o modelo real é usado no lugar.
 */
export const GIRL_LOOKS = {
  marlene: {
    skin: 0xf1c8a8, hair: 0x5a3a22, hairStyle: 'bun', top: 0x7a6aa8, bottom: 0x3a3f52,
    glasses: true, height: 0.92, build: 0.42, shoes: 0xd8d8d8,
  },
  jessica: {
    skin: 0xf4cfb0, hair: 0x9a5a2e, hairStyle: 'ponytail', top: 0xf2ece0, bottom: 0x6b4a33,
    apron: 0xc87a3a, freckles: true, height: 0.93, build: 0.42, shoes: 0x333333,
  },
  bruna: {
    skin: 0xd9a27a, hair: 0x2c1c12, hairStyle: 'ponytail', top: 0xff4f7b, bottom: 0x222831,
    cap: 0x1f6feb, height: 0.95, build: 0.45, shoes: 0xffffff,
  },
  // ── Iron Temple ──────────────────────────────────────────────────
  camila: {
    skin: 0x9a6440, hair: 0x1c120c, hairStyle: 'curly', top: 0xf0c040, bottom: 0x3a4a6a,
    height: 0.9, build: 0.42, shoes: 0xf4f4f4, freckles: true,
  },
  larissa: {
    skin: 0xe8bf9a, hair: 0x6b4b3a, hairStyle: 'long', top: 0x9ad8b8, bottom: 0xd8c8e8,
    height: 0.94, build: 0.4, shoes: 0xd8c8a8, lips: 0xc8807a,
  },
  isabela: {
    skin: 0xf2d0b4, hair: 0xe0b860, hairStyle: 'long', top: 0xff7ab8, bottom: 0xf4f4f4,
    height: 0.95, build: 0.42, shoes: 0xff7ab8, lips: 0xd8405a, makeup: 0x8a4aa8,
  },
  yasmin: {
    skin: 0xc68b66, hair: 0x111014, hairStyle: 'bun', top: 0x1c2a4a, bottom: 0x1c1c22,
    height: 0.96, build: 0.42, shoes: 0x1c1c22, glasses: true, lips: 0xa83040, eyeColor: 0x3a2a1a,
  },
};
