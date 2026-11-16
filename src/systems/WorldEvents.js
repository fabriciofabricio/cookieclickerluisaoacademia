import * as THREE from 'three';
import { STR, t, eventText } from '../i18n/pt-BR.js';
import { BALANCE } from '../config/balance.js';
import { goldenShake, energyDrink } from '../world/Props.js';
import { rand, pick } from '../core/utils.js';
import { fmt, fmtMoney } from '../core/format.js';
import { passiveGps } from './Economy.js';

// Shake Dourado, eventos aleatórios engraçados e missões do Matheus.

const RANDOM_EVENTS = [
  { id: 'anilha', type: 'carisma', n: 10 },
  { id: 'biscoito', type: 'carisma', n: 6 },
  { id: 'radio', type: 'radio', sec: 20 },
  { id: 'pastel', type: 'ganhos', sec: 40 },
  { id: 'vizinha', type: 'carisma', n: 5 },
  { id: 'chuva', type: 'ganhos', sec: 30 },
  { id: 'matheusTombo', type: 'carisma', n: 8 },
  { id: 'gato', type: 'carisma', n: 6 },
];

// No Iron Temple os eventos são outros (não tem Biscoito nem Dona Cida lá)
const RANDOM_EVENTS_IRON = [
  { id: 'ironBrayan', type: 'carisma', n: 10 },
  { id: 'ironDJ', type: 'radio', sec: 20 },
  { id: 'ironAmostra', type: 'ganhos', sec: 40 },
  { id: 'ironIvone', type: 'carisma', n: 6 },
  { id: 'ironMatheus', type: 'carisma', n: 8 },
  { id: 'ironSelfie', type: 'carisma', n: 5 },
  { id: 'ironChuva', type: 'ganhos', sec: 30 },
];

export class WorldEvents {
  constructor(game) {
    this.g = game;
    this.golden = null;
    this.goldenTimer = rand(BALANCE.golden.minSec * 0.8, BALANCE.golden.maxSec);
    this.energy = null;
    this.energyTimer = rand(BALANCE.energy.firstMinSec, BALANCE.energy.firstMaxSec);
    this.randomTimer = rand(BALANCE.randomEvents.minSec * 0.5, BALANCE.randomEvents.maxSec * 0.6);
  }

  get s() {
    return this.g.state;
  }

  /** Renda estimada por segundo (clique + passivo) pra recompensas instantâneas. */
  incomeRate() {
    return passiveGps(this.s, this.g.mods) + this.g.activeRate;
  }

  spawnGolden(force = false) {
    if (this.golden && !force) return;
    if (this.golden) this._removeGolden();
    const spots = this.g.gymDef.goldenSpots.filter(([x, z]) => Math.hypot(x - this.g.luisao.pos.x, z - this.g.luisao.pos.z) > 2.2);
    const [x, z] = pick(spots.length ? spots : this.g.gymDef.goldenSpots);
    const group = goldenShake();
    group.position.set(x, 0.55, z);
    this.g.scene.add(group);
    this.golden = { group, life: BALANCE.golden.lifeSec + (this.g.mods?.goldenLife ?? 0), t: 0 };
    this.g.hud.toast(`✨ ${eventText(this.s.story.gym, 'golden')}`, 'gold', 3500);
    this.g.audio.golden();
  }

  _removeGolden() {
    if (!this.golden) return;
    this.g.scene.remove(this.golden.group);
    this.golden.group.traverse((c) => c.geometry?.dispose?.());
    this.golden = null;
  }

  collectGolden() {
    if (!this.golden) return;
    const g = this.g;
    const s = this.s;
    const pos = this.golden.group.position.clone();
    this._removeGolden();
    s.totals.goldens++;
    g.audio.golden();
    g.particles.sparkle(pos, 50, 0xffd34d, 2.6);
    g.particles.ring(pos.clone().setY(0.1), 0xffd34d, 40, 4);
    g.camRig.addShake(0.2);
    if (Math.random() < BALANCE.golden.instantChance) {
      const n = Math.max(BALANCE.golden.instantMin, this.incomeRate() * BALANCE.golden.instantProductionSec);
      s.ganhos += n;
      s.totalGanhos += n;
      g.hud.banner(STR.hud.golden, `+${fmt(n)} 💪`, '');
      g.hud.toast(t('events.goldenInstant', { n: fmt(n) }), 'gold');
      g.floaters.spawn(`+${fmt(n)}`, pos.add(new THREE.Vector3(0, 0.6, 0)), 'gold');
    } else {
      s.buffs.goldenUntil = s.playTime + BALANCE.golden.durationSec;
      g.hud.banner(STR.hud.golden, `${STR.hud.goldenBuff} • ${BALANCE.golden.durationSec}s`, '');
      g.hud.toast(t('events.goldenTaken', { s: BALANCE.golden.durationSec }), 'gold');
    }
    this.goldenTimer = rand(BALANCE.golden.minSec, BALANCE.golden.maxSec);
  }

