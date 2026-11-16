// Entrada unificada: teclado, mouse, toque (tap, arrastar, pinça) e joystick virtual.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false };
    this.handlers = { tap: [], drag: [], zoom: [], key: [], keyup: [] };
    this.enabled = true;

    this._pointers = new Map();
    this._pinchDist = 0;

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('pointercancel', (e) => this._onUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this._emit('zoom', Math.sign(e.deltaY) * 0.6);
      },
      { passive: false },
    );
  }

  on(name, fn) {
    this.handlers[name].push(fn);
  }

  _emit(name, ...args) {
    for (const fn of this.handlers[name]) fn(...args);
  }

  _onKey(e, down) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (down) {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'F9') e.preventDefault();
      const repeat = e.repeat;
      this.keys.add(e.code);
      if (!repeat) this._emit('key', e.code, e);
    } else {
      this.keys.delete(e.code);
      this._emit('keyup', e.code, e);
    }
  }

  _onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button, t: performance.now() });
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  _onMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 7) p.moved = true;

    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinchDist > 0) this._emit('zoom', (this._pinchDist - d) * 0.02);
      this._pinchDist = d;
      return;
    }
    if (p.moved && this.enabled) this._emit('drag', dx, dy);
  }

  _onUp(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinchDist = 0;
    if (!p.moved && this.enabled && performance.now() - p.t < 600 && p.button !== 2) {
      this._emit('tap', e.clientX, e.clientY, e);
    }
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Vetor de movimento: x = direita, y = frente. */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyW', 'ArrowUp')) y += 1;
    if (this.isDown('KeyS', 'ArrowDown')) y -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.joy.active) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, len: Math.min(1, len) };
  }

  get running() {
    return this.isDown('ShiftLeft', 'ShiftRight') || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92);
  }
}
