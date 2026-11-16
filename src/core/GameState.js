import { BALANCE, TRAINABLE, SPLITS } from '../config/balance.js';
import { GYMS } from '../config/gyms.js';
import { JOBS } from '../config/jobs.js';

export const SAVE_VERSION = 3;

function trainableEntry() {
  return { level: 0, progress: 0, fatigue: 0, pumpReps: 0, rested: true, repsTotal: 0 };
}

function jobEntry(id) {
  const base = { unlocked: false, cargo: 1, xp: 0, tasks: 0, earned: 0, upgrades: {}, cappedWarned: '' };
  if (id === 'uber') return { ...base, progress: 0, rides: 0, pending: 0, riders: [], recent: [], rainUntil: 0, rushUntil: 0, nextEventAt: 0 };
  if (id === 'vibecoder') {
    return {
      ...base, feature: 0, features: 0, clients: 0, bigClients: 0, bugs: 0, bugHits: 0, extraCost: 0,
      mrrAcc: 0, nextMrrAt: 0, nextDecisionAt: 0, decision: null, churnAt: 0, csAt: 0, autoAcc: 0, lines: [],
    };
  }
  return base;
}

export function defaultState() {
  const muscles = {};
  for (const id of TRAINABLE) muscles[id] = trainableEntry();

  const machines = {};
  for (const gym of Object.values(GYMS)) {
    for (const m of gym.machines) machines[m.id] = { upgrade: 0, used: false, pr: 0, reps: 0 };
  }

  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    lastSave: Date.now(),
    playTime: 0,

    ganhos: 0,
    totalGanhos: 0,
    xp: 0,
    rank: 0,

    // Dinheiro (R$): vem do trabalho; paga o Método, a carreira e a Equipe.
    dinheiro: 0,
    totalDinheiro: 0,

    // Método Neumman (árvore paga ao Matheus)
    metodo: { nodes: {}, spent: 0, introSeen: false, resets: 0 },

    // Trabalho
    jobs: {
      main: null,
      switchReadyAt: 0,
      list: Object.fromEntries(JOBS.map((j) => [j.id, jobEntry(j.id)])),
      mind: { fatigue: 0, rested: true, cafezinho: 0 },
    },

    // Equipe do Luisão (personal + waifu)
    companions: {
      owned: {}, // { cleiton: { level, bond, momento } }
      equipped: { personal: null, waifu: null },
      available: {}, // liberados pra comprar
      device: 0, // 0 celular, 1 smartwatch, 2 projetor
      trial: null, // { id, until }
      trialsUsed: {},
      pairsFound: {},
      switchReadyAt: 0,
      talk: 'poucas', // muitas | poucas | nenhuma
    },

    muscles, // inclui resistencia e carisma
    machines,
    generators: {},

    story: {
      level: 1, // nível de história atual (1..10)
      gym: 'garagem',
      phase: 'train', // train | exam | gymDone
      introSeen: false,
      matheusIntroSeen: false,
      seuZeIntroSeen: false,
      matheusTalked: false,
      currentGirl: null,
      datesDone: {}, // { marlene: 'ouro' }
      examsPassed: {},
      dateFails: 0,
      armFails: 0,
      levelStartedAt: 0, // em playTime
      levelTimes: {}, // { 1: segundos }
      teaserSeenFor: 0,
      nickname: false,
      breakupsDone: {},
      arrived: { garagem: true }, // academias em que a cena de chegada já passou
    },

    split: { index: 0, nextRotateAt: BALANCE.split.rotateSec, aReps: 0, bReps: 0, startedAt: -1, bonusUntil: 0 },
    buffs: { goldenUntil: 0, radioUntil: 0, furiaUntil: 0, descansoAtivoUntil: 0, energeticoUntil: 0 },
    lembrancas: [],
    photos: [], // { level, dataUrl }

    totals: { reps: 0, crits: 0, goldens: 0, energeticos: 0, dates: 0, maxGps: 0, tasks: 0, promotions: 0, rides: 0, features: 0, bugsFixed: 0, megaReps: 0 },
    tips: {}, // dicas de máquina já vistas
    streak: { lastDay: null, days: 0 },
    mission: null, // { muscle, total, done }
    cooldowns: { matheusCarisma: 0, matheusMission: 0, mirrorPose: 0, stuckHint: 0, furia: 0, mei: 0, yume: 0 },
    flags: { quaseLa: {}, frangoWarned: false, waifuAd: false, cleitonArrived: false, notebookGift: false, workHint: false },
    // Medição pra balanceamento (F9): tempo treinando × trabalhando por nível
    timeLog: { train: 0, work: 0, perLevel: {} },
    debugTier: null, // F9: força a camada do Método/Equipe/cargo (testes)

    ngPlus: 0,
    legado: 0,
  };
}

