import { STR, t, muscleName, upper } from '../i18n/pt-BR.js';
import { fmt, fmtMoney } from '../core/format.js';
import { el } from '../core/utils.js';

// HUD principal. Só mexe no DOM quando algo muda (barato a 60 FPS).

export class HUD {
  constructor(root, cb) {
    this.root = root;
    this.cb = cb;
    this._cache = {};
    this._build();
  }

  _build() {
    const r = this.root;
    r.insertAdjacentHTML(
      'beforeend',
      `
      <div id="letterbox" class="passthrough"></div>
      <div id="prompts"></div>
      <div id="hud-top">
        <div class="glass chip ganhos"><span class="label">💪 ${STR.hud.ganhos}</span><span class="value" data-k="ganhos">0</span><span class="sub" data-k="gps">0${STR.hud.perSec}</span></div>
        <div class="glass chip dinheiro hidden" data-k="moneyChip"><span class="label">💵 ${STR.hud.dinheiro}</span><span class="value" data-k="dinheiro">R$ 0</span><span class="sub" data-k="mps"></span></div>
        <div class="glass chip rank"><span class="label">${STR.hud.rank}</span><span class="value" data-k="rank">1</span><div class="bar"><i data-k="xpbar"></i></div></div>
        <div class="glass chip level"><span class="label">${STR.hud.level}</span><span class="value" data-k="level">1</span><span class="stage" data-k="stage"></span></div>
        <div class="glass goal" data-k="goal">
          <div class="row"><span class="title" data-k="goalTitle"></span><span class="pct" data-k="goalPct">0%</span></div>
          <div class="bigbar"><i data-k="goalBar"></i></div>
        </div>
        <div class="glass chip simetria"><span class="label">${STR.hud.simetria}</span>
          <div class="sym-meter"><div class="sym-ring" data-k="symRing"><span data-k="sym">100</span></div><span class="value" data-k="symTxt" style="font-size:15px"></span></div>
        </div>
        <div id="hud-buttons">
          <button class="glass icon-btn" data-k="mute" title="${STR.hud.mute}">🔊</button>
          <button class="glass icon-btn" data-k="menuBtn" title="${STR.hud.menu}">☰<span class="badge hidden" data-k="menuBadge"></span></button>
        </div>
      </div>
      <div id="left-col">
        <div id="req" class="glass"></div>
        <div id="split" class="glass"></div>
        <div id="mission" class="glass hidden"></div>
        <div id="buffs" class="glass"></div>
      </div>
      <div id="girl" class="glass"></div>
      <div id="minimap" class="glass"><canvas width="380" height="340"></canvas></div>
      <div id="rep" class="glass hidden-anim">
        <div class="top"><span class="mname" data-k="mname"></span><span class="mlvl" data-k="mlvl"></span></div>
        <div class="bars">
          <span data-k="mmuscle"></span><div class="b prog"><i data-k="mprog"></i></div>
          <span>${STR.hud.fatigue}</span><div class="b fat"><i data-k="mfat"></i></div>
        </div>
        <div class="tags" data-k="mtags"></div>
        <div class="row">
          <button id="rep-btn">${STR.hud.doRep}<small>${STR.hud.holdHint}</small></button>
          <button class="furia hidden" data-k="furia">🔥 ${STR.hud.furia}<small data-k="furiaTxt">${STR.hud.furiaHint}</small></button>
          <button class="leave" data-k="leave">${STR.hud.leave}<br><small>Esc</small></button>
        </div>
      </div>
      <div id="team" class="passthrough" data-k="team"></div>
      <button id="water" class="glass hidden" data-k="water">💧<small>${STR.team.water}</small></button>
      <button id="guided" class="glass hidden" data-k="guided"></button>
      <div id="toasts" class="passthrough"></div>
      <div id="banner" class="passthrough"></div>
      `,
    );
    this.k = {};
    for (const e of r.querySelectorAll('[data-k]')) this.k[e.dataset.k] = e;
    this.req = r.querySelector('#req');
    this.split = r.querySelector('#split');
    this.buffs = r.querySelector('#buffs');
    this.mission = r.querySelector('#mission');
    this.girl = r.querySelector('#girl');
    this.rep = r.querySelector('#rep');
    this.repBtn = r.querySelector('#rep-btn');
    this.toasts = r.querySelector('#toasts');
    this.banners = r.querySelector('#banner');
    this.prompts = r.querySelector('#prompts');
    this.letterbox = r.querySelector('#letterbox');
    this.minimapCanvas = r.querySelector('#minimap canvas');

    this.k.mute.onclick = () => this.cb.onMute?.();
    this.k.menuBtn.onclick = () => this.cb.onMenu?.();
    this.k.goal.onclick = () => this.cb.onGoalClick?.();
    this.k.leave.onclick = () => this.cb.onLeave?.();
    this.k.furia.onclick = (e) => {
      e.stopPropagation();
      this.cb.onFuria?.();
    };
    this.k.water.onpointerdown = (e) => {
      e.stopPropagation();
      this.cb.onWater?.();
    };
    this.k.guided.onpointerdown = (e) => {
      e.stopPropagation();
      this.cb.onGuided?.();
    };

    // Botão de rep: toque = 1 rep; segurar = auto-reps mais lentas.
    const down = (e) => {
      e.preventDefault();
      this.repBtn.classList.add('press');
      this._ripple(e);
      this.cb.onRepDown?.();
    };
    const up = () => {
      this.repBtn.classList.remove('press');
      this.cb.onRepUp?.();
    };
    this.repBtn.addEventListener('pointerdown', down);
    this.repBtn.addEventListener('pointerup', up);
    this.repBtn.addEventListener('pointerleave', up);
    this.repBtn.addEventListener('pointercancel', up);
    this.req.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (li) return this.cb.onReqItem?.(li.dataset.id);
      if (e.target.closest('.go-btn')) return this.cb.onGo?.();
      if (e.target.closest('h3')) this.req.classList.toggle('collapsed');
    });
  }

  _ripple(e) {
    const b = this.repBtn.getBoundingClientRect();
    const s = el('span', 'ripple');
    const size = Math.max(b.width, b.height) * 0.5;
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${(e.clientX ?? b.left + b.width / 2) - b.left - size / 2}px`;
    s.style.top = `${(e.clientY ?? b.top + b.height / 2) - b.top - size / 2}px`;
    this.repBtn.appendChild(s);
    setTimeout(() => s.remove(), 520);
  }

  pressFx() {
    this.repBtn.classList.add('press');
    clearTimeout(this._pt);
    this._pt = setTimeout(() => this.repBtn.classList.remove('press'), 70);
  }

  _set(key, value, prop = 'textContent') {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    this.k[key][prop] = value;
  }

  /** Atualiza a barra de topo. */
  top(d) {
    this._set('ganhos', fmt(d.ganhos));
    this._set('gps', `${fmt(d.gps)}${STR.hud.perSec}`);
    this._set('rank', `${d.rank + 1}`);
    if (this._cache.xp !== Math.round(d.xpPct * 100)) {
      this._cache.xp = Math.round(d.xpPct * 100);
      this.k.xpbar.style.width = `${this._cache.xp}%`;
    }
    this._set('level', `${d.level}`);
    this._set('stage', d.stage);
    this._set('goalTitle', d.goalTitle);
    const pct = Math.floor(d.goalPct * 100);
    this._set('goalPct', `${pct}%`);
    if (this._cache.goalBar !== pct) {
      this._cache.goalBar = pct;
      this.k.goalBar.style.width = `${pct}%`;
    }
    this.k.goal.classList.toggle('ready', !!d.ready);
    const sym = Math.round(d.sym * 100);
    if (this._cache.sym !== sym) {
      this._cache.sym = sym;
      this.k.sym.textContent = sym;
      this.k.symRing.style.setProperty('--p', sym);
      this.k.symRing.style.setProperty('--c', sym >= 80 ? 'var(--green)' : sym >= 60 ? 'var(--orange)' : 'var(--red)');
    }
    this.k.menuBadge.classList.toggle('hidden', !d.affordable);
    this.k.moneyChip.classList.toggle('hidden', !d.showMoney);
    if (d.showMoney) {
      this._set('dinheiro', fmtMoney(d.dinheiro));
      this._set('mps', d.mps > 0 ? `+${fmtMoney(d.mps * 60)}/min` : '');
    }
  }

  /** Retratos da Equipe ativa (canto inferior direito). */
  team(list) {
    const key = list.map((b) => `${b.id}|${b.info}`).join(';');
    if (key === this._cache.team) return;
    this._cache.team = key;
    this.k.team.innerHTML = list.map((b) => `<div class="tbadge ${b.slot}">${b.html}<span class="tn">${b.name}</span>${b.info ? `<span class="ti">${b.info}</span>` : ''}</div>`).join('');
  }

  water(show) {
    this.k.water.classList.toggle('hidden', !show);
  }

  guided(chip) {
    const key = chip ? `${chip.name}|${chip.muscle}` : '';
    if (key === this._cache.guided) return;
    this._cache.guided = key;
    this.k.guided.classList.toggle('hidden', !chip);
    if (chip) this.k.guided.innerHTML = `📣 ${t('hud.guidedChip', { name: chip.name, muscle: chip.muscle })} <b>➜</b>`;
  }

  /** Botão da FÚRIA: null = não comprada; {ready, active, left}. */
  furia(f) {
    this.k.furia.classList.toggle('hidden', !f);
    if (!f) return;
    this.k.furia.classList.toggle('ready', f.ready);
    this.k.furia.classList.toggle('active', f.active);
    this._set('furiaTxt', f.active ? `${f.left}s` : f.ready ? STR.hud.furiaHint : `${f.left}s`);
  }

  setMuted(m) {
    this.k.mute.textContent = m ? '🔇' : '🔊';
  }

  /** Painel de requisitos (só redesenha se mudou). */
  requirements(status, ctx) {
    const key = JSON.stringify([status.items.map((i) => [i.id, i.cur, i.met, Math.round(i.pct * 50)]), ctx.matheus, ctx.ready, ctx.who, ctx.weak, ctx.extraDone]);
    if (key === this._cache.req) return;
    this._cache.req = key;
    const items = status.items
      .map((i) => {
        const close = !i.met && i.pct >= 0.75;
        const v = i.met ? '✔' : i.pctUnit ? `${i.cur}%/${i.req}%` : `${i.cur}/${i.req}`;
        return `<li data-id="${i.id}" class="${i.met ? 'met' : ''} ${close ? 'close' : ''} ${ctx.weak === i.id ? 'weak' : ''}">
          <span class="ic">${i.met ? '✔' : ctx.weak === i.id ? '⚠' : '•'}</span><span>${i.label}</span><span class="v">${v}</span>
          <div class="mini"><i style="width:${Math.round(i.pct * 100)}%"></i></div></li>`;
      })
      .join('');
    const extra = ctx.extra ? `<li class="${ctx.extraDone ? 'met' : ''}"><span class="ic">${ctx.extraDone ? '✔' : '🥊'}</span><span>${ctx.extra}</span><span class="v">${ctx.extraDone ? '✔' : ''}</span></li>` : '';
    const mat = `<li class="matheus ${ctx.matheus ? 'met' : ''}" data-id="matheus"><span class="ic">${ctx.matheus ? '✔' : '💬'}</span><span>${STR.hud.talkMatheus}</span><span class="v">${ctx.matheus ? '✔' : '!'}</span></li>`;
    this.req.innerHTML = `
      <h3><span>${STR.hud.requirements}</span><span>▾</span></h3>
      <div class="who">${ctx.who}</div>
      <ul>${items}${extra}${mat}</ul>
      ${ctx.ready ? `<button class="go-btn">${ctx.goText}</button>` : ''}`;
  }

  splitCard(pair, a, b, need, active, remain) {
    const key = `${pair.letter}|${a}|${b}|${active}|${Math.ceil(remain)}`;
    if (key === this._cache.split) return;
    this._cache.split = key;
    this.split.classList.toggle('active', active);
    const pa = Math.min(1, a / need);
    const pb = Math.min(1, b / need);
    this.split.innerHTML = `
      <div class="t">${STR.hud.split} — Treino ${pair.letter}</div>
      <div class="pair">${muscleName(pair.a)} + ${muscleName(pair.b)}</div>
      <div class="prog">
        <div><small>${muscleName(pair.a)} ${Math.min(a, need)}/${need}</small><div class="b"><i style="width:${pa * 100}%"></i></div></div>
        <div><small>${muscleName(pair.b)} ${Math.min(b, need)}/${need}</small><div class="b"><i style="width:${pb * 100}%"></i></div></div>
      </div>
      ${active ? `<div style="margin-top:4px;color:var(--blue);font-weight:800">${STR.hud.splitBonus} • ${Math.ceil(remain)}s</div>` : ''}`;
  }

  buffList(list) {
    const key = list.map((b) => `${b.text}${b.cls}`).join('|');
    if (key === this._cache.buffs) return;
    this._cache.buffs = key;
    this.buffs.innerHTML = list.map((b) => `<span class="buff ${b.cls ?? ''}">${b.text}</span>`).join('');
  }

  missionCard(m) {
    if (!m) {
      this.mission.classList.add('hidden');
      this._cache.mission = null;
      return;
    }
    const key = `${m.muscle}|${m.done}|${m.total}`;
    if (key === this._cache.mission) return;
    this._cache.mission = key;
    this.mission.classList.remove('hidden');
    this.mission.innerHTML = `<div class="t">🍧 ${STR.hud.mission}</div>
      <div>${t('hud.missionProgress', { muscle: muscleName(m.muscle), n: Math.min(m.done, m.total), total: m.total })}</div>
      <div class="b"><i style="width:${Math.min(100, (m.done / m.total) * 100)}%"></i></div>`;
  }

  girlPanel(g) {
    const key = JSON.stringify([g.mode, g.name, g.line, !!g.photo, g.meter]);
    if (key === this._cache.girl) return;
    this._cache.girl = key;
    const title = g.mode === 'current' ? STR.hud.currentGirl : g.mode === 'teaser' ? STR.hud.nextGirl : STR.hud.single;
    this.girl.innerHTML = `
      <div class="t">${title}</div>
      <div class="portrait">${g.photo ? `<img src="${g.photo}" alt="">` : '<div class="sil"></div>'}</div>
      <div class="name">${g.name ?? '???'}</div>
      <div class="line">${g.line ?? ''}</div>
      ${g.meter != null ? `<div class="meter"><i style="width:${Math.round(g.meter * 100)}%"></i></div>` : ''}`;
  }

  showRep(on) {
    this.rep.classList.toggle('hidden-anim', !on);
  }

  repInfo(d) {
    this._set('mname', d.name);
    this._set('mlvl', d.capped ? `${STR.hud.capShort} ${d.level}/${d.cap}` : `${STR.hud.level_short} ${d.level}/${d.cap}`);
    this._set('mmuscle', d.muscle);
    const p = Math.round(d.prog * 100);
    if (this._cache.mprog !== p) {
      this._cache.mprog = p;
      this.k.mprog.style.width = `${p}%`;
    }
    const f = Math.round(d.fatigue * 100);
    if (this._cache.mfat !== f) {
      this._cache.mfat = f;
      this.k.mfat.style.width = `${f}%`;
    }
    const tags = [];
    if (d.pump) tags.push(`<span class="tag pump">${STR.hud.pump} x${String(d.pumpMult ?? 2).replace('.', ',')}</span>`);
    if (d.weak) tags.push(`<span class="tag weak">${STR.hud.weakPoint}</span>`);
    if (d.capped) tags.push(`<span class="tag cap">${STR.hud.capShort}</span>`);
    if (d.furia) tags.push(`<span class="tag weak">🔥 ${STR.hud.furiaOn}</span>`);
    if (d.combo > 1.01) tags.push(`<span class="tag cap">${t('hud.combo', { n: d.combo.toFixed(1).replace('.', ',') })}</span>`);
    if (d.guided) tags.push(`<span class="tag split">📣 ${STR.hud.guided}</span>`);
    if (d.descanso) tags.push(`<span class="tag pump">${STR.hud.descanso}</span>`);
    if (d.pr) tags.push(`<span class="tag pr">${t('hud.prLabel', { n: d.pr })}</span>`);
    if (d.setReps) tags.push(`<span class="tag pr">${t('hud.set', { n: d.setReps })}</span>`);
    this._set('mtags', tags.join(''), 'innerHTML');
    this.repBtn.classList.toggle('pump', !!d.pump);
    this.repBtn.classList.toggle('capped', !!d.capped);
  }

  toast(text, cls = '', ms = 2600) {
    const e = el('div', `toast ${cls}`, text);
    this.toasts.appendChild(e);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => {
      e.classList.add('out');
      setTimeout(() => e.remove(), 420);
    }, ms);
  }

  banner(text, sub = '', cls = '') {
    this.banners.innerHTML = '';
    const e = el('div', `banner ${cls}`, `${text}${sub ? `<small>${sub}</small>` : ''}`);
    this.banners.appendChild(e);
    clearTimeout(this._bt);
    this._bt = setTimeout(() => e.remove(), 2300);
  }

  setLetterbox(on) {
    this.letterbox.classList.toggle('on', on);
  }

  /** Esconde/mostra o HUD de jogo (diálogos, espelho, cutscenes). */
  setGameplayVisible(v) {
    for (const id of ['hud-top', 'left-col', 'girl', 'minimap', 'team']) this.root.querySelector('#' + id).style.opacity = v ? '' : '0';
    for (const id of ['hud-top', 'left-col', 'girl', 'minimap']) this.root.querySelector('#' + id).style.pointerEvents = v ? '' : 'none';
    if (!v) {
      this.water(false);
      this.guided(null);
    }
    this.prompts.style.display = v ? '' : 'none';
  }
}

/** Prompts flutuantes ancorados em posições 3D (projetadas na tela). */
export class WorldPrompts {
  constructor(container) {
    this.c = container;
    this.nodes = new Map();
  }

  /** list: [{key, html, cls, x, y, onClick}] — chamado todo frame. */
  render(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.key);
      let n = this.nodes.get(p.key);
      if (!n) {
        n = el('div', p.cls ?? 'wprompt');
        n.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          n._onClick?.();
        });
        this.c.appendChild(n);
        this.nodes.set(p.key, n);
      }
      if (n._html !== p.html) {
        n.innerHTML = p.html;
        n._html = p.html;
      }
      if (n._cls !== p.cls) {
        n.className = p.cls ?? 'wprompt';
        n._cls = p.cls;
      }
      n._onClick = p.onClick;
      n.style.left = `${p.x}px`;
      n.style.top = `${p.y}px`;
      n.style.display = p.hidden ? 'none' : '';
    }
    for (const [k, n] of this.nodes) {
      if (!seen.has(k)) {
        n.remove();
        this.nodes.delete(k);
      }
    }
  }
}

export { upper };
