// Simulador de balanceamento: joga a Garagem inteira (níveis 1-3 + prova) com as classes REAIS do jogo.
// uso: node sim.mjs <raiz> [json de overrides]
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { defaultState } = await import(u('src/core/GameState.js'));
const MT = await import(u('src/systems/Metodo.js'));
const CR = await import(u('src/systems/CompanionRules.js'));
const Prog = await import(u('src/systems/Progression.js'));
const Eco = await import(u('src/systems/Economy.js'));
const { Jobs } = await import(u('src/systems/Jobs.js'));
const { Training } = await import(u('src/systems/Training.js'));
const { BALANCE, TRAINABLE } = await import(u('src/config/balance.js'));
const { NODES, FREE_NODE } = await import(u('src/config/metodo.js'));
const { GYMS } = await import(u('src/config/gyms.js'));
const { JOBS } = await import(u('src/config/jobs.js'));
const { EXAMS } = await import(u('src/config/story.js'));

// As estações seguem a academia do save (opção gym: 'iron' simula o Iron Temple a partir da chegada)
let machines = GYMS.garagem.machines;
const machineFor = (stat) => machines.find((m) => m.muscle === stat);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METODO_PRIORITY = ['tec_execucao', 'tec_carga', 'rot_descanso', 'tec_pico', 'rot_pump', 'rot_split', 'lab_papo', 'lab_rede', 'lab_fofoca'];

