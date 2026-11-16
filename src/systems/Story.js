import * as THREE from 'three';
import { STR, t, muscleName, upper, hostStr, examTitle, gymCompleteTitle } from '../i18n/pt-BR.js';
import { BALANCE, MUSCLES } from '../config/balance.js';
import { LEVELS, EXAMS } from '../config/story.js';
import { GYMS } from '../config/gyms.js';
import * as Prog from './Progression.js';
import { createRig, Actor } from '../characters/Character.js';
import * as P from '../world/Props.js';
import { pick, shuffle, rand, randInt, el, isTouch } from '../core/utils.js';
import { fmt } from '../core/format.js';
import { passiveGps } from './Economy.js';
import * as MT from './Metodo.js';
import { NODES, FREE_NODE } from '../config/metodo.js';

// ════════════════════════════════════════════════════════════════
//  História: intro, Matheus, encontros (minigame de diálogo nesta
//  versão), términos amigáveis, fotos de progresso e a prova da
//  garagem com a queda de braço contra o Brayan Shake.
// ════════════════════════════════════════════════════════════════

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const UP = new THREE.Vector3(0, 1, 0);

export class Story {
  constructor(game) {
    this.g = game;
    this.girls = {};
    this.speakers = {};
    this.retryAt = 0;
    this.girlLineT = 0;
    this.girlLine = null;
    this.matheusAnimT = rand(8, 16);
  }

  get s() {
    return this.g.state;
  }

  // ── Cenas (modo cutscene/diálogo) ───────────────────────────────
  _enterScene({ dof = true, keepHud = false } = {}) {
    const g = this.g;
    if (g.mode === 'train') g.stopTraining();
    if (g.mode === 'work') g.stopWork();
    if (g.mode === 'mirror') g.closeMirror();
    g.menu.close();
    g.mode = 'dialogue';
    g.luisao.cancelMove();
    g.luisao.locked = true;
    g.luisao.rig.setState('idle');
    g.hud.setLetterbox(true);
    if (!keepHud) g.hud.setGameplayVisible(false);
    g.hud.showRep(false);
    g.joystick.setVisible(false);
    g.audio.duck(true);
    if (dof) g.renderer.setDOF(true, 2);
  }

  _exitScene() {
    const g = this.g;
    g.dialogue.close();
    g.hud.setLetterbox(false);
    g.hud.setGameplayVisible(true);
    g.renderer.setDOF(false);
    g.audio.duck(false);
    g.luisao.locked = false;
    g.luisao.rig.setState('idle');
    for (const a of Object.values(this.speakers)) if (a?.rig) a.rig.talking = false;
    this.speakers = {};
    this.listener = null;
    g.mode = 'play';
    g.camRig.follow();
    g.camRig.yaw = g.luisao.yaw + Math.PI;
    g.joystick.setVisible(isTouch());
  }

  /** Câmera de plano/contraplano: por cima do ombro de quem escuta. */
  shot(speaker, listener, lerp = 3.2) {
    const g = this.g;
    if (!speaker) return;
    const sH = speaker.rig.headWorld;
    if (!listener) {
      const f = new THREE.Vector3(Math.sin(speaker.yaw), 0, Math.cos(speaker.yaw));
      g.camRig.setShot(sH.clone().addScaledVector(f, 1.6).add(new THREE.Vector3(0.3, 0.05, 0)), sH.clone().add(new THREE.Vector3(0, -0.08, 0)), lerp);
      g.renderer.setDOF(true, 1.6);
      return;
    }
    const lH = listener.rig.headWorld;
    const dir = sH.clone().sub(lH).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const camPos = lH.clone().addScaledVector(dir, -0.75).addScaledVector(side, 0.48).add(new THREE.Vector3(0, 0.12, 0));
    const look = sH.clone().add(new THREE.Vector3(0, -0.07, 0));
    g.camRig.setShot(camPos, look, lerp);
    g.renderer.setDOF(true, camPos.distanceTo(sH));
  }

  onDialogueLine(line) {
    const sp = this.speakers[line.who];
    if (!sp) return;
    let listener = this.listener && this.listener !== sp ? this.listener : this.g.luisao !== sp ? this.g.luisao : null;
    if (sp === this.g.luisao) listener = this.listener;
    this.shot(sp, listener);
    for (const a of Object.values(this.speakers)) if (a?.rig) a.rig.talking = false;
    sp.rig.talking = true;
    clearTimeout(this._talkT);
    this._talkT = setTimeout(() => (sp.rig.talking = false), Math.min(4000, line.text.length * 38));
  }

  _faceEachOther(a, b) {
    a.yaw = a.yawTo(b.pos.x, b.pos.z);
    b.yaw = b.yawTo(a.pos.x, a.pos.z);
    a._sync();
    b._sync();
  }

