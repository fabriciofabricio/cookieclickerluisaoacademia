// uso: node tune.mjs <raiz> <cps> '<json de overrides>'
// overrides: { "rank.stipendSec": 4, "nodeBase": 2, "hire": 2, "levelBase": 1 }  (caminhos em BALANCE ou multiplicadores)
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
const { avg } = await import('./sim.mjs');
const { BALANCE } = await import(u('src/config/balance.js'));
const { NODES } = await import(u('src/config/metodo.js'));
const { COMPANIONS } = await import(u('src/config/companions.js'));
const cps = Number(process.argv[3] ?? 4);
const ovr = JSON.parse(process.argv[4] ?? '{}');
const base = { nodes: NODES.map((n) => n.base), hire: COMPANIONS.map((c) => c.hire), lvl: COMPANIONS.map((c) => c.levelBase) };
for (const [k, v] of Object.entries(ovr)) {
  if (k === 'nodeBase') NODES.forEach((n, i) => (n.base = base.nodes[i] * v));
  else if (k === 'hire') COMPANIONS.forEach((c, i) => (c.hire = base.hire[i] * v));
  else if (k.startsWith('val.')) NODES.find((n) => n.id === k.slice(4)).value = v;
  else if (k.startsWith('mult.')) { const [, node] = k.split('.'); }
  else if (k === 'levelBase') COMPANIONS.forEach((c, i) => (c.levelBase = base.lvl[i] * v));
  else { const p = k.split('.'); let o = BALANCE; while (p.length > 1) o = o[p.shift()]; o[p[0]] = v; }
}
const f = (x) => (Number.isFinite(x) ? Math.round(x) : '-');
const shares = [0, 0.08, 0.15, 0.22, 0.3, 0.45];
console.log(`cps=${cps} overrides=${JSON.stringify(ovr)}`);
console.log('trab%'.padEnd(7), 'L1'.padStart(5), 'L2'.padStart(5), 'L3'.padStart(5), 'prova'.padStart(6), 'TOTAL'.padStart(6), ' vs base  R$ganho  Método  gasto%');
const baseline = avg({ cps, workShare: 0, metodo: false, team: false }, 12).total;
let best = null;
for (const w of shares) {
  const a = avg({ cps, workShare: w }, 12);
  const realPct = a.total ? Math.round((a.work / a.total) * 100) : 0;
  const delta = Math.round((a.total / baseline - 1) * 100);
  const spent = a.runs.reduce((x, r) => x + r.spent.metodo + r.spent.team + r.spent.jobs, 0) / a.runs.length;
  const earn = a.dinheiro;
  console.log(`${String(realPct).padStart(4)}%  `, String(f(a.levels[0])).padStart(5), String(f(a.levels[1])).padStart(5), String(f(a.levels[2])).padStart(5), String(f(a.levels[3])).padStart(6), String(f(a.total)).padStart(6), `${(delta > 0 ? '+' : '') + delta}%`.padStart(7), String(f(earn)).padStart(8), String(f(a.metodo)).padStart(7), `${earn ? Math.round((spent / earn) * 100) : 0}%`.padStart(6));
  if (!best || a.total < best.t) best = { t: a.total, w: realPct };
}
console.log(`baseline (nada): ${f(baseline)} s | melhor: ${best.w}% trabalhando → ${f(best.t)} s (${Math.round((best.t / baseline - 1) * 100)}% vs baseline)`);
