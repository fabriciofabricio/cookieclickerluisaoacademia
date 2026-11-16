import * as THREE from 'three';
import { BALANCE, MUSCLES, SPLITS } from '../config/balance.js';
import { COMPANIONS, COMPANION_BY_ID } from '../config/companions.js';
import * as CR from './CompanionRules.js';
import * as Prog from './Progression.js';
import { createRig, Actor } from '../characters/Character.js';
import { WaifuDevice, waifuPortrait } from '../world/WaifuDevice.js';
import { STR, t, muscleName, upper } from '../i18n/pt-BR.js';
import { fmtMoney } from '../core/format.js';
import { pick, rand, clamp } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Equipe do Luisão em tempo real: o personal segue o Luisão e fica
//  do lado da máquina contando as reps; a waifu aparece no celular
//  (ou holograma), avisa da fadiga e chama pra "Hora da água!".
//  Também: teste grátis, contratação, vínculo, química, treino guiado
//  e os Momentos de vínculo máximo.
// ════════════════════════════════════════════════════════════════

const C = BALANCE.companions;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

export class Companions {
  constructor(game) {
    this.g = game;
    this.actors = {};
    this.loading = {};
    this.bubbles = {};
    this.lastTalk = { personal: -99, waifu: -99 };
    this.device = new WaifuDevice(game.loader);
    game.scene.add(this.device.group);
    this.waterT = rand(...C.waterEverySec);
    this.water = null;
    this.guided = null;
    this.guideT = 0;
    this.warnT = 0;
    this.pendingOffer = null;
    this.momentoQueue = [];
    this.cheer = {};
  }

  get s() {
    return this.g.state;
  }

  get c() {
    return this.s.companions;
  }

  name(id) {
    return STR.team.members[id]?.name ?? id;
  }

  // ── Disponibilidade ──────────────────────────────────────────────
  isAvailable(id) {
    const d = COMPANION_BY_ID[id];
    const s = this.s;
    if (this.c.owned[id] || this.c.available[id]) return true;
    if (!CR.tierOpen(s, id)) return false;
    const dbg = s.debugTier != null;
    switch (d.unlock) {
      case 'cleitonArrived':
        return !!s.flags.cleitonArrived;
      case 'waifuAd':
        return !!s.flags.waifuAd;
      case 'gym':
        return true;
      case 'level5':
        return dbg || s.story.level >= 5;
      case 'level6':
        return dbg || s.story.level >= 6;
      case 'level9':
        return dbg || s.story.level >= 9;
      case 'brayanFriend':
        return !!s.flags.brayanFriend;
      default:
        return false;
    }
  }

  // ── Compra / equipar ─────────────────────────────────────────────
  hire(id) {
    if (this.c.owned[id] || !this.isAvailable(id)) return false;
    const cost = CR.hireCost(id);
    if (this.s.dinheiro < cost) return false;
    this.s.dinheiro -= cost;
    this.c.owned[id] = { level: 1, bond: 0, momento: false };
    if (this.c.trial?.id === id) this.c.trial = null;
    this.equip(id, true);
    this.g.audio.purchase();
    this.g.hud.banner(t('team.hiredTitle', { name: upper(this.name(id)) }), STR.team.members[id].hiredSub, 'green');
    this.say(COMPANION_BY_ID[id].slot, pick(STR.team.members[id].hello), { force: true });
    return true;
  }

  levelUp(id) {
    const st = CR.levelStatus(this.s, id);
    if (!st.ok) return false;
    this.s.dinheiro -= st.cost;
    this.c.owned[id].level++;
    this.g.audio.purchase();
    this.g.hud.toast(`⬆ ${this.name(id)} → ${STR.hud.level_short} ${this.c.owned[id].level}`, 'gold');
    return true;
  }

  equip(id, force = false) {
    const d = COMPANION_BY_ID[id];
    if (!this.c.owned[id]) return { ok: false };
    const cur = this.c.equipped[d.slot];
    if (cur === id) return { ok: false };
    if (!force && cur && this.s.playTime < this.c.switchReadyAt) return { ok: false, wait: Math.ceil(this.c.switchReadyAt - this.s.playTime) };
    this.c.equipped[d.slot] = id;
    if (cur) this.c.switchReadyAt = this.s.playTime + C.switchCooldownSec;
    this._checkPair();
    return { ok: true };
  }