  // ── Energético (raro; acelera só o TRABALHO) ─────────────────────
  spawnEnergy(force = false) {
    if (this.energy && !force) return;
    if (this.energy) this._removeEnergy();
    const group = energyDrink();
    if (this.g.inCar) {
      // Dirigindo o Uber: a latinha aparece no console do carro (dá pra clicar nela)
      const c = this.g.uberCar.canSpot;
      group.position.copy(c);
      this.g.scene.add(group);
      this.energy = { group, life: BALANCE.energy.lifeSec, t: 0, baseY: c.y, home: null, inCar: true };
    } else {
      const taken = this.golden ? [this.golden.group.position] : [];
      const spots = this.g.gymDef.goldenSpots.filter(([x, z]) => Math.hypot(x - this.g.luisao.pos.x, z - this.g.luisao.pos.z) > 2.2 && taken.every((p) => Math.hypot(x - p.x, z - p.z) > 1.8));
      const [x, z] = pick(spots.length ? spots : this.g.gymDef.goldenSpots);
      group.position.set(x, 0.55, z);
      this.g.scene.add(group);
      this.energy = { group, life: BALANCE.energy.lifeSec, t: 0, baseY: 0.55, home: null, inCar: false };
    }
    this.g.hud.toast(`⚡ ${eventText(this.s.story.gym, 'energy')}`, 'green', 4200);
    this.g.audio.kira();
  }

  /**
   * O energético é feito pra pegar TRABALHANDO. Quando o Luisão entra no Uber, a latinha que estava
   * na academia vai junto pro console do carro; quando ele sai, ela volta pro lugar.
   */
  carryEnergy(inCar) {
    const en = this.energy;
    if (!en) return;
    if (inCar && !en.inCar) {
      en.home = { pos: en.group.position.clone(), baseY: en.baseY };
      const c = this.g.uberCar.canSpot;
      en.group.position.copy(c);
      en.baseY = c.y;
      en.inCar = true;
    } else if (!inCar && en.inCar) {
      if (en.home) {
        en.group.position.copy(en.home.pos);
        en.baseY = en.home.baseY;
        en.inCar = false;
      } else {
        // nasceu dentro do carro: some junto com ele (a vida da latinha segue contando)
        this._removeEnergy();
        this.energyTimer = rand(BALANCE.energy.minSec, BALANCE.energy.maxSec);
      }
    }
  }

  _removeEnergy() {
    if (!this.energy) return;
    this.g.scene.remove(this.energy.group);
    this.energy.group.traverse((c) => c.geometry?.dispose?.());
    this.energy = null;
  }

  collectEnergy() {
    if (!this.energy) return;
    const g = this.g;
    const s = this.s;
    const pos = this.energy.group.position.clone();
    this._removeEnergy();
    s.totals.energeticos++;
    // Não acumula: pegar outro enquanto o efeito está ativo só renova o tempo.
    s.buffs.energeticoUntil = s.playTime + BALANCE.energy.durationSec;
    g.audio.pix();
    g.audio.kira();
    g.particles.sparkle(pos, 44, 0x7dff4d, 2.4);
    g.particles.ring(pos.clone().setY(0.1), 0x7dff4d, 36, 4);
    g.camRig.addShake(0.15);
    g.hud.banner(STR.hud.energy, t('hud.energyBuff', { n: BALANCE.energy.workMult, s: BALANCE.energy.durationSec }), 'green');
    g.hud.toast(t('events.energyTaken', { n: BALANCE.energy.workMult, s: BALANCE.energy.durationSec }), 'green', 4500);
    this.energyTimer = rand(BALANCE.energy.minSec, BALANCE.energy.maxSec);
  }

