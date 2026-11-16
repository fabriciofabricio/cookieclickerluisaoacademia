import * as THREE from 'three';
import { rand } from '../core/utils.js';

// ════════════════════════════════════════════════════════════════
//  Áudio com Web Audio API. Sons sintetizados por padrão; se existir
//  um arquivo em /public/assets/audio, ele substitui o sintetizado.
//  Regras anti-chatice: volume padrão 40%, no máximo 10 sons de rep
//  por segundo (e cada vez mais baixo), auto-rep e renda passiva mudos.
// ════════════════════════════════════════════════════════════════

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  constructor(loader) {
    this.loader = loader;
    this.ctx = null;
    this.buffers = {};
    this.repTimes = [];
    this.settings = { master: 0.4, sfx: 1, music: 0.55, ambient: 0.6, muted: false };
    this.musicOn = false;
    this.listenerPos = new THREE.Vector3();
  }

  /** Precisa de um gesto do usuário (clique) pra liberar o áudio. */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.ambient = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.ambient.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.5);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain).connect(this.sfx);
    this.noiseBuf = this._noise(2);
    this.apply(this.settings);
    await this._loadFiles();
  }

  async _loadFiles() {
    const keys = ['rep', 'clank', 'crit', 'purchase', 'rankup', 'stageup', 'fanfare', 'golden', 'hit', 'miss', 'music_garagem'];
    await Promise.all(
      keys.map(async (k) => {
        const url = this.loader?.audioUrl(k);
        if (!url) return;
        try {
          const res = await fetch(url);
          this.buffers[k] = await this.ctx.decodeAudioData(await res.arrayBuffer());
        } catch (err) {
          console.warn('[Audio] falhou', k, err);
        }
      }),
    );
  }

  apply(s) {
    Object.assign(this.settings, s);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const st = this.settings;
    this.master.gain.setTargetAtTime(st.muted ? 0 : st.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(st.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(st.music * 0.5, t, 0.1);
    this.ambient.gain.setTargetAtTime(st.ambient * 0.6, t, 0.1);
  }

  _noise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _impulse(sec, decay) {
    const rate = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(2, rate * sec, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
    }
    return b;
  }

  // ── Blocos de síntese ────────────────────────────────────────────
  _env(g, t, a, peak, d, sustain = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  _osc(type, f0, f1, t, dur, vol, dest = this.sfx) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this._env(g, t, 0.005, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return { o, g };
  }

  _noiseHit(t, dur, vol, type = 'lowpass', freq = 1000, q = 0.7, dest = this.sfx, f1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rand(0.9, 1.1);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, rand(0, 1));
    s.stop(t + dur + 0.05);
  }

  _buffer(name, vol = 1, rate = 1, dest = this.sfx) {
    const b = this.buffers[name];
    if (!b) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(dest);
    s.start();
    return true;
  }

  // ── Sons do jogo ─────────────────────────────────────────────────
  /** Repetição: thump grave com ±8% de pitch, variação por máquina. */
  rep(kind = 'thump', crit = false) {
    if (!this.ctx) return;
    const now = performance.now();
    this.repTimes = this.repTimes.filter((x) => now - x < 1000);
    if (this.repTimes.length >= 10) return;
    this.repTimes.push(now);
    const vol = Math.max(0.25, 1 - this.repTimes.length * 0.07);
    const t = this.ctx.currentTime + 0.001;
    const p = rand(0.92, 1.08);
    if (crit) return this.crit(kind, vol);
    if (this._buffer(kind === 'clank' ? 'clank' : 'rep', vol * 0.8, p)) return;
    this._thump(t, p, vol);
    if (kind === 'clank') {
      for (const f of [523, 1187, 2210]) this._osc('sine', f * p, f * p * 0.98, t, 0.22, 0.05 * vol);
    } else if (kind === 'slosh') {
      this._noiseHit(t, 0.28, 0.12 * vol, 'bandpass', 600, 2.5, this.sfx, 1600);
    } else if (kind === 'whoosh') {
      this._noiseHit(t, 0.25, 0.1 * vol, 'bandpass', 2400, 1.4, this.sfx, 500);
    } else if (kind === 'step') {
      this._noiseHit(t, 0.06, 0.12 * vol, 'lowpass', 1800);
    } else if (kind === 'chat') {
      for (let i = 0; i < 3; i++) this._osc('triangle', rand(380, 640), null, t + i * 0.07, 0.06, 0.05 * vol);
    } else if (kind === 'splash') {
      this._noiseHit(t, 0.4, 0.15 * vol, 'bandpass', 900, 1.2, this.sfx, 3000);
    }
  }

  _thump(t, p, vol) {
    this._osc('sine', 140 * p, 52 * p, t, 0.16, 0.42 * vol);
    this._noiseHit(t, 0.05, 0.08 * vol, 'lowpass', 900 * p);
  }

  crit(kind, vol = 1) {
    const t = this.ctx.currentTime + 0.001;
    if (this._buffer('crit', vol)) return;
    this._osc('sine', 170, 45, t, 0.24, 0.55 * vol);
    this._noiseHit(t, 0.08, 0.14 * vol, 'lowpass', 1400);
    for (let i = 0; i < 4; i++) this._osc('sine', 2093 * Math.pow(1.26, i), null, t + 0.03 + i * 0.035, 0.18, 0.045 * vol);
    this._noiseHit(t + 0.02, 0.25, 0.03 * vol, 'highpass', 6000);
  }

  ui() {
    if (!this.ctx) return;
    this._osc('triangle', 1400, 1100, this.ctx.currentTime, 0.04, 0.04);
  }

  purchase() {
    if (!this.ctx || this._buffer('purchase', 0.8)) return;
    const t = this.ctx.currentTime;
    this._osc('triangle', 1318, null, t, 0.08, 0.12);
    this._osc('triangle', 1760, null, t + 0.07, 0.22, 0.14);
    this._noiseHit(t + 0.07, 0.18, 0.05, 'highpass', 5000);
  }

  rankUp() {
    if (!this.ctx || this._buffer('rankup', 0.8)) return;
    const t = this.ctx.currentTime;
    [72, 76, 79].forEach((n, i) => this._osc('triangle', NOTE(n), null, t + i * 0.09, 0.28, 0.13));
    this._osc('sine', NOTE(84), null, t + 0.27, 0.45, 0.07);
  }

  stageUp() {
    if (!this.ctx || this._buffer('stageup', 0.8)) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(NOTE(48), t);
    o.frequency.exponentialRampToValueAtTime(NOTE(60), t + 0.7);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.65);
    f.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(f).connect(g).connect(this.sfx);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 1);
    this._osc('sine', NOTE(72), null, t + 0.6, 0.5, 0.1);
  }

  fanfare() {
    if (!this.ctx || this._buffer('fanfare', 0.9)) return;
    const t = this.ctx.currentTime;
    const seq = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.38]];
    for (const [n, d] of seq) {
      this._osc('square', NOTE(n), null, t + d, 0.3, 0.05);
      this._osc('triangle', NOTE(n), null, t + d, 0.4, 0.1);
    }
    // Tom de "coração" com vibrato
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = 8;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.value = NOTE(88);
    const g = this.ctx.createGain();
    this._env(g, t + 0.55, 0.05, 0.09, 0.9);
    o.connect(g).connect(this.sfx);
    g.connect(this.reverb);
    o.start(t + 0.55);
    lfo.start(t + 0.55);
    o.stop(t + 1.6);
    lfo.stop(t + 1.6);
  }

  nickname() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._osc('sawtooth', 200, 1600, t, 0.25, 0.05);
    [76, 80, 83, 88].forEach((n, i) => this._osc('triangle', NOTE(n), null, t + 0.22 + i * 0.03, 0.6, 0.08));
  }

  golden() {
    if (!this.ctx || this._buffer('golden', 0.7)) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 9; i++) this._osc('sine', rand(1600, 4200), null, t + i * 0.05, 0.4, 0.025);
  }

  pump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseHit(t, 0.3, 0.06, 'bandpass', 400, 3, this.sfx, 2400);
    this._osc('sine', NOTE(64), NOTE(76), t, 0.2, 0.05);
  }

  pr() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this._noiseHit(t + i * 0.18, 0.05, 0.12, 'bandpass', 2000, 1.5);
      for (let k = 0; k < 6; k++) this._noiseHit(t + i * 0.18 + 0.1 + k * 0.025, 0.03, 0.04, 'highpass', 4000);
    }
    this._osc('triangle', NOTE(79), NOTE(91), t, 0.3, 0.06);
  }

  hit() {
    if (!this.ctx || this._buffer('hit', 0.7)) return;
    this._osc('sine', 880, 1320, this.ctx.currentTime, 0.09, 0.1);
  }

  miss() {
    if (!this.ctx || this._buffer('miss', 0.7)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 330, 110, t, 0.22, 0.16);
    this._osc('square', 160, 90, t, 0.12, 0.03);
  }

  creak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    o.frequency.linearRampToValueAtTime(140, t + 0.25);
    o.frequency.linearRampToValueAtTime(70, t + 0.55);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 8;
    const g = this.ctx.createGain();
    this._env(g, t, 0.05, 0.08, 0.55);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.7);
  }

  gymUnlock() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._osc('sine', 80, 28, t, 1.6, 0.5);
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.5);
    const g = this.ctx.createGain();
    this._env(g, t, 0.01, 0.3, 1.5);
    s.connect(f).connect(g);
    g.connect(this.sfx);
    g.connect(this.reverb);
    s.start(t);
    s.stop(t + 1.6);
    [48, 55, 60, 64].forEach((n) => this._osc('sawtooth', NOTE(n), null, t + 0.1, 1.6, 0.025));
  }

  coin() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._osc('square', 988, null, t, 0.05, 0.04);
    this._osc('square', 1319, null, t + 0.05, 0.15, 0.04);
  }

  // ── Trabalho / Método / Equipe ───────────────────────────────────
  /** "Plim" do Pix: dois tons brilhantes e curtos. */
  pix(vol = 1) {
    if (!this.ctx || this._buffer('pix', 0.6 * vol)) return;
    const t = this.ctx.currentTime;
    this._osc('sine', NOTE(88), null, t, 0.12, 0.07 * vol);
    this._osc('sine', NOTE(95), null, t + 0.08, 0.28, 0.07 * vol);
    this._noiseHit(t + 0.08, 0.12, 0.012 * vol, 'highpass', 7000);
  }

  /** Tarefa: teclado bem baixinho (vibecoder), motor do carro (uber). Respeita o limite de 10/s. */
  task(kind = 'type') {
    if (!this.ctx) return;
    const now = performance.now();
    this.repTimes = this.repTimes.filter((x) => now - x < 1000);
    if (this.repTimes.length >= 10) return;
    this.repTimes.push(now);
    const t = this.ctx.currentTime + 0.001;
    if (kind === 'type') {
      for (let i = 0; i < 3; i++) this._noiseHit(t + i * 0.035, 0.02, 0.035, 'bandpass', rand(2400, 3600), 2);
    } else if (kind === 'drive') {
      // Motor do Subaru acelerando um tiquinho + pneu na pista
      this._osc('sawtooth', rand(62, 78), rand(88, 104), t, 0.14, 0.035);
      this._noiseHit(t, 0.09, 0.025, 'lowpass', 520);
    } else {
      this._noiseHit(t, 0.05, 0.05, 'lowpass', 700);
      this._osc('sine', rand(180, 220), 120, t, 0.06, 0.05);
    }
  }

  /** Ding do app (fim da corrida). */
  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const d of [0, 0.11]) {
      this._osc('sine', 2637, 2600, t + d, 0.32, 0.05);
      this._osc('sine', 3951, 3900, t + d, 0.2, 0.02);
    }
  }

  promotion() {
    if (!this.ctx || this._buffer('promotion', 0.8)) return;
    const t = this.ctx.currentTime;
    [67, 72, 76, 79, 84].forEach((n, i) => this._osc('triangle', NOTE(n), null, t + i * 0.07, 0.3, 0.1));
    this._osc('square', NOTE(91), null, t + 0.36, 0.4, 0.03);
  }

  /** Apito do Cleiton ("SÓ MAIS UMA!"). Baixinho. */
  whistle() {
    if (!this.ctx || this._buffer('whistle', 0.5)) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 38;
    lg.gain.value = 90;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.value = 2900;
    const g = this.ctx.createGain();
    this._env(g, t, 0.01, 0.035, 0.32);
    o.connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.4);
    lfo.stop(t + 0.4);
  }

  /** "Kira~" da waifu (brilho suave). */
  kira() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [96, 100, 103, 108].forEach((n, i) => this._osc('sine', NOTE(n), null, t + i * 0.045, 0.3, 0.025));
  }

  bug() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._osc('square', 220, 140, t, 0.12, 0.03);
    this._osc('square', 160, 90, t + 0.09, 0.12, 0.025);
  }

  // ── Música e ambiente ────────────────────────────────────────────
  /** Liga o rádio da garagem: lo-fi procedural saindo de um alto-falante 3D. */
  startGarageAmbience(radioPos, gatePos) {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    // Rádio (posicional)
    this.radioPanner = this._panner(radioPos, 2, 22);
    const radioFilter = ctx.createBiquadFilter();
    radioFilter.type = 'bandpass';
    radioFilter.frequency.value = 1300;
    radioFilter.Q.value = 0.45;
    this.radioIn = ctx.createGain();
    this.radioIn.gain.value = 0.9;
    this.radioIn.connect(radioFilter).connect(this.radioPanner).connect(this.music);
    if (this.buffers.music_garagem) {
      const s = ctx.createBufferSource();
      s.buffer = this.buffers.music_garagem;
      s.loop = true;
      s.connect(this.radioIn);
      s.start();
    } else {
      this._startLofi(this.radioIn);
    }
    // Rua: trânsito distante + grilos ao entardecer
    const street = this._panner(gatePos, 3, 40);
    street.connect(this.ambient);
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    s.connect(lp).connect(g).connect(street);
    s.start();
    this.streetOut = street;
    this._cricketTimer = setInterval(() => this._cricket(), 2600);
  }

  _panner(pos, ref, max) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = max;
    p.rolloffFactor = 1.1;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    return p;
  }

  _cricket() {
    if (!this.ctx || !this.streetOut || this.ctx.state !== 'running') return;
    if (Math.random() < 0.35) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this._osc('sine', 4600 + rand(-150, 150), null, t + i * 0.06, 0.04, 0.012, this.streetOut);
  }

  _startLofi(dest) {
    // Progressão Fmaj7 – Em7 – Dm7 – Cmaj7 a 78 BPM, piano elétrico + bateria macia.
    const ctx = this.ctx;
    const bpm = 78;
    const beat = 60 / bpm;
    const chords = [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [48, 52, 55, 59],
    ];
    const bass = [41, 40, 38, 36];
    const out = ctx.createGain();
    out.gain.value = 0.55;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 2400;
    out.connect(warm).connect(dest);
    let next = ctx.currentTime + 0.1;
    let step = 0;
    const ep = (n, t, d, v) => {
      const o = ctx.createOscillator();
      const m = ctx.createOscillator();
      const mg = ctx.createGain();
      o.type = 'sine';
      m.type = 'sine';
      o.frequency.value = NOTE(n);
      m.frequency.value = NOTE(n) * 2;
      mg.gain.value = NOTE(n) * 0.6;
      m.connect(mg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      m.start(t);
      o.stop(t + d + 0.05);
      m.stop(t + d + 0.05);
    };
    const tick = () => {
      if (!this.ctx) return;
      while (next < ctx.currentTime + 0.4) {
        const bar = Math.floor(step / 8) % 4;
        const s8 = step % 8;
        const t = next + (s8 % 2 ? 0.035 : 0); // swing
        if (s8 === 0 || s8 === 5) for (const n of chords[bar]) ep(n, t, beat * 1.8, 0.03);
        if (s8 === 0 || s8 === 3 || s8 === 6) {
          this._osc('triangle', NOTE(bass[bar]), null, t, beat * 0.9, 0.08, out);
        }
        if (s8 === 0 || s8 === 4) this._osc('sine', 110, 45, t, 0.18, 0.18, out); // bumbo
        if (s8 === 2 || s8 === 6) this._noiseHit(t, 0.12, 0.05, 'bandpass', 1800, 0.8, out); // caixa
        this._noiseHit(t, 0.03, 0.015, 'highpass', 7000, 0.7, out); // chimbal
        if (Math.random() < 0.18 && s8 % 2 === 0) ep(chords[bar][Math.floor(Math.random() * 4)] + 12, t + beat * 0.25, beat, 0.025);
        next += beat / 2;
        step++;
      }
    };
    this._lofiTimer = setInterval(tick, 120);
    tick();
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.05);
      l.positionY.setTargetAtTime(p.y, t, 0.05);
      l.positionZ.setTargetAtTime(p.z, t, 0.05);
      l.forwardX.setTargetAtTime(f.x, t, 0.05);
      l.forwardY.setTargetAtTime(f.y, t, 0.05);
      l.forwardZ.setTargetAtTime(f.z, t, 0.05);
      l.upX.setTargetAtTime(u.x, t, 0.05);
      l.upY.setTargetAtTime(u.y, t, 0.05);
      l.upZ.setTargetAtTime(u.z, t, 0.05);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  /** Abaixa a música durante diálogos/encontros. */
  duck(on) {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(on ? this.settings.music * 0.18 : this.settings.music * 0.5, this.ctx.currentTime, 0.3);
  }
}
