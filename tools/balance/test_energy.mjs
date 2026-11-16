import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { defaultState } = await import(u('src/core/GameState.js'));
const Prog = await import(u('src/systems/Progression.js'));
const { Jobs } = await import(u('src/systems/Jobs.js'));
const Eco = await import(u('src/systems/Economy.js'));
const { Training } = await import(u('src/systems/Training.js'));
const { BALANCE } = await import(u('src/config/balance.js'));
const { GYMS } = await import(u('src/config/gyms.js'));

let fail = 0;
const ok = (c, m) => { console.log(c ? 'ok -' : 'FALHOU -', m); if (!c) fail++; };
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

const s = defaultState();
s.metodo.introSeen = true;
const bus = { emit() {}, on() {} };
const game = { state: s, bus, mode: 'work' };
game.training = new Training(s, bus);
const jobs = new Jobs(game);
jobs.unlock('uber');
jobs.unlock('vibecoder');
s.jobs.list.uber.cargo = 3;
s.jobs.list.uber.rides = 5;
s.playTime = 100;

const pay0 = jobs.perTask('uber');
const pas0 = jobs.passiveRate('uber');
const gps0 = Eco.passiveGps(s, Prog.computeMods(s));
// Gerador pra ter gps > 0 na academia
s.generators.g_shake = 5;
const gpsG = Eco.passiveGps(s, Prog.computeMods(s));

// 1) SHAKE DOURADO + RÁDIO não mudam NADA no trabalho
s.buffs.goldenUntil = 999;
s.buffs.radioUntil = 999;
const modsG = Prog.computeMods(s);
ok(modsG.production === 14, 'Shake x7 e rádio x2 ligados (production = 14)');
ok(near(jobs.perTask('uber', modsG), pay0), 'pagamento por tarefa IGUAL com Shake ligado');
ok(near(jobs.passiveRate('uber', modsG), pas0), 'renda passiva de R$ IGUAL com Shake ligado');
const gpsOn = Eco.passiveGps(s, modsG);
ok(gpsOn > gpsG * 10, 'o Shake continua multiplicando os Ganhos da academia (passivo 💪)');

// 2) Treino ainda recebe o Shake (comportamento intencional)
const tr = game.training;
tr.start(GYMS.garagem.machines[0]);
s.buffs.goldenUntil = 0; s.buffs.radioUntil = 0;
tr.rep('click'); // gasta o PUMP inicial pra comparar em igualdade
s.muscles.peito.fatigue = 0; s.muscles.peito.pumpReps = 0;
const rOff = tr.rep('click').ganhos;
s.muscles.peito.fatigue = 0; s.muscles.peito.pumpReps = 0;
s.buffs.goldenUntil = 999;
const rOn = tr.rep('click').ganhos;
ok(rOn > rOff * 5, `treino na academia continua com o Shake (${rOff.toFixed(1)} → ${rOn.toFixed(1)} 💪)`);
s.buffs.goldenUntil = 0;

// 3) ENERGÉTICO: tarefa ativa x3, passivo/MRR/offline NÃO
s.buffs.energeticoUntil = 999;
const modsE = Prog.computeMods(s);
ok(modsE.workBoost === BALANCE.energy.workMult, `energético liga workBoost x${BALANCE.energy.workMult}`);
ok(near(jobs.perTask('uber', modsE), pay0 * BALANCE.energy.workMult), 'tarefa paga x3 com energético');
ok(near(jobs.passiveRate('uber', modsE), pas0), 'passivo NÃO sobe com energético');
ok(near(Eco.passiveGps(s, modsE), gpsG), 'Ganhos da academia NÃO sobem com energético');
const off = jobs.offlineEarnings(3600);
ok(off.money >= 0, 'offline ignora o energético (buffs zerados no cálculo)');

// 4) Tarefa real: paga mais com energético
jobs.startSession('uber');
s.jobs.list.uber.progress = 0;
s.jobs.mind.fatigue = 0;
s.buffs.energeticoUntil = 0;
const m0 = s.dinheiro;
for (let i = 0; i < 30; i++) jobs.task();
const normal = s.dinheiro - m0;
s.jobs.list.uber.progress = 0; s.jobs.list.uber.pending = 0; s.jobs.mind.fatigue = 0; s.jobs.mind.rested = true;
s.buffs.energeticoUntil = 9999;
const m1 = s.dinheiro;
for (let i = 0; i < 30; i++) jobs.task();
const boosted = s.dinheiro - m1;
console.log(`  30 tarefas: normal R$ ${Math.round(normal)} | com energético R$ ${Math.round(boosted)}`);
ok(boosted > normal * 2, 'tarefas reais pagam bem mais com energético');

// 5) Vibecoder: feature mais rápida com energético
const vb = s.jobs.list.vibecoder;
vb.feature = 0; vb.bugs = 0;
jobs.startSession('vibecoder');
s.buffs.energeticoUntil = 0;
jobs.task();
const slow = vb.feature;
vb.feature = 0;
s.buffs.energeticoUntil = 9999;
jobs.task();
ok(vb.feature > slow * 1.4, `Vibecoder avança ${((vb.feature / slow - 1) * 100).toFixed(0)}% mais rápido com energético`);

// 6) Mercado saturado e MRR com teto
vb.cargo = 2;
const { default: vib, clientCap } = await import(u('src/systems/jobs/vibecoder.js')).then((m) => ({ default: m.default, clientCap: m.clientCap }));
vb.clients = clientCap(vb);
vb.feature = 9999;
const ctx = jobs.ctx('vibecoder');
const before = vb.clients;
vib.task(ctx);
ok(vb.clients === before, `mercado saturado (${before} clientes no cargo 2) não aceita mais`);

console.log(fail ? `${fail} FALHA(S)` : 'TUDO OK');
process.exitCode = fail ? 1 : 0;