export function simulate(opt = {}) {
  const o = { gym: 'garagem', cps: 4, workShare: 0.25, seed: 1, metodo: true, team: true, job: 'auto', maxMin: 90, walk: 2.5, burst: 45, overhead: 90, jobUpgrades: true, ...opt };
  Math.random = mulberry32(o.seed * 7919);
  const dt = 0.1;
  const s = defaultState();
  Object.assign(s.story, { introSeen: true, matheusIntroSeen: true });
  machines = GYMS[o.gym].machines;
  if (o.gym === 'iron') {
    // Chegada no Iron: tudo no nível da prova da garagem, Método e Uber já em uso
    Object.assign(s.story, { gym: 'iron', level: 4, phase: 'train', arrived: { garagem: true, iron: true } });
    for (const id of TRAINABLE) s.muscles[id].level = id === 'carisma' ? 14 : 25;
    s.metodo.introSeen = true;
    s.metodo.nodes[FREE_NODE] = 1;
    s.ganhos = o.startGanhos ?? 20000;
    s.flags.cleitonArrived = true;
    s.flags.waifuAd = true;
    s.flags.notebookGift = true;
  }
  const handlers = {};
  const bus = { emit: (e, d) => (handlers[e] ?? []).forEach((f) => f(d)), on: (e, f) => (handlers[e] ??= []).push(f) };
  const game = { state: s, bus, mode: 'train' };
  const tr = new Training(s, bus);
  game.training = tr;
  const jobs = new Jobs(game);
  bus.on('rankUp', () => jobs.rankStipend());
  if (o.gym === 'iron') { jobs.unlock('uber'); jobs.job('uber').cargo = 4; }

  const log = { levels: [], moneyBy: { ent: 0, vib: 0 }, spent: { metodo: 0, team: 0, jobs: 0 }, work: 0, train: 0, walk: 0, over: 0, rankPix: 0, stuck: false };
  let t = 0;
  let acc = 0;
  let levelStart = 0;
  let workSince = o.gym === 'iron' ? 0 : null; // quando o trabalho ficou disponível
  const stats = { reps: 0, tasks: 0 };

  // ── ações ──
  const startLevelHooks = () => {
    if (s.story.level >= 2 && !s.metodo.introSeen && o.metodo) {
      s.metodo.introSeen = true;
      s.metodo.nodes[FREE_NODE] = 1;
      jobs.unlock('uber');
      workSince = t;
    }
  };
  const goalMet = () => Prog.requirementStatus(s).allMet;
  const pickTrain = () => {
    const items = Prog.requirementStatus(s).items.filter((i) => !i.met && machineFor(i.id));
    if (!items.length) return null;
    items.sort((a, b) => s.muscles[a.id].fatigue - s.muscles[b.id].fatigue || b.req - b.cur - (a.req - a.cur));
    return items[0].id;
  };

  const shop = () => {
    let bought = 0;
    // Equipe
    if (o.team) {
      const cid = ['cleiton', 'aiko'];
      if (s.story.level >= 3 && Prog.requirementStatus(s).progress >= 0.35) s.flags.cleitonArrived = true;
      if (s.story.level >= 2 && jobs.job('uber').rides >= 3) s.flags.waifuAd = true;
      for (const id of cid) {
        const avail = (id === 'cleiton' && s.flags.cleitonArrived) || (id === 'aiko' && s.flags.waifuAd);
        if (!avail) continue;
        const ow = s.companions.owned[id];
        if (!ow) {
          const c = CR.hireCost(id);
          if (s.dinheiro >= c) { s.dinheiro -= c; log.spent.team += c; s.companions.owned[id] = { level: 1, bond: 0 }; s.companions.equipped[CR.def(id).slot] = id; bought++; }
        } else {
          const st = CR.levelStatus(s, id);
          if (st.ok) { s.dinheiro -= st.cost; log.spent.team += st.cost; ow.level++; bought++; }
        }
      }
    }
    // Método: "economize pro melhor": menor (nível + prioridade)
    if (o.metodo && s.metodo.introSeen) {
      for (let guard = 0; guard < 20; guard++) {
        const cands = METODO_PRIORITY.map((id, idx) => ({ id, idx, st: MT.status(s, id), L: MT.level(s, id) })).filter((c) => c.st.reason === 'money' || c.st.ok);
        if (!cands.length) break;
        cands.sort((a, b) => a.L + a.idx * 0.4 - (b.L + b.idx * 0.4));
        const c = cands[0];
        if (!c.st.ok) break;
        const before = s.dinheiro;
        MT.buy(s, c.id);
        log.spent.metodo += before - s.dinheiro;
        bought++;
      }
    }
    // upgrades de emprego com a sobra (> 2x o custo)
    if (o.jobUpgrades) {
      for (const id of jobs.unlockedList()) {
        for (const key of JOBS.find((j) => j.id === id).upgrades) {
          const st = jobs.upgradeStatus(id, key);
          if (st.ok && s.dinheiro > st.cost * 2) { const b = s.dinheiro; jobs.buyUpgrade(id, key); log.spent.jobs += b - s.dinheiro; bought++; }
        }
      }
    }
    // Ganhos: mais barato primeiro (geradores + upgrades de máquina)
    for (let guard = 0; guard < 40; guard++) {
      const opts = [];
      for (const g of Eco.availableGenerators(s)) opts.push({ cost: Eco.generatorCost(s, g), buy: () => Eco.buyGenerator(s, g.id) });
      for (const m of machines) {
        const lv = s.machines[m.id].upgrade;
        if (lv < Eco.upgradeMax(m.id)) opts.push({ cost: Eco.upgradeCost(m.id, lv), buy: () => Eco.buyUpgrade(s, m.id) });
      }
      opts.sort((a, b) => a.cost - b.cost);
      if (!opts.length || opts[0].cost > s.ganhos) break;
      opts[0].buy();
    }
    return bought;
  };

  const chooseJob = () => {
    if (o.job !== 'auto') return jobs.isUnlocked(o.job) ? o.job : null;
    const list = jobs.unlockedList();
    if (!list.length) return null;
    return list.includes('vibecoder') ? 'vibecoder' : list[0];
  };

  // ── loop ──
  startLevelHooks();
  if (o.rich) { s.dinheiro += o.rich; s.totalDinheiro += o.rich; if (!s.metodo.introSeen) { s.metodo.introSeen = true; s.metodo.nodes[FREE_NODE] = 1; } s.flags.cleitonArrived = true; s.flags.waifuAd = true; s.dinheiro = o.rich; }
  if (o.tier != null) s.debugTier = o.tier;
  if (o.grant) { s.metodo.introSeen = true; for (const [k, v] of Object.entries(o.grant)) s.metodo.nodes[k] = v; if (!o.grantTeam) { /* só o Método */ } }
  if (o.grantTeam) { for (const [id, lv] of Object.entries(o.grantTeam)) { s.companions.owned[id] = { level: lv, bond: 0 }; s.companions.equipped[CR.def(id).slot] = id; } }
  let mode = 'walk';
  let modeLeft = 0;
  let curStat = null;
  let sessionReps = 0;
  let jobId = null;
  let fixT = 0;
  let nextShop = 0;
  const maxT = o.maxMin * 60;

  while (t < maxT) {
    t += dt;
    s.playTime = t;
    const mods = Prog.computeMods(s);

    // passivos
    const gps = Eco.passiveGps(s, mods);
    s.ganhos += gps * dt;
    s.totalGanhos += gps * dt;
    tr.passive(Eco.passiveTrain(s), dt);
    tr.update(dt, mods);
    game.mode = mode === 'work' ? 'work' : 'train';
    jobs.update(dt, mods);

    // ações por modo
    if (mode === 'train') {
      acc += o.cps * dt;
      while (acc >= 1) {
        acc -= 1;
        const r = tr.rep('click');
        if (r) { stats.reps++; sessionReps++; jobs.onGymRep(); for (const slot of ['personal', 'waifu']) { const id = s.companions.equipped[slot]; if (id) s.companions.owned[id].bond++; } }
      }
      const f = s.muscles[curStat].fatigue;
      const stillNeeded = Prog.requirementStatus(s).items.some((i) => i.id === curStat && !i.met);
      if (!stillNeeded || f >= 0.5 || sessionReps >= 70) { mode = 'walk'; modeLeft = o.walk; tr.stop(); }
      log.train += dt;
    } else if (mode === 'work') {
      acc += o.cps * dt;
      while (acc >= 1) {
        acc -= 1;
        jobs.task('click');
        stats.tasks++;
        const ow = s.companions.equipped.waifu; if (ow) s.companions.owned[ow].bond++;
      }
      fixT -= dt;
      if (fixT <= 0) {
        fixT = 1;
        const vb = jobs.job('vibecoder');
        if (jobId === 'vibecoder') {
          if (vb.bugs > 0) for (let i = 0; i < 3; i++) jobs.action('vibecoder', 'fixBug');
          if (vb.decision) jobs.action('vibecoder', 'decide', vb.decision === 'botao' ? 'yes' : 'no');
        }
      }
      modeLeft -= dt;
      log.work += dt;
      if (modeLeft <= 0) { jobs.endSession(); mode = 'walk'; modeLeft = o.walk; }
    } else if (mode === 'walk') {
      modeLeft -= dt;
      log.walk += dt;
      if (modeLeft <= 0) mode = 'decide';
    } else if (mode === 'overhead') {
      modeLeft -= dt;
      log.over += dt;
      if (modeLeft <= 0) mode = 'decide';
    }

    // decisões nas fronteiras
    if (mode === 'decide') {
      if (t >= nextShop) { shop(); nextShop = t + 30; }
      // nível/prova concluído?
      if (goalMet()) {
        const ph = s.story.phase;
        const lvIdx = s.story.level;
        log.levels.push({ k: ph === 'exam' ? 'prova' : `L${lvIdx}`, sec: Math.round(t - levelStart), money: Math.round(s.dinheiro) });
        levelStart = t;
        if (ph === 'exam') break;
        if (s.story.level === 2 && !s.flags.notebookGift && o.metodo) s.flags.notebookGift = true; // o Vibecoder só abre na academia nova (tier >= 1)
        s.story.level++;
        s.flags.quaseLa = {};
        if (s.story.level > EXAMS[s.story.gym].afterLevel) s.story.phase = 'exam';
        if (s.story.phase === 'exam') {
          // objetivo da prova: usa os requisitos da prova (muscle 25, res 25, carisma 12)
        }
        startLevelHooks();
        mode = 'overhead';
        modeLeft = o.overhead;
        continue;
      }
      const wantWork = o.workShare > 0 && workSince !== null && (log.work < o.workShare * (t - workSince)) && chooseJob();
      if (wantWork) {
        jobId = chooseJob();
        jobs.setActive(jobId);
        jobs.startSession(jobId);
        mode = 'work';
        modeLeft = o.burst;
        fixT = 0;
        acc = 0;
      } else {
        curStat = pickTrain();
        if (!curStat) { mode = 'overhead'; modeLeft = 1; continue; }
        tr.start(machineFor(curStat));
        sessionReps = 0;
        mode = 'train';
      }
    }
  }
  if (t >= maxT) log.stuck = true;
  log.totalSec = Math.round(t);
  log.dinheiroFim = Math.round(s.dinheiro);
  log.totalDinheiro = Math.round(s.totalDinheiro);
  log.metodoSpent = Math.round(s.metodo.spent);
  log.cargo = { ent: jobs.job('uber').cargo, vib: jobs.job('vibecoder').cargo };
  log.earnedBy = { ent: Math.round(jobs.job('uber').earned), vib: Math.round(jobs.job('vibecoder').earned) };
  log.rank = s.rank;
  log.team = Object.fromEntries(Object.entries(s.companions.owned).map(([k, v]) => [k, `nv${v.level}/vínculo${CR.bondLevel(v.bond)}`]));
  log.stats = stats;
  log.metodoNodes = { ...s.metodo.nodes };
  log.ganhos = Math.round(s.totalGanhos);
  return log;
}

