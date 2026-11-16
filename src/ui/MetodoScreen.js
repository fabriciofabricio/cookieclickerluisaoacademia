import { STR, t } from '../i18n/pt-BR.js';
import { fmt, fmtMoney } from '../core/format.js';
import { el } from '../core/utils.js';
import { BALANCE } from '../config/balance.js';
import { BRANCHES, NODES, NODE_BY_ID } from '../config/metodo.js';
import * as MT from '../systems/Metodo.js';

// ════════════════════════════════════════════════════════════════
//  Tela do MÉTODO NEUMMAN: abre quando você fala com o Matheus e ele
//  não tem nada importante da história. Constelação em SVG com 3 ramos
//  (Técnica, Rotina, Lábia), painel da técnica e o Matheus falando.
//  A mesma constelação aparece (só pra ver) na aba "Método" do menu.
// ════════════════════════════════════════════════════════════════

const GYM_NAMES = () => [STR.gyms.garagem.name, STR.gyms.iron.name, STR.gyms.olympus.name];
const VB = 600;
const R = 255;

function nodeXY(node) {
  const a = ((BRANCHES[node.branch].angle + node.pos[0]) * Math.PI) / 180;
  const r = R * node.pos[1];
  return [VB / 2 + Math.cos(a) * r, VB / 2 + Math.sin(a) * r];
}

const pct = (x) => Math.round(x * 100);
const dec = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');

/** Texto do efeito de uma técnica num nível. */
export function fxText(node, L) {
  const F = STR.metodo.fx;
  const v = node.value * L;
  switch (node.effect) {
    case 'critChance':
      return t('metodo.fx.critChance', { v: dec(v * 100) });
    case 'critMult':
      return t('metodo.fx.critMult', { v: dec(v) });
    case 'comboMax':
      return t('metodo.fx.comboMax', { v: dec(1.2 + 0.3 * L) });
    case 'furia':
      return t('metodo.fx.furia', { s: 10 + L, c: 120 - 12 * L });
    case 'pumpReps':
    case 'autoReps':
    case 'offlineCapH':
      return t(`metodo.fx.${node.effect}`, { v: L });
    case 'split':
      return t('metodo.fx.split', { v: 10 * L, s: 10 * L });
    case 'golden':
      return t('metodo.fx.golden', { v: 10 * L, s: 3 * L });
    case 'tipLevel':
      return `${t('metodo.fx.tipLevel', { v: L })} (${STR.metodo.tipLevels[L] ?? ''})`;
    case 'hercules':
    case 'inquebravel':
    case 'magnetismo':
      return F[node.effect];
    default:
      return t(`metodo.fx.${node.effect}`, { v: pct(v) });
  }
}

/** SVG da constelação. */
export function treeSVG(state, selected = null) {
  const lines = [];
  const nodes = [];
  // Linhas do centro até as raízes e entre pré-requisitos
  for (const n of NODES) {
    const [x, y] = nodeXY(n);
    const col = BRANCHES[n.branch].color;
    const parents = n.req.length ? n.req.map((r) => nodeXY(NODE_BY_ID[r])) : [[VB / 2, VB / 2]];
    const lit = MT.level(state, n.id) > 0;
    for (const [px, py] of parents) lines.push(`<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" class="edge ${lit ? 'lit' : ''}" style="--c:${col}"/>`);
  }
  for (const n of NODES) {
    const [x, y] = nodeXY(n);
    const st = MT.status(state, n.id);
    const L = MT.level(state, n.id);
    const col = BRANCHES[n.branch].color;
    const cls = ['node', st.ok ? 'can' : '', st.reason === 'tier' && L === 0 ? 'locked' : '', st.reason === 'max' ? 'max' : '', L > 0 ? 'owned' : '', n.capstone ? 'cap' : '', n.active ? 'act' : '', selected === n.id ? 'sel' : ''].join(' ');
    const r = n.capstone ? 26 : n.active ? 23 : 20;
    const frac = L / n.max;
    const circ = 2 * Math.PI * (r + 5);
    nodes.push(`<g class="${cls}" data-node="${n.id}" transform="translate(${x},${y})" style="--c:${col}">
      <circle class="halo" r="${r + 9}"/>
      <circle class="ring-bg" r="${r + 5}"/>
      <circle class="ring" r="${r + 5}" stroke-dasharray="${circ * frac} ${circ}" transform="rotate(-90)"/>
      <circle class="core" r="${r}"/>
      <text class="lv" y="5">${st.reason === 'tier' && L === 0 ? '🔒' : `${L}`}</text>
    </g>`);
  }
  const labels = Object.entries(BRANCHES).map(([k, b]) => {
    const a = (b.angle * Math.PI) / 180;
    return `<text class="blabel" x="${VB / 2 + Math.cos(a) * 62}" y="${VB / 2 + Math.sin(a) * 62 + 4}" style="fill:${b.color}">${STR.metodo.branches[k]}</text>`;
  });
  return `<svg class="constellation" viewBox="0 0 ${VB} ${VB}">
    <defs><radialGradient id="mcore"><stop offset="0" stop-color="#ff4f7b"/><stop offset="1" stop-color="#2a0a1a"/></radialGradient></defs>
    ${lines.join('')}
    <circle cx="${VB / 2}" cy="${VB / 2}" r="34" fill="url(#mcore)" class="center"/>
    <text x="${VB / 2}" y="${VB / 2 + 7}" class="mn">MN</text>
    ${labels.join('')}
    ${nodes.join('')}
  </svg>`;
}