  unequip(slot) {
    this.c.equipped[slot] = null;
  }

  deviceCost(n) {
    return C.deviceCost[n];
  }

  canBuyDevice(n) {
    return n === this.c.device + 1 && n <= (this.s.debugTier ?? BALANCE.gymOrder.indexOf(this.s.story.gym)) && Object.values(this.c.owned).length > 0;
  }

  buyDevice(n) {
    if (!this.canBuyDevice(n) || this.s.dinheiro < C.deviceCost[n]) return false;
    this.s.dinheiro -= C.deviceCost[n];
    this.c.device = n;
    this.g.audio.purchase();
    this.g.hud.toast(`📱 ${STR.team.devices[n].name}!`, 'gold');
    return true;
  }

  // ── Teste grátis ─────────────────────────────────────────────────
  startTrial(id) {
    const c = this.c;
    if (c.owned[id] || c.trialsUsed[id]) return false;
    c.available[id] = true;
    c.trial = { id, until: this.s.playTime + C.trialSec };
    c.trialsUsed[id] = true;
    this.g.hud.toast(`⏱ ${t('team.trialStart', { name: this.name(id), s: C.trialSec })}`, 'green', 4200);
    this.say(COMPANION_BY_ID[id].slot, pick(STR.team.members[id].hello), { force: true });
    return true;
  }

  _endTrial() {
    const id = this.c.trial.id;
    this.c.trial = null;
    this.pendingOffer = id;
  }

  _showOffer(id) {
    const g = this.g;
    const cost = CR.hireCost(id);
    const m = STR.team.members[id];
    const waifu = COMPANION_BY_ID[id].slot === 'waifu';
    g.modal.show({
      title: waifu ? STR.team.offerTitleWaifu : STR.team.offerTitlePersonal,
      html: `<div class="team-offer">${this.portraitHtml(id, 'big')}<p>"${m.offer}"</p><p>${t(waifu ? 'team.offerBodyWaifu' : 'team.offerBodyPersonal', { name: m.name, cost: fmtMoney(cost) })}</p></div>`,
      buttons: [
        { text: STR.team.later, cls: 'sec' },
        {
          text: `${waifu ? STR.team.install : STR.team.hire} • ${fmtMoney(cost)}`,
          onClick: () => {
            if (!this.hire(id)) g.hud.toast(t('team.noMoney', { n: fmtMoney(cost - this.s.dinheiro) }), 'pink', 3600);
          },
        },
      ],
    });
  }

  /** Cleiton chegou no portão (primo da Jéssica). */
  async cleitonArrives() {
    const s = this.s;
    if (s.flags.cleitonArrived) return;
    s.flags.cleitonArrived = true;
    this.c.available.cleiton = true;
    const a = await this._ensureActor('cleiton');
    a.place(0.9, 9.5, Math.PI);
    const w = this.g.gymDef.personalWait;
    a.moveTo(w.pos[0], w.pos[1], () => (a.yaw = w.yaw), 0.2);
    this.g.hud.toast(`💬 ${STR.team.members.cleiton.arrivalToast}`, 'pink', 6000);
  }

  /** Falar com um personal que ainda não é da Equipe (o Cleiton no portão). */
  async talkTo(id) {
    const g = this.g;
    if (this.c.owned[id]) return;
    const m = STR.team.members[id];
    const a = this.actors[id];
    if (!this.c.trialsUsed[id]) {
      const story = g.story;
      story._enterScene();
      story.speakers = { [m.name]: a, [STR.npcs.luisao]: g.luisao };
      story.listener = g.luisao;
      story._faceEachOther(g.luisao, a);
      await g.dialogue.play(m.intro.map((text) => ({ who: m.name, text })));
      story._exitScene();
      this.startTrial(id);
    } else {
      this._showOffer(id);
    }
  }

  /** Personal parado esperando (pra interação/prompt). */
  waitingActor() {
    const s = this.s;
    if (!s.flags.cleitonArrived || this.c.owned.cleiton || CR.isTrial(s, 'cleiton')) return null;
    const a = this.actors.cleiton;
    return a ? { id: 'cleiton', a } : null;
  }

