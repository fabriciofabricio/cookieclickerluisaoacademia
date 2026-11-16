// R$ por minuto de cada emprego isolado: ciclos de 45 s trabalhando / 15 s descansando (cansaço mental recupera).
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { defaultState } = await import(u('src/core/GameState.js'));
const Prog = await import(u('src/systems/Progression.js'));
const { Jobs } = await import(u('src/systems/Jobs.js'));
const { BALANCE } = await import(u('src/config/balance.js'));
let seed = 3; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cps = Number(process.argv[3] ?? 4), res = Number(process.argv[4] ?? 5), car = Number(process.argv[5] ?? 4);
for (const id of ['uber', 'vibecoder']) {
  const s = defaultState();
  s.muscles.resistencia.level = res; s.muscles.carisma.level = car;
  const bus = { emit() {}, on() {} };
  const game = { state: s, bus, mode: 'work' };
  const jobs = new Jobs(game);
  jobs.unlock(id); jobs.startSession(id);
  let t = 0, acc = 0, last = 0, lastCargo = 1;
  const rows = [];
  for (let min = 1; min <= 12; min++) {
    const m0 = s.dinheiro;
    for (let i = 0; i < 600; i++) {
      t += 0.1; s.playTime = t;
      const phase = (t % 60) < 45;
      game.mode = phase ? 'work' : 'train';
      const mods = Prog.computeMods(s);
      jobs.update(0.1, mods);
      if (phase) { acc += cps * 0.1; while (acc >= 1) { acc--; jobs.task('click'); } }
      else jobs.onGymRep();
      if (id === 'vibecoder') { const vb = jobs.job(id); if (vb.bugs && phase && i % 10 === 0) for (let k = 0; k < 3; k++) jobs.action(id, 'fixBug'); if (vb.decision && phase) jobs.action(id, 'decide', vb.decision === 'botao' ? 'yes' : 'no'); }
    }
    const js = jobs.job(id);
    rows.push(`min ${String(min).padStart(2)}: +R$${String(Math.round(s.dinheiro - m0)).padStart(6)}  cargo ${js.cargo}  passivo ${String(Math.round(jobs.passiveRate(id) * 60)).padStart(5)}/min` + (id === 'vibecoder' ? `  feat ${js.features} cli ${js.clients} bugs ${js.bugs}` : `  corridas ${js.rides}`));
  }
  console.log(`\n${id} (cps ${cps}, Resist ${res}, Carisma ${car})\n` + rows.join('\n'));
}
