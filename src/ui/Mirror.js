import { STR, muscleName, upper } from '../i18n/pt-BR.js';
import { el } from '../core/utils.js';
import { MUSCLES } from '../config/balance.js';

// Modo ESPELHO: câmera orbita o Luisão e um mapa muscular interativo
// mostra cada músculo colorido pelo progresso do requisito atual.

const FRONT = `
<svg viewBox="0 0 100 220" aria-label="frente">
  <circle class="base" cx="50" cy="18" r="13"/>
  <rect class="base" x="44" y="30" width="12" height="8" rx="3"/>
  <ellipse class="m" data-m="ombros" cx="26" cy="46" rx="10" ry="9"/>
  <ellipse class="m" data-m="ombros" cx="74" cy="46" rx="10" ry="9"/>
  <path class="m" data-m="peito" d="M34 40 Q50 36 49 40 L49 62 Q40 66 32 60 Q29 50 34 40Z"/>
  <path class="m" data-m="peito" d="M66 40 Q50 36 51 40 L51 62 Q60 66 68 60 Q71 50 66 40Z"/>
  <ellipse class="m" data-m="biceps" cx="21" cy="70" rx="7" ry="14"/>
  <ellipse class="m" data-m="biceps" cx="79" cy="70" rx="7" ry="14"/>
  <rect class="base" x="13" y="85" width="11" height="28" rx="5"/>
  <rect class="base" x="76" y="85" width="11" height="28" rx="5"/>
  <rect class="m" data-m="abdomen" x="38" y="64" width="24" height="40" rx="7"/>
  <path class="base" d="M36 104 L64 104 L66 116 L34 116Z"/>
  <ellipse class="m" data-m="pernas" cx="40" cy="146" rx="10" ry="28"/>
  <ellipse class="m" data-m="pernas" cx="60" cy="146" rx="10" ry="28"/>
  <rect class="base" x="33" y="176" width="13" height="36" rx="6"/>
  <rect class="base" x="54" y="176" width="13" height="36" rx="6"/>
</svg>`;

const BACK = `
<svg viewBox="0 0 100 220" aria-label="costas">
  <circle class="base" cx="50" cy="18" r="13"/>
  <ellipse class="m" data-m="ombros" cx="26" cy="46" rx="10" ry="9"/>
  <ellipse class="m" data-m="ombros" cx="74" cy="46" rx="10" ry="9"/>
  <path class="m" data-m="costas" d="M32 38 Q50 32 68 38 L66 66 Q58 92 50 98 Q42 92 34 66Z"/>
  <ellipse class="m" data-m="triceps" cx="21" cy="70" rx="7" ry="14"/>
  <ellipse class="m" data-m="triceps" cx="79" cy="70" rx="7" ry="14"/>
  <rect class="base" x="13" y="85" width="11" height="28" rx="5"/>
  <rect class="base" x="76" y="85" width="11" height="28" rx="5"/>
  <path class="base" d="M36 100 L64 100 L66 120 Q50 126 34 120Z"/>
  <ellipse class="m" data-m="pernas" cx="40" cy="148" rx="10" ry="26"/>
  <ellipse class="m" data-m="pernas" cx="60" cy="148" rx="10" ry="26"/>
  <ellipse class="m" data-m="panturrilhas" cx="39" cy="190" rx="7" ry="16"/>
  <ellipse class="m" data-m="panturrilhas" cx="61" cy="190" rx="7" ry="16"/>
</svg>`;

const COLORS = { far: '#8a8f9c', close: '#ffa94d', met: '#5dff9e', cap: '#ffd34d' };

export class Mirror {
  constructor(root, game) {
    this.game = game;
    this.node = el('div', 'hidden');
    this.node.id = 'mirror';
    this.node.innerHTML = `
      <div class="mpanel glass">
        <div class="mtitle"><span>🪞 ${upper(STR.menu.tabs.espelho)}</span><button class="icon-btn" data-close style="width:38px;height:38px">✕</button></div>
        <div class="bodymap">${FRONT}${BACK}</div>
        <div class="legend">
          <span style="--c:${COLORS.far}">${STR.mirror.far}</span><span style="--c:${COLORS.close}">${STR.mirror.close}</span>
          <span style="--c:${COLORS.met}">${STR.mirror.met}</span><span style="--c:${COLORS.cap}">${STR.mirror.cap}</span>
        </div>
        <div class="derived"></div>
        <div class="frango hidden"></div>
        <div class="info"></div>
        <div class="btns"><button data-go>${STR.hud.goToMachine}</button><button class="sec" data-pose>${STR.mirror.pose}</button></div>
      </div>
      <div class="hint glass">${STR.mirror.hint}</div>`;
    root.appendChild(this.node);
    this.sel = null;
    this.node.querySelector('[data-close]').onclick = () => game.closeMirror();
    this.node.querySelector('[data-go]').onclick = () => {
      if (this.sel) game.goToMuscle(this.sel);
    };
    this.node.querySelector('[data-pose]').onclick = () => game.mirrorPose();
    this.node.querySelector('.bodymap').addEventListener('click', (e) => {
      const m = e.target.closest('.m');
      if (!m) return;
      this.select(m.dataset.m);
      game.audio.ui();
    });
  }

  get isOpen() {
    return !this.node.classList.contains('hidden');
  }

  open() {
    this.node.classList.remove('hidden');
    if (!this.sel) this.sel = this.game.weakMuscle() ?? 'peito';
    this.refresh(true);
  }

  close() {
    this.node.classList.add('hidden');
  }

  select(m) {
    this.sel = m;
    this.game.focusMirrorMuscle?.(m);
    this.refresh(true);
  }

  refresh(force) {
    if (!this.isOpen) return;
    const d = this.game.mirrorData();
    const key = JSON.stringify([d.muscles, this.sel, d.forca, d.sym, d.frango, d.poseReady]);
    if (!force && key === this._key) return;
    this._key = key;
    for (const p of this.node.querySelectorAll('.m')) {
      const info = d.muscles[p.dataset.m];
      p.style.fill = COLORS[info.status];
      p.classList.toggle('sel', p.dataset.m === this.sel);
    }
    this.node.querySelector('.derived').innerHTML = `
      <div><small>${STR.hud.forca}</small><b>${d.forca}</b></div>
      <div><small>${STR.hud.simetria}</small><b>${d.sym}%</b></div>
      <div><small>${STR.hud.estetica}</small><b>${d.estetica}</b></div>`;
    const fr = this.node.querySelector('.frango');
    fr.classList.toggle('hidden', !d.frango);
    fr.textContent = `🐔 ${STR.frango}`;
    const i = d.muscles[this.sel];
    this.node.querySelector('.info').innerHTML = `
      <div class="n">${muscleName(this.sel)} ${i.weak ? `<span class="tag weak">${STR.hud.weakPoint}</span>` : ''}</div>
      <div class="row"><span>${STR.hud.level}</span><b>${i.level}/${i.cap}</b></div>
      <div class="row"><span>${STR.hud.requirements}</span><b>${i.req != null ? (i.level >= i.req ? '✔' : `${i.level}/${i.req}`) : '—'}</b></div>
      <div class="row"><span>${STR.hud.fatigue}</span><b>${Math.round(i.fatigue * 100)}%</b></div>
      <div class="row"><span>${STR.mirror.stage}</span><b>${i.stage + 1}/6</b></div>
      <div class="row"><span>${STR.mirror.machine}</span><b>${i.machine ?? '—'}</b></div>`;
    this.node.querySelector('[data-pose]').disabled = !d.poseReady;
  }
}

export { MUSCLES };
