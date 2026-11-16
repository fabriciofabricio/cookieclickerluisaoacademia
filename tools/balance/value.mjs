import { avg } from './sim.mjs';
const f = (x) => Math.round(x);
const base = avg({ cps: 4, workShare: 0, metodo: false, team: false }, 6).total;
console.log(`baseline: ${f(base)} s\n`);
const items = [
  ['tec_execucao ×3 (+45% progresso)', { grant: { tec_execucao: 3 } }],
  ['tec_carga ×3 (+60% Ganhos)', { grant: { tec_carga: 3 } }],
  ['tec_pico ×3 (+4,5% crítico)', { grant: { tec_pico: 3 } }],
  ['rot_descanso ×3 (+36% recuperação)', { grant: { rot_descanso: 3 } }],
  ['rot_pump ×3 (+3 reps de PUMP)', { grant: { rot_pump: 3 } }],
  ['rot_split ×3 (+30% e +30 s)', { grant: { rot_split: 3 } }],
  ['lab_papo ×3 (+36% Carisma)', { grant: { lab_papo: 3 } }],
  ['Cleiton nv3 (+36% Ganhos)', { grantTeam: { cleiton: 3 } }],
  ['Aiko nv3 (−12% fadiga, PUMP+3)', { grantTeam: { aiko: 3 } }],
];
for (const [name, g] of items) {
  const a = avg({ cps: 4, workShare: 0, metodo: false, team: false, ...g }, 6);
  console.log(name.padEnd(40), String(f(a.total)).padStart(5), ' s ', `${((a.total / base - 1) * 100).toFixed(1)}%`.padStart(7));
}
