import { BALANCE, MUSCLES, STATS, gymOf, levelCost } from '../config/balance.js';
import { LEVELS, EXAMS, LEMBRANCAS } from '../config/story.js';
import { STR, muscleName } from '../i18n/pt-BR.js';
import { effects as metodoEffects } from './Metodo.js';
import { effects as companionEffects } from './CompanionRules.js';

// Funções puras sobre o estado: requisitos, simetria, força, modificadores.

export function capFor(state) {
  return gymOf(state.story.gym).cap;
}

export function forca(state) {
  return MUSCLES.reduce((a, m) => a + state.muscles[m].level, 0);
}

/** Simetria 0..1: equilíbrio entre os 8 músculos. */
export function simetria(state) {
  const L = MUSCLES.map((m) => state.muscles[m].level + state.muscles[m].progress / 1000);
  const mean = L.reduce((a, b) => a + b, 0) / L.length;
  const sd = Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / L.length);
  const min = Math.min(...L);
  const max = Math.max(...L);
  const s = 0.55 * (1 - sd / (mean + 3)) + 0.45 * ((min + 1) / (max + 1));
  return Math.max(0, Math.min(1, s));
}

export function estetica(state) {
  return Math.round(forca(state) * (0.4 + 0.6 * simetria(state)) * 10) / 10;
}

/** Pernas finas demais pra parte de cima? (piada do "frango"). */
export function isFrango(state) {
  const upper = ['peito', 'costas', 'ombros', 'biceps', 'triceps'].reduce((a, m) => a + state.muscles[m].level, 0) / 5;
  const legs = (state.muscles.pernas.level + state.muscles.panturrilhas.level) / 2;
  return upper >= BALANCE.symmetry.frangoMinUpper && legs < upper * BALANCE.symmetry.frangoRatio;
}