  // ── Vínculo ──────────────────────────────────────────────────────
  _bump(id, n = 1) {
    const o = this.c.owned[id];
    if (!o) return;
    const before = CR.bondLevel(o.bond);
    o.bond += n;
    const after = CR.bondLevel(o.bond);
    if (after > before) {
      const label = COMPANION_BY_ID[id].slot === 'personal' ? STR.team.bondPersonal : STR.team.bondWaifu;
      this.g.hud.toast(`${COMPANION_BY_ID[id].slot === 'personal' ? '🤝' : '✨'} ${t('team.bondUp', { label, n: after, name: this.name(id) })}`, 'pink', 3600);
      this.g.audio.hit();
      if (after >= 5 && !o.momento) this.momentoQueue.push(id);
    }
  }

  onRep(r) {
    const s = this.s;
    const p = CR.equipped(s, 'personal');
    const w = CR.equipped(s, 'waifu');
    if (p && this.c.owned[p]) this._bump(p);
    if (w && this.c.owned[w]) this._bump(w);
    if (p) {
      const L = STR.team.members[p];
      if (r.soMaisUma) {
        this.say('personal', STR.team.members.cleiton.soMaisUma, { force: true });
        this.g.audio.whistle();
        this._cheer(p);
      } else if (r.mega) this.say('personal', STR.team.mega, { force: true });
      else if (r.crit) {
        this.say('personal', pick(L.crit));
        this._cheer(p);
      } else if (this.g.training.setReps > 2 && Math.random() < 0.35) this.say('personal', `${this.g.training.setReps}! ${pick(L.count)}`);
    }
    if (w) {
      if (r.fatigue > 0.85 && s.playTime > this.warnT) {
        this.warnT = s.playTime + 25;
        this.say('waifu', STR.team.members[w].tired, { force: true });
      } else if (r.pumpStarted) this.say('waifu', pick(STR.team.members[w].cheer));
    }
  }

  onTask() {
    const w = CR.equipped(this.s, 'waifu');
    if (w && this.c.owned[w]) this._bump(w);
    if (w && Math.random() < 0.04) this.say('waifu', pick(STR.team.members[w].work));
  }

  onTrait(id) {
    const w = CR.equipped(this.s, 'waifu');
    if (!w) return;
    if (id === 'baka') this.say('waifu', STR.team.members.mei.switchLine, { force: true });
    if (id === 'respiracao') this.say('waifu', STR.team.members.yume.breathLine, { force: true });
  }

  onPR() {
    const p = CR.equipped(this.s, 'personal');
    if (p) {
      this.say('personal', STR.team.pr, { force: true });
      this._cheer(p);
    }
  }

  _cheer(id) {
    this.cheer[id] = this.s.playTime + 0.9;
  }

  _checkPair() {
    const pair = CR.activePair(this.s);
    if (!pair || this.c.pairsFound[pair.id]) return;
    if (!this.c.owned[pair.personal] || !this.c.owned[pair.waifu]) return;
    this.c.pairsFound[pair.id] = true;
    const P = STR.team.pairs[pair.id];
    this.g.hud.banner(STR.team.chemistry, `${P.name} • +${Math.round(C.chemistryBonus * 100)}%`, 'pink');
    this.g.audio.fanfare();
    this.say('personal', P.lines[0], { force: true, ms: 3600 });
    setTimeout(() => this.say('waifu', P.lines[1], { force: true, ms: 3600 }), 1800);
  }

  // ── Falas (balões) ───────────────────────────────────────────────
  say(slot, text, { force = false, ms = 2600 } = {}) {
    if (!text) return;
    const gap = C.talkGap[this.c.talk] ?? 7;
    const now = this.s.playTime;
    if (gap === Infinity && !force) return;
    if (!force && now - this.lastTalk[slot] < gap) return;
    this.bubbles[slot] = { text, until: now + ms / 1000 };
    this.lastTalk[slot] = now;
    if (slot === 'waifu') this.device.talk(Math.min(2.2, text.length * 0.05));
  }

  /** Balões pro WorldPrompts: [{key, pos, text, cls}] */
  bubbleList() {
    const out = [];
    const now = this.s.playTime;
    const p = CR.equipped(this.s, 'personal');
    const pa = p && this.actors[p];
    if (pa && this.bubbles.personal?.until > now && pa.rig.object3D.visible) {
      out.push({ key: 'bub_p', pos: pa.rig.headWorld.add(_v.set(0, 0.42, 0)), text: this.bubbles.personal.text, cls: 'wbubble personal' });
    }
    if (this.device.group.visible && this.bubbles.waifu?.until > now) {
      out.push({ key: 'bub_w', pos: this.device.speechAnchor, text: this.bubbles.waifu.text, cls: 'wbubble waifu' });
    }
    return out;
  }

