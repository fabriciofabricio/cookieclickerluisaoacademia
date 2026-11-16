import { BALANCE, STATS, gymOf, gymIndex } from '../config/balance.js';
import { JOBS, JOB_BY_ID, PLAYABLE_JOBS } from '../config/jobs.js';
import { computeMods } from './Progression.js';
import { currentTier } from './Metodo.js';
import { lerp, smoothstep } from '../core/utils.js';
import uber from './jobs/uber.js';
import vibecoder from './jobs/vibecoder.js';

// ════════════════════════════════════════════════════════════════
//  Trabalho: cada clique na estação = 1 tarefa do emprego ativo.
//  Cansaço Mental (espelho da fadiga), CAFEZINHO!, carreira com teto
//  por academia, emprego principal ("carteira assinada"), upgrades,
//  renda passiva, ganhos offline e o Descanso Ativo na volta pro treino.
//  A parte específica de cada emprego fica em ./jobs/<id>.js.
// ════════════════════════════════════════════════════════════════

const W = BALANCE.work;
const M = W.mind;
const MODULES = { uber, vibecoder };

export class Jobs {
  constructor(game) {
    this.g = game;
    this.active = null; // emprego aberto na estação
    this.session = null; // { start, tasks }
    this.lastTaskAt = -10;
    this._unlockT = 0;
  }

  get s() {
    return this.g.state;
  }

  // ── Consultas ────────────────────────────────────────────────────
  job(id) {
    return this.s.jobs.list[id];
  }

  module(id) {
    return MODULES[id];
  }

  isUnlocked(id) {
    return !!this.job(id)?.unlocked;
  }

  unlockedList() {
    return PLAYABLE_JOBS.filter((id) => this.isUnlocked(id));
  }

  anyUnlocked() {
    return this.unlockedList().length > 0;
  }

  /** Emprego que a estação abre: o último usado, senão o principal. */
  current() {
    if (this.active && this.isUnlocked(this.active)) return this.active;
    return this.s.jobs.main ?? this.unlockedList()[0] ?? null;
  }

  isMain(id) {
    return this.s.jobs.main === id;
  }

  tierGym() {
    return BALANCE.gymOrder[currentTier(this.s)];
  }

  market() {
    return W.market[this.tierGym()];
  }

  cargoCap() {
    return W.cargoCap[this.tierGym()];
  }

  xpNeed(cargo) {
    return Math.ceil(W.xp.base * Math.pow(W.xp.growth, cargo - 1));
  }

  /**
   * R$ por tarefa (sem cansaço/cafezinho).
   * O Shake Dourado e o rádio (mods.production) NÃO entram aqui: eles são da academia.
   * Só o ENERGÉTICO (mods.workBoost) acelera o trabalho, e só a tarefa ativa (boost).
   */
  perTask(id, mods = computeMods(this.s), { main = this.isMain(id), boost = true } = {}) {
    const js = this.job(id);
    let v = W.basePay * this.market() * Math.pow(W.cargoGrowth, js.cargo - 1) * mods.jobMoney;
    if (main) v *= 1 + W.mainBonus;
    if (boost) v *= mods.workBoost;
    return v;
  }

  /** Ritmo de referência de R$ por segundo trabalhando no principal (patrocínio, recompensas). */
  refRate() {
    const id = this.s.jobs.main ?? 'uber';
    return this.perTask(id, computeMods(this.s), { boost: false }) * W.refTasksPerSec;
  }

  ctx(id, mods = computeMods(this.s)) {
    return { s: this.s, js: this.job(id), id, jobs: this, mods, emit: (ev, data) => this.g.bus.emit(ev, { id, ...data }) };
  }

  mindYield(f = this.s.jobs.mind.fatigue) {
    if (f <= M.startDrop) return 1;
    return lerp(1, M.minYield, smoothstep(M.startDrop, 1, f));
  }

  // ── Desbloqueio / principal ──────────────────────────────────────
  unlock(id, announce = true) {
    const js = this.job(id);
    if (!js || js.unlocked) return false;
    js.unlocked = true;
    if (!this.s.jobs.main) this.s.jobs.main = id;
    this.g.bus.emit('jobUnlocked', { id, announce });
    return true;
  }

  /**
   * Empregos de academia (unlock: 'gym' / 'level6') abrem sozinhos quando o Luisão CHEGA lá.
   * Na Garagem (camada 0) o Vibecoder segue trancado; o F9 'Camada' libera pra testar.
   */
  checkGymUnlocks() {
    if (!this.s.metodo.introSeen) return;
    const tier = currentTier(this.s);
    for (const def of JOBS) {
      if (!def.playable || def.unlock === 'metodoIntro' || this.isUnlocked(def.id)) continue;
      if (tier < gymIndex(def.gym)) continue;
      if (def.unlock === 'level6' && !(tier > gymIndex(def.gym) || this.s.story.level >= 6)) continue;
      this.unlock(def.id);
    }
  }

