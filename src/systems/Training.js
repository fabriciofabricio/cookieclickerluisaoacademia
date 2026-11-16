import { BALANCE, MUSCLES, STATS, TRAINABLE, SPLITS, levelCost, gymOf } from '../config/balance.js';
import { computeMods, capFor, weakestMuscle } from './Progression.js';
import { stageIndex } from '../characters/ProceduralRig.js';
import { lerp, smoothstep } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Treino: cada clique = 1 repetição. Calcula Ganhos, XP e progresso
//  do músculo, aplicando fadiga, PUMP, crítico, split e buffs.
// ════════════════════════════════════════════════════════════════

const F = BALANCE.fatigue;

export class Training {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.machine = null;
    this.setReps = 0;
    this.setIdle = 0;
    this.lastRepAt = -10;
    this.capWarned = {};
    this.combo = 0; // reps seguidas rápidas (Ritmo de Série)
    this.guidedReps = 0; // treino guiado do personal
    this.lastMuscle = null;
  }

  setState(state) {
    this.state = state;
  }

  start(def, { guided = false } = {}) {
    this.finishSet();
    const st = this.state;
    const mods = computeMods(st);
    // Mei (tsundere): trocar de máquina recupera os outros músculos
    if (mods.meiSwitch && this.lastMuscle && this.lastMuscle !== def.muscle && st.playTime >= st.cooldowns.mei) {
      for (const id of TRAINABLE) {
        if (id === def.muscle) continue;
        st.muscles[id].fatigue = Math.max(0, st.muscles[id].fatigue - 0.15);
      }
      st.cooldowns.mei = st.playTime + 20;
      this.bus.emit('trait', { id: 'baka' });
    }
    this.lastMuscle = def.muscle;
    this.machine = def;
    this.setReps = 0;
    this.setIdle = 0;
    this.combo = 0;
    this.guidedReps = guided ? BALANCE.companions.guidedReps : 0;
  }

  stop() {
    this.finishSet();
    this.machine = null;
  }

  finishSet() {
    if (!this.machine || this.setReps <= 0) return;
    const mach = this.state.machines[this.machine.id];
    if (this.setReps > mach.pr) {
      const old = mach.pr;
      mach.pr = this.setReps;
      if (old >= 8) this.bus.emit('newPR', { machine: this.machine, reps: this.setReps, old });
    }
    this.setReps = 0;
  }

  fatigueYield(f) {
    if (f <= F.startDrop) return 1;
    return lerp(1, F.minYield, smoothstep(F.startDrop, 1, f));
  }

  rep(source = 'click') {
    const def = this.machine;
    if (!def) return null;
    const st = this.state;
    const id = def.muscle;
    const s = st.muscles[id];
    const gym = gymOf(def.gym);
    const cap = Math.min(gym.cap, capFor(st));
    const mods = computeMods(st);
    const mach = st.machines[def.id];
    const upg = mach.upgrade;
    const U = BALANCE.upgrades;
    const R = BALANCE.rep;

    const fy = this.fatigueYield(s.fatigue);
    let pumpStarted = false;
    if (s.rested && s.fatigue < F.restedThreshold) {
      s.pumpReps = mods.pumpReps;
      s.rested = false;
      pumpStarted = true;
    }
    let pump = 1;
    if (s.pumpReps > 0) {
      pump = mods.pumpMult;
      s.pumpReps--;
    }
    // Cleiton: "SÓ MAIS UMA!" — a cada 10 reps seguidas, a próxima é crítico garantido
    const soMaisUma = mods.soMaisUma && this.setReps > 0 && this.setReps % 10 === 0;
    const crit = soMaisUma || Math.random() < mods.critChance;
    const critM = crit ? mods.critMult : 1;
    const split = mods.split;
    const atCap = s.level >= cap;

    // Ritmo de Série: reps rápidas em sequência sobem o combo (auto-reps só mantêm com Rotina Inquebrável)
    const gap = st.playTime - this.lastRepAt;
    if (mods.comboMax > 1) {
      if (gap < 0.75 && (source !== 'auto' || mods.inquebravel)) this.combo++;
      else if (gap > 1.2) this.combo = 0;
    }
    const combo = mods.comboMax > 1 ? Math.min(mods.comboMax, 1 + this.combo * 0.04) : 1;
    // HÉRCULES: toda 100ª rep é uma MEGA REP x50
    const mega = mods.hercules && (st.totals.reps + 1) % 100 === 0;
    const guided = this.guidedReps > 0 ? 1 + BALANCE.companions.guidedBonus : 1;
    if (this.guidedReps > 0) this.guidedReps--;
    const weak = mods.weakProgress > 0 && weakestMuscle(st) === id ? 1 + mods.weakProgress : 1;
    const boost = combo * mods.furia * (mega ? 50 : 1) * guided;

    let ganhos = R.baseGanhos * gym.ganhosMult * (1 + upg * U.ganhosPerLevel) * (1 + R.ganhosPerMuscleLevel * s.level);
    ganhos *= pump * fy * critM * split * mods.ganhos * mods.click * mods.production * boost;
    if (atCap) ganhos *= R.capGanhosMult;

    let progress = 0;
    if (!atCap) {
      progress = R.baseProgress * gym.progressMult * (1 + upg * U.progressPerLevel) * pump * fy * critM * split * mods.progress * boost * weak;
      if (id === 'carisma') progress *= mods.carisma;
    }
    const xp = R.baseXp * gym.xpMult * (1 + upg * U.xpPerLevel) * fy * mods.xp * (crit ? 2 : 1);

    st.ganhos += ganhos;
    st.totalGanhos += ganhos;
    this.addXp(xp);
    const before = s.level;
    this.addPoints(id, progress, cap, true);

    // Fadiga (a waifu deixa mais lenta; o Rafa deixa mais rápida)
    s.fatigue = Math.min(1, s.fatigue + F.perRep * mods.fatigueGain);
    // Yume (kuudere): respiração guiada quando o músculo passa de 60%
    let yume = false;
    if (mods.yume && s.fatigue > 0.6 && st.playTime >= st.cooldowns.yume) {
      s.fatigue = Math.max(0, s.fatigue - 0.4);
      st.cooldowns.yume = st.playTime + 30;
      yume = true;
      this.bus.emit('trait', { id: 'respiracao' });
    }
    if (mega) st.totals.megaReps++;
    for (const other of TRAINABLE) {
      if (other === id) continue;
      const o = st.muscles[other];
      o.fatigue = Math.max(0, o.fatigue - F.recoverPerOtherRep);
    }
    s.repsTotal++;
    mach.reps++;
    mach.used = true;
    st.totals.reps++;
    if (crit) st.totals.crits++;
    this.setReps++;
    this.setIdle = 0;
    this.lastRepAt = st.playTime;

    this._trackSplit(id);
    this._trackMission(id);

    if (atCap && !this.capWarned[def.id]) {
      this.capWarned[def.id] = true;
      this.bus.emit('cap', { machine: def });
    } else if (atCap && Math.random() < 0.12) {
      this.bus.emit('capCreak', { machine: def });
    }

    const result = {
      def, id, ganhos, xp, progress, crit, pump: pump > 1, pumpStarted, fatigue: s.fatigue, atCap, source, leveled: s.level > before,
      soMaisUma, mega, yume, combo, guided: guided > 1,
    };
    this.bus.emit('rep', result);
    return result;
  }

  addXp(xp) {
    const st = this.state;
    st.xp += xp;
    let cost = rankCost(st.rank);
    while (st.xp >= cost) {
      st.xp -= cost;
      st.rank++;
      this.bus.emit('rankUp', { rank: st.rank });
      cost = rankCost(st.rank);
    }
  }

  /** Soma pontos de progresso num músculo/stat, sobe de nível e avisa estágios visuais. */
  addPoints(id, pts, cap = capFor(this.state), active = false) {
    if (pts <= 0) return 0;
    const s = this.state.muscles[id];
    if (s.level >= cap) return 0;
    s.progress += pts;
    let gained = 0;
    let cost = levelCost(id, s.level);
    while (s.level < cap && s.progress >= cost) {
      s.progress -= cost;
      s.level++;
      gained++;
      this.bus.emit('muscleLevel', { id, level: s.level, active });
      if (MUSCLES.includes(id)) {
        const stages = BALANCE.visualStages;
        if (stageIndex(s.level, stages) > stageIndex(s.level - 1, stages)) {
          this.bus.emit('stageUp', { id, level: s.level, stage: stageIndex(s.level, stages), active });
        }
      }
      cost = levelCost(id, s.level);
    }
    if (s.level >= cap) s.progress = 0;
    return gained;
  }

  /** Carisma/Resistência ganhos fora das máquinas (Matheus, espelho, eventos). */
  addStat(id, pts) {
    const mods = computeMods(this.state);
    const v = id === 'carisma' ? pts * mods.carisma : pts;
    return this.addPoints(id, v, capFor(this.state), false);
  }

  /** Treino passivo dos geradores: sempre no PONTO FRACO. */
  passive(pointsPerSec, dt) {
    if (pointsPerSec <= 0) return null;
    const st = this.state;
    const weak = weakestMuscle(st);
    if (!weak) return null;
    const mods = computeMods(st);
    const gym = gymOf(st.story.gym);
    this.addPoints(weak, pointsPerSec * dt * gym.progressMult * mods.passive * mods.passiveTrain * mods.production);
    return weak;
  }

  _trackSplit(id) {
    const st = this.state;
    const sp = st.split;
    const pair = SPLITS[sp.index];
    if (id !== pair.a && id !== pair.b) return;
    if (sp.startedAt >= 0 && st.playTime - sp.startedAt > BALANCE.split.windowSec) {
      sp.aReps = 0;
      sp.bReps = 0;
      sp.startedAt = -1;
    }
    if (sp.startedAt < 0) sp.startedAt = st.playTime;
    if (id === pair.a) sp.aReps++;
    else sp.bReps++;
    const need = BALANCE.split.repsEach;
    if (sp.aReps >= need && sp.bReps >= need) {
      const mods = computeMods(st);
      const extra = st.lembrancas.includes('valentina') ? 1.5 : 1;
      sp.bonusUntil = st.playTime + BALANCE.split.durationSec * extra + mods.splitDurAdd;
      this.bus.emit('splitDone', { pair, mods });
      this._rotateSplit();
    }
  }

  _rotateSplit() {
    const sp = this.state.split;
    sp.index = (sp.index + 1) % SPLITS.length;
    sp.aReps = 0;
    sp.bReps = 0;
    sp.startedAt = -1;
    sp.nextRotateAt = this.state.playTime + BALANCE.split.rotateSec;
    this.bus.emit('splitRotate', { pair: SPLITS[sp.index] });
  }

  _trackMission(id) {
    const ms = this.state.mission;
    if (!ms || ms.muscle !== id) return;
    ms.done++;
    this.bus.emit('missionProgress', ms);
    if (ms.done >= ms.total) this.bus.emit('missionComplete', ms);
  }

  update(dt, mods = computeMods(this.state)) {
    const st = this.state;
    const current = this.machine?.muscle;
    const recentlyTrained = st.playTime - this.lastRepAt < 1.5;
    if (st.playTime - this.lastRepAt > 1.2) this.combo = 0;
    for (const id of TRAINABLE) {
      const s = st.muscles[id];
      const training = id === current && recentlyTrained;
      if (!training) {
        const base = F.recoverPerSec * mods.fatigueRecover;
        const rate = id === current ? base * 0.5 : base;
        s.fatigue = Math.max(0, s.fatigue - rate * dt);
        if (s.fatigue < F.restedThreshold && s.pumpReps === 0 && id !== current) s.rested = true;
      }
    }
    if (this.machine) {
      this.setIdle += dt;
      if (this.setIdle > 4 && this.setReps > 0) this.finishSet();
    }
    if (st.playTime >= st.split.nextRotateAt) this._rotateSplit();
  }
}

export function rankCost(rank) {
  return BALANCE.rank.xpBase * Math.pow(BALANCE.rank.xpGrowth, rank);
}

export { STATS };