  // ── Treino guiado ────────────────────────────────────────────────
  _suggest() {
    const s = this.s;
    const g = this.g;
    if (!CR.equipped(s, 'personal')) return (this.guided = null);
    const cap = Prog.capFor(s);
    const weak = Prog.weakestMuscle(s);
    const pair = SPLITS[s.split.index];
    const status = Prog.requirementStatus(s);
    const cur = g.trainingMachine?.def.id;
    let best = null;
    let bs = -Infinity;
    for (const m of g.gymDef.machines) {
      if (m.id === cur) continue;
      const ms = s.muscles[m.muscle];
      if (ms.level >= cap) continue;
      let sc = (1 - ms.fatigue) * 2;
      if (m.muscle === pair.a && s.split.aReps < BALANCE.split.repsEach) sc += 1.5;
      if (m.muscle === pair.b && s.split.bReps < BALANCE.split.repsEach) sc += 1.5;
      if (m.muscle === weak) sc += 1.2;
      const it = status.items?.find((i) => i.id === m.muscle);
      if (it && !it.met) sc += 0.6;
      if (sc > bs) {
        bs = sc;
        best = m;
      }
    }
    this.guided = best ? { machineId: best.id, muscle: best.muscle } : null;
  }

  consumeGuided(machineId) {
    return !!(this.guided && this.guided.machineId === machineId && CR.equipped(this.s, 'personal'));
  }

  guidedChip() {
    const p = CR.equipped(this.s, 'personal');
    if (!p || !this.guided || !['play', 'train'].includes(this.g.mode)) return null;
    if (this.g.trainingMachine?.def.id === this.guided.machineId) return null;
    return { name: this.name(p), muscle: upper(muscleName(this.guided.muscle)), machineId: this.guided.machineId };
  }

  // ── Água ─────────────────────────────────────────────────────────
  drinkWater() {
    if (!this.water) return;
    this.water = null;
    const s = this.s;
    for (const m of [...MUSCLES, 'resistencia', 'carisma']) s.muscles[m].fatigue = Math.max(0, s.muscles[m].fatigue - C.waterRecover);
    s.jobs.mind.fatigue = Math.max(0, s.jobs.mind.fatigue - C.waterRecover);
    this.g.audio.kira();
    this.g.hud.toast(`💧 ${STR.team.waterDone}`, 'blue', 2600);
    this.g.particles.sparkle(this.g.luisao.rig.headWorld, 20, 0x7fd0ff, 1.4);
    const w = CR.equipped(s, 'waifu');
    if (w) this.say('waifu', STR.team.members[w].waterThanks, { force: true });
  }

  // ── HUD ──────────────────────────────────────────────────────────
  portraitHtml(id, cls = '') {
    const d = COMPANION_BY_ID[id];
    if (d.slot === 'waifu') return `<span class="cport waifu ${cls}"><img src="${waifuPortrait(id, d.look, this.device.id === id ? this.device.img : null)}" alt=""></span>`;
    const look = d.look ?? {};
    const col = '#' + (look.top ?? 0x777777).toString(16).padStart(6, '0');
    return `<span class="cport personal ${cls}" style="--c:${col}">${d.icon}</span>`;
  }

  badges() {
    const s = this.s;
    const out = [];
    for (const slot of ['personal', 'waifu']) {
      const id = CR.equipped(s, slot);
      if (!id) continue;
      let info = '';
      if (CR.isTrial(s, id)) info = `⏱ ${Math.ceil(s.companions.trial.until - s.playTime)}s`;
      else if (COMPANION_BY_ID[id].trait === 'soMaisUma' && this.g.mode === 'train') info = `${this.g.training.setReps % 10}/10`;
      else if (COMPANION_BY_ID[id].trait === 'respiracao') info = s.playTime < s.cooldowns.yume ? `${Math.ceil(s.cooldowns.yume - s.playTime)}s` : '✓';
      else if (COMPANION_BY_ID[id].trait === 'baka') info = s.playTime < s.cooldowns.mei ? `${Math.ceil(s.cooldowns.mei - s.playTime)}s` : '✓';
      out.push({ slot, id, name: this.name(id), html: this.portraitHtml(id), info });
    }
    return out;
  }

