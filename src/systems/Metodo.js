import { BALANCE, gymIndex, tierCaps, tierOfLevel } from '../config/balance.js';
import { NODES, NODE_BY_ID } from '../config/metodo.js';

// ════════════════════════════════════════════════════════════════
//  Método Neumman: regras puras (sem DOM/3D). Custos, pré-requisitos,
//  teto por academia, compra, reset e a soma dos efeitos que entra
//  em Progression.computeMods().
// ════════════════════════════════════════════════════════════════

const MT = BALANCE.metodo;

/** Camada liberada agora: 0 garagem, 1 iron, 2 olympus (o F9 pode forçar). */
export function currentTier(state) {
  return state.debugTier ?? gymIndex(state.story.gym);
}

export function capsOf(node) {
  return tierCaps(node.max, MT.capFrac, node.caps);
}

export function level(state, id) {
  return state.metodo.nodes[id] ?? 0;
}

/** Nível que vale agora (no NG+ os níveis acima do teto da academia ficam adormecidos). */
export function effLevel(state, id) {
  const node = NODE_BY_ID[id];
  return Math.min(level(state, id), capsOf(node)[currentTier(state)]);
}

/** Custo do próximo nível, ou null se já está no máximo. */
export function nextCost(state, id) {
  const node = NODE_BY_ID[id];
  const L = level(state, id);
  if (L >= node.max) return null;
  const tier = tierOfLevel(L, capsOf(node));
  return Math.ceil(node.base * Math.pow(MT.costGrowth, L) * MT.tierMult[tier]);
}

/**
 * Pode comprar o próximo nível?
 * reason: 'max' | 'tier' | 'req' | 'money' | null
 */
export function status(state, id) {
  const node = NODE_BY_ID[id];
  const L = level(state, id);
  if (L >= node.max) return { ok: false, reason: 'max', level: L };
  const caps = capsOf(node);
  const tier = currentTier(state);
  if (L >= caps[tier]) return { ok: false, reason: 'tier', level: L, needTier: tierOfLevel(L, caps) };
  if (!reqMet(state, node)) return { ok: false, reason: 'req', level: L };
  const cost = nextCost(state, id);
  if (state.dinheiro < cost) return { ok: false, reason: 'money', level: L, cost };
  return { ok: true, reason: null, level: L, cost };
}

export function reqMet(state, node) {
  if (!node.req.every((r) => level(state, r) >= 1)) return false;
  if (node.capstone) {
    // Capstone: o ramo inteiro no nível 3+.
    for (const n of NODES) if (n.branch === node.branch && !n.capstone && level(state, n.id) < Math.min(3, n.max)) return false;
  }
  return true;
}

export function buy(state, id) {
  const st = status(state, id);
  if (!st.ok) return false;
  state.dinheiro -= st.cost;
  state.metodo.spent += st.cost;
  state.metodo.nodes[id] = st.level + 1;
  return true;
}

export function anyAffordable(state) {
  if (!state.metodo.introSeen) return false;
  return NODES.some((n) => status(state, n.id).ok);
}

export function resetCost(state) {
  return MT.resetGanhos[state.story.gym] ?? MT.resetGanhos.garagem;
}

/** Devolve todo o R$ investido (custa Ganhos). Mantém a técnica cortesia. */
export function reset(state, freeNode) {
  const cost = resetCost(state);
  if (state.ganhos < cost || state.metodo.spent <= 0) return false;
  state.ganhos -= cost;
  state.dinheiro += state.metodo.spent;
  state.metodo.spent = 0;
  state.metodo.resets++;
  state.metodo.nodes = freeNode ? { [freeNode]: 1 } : {};
  return true;
}

/** Estágio do canto do Matheus (0..n) pelo total investido. */
export function matheusStage(state) {
  let s = 0;
  MT.matheusStages.forEach((v, i) => {
    if (state.metodo.spent >= v) s = i;
  });
  return s;
}

/** Soma dos efeitos (já com teto da academia). */
export function effects(state) {
  const e = {
    progress: 0, ganhos: 0, critChance: 0, critMult: 0, comboMax: 0, furia: 0, hercules: false,
    fatigueRecover: 0, pumpReps: 0, splitBonus: 0, splitDur: 0, autoReps: 0, passiveTrain: 0, offlineCapH: 0, inquebravel: false,
    carisma: 0, tipLevel: 0, jobMoney: 0, dateWindow: 0, lembrancaMult: 0, goldenFreq: 0, goldenLife: 0, magnetismo: false,
  };
  if (!state.metodo) return e;
  for (const node of NODES) {
    const L = effLevel(state, node.id);
    if (L <= 0) continue;
    const v = node.value * L;
    switch (node.effect) {
      case 'comboMax':
        e.comboMax = 1.2 + 0.3 * L; // nv1 x1,5 → nv6 x3
        break;
      case 'split':
        e.splitBonus += 0.1 * L;
        e.splitDur += 10 * L;
        break;
      case 'golden':
        e.goldenFreq += 0.1 * L;
        e.goldenLife += 3 * L;
        break;
      case 'hercules':
      case 'inquebravel':
      case 'magnetismo':
        e[node.effect] = true;
        break;
      default:
        e[node.effect] += v;
    }
  }
  return e;
}

export { NODES, NODE_BY_ID };
