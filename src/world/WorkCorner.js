import * as THREE from 'three';
import * as P from './Props.js';
import { labelTexture } from '../render/ProceduralTextures.js';
import { rand } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Cantinho do trabalho na Garagem:
//   - estação do VIBECODER: caixote de feira + carretel de fio como mesa +
//     notebook velho da Marlene + extensão pendurada (só destrava na academia nova;
//     o Uber, emprego da garagem, trabalha no carro: ver UberCar.js);
//   - canto do Matheus: caderninho → quadro branco → ring light → faixa
//     "Consultoria Neumman™" (evolui com o R$ investido no Método).
// ════════════════════════════════════════════════════════════════

const Y = new THREE.Vector3(0, 1, 0);

export class WorkCorner {
  constructor(world, gymDef) {
    this.world = world;
    this.def = gymDef;
    this.group = new THREE.Group();
    this.group.name = 'workCorner';
    world.group.add(this.group);
    this.t = 0;
    this.screenT = 0;
    this.job = null;
    this.working = false;
    this.codeLines = [];
    this._station();
    this._matheusCorner();
  }

  // ── Estação ──────────────────────────────────────────────────────
  _station() {
    const d = this.def.workStation;
    const g = new THREE.Group();
    g.position.set(d.pos[0], 0, d.pos[1]);
    g.rotation.y = d.yaw;
    this.group.add(g);
    const wood = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.85 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
    // Caixote de feira (assento)
    const crate = new THREE.Group();
    for (let i = 0; i < 3; i++) P.mesh(new THREE.BoxGeometry(0.46, 0.06, 0.02), wood, 0, 0.08 + i * 0.13, 0.17, crate);
    for (let i = 0; i < 3; i++) P.mesh(new THREE.BoxGeometry(0.46, 0.06, 0.02), wood, 0, 0.08 + i * 0.13, -0.17, crate);
    for (const x of [-0.22, 0.22]) P.mesh(new THREE.BoxGeometry(0.03, 0.42, 0.36), woodDark, x, 0.21, 0, crate);
    P.mesh(new THREE.BoxGeometry(0.46, 0.025, 0.36), wood, 0, 0.43, 0, crate);
    crate.position.set(0, 0, 0.05);
    g.add(crate);
    // Carretel de fio como mesa
    const spool = new THREE.Group();
    const sp = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.9 });
    P.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 28), sp, 0, 0.66, 0, spool);
    P.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 28), sp, 0, 0.04, 0, spool);
    P.mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.62, 18), woodDark, 0, 0.35, 0, spool);
    spool.position.set(0, 0, 0.55);
    g.add(spool);
    // Notebook (tela com canvas)
    const nb = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x3a3a46, metalness: 0.4, roughness: 0.5 });
    P.mesh(P.rbox(0.34, 0.018, 0.24, 0.008), shell, 0, 0.009, 0, nb);
    const keys = P.mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.7 }), 0, 0.019, -0.03, nb);
    keys.rotation.x = -Math.PI / 2;
    const lid = new THREE.Group();
    lid.position.set(0, 0.018, 0.115);
    lid.rotation.x = 0.32;
    nb.add(lid);
    P.mesh(P.rbox(0.34, 0.23, 0.012, 0.008), shell, 0, 0.115, 0, lid);
    // adesivo de dado d20 (presente da Marlene)
    const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.025, 6), new THREE.MeshStandardMaterial({ color: 0xff3a6a, roughness: 0.4 }));
    sticker.position.set(0.1, 0.17, 0.0065);
    lid.add(sticker);
    this.screenCanvas = document.createElement('canvas');
    // Resolução maior pra dar pra ler o Claude Code na tela do notebook
    this.screenCanvas.width = 512;
    this.screenCanvas.height = 330;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    screen.position.set(0, 0.115, -0.0065);
    screen.rotation.y = Math.PI;
    lid.add(screen);
    this.screenLight = new THREE.PointLight(0x7fd0ff, 0.6, 1.6, 2);
    this.screenLight.position.set(0, 0.2, -0.1);
    nb.add(this.screenLight);
    nb.position.set(0, 0.68, 0.5);
    g.add(nb);
    this.notebook = nb;
    // Extensão pendurada + fio
    const cord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.68, 0.5), new THREE.Vector3(0.45, 0.3, 0.7), new THREE.Vector3(0.6, 0.02, 0.9), new THREE.Vector3(0.9, 0.02, 1.0)]), 24, 0.006, 6, false),
      new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 }),
    );
    cord.castShadow = true;
    g.add(cord);
    P.mesh(P.rbox(0.18, 0.04, 0.06, 0.01), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 0.9, 0.02, 1.0, g);
    // Copo de café (CAFEZINHO!)
    const cup = P.mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), -0.22, 0.715, 0.55, g);
    P.mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.005, 14), new THREE.MeshStandardMaterial({ color: 0x3a1c0a, roughness: 0.2 }), 0, 0.03, 0, cup);
    this.station = g;

    // Ponto de encaixe, câmera e prompt (mesmo formato das máquinas)
    const pos = new THREE.Vector3(d.pos[0], 0, d.pos[1]);
    this.pos = pos;
    this.yaw = d.yaw;
    this.seatPos = pos.clone().add(new THREE.Vector3(0, 0, 0.05).applyAxisAngle(Y, d.yaw));
    this.camPos = new THREE.Vector3(...d.cam).applyAxisAngle(Y, d.yaw).add(pos);
    this.camLook = new THREE.Vector3(...d.look).applyAxisAngle(Y, d.yaw).add(pos);
    this.promptPos = pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    this.phoneSpot = new THREE.Vector3(-0.2, 0.68, 0.38).applyAxisAngle(Y, d.yaw).add(pos);
    this.coachSpot = new THREE.Vector3(0.95, 0, 0.6).applyAxisAngle(Y, d.yaw).add(pos);
    // Clique
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.7, 0.3);
    hit.userData.workStation = true;
    g.add(hit);
    this.hit = hit;
    // Colisão: o carretel (o assento fica livre pro Luisão encaixar)
    const tc = new THREE.Vector3(0, 0, 0.55).applyAxisAngle(Y, d.yaw).add(pos);
    this.world.obstacles.push({ x0: tc.x - 0.38, x1: tc.x + 0.38, z0: tc.z - 0.38, z1: tc.z + 0.38 });
    this.setLocked(true);
    this._drawScreen();
  }

  /** Antes da apresentação do Método a estação fica "desligada". */
  setLocked(v) {
    if (this.locked === v) return;
    this.locked = v;
    this.screenLight.intensity = v ? 0 : 0.6;
    this._drawScreen();
  }

  setJob(id, working = false) {
    this.job = id;
    this.working = working;
    this._drawScreen();
  }

  pushCodeLine(text) {
    this.codeLines.push(text);
    if (this.codeLines.length > 7) this.codeLines.shift();
  }

  /**
   * Log do Claude Code (o mesmo do painel). Cada entrada nova ganha a hora em que
   * chegou, pra ser "digitada" na tela letra por letra.
   */
  setTerminal(log = [], n = 0) {
    if (n === this._ccN) return;
    // Na primeira vez (abriu o jogo / sentou no caixote) o histórico já aparece pronto
    const added = this._ccN == null ? 0 : Math.max(0, Math.min(log.length, n - this._ccN));
    this._ccN = n;
    const now = this.t;
    const prev = this.cc ?? [];
    const keep = log.length - added;
    this.cc = log.map((e, i) => {
      if (i >= keep) return { ...e, at: now + (i - keep) * 0.35 }; // chega digitando, uma linha depois da outra
      return { ...e, at: prev[prev.length - keep + i]?.at ?? -99 };
    });
    this.screenT = 0;
  }

  _drawScreen() {
    const c = this.screenCanvas.getContext('2d');
    const W = this.screenCanvas.width;
    const H = this.screenCanvas.height;
    if (this.locked) {
      c.fillStyle = '#05060a';
      c.fillRect(0, 0, W, H);
      this.screenTex.needsUpdate = true;
      return;
    }
    this._drawClaudeCode(c, W, H);
    this.screenTex.needsUpdate = true;
  }

  /** Claude Code rodando no notebook da Marlene: janela, boas-vindas, conversa, spinner e caixa de prompt. */
  _drawClaudeCode(c, W, H) {
    const ORANGE = '#d97757';
    const t = this.t;
    c.fillStyle = '#16161a';
    c.fillRect(0, 0, W, H);
    // barra da janela
    c.fillStyle = '#26262c';
    c.fillRect(0, 0, W, 26);
    [['#ff5f57', 14], ['#febc2e', 32], ['#28c840', 50]].forEach(([col, x]) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(x, 13, 5.5, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = '#a8a8b0';
    c.font = '600 13px monospace';
    c.textAlign = 'center';
    c.fillText('claude — ~/shapecrm', W / 2, 18);
    c.textAlign = 'left';
    // caixa de boas-vindas
    c.strokeStyle = ORANGE;
    c.lineWidth = 2;
    this._rr(c, 10, 34, W - 20, 40, 7);
    c.stroke();
    c.fillStyle = ORANGE;
    c.font = '700 16px monospace';
    c.fillText('✻', 22, 59);
    c.fillStyle = '#f0f0f0';
    c.fillText('Bem-vindo ao Claude Code', 44, 59);
    c.fillStyle = '#8a8a94';
    c.font = '500 12px monospace';
    c.fillText('ShapeCRM', W - 88, 59);
    // conversa
    const log = (this.cc ?? []).slice(-6);
    const color = { u: '#e8e8ee', a: '#f0f0f0', ok: '#5fd38d', err: '#ff6b6b', sys: '#8a8a94' };
    const mark = { u: '>', a: '●', ok: '✓', err: '✗', sys: '$' };
    let y = 98;
    c.font = '500 14px monospace';
    for (const e of log) {
      if (t < e.at) continue; // ainda não chegou
      const typed = e.k === 'u' ? Math.floor((t - e.at) / 0.028) : Math.floor((t - e.at) / 0.012);
      const full = e.t.length > 52 ? e.t.slice(0, 51) + '…' : e.t;
      const txt = full.slice(0, Math.max(0, typed));
      c.fillStyle = e.k === 'a' ? ORANGE : color[e.k];
      c.fillText(mark[e.k] ?? ' ', 14, y);
      c.fillStyle = color[e.k] ?? '#ddd';
      if (e.k === 'u') {
        c.fillStyle = '#2a2a32';
        c.fillRect(30, y - 14, Math.min(W - 44, 8.45 * full.length + 8), 19);
        c.fillStyle = color.u;
      }
      c.fillText(txt, 34, y);
      y += 26;
      if (y > H - 64) break;
    }
    // spinner ("✻ Vibando…") enquanto trabalha
    if (this.working) {
      const glyphs = ['·', '✢', '✳', '✶', '✻', '✽'];
      const g = glyphs[Math.floor(t * 8) % glyphs.length];
      const verbs = ['Vibando', 'Pensando', 'Compilando o shape', 'Refatorando', 'Tomando whey', 'Contando reps'];
      const v = verbs[Math.floor(t / 3) % verbs.length];
      c.fillStyle = ORANGE;
      c.font = '700 14px monospace';
      c.fillText(`${g} ${v}…`, 14, H - 46);
      c.fillStyle = '#6a6a74';
      c.font = '500 11px monospace';
      c.fillText(`(${Math.floor(t % 60)}s · esc pra interromper)`, 14 + 9 * (v.length + 3), H - 46);
    }
    // caixa do prompt
    c.strokeStyle = '#4a4a54';
    c.lineWidth = 1.5;
    this._rr(c, 10, H - 34, W - 20, 26, 6);
    c.stroke();
    c.fillStyle = '#e8e8ee';
    c.font = '600 14px monospace';
    c.fillText('>', 20, H - 16);
    if (Math.floor(t * 2) % 2) c.fillRect(36, H - 28, 8, 15);
  }

  _rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ── Canto do Matheus ─────────────────────────────────────────────
  _matheusCorner() {
    const d = this.def.matheusCorner;
    this.mcStages = [];
    // 0: caderninho no chão
    const s0 = new THREE.Group();
    const book = P.mesh(P.rbox(0.18, 0.02, 0.24, 0.005), new THREE.MeshStandardMaterial({ color: 0xff4f7b, roughness: 0.8 }), d.notebook[0], 0.01, d.notebook[1], s0);
    book.rotation.y = 0.4;
    P.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x2a6ad8 }), d.notebook[0] + 0.1, 0.012, d.notebook[1] + 0.05, s0).rotation.set(0, 0.2, Math.PI / 2);
    // 1: quadro branco com a "constelação" do Método
    const s1 = new THREE.Group();
    const boardTex = labelTexture((ctx, w, h) => {
      ctx.fillStyle = '#f6f6f2';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#d8203a';
      ctx.font = `900 ${w * 0.075}px "Comic Sans MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('MÉTODO NEUMMAN', w / 2, h * 0.16);
      ctx.strokeStyle = '#2a5ad8';
      ctx.lineWidth = 3;
      const pts = [[0.5, 0.55], [0.5, 0.3], [0.3, 0.75], [0.7, 0.75], [0.4, 0.22], [0.6, 0.22], [0.18, 0.85], [0.82, 0.85]];
      for (const [x, y] of pts.slice(1)) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.55);
        ctx.lineTo(w * x, h * y);
        ctx.stroke();
      }
      ctx.fillStyle = '#1a1a1a';
      for (const [x, y] of pts) {
        ctx.beginPath();
        ctx.arc(w * x, h * y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#2a8a3a';
      ctx.font = `700 ${w * 0.045}px "Comic Sans MS", sans-serif`;
      ctx.fillText('ciência = vídeo de 30 s', w / 2, h * 0.97);
    }, 512, 352);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.35 }));
    board.position.set(d.board[0] + 0.06, 1.35, d.board[1]);
    board.rotation.y = Math.PI / 2;
    board.castShadow = true;
    s1.add(board);
    P.mesh(new THREE.BoxGeometry(0.03, 0.04, 1.1), P.M.metal(0.4, 0xaaaaaa), d.board[0] + 0.07, 0.97, d.board[1], s1);
    // 2: ring light
    const s2 = new THREE.Group();
    const stand = new THREE.Group();
    stand.position.set(d.ring[0], 0, d.ring[1]);
    s2.add(stand);
    P.mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 8), P.M.metal(0.4, 0x222222), 0, 0.78, 0, stand);
    for (let i = 0; i < 3; i++) {
      const leg = P.mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6), P.M.metal(0.4, 0x222222), Math.cos(i * 2.1) * 0.14, 0.12, Math.sin(i * 2.1) * 0.14, stand);
      leg.rotation.set(Math.sin(i * 2.1) * 0.8, 0, -Math.cos(i * 2.1) * 0.8);
    }
    const ring = P.mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 36), P.M.emissive(0xfff4e0, 2.4), 0, 1.6, 0, stand);
    ring.rotation.y = Math.PI / 2 + 0.6;
    this.ringMesh = ring;
    this.ringLight = new THREE.PointLight(0xfff0dd, 0, 3.5, 2);
    this.ringLight.position.set(d.ring[0] + 0.3, 1.6, d.ring[1] - 0.2);
    s2.add(this.ringLight);
    this.world.obstacles.push({ x0: d.ring[0] - 0.18, x1: d.ring[0] + 0.18, z0: d.ring[1] - 0.18, z1: d.ring[1] + 0.18 });
    // 3: faixa "Consultoria Neumman™"
    const s3 = new THREE.Group();
    const bannerTex = labelTexture((ctx, w, h) => {
      const gr = ctx.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#1a1a22');
      gr.addColorStop(1, '#3a1a2a');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff4f7b';
      ctx.font = `900 ${h * 0.42}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('CONSULTORIA NEUMMAN™', w / 2, h * 0.55);
      ctx.fillStyle = '#ffd34d';
      ctx.font = `700 ${h * 0.2}px sans-serif`;
      ctx.fillText('aceitamos Pix, elogio e açaí', w / 2, h * 0.85);
    }, 512, 96);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, side: THREE.DoubleSide }));
    banner.position.set(d.banner[0] + 0.05, 2.45, d.banner[1]);
    banner.rotation.y = Math.PI / 2;
    s3.add(banner);
    this.mcStages = [s0, s1, s2, s3];
    for (const s of this.mcStages) {
      s.visible = false;
      this.group.add(s);
    }
    this.setMatheusStage(0);
  }

  /** Mostra todos os estágios até n (eles se acumulam no canto). */
  setMatheusStage(n) {
    if (this.mStage === n) return;
    this.mStage = n;
    this.mcStages.forEach((s, i) => (s.visible = i <= n));
    this.ringLight.intensity = n >= 2 ? 1.2 : 0;
  }

  update(dt) {
    this.t += dt;
    if (this.working) {
      this.screenT -= dt;
      if (this.screenT <= 0) {
        this.screenT = 1 / 15; // ~15 quadros/s pra digitação e spinner
        this._drawScreen();
      }
      this.screenLight.intensity = 0.6 + Math.sin(this.t * 9) * 0.05;
    }
    if (this.mStage >= 2) this.ringMesh.material.emissiveIntensity = 2.2 + Math.sin(this.t * 1.5) * 0.15 + (Math.random() < 0.01 ? -1.5 : 0);
    void rand;
  }
}