  // ── Visuais ──────────────────────────────────────────────────────
  async _ensureActor(id) {
    if (this.actors[id]) return this.actors[id];
    if (this.loading[id]) return this.loading[id];
    const d = COMPANION_BY_ID[id];
    this.loading[id] = (async () => {
      const rig = await createRig(d.rig ?? id, this.g.loader, this.g.clips, d.look ?? {});
      const a = new Actor(rig, { name: id, walkSpeed: 3.3, runSpeed: 5.4 });
      this.g.scene.add(rig.object3D);
      rig.object3D.traverse((c) => {
        if (c.isMesh) c.userData.actor = id;
      });
      const L = this.g.luisao.pos;
      a.place(L.x + 1.2, L.z + 1.2, 0);
      this.actors[id] = a;
      return a;
    })();
    return this.loading[id];
  }

  _coachSpot(m) {
    const dir = _v.subVectors(m.camPos, m.pos).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const spot = m.pos.clone().addScaledVector(dir, 0.75).addScaledVector(side, 1.05);
    const b = this.g.gymDef.walkBounds;
    spot.x = clamp(spot.x, b.x0 + 0.4, b.x1 - 0.4);
    spot.z = clamp(spot.z, b.z0 + 0.4, b.z1 - 0.4);
    return { spot, phone: m.pos.clone().addScaledVector(dir, 0.85).addScaledVector(side, -0.85) };
  }

  _updatePersonal(dt) {
    const g = this.g;
    const s = this.s;
    const id = CR.equipped(s, 'personal');
    const waiting = this.waitingActor();
    for (const [aid, a] of Object.entries(this.actors)) {
      // No Uber o personal fica em casa (o carro é só pro Luisão e os passageiros)
      const visible = (aid === id && !g.inCar) || waiting?.id === aid;
      a.rig.object3D.visible = visible;
      if (!visible) continue;
      a.rig.lookAt(g.luisao.rig.headWorld);
      if (aid !== id) {
        // esperando no portão
        a.idleState = 'idle';
        a.update(dt, g.world);
        continue;
      }
      let target = null;
      let idle = 'idle';
      const L = g.luisao;
      if (g.mode === 'train' && g.trainingMachine) {
        target = this._coachSpot(g.trainingMachine).spot;
        idle = 'coach';
      } else if (g.mode === 'work') {
        target = g.curStation().coachSpot;
      } else if (g.mode === 'play') {
        const back = new THREE.Vector3(Math.sin(L.yaw), 0, Math.cos(L.yaw)).multiplyScalar(-1.1);
        const side = new THREE.Vector3(Math.cos(L.yaw), 0, -Math.sin(L.yaw)).multiplyScalar(0.8);
        const tgt = L.pos.clone().add(back).add(side);
        if (a.pos.distanceTo(L.pos) > 2.3 || (a.moveTarget && a.pos.distanceTo(tgt) > 0.5)) target = tgt;
      }
      if (target && a.pos.distanceTo(target) > 0.35) {
        const far = a.pos.distanceTo(target) > 4;
        if (!a.moveTarget || Math.hypot(a.moveTarget.x - target.x, a.moveTarget.z - target.z) > 0.4) a.moveTo(target.x, target.z, null, 0.25, far);
      } else if (!a.moveTarget) {
        a.faceTowards(L.pos.x, L.pos.z, dt, 5);
      }
      a.idleState = this.cheer[aid] > s.playTime ? 'celebrate' : idle;
      a.update(dt, g.world);
    }
    if (id && !this.actors[id]) this._ensureActor(id);
  }