/** Painel da técnica selecionada. mode: 'buy' (com o Matheus) | 'view' (menu). */
export function nodeDetail(state, id, mode = 'buy') {
  if (!id) return `<div class="ndetail empty">${STR.metodo.pickNode}</div>`;
  const n = NODE_BY_ID[id];
  const S = STR.metodo.nodes[id];
  const L = MT.level(state, id);
  const st = MT.status(state, id);
  const col = BRANCHES[n.branch].color;
  const now = L > 0 ? fxText(n, L) : '—';
  const next = L < n.max ? fxText(n, L + 1) : null;
  let action = '';
  if (st.reason === 'max') action = `<button class="buy" disabled>${STR.metodo.maxed}</button>`;
  else if (st.reason === 'tier') action = `<div class="lock">🔒 ${t('metodo.lockTier', { gym: GYM_NAMES()[st.needTier] ?? '' })}</div>`;
  else if (st.reason === 'req') {
    const req = n.capstone ? STR.metodo.lockCapstone : t('metodo.lockReq', { req: n.req.map((r) => STR.metodo.nodes[r].name).join(' + ') });
    action = `<div class="lock">🔗 ${req}</div>`;
  } else if (mode === 'view') {
    action = `<button class="buy ghost" data-go-matheus>${STR.metodo.buyWithMatheus}</button><div class="cost">${fmtMoney(MT.nextCost(state, id))}</div>`;
  } else {
    const cost = MT.nextCost(state, id);
    action = `<button class="buy pix" data-buy-node="${id}" ${st.ok ? '' : 'disabled'}>💸 ${STR.metodo.pay} • ${fmtMoney(cost)}</button>${st.reason === 'money' ? `<div class="lock">${t('metodo.noMoney', { n: fmtMoney(cost - state.dinheiro) })}</div>` : ''}`;
  }
  return `<div class="ndetail" style="--c:${col}">
    <div class="nb">${STR.metodo.branches[n.branch]}${n.active ? ' • ATIVA' : ''}${n.capstone ? ' • ★' : ''}</div>
    <div class="nn">${S.name}</div>
    <div class="nlv">${t('metodo.level', { n: L, max: n.max })}</div>
    <div class="nd">"${S.desc}"</div>
    <div class="nfx"><span>${STR.metodo.now}</span><b>${now}</b></div>
    ${next ? `<div class="nfx next"><span>${STR.metodo.next}</span><b>${next}</b></div>` : ''}
    <div class="nact">${action}</div>
  </div>`;
}