  /** Troca o emprego principal (a primeira troca é livre; depois tem aviso prévio). */
  setMain(id) {
    const j = this.s.jobs;
    if (!this.isUnlocked(id) || j.main === id) return { ok: false };
    if (j.main && this.s.playTime < j.switchReadyAt) return { ok: false, wait: Math.ceil(j.switchReadyAt - this.s.playTime) };
    const first = !j.main;
    j.main = id;
    if (!first) j.switchReadyAt = this.s.playTime + W.switchCooldownSec;
    return { ok: true };
  }

  // ── Sessão de trabalho ───────────────────────────────────────────
  startSession(id = this.current()) {
    this.active = id;
    this.session = { start: this.s.playTime, tasks: 0 };
  }

  setActive(id) {
    if (!this.isUnlocked(id)) return;
    this.active = id;
  }

  endSession() {
    const ses = this.session;
    this.session = null;
    if (!ses) return false;
    const D = W.descansoAtivo;
    if (this.s.playTime - ses.start >= D.minWorkSec && ses.tasks >= 20) {
      this.s.buffs.descansoAtivoUntil = this.s.playTime + D.durationSec;
      this.g.bus.emit('descansoAtivo', { sec: D.durationSec });
      return true;
    }
    return false;
  }

  /** 1 tarefa do emprego ativo. */
  task(source = 'click') {
    const id = this.active;
    const mod = MODULES[id];
    if (!id || !mod) return null;
    const s = this.s;
    const mods = computeMods(s);
    const mind = s.jobs.mind;
    let caf = 1;
    let cafStarted = false;
    if (mind.rested && mind.fatigue < M.restedThreshold) {
      mind.cafezinho = M.cafezinhoTasks;
      mind.rested = false;
      cafStarted = true;
    }
    if (mind.cafezinho > 0) {
      caf = M.cafezinhoMult;
      mind.cafezinho--;
    }
    const y = this.mindYield(mind.fatigue);
    mind.fatigue = Math.min(1, mind.fatigue + M.perTask * mods.mindGain);
    const ctx = this.ctx(id, mods);
    ctx.mult = caf * y;
    ctx.base = this.perTask(id, mods);
    const r = mod.task(ctx) ?? { pay: 0 };
    if (r.pay > 0) this.addMoney(r.pay, id);
    this.addXp(id, (this.isMain(id) ? 1 + W.mainBonus : 1) * (r.xp ?? 1));
    const js = this.job(id);
    js.tasks++;
    s.totals.tasks++;
    // Trabalhar também treina o stat de sinergia do emprego (cansaço mental reduz)
    const synStat = JOB_BY_ID[id].stat;
    if (STATS.includes(synStat)) this.g.training?.addStat(synStat, W.statTrain * y * gymOf(this.tierGym()).progressMult);
    this.lastTaskAt = s.playTime;
    if (this.session) this.session.tasks++;
    const result = { ...r, id, source, caf: caf > 1, cafStarted, yield: y };
    this.g.bus.emit('task', result);
    return result;
  }

  addMoney(n, id = null) {
    if (!(n > 0)) return;
    const s = this.s;
    s.dinheiro += n;
    s.totalDinheiro += n;
    if (id) this.job(id).earned += n;
  }

  addXp(id, n) {
    const js = this.job(id);
    js.xp += n;
    let need = this.xpNeed(js.cargo);
    while (js.xp >= need) {
      if (js.cargo >= this.cargoCap() || js.cargo >= 10) {
        js.xp = need;
        if (js.cappedWarned !== this.tierGym()) {
          js.cappedWarned = this.tierGym();
          this.g.bus.emit('cargoCapped', { id });
        }
        break;
      }
      js.xp -= need;
      js.cargo++;
      this.s.totals.promotions++;
      this.g.bus.emit('promotion', { id, cargo: js.cargo });
      need = this.xpNeed(js.cargo);
    }
  }

  /** Ações da mini-cena (consertar bug, decidir deploy...). */
  action(id, act, arg) {
    const mod = MODULES[id];
    if (!mod?.action) return;
    const r = mod.action(this.ctx(id), act, arg);
    if (r?.xp) this.addXp(id, r.xp);
    return r;
  }

  // ── Upgrades do emprego ──────────────────────────────────────────
  upgradeDef(id, key) {
    return BALANCE.jobs[id]?.upgrades?.[key];
  }

  upgradeLevel(id, key) {
    return this.job(id).upgrades[key] ?? 0;
  }

  /** O nível máximo do upgrade acompanha o cargo (cargo + 1). */
  upgradeMaxNow(id, key) {
    return Math.min(this.upgradeDef(id, key).max, this.job(id).cargo + 1);
  }

  upgradeCost(id, key) {
    const d = this.upgradeDef(id, key);
    return Math.ceil(d.base * Math.pow(W.upgradeGrowth, this.upgradeLevel(id, key)) * this.market());
  }