export function avg(opts, n = 5) {
  const runs = Array.from({ length: n }, (_, i) => simulate({ ...opts, seed: i + 1 }));
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return { runs, total: mean((r) => r.totalSec), train: mean((r) => r.train), work: mean((r) => r.work), levels: runs[0].levels.map((_, i) => mean((r) => r.levels[i]?.sec ?? NaN)), dinheiro: mean((r) => r.totalDinheiro), metodo: mean((r) => r.metodoSpent), stuck: runs.some((r) => r.stuck) };
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
  const f = (x) => (Number.isFinite(x) ? Math.round(x) : '-');
  const cps = Number(process.argv[3] ?? 4);
  console.log(`\n=== cps=${cps} | tempos em segundos (média de 5 execuções) ===`);
  console.log('cenário'.padEnd(34), 'L1'.padStart(5), 'L2'.padStart(5), 'L3'.padStart(5), 'prova'.padStart(6), 'total'.padStart(6), ' trab%  R$tot   Método');
  const rows = [
    ['SEM trabalho/Método/Equipe', { workShare: 0, metodo: false, team: false }],
    ['Método (só a cortesia), sem trabalho', { workShare: 0, metodo: true, team: false }],
    ['trabalho 10%', { workShare: 0.1 }],
    ['trabalho 20%', { workShare: 0.2 }],
    ['trabalho 30%', { workShare: 0.3 }],
    ['trabalho 45%', { workShare: 0.45 }],
    ['trabalho 60%', { workShare: 0.6 }],
    ['trabalho 30% só Uber', { workShare: 0.3, job: 'uber' }],
    ['trabalho 30% sem Equipe', { workShare: 0.3, team: false }],
  ];
  for (const [name, opt] of rows) {
    const a = avg({ cps, ...opt });
    const pct = a.total ? Math.round((a.work / a.total) * 100) : 0;
    console.log(name.padEnd(34), String(f(a.levels[0])).padStart(5), String(f(a.levels[1])).padStart(5), String(f(a.levels[2])).padStart(5), String(f(a.levels[3])).padStart(6), String(f(a.total)).padStart(6), `${String(pct).padStart(4)}%`, String(f(a.dinheiro)).padStart(7), String(f(a.metodo)).padStart(8), a.stuck ? ' (NÃO TERMINOU)' : '');
  }
}