export class MetodoScreen {
  constructor(root, game) {
    this.game = game;
    this.node = el('div', 'hidden');
    this.node.id = 'metodo';
    root.appendChild(this.node);
    this.selected = null;
    this.isOpen = false;
    this._resolve = null;
    this.node.addEventListener('click', (e) => this._onClick(e));
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    }, true);
  }

  /** opts: { greeting, mission, goDate, highlight } → Promise (resolve no fechar) */
  open(opts = {}) {
    this.opts = opts;
    this.isOpen = true;
    this.selected = opts.highlight ?? this.selected ?? null;
    this.missionOffer = opts.mission ?? null;
    this.node.classList.remove('hidden');
    this.node.innerHTML = `
      <div class="mt-top glass">
        <div class="mt-title">${STR.metodo.title}<small>${STR.metodo.tagline}</small></div>
        <div class="mt-money"><span data-k="money"></span><small data-k="rate"></small></div>
        <div class="mt-btns">
          <button class="buy ghost" data-go-work>${STR.metodo.goWork}</button>
          ${opts.goDate ? `<button class="buy date" data-go-date>${STR.metodo.goDate}</button>` : ''}
          <button class="icon-btn glass" data-close>✕</button>
        </div>
      </div>
      <div class="mt-bubble glass"><b>${STR.npcs.matheus}</b><span data-k="say"></span></div>
      <div class="mt-tree" data-k="tree"></div>
      <div class="mt-side glass" data-k="side"></div>
      <div class="mt-mission" data-k="mission"></div>
      <div class="mt-foot"><button class="buy ghost small" data-reset>${STR.metodo.reset}</button></div>`;
    this.k = {};
    for (const e of this.node.querySelectorAll('[data-k]')) this.k[e.dataset.k] = e;
    this.say(opts.greeting ?? '');
    this._renderMission();
    this.refresh(true);
    return new Promise((r) => (this._resolve = r));
  }

  close(result = null) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.classList.add('hidden');
    clearInterval(this._typeT);
    const r = this._resolve;
    this._resolve = null;
    r?.(result ?? { mission: this.missionAnswer ?? null });
    this.missionAnswer = null;
  }

  say(text) {
    const elSay = this.k?.say;
    if (!elSay) return;
    clearInterval(this._typeT);
    let i = 0;
    elSay.textContent = '';
    this._typeT = setInterval(() => {
      i += 2;
      elSay.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(this._typeT);
    }, 22);
  }

  _renderMission() {
    const m = this.missionOffer;
    if (!this.k.mission) return;
    if (!m) {
      this.k.mission.innerHTML = '';
      return;
    }
    this.k.mission.innerHTML = `<div class="glass mcard"><b>🍧 ${STR.metodo.missionTitle}</b><span>${m.text}</span>
      <div class="row"><button class="buy" data-mission="yes">${STR.metodo.missionAccept}</button><button class="buy ghost" data-mission="no">${STR.metodo.missionDecline}</button></div></div>`;
  }

  refresh(force = false) {
    if (!this.isOpen) return;
    const g = this.game;
    const s = g.state;
    const key = JSON.stringify([s.metodo.nodes, NODES.map((n) => MT.status(s, n.id).ok), this.selected, Math.floor(s.dinheiro)]);
    this.k.money.textContent = fmtMoney(s.dinheiro);
    this.k.rate.textContent = t('metodo.perMin', { n: fmtMoney(g.jobs.refRate() * 60) });
    if (!force && key === this._key) return;
    this._key = key;
    this.k.tree.innerHTML = treeSVG(s, this.selected);
    this.k.side.innerHTML = nodeDetail(s, this.selected, 'buy');
  }

  _onClick(e) {
    const g = this.game;
    const nodeEl = e.target.closest('[data-node]');
    if (nodeEl) {
      this.selected = nodeEl.dataset.node;
      g.audio.ui();
      this.refresh(true);
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) return this.close();
    if (b.dataset.buyNode) {
      if (g.buyMetodo(b.dataset.buyNode)) {
        const lines = STR.metodo.buyLines;
        this.say(lines[Math.floor(Math.random() * lines.length)]);
      } else {
        this.say(STR.metodo.broke[Math.floor(Math.random() * STR.metodo.broke.length)]);
      }
      this.refresh(true);
      return;
    }
    if (b.dataset.goWork !== undefined) {
      this.close({ goWork: true, mission: this.missionAnswer ?? null });
      return;
    }
    if (b.dataset.goDate !== undefined) {
      this.close({ goDate: true, mission: this.missionAnswer ?? null });
      return;
    }
    if (b.dataset.mission) {
      this.missionAnswer = b.dataset.mission === 'yes';
      this.missionOffer = null;
      this._renderMission();
      g.audio.ui();
      return;
    }
    if (b.dataset.reset !== undefined) {
      const s = g.state;
      const cost = MT.resetCost(s);
      g.modal.show({
        title: STR.metodo.reset,
        html: `<p>${t('metodo.resetConfirm', { money: fmtMoney(s.metodo.spent), ganhos: fmt(cost) })}</p>`,
        buttons: [
          { text: STR.settings.cancel, cls: 'sec' },
          {
            text: STR.metodo.reset,
            cls: 'danger',
            onClick: () => {
              if (g.resetMetodo()) this.say(STR.metodo.resetDone);
              else g.hud.toast(STR.metodo.resetNoGanhos, 'pink');
              this.refresh(true);
            },
          },
        ],
      });
    }
  }
}

export { BALANCE };
