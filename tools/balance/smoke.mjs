// Teste de fumaça da lógica (sem DOM): node smoke.mjs <raiz do projeto>
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { defaultState, migrate } = await import(u('src/core/GameState.js'));
const MT = await import(u('src/systems/Metodo.js'));
const CR = await import(u('src/systems/CompanionRules.js'));
const Prog = await import(u('src/systems/Progression.js'));
const { Jobs } = await import(u('src/systems/Jobs.js'));
const { BALANCE } = await import(u('src/config/balance.js'));
const { NODES } = await import(u('src/config/metodo.js'));

const events = [];
const bus = { emit: (e, d) => events.push([e, d]), on() {} };
const s = defaultState();
const game = { state: s, bus, mode: 'work' };
const jobs = new Jobs(game);
const assert = (c, m) => { if (!c) { console.error('FALHOU:', m); process.exitCode = 1; } else console.log('ok -', m); };

// Migração v1
const m = migrate({ version: 1, skillPoints: 3, muscles: defaultState().muscles, story: { level: 2 } });
assert(m.dinheiro > 0 && m.skillPoints === undefined && m.version === 3, `migração: ${m.dinheiro} R$`);

// Método
s.metodo.introSeen = true;
s.metodo.nodes.tec_execucao = 1;
assert(MT.nextCost(s, 'tec_execucao') === Math.ceil(120 * 1.5), 'custo nv2 execução');
assert(MT.status(s, 'tec_falha').reason === 'tier', 'técnica do Iron travada na garagem');
s.dinheiro = 1e6;
for (let i = 0; i < 5; i++) MT.buy(s, 'tec_execucao');
assert(MT.level(s, 'tec_execucao') === 4, 'execução trava no nv 4 na garagem (40% da árvore)');
assert(Math.abs(MT.effects(s).progress - 0.6) < 1e-9, 'efeito +60% progresso');
const mods = Prog.computeMods(s);
assert(Math.abs(mods.progress - 1.6) < 1e-9, 'computeMods progress');
let garageTotal = 0;
for (const n of NODES) {
  const caps = MT.capsOf(n);
  for (let L = 0; L < caps[0]; L++) garageTotal += Math.ceil(n.base * Math.pow(1.5, L));
}
console.log('  custo total da camada da garagem: R$', garageTotal);
s.debugTier = 1;
assert(MT.status(s, 'tec_execucao').ok, 'com camada iron sobe mais');
s.debugTier = null;
s.dinheiro = 0;

// Trabalho: uber
jobs.unlock('uber');
assert(s.jobs.main === 'uber', 'primeiro emprego vira principal');
jobs.startSession('uber');
let money0 = s.dinheiro;
let tasks = 0;
for (let i = 0; i < 600; i++) { jobs.task(); tasks++; s.playTime += 0.25; if (i % 4 === 0) jobs.update(1); }
const ent = jobs.job('uber');
console.log(`  600 tarefas (~2,5 min): R$ ${Math.round(s.dinheiro - money0)} • cargo ${ent.cargo} • corridas ${ent.rides} • cansaço ${s.jobs.mind.fatigue.toFixed(2)}`);
assert(ent.cargo >= 2 && ent.cargo <= 4, 'promoções acontecem e respeitam o teto');
assert(events.some(([e]) => e === 'promotion'), 'evento de promoção');
s.playTime += 40;
assert(jobs.endSession() === true && s.buffs.descansoAtivoUntil > s.playTime, 'Descanso Ativo');
assert(Prog.computeMods(s).pumpReps === 12, 'PUMP de 12 reps no Descanso Ativo');

// Vibecoder
jobs.unlock('vibecoder');
jobs.startSession('vibecoder');
s.jobs.mind.fatigue = 0;
for (let i = 0; i < 400; i++) { jobs.task(); s.playTime += 0.25; jobs.update(0.25); }
const vb = jobs.job('vibecoder');
console.log(`  vibecoder: features ${vb.features} • clientes ${vb.clients} • bugs ${vb.bugs} • MRR/min R$ ${Math.round(jobs.passiveRate('vibecoder') * 60)}`);
assert(vb.features >= 3 && vb.clients >= 3, 'features e clientes');
if (vb.bugs > 0) { for (let i = 0; i < 3; i++) jobs.action('vibecoder', 'fixBug'); }
vb.decision = 'sexta';
jobs.action('vibecoder', 'decide', 'yes');
assert(vb.decision === null, 'decisão resolvida');
const off = jobs.offlineEarnings(3600);
console.log(`  offline 1 h: R$ ${Math.round(off.money)}`);
assert(off.money > 0, 'ganho offline de dinheiro');

// Main switch cooldown
const r1 = jobs.setMain('vibecoder');
const r2 = jobs.setMain('uber');
assert(r1.ok && !r2.ok && r2.wait > 0, 'aviso prévio na troca de principal');

// Upgrades
s.dinheiro = 1e5;
assert(jobs.buyUpgrade('uber', 'carro'), 'compra upgrade');
assert(jobs.upgradeStatus('uber', 'palheta').reason !== 'max', 'status upgrade');

// Equipe
s.companions.owned.cleiton = { level: 1, bond: 0, momento: false };
s.companions.equipped.personal = 'cleiton';
s.companions.owned.aiko = { level: 2, bond: 500, momento: false };
s.companions.equipped.waifu = 'aiko';
const ce = CR.effects(s);
console.log('  equipe:', JSON.stringify({ personalGanhos: ce.personalGanhos.toFixed(3), fatigueCut: ce.fatigueCut.toFixed(3), pump: ce.pumpRepsAdd }));
assert(ce.soMaisUma && ce.personalGanhos > 0.12 && ce.fatigueCut > 0.08, 'efeitos da equipe');
assert(CR.activePair(s)?.id === 'animada', 'química Cleiton + Aiko');
const m2 = Prog.computeMods(s);
assert(m2.fatigueGain < 1 && m2.mindGain < 1 && m2.click > 1, 'mods da equipe no computeMods');
assert(CR.levelStatus(s, 'aiko').ok, 'pode evoluir a Aiko');

// Treino com mods
const { Training } = await import(u('src/systems/Training.js'));
const tr = new Training(s, bus);
const { GYMS } = await import(u('src/config/gyms.js'));
tr.start(GYMS.garagem.machines[0]);
let crits = 0;
for (let i = 0; i < 22; i++) { const r = tr.rep('click'); if (r.soMaisUma) crits++; s.playTime += 0.2; }
assert(crits >= 2, `SÓ MAIS UMA disparou ${crits}x em 22 reps`);
console.log(process.exitCode ? 'ALGUM TESTE FALHOU' : 'TUDO OK');
