import { STR, t, muscleName } from '../i18n/pt-BR.js';
import { fmt, fmtMoney, fmtTime, fmtInt } from '../core/format.js';
import { el } from '../core/utils.js';
import { availableGenerators, generatorCost, currentMachines, upgradeCost, upgradeMax } from '../systems/Economy.js';
import { BALANCE, gymOf } from '../config/balance.js';
import { NODES } from '../config/metodo.js';
import { JOBS, JOB_BY_ID } from '../config/jobs.js';
import { COMPANIONS, PAIRS, DEVICES } from '../config/companions.js';
import * as MT from '../systems/Metodo.js';
import * as CR from '../systems/CompanionRules.js';
import { treeSVG, nodeDetail } from './MetodoScreen.js';
import { tapsNeeded, tipChance } from '../systems/jobs/uber.js';

// Menu lateral: Geradores | Máquinas | Método | Trabalho | Equipe | Perks | Espelho | Álbum | Conquistas | Configurações

const TABS = ['geradores', 'maquinas', 'metodo', 'trabalho', 'equipe', 'perks', 'espelho', 'album', 'conquistas', 'config'];
const GYM_NAMES = () => [STR.gyms.garagem.name, STR.gyms.iron.name, STR.gyms.olympus.name];

export class Menu {
  constructor(root, game) {
    this.game = game;
    this.node = el('div', 'glass');
    this.node.id = 'menu';
    this.node.innerHTML = `
      <div class="head"><h2>${STR.game.title}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="tabs">${TABS.map((k) => `<button class="tab" data-tab="${k}">${STR.menu.tabs[k]}<span class="badge hidden"></span></button>`).join('')}</div>
      <div class="body"></div>`;
    root.appendChild(this.node);
    this.body = this.node.querySelector('.body');
    this.tab = 'geradores';
    this.isOpen = false;
    this.metodoSel = null;
    this.node.querySelector('[data-close]').onclick = () => this.close();
    this.node.querySelector('.tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      game.audio.ui();
      if (b.dataset.tab === 'espelho') {
        this.close();
        game.openMirror();
        return;
      }
      this.show(b.dataset.tab);
    };
    this.body.addEventListener('click', (e) => this._onClick(e));
    this.body.addEventListener('input', (e) => this._onInput(e));
  }

  open(tab = this.tab) {
    this.isOpen = true;
    this.node.classList.add('open');
    this.show(tab);
  }

