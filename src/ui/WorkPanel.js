import { STR, t } from '../i18n/pt-BR.js';
import { fmtMoney } from '../core/format.js';
import { el } from '../core/utils.js';
import { JOB_BY_ID } from '../config/jobs.js';
import { STATS } from '../config/balance.js';

// ════════════════════════════════════════════════════════════════
//  Painel da estação de trabalho (embaixo, no lugar do botão de rep):
//  emprego + cargo, XP até a promoção, Cansaço Mental, tags (CAFEZINHO,
//  CHUVA, bugs...), a mini-cena do emprego e o botão TRABALHAR.
// ════════════════════════════════════════════════════════════════

export class WorkPanel {
  constructor(root, game) {
    this.game = game;
    this.node = el('div', 'glass hidden-anim');
    this.node.id = 'work';
    this.node.innerHTML = `
      <div class="wtabs" data-k="tabs"></div>
      <div class="top"><span class="mname" data-k="name"></span><span class="mlvl" data-k="cargo"></span></div>
      <div class="bars">
        <span>${STR.jobs.common.xp}</span><div class="b prog"><i data-k="xp"></i></div>
        <span>${STR.hud.mind}</span><div class="b fat"><i data-k="mind"></i></div>
      </div>
      <div class="tags" data-k="tags"></div>
      <div class="scene" data-k="scene"></div>
      <div class="row">
        <button id="work-btn">${STR.hud.doWork}<small>${STR.hud.workHint}</small></button>
        <button class="leave" data-k="leave">${STR.jobs.common.leave}<br><small>Esc</small></button>
      </div>`;
    root.appendChild(this.node);
    this.k = {};
    for (const e of this.node.querySelectorAll('[data-k]')) this.k[e.dataset.k] = e;
    this.btn = this.node.querySelector('#work-btn');
    this._cache = {};
    const down = (e) => {
      e.preventDefault();
      this.btn.classList.add('press');
      game.workPress();
    };
    const up = () => {
      this.btn.classList.remove('press');
      game.workRelease();
    };
    this.btn.addEventListener('pointerdown', down);
    this.btn.addEventListener('pointerup', up);
    this.btn.addEventListener('pointerleave', up);
    this.btn.addEventListener('pointercancel', up);
    this.k.leave.onclick = () => game.stopWork();
    this.k.scene.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      e.stopPropagation();
      game.workAction(b.dataset.act, b.dataset.arg);
    });
    this.k.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-job]');
      if (b) game.switchWorkJob(b.dataset.job);
    });
  }

  show(on) {
    this.node.classList.toggle('hidden-anim', !on);
    this._cache = {};
  }

  pressFx() {
    this.btn.classList.add('press');
    clearTimeout(this._pt);
    this._pt = setTimeout(() => this.btn.classList.remove('press'), 70);
  }

  _set(k, v, prop = 'innerHTML') {
    if (this._cache[k] === v) return;
    this._cache[k] = v;
    this.k[k][prop] = v;
  }

  update() {
    const g = this.game;
    const jobs = g.jobs;
    const id = jobs.active;
    if (!id) return;
    const s = g.state;
    const js = jobs.job(id);
    const S = STR.jobs[id];
    const cap = jobs.cargoCap();
    this._set('name', `${JOB_BY_ID[id].icon} ${S.name}${jobs.isMain(id) ? ` <span class="tag pump">${STR.jobs.common.main}</span>` : ''}`);
    this._set('cargo', `${S.cargos[js.cargo - 1]} • ${t('jobs.common.cargo', { n: js.cargo, max: cap })}`, 'textContent');
    const xp = Math.round(Math.min(1, js.xp / jobs.xpNeed(js.cargo)) * 100);
    if (this._cache.xpw !== xp) {
      this._cache.xpw = xp;
      this.k.xp.style.width = `${xp}%`;
    }
    const mind = Math.round(s.jobs.mind.fatigue * 100);
    if (this._cache.mindw !== mind) {
      this._cache.mindw = mind;
      this.k.mind.style.width = `${mind}%`;
    }
    const tabs = jobs.unlockedList();
    this._set('tabs', tabs.length > 1 ? tabs.map((j) => `<button class="${j === id ? 'on' : ''}" data-job="${j}">${JOB_BY_ID[j].icon} ${STR.jobs[j].name}</button>`).join('') : '');
    const tags = [];
    if (s.jobs.mind.cafezinho > 0) tags.push(`<span class="tag pump">☕ CAFEZINHO x2</span>`);
    if (jobs.mindYield() < 0.99) tags.push(`<span class="tag weak">🧠 ${Math.round(jobs.mindYield() * 100)}%</span>`);
    for (const tg of jobs.tags(id)) tags.push(`<span class="tag ${tg.cls === 'red' ? 'weak' : tg.cls === 'blue' ? 'split' : 'cap'}">${tg.text}</span>`);
    tags.push(`<span class="tag pr">${t('jobs.common.perTask', { n: fmtMoney(jobs.perTask(id)) })}</span>`);
    if (STATS.includes(JOB_BY_ID[id].stat)) tags.push(`<span class="tag pump">${STR.jobs.common.trains} ${STR.muscles[JOB_BY_ID[id].stat]}</span>`);
    this._set('tags', tags.join(''));
    const v = jobs.view(id);
    if (this._cache.sceneKey !== v.key) {
      this._cache.sceneKey = v.key;
      this.k.scene.innerHTML = v.html;
    }
    this.btn.classList.toggle('pump', s.jobs.mind.cafezinho > 0);
  }
}