  // ── Intro ───────────────────────────────────────────────────────
  async intro() {
    const g = this.g;
    const st = this.s.story;
    this._enterScene({ dof: false });
    // Fly-through de revelação da garagem
    g.audio.gymUnlock();
    this._titleCard(STR.gyms.garagem.name, STR.gyms.garagem.subtitle);
    await new Promise((r) => g.camRig.playPath(this.g.gymDef.flythrough, 2.3, r));
    g.mode = 'dialogue';
    // Narração em cima do Luisão
    this.speakers = { [STR.npcs.luisao]: g.luisao };
    const L = g.luisao;
    this.shot(L, null);
    await g.dialogue.play(STR.intro.narration.map((text) => ({ who: null, text })));
    // Seu Zé
    const ze = g.npcs.seuze;
    this.speakers = { [STR.npcs.seuze]: ze, [STR.npcs.luisao]: L };
    this.listener = L;
    L.pos.set(3.9, 0, -1.6);
    L.yaw = L.yawTo(ze.pos.x, ze.pos.z);
    L._sync();
    await g.dialogue.play(STR.seuze.welcome.map((text) => ({ who: STR.npcs.seuze, text })));
    st.seuZeIntroSeen = true;
    // Matheus
    const mat = g.npcs.matheus;
    L.pos.set(mat.pos.x + 1.2, 0, mat.pos.z - 0.3);
    this._faceEachOther(L, mat);
    this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: L };
    this.listener = L;
    await g.dialogue.play(STR.matheus.intro.map((text) => ({ who: STR.npcs.matheus, text })));
    st.matheusIntroSeen = true;
    st.introSeen = true;
    st.levelStartedAt = this.s.playTime;
    this._exitScene();
    await this.maybeTeaser();
  }

  _titleCard(title, sub) {
    const c = el('div', 'titlecard', `<div class="tc">${title}<small>${sub}</small></div>`);
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3800);
  }

  async maybeTeaser() {
    const st = this.s.story;
    if (st.phase !== 'train' || st.teaserSeenFor >= st.level) return;
    const lv = LEVELS[st.level - 1];
    if (!lv) return;
    st.teaserSeenFor = st.level;
    const gf = STR.girlfriends[lv.girl];
    await this.g.modal.ask({
      title: STR.dates.teaserTitle,
      cls: 'teaser',
      html: `<div class="portrait"><div class="sil"></div></div><p class="line">"${gf.teaser}"</p>
        <p>${t('dates.teaserReq', { m: `<b style="color:var(--gold)">${lv.muscle}</b>`, r: lv.resistencia, c: lv.carisma, extra: lv.simetria ? t('dates.teaserSym', { n: lv.simetria }) : '' })}</p>`,
      buttons: [{ text: STR.dates.teaserBtn }],
    });
  }

  // ── Matheus ─────────────────────────────────────────────────────
  matheusReady() {
    const status = Prog.requirementStatus(this.s);
    return status.goal.type !== 'done' && status.allMet && !this.s.story.matheusTalked;
  }

  /** O Matheus ainda não apresentou o Método (a partir do nível 2). */
  metodoIntroPending() {
    const st = this.s.story;
    return st.introSeen && !this.s.metodo.introSeen && (st.level >= 2 || st.phase !== 'train');
  }

  matheusBang() {
    return this.matheusReady() || this._stuckBang || this.metodoIntroPending() || (this.s.story.introSeen && !this.s.story.matheusIntroSeen);
  }

  /** 💵 em cima do Matheus: tem técnica que dá pra comprar. */
  matheusCoin() {
    return !this.matheusBang() && MT.anyAffordable(this.s);
  }

  updateMatheus(a, dt, dist) {
    // Gag: de vez em quando ele "treina" do lado do Luisão (e continua magrelo).
    if (a.scripted) return;
    this.matheusAnimT -= dt;
    if (this.matheusAnimT <= 0 && dist > 2) {
      this.matheusAnimT = rand(14, 26);
      a.idleState = 'curl';
      let reps = 0;
      const tick = setInterval(() => {
        a.rig.rep(0.9);
        if (++reps >= 4) {
          clearInterval(tick);
          setTimeout(() => (a.idleState = 'idle'), 1200);
        }
      }, 950);
    }
  }

  async talkTo(key) {
    const g = this.g;
    if (g.mode !== 'play') return;
    if (key === 'seuze') return this._talkSeuZe();
    if (key !== 'matheus') return g.companions.talkTo(key);
    // Prioridade: o que é importante pra história vem primeiro; senão, abre o Método Neumman.
    const st = this.s.story;
    const status = Prog.requirementStatus(this.s);
    if (status.goal.type !== 'done' && status.allMet && !st.matheusTalked) {
      if (status.goal.type === 'exam') return this._matheusExamTalk();
      return this._matheusTip(status.goal);
    }
    if (this.metodoIntroPending()) return this._metodoIntro();
    return this._matheusMetodo();
  }

  /** Apresentação do Método Neumman (uma vez): técnica cortesia + primeiro trampo. */
  async _metodoIntro() {
    const g = this.g;
    const s = this.s;
    const mat = g.npcs.matheus;
    this._enterScene();
    this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    this._faceEachOther(g.luisao, mat);
    await g.dialogue.play(STR.metodo.intro.map((text) => ({ who: STR.npcs.matheus, text })));
    s.metodo.introSeen = true;
    s.metodo.nodes[FREE_NODE] = Math.max(1, s.metodo.nodes[FREE_NODE] ?? 0);
    g.audio.purchase();
    g.hud.toast(`🎁 ${STR.metodo.freeGift}`, 'gold', 4200);
    g.dialogue.close();
    await g.metodoUI.open({ greeting: STR.metodo.buyLines[1], highlight: FREE_NODE });
    // Primeiro trampo
    this.shot(mat, g.luisao);
    await g.dialogue.play(STR.metodo.introJob.map((text) => ({ who: STR.npcs.matheus, text })));
    g.jobs.unlock('uber', false);
    this._exitScene();
    g.syncWorkStations();
    g.hud.banner(STR.jobs.common.unlocked, `${STR.jobs.uber.name} • ${STR.jobs.uber.app}`, 'green');
    g.hud.toast(`💼 ${STR.metodo.workArrow}`, 'green', 6000);
    g.save();
  }

  /** Conversa normal com o Matheus: abre o Método (com a fala dele, missão e atalhos). */
  async _matheusMetodo() {
    const g = this.g;
    const s = this.s;
    const st = s.story;
    if (!s.metodo.introSeen) return this._matheusRandom();
    const mat = g.npcs.matheus;
    const status = Prog.requirementStatus(s);
    const dateReady = status.goal.type !== 'done' && status.allMet && st.matheusTalked;
    // Fala de abertura: travado → dica do ponto fraco (com sugestão de técnica); encontro pronto; canto novo; aleatória.
    let greeting;
    const stage = MT.matheusStage(s);
    if (this._stuckBang) {
      const sug = NODES.find((n) => MT.status(s, n.id).ok || MT.status(s, n.id).reason === 'money');
      greeting = `${this._stuckText()}${sug ? ' ' + t('metodo.stuckSuggest', { node: STR.metodo.nodes[sug.id].name }) : ''}`;
      this._stuckBang = false;
    } else if (dateReady) greeting = STR.metodo.greetingDate;
    else if (stage > (s.flags.cornerSeen ?? 0)) {
      s.flags.cornerSeen = stage;
      greeting = STR.metodo.corner[stage] || pick(STR.matheus.random);
    } else if (s.companions.equipped.personal && !s.flags.personalJoke) {
      s.flags.personalJoke = true;
      greeting = STR.matheus.personalJealous;
    } else if (s.companions.equipped.waifu && !s.flags.waifuJoke) {
      s.flags.waifuJoke = true;
      greeting = STR.matheus.waifuJoke;
    } else greeting = pick(STR.matheus.random);
    // Missão do açaí vira um cartão "Aceitar / Agora não"
    let mission = null;
    if (!s.mission && s.playTime >= s.cooldowns.matheusMission && Math.random() < BALANCE.matheus.missionChance) {
      mission = this._makeMission();
      if (mission) mission.text = t('matheus.mission', { total: mission.total, muscle: muscleName(mission.muscle) });
    }
    this._enterScene();
    this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    this._faceEachOther(g.luisao, mat);
    this.shot(mat, g.luisao);
    // Papo bom com o Matheus continua dando Carisma (com recarga)
    if (s.playTime >= s.cooldowns.matheusCarisma) {
      s.cooldowns.matheusCarisma = s.playTime + BALANCE.matheus.carismaCooldownSec;
      const n = BALANCE.matheus.carismaPoints;
      g.training.addStat('carisma', n);
      g.hud.toast(`💬 ${t('matheus.carismaGain', { n })}`, 'pink');
    }
    const res = await g.metodoUI.open({ greeting, mission, goDate: dateReady });
    if (mission) s.cooldowns.matheusMission = s.playTime + BALANCE.matheus.missionCooldownSec;
    if (mission && res?.mission) {
      delete mission.text;
      s.mission = mission;
    }
    this._exitScene();
    if (res?.goWork) g.goToWork();
    if (res?.goDate) this.startGoal();
  }

  async _quickLine(actor, text, who = STR.npcs.matheus) {
    const g = this.g;
    this._enterScene();
    this.speakers = { [who]: actor, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    this._faceEachOther(g.luisao, actor);
    await g.dialogue.play([{ who, text }]);
    this._exitScene();
  }

  async _talkSeuZe() {
    const g = this.g;
    const ze = g.npcs.seuze;
    const H = this.host();
    const text = Prog.isFrango(this.s) ? H.frangoWarn.replace(/^[^:]+: /, '').replace(/^"|"$/g, '') : pick(H.talk);
    this._enterScene();
    this.speakers = { [H.name]: ze, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    g.luisao.yaw = g.luisao.yawTo(ze.pos.x, ze.pos.z);
    g.luisao._sync();
    await g.dialogue.play([{ who: H.name, text }]);
    this._exitScene();
  }

  async _matheusRandom() {
    const g = this.g;
    const s = this.s;
    const mat = g.npcs.matheus;
    this._enterScene();
    this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    this._faceEachOther(g.luisao, mat);
    const lines = [{ who: STR.npcs.matheus, text: this._stuckBang ? this._stuckText() : pick(STR.matheus.random) }];
    this._stuckBang = false;
    let mission = null;
    if (!s.mission && s.playTime >= s.cooldowns.matheusMission && Math.random() < BALANCE.matheus.missionChance) {
      mission = this._makeMission();
      if (mission) lines.push({ who: STR.npcs.matheus, text: t('matheus.mission', { total: mission.total, muscle: muscleName(mission.muscle) }) });
    }
    await g.dialogue.play(lines);
    this._exitScene();
    if (mission) {
      s.mission = mission;
      s.cooldowns.matheusMission = s.playTime + BALANCE.matheus.missionCooldownSec;
    }
    if (s.playTime >= s.cooldowns.matheusCarisma) {
      s.cooldowns.matheusCarisma = s.playTime + BALANCE.matheus.carismaCooldownSec;
      const n = BALANCE.matheus.carismaPoints;
      g.training.addStat('carisma', n);
      g.hud.toast(`💬 ${t('matheus.carismaGain', { n })}`, 'pink');
      g.floaters.spawn(`+${n} ${STR.muscles.carisma}`, g.luisao.rig.headWorld.add(new THREE.Vector3(0, 0.4, 0)), 'carisma');
    }
  }

  _makeMission() {
    const cap = Prog.capFor(this.s);
    const options = MUSCLES.filter((m) => this.s.muscles[m].level < cap);
    if (!options.length) return null;
    const weak = Prog.weakestMuscle(this.s);
    const muscle = Math.random() < 0.6 && weak ? weak : pick(options);
    const [a, b] = BALANCE.matheus.missionReps;
    const total = Math.round((randInt(a, b) * (1 + this.s.story.level / 3)) / 5) * 5;
    return { muscle, total, done: 0 };
  }

  _stuckText() {
    const st = Prog.requirementStatus(this.s);
    const w = st.worst;
    return t('matheus.stuck', { muscle: w ? w.label.toLocaleLowerCase('pt-BR') : STR.muscles.panturrilhas.toLocaleLowerCase('pt-BR') });
  }

  async _matheusTip(goal) {
    const g = this.g;
    const st = this.s.story;
    // Término amigável com a namorada atual antes de seguir em frente
    if (st.currentGirl && !st.breakupsDone[st.currentGirl]) await this._breakup(st.currentGirl);
    const mat = g.npcs.matheus;
    this._enterScene();
    this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    g.luisao.pos.set(mat.pos.x + 1.1, 0, mat.pos.z - 0.2);
    this._faceEachOther(g.luisao, mat);
    const gf = STR.girlfriends[goal.girl];
    const lines = [
      { who: STR.npcs.matheus, text: STR.matheus.readyBark },
      { who: STR.npcs.matheus, text: `${STR.matheus.tipTitle}: ${gf.tip}` },
      { who: STR.npcs.matheus, text: STR.matheus.tipOutro },
    ];
    if (st.breakupsDone[st.currentGirl] === 'now') lines.unshift({ who: STR.npcs.matheus, text: STR.matheus.breakupComfort });
    await g.dialogue.play(lines);
    if (st.currentGirl) st.breakupsDone[st.currentGirl] = true;
    st.matheusTalked = true;
    this._exitScene();
    g.hud.toast(`💡 ${STR.matheus.tipTitle} ✔`, 'pink');
    g.hud.banner(STR.hud.goDate, gf.name, 'pink');
    g.audio.hit();
  }

  async _breakup(girl) {
    const g = this.g;
    const gf = STR.girlfriends[girl];
    const actor = await this._girl(girl);
    this._enterScene();
    actor.scripted = true;
    actor.rig.object3D.visible = true;
    const [bx, bz] = g.gymDef.dateSpot?.center ?? [-0.2, 6.15];
    actor.place(bx + 0.2, bz + 0.05, Math.PI);
    g.luisao.pos.set(bx + 0.2, 0, bz - 1.15);
    this._faceEachOther(g.luisao, actor);
    this.speakers = { [gf.name]: actor, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    g.hud.toast(`💌 ${STR.dates.breakupTitle}`, 'pink');
    await g.dialogue.play(gf.breakup.map((text) => ({ who: gf.name, text })));
    // A Marlene deixa o notebook velho dela (fica guardado no caixote; o Vibecoder só abre na academia nova).
    if (girl === 'marlene' && gf.notebookGift && !this.s.flags.notebookGift) {
      await g.dialogue.play(gf.notebookGift.map((text) => ({ who: gf.name, text })));
      this.s.flags.notebookGift = true;
    }
    actor.rig.setState('celebrate');
    await wait(900);
    actor.rig.object3D.visible = false;
    this.s.story.breakupsDone[girl] = 'now';
    this._exitScene();
  }

  async _girl(key) {
    if (this.girls[key]) return this.girls[key];
    const rig = await createRig(key, this.g.loader, this.g.clips);
    const a = new Actor(rig, { name: key });
    a.scripted = true;
    a.locked = true; // animação controlada pela cena
    this.g.scene.add(rig.object3D);
    this.girls[key] = a;
    this.g.npcs['girl_' + key] = a;
    return a;
  }

  // ── Objetivo: encontro ou prova ─────────────────────────────────
  async startGoal() {
    const g = this.g;
    if (g.mode !== 'play' && g.mode !== 'train') return;
    const status = Prog.requirementStatus(this.s);
    if (status.goal.type === 'done') return this.offerTravel();
    if (!status.allMet || !this.s.story.matheusTalked) return;
    if (this.s.playTime < this.retryAt) {
      g.hud.toast(t('dates.retryIn', { s: Math.ceil(this.retryAt - this.s.playTime) }), 'pink');
      return;
    }
    if (status.goal.type === 'date') return this.runDate(status.goal);
    if (status.goal.type === 'exam') return this.runExam();
  }

  _dateSet(girl) {
    // Cenário rápido na calçada, debaixo do poste (o cenário 3D próprio de cada encontro chega numa próxima atualização).
    if (this.dateSet) this.g.scene.remove(this.dateSet);
    const set = new THREE.Group();
    const table = new THREE.Group();
    const pm = P.M.plasticWhite();
    P.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24), pm, 0, 0.72, 0, table);
    P.mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.72, 10), pm, 0, 0.36, 0, table);
    set.add(table);
    if (girl === 'marlene') {
      const box = P.mesh(P.rbox(0.36, 0.06, 0.26, 0.01), new THREE.MeshStandardMaterial({ color: 0x5a2a8a, roughness: 0.6 }), 0, 0.77, 0, set);
      box.rotation.y = 0.3;
      const d20 = P.mesh(new THREE.IcosahedronGeometry(0.035), new THREE.MeshPhysicalMaterial({ color: 0xff3a6a, roughness: 0.2, clearcoat: 1 }), 0.15, 0.78, 0.1, set);
      d20.name = 'd20';
      const lights = P.bunting([-1.6, 2.4, -0.6], [1.6, 2.4, -0.6], 0.25, 14);
      lights.children.forEach((c, i) => c.isMesh && i > 0 && (c.material = P.M.emissive([0xffd34d, 0xff8fd0, 0x4fd1ff][i % 3], 2.5)));
      set.add(lights);
    } else if (girl === 'jessica') {
      const basket = P.mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.07, 18), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.9 }), 0, 0.77, 0, set);
      for (let i = 0; i < 6; i++) P.mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8c068, roughness: 0.7 }), Math.cos(i) * 0.07, 0.82, Math.sin(i) * 0.07, set);
      for (const x of [-0.22, 0.22]) P.mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), x, 0.78, 0.12, set);
      void basket;
    } else if (girl === 'camila') {
      // Café, caderno e calculadora (Economia na federal)
      P.mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 14), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4 }), -0.15, 0.785, 0.1, set);
      const book = P.mesh(P.rbox(0.26, 0.03, 0.2, 0.005), new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.8 }), 0.1, 0.755, 0, set);
      book.rotation.y = -0.3;
      P.mesh(P.rbox(0.08, 0.015, 0.12, 0.005), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5 }), 0.25, 0.765, 0.12, set);
    } else if (girl === 'larissa') {
      // Velas, chá e dois tapetinhos de yoga no chão
      for (const [x, z] of [[-0.12, 0.05], [0.12, -0.05]]) {
        P.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0xf6f0e0, roughness: 0.6 }), x, 0.78, z, set);
        P.mesh(new THREE.SphereGeometry(0.012, 8, 6), P.M.emissive(0xffb060, 3), x, 0.835, z, set);
      }
      P.mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 14), new THREE.MeshStandardMaterial({ color: 0x9ad8b8, roughness: 0.4 }), 0.2, 0.775, 0.12, set);
      for (const [x, c] of [[-1.1, 0x9ad8b8], [1.1, 0xd8c8e8]]) P.mesh(P.rbox(0.6, 0.01, 1.6, 0.004), new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }), x, 0.006, 0.9, set);
    } else if (girl === 'isabela') {
      // Ring light num tripé e o celular virado pra baixo (sem filtro hoje)
      const stand = new THREE.Group();
      P.mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 8), P.M.metal(0.4, 0x222222), 0, 0.8, 0, stand);
      P.mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 32), P.M.emissive(0xfff4e0, 2.2), 0, 1.65, 0, stand);
      stand.position.set(1.2, 0, -0.6);
      set.add(stand);
      P.mesh(P.rbox(0.07, 0.008, 0.14, 0.004), new THREE.MeshStandardMaterial({ color: 0xff7ab8, roughness: 0.3 }), 0.12, 0.75, 0.05, set);
      P.mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 14), new THREE.MeshPhysicalMaterial({ color: 0xff7ab8, roughness: 0.2, clearcoat: 1 }), -0.15, 0.79, 0, set);
    } else if (girl === 'yasmin') {
      // Jantar à luz de velas: castiçal, duas taças de suco de uva e um processo debaixo do braço
      P.mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 10), P.M.gold(), 0, 0.84, 0, set);
      P.mesh(new THREE.SphereGeometry(0.014, 8, 6), P.M.emissive(0xffb060, 3), 0, 0.955, 0, set);
      for (const x of [-0.18, 0.18]) {
        P.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.8, transparent: true }), x, 0.78, 0.12, set);
        P.mesh(new THREE.CylinderGeometry(0.035, 0.015, 0.07, 14), new THREE.MeshStandardMaterial({ color: 0x6a1030, roughness: 0.2 }), x, 0.86, 0.12, set);
      }
      P.mesh(P.rbox(0.24, 0.04, 0.32, 0.005), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9 }), 0.3, 0.76, -0.1, set);
    } else {
      for (const x of [-0.15, 0.15]) P.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 14), new THREE.MeshPhysicalMaterial({ color: x > 0 ? 0xff4f7b : 0x4fd1ff, roughness: 0.3, clearcoat: 0.6 }), x, 0.85, 0, set);
      const cone = P.trafficCone();
      cone.position.set(1.0, 0, 0.4);
      set.add(cone);
    }
    const [dx, dz] = this.g.gymDef.dateSpot?.center ?? [-0.2, 6.15];
    set.position.set(dx, 0, dz);
    this.g.scene.add(set);
    this.dateSet = set;
  }

  async runDate(goal) {
    const g = this.g;
    const s = this.s;
    const st = s.story;
    const girl = goal.girl;
    const gf = STR.girlfriends[girl];
    const actor = await this._girl(girl);
    this._enterScene();
    this._dateSet(girl);
    actor.rig.object3D.visible = true;
    const ds = g.gymDef.dateSpot ?? { center: [-0.2, 6.15], cam: [-0.2, 1.7, 3.6] };
    const [cx, cz] = ds.center;
    actor.place(cx + 0.85, cz, -Math.PI / 2);
    g.luisao.pos.set(cx - 0.85, 0, cz);
    this._faceEachOther(g.luisao, actor);
    this.speakers = { [gf.name]: actor, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    // Câmera abre largo, depois plano/contraplano
    g.camRig.setShot(new THREE.Vector3(...ds.cam), new THREE.Vector3(cx, 1.3, cz), 2);
    g.audio.hit();
    await wait(1200);
    await g.dialogue.play([{ who: gf.name, text: gf.greeting }], { keepOpen: true });
    // Rodadas de escolha (a dica do Matheus marca a melhor)
    // Fofoca Premium (Método): nv1 avisa o que evitar, nv2 +1 ponto, nv3 marca a melhor
    const tip = g.mods.tipLevel ?? 0;
    let score = tip >= 2 ? 1 : 0;
    const easier = st.dateFails;
    for (const round of gf.rounds) {
      let opts = round.options.map((o, i) => ({ ...o, i }));
      // A cada derrota, uma opção ruim some
      for (let k = 0; k < easier && opts.length > 2; k++) {
        const worst = opts.reduce((a, b) => (b.score < a.score ? b : a));
        opts = opts.filter((o) => o !== worst);
      }
      opts = shuffle(opts);
      const best = Math.max(...opts.map((o) => o.score));
      const worstScore = Math.min(...opts.map((o) => o.score));
      const idx = await g.dialogue.choose(gf.name, round.prompt, opts.map((o) => ({ text: o.text, tip: tip >= 3 && o.score === best, avoid: tip >= 1 && o.score === worstScore && worstScore < best })), {
        reveal: (i) => opts[i].score === best,
      });
      const pickd = opts[idx];
      score += pickd.score;
      if (pickd.score === best) {
        g.audio.hit();
        g.particles.sparkle(actor.rig.headWorld, 16, 0xff8fd0, 1.2);
      } else {
        g.audio.miss();
      }
    }
    const D = BALANCE.date;
    if (score < D.bronze) {
      await g.dialogue.play([{ who: gf.name, text: gf.lose }]);
      st.dateFails++;
      this.retryAt = s.playTime + D.retrySec;
      actor.rig.object3D.visible = false;
      this._exitScene();
      g.modal.show({ title: STR.dates.fail, html: `<p>${t('dates.failSub', { s: D.retrySec })}</p>`, buttons: [{ text: STR.common.ok }] });
      return;
    }
    const medal = score >= D.ouro ? 'ouro' : score >= D.prata ? 'prata' : 'bronze';
    actor.rig.setState('celebrate');
    g.luisao.rig.setState('celebrate');
    g.particles.confettiBurst(new THREE.Vector3(cx, 2.4, cz), 140);
    g.audio.fanfare();
    await g.dialogue.play([{ who: gf.name, text: gf.win }]);
    // Resultado
    st.datesDone[girl] = medal;
    st.currentGirl = girl;
    st.dateFails = 0;
    s.totals.dates++;
    if (!s.lembrancas.includes(girl)) s.lembrancas.push(girl);
    const medalEmoji = { ouro: '🥇', prata: '🥈', bronze: '🥉' }[medal];
    await g.modal.ask({
      title: STR.dates.success,
      html: `<div class="medal">${medalEmoji}</div><div class="medal-name ${medal}">${STR.dates['result' + medal[0].toUpperCase() + medal.slice(1)]}</div>
        <p style="font-size:18px;color:#ffd0de">${t('dates.newRelationship', { name: gf.name })}</p>
        <p>💝 ${t('dates.lembranca', { text: gf.lembranca })}</p>`,
      buttons: [{ text: STR.dates.continueBtn }],
    });
    actor.rig.object3D.visible = false;
    if (this.dateSet) {
      g.scene.remove(this.dateSet);
      this.dateSet = null;
    }
    await this._completeLevel();
  }

  async _completeLevel() {
    const g = this.g;
    const s = this.s;
    const st = s.story;
    const done = st.level;
    st.levelTimes[done] = Math.round(s.playTime - st.levelStartedAt);
    await this._photo(done);
    st.level++;
    st.matheusTalked = false;
    st.levelStartedAt = s.playTime;
    s.flags.quaseLa = {};
    s.flags.frangoWarned = false;
    g._applyBodyStage();
    g.luisao.locked = false;
    this._exitScene();
    g.hud.banner(t('dates.levelComplete', { n: done }), t('dates.bodyStage', { stage: STR.bodyStages[Math.min(9, st.level - 1)] }), 'pink');
    g.particles.confettiBurst(g.luisao.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 100);
    g.save();
    // Fim dos níveis da garagem → prova
    const exam = EXAMS[st.gym];
    if (exam && done >= exam.afterLevel) {
      st.phase = 'exam';
      await wait(2400);
      await g.modal.ask({
        title: examTitle(st.gym),
        html: `<p>${t('matheus.examNotReady', { n: exam.muscle })}</p><p>${exam.extra === 'armwrestle' ? STR.hud.beatBrayan : STR.hud.examIronSub}!</p>`,
        buttons: [{ text: STR.dates.teaserBtn }],
      });
    } else {
      await wait(2400);
      await this.maybeTeaser();
    }
  }

  async _photo(level) {
    // FOTO DE PROGRESSO: pose fixa, câmera fixa, flash.
    const g = this.g;
    const L = g.luisao;
    L.pos.set(0, 0, 0.6);
    L.yaw = 0;
    L._sync();
    L.rig.setShirtless(true);
    L.rig.setState('flex');
    g.renderer.setDOF(false);
    g.hud.setLetterbox(false);
    g.camRig.setShot(new THREE.Vector3(0, 1.35, 3.35), new THREE.Vector3(0, 1.15, 0.6), 30);
    await wait(900);
    let dataUrl = null;
    try {
      dataUrl = g.renderer.capture(300, 380);
    } catch (err) {
      console.warn('[Foto] falhou', err);
    }
    const flash = el('div', 'photo-flash');
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
    g.audio.hit();
    if (dataUrl) {
      this.s.photos = this.s.photos.filter((p) => p.level !== level);
      this.s.photos.push({ level, dataUrl });
      await g.modal.ask({
        title: STR.dates.photo,
        html: `<div class="polaroid"><img src="${dataUrl}" alt=""><span>${STR.hud.level} ${level} • ${STR.bodyStages[level - 1]}</span></div>`,
        buttons: [{ text: STR.dates.continueBtn }],
      });
    }
    L.rig.setShirtless(false);
    L.rig.setState('idle');
  }

  // ── Prova da garagem: queda de braço com o Brayan ───────────────
  async _matheusExamTalk() {
    const g = this.g;
    const mat = g.npcs.matheus;
    this._enterScene();
    this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: g.luisao };
    this.listener = g.luisao;
    this._faceEachOther(g.luisao, mat);
    await g.dialogue.play(STR.matheus.pepTalkExam.map((text) => ({ who: STR.npcs.matheus, text })));
    this.s.story.matheusTalked = true;
    this._exitScene();
    g.hud.banner(STR.hud.goExam, examTitle(this.s.story.gym), 'pink');
  }

  async runExam() {
    const g = this.g;
    const s = this.s;
    const exam = EXAMS[s.story.gym];
    const status = Prog.requirementStatus(s);
    // Checklist de "chefão"
    const arm = exam?.extra === 'armwrestle';
    await g.modal.ask({
      title: examTitle(s.story.gym),
      html: `<div class="checklist">${status.items.map((i) => `<div class="ok">✔ ${i.label}: ${i.cur}${i.pctUnit ? '%' : ''}</div>`).join('')}<div class="ok">✔ ${STR.hud.talkMatheus}</div>${arm ? `<div>🥊 ${STR.hud.beatBrayan}</div>` : ''}</div>`,
      buttons: [{ text: STR.hud.goExam }],
    });
    if (arm) return this._armWrestle();
    // Iron Temple: a prova é o shape completo (o rival chega numa atualização futura)
    g.audio.fanfare();
    g.particles.confettiBurst(g.luisao.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 160);
    await this._gymComplete();
  }

  async _ensureBrayan() {
    if (this.brayan) return this.brayan;
    const rig = await createRig('brayan', this.g.loader, this.g.clips);
    const a = new Actor(rig, { name: 'brayan' });
    a.scripted = true;
    a.locked = true;
    this.g.scene.add(rig.object3D);
    this.brayan = a;
    this.g.npcs.brayan = a;
    return a;
  }

  async _armWrestle() {
    const g = this.g;
    const s = this.s;
    const br = await this._ensureBrayan();
    const L = g.luisao;
    this._enterScene();
    // Barril de óleo como mesa, no meio da garagem
    const [tx, tz] = g.gymDef.armwrestleTable;
    if (!this.drum) {
      const drum = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a5aa0, metalness: 0.7, roughness: 0.45 });
      P.mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24), mat, 0, 0.44, 0, drum);
      for (const y of [0.2, 0.66]) P.mesh(new THREE.TorusGeometry(0.295, 0.012, 6, 28), mat, 0, y, 0, drum).rotation.x = Math.PI / 2;
      this.drum = drum;
    }
    this.drum.position.set(tx, 0, tz);
    g.scene.add(this.drum);
    br.rig.object3D.visible = true;
    br.place(tx, tz + 0.62, Math.PI);
    L.pos.set(tx, 0, tz - 0.62);
    L.yaw = 0;
    L._sync();
    // Plateia
    const crowd = [
      [g.npcs.matheus, -1.3, 0.2],
      [g.npcs.seuze, 1.4, -0.2],
      [g.npcs.vizinha, -1.1, 1.3],
      [g.npcs.vizinho, 1.2, 1.2],
    ];
    for (const [a, dx, dz] of crowd) {
      a.scripted = true;
      a.place(tx + dx, tz + dz, a.yawTo(tx, tz));
      a.yaw = Math.atan2(tx - a.pos.x, tz - a.pos.z);
      a.idleState = 'talk';
      a.rig.setState('talk');
    }
    // Falas do Brayan
    this.speakers = { [STR.npcs.brayan]: br, [STR.npcs.luisao]: L };
    this.listener = L;
    if (!s.story.armFails) await g.dialogue.play(STR.armwrestle.brayanIntro.map((text) => ({ who: STR.npcs.brayan, text })));
    g.dialogue.close();
    g.hud.toast(`📣 ${STR.armwrestle.crowd}`, 'gold');
    // Minigame
    const won = await this._armMinigame(br);
    for (const [a] of crowd) a.idleState = won ? 'celebrate' : 'idle';
    L.rig.setState(won ? 'celebrate' : 'idle');
    br.rig.setState('idle');
    if (won) {
      g.audio.fanfare();
      g.particles.confettiBurst(new THREE.Vector3(tx, 2.4, tz), 200);
      g.camRig.addShake(0.5);
      await wait(1200);
      this.speakers = { [STR.npcs.brayan]: br, [STR.npcs.luisao]: L };
      await g.dialogue.play([{ who: STR.npcs.brayan, text: STR.armwrestle.brayanLose }]);
    } else {
      s.story.armFails++;
      g.audio.miss();
      await wait(800);
    }
    // Restaura plateia
    for (const [a] of crowd) {
      a.scripted = false;
      a.idleState = a.name === 'seuze' ? 'sit' : a.name === 'matheus' ? 'idle' : 'talk';
      const home = a.home ?? (a.name === 'vizinha' ? { x: g.gymDef.npcs.neighborA.pos[0], z: g.gymDef.npcs.neighborA.pos[1], yaw: g.gymDef.npcs.neighborA.yaw } : { x: g.gymDef.npcs.neighborB.pos[0], z: g.gymDef.npcs.neighborB.pos[1], yaw: g.gymDef.npcs.neighborB.yaw });
      a.place(home.x, home.z, home.yaw);
    }
    br.rig.object3D.visible = false;
    g.scene.remove(this.drum);
    this._exitScene();
    if (!won) {
      g.modal.show({ title: STR.armwrestle.lose, html: `<p>${STR.armwrestle.loseSub}</p>`, buttons: [{ text: STR.dates.retry }] });
      return;
    }
    await this._gymComplete();
  }

  /** Academia concluída: marca a prova, mostra o cartão e convida pra próxima. */
  async _gymComplete() {
    const g = this.g;
    const s = this.s;
    const gym = s.story.gym;
    s.story.examsPassed[gym] = true;
    s.story.phase = 'gymDone';
    s.story.levelTimes['exame_' + gym] = Math.round(s.playTime - s.story.levelStartedAt);
    g.save();
    g.audio.gymUnlock();
    const next = EXAMS[gym]?.next;
    this._titleCard(gymCompleteTitle(gym), next ? STR.gyms[next].name : '');
    await wait(3600);
    await this.offerTravel(true);
  }

  /** Convite pra próxima academia (se ela já existe no jogo; senão, "em breve"). */
  async offerTravel(fromExam = false) {
    const g = this.g;
    const gym = this.s.story.gym;
    const next = EXAMS[gym]?.next;
    if (this.s.story.phase !== 'gymDone' || !next || g.modal.open) return;
    const G = STR.gyms[next];
    if (!GYMS[next]) {
      await g.modal.ask({
        title: `🏆 ${gymCompleteTitle(gym)}`,
        html: `<p style="font-size:18px">${G.name} — ${G.subtitle}</p><p>${next === 'olympus' ? STR.gyms.soonOlympus : STR.gyms.soon}</p>`,
        buttons: [{ text: STR.common.ok }],
      });
      return;
    }
    const go = await g.modal.ask({
      title: fromExam ? `🏆 ${gymCompleteTitle(gym)}` : STR.travel.title,
      html: `<p style="font-size:18px"><b>${G.name}</b> — ${G.subtitle}</p><p>${t('travel.body', { gym: G.name, sub: G.subtitle.toLocaleLowerCase('pt-BR') })}</p>`,
      buttons: [{ text: STR.travel.later, cls: 'sec' }, { text: t('travel.go', { gym: G.name }) }],
    });
    if (go === 1) g.travelTo(next); // ask() devolve o índice do botão
    else g.hud.toast(t('travel.reminder', { gym: G.name }), 'gold', 5000);
  }

  /** Primeira vez numa academia nova: tour de câmera, dona da casa e o Matheus. */
  async arrival() {
    const g = this.g;
    const s = this.s;
    const st = s.story;
    const gym = st.gym;
    const H = this.host();
    this._enterScene({ dof: false });
    g.audio.gymUnlock();
    this._titleCard(t('travel.arrived', { gym: STR.gyms[gym].name }), STR.gyms[gym].subtitle);
    await new Promise((r) => g.camRig.playPath(g.gymDef.flythrough, 2.3, r));
    g.mode = 'dialogue';
    const L = g.luisao;
    const host = g.npcs.seuze;
    if (H.welcome) {
      L.pos.set(host.pos.x, 0, host.pos.z - 1.2);
      this._faceEachOther(L, host);
      this.speakers = { [H.name]: host, [STR.npcs.luisao]: L };
      this.listener = L;
      await g.dialogue.play(H.welcome.map((text) => ({ who: H.name, text })));
    }
    const mat = g.npcs.matheus;
    const lines = STR.matheus[gym + 'Arrival'];
    if (lines) {
      L.pos.set(mat.pos.x + 1.2, 0, mat.pos.z - 0.3);
      this._faceEachOther(L, mat);
      this.speakers = { [STR.npcs.matheus]: mat, [STR.npcs.luisao]: L };
      this.listener = L;
      await g.dialogue.play(lines.map((text) => ({ who: STR.npcs.matheus, text })));
    }
    st.arrived = { ...(st.arrived ?? {}), [gym]: true };
    st.levelStartedAt = s.playTime;
    this._exitScene();
    g.save();
    await this.maybeTeaser();
  }

  host() {
    return hostStr(this.g.gymDef.host);
  }

  _armMinigame(br) {
    const g = this.g;
    const s = this.s;
    const A = BALANCE.armwrestle;
    const L = g.luisao;
    return new Promise((resolve) => {
      g.mode = 'minigame';
      g.dialogue.close();
      L.rig.setState('armwrestle');
      br.rig.setState('armwrestle');
      const [tx, tz] = g.gymDef.armwrestleTable;
      g.camRig.setShot(new THREE.Vector3(tx + 1.25, 1.35, tz + 0.1), new THREE.Vector3(tx, 1.05, tz), 3);
      g.renderer.setDOF(true, 1.3);
      const box = el('div');
      box.id = 'minigame';
      box.innerHTML = `
        <div class="glass mg-box">
          <div class="mg-title">${STR.armwrestle.title}</div>
          <div class="mg-sub">${STR.armwrestle.vs} • ${STR.armwrestle.instructions}</div>
          <div class="tug"><div class="fill"></div><div class="knob"></div></div>
          <div class="tug-labels"><span style="color:var(--gold)">LUISÃO</span><span style="color:var(--blue)">BRAYAN</span></div>
          <button class="mash-btn">💪 ${STR.hud.doRep}</button>
        </div>`;
      g.uiRoot.appendChild(box);
      const fill = box.querySelector('.fill');
      const knob = box.querySelector('.knob');
      let p = 0.5;
      let running = false;
      let tt = 0;
      const weaker = Math.max(0.35, 1 - s.story.armFails * A.easierPerFail);
      // Força do Luisão ajuda (cada músculo acima do mínimo conta)
      const strength = 1 + (Prog.forca(s) / 200) * 0.6;
      const render = () => {
        L.rig.setPhase(p);
        br.rig.setPhase(1 - p);
        fill.style.width = `${p * 100}%`;
        knob.style.left = `${p * 100}%`;
      };
      const finish = (won) => {
        running = false;
        window.removeEventListener('keydown', key);
        this.minigameTap = null;
        g.hud.banner(won ? STR.armwrestle.win : STR.armwrestle.lose, '', won ? 'green' : 'pink');
        setTimeout(() => {
          box.remove();
          g.mode = 'dialogue';
          resolve(won);
        }, 1300);
      };
      const push = () => {
        if (!running) return;
        p = Math.min(1, p + A.playerPerClick * strength);
        g.audio.rep('thump');
        g.camRig.addShake(0.08);
        g.particles.sweat(L.rig.headWorld, 2);
        // A vitória é checada aqui: no tick o Brayan empurra antes da checagem e p nunca ficaria em 1.
        if (p >= 1) {
          render();
          finish(true);
        }
      };
      this.minigameTap = push;
      const btn = box.querySelector('.mash-btn');
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        push();
      });
      const key = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (!e.repeat) push();
        }
      };
      window.addEventListener('keydown', key);
      // Contagem
      const counts = [...STR.armwrestle.countdown, STR.armwrestle.go];
      let ci = 0;
      const showCount = () => {
        const c = el('div', 'mg-count', counts[ci]);
        g.uiRoot.appendChild(c);
        setTimeout(() => c.remove(), 850);
        g.audio[ci === counts.length - 1 ? 'hit' : 'ui']();
        ci++;
        if (ci < counts.length) setTimeout(showCount, 800);
        else running = true;
      };
      showCount();
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        const fdt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (running) {
          tt += fdt;
          p = Math.max(0, p - A.brayanPush * weaker * (1 + A.brayanPushGrowth * tt) * fdt);
          render();
          if (p <= 0) {
            finish(false);
            return;
          }
        } else if (ci >= counts.length) {
          return; // já acabou (vitória no clique)
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  // ── Painel da namorada ──────────────────────────────────────────
  girlPanelData() {
    const s = this.s;
    const st = s.story;
    if (st.currentGirl && !st.breakupsDone[st.currentGirl]) {
      const gf = STR.girlfriends[st.currentGirl];
      if (!this.girlLine || this.girlLineT <= 0) {
        this.girlLine = pick(gf.lines ?? [gf.greeting]);
        this.girlLineT = 30;
      }
      const photo = s.photos.find((p) => p.level === st.level - 1)?.dataUrl;
      void photo;
      return { mode: 'current', name: gf.name, line: `"${this.girlLine}"`, meter: Prog.requirementStatus(s).progress };
    }
    const goal = Prog.currentGoal(s);
    if (goal.type === 'date') return { mode: 'teaser', name: '???', line: STR.girlfriends[goal.girl].teaser };
    return { mode: 'single', name: STR.npcs.luisao, line: goal.type === 'exam' ? examTitle(st.gym) : st.gym === 'iron' ? STR.gyms.soonOlympus : STR.gyms.soon };
  }

  // ── Atualização: dicas, "quase lá", frango ───────────────────────
  update(dt) {
    const g = this.g;
    const s = this.s;
    const st = s.story;
    this.girlLineT -= dt;
    if (g.mode === 'title' || !st.introSeen) return;
    this._hintT = (this._hintT ?? 0) - dt;
    if (this._hintT > 0) return;
    this._hintT = 1;
    const status = Prog.requirementStatus(s);
    this._systemBeats(status);
    if (status.goal.type === 'done') return;
    // QUASE LÁ!
    if (!status.allMet && status.worst && status.progress >= BALANCE.quaseLaThreshold && !s.flags.quaseLa[st.level + st.phase]) {
      s.flags.quaseLa[st.level + st.phase] = true;
      const w = status.worst;
      const n = w.req - w.cur;
      const vars = { n, lvl: n === 1 ? STR.hud.nivelSing : STR.hud.nivelPlur, muscle: w.label, name: status.goal.type === 'date' ? STR.girlfriends[status.goal.girl].name : '' };
      g.hud.toast(`🔥 ${t(status.goal.type === 'date' ? 'hud.quaseLaDate' : 'hud.quaseLaExam', vars)}`, 'pink', 4200);
      g.audio.hit();
    }
    // Pronto pra falar com o Matheus
    if (status.allMet && !st.matheusTalked && !this._readyNotified) {
      this._readyNotified = true;
      g.hud.toast(`❗ ${STR.matheus.readyBark}`, 'pink', 4200);
      g.audio.nickname();
    }
    if (!status.allMet) this._readyNotified = false;
    // Travado? O Matheus aparece com uma dica.
    const target = (status.goal.type === 'exam' ? BALANCE.examTargetMin[st.gym] : BALANCE.levelTargetMin[st.level - 1]) * 60;
    const inLevel = s.playTime - st.levelStartedAt;
    if (!status.allMet && inLevel > target * BALANCE.stuckFactor && s.playTime >= s.cooldowns.stuckHint) {
      s.cooldowns.stuckHint = s.playTime + BALANCE.stuckHintEverySec;
      this._stuckBang = true;
      g.hud.toast(`${STR.npcs.matheus}: "${this._stuckText()}"`, 'pink', 5000);
    }
    // Frango de perna fina
    if (Prog.isFrango(s) && !s.flags.frangoWarned) {
      s.flags.frangoWarned = true;
      g.hud.toast(`🐔 ${this.host().frangoWarn}`, 'gold', 5200);
    }
  }

  /** Momentos dos sistemas novos: anúncio do WaifuFit, chegada do Cleiton, saves antigos. */
  _systemBeats(status) {
    const g = this.g;
    const s = this.s;
    const st = s.story;
    const free = ['play', 'work'].includes(g.mode) && !g.modal.open && !g.metodoUI.isOpen;
    // Saves de antes do sistema: se a Marlene já foi embora, o notebook já é seu (só guardado).
    if (st.breakupsDone.marlene && !s.flags.notebookGift && s.metodo.introSeen) s.flags.notebookGift = true;
    g.syncWorkStations();
    // Anúncio do WaifuFit no meio das corridas (ou depois de um tempinho com o Método)
    if (free && !s.flags.waifuAd && s.metodo.introSeen && st.level >= 2) {
      const ride = g.jobs.job('uber');
      const byWork = g.mode === 'work' && g.jobs.active === 'uber' && ride.rides >= 3;
      const byTime = g.mode === 'play' && s.totalDinheiro >= 400;
      if (byWork || byTime) {
        s.flags.waifuAd = true;
        s.companions.available.aiko = true;
        g.audio.kira();
        g.modal.show({
          title: STR.team.ad.title,
          html: `${STR.team.ad.html}<div class="team-offer">${g.companions.portraitHtml('aiko', 'big')}</div><p>${STR.team.ad.body}</p>`,
          buttons: [
            { text: STR.team.ad.no, cls: 'sec' },
            { text: STR.team.ad.try, onClick: () => g.companions.startTrial('aiko') },
          ],
        });
      }
    }
    // Cleiton (primo da Jéssica) aparece no meio do nível 3
    if (free && !s.flags.cleitonArrived && (st.level > 3 || (st.level === 3 && status.progress >= 0.35))) g.companions.cleitonArrives();
  }

  debugSkip() {
    const s = this.s;
    const goal = Prog.currentGoal(s);
    if (goal.type === 'date') {
      s.story.datesDone[goal.girl] = 'ouro';
      s.story.currentGirl = goal.girl;
      if (!s.lembrancas.includes(goal.girl)) s.lembrancas.push(goal.girl);
      if (this.g.mode === 'train') this.g.stopTraining();
      this._completeLevel();
    } else if (goal.type === 'exam') {
      s.story.phase = 'gymDone';
      s.story.examsPassed[s.story.gym] = true;
    }
  }
}

export { GYMS, fmt, passiveGps, upper };