  close() {
    this.isOpen = false;
    this.node.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  show(tab) {
    this.tab = tab;
    for (const b of this.node.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
    this._lastKey = null;
    this.refresh(true);
  }

  /** Bolinhas nas abas com algo comprável. */
  _badges() {
    const g = this.game;
    const s = g.state;
    const flags = {
      metodo: MT.anyAffordable(s),
      trabalho: g.jobs.anyAffordable(),
      equipe: COMPANIONS.some((c) => (g.companions.isAvailable(c.id) && !s.companions.owned[c.id] && s.dinheiro >= CR.hireCost(c.id)) || CR.levelStatus(s, c.id).ok),
    };
    for (const b of this.node.querySelectorAll('.tab')) b.querySelector('.badge').classList.toggle('hidden', !flags[b.dataset.tab]);
  }

  /** Redesenha a aba atual (chamado ~4x/s enquanto aberto). */
  refresh(force = false) {
    if (!this.isOpen) return;
    const g = this.game;
    const s = g.state;
    this._badges();
    let key;
    // A chave só muda quando algo VISÍVEL muda (o que dá pra comprar), não a cada Ganho.
    if (this.tab === 'geradores') {
      key = JSON.stringify([s.generators, availableGenerators(s).map((d) => s.ganhos >= generatorCost(s, d)), g.mods.genCost, Math.round(g.mods.ganhos * 100)]);
    } else if (this.tab === 'maquinas') {
      key = JSON.stringify(currentMachines(s).map((m) => [s.machines[m.id].upgrade, s.ganhos >= upgradeCost(m.id, s.machines[m.id].upgrade), s.muscles[m.muscle].level]));
    } else if (this.tab === 'metodo') {
      key = JSON.stringify([s.metodo, NODES.map((n) => MT.status(s, n.id).ok), this.metodoSel]);
    } else if (this.tab === 'trabalho') {
      const j = g.jobs;
      key = JSON.stringify([s.jobs.main, Math.ceil(Math.max(0, s.jobs.switchReadyAt - s.playTime) / 5), j.unlockedList().map((id) => [j.job(id).cargo, Math.floor((j.job(id).xp / j.xpNeed(j.job(id).cargo)) * 20), j.job(id).upgrades, JOB_BY_ID[id].upgrades.map((k) => j.upgradeStatus(id, k).ok)]), Math.round(j.totalPassive() * 6)]);
    } else if (this.tab === 'equipe') {
      const c = s.companions;
      key = JSON.stringify([c.owned, c.equipped, c.available, c.trial?.id, c.device, c.talk, c.pairsFound, Math.ceil(Math.max(0, c.switchReadyAt - s.playTime) / 5), COMPANIONS.map((x) => [g.companions.isAvailable(x.id), s.dinheiro >= CR.hireCost(x.id), CR.levelStatus(s, x.id).ok])]);
    } else if (this.tab === 'config') {
      const st = g.settings;
      key = JSON.stringify([st.quality, st.shake, st.showFps, st.muted, g.renderer.qualityName]);
    } else {
      key = this.tab + s.photos.length + (this.tab === 'conquistas' ? Math.floor(s.playTime / 5) : '');
    }
    if (!force && key === this._lastKey) return;
    this._lastKey = key;
    const scroll = this.body.scrollTop;
    this.body.innerHTML = this[`_${this.tab}`]?.() ?? '';
    this.body.scrollTop = scroll;
  }

  _geradores() {
    const s = this.game.state;
    const rows = availableGenerators(s).map((d) => {
      const owned = s.generators[d.id] ?? 0;
      const cost = generatorCost(s, d);
      const can = s.ganhos >= cost;
      const gps = d.gps * this.game.mods.ganhos * this.game.mods.passive;
      return `<div class="card" data-gen="${d.id}">
        <span class="n">${STR.generators[d.id].name}</span>
        <div class="act"><span class="owned">${owned}</span><button class="buy" data-buy-gen="${d.id}" ${can ? '' : 'disabled'}>💪 ${fmt(cost)}</button></div>
        <span class="d">${STR.generators[d.id].desc}</span>
        <span class="s">+${fmt(gps)}${STR.hud.perSec} • ${t('hud.genTrain', { n: fmt(d.train * 60, 1) })}</span>
      </div>`;
    });
    return `<p class="intro">${STR.menu.geradoresIntro}</p>${rows.join('')}`;
  }

  _maquinas() {
    const s = this.game.state;
    const rows = currentMachines(s).map((m) => {
      const lv = s.machines[m.id].upgrade;
      const max = upgradeMax(m.id);
      const cost = upgradeCost(m.id, lv);
      const can = s.ganhos >= cost && lv < max;
      const mus = s.muscles[m.muscle];
      const cap = gymOf(m.gym).cap;
      const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const pw = 1 + lv * BALANCE.upgrades.ganhosPerLevel;
      return `<div class="card">
        <span class="n">${STR.machines[m.id].name}</span>
        <div class="act">
          ${lv >= max ? `<button class="buy" disabled>${STR.hud.maxed}</button>` : `<button class="buy" data-buy-up="${m.id}" ${can ? '' : 'disabled'}>💪 ${fmt(cost)}</button>`}
          <button class="buy ghost" data-go="${m.id}">${STR.hud.go} ➜</button>
        </div>
        <span class="d">${muscleName(m.muscle)} ${mus.level}/${cap} • ${STR.hud.power} x${pw.toFixed(1).replace('.', ',')}</span>
        <div class="lvl-pips">${pips}</div>
      </div>`;
    });
    return `<p class="intro">${STR.menu.maquinasIntro}</p>${rows.join('')}`;
  }

  // ── Método Neumman (só visualização; compra com o Matheus) ───────
  _metodo() {
    const s = this.game.state;
    if (!s.metodo.introSeen) return `<div class="wip"><div class="big">🌌</div>${STR.menu.metodoLocked}</div>`;
    return `<p class="intro">${STR.menu.metodoIntro}</p>
      <div class="menu-tree">${treeSVG(s, this.metodoSel)}</div>
      ${nodeDetail(s, this.metodoSel, 'view')}
      <div class="set-row"><span>💵 ${fmtMoney(s.dinheiro)}</span><button class="buy" data-go-matheus>${STR.metodo.buyWithMatheus}</button></div>`;
  }

  // ── Trabalho ─────────────────────────────────────────────────────
  _trabalho() {
    const g = this.game;
    const s = g.state;
    const j = g.jobs;
    const C = STR.jobs.common;
    if (!j.anyUnlocked()) return `<div class="wip"><div class="big">💼</div>${STR.menu.trabalhoLocked}</div>`;
    const cap = j.cargoCap();
    const rows = JOBS.map((def) => {
      const S = STR.jobs[def.id];
      if (!j.isUnlocked(def.id)) {
        const where = def.phase > 1 ? (def.unlock === 'level6' ? t('jobs.common.lockedLevel', { gym: STR.gyms[def.gym].name, n: 6 }) : t('jobs.common.locked', { gym: STR.gyms[def.gym].name })) : STR.team.lockedEvent;
        return `<div class="card locked"><span class="n">${def.icon} ${def.phase > 1 ? S.name : '???'}</span><span class="d">${where}</span></div>`;
      }
      const js = j.job(def.id);
      const main = j.isMain(def.id);
      const wait = Math.max(0, Math.ceil(s.jobs.switchReadyAt - s.playTime));
      const xp = Math.min(1, js.xp / j.xpNeed(js.cargo));
      const pas = j.passiveRate(def.id) * 60;
      let syn = '';
      if (def.id === 'uber') {
        const ctx = j.ctx('uber');
        syn = t('jobs.uber.synergy', { n: s.muscles.resistencia.level, p: Math.round((1 - tapsNeeded(ctx) / BALANCE.jobs.uber.tapsBase) * 100), c: s.muscles.carisma.level, t: Math.round(tipChance(ctx) * 100) });
      } else if (def.id === 'vibecoder') {
        syn = t('jobs.vibecoder.synergy', { c: s.muscles.carisma.level, t: Math.round(Math.min(0.5, s.muscles.carisma.level * BALANCE.jobs.vibecoder.carismaClientChance) * 100) });
      }
      const ups = def.upgrades.map((key) => {
        const U = S.upgrades[key];
        const lv = j.upgradeLevel(def.id, key);
        const d = j.upgradeDef(def.id, key);
        const st = j.upgradeStatus(def.id, key);
        const pips = Array.from({ length: d.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        let btn;
        if (st.reason === 'max') btn = `<button class="buy small" disabled>${STR.hud.maxed}</button>`;
        else if (st.reason === 'cargo') btn = `<button class="buy small" disabled title="${C.upgradeCargo}">🔒 ${C.upgradeCargo}</button>`;
        else btn = `<button class="buy small" data-job-up="${def.id}:${key}" ${st.ok ? '' : 'disabled'}>${fmtMoney(j.upgradeCost(def.id, key))}</button>`;
        return `<div class="up"><div><b>${U.name}</b><small>${U.desc}</small><div class="lvl-pips">${pips}</div></div>${btn}</div>`;
      });
      return `<div class="card job ${main ? 'main' : ''}">
        <span class="n">${def.icon} ${S.name} ${main ? `<span class="tag pump">${C.main}</span>` : ''}</span>
        <div class="act">
          <button class="buy ghost" data-go-work="${def.id}">${C.goWork}</button>
          ${main ? '' : `<button class="buy ghost" data-job-main="${def.id}" ${wait > 0 && s.jobs.main ? 'disabled' : ''}>${wait > 0 && s.jobs.main ? t('jobs.common.mainWait', { s: wait }) : C.setMain}</button>`}
        </div>
        <span class="d">${S.cargos[js.cargo - 1]} • ${t('jobs.common.cargo', { n: js.cargo, max: cap })}</span>
        <div class="jxp"><i style="width:${Math.round(xp * 100)}%"></i></div>
        <span class="s">${t('jobs.common.perTask', { n: fmtMoney(j.perTask(def.id)) })} • ${pas > 0 ? t('jobs.common.passive', { n: fmtMoney(pas) }) : t('jobs.common.passiveLocked', { n: BALANCE.work.passive.fromCargo })}</span>
        <span class="d syn">✨ ${syn}</span>
        <span class="d">${t('jobs.common.stats', { tasks: fmtInt(js.tasks), earned: fmtMoney(js.earned) })}</span>
        <div class="ups"><div class="h4">${C.upgrades}</div>${ups.join('')}</div>
      </div>`;
    });
    return `<p class="intro">${STR.menu.trabalhoIntro}</p>${rows.join('')}`;
  }

  // ── Equipe ───────────────────────────────────────────────────────
  _member(def) {
    const g = this.game;
    const s = g.state;
    const T = STR.team;
    const M = T.members[def.id];
    const c = s.companions;
    const o = c.owned[def.id];
    const avail = g.companions.isAvailable(def.id);
    if (!o && !avail) {
      const where = !CR.tierOpen(s, def.id) ? t('team.locked', { gym: GYM_NAMES()[def.tier] }) : def.unlock === 'brayanFriend' ? T.lockedStory : T.lockedEvent;
      return `<div class="card member locked"><span class="cport sil">?</span><div class="mi"><span class="n">???</span><span class="d">${where}</span></div></div>`;
    }
    const equippedNow = CR.equipped(s, def.slot) === def.id;
    const trial = CR.isTrial(s, def.id);
    const lv = o ? o.level : 0;
    const bond = o ? CR.bondLevel(o.bond) : 0;
    const bondP = o ? CR.bondProgress(o.bond) : 0;
    const prim = CR.primaryValue(s, def.id);
    const primTxt = def.slot === 'personal' ? t('team.primaryPersonal', { v: Math.round(prim * 100) }) : t('team.primaryWaifu', { v: Math.round(prim * 100) });
    const btns = [];
    if (!o) {
      if (!c.trialsUsed[def.id] && !trial) btns.push(`<button class="buy ghost" data-team-trial="${def.id}">${T.trial}</button>`);
      btns.push(`<button class="buy" data-team-hire="${def.id}" ${s.dinheiro >= CR.hireCost(def.id) ? '' : 'disabled'}>${def.slot === 'waifu' ? T.install : T.hire} • ${fmtMoney(CR.hireCost(def.id))}</button>`);
    } else {
      const ls = CR.levelStatus(s, def.id);
      if (ls.reason === 'max') btns.push(`<button class="buy" disabled>${STR.hud.maxed}</button>`);
      else if (ls.reason === 'tier') btns.push(`<button class="buy" disabled>🔒 ${t('team.locked', { gym: GYM_NAMES()[Math.min(2, MT.currentTier(s) + 1)] })}</button>`);
      else btns.push(`<button class="buy" data-team-level="${def.id}" ${ls.ok ? '' : 'disabled'}>${T.levelUp} • ${fmtMoney(CR.levelCost(s, def.id))}</button>`);
      const wait = Math.max(0, Math.ceil(c.switchReadyAt - s.playTime));
      if (equippedNow) btns.push(`<button class="buy ghost" data-team-unequip="${def.slot}">${T.unequip}</button>`);
      else btns.push(`<button class="buy ghost" data-team-equip="${def.id}" ${wait > 0 && c.equipped[def.slot] ? 'disabled' : ''}>${wait > 0 && c.equipped[def.slot] ? t('team.switchWait', { s: wait }) : T.equip}</button>`);
    }
    const pips = Array.from({ length: BALANCE.companions.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="card member ${equippedNow ? 'eq' : ''}">
      ${g.companions.portraitHtml(def.id)}
      <div class="mi">
        <span class="n">${M.name} <small>${M.role}</small> ${equippedNow ? `<span class="tag pump">${trial ? '⏱' : '✔'}</span>` : ''}</span>
        <span class="d">${M.desc}</span>
        <span class="s">${primTxt} • ${M.trait}: ${M.traitDesc}</span>
        ${o ? `<div class="lvl-pips">${pips}</div><div class="bond"><span>${def.slot === 'personal' ? T.bondPersonal : T.bondWaifu} ${bond}/5</span><div class="b"><i style="width:${Math.round(bondP * 100)}%"></i></div></div>` : ''}
      </div>
      <div class="act">${btns.join('')}</div>
    </div>`;
  }

  _equipe() {
    const g = this.game;
    const s = g.state;
    const T = STR.team;
    const c = s.companions;
    const per = COMPANIONS.filter((x) => x.slot === 'personal').map((x) => this._member(x));
    const wai = COMPANIONS.filter((x) => x.slot === 'waifu').map((x) => this._member(x));
    const hasWaifu = COMPANIONS.some((x) => x.slot === 'waifu' && c.owned[x.id]);
    const devs = DEVICES.map((d, i) => {
      const owned = c.device >= i;
      const can = g.companions.canBuyDevice(i);
      const D = T.devices[i];
      return `<div class="up ${owned ? 'owned' : ''}"><div><b>${D.name}</b><small>${D.desc}</small></div>${owned ? `<span class="tag pump">✔</span>` : can ? `<button class="buy small" data-device="${i}" ${s.dinheiro >= g.companions.deviceCost(i) ? '' : 'disabled'}>${fmtMoney(g.companions.deviceCost(i))}</button>` : `<span class="tag pr">🔒 ${t('team.locked', { gym: GYM_NAMES()[i] })}</span>`}</div>`;
    });
    const pairs = PAIRS.filter((p) => c.pairsFound[p.id]).map((p) => `<span class="buff">💞 ${T.pairs[p.id].name}</span>`);
    const talk = ['muitas', 'poucas', 'nenhuma'].map((k) => `<button data-talk="${k}" class="${c.talk === k ? 'on' : ''}">${T.talk[k]}</button>`).join('');
    return `<p class="intro">${STR.menu.equipeIntro}</p>
      <div class="h4">📣 ${T.personal}</div>${per.join('')}
      <div class="h4">🌸 ${T.waifu}</div><p class="intro">${T.waifuNote}</p>${wai.join('')}
      ${hasWaifu ? `<div class="h4">📱 ${T.device}</div><div class="ups">${devs.join('')}</div>` : ''}
      <div class="h4">💞 ${T.chemistryList}</div><div class="pairs">${pairs.length ? pairs.join('') : `<span class="intro">${T.noPairs}</span>`}</div>
      <div class="set-row"><span>${T.talkSetting}</span><div class="seg">${talk}</div></div>`;
  }

  _perks() {
    return `<div class="wip"><div class="big">🃏</div>${STR.menu.perksWip}</div>`;
  }

  _album() {
    const s = this.game.state;
    const photos = s.photos.length
      ? `<div class="photos">${s.photos.map((p) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${STR.hud.level} ${p.level} • ${STR.bodyStages[p.level - 1] ?? ''}</figcaption></figure>`).join('')}</div>`
      : `<p class="intro">${STR.menu.noPhotos}</p>`;
    return `<div class="wip" style="padding:10px"><div class="big">📸</div>${STR.menu.albumWip}</div><div class="h4">${STR.menu.photos}</div>${photos}`;
  }

  _conquistas() {
    const s = this.game.state;
    return `<div class="wip"><div class="big">🏆</div>${STR.menu.conquistasWip}</div>
      <div class="h4">${STR.menu.stats}</div>
      <div class="statgrid">
        <span>${STR.menu.totalReps}</span><b>${fmtInt(s.totals.reps)}</b>
        <span>${STR.menu.totalCrits}</span><b>${fmtInt(s.totals.crits)}</b>
        <span>${STR.menu.totalGanhos}</span><b>${fmt(s.totalGanhos)}</b>
        <span>${STR.menu.totalDinheiro}</span><b>${fmtMoney(s.totalDinheiro)}</b>
        <span>${STR.menu.totalTasks}</span><b>${fmtInt(s.totals.tasks)}</b>
        <span>${STR.menu.promotions}</span><b>${fmtInt(s.totals.promotions)}</b>
        <span>${STR.menu.goldens}</span><b>${fmtInt(s.totals.goldens)}</b>
        <span>${STR.menu.playTime}</span><b>${fmtTime(s.playTime)}</b>
      </div>`;
  }

  _config() {
    const g = this.game;
    const st = g.settings;
    const q = st.quality;
    const qBtns = ['auto', 'baixo', 'medio', 'alto', 'ultra'].map((k) => `<button data-quality="${k}" class="${q === k ? 'on' : ''}">${STR.settings.quality[k]}</button>`).join('');
    const slider = (k) => `<div class="set-row"><span>${STR.settings[k]}</span><input type="range" min="0" max="1" step="0.01" value="${st[k]}" data-vol="${k}"></div>`;
    const toggle = (k, label) => `<div class="set-row"><span>${label}</span><button class="toggle ${st[k] ? 'on' : ''}" data-toggle="${k}"></button></div>`;
    return `
      <div class="h4">${STR.settings.graphics}</div>
      <div class="set-row"><div class="seg">${qBtns}</div><small style="color:var(--muted)">${q === 'auto' ? STR.settings.quality[g.renderer.qualityName] : ''}</small></div>
      ${toggle('shake', STR.settings.shake)}
      ${toggle('showFps', STR.settings.showFps)}
      <div class="h4">${STR.settings.audio}</div>
      ${toggle('muted', STR.settings.muteAll)}
      ${slider('master')}${slider('sfx')}${slider('music')}${slider('ambient')}
      <div class="h4">${STR.settings.save}</div>
      <div class="set-row"><button class="buy" data-act="save">${STR.settings.saveNow}</button><button class="buy ghost" data-act="export">${STR.settings.export}</button><button class="buy ghost" data-act="import">${STR.settings.import}</button></div>
      <div data-slot="io"></div>
      <div class="set-row"><span></span><button class="buy danger" data-act="reset">${STR.settings.reset}</button></div>
      ${st.devMenu ? `<div class="h4">🛠 ${STR.debug.devTitle}</div><div class="set-row"><span>${STR.debug.devHint}</span><button class="buy" data-act="debug">${STR.debug.open}</button></div>` : ''}
      <div class="set-row ver"><button class="ver-btn" data-act="ver">SHAPE & CORAÇÃO • v0.1.0</button></div>`;
  }

  _onClick(e) {
    const g = this.game;
    const nodeEl = e.target.closest('[data-node]');
    if (nodeEl) {
      this.metodoSel = nodeEl.dataset.node;
      g.audio.ui();
      this.refresh(true);
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.buyGen) {
      if (g.buyGenerator(d.buyGen)) {
        b.closest('.card')?.classList.add('pop');
        this.refresh(true);
      }
    } else if (d.buyUp) {
      if (g.buyUpgrade(d.buyUp)) this.refresh(true);
    } else if (d.go) {
      this.close();
      g.goToMachine(d.go);
    } else if (d.goMatheus !== undefined) {
      this.close();
      g.goToNpc('matheus');
    } else if (d.goWork) {
      this.close();
      g.goToWork(d.goWork);
    } else if (d.jobMain) {
      g.setMainJob(d.jobMain);
      this.refresh(true);
    } else if (d.jobUp) {
      const [id, key] = d.jobUp.split(':');
      if (g.buyJobUpgrade(id, key)) this.refresh(true);
    } else if (d.teamTrial) {
      g.companions.startTrial(d.teamTrial);
      this.refresh(true);
    } else if (d.teamHire) {
      if (g.companions.hire(d.teamHire)) this.refresh(true);
    } else if (d.teamLevel) {
      if (g.companions.levelUp(d.teamLevel)) this.refresh(true);
    } else if (d.teamEquip) {
      const r = g.companions.equip(d.teamEquip);
      if (r.ok) g.audio.ui();
      this.refresh(true);
    } else if (d.teamUnequip) {
      g.companions.unequip(d.teamUnequip);
      this.refresh(true);
    } else if (d.device) {
      if (g.companions.buyDevice(Number(d.device))) this.refresh(true);
    } else if (d.talk) {
      g.state.companions.talk = d.talk;
      this.refresh(true);
    } else if (d.quality) {
      g.setSetting('quality', d.quality);
      this.refresh(true);
    } else if (d.toggle) {
      const k = d.toggle;
      g.setSetting(k, !g.settings[k]);
      this.refresh(true);
    } else if (d.act === 'ver') {
      // Easter egg: 5 toques seguidos na versão liberam o Modo de teste
      const now = performance.now();
      this._verTaps = now - (this._verAt ?? 0) < 1500 ? (this._verTaps ?? 0) + 1 : 1;
      this._verAt = now;
      if (g.settings.devMenu) return;
      if (this._verTaps >= 5) {
        g.setSetting('devMenu', true);
        g.audio.fanfare();
        g.hud.toast(`🛠 ${STR.debug.unlocked}`, 'gold', 4000);
        this.refresh(true);
      } else if (this._verTaps >= 3) g.hud.toast(STR.debug.tapsLeft.replace('{n}', 5 - this._verTaps), '', 1200);
    } else if (d.act === 'debug') {
      this.close();
      g.debug.toggle(true);
    } else if (d.act === 'save') {
      g.save(true);
    } else if (d.act === 'export') {
      const slot = this.body.querySelector('[data-slot="io"]');
      slot.innerHTML = `<p class="intro">${STR.settings.exportHint}</p><textarea class="save" readonly>${g.exportSave()}</textarea><button class="buy ghost" data-act="copy">${STR.settings.copy}</button>`;
      slot.querySelector('textarea').select();
    } else if (d.act === 'copy') {
      const ta = this.body.querySelector('textarea.save');
      navigator.clipboard?.writeText(ta.value).then(() => (b.textContent = STR.settings.copied));
    } else if (d.act === 'import') {
      const slot = this.body.querySelector('[data-slot="io"]');
      slot.innerHTML = `<textarea class="save" placeholder="${STR.settings.importPlaceholder}"></textarea><button class="buy" data-act="doImport">${STR.settings.import}</button>`;
    } else if (d.act === 'doImport') {
      const ta = this.body.querySelector('textarea.save');
      g.importSave(ta.value);
    } else if (d.act === 'reset') {
      g.confirmReset();
    }
  }

  _onInput(e) {
    const k = e.target.dataset.vol;
    if (k) this.game.setSetting(k, parseFloat(e.target.value), false);
  }
}
