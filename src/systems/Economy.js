import { BALANCE, gymOf } from '../config/balance.js';
import { machineDef, GYMS } from '../config/gyms.js';
import { computeMods } from './Progression.js';

// Lado tycoon: geradores (renda passiva + treino do ponto fraco) e melhorias de máquina.

/** Geradores disponíveis: os da academia atual e das anteriores. */
export function availableGenerators(state) {
  const order = BALANCE.gymOrder;
  const idx = order.indexOf(state.story.gym);
  const out = [];
  for (let i = 0; i <= idx; i++) {
    const list = BALANCE.generators.list[order[i]];
    if (list) for (const g of list) out.push({ ...g, gym: order[i] });
  }
  return out;
}

export function generatorDef(id) {
  for (const [gym, list] of Object.entries(BALANCE.generators.list)) {
    const g = list.find((x) => x.id === id);
    if (g) return { ...g, gym };
  }
  return null;
}

export function generatorCost(state, def, owned = state.generators[def.id] ?? 0) {
  const mods = computeMods(state);
  return Math.ceil(def.base * Math.pow(BALANCE.generators.costGrowth, owned) * mods.genCost);
}

export function buyGenerator(state, id) {
  const def = generatorDef(id);
  if (!def) return false;
  const cost = generatorCost(state, def);
  if (state.ganhos < cost) return false;
  state.ganhos -= cost;
  state.generators[id] = (state.generators[id] ?? 0) + 1;
  return true;
}

/** Ganhos por segundo dos geradores (já com modificadores). */
export function passiveGps(state, mods = computeMods(state)) {
  let sum = 0;
  for (const def of availableGenerators(state)) sum += (state.generators[def.id] ?? 0) * def.gps;
  return sum * mods.ganhos * mods.passive * mods.production;
}

/** Pontos de treino por segundo (vão pro ponto fraco). */
export function passiveTrain(state) {
  let sum = 0;
  for (const def of availableGenerators(state)) sum += (state.generators[def.id] ?? 0) * def.train;
  return sum;
}

export function upgradeCost(machineId, level) {
  const def = machineDef(machineId);
  const gym = gymOf(def?.gym);
  return Math.ceil(gym.upgradeBase * Math.pow(BALANCE.upgrades.costGrowth, level));
}

export function upgradeMax(machineId) {
  return gymOf(machineDef(machineId)?.gym).upgradeMax;
}

export function buyUpgrade(state, machineId) {
  const m = state.machines[machineId];
  if (!m || m.upgrade >= upgradeMax(machineId)) return false;
  const cost = upgradeCost(machineId, m.upgrade);
  if (state.ganhos < cost) return false;
  state.ganhos -= cost;
  m.upgrade++;
  return true;
}

/** Máquinas da academia atual (pra aba Máquinas). */
export function currentMachines(state) {
  return GYMS[state.story.gym]?.machines ?? [];
}

/** Algo comprável agora? (badge no menu) */
export function anythingAffordable(state) {
  for (const g of availableGenerators(state)) if (state.ganhos >= generatorCost(state, g)) return true;
  for (const m of currentMachines(state)) {
    const lv = state.machines[m.id].upgrade;
    if (lv < upgradeMax(m.id) && state.ganhos >= upgradeCost(m.id, lv)) return true;
  }
  return false;
}

/** Ganhos offline: limite de horas, eficiência reduzida, + Lembrança da Jéssica. */
export function offlineEarnings(state, elapsedSec) {
  const O = BALANCE.offline;
  const mods = computeMods({ ...state, buffs: { goldenUntil: 0, radioUntil: 0, furiaUntil: 0, descansoAtivoUntil: 0 } });
  const sec = Math.min(elapsedSec, mods.offlineCapH * 3600);
  const gps = passiveGps(state, mods);
  return { sec, ganhos: gps * sec * O.efficiency * mods.offline, trainPts: passiveTrain(state) * sec * O.trainEfficiency };
}