  _updateWaifu(dt) {
    const g = this.g;
    const s = this.s;
    const id = CR.equipped(s, 'waifu');
    const dev = this.device;
    if (!id) return dev.hide();
    dev.setWaifu(id, COMPANION_BY_ID[id].look);
    dev.setDevice(this.c.device);
    dev.group.scale.setScalar(1);
    if (g.mode === 'train' && g.trainingMachine) {
      const { phone } = this._coachSpot(g.trainingMachine);
      dev.placeAt(phone, g.trainingMachine.camPos);
    } else if (g.mode === 'work') {
      const st = g.curStation();
      if (g.inCar) {
        // Dentro do carro cabe só o celular/mini-holograma, sobre o console
        dev.placeAt(st.phoneSpot, st.camPos);
        dev.group.scale.setScalar(this.c.device >= 2 ? 0.5 : 1);
      } else if (this.c.device === 0) dev.placeAt(st.phoneSpot, st.camPos);
      else dev.placeAt(st.coachSpot.clone().add(_v.set(0, 0, -0.6)), st.camPos);
    } else if (g.mode === 'play' && this.c.device === 1) {
      const L = g.luisao;
      const side = new THREE.Vector3(Math.cos(L.yaw), 0, -Math.sin(L.yaw)).multiplyScalar(0.45);
      dev.placeAt(L.pos.clone().add(side), g.camera.position);
    } else if (g.mode === 'mirror' || g.mode === 'play' || g.mode === 'dialogue' || g.mode === 'minigame') {
      dev.hide();
    }
    dev.update(dt);
  }

  // ── Momentos (vínculo máximo) ────────────────────────────────────
  async _playMomento(id) {
    const g = this.g;
    const o = this.c.owned[id];
    if (!o || o.momento) return;
    o.momento = true;
    const m = STR.team.members[id];
    const d = COMPANION_BY_ID[id];
    const story = g.story;
    story._enterScene();
    if (d.slot === 'personal' && this.actors[id]) {
      const a = this.actors[id];
      story.speakers = { [m.name]: a, [STR.npcs.luisao]: g.luisao };
      story.listener = g.luisao;
      a.place(g.luisao.pos.x + 1.1, g.luisao.pos.z, a.yaw);
      story._faceEachOther(g.luisao, a);
    } else {
      story.speakers = { [STR.npcs.luisao]: g.luisao };
      story.shot(g.luisao, null);
    }
    g.hud.toast(`💛 ${STR.team.momentoTitle}`, 'gold', 3000);
    await g.dialogue.play(m.momento.map((text) => ({ who: text.startsWith('Luisão:') ? STR.npcs.luisao : m.name, text: text.replace(/^Luisão: /, '') })));
    story._exitScene();
    g.hud.banner(STR.team.momentoTitle, m.momentoReward, 'pink');
    g.audio.fanfare();
    if (d.slot === 'personal' && this.actors[id]) this.actors[id].rig.setOutfit?.({ top: 0xffd34d });
  }

  // ── Atualização ──────────────────────────────────────────────────
  update(dt) {
    const g = this.g;
    const s = this.s;
    const c = this.c;
    // Fim do teste grátis
    if (c.trial && s.playTime >= c.trial.until) this._endTrial();
    if (this.pendingOffer && ['play', 'train', 'work'].includes(g.mode) && !g.modal.open) {
      const id = this.pendingOffer;
      this.pendingOffer = null;
      this._showOffer(id);
    }
    // Momentos ficam na fila até você estar livre
    if (this.momentoQueue.length && g.mode === 'play' && !g.modal.open) this._playMomento(this.momentoQueue.shift());
    // Cleiton esperando no portão (se o jogo carregou com ele já liberado)
    if (s.flags.cleitonArrived && !this.actors.cleiton && !this.loading.cleiton) {
      this._ensureActor('cleiton').then((a) => {
        const w = g.gymDef.personalWait;
        if (!c.owned.cleiton) a.place(w.pos[0], w.pos[1], w.yaw);
      });
    }
    // Treino guiado
    this.guideT -= dt;
    if (this.guideT <= 0) {
      this.guideT = 2;
      this._suggest();
    }
    // Hora da água
    const w = CR.equipped(s, 'waifu');
    if (w && ['play', 'train', 'work'].includes(g.mode)) {
      if (this.water && s.playTime > this.water.until) this.water = null;
      this.waterT -= dt;
      if (this.waterT <= 0 && !this.water) {
        this.waterT = rand(...C.waterEverySec);
        this.water = { until: s.playTime + C.waterLifeSec };
        this.say('waifu', STR.team.members[w].water, { force: true });
        g.audio.kira();
      }
    } else this.water = null;
    this._updatePersonal(dt);
    this._updateWaifu(dt);
  }
}

export { COMPANIONS };
