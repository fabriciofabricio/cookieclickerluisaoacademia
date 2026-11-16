// Ritmo do Iron Temple (níveis 4–7 + prova), a partir da chegada: node iron.mjs <raiz> [cps]
import { avg } from './sim.mjs';
const cps = Number(process.argv[3] ?? 4);
const f = (x) => (Number.isFinite(x) ? Math.round(x / 60 * 10) / 10 : '-');
console.log(`\n=== Iron Temple • ${cps} cliques/s • minutos por nível (média de 4 execuções) ===`);
console.log('cenário'.padEnd(30), 'L4'.padStart(6), 'L5'.padStart(6), 'L6'.padStart(6), 'L7'.padStart(6), 'prova'.padStart(6), 'TOTAL'.padStart(7), ' trab%');
for (const [name, opt] of [
  ['sem trabalho/Método/Equipe', { workShare: 0, metodo: false, team: false }],
  ['trabalho 12%', { workShare: 0.12 }],
  ['trabalho 20%', { workShare: 0.2 }],
  ['trabalho 30%', { workShare: 0.3 }],
]) {
  const a = avg({ gym: 'iron', cps, maxMin: 240, ...opt }, 4);
  const pct = a.total ? Math.round((a.work / a.total) * 100) : 0;
  console.log(name.padEnd(30), ...a.levels.slice(0, 5).map((x) => String(f(x)).padStart(6)), String(f(a.total)).padStart(7), `${String(pct).padStart(4)}%`, a.stuck ? ' (NÃO TERMINOU em 4 h)' : '');
}
console.log('\nAlvo (balance.levelTargetMin / examTargetMin): L4 9 • L5 11 • L6 13 • L7 15 • prova 10 min');
