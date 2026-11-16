import { BALANCE, tierCaps, tierOfLevel } from '../config/balance.js';
import { COMPANIONS, COMPANION_BY_ID, PAIRS } from '../config/companions.js';
import { currentTier } from './Metodo.js';

// ════════════════════════════════════════════════════════════════
//  Equipe do Luisão: regras puras (custos, vínculo, efeitos).
//  O comportamento em tempo real (seguir, falar, água) fica em
//  Companions.js.
// ════════════════════════════════════════════════════════════════

const C = BALANCE.companions;

export function def(id) {
  return COMPANION_BY_ID[id];
}

export function caps() {
  return tierCaps(C.maxLevel, C.capFrac);
}

/** Companheiro ativo numa vaga (inclui o teste grátis). */
export function equipped(state, slot) {
  const c = state.companions;
  const tr = c.trial;
  if (tr && tr.until > state.playTime && def(tr.id)?.slot === slot) return tr.id;
  return c.equipped[slot];
}

export function isTrial(state, id) {
  const tr = state.companions.trial;
  return !!(tr && tr.id === id && tr.until > state.playTime);
}

export function owned(state, id) {
  return state.companions.owned[id] ?? null;
}

/** A camada do companheiro já abriu? */
export function tierOpen(state, id) {
  return def(id).tier <= currentTier(state);
}

export function hireCost(id) {
  const d = def(id);
  return Math.ceil(d.hire * C.tierMult[d.tier]);
}

/** Custo do próximo nível (null se no máximo). */
export function levelCost(state, id) {
  const o = owned(state, id);
  if (!o || o.level >= C.maxLevel) return null;
  const tier = Math.max(def(id).tier, tierOfLevel(o.level, caps()));
  return Math.ceil(def(id).levelBase * Math.pow(C.levelGrowth, o.level - 1) * C.tierMult[tier]);
}

/** Pode subir de nível? reason: 'max' | 'tier' | 'money' | null */
export function levelStatus(state, id) {
  const o = owned(state, id);
  if (!o) return { ok: false, reason: 'notOwned' };
  if (o.level >= C.maxLevel) return { ok: false, reason: 'max' };
  if (o.level >= caps()[currentTier(state)]) return { ok: false, reason: 'tier' };
  const cost = levelCost(state, id);
  if (state.dinheiro < cost) return { ok: false, reason: 'money', cost };
  return { ok: true, cost };
}

export function effLevel(state, id) {
  const o = owned(state, id);
  if (!o) return isTrial(state, id) ? 1 : 0;
  return Math.min(o.level, caps()[currentTier(state)]);
}

export function bondLevel(bond) {
  let lv = 0;
  C.bondThresholds.forEach((t, i) => {
    if (bond >= t) lv = i;
  });
  return lv;
}

export function bondProgress(bond) {
  const lv = bondLevel(bond);
  const T = C.bondThresholds;
  if (lv >= T.length - 1) return 1;
  return (bond - T[lv]) / (T[lv + 1] - T[lv]);
}

export function activePair(state) {
  const p = equipped(state, 'personal');
  const w = equipped(state, 'waifu');
  return PAIRS.find((x) => x.personal === p && x.waifu === w) ?? null;
}

export function deviceMult(state) {
  return C.deviceMult[state.companions.device] ?? 1;
}

/** Multiplicador do efeito de um companheiro: vínculo + química. */
function effectMult(state, id) {
  const o = owned(state, id);
  const bond = o ? bondLevel(o.bond) : 0;
  const chem = activePair(state) ? C.chemistryBonus : 0;
  return 1 + bond * C.bondBonus + chem;
}

/** Efeito principal (pra exibir): personal = +% Ganhos/rep, waifu = −% fadiga/rep. */
export function primaryValue(state, id) {
  const d = def(id);
  const lv = Math.max(1, effLevel(state, id));
  const mult = effectMult(state, id);
  if (d.slot === 'personal') return d.perLevel * lv * mult;
  return Math.min(C.fatigueCutMax, d.perLevel * lv * mult * deviceMult(state));
}

/** Soma dos efeitos da Equipe (entra em computeMods). */
export function effects(state) {
  const e = {
    personalGanhos: 0, fatigueCut: 0, fatigueMult: 1, critMult: 0, pumpRepsAdd: 0, pumpMult: null,
    splitBonusAdd: 0, splitDurAdd: 0, weakProgress: 0, soMaisUma: false, meiSwitch: false, yume: false,
    rivalidade: false, personal: null, waifu: null,
  };
  if (!state.companions) return e;
  const p = equipped(state, 'personal');
  const w = equipped(state, 'waifu');
  if (p) {
    e.personal = p;
    e.personalGanhos = primaryValue(state, p);
    const t = def(p).trait;
    if (t === 'soMaisUma') e.soMaisUma = true;
    if (t === 'treinoMontado') {
      e.splitBonusAdd += 0.25;
      e.splitDurAdd += 30;
    }
    if (t === 'treinoMonstro') {
      e.critMult += 0.5;
      e.fatigueMult *= 1.2;
    }
    if (t === 'periodizacao') {
      e.weakProgress = 0.4;
      e.pumpMult = 2.5;
    }
    if (t === 'rivalidade') e.rivalidade = true;
  }
  if (w) {
    e.waifu = w;
    e.fatigueCut = primaryValue(state, w);
    const t = def(w).trait;
    if (t === 'energia') e.pumpRepsAdd += 3;
    if (t === 'baka') e.meiSwitch = true;
    if (t === 'respiracao') e.yume = true;
  }
  return e;
}

export { COMPANIONS, PAIRS };