  upgradeStatus(id, key) {
    const lv = this.upgradeLevel(id, key);
    const d = this.upgradeDef(id, key);
    if (lv >= d.max) return { ok: false, reason: 'max' };
    if (lv >= this.upgradeMaxNow(id, key)) return { ok: false, reason: 'cargo' };
    const cost = this.upgradeCost(id, key);
    if (this.s.dinheiro < cost) return { ok: false, reason: 'money', cost };
    return { ok: true, cost };
  }

  buyUpgrade(id, key) {
    const st = this.upgradeStatus(id, key);
    if (!st.ok) return false;
    this.s.dinheiro -= st.cost;
    this.job(id).upgrades[key] = this.upgradeLevel(id, key) + 1;
    this.g.bus.emit('jobUpgrade', { id, key, level: this.job(id).upgrades[key] });
    return true;
  }

  anyAffordable() {
    for (const id of this.unlockedList()) {
      for (const key of JOB_BY_ID[id].upgrades) if (this.upgradeStatus(id, key).ok) return true;
    }
    return false;
  }

  // ── Passivo / offline ────────────────────────────────────────────
  /** R$/s que um emprego rende sozinho. */
  passiveRate(id, mods = computeMods(this.s)) {
    const js = this.job(id);
    if (!js?.unlocked) return 0;
    const mod = MODULES[id];
    if (mod.passiveRate) return mod.passiveRate(this.ctx(id, mods));
    const P = W.passive;
    if (js.cargo < P.fromCargo) return 0;
    const frac = Math.min(P.max, P.base + P.perCargo * (js.cargo - P.fromCargo));
    const own = this.isMain(id) ? 1 : W.secondaryPassive;
    const extra = mod.passiveMult ? mod.passiveMult(this.ctx(id, mods)) : 1;
    return this.perTask(id, mods, { main: false, boost: false }) * W.refTasksPerSec * frac * own * extra;
  }

  totalPassive(mods = computeMods(this.s)) {
    return this.unlockedList().reduce((a, id) => a + this.passiveRate(id, mods), 0);
  }

  offlineEarnings(elapsedSec) {
    const s = this.s;
    const mods = computeMods({ ...s, buffs: { goldenUntil: 0, radioUntil: 0, furiaUntil: 0, descansoAtivoUntil: 0 } });
    const sec = Math.min(elapsedSec, mods.offlineCapH * 3600);
    let money = 0;
    for (const id of this.unlockedList()) {
      const mod = MODULES[id];
      const ctx = this.ctx(id, mods);
      money += mod.offline ? mod.offline(ctx, sec) : this.passiveRate(id, mods) * sec;
    }
    return { sec, money: money * W.offlineEfficiency * mods.offline };
  }

  /** Pix de patrocínio a cada Rank de Atleta (fixo, × mercado da academia). */
  rankStipend() {
    if (!this.s.metodo.introSeen) return 0;
    const n = BALANCE.rank.stipend * this.market();
    this.addMoney(n);
    return n;
  }

  /** Cansaço Mental cai um pouco a cada rep na academia. */
  onGymRep() {
    const mind = this.s.jobs.mind;
    mind.fatigue = Math.max(0, mind.fatigue - M.recoverPerRep);
  }

  // ── Atualização ──────────────────────────────────────────────────
  update(dt, mods = computeMods(this.s)) {
    const s = this.s;
    const working = this.g.mode === 'work';
    const mind = s.jobs.mind;
    if (!working || s.playTime - this.lastTaskAt > 2) {
      mind.fatigue = Math.max(0, mind.fatigue - M.recoverPerSec * dt);
      if (mind.fatigue < M.restedThreshold && mind.cafezinho === 0) mind.rested = true;
    }
    this._unlockT -= dt;
    if (this._unlockT <= 0) {
      this._unlockT = 1;
      this.checkGymUnlocks();
    }
    for (const id of this.unlockedList()) {
      const mod = MODULES[id];
      const ctx = this.ctx(id, mods);
      mod.update?.(ctx, dt, working && this.active === id);
      if (!mod.passiveRate) {
        const r = this.passiveRate(id, mods);
        if (r > 0) this.addMoney(r * dt, id);
      }
    }
    // Medição de tempo (F9)
    const log = s.timeLog;
    const key = `${s.story.level}${s.story.phase === 'train' ? '' : '-' + s.story.phase}`;
    const lvl = (log.perLevel[key] ??= { train: 0, work: 0 });
    if (working) {
      log.work += dt;
      lvl.work += dt;
    } else if (this.g.mode === 'train') {
      log.train += dt;
      lvl.train += dt;
    }
  }

  /** Mini-cena do emprego (HTML) pro painel de trabalho. */
  view(id) {
    const mod = MODULES[id];
    return mod?.view ? mod.view(this.ctx(id)) : { key: '', html: '' };
  }

  tags(id) {
    const mod = MODULES[id];
    return mod?.tags ? mod.tags(this.ctx(id)) : [];
  }
}

export { MODULES };