  _randomEvent() {
    const g = this.g;
    const s = this.s;
    const ev = pick(this.s.story.gym === 'iron' ? RANDOM_EVENTS_IRON : RANDOM_EVENTS);
    if (ev.type === 'carisma') {
      g.training.addStat('carisma', ev.n);
      g.hud.toast(`😂 ${t('events.' + ev.id, { n: ev.n })}`, 'pink', 4500);
    } else if (ev.type === 'ganhos') {
      const n = Math.max(20, this.incomeRate() * ev.sec);
      s.ganhos += n;
      s.totalGanhos += n;
      g.hud.toast(`🎉 ${t('events.' + ev.id, { n: fmt(n) })}`, 'gold', 4500);
    } else if (ev.type === 'radio') {
      s.buffs.radioUntil = s.playTime + ev.sec;
      g.hud.toast(`📻 ${t('events.' + ev.id)}`, 'gold', 4500);
    }
    g.audio.coin();
  }

  completeMission(ms) {
    const g = this.g;
    const s = this.s;
    if (s.mission !== ms) return;
    const n = Math.max(30, this.incomeRate() * BALANCE.matheus.missionRewardSec);
    s.ganhos += n;
    s.totalGanhos += n;
    g.training.addStat('carisma', BALANCE.matheus.missionCarisma);
    s.mission = null;
    g.hud.toast(`🍧 ${STR.hud.missionDone} +${fmt(n)} 💪 +${BALANCE.matheus.missionCarisma} ${STR.muscles.carisma}`, 'pink', 4500);
    // Agora o Matheus paga o açaí de verdade (com o Pix que você mandou pra ele)
    if (s.metodo.introSeen) {
      const pix = g.jobs.refRate() * BALANCE.matheus.missionPixSec;
      g.jobs.addMoney(pix);
      setTimeout(() => g.hud.toast(`💸 ${t('matheus.missionPixToast', { n: fmtMoney(pix) })} — "${STR.matheus.missionPix}"`, 'green', 5200), 900);
    }
    g.audio.fanfare();
  }

  update(dt) {
    const g = this.g;
    const busy = g.mode !== 'play' && g.mode !== 'train' && g.mode !== 'work';
    const freq = g.mods?.goldenFreq ?? 1;
    // Shake dourado
    if (this.golden) {
      const gd = this.golden;
      gd.t += dt;
      gd.life -= dt;
      gd.group.position.y = 0.55 + Math.sin(gd.t * 2.4) * 0.12;
      gd.group.rotation.y += dt * 1.6;
      gd.group.userData.halo.scale.setScalar(1 + Math.sin(gd.t * 5) * 0.12);
      if (Math.random() < 0.6) g.particles.aura(gd.group.position, 0xffd34d, 0.3);
      const d = Math.hypot(gd.group.position.x - g.luisao.pos.x, gd.group.position.z - g.luisao.pos.z);
      if (d < BALANCE.golden.pickupRadius && g.mode === 'play') return this.collectGolden();
      if (gd.life <= 0) {
        this._removeGolden();
        g.hud.toast(eventText(this.s.story.gym, 'goldenGone'), '', 2600);
        this.goldenTimer = rand(BALANCE.golden.minSec, BALANCE.golden.maxSec);
      }
    } else if (!busy && !g.inCar) {
      this.goldenTimer -= dt * freq;
      if (this.goldenTimer <= 0) this.spawnGolden();
    }
    // Energético: só aparece depois que você tem um trampo, e é bem mais raro que o Shake
    if (this.energy) {
      const en = this.energy;
      en.t += dt;
      en.life -= dt;
      en.group.position.y = (en.baseY ?? 0.55) + Math.sin(en.t * 2.8) * 0.1;
      en.group.rotation.y += dt * 2.2;
      en.group.userData.halo.scale.setScalar(1 + Math.sin(en.t * 6) * 0.14);
      if (Math.random() < 0.5) g.particles.aura(en.group.position, 0x7dff4d, 0.28);
      const d = Math.hypot(en.group.position.x - g.luisao.pos.x, en.group.position.z - g.luisao.pos.z);
      if (d < BALANCE.energy.pickupRadius && g.mode === 'play') return this.collectEnergy();
      if (en.life <= 0) {
        this._removeEnergy();
        g.hud.toast(STR.events.energyGone, '', 2600);
        this.energyTimer = rand(BALANCE.energy.minSec, BALANCE.energy.maxSec);
      }
    } else if (!busy && g.jobs?.anyUnlocked()) {
      this.energyTimer -= dt;
      if (this.energyTimer <= 0) this.spawnEnergy();
    }
    // Eventos aleatórios
    if (!busy) {
      this.randomTimer -= dt;
      if (this.randomTimer <= 0) {
        this.randomTimer = rand(BALANCE.randomEvents.minSec, BALANCE.randomEvents.maxSec);
        this._randomEvent();
      }
    }
  }
}
