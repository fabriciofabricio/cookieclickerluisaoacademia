// Barramento de eventos simples: sistemas emitem, UI/áudio/efeitos escutam.
export class EventBus {
  constructor() {
    this.map = new Map();
  }

  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.map.get(name)?.delete(fn);
  }

  emit(name, payload) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] erro no evento "${name}"`, err);
      }
    }
  }
}

export const bus = new EventBus();