export function weakestMuscle(state, cap = capFor(state)) {
  let best = null;
  let bestV = Infinity;
  for (const m of MUSCLES) {
    const s = state.muscles[m];
    if (s.level >= cap) continue;
    const v = s.level + s.progress / 1000;
    if (v < bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

/** Objetivo atual: encontro do nível, prova da academia, ou fim do conteúdo. */
export function currentGoal(state) {
  const st = state.story;
  if (st.phase === 'gymDone') return { type: 'done' };
  if (st.phase === 'exam') {
    const ex = EXAMS[st.gym];
    return { type: 'exam', gym: st.gym, ...ex };
  }
  const lv = LEVELS[st.level - 1];
  if (!lv) return { type: 'done' };
  return { type: 'date', ...lv };
}

/**
 * Situação dos requisitos do objetivo atual.
 * @returns {{goal, items:[{id,label,cur,req,met,pct}], allMet, progress, missingText, worst}}
 */
export function requirementStatus(state) {
  const goal = currentGoal(state);
  if (goal.type === 'done') return { goal, items: [], allMet: true, progress: 1 };
  const items = [];
  for (const m of MUSCLES) {
    const cur = state.muscles[m].level;
    items.push({ id: m, label: muscleName(m), cur, req: goal.muscle, met: cur >= goal.muscle });
  }
  for (const s of STATS) {
    const req = goal[s];
    if (req == null) continue;
    const cur = state.muscles[s].level;
    items.push({ id: s, label: muscleName(s), cur, req, met: cur >= req });
  }
  if (goal.simetria) {
    const cur = Math.round(simetria(state) * 100);
    items.push({ id: 'simetria', label: STR.hud.simetria, cur, req: goal.simetria, met: cur >= goal.simetria, pctUnit: true });
  }
  for (const it of items) {
    const partial = state.muscles[it.id] ? state.muscles[it.id].progress / levelCost(it.id, it.cur) : 0;
    it.pct = Math.min(1, it.req > 0 ? (it.cur + partial) / it.req : 1);
    it.pct = Math.min(it.pct, it.met ? 1 : 0.999);
  }
  const allMet = items.every((i) => i.met);
  const base = items.reduce((a, i) => a + i.pct, 0) / items.length;
  const progress = Math.min(1, base * 0.95 + (allMet && state.story.matheusTalked ? 0.05 : 0));
  let worst = null;
  for (const it of items) if (!it.met && (!worst || it.pct < worst.pct)) worst = it;
  return { goal, items, allMet, progress, worst };
}

/** Modificadores de tudo (Lembranças, rank, sequência, buffs, Método Neumman, Equipe). */
export function computeMods(state) {
  const r = BALANCE.rep;
  const me = metodoEffects(state);
  const ce = companionEffects(state);
  const m = {
    ganhos: 1,
    click: 1,
    progress: 1,
    xp: 1,
    critChance: r.critChance,
    critMult: r.critMult,
    passive: 1,
    passiveTrain: 1,
    offline: 1,
    offlineCapH: BALANCE.offline.capHours,
    genCost: 1,
    carisma: 1,
    production: 1, // golden shake etc. (clique + passivo da ACADEMIA — não vale pro trabalho)
    workBoost: 1, // energético: acelera o pagamento do trabalho ativo
    workFeature: 1, // energético: o Vibecoder avança mais rápido nas features
    // Método / Equipe
    fatigueGain: 1, // fadiga ganha por rep
    fatigueRecover: 1,
    mindGain: 1, // Cansaço Mental por tarefa
    pumpReps: BALANCE.fatigue.pumpReps,
    pumpMult: BALANCE.fatigue.pumpMult,
    splitBonus: BALANCE.split.bonusMult,
    splitDurAdd: 0,
    comboMax: 1,
    autoReps: me.autoReps,
    furia: 1,
    furiaLevel: me.furia,
    hercules: me.hercules,
    inquebravel: me.inquebravel,
    tipLevel: me.tipLevel,
    jobMoney: 1 + me.jobMoney,
    dateWindow: me.dateWindow,
    goldenFreq: 1 + me.goldenFreq,
    goldenLife: me.goldenLife,
    magnetismo: me.magnetismo,
    weakProgress: ce.weakProgress,
    soMaisUma: ce.soMaisUma,
    meiSwitch: ce.meiSwitch,
    yume: ce.yume,
    rivalidade: ce.rivalidade,
    personal: ce.personal,
    waifu: ce.waifu,
  };
  // Lembranças (a Memória Afetiva e o Magnetismo aumentam o efeito)
  const lm = (1 + me.lembrancaMult) * (me.magnetismo ? 2 : 1);
  for (const g of state.lembrancas) {
    const L = LEMBRANCAS[g] ?? {};
    if (L.xp) m.xp *= 1 + L.xp * lm;
    if (L.offline) m.offline *= 1 + L.offline * lm;
    if (L.critChance) m.critChance += L.critChance * lm;
    if (L.genCost) m.genCost *= 1 + L.genCost * lm;
    if (L.passive) m.passive *= 1 + L.passive * lm;
    if (L.carisma) m.carisma *= 1 + L.carisma * lm;
    if (L.click) m.click *= 1 + L.click * lm;
    if (L.critMultSet) m.critMult = Math.max(m.critMult, L.critMultSet);
  }
  m.ganhos *= 1 + state.rank * BALANCE.rank.ganhosBonusPerRank;
  m.ganhos *= 1 + Math.min(BALANCE.streak.maxDays, state.streak.days) * BALANCE.streak.bonusPerDay;
  // Método Neumman
  m.progress *= 1 + me.progress;
  m.click *= (1 + me.ganhos) * (1 + ce.personalGanhos);
  m.critChance += me.critChance;
  m.critMult += me.critMult + ce.critMult;
  if (me.comboMax > 0) m.comboMax = me.comboMax;
  m.fatigueRecover *= 1 + me.fatigueRecover;
  m.pumpReps += me.pumpReps + ce.pumpRepsAdd;
  if (ce.pumpMult) m.pumpMult = ce.pumpMult;
  m.splitBonus += me.splitBonus + ce.splitBonusAdd;
  m.splitDurAdd += me.splitDur + ce.splitDurAdd;
  m.passiveTrain *= (1 + me.passiveTrain) * (me.inquebravel ? 2 : 1);
  if (me.inquebravel) m.passive *= 2;
  m.offlineCapH += me.offlineCapH;
  m.carisma *= 1 + me.carisma;
  // Waifu: fadiga mais lenta (metade do efeito vale pro Cansaço Mental). Rafa cansa mais.
  const cut = Math.min(BALANCE.companions.fatigueCutMax, ce.fatigueCut);
  m.fatigueGain = (1 - cut) * ce.fatigueMult;
  m.mindGain = 1 - cut / 2;
  const t = state.playTime;
  if (state.buffs.goldenUntil > t) m.production *= BALANCE.golden.mult;
  if (state.buffs.radioUntil > t) m.production *= 2;
  if (state.buffs.energeticoUntil > t) {
    m.workBoost = BALANCE.energy.workMult;
    m.workFeature = BALANCE.energy.featureMult;
  }
  if (state.buffs.furiaUntil > t) m.furia = 5;
  // Descanso Ativo (voltou do trabalho): PUMP mais longo
  if (state.buffs.descansoAtivoUntil > t) {
    m.pumpReps = Math.max(m.pumpReps, BALANCE.work.descansoAtivo.pumpReps + (m.pumpReps - BALANCE.fatigue.pumpReps));
    m.progress *= 1 + BALANCE.work.descansoAtivo.progress;
  }
  m.split = state.split.bonusUntil > t ? m.splitBonus : 1;
  return m;
}

export function bodyStageName(state) {
  return STR.bodyStages[Math.min(9, Math.max(0, state.story.level - 1))];
}

/** Postura: 1 = curvado (nível 1) → 0 = ereto e confiante (nível 10). */
export function postureFor(state) {
  return Math.max(0, 1 - (state.story.level - 1) / 6);
}

/** Roupa por estágio do corpo (nível de história). */
export const OUTFITS = [
  { top: 0x8c8f96, topStyle: 'tee', bottom: 0x2b3a5c, shoes: 0xd8d8d8 }, // camiseta velha cinza
  { top: 0x6a7a8a, topStyle: 'tee', bottom: 0x2b3a5c, shoes: 0xe8e8e8 },
  { top: 0x3a6ad8, topStyle: 'tank', bottom: 0x1f2a44, shoes: 0xf4f4f4 }, // primeira regata
  { top: 0x1f1f24, topStyle: 'tank', bottom: 0x2a2a30, shoes: 0xff4f7b },
  { top: 0x2ad8a0, topStyle: 'tank', bottom: 0x1a1a22, shoes: 0xffffff },
  { top: 0xffffff, topStyle: 'tank', bottom: 0x111111, shoes: 0x3ad6ff },
  { top: 0x8a2ad8, topStyle: 'tank', bottom: 0x111111, shoes: 0xffd34d },
  { top: 0x111111, topStyle: 'tank', bottom: 0x111111, shoes: 0xffd34d },
  { top: 0xd82a4a, topStyle: 'tank', bottom: 0x0a0a0a, shoes: 0xffffff },
  { top: 0xffd34d, topStyle: 'tank', bottom: 0x0a0a0a, shoes: 0xffffff }, // regata dourada do Deus Grego
];
