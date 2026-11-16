import { STR } from '../i18n/pt-BR.js';
import { el } from '../core/utils.js';

// Diálogo cinematográfico: tarjas pretas, nome, texto em máquina de
// escrever (clique pula/avança) e botões de escolha.

export class Dialogue {
  constructor(root, { onLine, onOpen, onClose, sfx } = {}) {
    this.root = root;
    this.onLine = onLine;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.sfx = sfx;
    this.box = el('div', 'glass off');
    this.box.id = 'dialogue';
    this.box.innerHTML = `<div class="nametag"></div><div class="text"></div><div class="choices"></div><div class="hint">▸</div>`;
    root.appendChild(this.box);
    this.name = this.box.querySelector('.nametag');
    this.text = this.box.querySelector('.text');
    this.choices = this.box.querySelector('.choices');
    this.hint = this.box.querySelector('.hint');
    this.active = false;
    this._typing = false;
    this._advance = null;
    this.box.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.choice')) return;
      this._click();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
        e.preventDefault();
        e.stopPropagation();
        if (!this.choices.children.length) this._click();
      }
    }, true);
  }

  _click() {
    if (this._typing) {
      this._finishTyping?.();
    } else if (this._advance) {
      const a = this._advance;
      this._advance = null;
      a();
    }
  }

  open() {
    if (this.active) return;
    this.active = true;
    this.box.classList.remove('off');
    this.onOpen?.();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.box.classList.add('off');
    this.onClose?.();
  }

  _type(str) {
    return new Promise((resolve) => {
      this._typing = true;
      this.text.textContent = '';
      let i = 0;
      const speed = 26; // caracteres por segundo... x2
      const timer = setInterval(() => {
        i += 2;
        this.text.textContent = str.slice(0, i);
        if (i % 6 === 0) this.sfx?.();
        if (i >= str.length) done();
      }, 1000 / speed);
      const done = () => {
        clearInterval(timer);
        this.text.textContent = str;
        this._typing = false;
        this._finishTyping = null;
        resolve();
      };
      this._finishTyping = done;
    });
  }

  _setSpeaker(who) {
    const nar = !who;
    this.name.textContent = who ?? '';
    this.name.className = 'nametag' + (nar ? ' nar' : who === STR.npcs.matheus ? ' mat' : who === STR.npcs.seuze || who === STR.npcs.ivone ? ' ze' : '');
    this.text.classList.toggle('nar', nar);
  }

  /**
   * Toca uma sequência de falas. Cada fala: { who, text, id? }
   * onLine(line) é chamado a cada fala (pra câmera de plano/contraplano).
   */
  async play(lines, { keepOpen = false } = {}) {
    this.open();
    for (const line of lines) {
      this._setSpeaker(line.who);
      this.choices.innerHTML = '';
      this.hint.style.display = '';
      this.onLine?.(line);
      await this._type(line.text);
      await new Promise((r) => (this._advance = r));
    }
    if (!keepOpen) this.close();
  }

  /**
   * Pergunta com opções. Retorna o índice escolhido.
   * options: [{ text, tip?: bool, disabled?: bool }]
   */
  async choose(who, prompt, options, { reveal } = {}) {
    this.open();
    this._setSpeaker(who);
    this.onLine?.({ who, text: prompt });
    this.choices.innerHTML = '';
    this.hint.style.display = 'none';
    await this._type(prompt);
    return new Promise((resolve) => {
      options.forEach((o, i) => {
        const b = el('button', 'choice', `${o.text}${o.tip ? `<span class="tip">💡 ${STR.dates.tipBadge}</span>` : ''}${o.avoid ? `<span class="tip avoid">⚠ ${STR.dates.avoidBadge}</span>` : ''}`);
        if (o.disabled) b.disabled = true;
        b.onclick = async () => {
          for (const c of this.choices.children) c.disabled = true;
          if (reveal) {
            b.classList.add(reveal(i) ? 'right' : 'wrong');
            await new Promise((r) => setTimeout(r, 650));
          }
          this.choices.innerHTML = '';
          resolve(i);
        };
        this.choices.appendChild(b);
      });
    });
  }
}

export class Modal {
  constructor(root) {
    this.root = root;
    this.node = null;
  }

  get open() {
    return !!this.node;
  }

  /** { title, html, big, buttons:[{text, cls, onClick, close=true}], cls, dismissable } */
  show({ title = '', html = '', big = '', buttons = [{ text: STR.common.ok }], cls = '', onClose } = {}) {
    this.close(false);
    const wrap = el('div');
    wrap.id = 'modal';
    wrap.innerHTML = `<div class="box glass ${cls}">${title ? `<h2>${title}</h2>` : ''}${big ? `<div class="big">${big}</div>` : ''}${html}<div class="btns"></div></div>`;
    const btns = wrap.querySelector('.btns');
    for (const b of buttons) {
      const e = el('button', b.cls ?? '', b.text);
      e.onclick = () => {
        if (b.close !== false) this.close();
        b.onClick?.(wrap);
      };
      btns.appendChild(e);
    }
    this.onCloseCb = onClose;
    this.root.appendChild(wrap);
    this.node = wrap;
    return wrap;
  }

  close(fire = true) {
    if (!this.node) return;
    this.node.remove();
    this.node = null;
    if (fire) {
      const cb = this.onCloseCb;
      this.onCloseCb = null;
      cb?.();
    }
  }

  /** Versão com Promise (espera fechar). */
  ask(opts) {
    return new Promise((resolve) => {
      const buttons = (opts.buttons ?? [{ text: STR.common.ok }]).map((b, i) => ({ ...b, onClick: (w) => { b.onClick?.(w); resolve(i); } }));
      this.show({ ...opts, buttons });
    });
  }
}
