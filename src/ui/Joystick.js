import { el } from '../core/utils.js';

// Joystick virtual (mobile). Escreve direto em input.joy.
export class Joystick {
  constructor(root, input) {
    this.input = input;
    this.node = el('div');
    this.node.id = 'joy';
    this.node.innerHTML = '<div class="stick"></div>';
    root.appendChild(this.node);
    this.stick = this.node.querySelector('.stick');
    this.id = null;
    const R = 50;
    const move = (e) => {
      if (e.pointerId !== this.id) return;
      const r = this.node.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      this.stick.style.transform = `translate(${dx}px, ${dy}px)`;
      input.joy.x = dx / R;
      input.joy.y = -dy / R;
      input.joy.active = true;
    };
    const end = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      this.stick.style.transform = '';
      input.joy.x = input.joy.y = 0;
      input.joy.active = false;
    };
    this.node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.id = e.pointerId;
      this.node.setPointerCapture(e.pointerId);
      move(e);
    });
    this.node.addEventListener('pointermove', move);
    this.node.addEventListener('pointerup', end);
    this.node.addEventListener('pointercancel', end);
  }

  setVisible(v) {
    this.node.style.display = v ? '' : 'none';
  }
}
