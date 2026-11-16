// Mini-mapa 2D da academia: máquinas coloridas pelo progresso, jogador, Matheus e Shake Dourado.

const COLORS = { far: '#8a8f9c', close: '#ffa94d', met: '#5dff9e', cap: '#ffd34d' };

export class Minimap {
  constructor(canvas, gym, onPick) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.gym = gym;
    this.onPick = onPick;
    this.t = 0;
    const b = gym.walkBounds;
    this.b = { x0: b.x0 - 0.4, x1: b.x1 + 0.4, z0: gym.size.z0 - 0.6, z1: b.z1 + 0.5 };
    canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * canvas.width;
      const py = ((e.clientY - r.top) / r.height) * canvas.height;
      let best = null;
      let bd = 26;
      for (const m of [...(this._machines ?? []), ...(this._works ?? [])]) {
        const [x, y] = this.map(m.x, m.z);
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          best = m.id;
        }
      }
      if (best) this.onPick?.(best);
    });
  }

  map(x, z) {
    const { x0, x1, z0, z1 } = this.b;
    const W = this.c.width;
    const H = this.c.height;
    const s = Math.min(W / (x1 - x0), H / (z1 - z0));
    const ox = (W - (x1 - x0) * s) / 2;
    const oy = (H - (z1 - z0) * s) / 2;
    // Portão pra baixo do mapa
    return [ox + (x - x0) * s, oy + (z - z0) * s, s];
  }

  /** data: { player:{x,z,yaw}, machines:[{id,x,z,status,icon}], matheus:{x,z,bang}, golden:{x,z}|null } */
  draw(data, dt) {
    this.t += dt;
    this._machines = data.machines;
    const { ctx } = this;
    const W = this.c.width;
    const H = this.c.height;
    ctx.clearRect(0, 0, W, H);
    const g = this.gym.size;
    const [ax, ay, s] = this.map(g.x0, g.z0);
    const [bx, by] = this.map(g.x1, g.z1);
    // Calçada
    const [sx0, sy0] = this.map(this.b.x0, g.z1);
    const [sx1, sy1] = this.map(this.b.x1, this.b.z1);
    ctx.fillStyle = 'rgba(200,190,170,0.18)';
    ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    // Garagem
    ctx.fillStyle = 'rgba(120,125,140,0.28)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.fillRect(ax, ay, bx - ax, by - ay);
    ctx.beginPath();
    const [gx0] = this.map(this.gym.gate.x0, 0);
    const [gx1] = this.map(this.gym.gate.x1, 0);
    ctx.moveTo(gx0, by);
    ctx.lineTo(ax, by);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(gx1, by);
    ctx.stroke();
    // Máquinas
    for (const m of data.machines) {
      const [x, y] = this.map(m.x, m.z);
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[m.status] ?? COLORS.far;
      ctx.fill();
      if (m.weak) {
        ctx.strokeStyle = '#ff5a3c';
        ctx.lineWidth = 3 + Math.sin(this.t * 6) * 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#111';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.icon, x, y + 1);
    }
    // Shake dourado
    if (data.golden) {
      const [x, y] = this.map(data.golden.x, data.golden.z);
      ctx.beginPath();
      ctx.arc(x, y, 8 + Math.sin(this.t * 8) * 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd34d';
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Energético (raro)
    if (data.energy) {
      const [x, y] = this.map(data.energy.x, data.energy.z);
      ctx.beginPath();
      ctx.arc(x, y, 7 + Math.sin(this.t * 9) * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#7dff4d';
      ctx.shadowColor = '#7dff4d';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Estações de trabalho: o carro do Uber (🚗) e o caixote do Vibecoder (R$)
    this._works = (data.works ?? []).filter((w) => !w.locked);
    for (const w of this._works) {
      const [x, y] = this.map(w.x, w.z);
      ctx.fillStyle = '#5dff9e';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - 11, y - 9, 22, 18, 5);
      else ctx.rect(x - 11, y - 9, 22, 18);
      ctx.fill();
      ctx.font = '900 13px sans-serif';
      ctx.fillStyle = '#111';
      ctx.fillText(w.label ?? 'R$', x, y + 1);
    }
    // Personal da Equipe
    if (data.personal) {
      const [x, y] = this.map(data.personal.x, data.personal.z);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#4fd1ff';
      ctx.fill();
    }
    // Matheus
    if (data.matheus) {
      const [x, y] = this.map(data.matheus.x, data.matheus.z);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4f7b';
      ctx.fill();
      if (data.matheus.bang) {
        ctx.fillStyle = '#ffd34d';
        ctx.font = '900 22px sans-serif';
        ctx.fillText('!', x, y - 18 + Math.sin(this.t * 6) * 2);
      } else if (data.matheus.coin) {
        ctx.fillStyle = '#5dff9e';
        ctx.font = '900 17px sans-serif';
        ctx.fillText('$', x, y - 17 + Math.sin(this.t * 4) * 2);
      }
    }
    // Jogador (seta)
    const [px, py] = this.map(data.player.x, data.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-data.player.yaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#4fd1ff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    void s;
  }
}
