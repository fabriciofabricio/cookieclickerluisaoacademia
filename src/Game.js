import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RenderPipeline } from './render/Renderer.js';
import { CameraRig } from './render/CameraRig.js';
import { Particles } from './render/Particles.js';
import { FloatingText } from './render/FloatingText.js';
import { glowTexture } from './render/ProceduralTextures.js';
import { AssetLoader } from './assets/AssetLoader.js';
import { AudioManager } from './audio/AudioManager.js';
import { Input } from './core/Input.js';
import { bus } from './core/EventBus.js';
import { fmt, fmtTime, fmtMoney } from './core/format.js';
import { clamp, damp, isTouch, todayKey, daysBetween, pick, esc } from './core/utils.js';
import { loadState, saveState, defaultState, loadSettings, saveSettings, exportSave, importSave, wipeSave } from './core/GameState.js';
import { BALANCE, MUSCLES, TRAINABLE, SPLITS, levelCost, gymOf } from './config/balance.js';
import { GYMS, machineDef } from './config/gyms.js';
import { LEVELS, EXAMS } from './config/story.js';
import { STR, t, muscleName, upper, hostStr, gymCompleteTitle } from './i18n/pt-BR.js';
import { GarageGym } from './world/GarageGym.js';
import { IronTemple } from './world/IronTemple.js';
import { createRig, Actor } from './characters/Character.js';
import { visualFromLevel, stageIndex } from './characters/ProceduralRig.js';
import { Training, rankCost } from './systems/Training.js';
import * as Eco from './systems/Economy.js';
import * as Prog from './systems/Progression.js';
import { HUD, WorldPrompts } from './ui/HUD.js';
import { Dialogue, Modal } from './ui/Dialogue.js';
import { Menu } from './ui/Menu.js';
import { Mirror } from './ui/Mirror.js';
import { Minimap } from './ui/Minimap.js';
import { Joystick } from './ui/Joystick.js';
import { DebugMenu } from './ui/Debug.js';
import { Story } from './systems/Story.js';
import { WorldEvents } from './systems/WorldEvents.js';
import { Jobs } from './systems/Jobs.js';
import { Companions } from './systems/Companions.js';
import * as MT from './systems/Metodo.js';
import * as CR from './systems/CompanionRules.js';
import { FREE_NODE } from './config/metodo.js';
import { PLAYABLE_JOBS } from './config/jobs.js';
import { COMPANIONS } from './config/companions.js';
import { WorkCorner } from './world/WorkCorner.js';
import { UberCar } from './world/UberCar.js';
import { ensureRiders } from './systems/jobs/uber.js';
import { MetodoScreen } from './ui/MetodoScreen.js';
import { WorkPanel } from './ui/WorkPanel.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const MUSCLE_ICON = { peito: 'P', costas: 'C', ombros: 'O', biceps: 'B', triceps: 'T', abdomen: 'A', pernas: 'Pe', panturrilhas: 'Pa', resistencia: '♥', carisma: '★' };

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.bus = bus;
    this.state = loadState() ?? defaultState();
    this.isNew = this.state.totals.reps === 0 && !this.state.story.introSeen;
    this.settings = loadSettings();
    this.mods = Prog.computeMods(this.state);
    this.timeScale = 1;
    this.mode = 'title'; // title | play | train | work | dialogue | mirror | cutscene | minigame
    this.hold = { active: false, t: 0 };
    this.uiTimer = 0;
    this.saveTimer = 0;
    this.activeRate = 0; // Ganhos/s vindos de clique (média móvel)
    this._activeAcc = 0;
    this.visCur = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
    this.npcs = {};
    this.heldProps = [];
  }

  // ════════════════════════════════════════════════════════════════
  //  Inicialização
  // ════════════════════════════════════════════════════════════════
  async init(progress = () => {}) {
    progress(0.05);
    this.renderer = new RenderPipeline(this.canvas);
    this.scene = new THREE.Scene();
    // Neblina do entardecer: o bairro some suavemente no horizonte (sem "fim do mundo")
    this.scene.fog = new THREE.Fog(0x4a3352, 30, 150);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.08, 500);
    this.camRig = new CameraRig(this.camera);
    this.camRig.shakeEnabled = this.settings.shake;
    this.loader = new AssetLoader(this.renderer.renderer);
    this.audio = new AudioManager(this.loader);
    this.audio.apply(this.settings);

    // Iluminação de ambiente: HDRI real se existir, senão RoomEnvironment.
    const pmrem = new THREE.PMREMGenerator(this.renderer.renderer);
    const hdr = await this.loader.loadHDRI('garagem');
    if (hdr) {
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environmentIntensity = 0.5;
    } else {
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.22;
    }
    progress(0.15);

    // Academia
    // A academia vem do save (a viagem entre academias salva e recarrega a página)
    const gymId = GYMS[this.state.story.gym] ? this.state.story.gym : 'garagem';
    this.gymDef = GYMS[gymId];
    this.world = gymId === 'iron' ? new IronTemple(this.loader, this.renderer.q) : new GarageGym(this.loader, this.renderer.q);
    await this.world.build();
    this.scene.add(this.world.group);
    this.workCorner = new WorkCorner(this.world, this.gymDef);
    this.camRig.setEnvironment({ colliders: this.world.cameraColliders, ceilings: this.gymDef.ceilings, floorY: 0 });
    progress(0.55);

    // Personagens
    this.clips = await this.loader.loadAnimations();
    await this._spawnCharacters();
    // Subaru Legacy azul do Uber (estacionado na rua) + a cena interna da câmera do carro
    this.uberCar = new UberCar({ scene: this.scene, def: this.gymDef.uberSpot, loader: this.loader, clips: this.clips });
    progress(0.8);

    // Efeitos
    const glow = glowTexture(64);
    this.particles = new Particles(this.scene, glow);
    this.floaters = new FloatingText(this.scene);
    this.raycaster = new THREE.Raycaster();

    // Sistemas
    this.training = new Training(this.state, bus);
    this.story = new Story(this);
    this.events = new WorldEvents(this);
    this.jobs = new Jobs(this);
    this.companions = new Companions(this);

    // UI
    this._buildUI();
    this._bindEvents();
    this.renderer.setScene(this.scene, this.camera);
    this.renderer.setQuality(this.settings.quality);
    this.renderer.onAutoDowngrade = (q) => this.hud.toast(`${STR.settings.graphics}: ${STR.settings.quality[q]}`, 'blue');
    this._updateParticleScale();
    window.addEventListener('resize', () => this._updateParticleScale());

    // Estado inicial do mundo
    for (const m of this.gymDef.machines) this.world.setMachineLevel(m.id, this.state.machines[m.id].upgrade);
    for (const [id, n] of Object.entries(this.state.generators)) this._applyGeneratorVisual(id, n);
    this.syncWorkStations();
    this.workCorner.setJob(this.jobs.isUnlocked('vibecoder') ? 'vibecoder' : null);
    if (this.jobs.isUnlocked('uber')) this.uberCar.warm();
    this._applyWorkVisuals();
    this._applyBodyStage(true);
    for (const m of MUSCLES) this.visCur[m] = visualFromLevel(this.state.muscles[m].level, BALANCE.visualStages);
    this.luisao.rig.setMuscles(this.visCur);

    const sp = this.gymDef.spawn;
    this.luisao.place(sp.x, sp.z, sp.yaw);
    this.camRig.yaw = sp.yaw + Math.PI;
    this.camRig.follow(() => this.luisao.pos);
    this.camRig.pos.set(sp.x, 3.2, sp.z + 5);

    // Salvar ao fechar a aba
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });

    this.clock = new THREE.Clock();
    progress(1);
    this._loop();
  }

  _updateParticleScale() {
    const h = this.renderer.renderer.domElement.height;
    this.particles.setScale(h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  async _spawnCharacters() {
    const make = async (key, extra, opts) => {
      const rig = await createRig(key, this.loader, this.clips, extra);
      const a = new Actor(rig, opts);
      this.scene.add(rig.object3D);
      return a;
    };
    const P = BALANCE.player;
    this.luisao = await make('luisao', {}, { radius: P.radius, walkSpeed: P.walkSpeed, runSpeed: P.runSpeed, name: 'luisao' });
    const n = this.gymDef.npcs;
    this.npcs.matheus = await make('matheus', {}, { name: 'matheus' });
    this.npcs.matheus.place(n.matheus.pos[0], n.matheus.pos[1], n.matheus.yaw);
    this.npcs.matheus.home = { x: n.matheus.pos[0], z: n.matheus.pos[1], yaw: n.matheus.yaw };
    // "seuze" é o slot do dono da academia: Seu Zé na garagem, Dona Ivone no Iron
    this.npcs.seuze = await make(this.gymDef.host === 'ivone' ? 'ivone' : 'seuze', {}, { name: 'seuze' });
    this.npcs.seuze.place(n.seuze.pos[0], n.seuze.pos[1], n.seuze.yaw);
    this.npcs.seuze.idleState = this.gymDef.hostIdle ?? 'sit';
    this.npcs.seuze.home = { x: n.seuze.pos[0], z: n.seuze.pos[1], yaw: n.seuze.yaw };
    const social = this.gymDef.socialLooks ?? { a: 'vizinha', b: 'vizinho' };
    this.npcs.vizinha = await make(social.a, {}, { name: 'vizinha' });
    this.npcs.vizinha.place(n.neighborA.pos[0], n.neighborA.pos[1], n.neighborA.yaw);
    this.npcs.vizinha.idleState = 'talk';
    this.npcs.vizinho = await make(social.b, {}, { name: 'vizinho' });
    this.npcs.vizinho.place(n.neighborB.pos[0], n.neighborB.pos[1], n.neighborB.yaw);
    this.npcs.vizinho.idleState = 'talk';
    // Passantes na calçada do outro lado da rua
    this.passersby = [];
    for (let i = 0; i < 2; i++) {
      const p = await make('passante', { top: [0x3aa37a, 0xd8a03a][i], skin: [0xb07a55, 0xe0b090][i], female: i === 1, hairStyle: i === 1 ? 'ponytail' : 'short', bottomStyle: i === 1 ? 'skirt' : 'pants' }, { walkSpeed: 1.3, name: 'passante' });
      const z = (this.gymDef.passersbyZ ?? 16.4) + i * 0.5;
      p.place(i ? 14 : -14, z, i ? -Math.PI / 2 : Math.PI / 2);
      p.patrol = { a: -16, b: 16, z, dir: i ? -1 : 1 };
      this.passersby.push(p);
    }
    // Enfeites da academia: o Brayan no espelho e gente treinando (não são clicáveis)
    this.extras = [];
    if (n.brayan) {
      const b = await make('brayan', {}, { name: 'brayanDecor' });
      b.place(n.brayan.pos[0], n.brayan.pos[1], n.brayan.yaw);
      b.idleState = 'flex';
      this.extras.push(b);
    }
    for (const ex of this.gymDef.extras ?? []) {
      const a = await make(ex.look, {}, { name: 'extra' });
      a.place(ex.pos[0], ex.pos[1], ex.yaw);
      a.idleState = ex.state;
      a.autoRepEvery = ex.rep ?? 0;
      a.autoRep = Math.random() * (ex.rep ?? 1);
      this.extras.push(a);
    }
    for (const a of [this.luisao, ...Object.values(this.npcs), ...this.passersby]) {
      a.rig.object3D.traverse((c) => {
        if (c.isMesh) c.userData.actor = a.name;
      });
    }
  }

  /** NPC do "Parceiro de treino" aparece quando comprado. */
  async _ensureParceiro() {
    if (this.npcs.parceiro || this._parceiroLoading) return;
    this._parceiroLoading = true;
    const rig = await createRig('passante', { top: 0xff8f3a, hairStyle: 'short', skin: 0xc8946e, height: 0.9, build: 0.2, bottomStyle: 'shorts' }, this.clips);
    const a = new Actor(rig, { name: 'parceiro' });
    this.scene.add(rig.object3D);
    a.place(-4.6, 6.4, Math.PI * 0.85);
    a.idleState = 'jacks';
    a.autoRep = 0;
    this.npcs.parceiro = a;
  }

  _applyGeneratorVisual(id, n) {
    if (id === 'g_parceiro') {
      if (n > 0 && this.gymDef.id === 'garagem') this._ensureParceiro();
    } else {
      this.world.setGeneratorVisual(id, n);
    }
  }

  _buildUI() {
    const root = this.uiRoot;
    this.hud = new HUD(root, {
      onRepDown: () => this.repPress(),
      onRepUp: () => this.repRelease(),
      onLeave: () => this.stopTraining(),
      onMenu: () => {
        this.audio.ui();
        this.menu.toggle();
      },
      onMute: () => this.setSetting('muted', !this.settings.muted),
      onGoalClick: () => this.menu.isOpen || this.openMirror(),
      onReqItem: (id) => (id === 'matheus' ? this.goToNpc('matheus') : this.goToMuscle(id)),
      onGo: () => this.story.startGoal(),
      onFuria: () => this.activateFuria(),
      onWater: () => this.companions.drinkWater(),
      onGuided: () => {
        const c = this.companions.guidedChip();
        if (c) this.goToMachine(c.machineId);
      },
    });
    this.hud.setMuted(this.settings.muted);
    this.prompts = new WorldPrompts(this.hud.prompts);
    this.dialogue = new Dialogue(root, {
      sfx: () => this.audio.ctx && Math.random() < 0.5 && this.audio._osc('triangle', 600 + Math.random() * 200, null, this.audio.ctx.currentTime, 0.025, 0.012),
      onLine: (line) => this.story.onDialogueLine(line),
    });
    this.modal = new Modal(root);
    this.menu = new Menu(root, this);
    this.metodoUI = new MetodoScreen(root, this);
    this.workPanel = new WorkPanel(root, this);
    // Película preta pro "corte" ao entrar/sair do carro
    this.fadeEl = document.createElement('div');
    this.fadeEl.id = 'cutfade';
    root.appendChild(this.fadeEl);
    this.mirror = new Mirror(root, this);
    this.minimap = new Minimap(this.hud.minimapCanvas, this.gymDef, (id) => (id === 'work' ? this.goToWork('uber') : id === 'desk' ? this.goToWork('vibecoder') : this.goToMachine(id)));
    this.joystick = new Joystick(root, this.input ?? (this.input = new Input(this.canvas)));
    this.joystick.setVisible(isTouch());
    this.debug = new DebugMenu(root, this);
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.fpsEl.className = this.settings.showFps ? '' : 'hidden';
    root.appendChild(this.fpsEl);
  }

  _bindEvents() {
    const input = this.input;
    input.on('drag', (dx, dy) => {
      if (this.mode === 'play' || this.mode === 'mirror') this.camRig.onDrag(dx, dy);
    });
    input.on('zoom', (d) => this.camRig.onZoom(d));
    input.on('tap', (x, y) => this._onTap(x, y));
    input.on('key', (code) => this._onKey(code));
    input.on('keyup', (code) => {
      if (code === 'Space') {
        this.repRelease();
        this.workRelease();
      }
    });

    bus.on('rep', (r) => this._onRep(r));
    bus.on('muscleLevel', (e) => this._onMuscleLevel(e));
    bus.on('stageUp', (e) => this._onStageUp(e));
    bus.on('rankUp', (e) => {
      this.audio.rankUp();
      const pix = this.jobs.rankStipend();
      this.hud.banner(t('hud.rankUp', { n: e.rank + 1 }), pix > 0 ? t('hud.rankUpSubPix', { n: fmtMoney(pix) }) : STR.hud.rankUpSub, 'blue');
      this.particles.sparkle(this.luisao.rig.headWorld, 30, 0x4fd1ff, 2.2);
    });
    bus.on('newPR', (e) => {
      this.audio.pr();
      this.companions.onPR();
      if (this.mods.rivalidade) {
        const n = Math.max(30, (Eco.passiveGps(this.state, this.mods) + this.activeRate) * 30);
        this.state.ganhos += n;
        this.state.totalGanhos += n;
        this.hud.toast(`🥤 +${fmt(n)} 💪`, 'gold');
      }
      this.hud.toast(`🎆 ${STR.hud.newPR} ${STR.machines[e.machine.id].name}: ${e.reps} ${STR.hud.reps}`, 'gold', 3200);
      const m = this.world.machines.get(e.machine.id);
      for (let i = 0; i < 3; i++) setTimeout(() => this.particles.sparkle(_v.copy(m.pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.6 + Math.random(), (Math.random() - 0.5) * 1.5)), 26, [0xff4f7b, 0x4fd1ff, 0xffd34d][i], 2.8), i * 220);
    });
    bus.on('splitDone', ({ pair }) => {
      this.hud.banner(t('hud.splitDone', { letter: pair.letter }), STR.hud.splitBonus + ' • 60s', 'blue');
      this.hud.toast(this.host().splitDone, 'blue');
      this.audio.fanfare();
      this.particles.confettiBurst(_v.copy(this.luisao.pos).add(new THREE.Vector3(0, 2, 0)), 60);
    });
    bus.on('splitRotate', ({ pair }) => this.hud.toast(this.host().splitAnnounce.replace('{a}', muscleName(pair.a)).replace('{b}', muscleName(pair.b)), 'blue', 4200));
    bus.on('cap', ({ machine }) => {
      this.hud.toast(`⚠ ${STR.hud.cap}`, 'gold', 3600);
      this.audio.creak();
      this.world.creak(machine.id);
      setTimeout(() => this.hud.toast(this.host().capJoke), 900);
    });
    bus.on('capCreak', ({ machine }) => {
      this.audio.creak();
      this.world.creak(machine.id);
    });
    bus.on('missionComplete', (ms) => this.events.completeMission(ms));
    bus.on('trait', (e) => this.companions.onTrait(e.id));
    this._bindWorkEvents();
  }

  /** Eventos do trabalho (promoção, features, bugs, MRR...). */
  _bindWorkEvents() {
    const J = STR.jobs;
    const L = () => this.luisao.rig.headWorld.add(new THREE.Vector3(0, 0.55, 0));
    bus.on('task', (r) => this._onTask(r));
    bus.on('promotion', ({ id, cargo }) => {
      this.audio.promotion();
      this.hud.banner(J.common.promoted, t('jobs.common.promotedSub', { title: J[id].cargos[cargo - 1] }), 'green');
      this.particles.confettiBurst(_v.copy(this.luisao.pos).add(new THREE.Vector3(0, 2, 0)), 70);
      this._applyWorkVisuals();
    });
    bus.on('cargoCapped', ({ id }) => this.hud.toast(`📈 ${t('jobs.common.capped', { job: J[id].name, gym: STR.gyms[this.state.story.gym].name })}`, 'gold', 5200));
    bus.on('jobUnlocked', ({ id, announce }) => {
      this.audio.fanfare();
      this.syncWorkStations();
      this._applyWorkVisuals();
      if (id === 'uber') this.uberCar.warm();
      if (announce && J[id]) {
        this.hud.banner(J.common.unlocked, `${J[id].name} • ${J[id].app}`, 'green');
        if (J[id].unlockedBy) this.hud.toast(`💻 ${J[id].unlockedBy}`, 'blue', 6500);
      }
    });
    bus.on('jobUpgrade', () => this._applyWorkVisuals());
    bus.on('jobEvent', ({ kind }) => {
      this.hud.toast(`${kind === 'chuva' ? '🌧' : '⏰'} ${J.uber.events[kind]}`, 'blue', 4200);
      this.audio.hit();
    });
    bus.on('feature', ({ name, gained, client, saturated }) => {
      this.hud.banner(J.vibecoder.feature, name, 'blue');
      this.audio.fanfare();
      if (gained > 0) setTimeout(() => this.hud.toast(`🏢 ${t('jobs.vibecoder.newClient', { client })}`, 'green', 4000), 700);
      else if (saturated) setTimeout(() => this.hud.toast(`📊 ${J.vibecoder.saturated}`, 'pink', 5200), 700);

    });
    bus.on('mrr', ({ n }) => {
      this.audio.pix(0.7);
      this.hud.toast(`💸 ${t('jobs.vibecoder.mrr', { n: fmtMoney(n) })}`, 'green', 2600);
    });
    bus.on('bug', ({ name }) => {
      this.audio.bug();
      if (this.mode === 'work') this.floaters.spawn('🐞 BUG!', L(), 'crit');
      this.hud.toast(`🐞 ${t('jobs.vibecoder.bug', { name })}`, 'pink', 3600);
    });
    bus.on('bugHit', ({ hits, need }) => {
      // Retorno a cada clique no bug (antes só aparecia no 3º)
      this.audio.task('type');
      this.floaters.spawn(`🔧 ${hits}/${need}`, this.luisao.rig.headWorld.add(new THREE.Vector3(0.3, 0.45, 0)), 'info');
    });
    bus.on('bugFixed', ({ auto }) => {
      this.audio.hit();
      this.hud.toast(`✅ ${auto ? J.vibecoder.bugAuto : J.vibecoder.bugFixed}`, 'green', 2400);
    });
    bus.on('incident', () => {
      this.audio.miss();
      this.camRig.addShake(0.4);
      this.hud.toast(`🔥 ${J.vibecoder.incident}`, 'pink', 4200);
    });
    bus.on('sextaOk', () => this.hud.toast(`🙏 ${J.vibecoder.sextaOk}`, 'green', 4200));
    bus.on('bigClient', () => this.hud.toast(`🤝 ${J.vibecoder.bigClient}`, 'gold', 4200));
    bus.on('churn', () => this.hud.toast(`📉 ${J.vibecoder.churn}`, 'pink', 4200));
    bus.on('decision', () => this.audio.ui());
    bus.on('descansoAtivo', ({ sec }) => this.hud.toast(`💚 ${t('jobs.common.descanso', { s: sec })}`, 'green', 4200));
  }

  _onTask(r) {
    this.companions.onTask(r);
    const pos = this.luisao.rig.headWorld.add(new THREE.Vector3(0.25, 0.5, 0));
    if (r.id === 'vibecoder') {
      const vb = this.jobs.job('vibecoder');
      this.workCorner.setTerminal(vb.cc, vb.ccN);
      if (r.source !== 'auto') this.audio.task('type');
      this.floaters.spawn(`+${fmtMoney(r.pay)}`, pos, r.caf ? 'pump' : 'money');
    } else if (r.id === 'uber') {
      this.uberCar.kick();
      if (r.kind === 'ride') {
        // Corrida concluída: o grupo desce (com a nota), o próximo já embarca
        this.audio.bell();
        this.audio.pix(r.tip ? 1 : 0.6);
        const who = r.who.map((w) => w.name).join(', ');
        const stars = '★'.repeat(r.rating);
        this.floaters.spawn(`${r.tip ? '💸 ' + STR.jobs.uber.tipped + ' ' : ''}${stars} +${fmtMoney(r.pay)}`, pos, r.tip ? 'crit' : 'money');
        if (r.tip) this.hud.toast(`🚗 ${t('jobs.uber.rated', { stars: r.rating, who, n: fmtMoney(r.pay) })}`, 'gold', 2600); // só a gorjeta vira aviso (senão enche a tela a cada corrida)
        this.uberCar.setRiders(this.jobs.job('uber').riders);
      } else if (r.source !== 'auto') this.audio.task('drive');
    } else if (r.source !== 'auto') this.audio.task('pedal');
    if (r.cafStarted) this.hud.toast(`☕ ${STR.jobs.common.cafezinho}`, 'gold', 2200);
    if (r.yield < 0.6 && !this._mindWarned) {
      this._mindWarned = true;
      this.hud.toast(`🧠 ${STR.jobs.common.tired}`, 'pink', 4200);
    }
    if (r.yield > 0.9) this._mindWarned = false;
    this.luisao.rig.rep(0.35);
  }

  /** O canto do Matheus reflete o dinheiro investido no Método. */
  _applyWorkVisuals() {
    this.workCorner.setMatheusStage(Math.min(3, MT.matheusStage(this.state)));
  }

  /** Falas e nome do dono da academia atual (Seu Zé / Dona Ivone). */
  host() {
    return hostStr(this.gymDef.host);
  }

  /**
   * Viagem pra próxima academia: muda o save, salva e recarrega a página (a tela de
   * carregamento é a "viagem"). Na volta, a cena de chegada roda em begin().
   */
  travelTo(gym) {
    if (!GYMS[gym]) return;
    const st = this.state.story;
    st.gym = gym;
    st.phase = 'train';
    st.matheusTalked = false;
    st.levelStartedAt = this.state.playTime;
    st.arrived = { ...(st.arrived ?? {}), [gym]: false };
    this.state.flags.quaseLa = {};
    this.save();
    this.mode = 'cutscene';
    const f = this.fadeEl;
    if (f) {
      f.innerHTML = `<div class="travel-card">${t('travel.loading', { gym: STR.gyms[gym].name })}</div>`;
      f.style.transition = 'opacity 600ms ease-in';
      f.style.opacity = '1';
    }
    this._travelling = true;
    setTimeout(() => window.location.reload(), 900);
  }

  /** Cada estação trabalha com um emprego: o carro (Uber) e o caixote com o notebook (Vibecoder). */
  stationFor(jobId) {
    return jobId === 'uber' ? this.uberCar : this.workCorner;
  }

  curStation() {
    return this.stationFor(this.jobs.active ?? this.jobs.current());
  }

  /** Lista [jobId, estação] pra procurar a mais próxima. */
  _stations() {
    return [['uber', this.uberCar], ['vibecoder', this.workCorner]];
  }

  /** Cada estação só destrava quando o emprego dela está liberado. */
  syncWorkStations() {
    if (!this.jobs || !this.uberCar) return;
    this.workCorner.setLocked(!this.jobs.isUnlocked('vibecoder'));
    this.uberCar.setLocked(!this.jobs.isUnlocked('uber'));
  }

  /** O Luisão está dentro do Subaru (câmera interna do carro)? */
  get inCar() {
    return this.mode === 'work' && this.jobs?.active === 'uber';
  }

  // ════════════════════════════════════════════════════════════════
  //  Fluxo de título / começo
  // ════════════════════════════════════════════════════════════════
  async begin() {
    await this.audio.unlock();
    this.audio.startGarageAmbience(this.world.radioPos, new THREE.Vector3(0, 1.5, this.gymDef.size.z1 + 4.5));
    this.mode = 'play';
    this._streak();
    const st = this.state.story;
    if (this.isNew) {
      await this.story.intro();
    } else if (!st.arrived?.[this.gymDef.id]) {
      // Primeira vez nessa academia: tour + boas-vindas
      await this.story.arrival();
    } else {
      this._offline();
      if (st.phase === 'gymDone') this.story.offerTravel();
      else this.story.maybeTeaser();
    }
    this.hud.toast(isTouch() ? STR.game.hintMobile : STR.game.hint, '', 5000);
  }

  _streak() {
    const st = this.state.streak;
    const today = todayKey();
    if (st.lastDay === today) return;
    if (!st.lastDay) st.days = 1;
    else {
      const gap = daysBetween(st.lastDay, today);
      // Sem punição pesada: faltar só reduz pela metade.
      st.days = gap === 1 ? Math.min(BALANCE.streak.maxDays, st.days + 1) : Math.max(1, Math.floor(st.days / 2));
    }
    st.lastDay = today;
    setTimeout(() => this.hud.toast(`🔥 ${t('hud.streak', { n: st.days, pct: Math.round(Math.min(7, st.days) * BALANCE.streak.bonusPerDay * 100) })}`, 'gold', 4200), 1500);
  }

  _offline() {
    const elapsed = (Date.now() - this.state.lastSave) / 1000;
    if (elapsed < BALANCE.offline.minSecToShow) return;
    const off = Eco.offlineEarnings(this.state, elapsed);
    const offMoney = this.jobs.offlineEarnings(elapsed).money;
    if (off.ganhos <= 0 && off.trainPts <= 0 && offMoney <= 0) return;
    if (offMoney > 0) this.jobs.addMoney(offMoney);
    this.state.ganhos += off.ganhos;
    this.state.totalGanhos += off.ganhos;
    let levels = 0;
    let pts = off.trainPts;
    // Treino offline vai distribuindo no ponto fraco, em pedaços
    for (let i = 0; i < 400 && pts > 0; i++) {
      const weak = Prog.weakestMuscle(this.state);
      if (!weak) break;
      const chunk = Math.min(pts, levelCost(weak, this.state.muscles[weak].level) * 0.5);
      levels += this.training.addPoints(weak, chunk * gymOf(this.state.story.gym).progressMult);
      pts -= chunk;
    }
    this.modal.show({
      title: STR.offline.title,
      html: `<p>${t('offline.body', { time: fmtTime(off.sec) })}</p>${levels > 0 ? `<p>${t('offline.trained', { n: levels })}</p>` : ''}${offMoney > 0 ? `<p style="color:var(--green);font-weight:800">💵 ${t('offline.money', { n: fmtMoney(offMoney) })}</p>` : ''}`,
      big: `💪 ${fmt(off.ganhos)}`,
      buttons: [{ text: STR.offline.ok, onClick: () => this.audio.purchase() }],
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  Entrada
  // ════════════════════════════════════════════════════════════════
  _onKey(code) {
    if (code === 'F9') return this.debug.toggle();
    if (this.mode === 'title') return;
    if (code === 'Escape') {
      if (this.modal.open) return;
      if (this.menu.isOpen) return this.menu.close();
      if (this.mode === 'mirror') return this.closeMirror();
      if (this.mode === 'train') return this.stopTraining();
      if (this.mode === 'work') return this.stopWork();
      return;
    }
    if (this.metodoUI.isOpen) return;
    if (code === 'KeyM' || code === 'Tab') return this.menu.toggle();
    if (this.mode === 'train') {
      if (code === 'Space' || code === 'Enter') this.repPress();
      if (code === 'KeyF') this.activateFuria();
      return;
    }
    if (this.mode === 'work') {
      if (code === 'Space' || code === 'Enter') this.workPress();
      return;
    }
    if (this.mode === 'play') {
      if (code === 'KeyE' || code === 'Enter' || code === 'Space') this._interact();
      if (code === 'KeyR') this.openMirror();
    }
  }

  _onTap(x, y) {
    if (this.mode === 'minigame') return this.story.minigameTap?.();
    if (this.mode === 'dialogue' && this.dialogue.active && !this.dialogue.choices.children.length) return this.dialogue._click();
    if (this.mode === 'train') {
      // Clique/toque em qualquer lugar = 1 repetição
      this.doRep('click');
      this.hud.pressFx();
      return;
    }
    if (this.mode === 'work') {
      // Clique/toque em qualquer lugar = 1 tarefa (o Shake Dourado ainda dá pra pegar clicando nele)
      const gg = this.events.golden;
      if (gg) {
        const nd = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(nd, this.camera);
        if (this.raycaster.ray.distanceToPoint(_v.copy(gg.group.position).add(new THREE.Vector3(0, 0.2, 0))) < 0.6) return this.events.collectGolden();
      }
      // O energético é justamente pra pegar trabalhando: clicar nele na tela coleta
      const ee = this.events.energy;
      if (ee) {
        const nd2 = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(nd2, this.camera);
        if (this.raycaster.ray.distanceToPoint(_v.copy(ee.group.position).add(new THREE.Vector3(0, 0.2, 0))) < 0.6) return this.events.collectEnergy();
      }
      this.doWork('click');
      this.workPanel.pressFx();
      return;
    }
    if (this.mode !== 'play' || this.menu.isOpen || this.modal.open) {
      if (this.menu.isOpen) this.menu.close();
      return;
    }
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Shake dourado
    const g = this.events.golden;
    if (g && this.raycaster.ray.distanceToPoint(_v.copy(g.group.position).add(new THREE.Vector3(0, 0.2, 0))) < 0.6) {
      return this.events.collectGolden();
    }
    // Energético
    const en = this.events.energy;
    if (en && this.raycaster.ray.distanceToPoint(_v.copy(en.group.position).add(new THREE.Vector3(0, 0.2, 0))) < 0.6) {
      return this.events.collectEnergy();
    }
    // Máquinas (+ estação de trabalho)
    const hits = [...this.world.machines.values()].map((m) => m.hit);
    for (const [, st] of this._stations()) if (!st.locked) hits.push(st.hit);
    const mh = this.raycaster.intersectObjects(hits, false)[0];
    // NPCs (+ personal esperando no portão)
    const npcMeshes = [];
    for (const [k, a] of Object.entries(this.npcs)) if (['matheus', 'seuze'].includes(k)) a.rig.object3D.traverse((c) => c.isMesh && npcMeshes.push(c));
    const wa = this.companions.waitingActor();
    if (wa) wa.a.rig.object3D.traverse((c) => c.isMesh && npcMeshes.push(c));
    const nh = this.raycaster.intersectObjects(npcMeshes, false)[0];
    if (nh && (!mh || nh.distance < mh.distance)) return this.goToNpc(nh.object.userData.actor);
    if (mh?.object.userData.workStation) return this.goToWork(mh.object.userData.workStation === 'uber' ? 'uber' : 'vibecoder');
    if (mh) return this.goToMachine(mh.object.userData.machineId);
    const fh = this.raycaster.intersectObjects(this.world.floorMeshes, false)[0];
    if (fh) {
      this.luisao.moveTo(fh.point.x, fh.point.z, null, 0.15);
      this.particles.dust(fh.point, 6);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Interação com máquinas / NPCs
  // ════════════════════════════════════════════════════════════════
  _nearest() {
    const p = this.luisao.pos;
    let best = null;
    let bd = BALANCE.player.interactRadius;
    for (const m of this.world.machines.values()) {
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = { type: 'machine', id: m.def.id, m };
      }
    }
    for (const [jobId, w] of this._stations()) {
      if (w.locked) continue;
      const d = Math.hypot(w.pos.x - p.x, w.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = { type: 'work', jobId, m: w };
      }
    }
    const wa = this.companions.waitingActor();
    const npcs = [['matheus', this.npcs.matheus], ['seuze', this.npcs.seuze], ...(wa ? [[wa.id, wa.a]] : [])];
    for (const [k, a] of npcs) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd + 0.2) {
        bd = d;
        best = { type: 'npc', id: k, a };
      }
    }
    return best;
  }

  _interact() {
    const n = this._nearest();
    if (!n) return;
    if (n.type === 'machine') this.startTraining(n.id);
    else if (n.type === 'work') this.startWork(n.jobId);
    else this.story.talkTo(n.id);
  }

  goToMachine(id) {
    if (this.mode === 'train') this.stopTraining();
    if (this.mode === 'work') this.stopWork();
    if (this.mode !== 'play') return;
    const m = this.world.machines.get(id);
    if (!m) return;
    this.luisao.moveTo(m.pos.x, m.pos.z, () => this.startTraining(id), 0.85, true);
  }

  goToMuscle(muscle) {
    if (this.mode === 'mirror') this.closeMirror();
    const def = this.gymDef.machines.find((m) => m.muscle === muscle);
    if (def) this.goToMachine(def.id);
  }

  goToNpc(key) {
    if (this.mode === 'train') this.stopTraining();
    if (this.mode === 'work') this.stopWork();
    const a = this.npcs[key] ?? this.companions.actors[key];
    if (!a || this.mode !== 'play') return;
    this.luisao.moveTo(a.pos.x, a.pos.z, () => this.story.talkTo(key), 1.2, true);
  }

  startTraining(id) {
    if (this.mode !== 'play') return;
    const m = this.world.machines.get(id);
    if (!m) return;
    const L = this.luisao;
    L.cancelMove();
    L.locked = true;
    this.mode = 'train';
    this.trainingMachine = m;
    this.training.start(m.def, { guided: this.companions.consumeGuided(id) });
    // Encaixa na estação
    this._snap = { from: L.pos.clone(), fromYaw: L.yaw, to: m.pos.clone(), toYaw: m.yaw, t: 0 };
    L.rig.setState(m.def.anim === 'talk' ? 'talkRep' : m.def.anim);
    this._attachProps(m, true);
    this.camRig.setShot(m.camPos, m.camLook, 3.2);
    this.hud.showRep(true);
    this.joystick.setVisible(false);
    // Dica de primeira vez do Seu Zé
    if (!this.state.tips[id]) {
      this.state.tips[id] = true;
      this.hud.toast(`${this.host().name}: "${STR.machines[id].tip}"`, 'pink', 6000);
    }
    if (m.def.muscle === 'carisma') {
      this.npcs.vizinha.faceTo = this.luisao.pos;
      this.npcs.vizinho.faceTo = this.luisao.pos;
    }
  }

  stopTraining() {
    if (this.mode !== 'train') return;
    const m = this.trainingMachine;
    this.training.stop();
    this._attachProps(m, false);
    this.repRelease();
    this.trainingMachine = null;
    const L = this.luisao;
    L.locked = false;
    // Sai um passinho pra fora da estação
    const back = new THREE.Vector3(0, 0, -0.6).applyAxisAngle(UP, m.yaw);
    if (m.def.anim === 'pushup') back.set(0, 0, 0).add(new THREE.Vector3(0.7, 0, 0.7).applyAxisAngle(UP, m.yaw));
    if (m.def.anim === 'crunch') back.copy(new THREE.Vector3(0.8, 0, -0.6).applyAxisAngle(UP, m.yaw));
    L.pos.add(back);
    this.world.collide(L.pos, L.radius);
    this.mode = 'play';
    this.camRig.follow();
    this.camRig.yaw = L.yaw + Math.PI;
    this.hud.showRep(false);
    this.joystick.setVisible(isTouch());
    this.npcs.vizinha.faceTo = null;
    this.npcs.vizinho.faceTo = null;
  }

  // ════════════════════════════════════════════════════════════════
  //  Trabalho (estação do caixote)
  // ════════════════════════════════════════════════════════════════
  goToWork(jobId) {
    if (this.mode === 'train') this.stopTraining();
    if (this.mode !== 'play' || !this.jobs.anyUnlocked()) return;
    const id = jobId ?? this.jobs.current();
    const w = id && this.jobs.isUnlocked(id) ? this.stationFor(id) : null;
    if (!w || w.locked) return;
    this.jobs.setActive(id);
    this.luisao.moveTo(w.pos.x, w.pos.z, () => this.startWork(id), 0.85, true);
  }

  startWork(jobId) {
    const id = jobId ?? this.jobs.current();
    if (this.mode !== 'play' || !id || !this.jobs.isUnlocked(id)) return;
    const w = this.stationFor(id);
    if (!w || w.locked) return;
    const L = this.luisao;
    L.cancelMove();
    L.locked = true;
    this.mode = 'work';
    this.jobs.startSession(id);
    if (id === 'uber') {
      this._enterCar();
    } else {
      this._snap = { from: L.pos.clone(), fromYaw: L.yaw, to: w.seatPos.clone(), toYaw: w.yaw, t: 0 };
      L.rig.setState('typing');
      this.camRig.setShot(w.camPos, w.camLook, 3.2);
      this.workCorner.setJob(id, true);
    }
    this.hud.showRep(false);
    this.workPanel.show(true);
    this.joystick.setVisible(false);
    if (!this.state.flags.workHint) {
      this.state.flags.workHint = true;
      this.hud.toast(`💼 ${STR.jobs[id].desc}`, 'green', 6500);
    }
  }

  stopWork() {
    if (this.mode !== 'work') return;
    this.workRelease();
    const wasCar = this.jobs.active === 'uber';
    this.jobs.endSession();
    const L = this.luisao;
    L.locked = false;
    if (wasCar) {
      this._exitCar();
    } else {
      this.workCorner.setJob(this.jobs.active, false);
      L.pos.add(new THREE.Vector3(0, 0, -0.55).applyAxisAngle(UP, this.workCorner.yaw));
      this.world.collide(L.pos, L.radius);
      L.rig.setState('idle');
      this.camRig.follow();
      this.camRig.yaw = L.yaw + Math.PI;
    }
    this.mode = 'play';
    this.workPanel.show(false);
    this.joystick.setVisible(isTouch());
  }

  // ── Dentro do Subaru: câmera interna, Luisão dirigindo, passageiros ──
  _enterCar() {
    const car = this.uberCar;
    const L = this.luisao;
    this._snap = null;
    car.setActive(true);
    const js = this.jobs.job('uber');
    car.setRiders(ensureRiders(js), true);
    car.attachDriver(L.rig);
    L.place(car.driverPos.x, car.driverPos.z, car.driverYaw);
    L.rig.setState('driving');
    // Corte seco pra dentro do carro (a cena fica longe do bairro): sem viajar a câmera pelo mapa
    this.camRig.setShot(car.camPos, car.camLook, 8);
    this.camRig.pos.copy(car.camPos);
    this.camRig.look.copy(car.camLook);
    this.camRig.fovBase = this._carFov();
    this._cutFade();
    this.events.carryEnergy(true);
    this.audio.ui();
  }

  _exitCar() {
    const car = this.uberCar;
    const L = this.luisao;
    car.detachDriver();
    car.setActive(false);
    car.setRain(false);
    this.events.carryEnergy(false);
    L.place(car.pos.x, car.pos.z, car.yaw);
    L.rig.setState('idle');
    this.camRig.follow();
    this.camRig.yaw = L.yaw + Math.PI;
    this.camRig.pos.set(L.pos.x, 3.2, L.pos.z + 5);
    this.camRig.look.set(L.pos.x, 1.2, L.pos.z);
    this.camRig.fovBase = 50;
    this._cutFade();
    this.audio.ui();
  }

  /** FOV da câmera interna: mais aberto em telas estreitas pra caber motorista e passageiros. */
  _carFov() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(48)) / aspect);
    return clamp(THREE.MathUtils.radToDeg(v), 62, 96);
  }

  /** Fade rápido de preto pra transparente (entrar/sair do carro). */
  _cutFade(ms = 420) {
    const f = this.fadeEl;
    if (!f) return;
    f.style.transition = 'none';
    f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`;
    f.style.opacity = '0';
  }

  workPress() {
    if (this.mode !== 'work') return;
    this.doWork('click');
    this.workHold = { active: true, t: 0 };
  }

  workRelease() {
    if (this.workHold) this.workHold.active = false;
  }

  doWork(source) {
    if (this.mode !== 'work') return;
    this.jobs.task(source);
  }

  workAction(act, arg) {
    if (this.mode !== 'work') return;
    this.jobs.action(this.jobs.active, act, arg);
    this.audio.ui();
  }

  switchWorkJob(id) {
    if (!this.jobs.isUnlocked(id) || id === this.jobs.active) return;
    // Empregos de estações diferentes (carro × caixote): sai de uma e vai pra outra
    if (this.mode === 'work' && this.stationFor(id) !== this.curStation()) {
      this.stopWork();
      this.startWork(id);
      this.audio.ui();
      return;
    }
    this.jobs.setActive(id);
    this.workCorner.setJob(id, this.mode === 'work' && id === 'vibecoder');
    this.audio.ui();
  }

  setMainJob(id) {
    const r = this.jobs.setMain(id);
    if (r.ok) {
      this.audio.purchase();
      this.hud.toast(`✔ ${t('jobs.common.mainSet', { job: STR.jobs[id].name })}`, 'green');
    } else if (r.wait) this.hud.toast(t('jobs.common.mainWait', { s: r.wait }), 'pink');
    return r.ok;
  }

  buyJobUpgrade(id, key) {
    if (!this.jobs.buyUpgrade(id, key)) return false;
    this.audio.purchase();
    this.hud.toast(`🔧 ${STR.jobs[id].upgrades[key].name} → ${STR.hud.level_short} ${this.jobs.upgradeLevel(id, key)}`, 'gold');
    return true;
  }

  // ── Método Neumman ─────────────────────────────────────────────
  buyMetodo(id) {
    const before = MT.matheusStage(this.state);
    if (!MT.buy(this.state, id)) {
      this.audio.miss();
      return false;
    }
    this.audio.pix();
    this.particles.sparkle(this.npcs.matheus.rig.headWorld, 26, 0x5dff9e, 1.6);
    const a = this.npcs.matheus;
    a.idleState = 'celebrate';
    setTimeout(() => (a.idleState = 'idle'), 1300);
    if (MT.matheusStage(this.state) > before) this._applyWorkVisuals();
    this.mods = Prog.computeMods(this.state);
    return true;
  }

  resetMetodo() {
    if (!MT.reset(this.state, FREE_NODE)) return false;
    this.audio.purchase();
    this.mods = Prog.computeMods(this.state);
    return true;
  }

  /** FÚRIA (técnica ativa): x5 por 10+nv s, recarga 120 − 12×nv s. */
  activateFuria() {
    const s = this.state;
    const lv = this.mods.furiaLevel;
    if (!lv || s.playTime < s.cooldowns.furia || this.mode !== 'train') return;
    s.buffs.furiaUntil = s.playTime + 10 + lv;
    s.cooldowns.furia = s.playTime + 120 - 12 * lv;
    this.audio.gymUnlock();
    this.camRig.addShake(0.4);
    this.hud.banner(STR.hud.furiaOn, `${10 + lv}s`, 'pink');
  }

  _attachProps(m, on) {
    const rig = this.luisao.rig;
    for (const h of this.heldProps) rig.detach(h.obj);
    this.heldProps = [];
    const p = m.props;
    if (p.jugs) for (const j of p.jugs) j.visible = !on;
    if (p.bucket) p.bucket.visible = !on;
    if (p.bag) p.bag.visible = !on;
    if (p.floorDumbbells) for (const d of p.floorDumbbells) d.visible = !on;
    if (p.rackBar) p.rackBar.visible = !on;
    if (this._benchBar) {
      this.scene.remove(this._benchBar);
      this._benchBar = null;
    }
    if (m.def.anim === 'treadmill') this.world.setBeltRunning?.(m.def.id, on);
    if (!on) return;
    const hold = (obj, joint, pos, upright, rot) => {
      const wrap = new THREE.Group();
      wrap.add(obj);
      obj.position.set(...pos);
      if (rot) obj.rotation.set(...rot);
      rig.attach(wrap, joint);
      this.heldProps.push({ obj: wrap, upright });
    };
    if (p.handJugs) {
      hold(p.handJugs[0], 'handL', [0, -0.2, 0], true);
      hold(p.handJugs[1], 'handR', [0, -0.2, 0], true);
    }
    if (p.handBucket) hold(p.handBucket, 'handR', [0.1, -0.3, 0.05], true);
    if (p.handBag) hold(p.handBag, 'chest', [0, 0.33, -0.1], false, [0, 0, 0]);
    if (p.handDumbbells) {
      hold(p.handDumbbells[0], 'handL', [0, -0.04, 0], true);
      hold(p.handDumbbells[1], 'handR', [0, -0.04, 0], true);
    }
    if (p.shoulderBar) hold(p.shoulderBar, 'chest', [0, 0.34, -0.13], false, [0, 0, 0]);
    if (p.benchBar) {
      // A barra do supino segue o meio das duas mãos (qualquer que seja a pose)
      this._benchBar = p.benchBar;
      this.scene.add(p.benchBar);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Repetições
  // ════════════════════════════════════════════════════════════════
  repPress() {
    if (this.mode !== 'train') return;
    this.doRep('click');
    this.hold.active = true;
    this.hold.t = 0;
  }

  repRelease() {
    this.hold.active = false;
  }

  doRep(source) {
    if (this.mode !== 'train') return;
    this.training.rep(source);
  }

  _onRep(r) {
    const rig = this.luisao.rig;
    rig.rep(BALANCE.rep.animDuration);
    const isMuscle = MUSCLES.includes(r.id);
    if (isMuscle) rig.setPump(r.id, Math.min(1, (rig.pump?.[r.id] ?? 0) + 0.22));
    // Número flutuante
    const anchor = isMuscle ? rig.muscleAnchor(r.id).getWorldPosition(new THREE.Vector3()) : rig.headWorld;
    const pos = _v2.copy(anchor).add(new THREE.Vector3(0, 0.45, 0));
    if (r.atCap) this.floaters.spawn(`+${fmt(r.ganhos)}`, pos, 'info');
    else if (r.crit) this.floaters.spawn(`${STR.hud.crit} +${fmt(r.ganhos)}`, pos, 'crit');
    else if (r.pump) this.floaters.spawn(`${r.pumpStarted ? STR.hud.pump + ' ' : ''}+${fmt(r.ganhos)}`, pos, 'pump');
    else this.floaters.spawn(`+${fmt(r.ganhos)}`, pos, r.id === 'carisma' ? 'carisma' : 'normal');
    // Partículas
    const head = rig.headWorld;
    if (Math.random() < 0.7) this.particles.sweat(head, 1 + Math.floor(r.fatigue * 4));
    const anim = r.def.anim;
    if (anim === 'pullup' || anim === 'pushup') this.particles.chalk(rig.j.handR.getWorldPosition(_v), 4);
    if (anim === 'squat' || anim === 'jacks' || anim === 'calf') this.particles.dust(this.luisao.pos, 5);
    if (r.crit) {
      this.particles.sparkle(anchor, 22, 0xffd34d, 2.2);
      this.particles.ring(_v.copy(this.luisao.pos).add(new THREE.Vector3(0, 0.1, 0)), 0xffb21f, 30, 3.2);
      this.camRig.addShake(0.32);
      this.camRig.kickFov(2.2);
    }
    if (r.pumpStarted) {
      this.audio.pump();
      this.hud.toast(`💚 ${STR.hud.pump} ${muscleName(r.id)} x2`, 'green', 1600);
    }
    if (r.source !== 'auto') this.audio.rep(r.def.sound, r.crit);
    if (r.soMaisUma) this.floaters.spawn(STR.team.members.cleiton.trait, _v.copy(head).add(new THREE.Vector3(0, 0.9, 0)), 'gold');
    if (r.mega) {
      this.floaters.spawn(STR.hud.mega, _v.copy(head).add(new THREE.Vector3(0, 1, 0)), 'crit');
      this.particles.ring(_v.copy(this.luisao.pos).add(new THREE.Vector3(0, 0.1, 0)), 0xff5a3c, 80, 7);
      this.camRig.addShake(0.8);
      this.timeScale = 0.3;
      setTimeout(() => (this.timeScale = 1), 700);
    }
    this.jobs.onGymRep();
    this.companions.onRep(r);
    this._activeAcc += r.ganhos;
  }

  _onMuscleLevel(e) {
    if (e.id === 'carisma' || e.id === 'resistencia') {
      if (e.active) this.floaters.spawn(t('hud.levelUpMuscle', { muscle: muscleName(e.id), n: e.level }), _v.copy(this.luisao.rig.headWorld).add(new THREE.Vector3(0, 0.7, 0)), 'gold');
      return;
    }
    if (e.active) {
      this.floaters.spawn(t('hud.levelUpMuscle', { muscle: muscleName(e.id), n: e.level }), _v.copy(this.luisao.rig.headWorld).add(new THREE.Vector3(0, 0.75, 0)), 'gold');
      this.particles.sparkle(this.luisao.rig.muscleAnchor(e.id).getWorldPosition(_v), 12, 0x7dffb2, 1.4);
    }
  }

  /** Músculo mudou de estágio visual: close-up, câmera lenta e flex. */
  _onStageUp(e) {
    const name = upper(muscleName(e.id));
    if (!e.active || this.mode !== 'train' || this.trainingMachine?.def.muscle !== e.id) {
      this.hud.toast(`✨ ${t('hud.evolved', { muscle: name })}`, 'green', 2600);
      return;
    }
    if (this._closeup) return;
    this.audio.stageUp();
    this.hud.banner(t('hud.evolved', { muscle: name }), `${STR.hud.level} ${e.level}`, 'green');
    const rig = this.luisao.rig;
    const anchor = rig.muscleAnchor(e.id).getWorldPosition(new THREE.Vector3());
    const facing = new THREE.Vector3(Math.sin(this.luisao.yaw), 0, Math.cos(this.luisao.yaw));
    const back = ['costas', 'triceps', 'panturrilhas'].includes(e.id) ? -1 : 1;
    const camPos = anchor.clone().addScaledVector(facing, 1.15 * back).add(new THREE.Vector3(0.35, 0.15, 0));
    this.camRig.setShot(camPos, anchor, 5);
    this.timeScale = 0.35;
    rig.setPump(e.id, 1);
    this.particles.sparkle(anchor, 40, 0x7dffb2, 1.8);
    this._closeup = setTimeout(() => {
      this.timeScale = 1;
      this._closeup = null;
      if (this.mode === 'train' && this.trainingMachine) this.camRig.setShot(this.trainingMachine.camPos, this.trainingMachine.camLook, 3.2);
    }, 1700);
  }

  // ════════════════════════════════════════════════════════════════
  //  Compras
  // ════════════════════════════════════════════════════════════════
  buyGenerator(id) {
    if (!Eco.buyGenerator(this.state, id)) return false;
    this.audio.purchase();
    const n = this.state.generators[id];
    this._applyGeneratorVisual(id, n);
    if (n === 1) this.hud.toast(`🛒 ${STR.generators[id].name}!`, 'gold');
    return true;
  }

  buyUpgrade(id) {
    if (!Eco.buyUpgrade(this.state, id)) return false;
    this.audio.purchase();
    const lv = this.state.machines[id].upgrade;
    this.world.setMachineLevel(id, lv);
    const m = this.world.machines.get(id);
    this.particles.sparkle(_v.copy(m.pos).add(new THREE.Vector3(0, 0.6, 0)), 30, 0xffd34d, 1.6);
    this.hud.toast(`🔧 ${STR.machines[id].name} → ${STR.hud.level_short} ${lv}`, 'gold');
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  //  Espelho
  // ════════════════════════════════════════════════════════════════
  openMirror() {
    if (this.mode === 'train') this.stopTraining();
    if (this.mode !== 'play') return;
    this.mode = 'mirror';
    this.luisao.cancelMove();
    this.luisao.locked = true;
    this.luisao.rig.setShirtless(true);
    this.luisao.rig.setState('flex');
    this.camRig.orbit(this.luisao.pos, 1.15, this.luisao.yaw);
    this.hud.setGameplayVisible(false);
    this.hud.showRep(false);
    this.joystick.setVisible(false);
    this.renderer.setDOF(true, 2.9);
    this.mirror.open();
    this.audio.ui();
  }

  closeMirror() {
    if (this.mode !== 'mirror') return;
    this.mirror.close();
    this.mode = 'play';
    this.luisao.locked = false;
    this.luisao.rig.setShirtless(false);
    this.camRig.follow();
    this.hud.setGameplayVisible(true);
    this.joystick.setVisible(isTouch());
    this.renderer.setDOF(false);
  }

  focusMirrorMuscle(m) {
    const back = ['costas', 'triceps', 'panturrilhas'].includes(m);
    this.camRig.orbitYaw = this.luisao.yaw + (back ? Math.PI : 0);
    const h = { panturrilhas: 0.45, pernas: 0.75, abdomen: 1.15 }[m] ?? 1.4;
    this.camRig.orbitHeight = h;
    this.camRig.orbitDist = 2.3;
  }

  mirrorPose() {
    const s = this.state;
    if (s.playTime < s.cooldowns.mirrorPose) return;
    s.cooldowns.mirrorPose = s.playTime + BALANCE.mirrorPose.cooldownSec;
    this.training.addStat('carisma', BALANCE.mirrorPose.carismaPoints);
    this.floaters.spawn(`+${BALANCE.mirrorPose.carismaPoints} ${STR.muscles.carisma}`, _v.copy(this.luisao.rig.headWorld).add(new THREE.Vector3(0, 0.5, 0)), 'carisma');
    this.particles.sparkle(this.luisao.rig.headWorld, 20, 0xff8fd0, 1.6);
    this.audio.hit();
    this.luisao.rig.setState('celebrate');
    setTimeout(() => this.mode === 'mirror' && this.luisao.rig.setState('flex'), 1400);
  }

  weakMuscle() {
    return Prog.weakestMuscle(this.state);
  }

  mirrorData() {
    const s = this.state;
    const status = Prog.requirementStatus(s);
    const cap = Prog.capFor(s);
    const weak = Prog.weakestMuscle(s);
    const muscles = {};
    for (const m of MUSCLES) {
      const lv = s.muscles[m].level;
      const item = status.items.find((i) => i.id === m);
      let st = 'far';
      if (lv >= cap) st = 'cap';
      else if (item?.met) st = 'met';
      else if (item && item.pct >= 0.6) st = 'close';
      muscles[m] = {
        level: lv,
        cap,
        req: item?.req,
        status: st,
        fatigue: s.muscles[m].fatigue,
        stage: stageIndex(lv, BALANCE.visualStages),
        weak: m === weak,
        machine: STR.machines[this.gymDef.machines.find((x) => x.muscle === m)?.id]?.name,
      };
    }
    return {
      muscles,
      forca: Prog.forca(s),
      sym: Math.round(Prog.simetria(s) * 100),
      estetica: Prog.estetica(s),
      frango: Prog.isFrango(s),
      poseReady: s.playTime >= s.cooldowns.mirrorPose,
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  Visual do corpo
  // ════════════════════════════════════════════════════════════════
  _applyBodyStage(instant = false) {
    const lv = this.state.story.level;
    const outfit = Prog.OUTFITS[Math.min(9, lv - 1)];
    this.luisao.rig.setOutfit(outfit);
    this.luisao.rig.setPosture(Prog.postureFor(this.state));
    void instant;
  }

  _updateMuscleVisuals(dt) {
    let changed = false;
    const target = {};
    for (const m of MUSCLES) {
      const s = this.state.muscles[m];
      const lv = s.level + Math.min(0.99, s.progress / levelCost(m, s.level));
      const tv = visualFromLevel(lv, BALANCE.visualStages);
      const nv = damp(this.visCur[m], tv, 3, dt);
      if (Math.abs(nv - this.visCur[m]) > 0.0005) {
        this.visCur[m] = nv;
        changed = true;
      }
      target[m] = this.visCur[m];
    }
    if (changed) this.luisao.rig.setMuscles(target);
  }

  // ════════════════════════════════════════════════════════════════
  //  Configurações / save
  // ════════════════════════════════════════════════════════════════
  setSetting(k, v, persist = true) {
    this.settings[k] = v;
    if (k === 'quality') this.renderer.setQuality(v);
    if (k === 'shake') this.camRig.shakeEnabled = v;
    if (k === 'showFps') this.fpsEl.className = v ? '' : 'hidden';
    if (['master', 'sfx', 'music', 'ambient', 'muted'].includes(k)) this.audio.apply(this.settings);
    if (k === 'muted') this.hud.setMuted(v);
    if (persist) saveSettings(this.settings);
    else clearTimeout(this._setT), (this._setT = setTimeout(() => saveSettings(this.settings), 300));
  }

  save(notify = false) {
    if (this.mode === 'title') return;
    const ok = saveState(this.state);
    if (notify && ok) this.hud.toast(`💾 ${STR.game.saved}`, 'green', 1500);
  }

  exportSave() {
    return exportSave(this.state);
  }

  importSave(text) {
    try {
      const st = importSave(text);
      saveState(st);
      this.hud.toast(STR.settings.importOk, 'green');
      this.mode = 'title'; // impede o save do unload de sobrescrever o importado
      this._reloading = true;
      setTimeout(() => location.reload(), 900);
    } catch {
      this.hud.toast(STR.settings.importFail, 'pink');
    }
  }

  confirmReset() {
    this.menu.close();
    this.modal.show({
      title: STR.settings.reset,
      html: `<p>${STR.settings.resetConfirm}</p>`,
      buttons: [
        { text: STR.settings.cancel, cls: 'sec' },
        {
          text: STR.settings.resetYes,
          cls: 'danger',
          onClick: () => {
            this._reloading = true;
            wipeSave();
            this.state = defaultState();
            this.mode = 'title';
            location.reload();
          },
        },
      ],
    });
  }

  debugAction(a) {
    const s = this.state;
    const cap = Prog.capFor(s);
    if (a === 'g1k') s.ganhos += 1000;
    if (a === 'g1m') s.ganhos += 1e6;
    if (a === 'm5') for (const id of TRAINABLE) s.muscles[id].level = Math.min(cap, s.muscles[id].level + 5);
    if (a === 'req') {
      const goal = Prog.currentGoal(s);
      if (goal.type !== 'done') {
        for (const m of MUSCLES) s.muscles[m].level = Math.max(s.muscles[m].level, Math.min(cap, goal.muscle));
        s.muscles.resistencia.level = Math.max(s.muscles.resistencia.level, goal.resistencia ?? 0);
        s.muscles.carisma.level = Math.max(s.muscles.carisma.level, goal.carisma ?? 0);
        // simetria: iguala os músculos no maior valor
        const top = Math.max(...MUSCLES.map((m) => s.muscles[m].level));
        for (const m of MUSCLES) s.muscles[m].level = top;
      }
    }
    if (a === 'skip') {
      if (Prog.currentGoal(s).type === 'exam') {
        this.debug.toggle(false);
        if (this.mode === 'train') this.stopTraining();
        this.story._gymComplete();
      } else if (Prog.currentGoal(s).type === 'done') this.story.offerTravel();
      else this.story.debugSkip();
    }
    if (a === 'gold') this.events.spawnGolden(true);
    if (a === 'energy') this.events.spawnEnergy(true);
    if (a === 'fat') for (const id of TRAINABLE) {
      s.muscles[id].fatigue = 0;
      s.muscles[id].rested = true;
    }
    if (a === 'fps') this.setSetting('showFps', !this.settings.showFps);
    if (a === 'r1k') this.jobs.addMoney(1000);
    if (a === 'r1m') this.jobs.addMoney(1e6);
    if (a === 'unlock') {
      s.metodo.introSeen = true;
      s.metodo.nodes[FREE_NODE] = Math.max(1, s.metodo.nodes[FREE_NODE] ?? 0);
      for (const id of PLAYABLE_JOBS) this.jobs.unlock(id);
      s.flags.notebookGift = true;
      s.flags.waifuAd = true;
      s.companions.available.aiko = true;
      if (!s.flags.cleitonArrived) this.companions.cleitonArrives();
      this.syncWorkStations();
      this._applyWorkVisuals();
    }
    if (a === 'cargo') {
      const id = this.jobs.current();
      if (id) {
        const js = this.jobs.job(id);
        if (js.cargo < 10) {
          js.cargo++;
          bus.emit('promotion', { id, cargo: js.cargo });
        }
      }
    }
    if (a === 'bond') for (const o of Object.values(s.companions.owned)) o.bond += 500;
    if (a === 'g1b') s.ganhos += 1e9;
    // Pular pra um nível qualquer (arruma história, shape e academia e recarrega)
    if (/^lv\d+$/.test(a)) return this._debugJump(Number(a.slice(2)));
    if (a === 'toGaragem') return this._debugJump(1);
    if (a === 'toIron') return this._debugJump(LEVELS.find((l) => l.gym === 'iron').level);
    if (a === 'date' || a === 'exam') {
      // Encontro/prova AGORA: bate os requisitos, marca a conversa com o Matheus e começa
      const goal = Prog.currentGoal(s);
      if (a === 'exam' && goal.type !== 'exam') {
        const ex = EXAMS[s.story.gym];
        if (!ex) return;
        s.story.level = ex.afterLevel + 1;
        s.story.phase = 'exam';
      }
      this.debugAction('req');
      s.story.matheusTalked = true;
      if (this.mode === 'train') this.stopTraining();
      if (this.mode === 'work') this.stopWork();
      this.debug.toggle(false);
      this.menu.close?.();
      setTimeout(() => this.story.startGoal(), 50);
      return;
    }
    if (a === 'gymDone') {
      // Academia concluída: pula a prova e mostra o convite pra próxima
      this.debug.toggle(false);
      if (this.mode === 'train') this.stopTraining();
      if (this.mode === 'work') this.stopWork();
      s.story.level = (EXAMS[s.story.gym]?.afterLevel ?? s.story.level) + 1;
      this.story._gymComplete();
      return;
    }
    if (a === 'tier') {
      s.debugTier = s.debugTier == null ? 1 : s.debugTier >= 2 ? null : s.debugTier + 1;
      this.hud.toast(`${STR.debug.tier}: ${s.debugTier ?? 'auto'}`, 'blue');
    }
  }

  /**
   * Teste: vai direto pro começo do nível n (1..7). Monta a história como se você tivesse
   * jogado até ali (encontros em ouro, términos, provas, Método/Uber liberados, shape no
   * mínimo do nível anterior) e recarrega o jogo na academia certa, sem a cena de chegada.
   */
  _debugJump(n) {
    const lv = LEVELS[n - 1];
    if (!lv || !GYMS[lv.gym]) return;
    const s = this.state;
    const st = s.story;
    const prevLv = LEVELS[n - 2];
    const prevReq = !prevLv ? null : prevLv.gym !== lv.gym ? EXAMS[prevLv.gym] : prevLv;
    const cap = BALANCE.gyms[lv.gym].cap;
    if (prevReq) {
      for (const m of MUSCLES) s.muscles[m].level = Math.min(cap, Math.max(s.muscles[m].level, prevReq.muscle));
      s.muscles.resistencia.level = Math.min(cap, Math.max(s.muscles.resistencia.level, prevReq.resistencia ?? 0));
      s.muscles.carisma.level = Math.min(cap, Math.max(s.muscles.carisma.level, prevReq.carisma ?? 0));
    }
    for (const id of TRAINABLE) {
      s.muscles[id].fatigue = 0;
      s.muscles[id].level = Math.min(cap, s.muscles[id].level); // voltar pra garagem respeita o teto dela
    }
    // História até aqui
    const done = LEVELS.slice(0, n - 1);
    for (const L of done) {
      st.datesDone[L.girl] ??= 'ouro';
      if (!s.lembrancas.includes(L.girl)) s.lembrancas.push(L.girl);
      st.breakupsDone[L.girl] = true;
    }
    // A namorada do nível anterior fica "atual" (o término acontece na conversa com o Matheus)
    st.currentGirl = prevLv?.girl ?? null;
    if (st.currentGirl) delete st.breakupsDone[st.currentGirl];
    for (const g of BALANCE.gymOrder) {
      if (g === lv.gym) break;
      st.examsPassed[g] = true;
    }
    st.arrived = { ...(st.arrived ?? {}), garagem: true, [lv.gym]: true };
    Object.assign(st, {
      gym: lv.gym, level: n, phase: 'train', matheusTalked: false, teaserSeenFor: n - 1,
      introSeen: true, matheusIntroSeen: true, seuZeIntroSeen: true, levelStartedAt: s.playTime,
    });
    s.flags.quaseLa = {};
    if (n >= 2) {
      s.metodo.introSeen = true;
      s.metodo.nodes[FREE_NODE] = Math.max(1, s.metodo.nodes[FREE_NODE] ?? 0);
      this.jobs.unlock('uber', false);
      s.flags.notebookGift = true;
    }
    if (n >= 3) {
      s.flags.waifuAd = true;
      s.companions.available.aiko = true;
    }
    if (n >= 4) s.flags.cleitonArrived = true;
    if (s.totals.reps === 0) s.totals.reps = 1; // não é "jogo novo" (pula a intro)
    this.save();
    this.mode = 'cutscene';
    this.debug.toggle(false);
    const f = this.fadeEl;
    if (f) {
      f.innerHTML = `<div class="travel-card">${t('debug.jumping', { n, gym: STR.gyms[lv.gym].name })}</div>`;
      f.style.transition = 'opacity 300ms ease-in';
      f.style.opacity = '1';
    }
    setTimeout(() => window.location.reload(), 400);
  }

  // ════════════════════════════════════════════════════════════════
  //  Loop principal
  // ════════════════════════════════════════════════════════════════
  _loop() {
    requestAnimationFrame(() => this._loop());
    const rawDt = Math.min(0.1, this.clock.getDelta());
    const dt = rawDt * this.timeScale;
    if (this.mode !== 'title') this._update(rawDt, dt);
    else this._updateTitle(rawDt);
    this.renderer.render(rawDt);
  }

  _updateTitle(dt) {
    // Câmera passeando devagar pela garagem atrás da tela de título
    this._titleT = (this._titleT ?? 0) + dt;
    const a = this._titleT * 0.08;
    this.camera.position.set(Math.sin(a) * 4.5, 2.2, 3 + Math.cos(a) * 2.5);
    this.camera.lookAt(0, 1.1, -1);
    this.world.update(dt, { playerPos: this.luisao.pos });
    this.luisao.update(dt, this.world);
    for (const a2 of Object.values(this.npcs)) a2.update(dt, null);
  }

  _update(rawDt, dt) {
    const s = this.state;
    s.playTime += rawDt;
    this.mods = Prog.computeMods(s);

    // Movimento do jogador
    if (this.mode === 'play' && !this.menu.isOpen && !this.modal.open) {
      const mv = this.input.moveVector();
      if (mv.len > 0.05) {
        const yaw = this.camRig.viewYaw ?? this.camRig.yaw;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = -fz;
        const rz = fx;
        const dx = fx * mv.y + rx * mv.x;
        const dz = fz * mv.y + rz * mv.x;
        const len = Math.hypot(dx, dz) || 1;
        this.luisao.drive(dx / len, dz / len, mv.len, this.input.running, rawDt, this.world);
        this.camRig.nudgeBehind(this.luisao.yaw, rawDt, 0.6);
      } else {
        this.luisao.drive(0, 0, 0, false, rawDt, this.world);
      }
    } else if (this.mode === 'train') {
      const mv = this.input.moveVector();
      if (mv.len > 0.5) this.stopTraining();
    } else if (this.mode === 'work') {
      const mv = this.input.moveVector();
      if (mv.len > 0.5) this.stopWork();
    }

    // Encaixe suave na estação
    if (this._snap) {
      const sn = this._snap;
      sn.t = Math.min(1, sn.t + rawDt / 0.3);
      const e = sn.t * sn.t * (3 - 2 * sn.t);
      this.luisao.pos.lerpVectors(sn.from, sn.to, e);
      this.luisao.yaw = sn.fromYaw + Math.atan2(Math.sin(sn.toYaw - sn.fromYaw), Math.cos(sn.toYaw - sn.fromYaw)) * e;
      if (sn.t >= 1) this._snap = null;
    }

    // Repetição segurando
    if (this.mode === 'train' && (this.hold.active || this.input.isDown('Space'))) {
      if (!this.hold.active) {
        this.hold.active = true;
        this.hold.t = 0;
      }
      this.hold.t += rawDt;
      if (this.hold.t >= BALANCE.rep.holdInterval) {
        this.hold.t = 0;
        this.doRep('hold');
        this.hud.pressFx();
      }
    }

    // Trabalho segurando
    if (this.mode === 'work' && (this.workHold?.active || this.input.isDown('Space'))) {
      if (!this.workHold?.active) this.workHold = { active: true, t: 0 };
      this.workHold.t += rawDt;
      if (this.workHold.t >= BALANCE.work.holdInterval) {
        this.workHold.t = 0;
        this.doWork('hold');
        this.workPanel.pressFx();
      }
    }
    // Série Automática (Método): reps sozinhas enquanto você está na máquina
    if (this.mode === 'train' && this.mods.autoReps > 0) {
      this._autoRepT = (this._autoRepT ?? 0) + rawDt * this.mods.autoReps;
      while (this._autoRepT >= 1) {
        this._autoRepT -= 1;
        this.doRep('auto');
      }
    }
    // Aura vermelha da FÚRIA
    if (this.mods.furia > 1 && Math.random() < 0.7) this.particles.aura(this.luisao.rig.headWorld.add(new THREE.Vector3(0, -0.6, 0)), 0xff3a2a, 0.5);

    // Sistemas
    this.training.update(rawDt, this.mods);
    this.jobs.update(rawDt, this.mods);
    this.companions.update(rawDt);
    this.workCorner.update(rawDt);
    if (this.mode === 'work' && this.jobs.active === 'vibecoder') {
      const vb = s.jobs.list.vibecoder;
      this.workCorner.setTerminal(vb.cc, vb.ccN); // (só redesenha quando chega mensagem nova)
    }
    if (this.inCar) {
      // Cena interna do Subaru: cenário, chuva, passageiros e FOV (a tela pode ter mudado de tamanho)
      const js = s.jobs.list.uber;
      this.uberCar.setRain(s.playTime < js.rainUntil);
      this.uberCar.setRiders(js.riders ?? []);
      this.camRig.fovBase = this._carFov();
    }
    this.uberCar.update(rawDt);
    const gps = Eco.passiveGps(s, this.mods);
    s.ganhos += gps * rawDt;
    s.totalGanhos += gps * rawDt;
    this._passiveTrainAcc = (this._passiveTrainAcc ?? 0) + rawDt;
    if (this._passiveTrainAcc >= 0.5) {
      this.training.passive(Eco.passiveTrain(s), this._passiveTrainAcc);
      this._passiveTrainAcc = 0;
    }
    this.activeRate = damp(this.activeRate, this._activeAcc / Math.max(rawDt, 1e-3), 0.6, rawDt);
    this._activeAcc = 0;
    s.totals.maxGps = Math.max(s.totals.maxGps, gps);
    this.events.update(rawDt);
    this.story.update(rawDt);

    // Mundo e atores
    this.world.update(dt, { playerPos: this.luisao.pos });
    this.luisao.update(dt, this.mode === 'play' ? this.world : null);
    this._updateHeldProps();
    this._updateNpcs(dt);
    this._updateMuscleVisuals(rawDt);

    // Câmera e áudio
    this.camRig.update(rawDt);
    // Câmera colada no Luisão (parede atrás)? Esconde ele pra não ver por dentro da cabeça.
    this.luisao.rig.object3D.visible = !(this.camRig.mode === 'follow' && this.camRig.closeness < 0.6);
    this.audio.updateListener(this.camera);

    // Efeitos
    this.particles.update(dt);
    this.floaters.update(rawDt);

    // UI
    this._updatePrompts();
    this.uiTimer += rawDt;
    if (this.uiTimer > 0.1) {
      this._updateHUD(this.uiTimer);
      this.uiTimer = 0;
    }

    // Autosave
    this.saveTimer += rawDt;
    if (this.saveTimer > BALANCE.autosaveSec) {
      this.saveTimer = 0;
      this.save();
    }
  }

  _updateHeldProps() {
    if (this._benchBar) {
      const rig = this.luisao.rig;
      const a = rig.j.handL.getWorldPosition(new THREE.Vector3());
      const b = rig.j.handR.getWorldPosition(new THREE.Vector3());
      this._benchBar.position.copy(a).add(b).multiplyScalar(0.5);
      const dir = b.sub(a);
      if (dir.lengthSq() > 1e-6) this._benchBar.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), dir.normalize());
    }
    for (const h of this.heldProps) {
      if (!h.upright) continue;
      h.obj.parent.getWorldQuaternion(_q);
      _q.invert();
      h.obj.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.luisao.yaw));
    }
  }

  _updateNpcs(dt) {
    const head = this.luisao.rig.headWorld;
    const p = this.luisao.pos;
    for (const [k, a] of Object.entries(this.npcs)) {
      if (a.scripted) {
        a.update(dt, null);
        continue;
      }
      const d = a.pos.distanceTo(p);
      a.rig.lookAt(d < 5 ? head : null);
      if (a.faceTo) a.faceTowards(a.faceTo.x, a.faceTo.z, dt, 4);
      else if (a.home && !a.moveTarget) a.yaw = damp(a.yaw, a.home.yaw, 2, dt);
      if (k === 'matheus') this.story.updateMatheus(a, dt, d);
      if (k === 'parceiro') {
        a.autoRep -= dt;
        if (a.autoRep <= 0) {
          a.rig.rep(0.55);
          a.autoRep = 0.6;
        }
      }
      a.update(dt, null);
    }
    for (const ex of this.extras ?? []) {
      if (ex.autoRepEvery > 0) {
        ex.autoRep -= dt;
        if (ex.autoRep <= 0) {
          ex.rig.rep(0.7);
          ex.autoRep = ex.autoRepEvery;
        }
      }
      ex.update(dt, null);
    }
    for (const pb of this.passersby) {
      const pt = pb.patrol;
      if (!pb.moveTarget) {
        pt.dir *= -1;
        pb.moveTo(pt.dir > 0 ? pt.b : pt.a, pt.z, null, 0.3);
      }
      pb.update(dt, null);
    }
  }

  _project(pos) {
    _v.copy(pos).project(this.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight };
  }

  _updatePrompts() {
    const list = [];
    if (this.mode === 'play' && !this.menu.isOpen) {
      const n = this._nearest();
      if (n?.type === 'machine') {
        const sp = this._project(n.m.promptPos);
        const mus = n.m.def.muscle;
        if (sp) list.push({ key: 'p', x: sp.x, y: sp.y, cls: 'wprompt', html: `${t('hud.train', { muscle: muscleName(mus) })}${isTouch() ? '' : '<kbd>E</kbd>'}`, onClick: () => this.startTraining(n.id) });
      } else if (n?.type === 'work') {
        const sp = this._project(n.m.promptPos);
        const id = n.jobId;
        if (sp && id) list.push({ key: 'p', x: sp.x, y: sp.y, cls: 'wprompt work', html: `${t('hud.workPrompt', { job: STR.jobs[id].name, n: this.jobs.job(id).cargo })}${isTouch() ? '' : '<kbd>E</kbd>'}`, onClick: () => this.startWork(id) });
      } else if (n?.type === 'npc') {
        const sp = this._project(_v2.copy(n.a.pos).add(new THREE.Vector3(0, 2.15, 0)));
        const name = n.id === 'matheus' ? STR.hud.talkMatheusName : n.id === 'seuze' ? this.host().talkName : null;
        const html = name ? t('hud.talk', { name }) : t('hud.talkPersonal', { name: this.companions.name(n.id) });
        if (sp) list.push({ key: 'p', x: sp.x, y: sp.y, cls: 'wprompt talk', html: `${html}${isTouch() ? '' : '<kbd>E</kbd>'}`, onClick: () => this.story.talkTo(n.id) });
      }
      // "!" no personal esperando no portão
      const wa = this.companions.waitingActor();
      if (wa && !this.state.companions.trialsUsed[wa.id]) {
        const sp = this._project(_v2.copy(wa.a.pos).add(new THREE.Vector3(0, 2.4, 0)));
        if (sp) list.push({ key: 'bangP', x: sp.x, y: sp.y, cls: 'wbang blue', html: '!' });
      }
    }
    // Nome de cada passageiro em cima dele (câmera interna do carro)
    if (this.inCar) {
      for (const l of this.uberCar.labels()) {
        const sp = this._project(l.pos);
        if (sp) list.push({ key: l.key, x: sp.x, y: sp.y, cls: 'wname', html: `<b>${esc(l.name)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}` });
      }
    }
    // Balões da Equipe (personal e waifu)
    if (['play', 'train', 'work'].includes(this.mode)) {
      for (const b of this.companions.bubbleList()) {
        const sp = this._project(b.pos);
        if (sp) list.push({ key: b.key, x: sp.x, y: sp.y, cls: b.cls, html: b.text });
      }
    }
    if (this.mode === 'play' || this.mode === 'train' || this.mode === 'work') {
      // "!" em cima do Matheus
      if (this.story.matheusBang()) {
        const a = this.npcs.matheus;
        const sp = this._project(_v2.copy(a.pos).add(new THREE.Vector3(0, 2.45, 0)));
        if (sp) list.push({ key: 'bang', x: sp.x, y: sp.y, cls: 'wbang', html: '!' });
      } else if (this.story.matheusCoin()) {
        const a = this.npcs.matheus;
        const sp = this._project(_v2.copy(a.pos).add(new THREE.Vector3(0, 2.4, 0)));
        if (sp) list.push({ key: 'bang', x: sp.x, y: sp.y, cls: 'wbang coin', html: '💵' });
      }
      // PONTO FRACO em cima da máquina do músculo mais atrasado
      const weak = Prog.weakestMuscle(this.state);
      if (weak && this.mode === 'play') {
        const def = this.gymDef.machines.find((m) => m.muscle === weak);
        const m = def && this.world.machines.get(def.id);
        const sp = m && this._project(_v2.copy(m.pos).add(new THREE.Vector3(0, 1.75, 0)));
        if (sp && Math.hypot(m.pos.x - this.luisao.pos.x, m.pos.z - this.luisao.pos.z) > 1.5) list.push({ key: 'weak', x: sp.x, y: sp.y, cls: 'wlabel weak', html: `⚠ ${STR.hud.weakPoint}` });
      }
    }
    this.prompts.render(list);
  }

  _updateHUD(dt) {
    const s = this.state;
    const status = Prog.requirementStatus(s);
    const goal = status.goal;
    const gps = Eco.passiveGps(s, this.mods);
    let goalTitle = '';
    if (goal.type === 'date') goalTitle = `${STR.hud.nextDate}: ${s.story.matheusTalked && status.allMet ? STR.girlfriends[goal.girl].name : '???'}`;
    else if (goal.type === 'exam') goalTitle = STR.hud.nextExam;
    else goalTitle = gymCompleteTitle(s.story.gym);
    this.hud.top({
      ganhos: s.ganhos,
      gps: gps + this.activeRate,
      rank: s.rank,
      xpPct: s.xp / rankCost(s.rank),
      level: s.story.phase === 'train' ? s.story.level : s.story.level - 1,
      stage: Prog.bodyStageName(s),
      goalTitle,
      goalPct: status.progress,
      ready: status.allMet,
      sym: Prog.simetria(s),
      affordable: Eco.anythingAffordable(s) || MT.anyAffordable(s) || this.jobs.anyAffordable() || COMPANIONS.some((c) => (this.companions.isAvailable(c.id) && !s.companions.owned[c.id] && s.dinheiro >= CR.hireCost(c.id)) || CR.levelStatus(s, c.id).ok),
      showMoney: s.metodo.introSeen || s.dinheiro > 0,
      dinheiro: s.dinheiro,
      mps: this.jobs.totalPassive(this.mods),
    });
    // Equipe, água, treino guiado, FÚRIA, painel de trabalho
    const playing = ['play', 'train', 'work'].includes(this.mode);
    this.hud.team(playing ? this.companions.badges() : []);
    this.hud.water(playing && !!this.companions.water);
    this.hud.guided(this.companions.guidedChip());
    const fl = this.mods.furiaLevel;
    this.hud.furia(fl > 0 && this.mode === 'train' ? { ready: s.playTime >= s.cooldowns.furia, active: s.buffs.furiaUntil > s.playTime, left: Math.ceil(Math.max(s.buffs.furiaUntil, s.cooldowns.furia) - s.playTime) } : null);
    if (this.mode === 'work') this.workPanel.update();
    if (this.metodoUI.isOpen) this.metodoUI.refresh();
    // Requisitos
    if (goal.type !== 'done') {
      const who = goal.type === 'date' ? t('hud.reqFor', { name: s.story.datesDone[goal.girl] || status.allMet ? STR.girlfriends[goal.girl].name : '???' }) : STR.hud.reqExam;
      const ready = status.allMet && s.story.matheusTalked;
      this.hud.requirements(status, {
        who,
        matheus: s.story.matheusTalked,
        ready,
        goText: goal.type === 'exam' ? STR.hud.goExam : STR.hud.goDate,
        weak: Prog.weakestMuscle(s),
        extra: goal.extra === 'armwrestle' ? STR.hud.beatBrayan : null,
        extraDone: false,
      });
    } else {
      this.hud.requirements({ items: [] }, { who: gymCompleteTitle(s.story.gym), matheus: true, ready: false, extra: null });
    }
    // Split
    const sp = s.split;
    const pair = SPLITS[sp.index];
    this.hud.splitCard(pair, sp.aReps, sp.bReps, BALANCE.split.repsEach, sp.bonusUntil > s.playTime, sp.bonusUntil - s.playTime);
    // Buffs
    const buffs = [];
    if (s.buffs.goldenUntil > s.playTime) buffs.push({ text: `🥤 ${STR.hud.goldenBuff} • ${Math.ceil(s.buffs.goldenUntil - s.playTime)}s` });
    if (s.buffs.radioUntil > s.playTime) buffs.push({ text: `📻 x2 • ${Math.ceil(s.buffs.radioUntil - s.playTime)}s` });
    if (s.buffs.energeticoUntil > s.playTime) buffs.push({ text: `⚡ ${t('hud.energyTag', { n: BALANCE.energy.workMult })} • ${Math.ceil(s.buffs.energeticoUntil - s.playTime)}s`, cls: 'energy' });
    if (sp.bonusUntil > s.playTime) buffs.push({ text: `⚡ ${STR.hud.splitBonus}`, cls: 'split' });
    if (s.streak.days > 0) buffs.push({ text: `🔥 +${Math.round(Math.min(7, s.streak.days) * BALANCE.streak.bonusPerDay * 100)}%` });
    this.hud.buffList(buffs);
    this.hud.missionCard(s.mission);
    this.hud.girlPanel(this.story.girlPanelData());
    // Painel da máquina
    if (this.mode === 'train' && this.trainingMachine) {
      const def = this.trainingMachine.def;
      const ms = s.muscles[def.muscle];
      const cap = Math.min(gymOf(def.gym).cap, Prog.capFor(s));
      this.hud.repInfo({
        name: STR.machines[def.id].name,
        muscle: muscleName(def.muscle),
        level: ms.level,
        cap,
        prog: ms.level >= cap ? 1 : ms.progress / levelCost(def.muscle, ms.level),
        fatigue: ms.fatigue,
        pump: ms.pumpReps > 0,
        weak: Prog.weakestMuscle(s) === def.muscle,
        capped: ms.level >= cap,
        pr: s.machines[def.id].pr,
        setReps: this.training.setReps,
        pumpMult: this.mods.pumpMult,
        furia: this.mods.furia > 1,
        combo: this.mods.comboMax > 1 ? Math.min(this.mods.comboMax, 1 + this.training.combo * 0.04) : 1,
        guided: this.training.guidedReps > 0,
        descanso: s.buffs.descansoAtivoUntil > s.playTime,
      });
    }
    // Mini-mapa
    const weak = Prog.weakestMuscle(s);
    this.minimap.draw(
      {
        player: { x: this.luisao.pos.x, z: this.luisao.pos.z, yaw: this.luisao.yaw },
        machines: this.gymDef.machines.map((m) => {
          const item = status.items?.find((i) => i.id === m.muscle);
          const lv = s.muscles[m.muscle].level;
          let st = 'far';
          if (lv >= gymOf(m.gym).cap) st = 'cap';
          else if (item?.met) st = 'met';
          else if (item && item.pct >= 0.6) st = 'close';
          return { id: m.id, x: m.pos[0], z: m.pos[1], status: st, icon: MUSCLE_ICON[m.muscle], weak: m.muscle === weak };
        }),
        matheus: { x: this.npcs.matheus.pos.x, z: this.npcs.matheus.pos.z, bang: this.story.matheusBang(), coin: this.story.matheusCoin() },
        works: [
          { id: 'work', x: this.uberCar.pos.x, z: this.uberCar.pos.z, locked: this.uberCar.locked, label: '🚗' },
          { id: 'desk', x: this.workCorner.pos.x, z: this.workCorner.pos.z, locked: this.workCorner.locked, label: 'R$' },
        ],
        personal: (() => {
          const pid = CR.equipped(s, 'personal');
          const a = pid && this.companions.actors[pid];
          return a ? { x: a.pos.x, z: a.pos.z } : null;
        })(),
        golden: this.events.golden ? { x: this.events.golden.group.position.x, z: this.events.golden.group.position.z } : null,
        energy: this.events.energy ? { x: this.events.energy.group.position.x, z: this.events.energy.group.position.z } : null,
      },
      dt,
    );
    this.menu.refresh();
    this.mirror.refresh();
    this.debug.update();
    if (this.settings.showFps) this.fpsEl.textContent = `${this.renderer.fps} FPS • ${STR.settings.quality[this.renderer.qualityName]}`;
  }
}

export { machineDef, LEVELS, pick, clamp };