export function defaultSettings() {
  return {
    quality: 'auto',
    master: 0.4,
    sfx: 1,
    music: 0.55,
    ambient: 0.6,
    muted: false,
    shake: true,
    showFps: false,
    devMenu: false, // Modo de teste (Opções → 5 toques na versão)
  };
}

/** Mescla o save carregado com os defaults (saves antigos ganham campos novos). */
function deepMerge(base, loaded) {
  if (loaded == null || typeof loaded !== 'object' || Array.isArray(loaded)) return loaded ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(loaded)) {
    if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) && typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const UPGRADE_RENAME = { bike: 'carro', bag: 'agua', capa: 'palheta', suporte: 'suporte', molecada: 'primo' };

/** Passa o progresso do antigo Entregador pro Uber e tranca o Vibecoder se o Luisão ainda está na garagem. */
function migrateToUber(merged, raw) {
  const old = raw?.jobs?.list?.entregador;
  const uber = merged.jobs.list.uber;
  if (old) {
    for (const k of ['unlocked', 'cargo', 'xp', 'tasks', 'earned', 'cappedWarned', 'rainUntil', 'rushUntil', 'nextEventAt', 'progress']) {
      if (old[k] !== undefined) uber[k] = old[k];
    }
    uber.rides = old.deliveries ?? 0;
    uber.pending = old.pending ?? 0;
    for (const [k, v] of Object.entries(old.upgrades ?? {})) if (UPGRADE_RENAME[k]) uber.upgrades[UPGRADE_RENAME[k]] = v;
  }
  merged.totals.rides = raw?.totals?.deliveries ?? merged.totals.rides ?? 0;
  const j = merged.jobs;
  if (j.main === 'entregador') j.main = 'uber';
  // Vibecoder: agora é da academia nova. Na garagem ele volta a ficar trancado (o progresso fica guardado).
  const inGarage = merged.debugTier == null && merged.story?.gym === 'garagem';
  if (inGarage && j.list.vibecoder?.unlocked) {
    j.list.vibecoder.unlocked = false;
    if (j.main === 'vibecoder') j.main = uber.unlocked ? 'uber' : null;
  }
}

export function migrate(raw) {
  const from = raw?.version ?? 1;
  const merged = deepMerge(defaultState(), raw);
  merged.version = SAVE_VERSION;
  if (!Number.isFinite(merged.ganhos)) merged.ganhos = 0;
  if (!Number.isFinite(merged.dinheiro)) merged.dinheiro = 0;
  if (merged.split.index >= SPLITS.length) merged.split.index = 0;
  // v1 → v2: os pontos de habilidade viram "crédito na consultoria do Matheus" (R$).
  if (from < 2) {
    const pts = merged.skillPoints ?? 0;
    if (pts > 0) {
      const credit = pts * BALANCE.rank.stipend * 3;
      merged.dinheiro += credit;
      merged.totalDinheiro += credit;
    }
  }
  delete merged.skillPoints;
  // v2 → v3: o Entregador virou Uber (Subaru Legacy) e o Vibecoder só abre na academia nova.
  if (from < 3) migrateToUber(merged, raw);
  delete merged.jobs.list.entregador;
  delete merged.totals.deliveries;
  return merged;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(BALANCE.saveKey);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('[Save] save corrompido, começando do zero', err);
    return null;
  }
}

export function saveState(state) {
  state.lastSave = Date.now();
  try {
    localStorage.setItem(BALANCE.saveKey, JSON.stringify(state));
    return true;
  } catch (err) {
    // Provavelmente as fotos estouraram o limite: descarta as mais antigas e tenta de novo.
    if (state.photos?.length > 3) {
      state.photos.splice(0, state.photos.length - 3);
      try {
        localStorage.setItem(BALANCE.saveKey, JSON.stringify(state));
        return true;
      } catch {
        /* nada */
      }
    }
    console.error('[Save] falhou', err);
    return false;
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(BALANCE.settingsKey);
    return { ...defaultSettings(), ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(BALANCE.settingsKey, JSON.stringify(s));
  } catch {
    /* nada */
  }
}

export function exportSave(state) {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'SC1:' + btoa(bin);
}

export function importSave(text) {
  text = text.trim();
  if (!text.startsWith('SC1:')) throw new Error('formato');
  const bin = atob(text.slice(4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !data.muscles) throw new Error('conteúdo');
  return migrate(data);
}

export function wipeSave() {
  localStorage.removeItem(BALANCE.saveKey);
}
