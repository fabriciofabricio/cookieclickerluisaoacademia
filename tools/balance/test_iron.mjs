// Testes do Iron Temple (academia 2): node test_iron.mjs <raiz do projeto>
//  - configuração (estações, NPCs, garotas 4–7, geradores, textos)
//  - o cenário monta com DOM falso; câmeras dentro da sala; colisão (vidro bloqueia, porta passa)
//  - upgrades e geradores aparecem sem erro; economia do Iron
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k in t ? t[k] : () => ctx2d), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d, style: {} }) };
globalThis.window = { innerWidth: 1280, innerHeight: 720 };

let fails = 0;
const ok = (c, m) => {
  if (!c) { console.error('FALHOU:', m); fails++; } else console.log('ok -', m);
};

const THREE = await import('three');
const { GYMS, IRON } = await import(u('src/config/gyms.js'));
const { LEVELS, EXAMS, GIRL_LOOKS, LEMBRANCAS } = await import(u('src/config/story.js'));
const { STR, hostStr, examTitle, gymCompleteTitle, eventText } = await import(u('src/i18n/pt-BR.js'));
const { BALANCE } = await import(u('src/config/balance.js'));
const { LOOKS } = await import(u('src/characters/Character.js'));
const { POSES, EXERCISES } = await import(u('src/characters/Poses.js'));
const { defaultState, migrate } = await import(u('src/core/GameState.js'));
const Eco = await import(u('src/systems/Economy.js'));
const Prog = await import(u('src/systems/Progression.js'));

// ── Configuração ──────────────────────────────────────────────────
ok(GYMS.iron === IRON && IRON.machines.length === 10, 'Iron Temple registrado com 10 estações');
const muscles = new Set(IRON.machines.map((m) => m.muscle));
ok(muscles.size === 10 && ['resistencia', 'carisma'].every((x) => muscles.has(x)), 'uma estação por músculo + Resistência + Carisma');
ok(IRON.machines.every((m) => m.gym === 'iron' && STR.machines[m.id]?.name && STR.machines[m.id]?.tip), 'toda estação tem nome e dica');
ok(IRON.machines.every((m) => POSES[m.anim]), 'toda estação tem pose');
ok(EXERCISES.has('bench') && POSES.treadmill, 'poses novas (supino e esteira)');
for (const k of ['ivone', 'kelly', 'brutus', 'frequentador1', 'frequentador2', 'frequentador3']) ok(!!LOOKS[k], `visual de ${k}`);
ok(hostStr('ivone').name === 'Dona Ivone' && hostStr('ivone').talk.length >= 4 && hostStr(undefined).name === 'Seu Zé', 'anfitriões por academia');
ok(examTitle('iron') === 'PROVA DO IRON TEMPLE' && gymCompleteTitle('iron').includes('IRON'), 'títulos da prova/conclusão do Iron');
ok(eventText('iron', 'golden').includes('Templo') && eventText('garagem', 'golden').includes('garagem'), 'eventos com texto por academia');
ok(BALANCE.generators.list.iron.length === 4 && BALANCE.generators.list.iron.every((g) => STR.generators[g.id]?.name), 'geradores do Iron com texto');
ok(STR.matheus.ironArrival?.length >= 3 && STR.travel.go.includes('{gym}'), 'falas de chegada e viagem');

// Garotas 4–7: encontros completos
for (const lv of LEVELS.filter((l) => l.gym === 'iron')) {
  const gf = STR.girlfriends[lv.girl];
  const full = gf.greeting && gf.tip && gf.win && gf.lose && gf.lembranca && gf.bestLine && gf.lines?.length >= 3 && gf.breakup?.length === 3;
  const rounds = gf.rounds?.length === 3 && gf.rounds.every((r) => r.options.length === 3 && r.options.map((o) => o.score).sort().join() === '0,1,2');
  ok(full && rounds && GIRL_LOOKS[lv.girl] && LEMBRANCAS[lv.girl], `encontro completo: ${gf.name} (nível ${lv.level})`);
  // A melhor resposta não pode estar sempre na mesma posição
  const pos = gf.rounds.map((r) => r.options.findIndex((o) => o.score === 2));
  ok(new Set(pos).size > 1, `${gf.name}: a melhor resposta muda de lugar`);
}
ok(EXAMS.garagem.next === 'iron' && !EXAMS.iron.extra, 'prova da garagem leva pro Iron; a do Iron é só de shape');

// ── Economia no Iron ──────────────────────────────────────────────
const s = defaultState();
s.story.gym = 'iron';
ok(Eco.availableGenerators(s).length === 8, 'no Iron dá pra comprar geradores da garagem e do Iron');
ok(Eco.currentMachines(s).length === 10 && Eco.currentMachines(s)[0].id.startsWith('i_'), 'aba Máquinas mostra as do Iron');
ok(Eco.upgradeCost('i_peito', 0) === BALANCE.gyms.iron.upgradeBase && Eco.upgradeMax('i_peito') === 12, 'upgrade das estações do Iron');
ok(IRON.machines.every((m) => s.machines[m.id]), 'save novo já tem as estações do Iron');
const old = migrate({ version: 3, muscles: defaultState().muscles, story: { level: 3, gym: 'garagem' }, machines: { g_peito: { upgrade: 4, used: true, pr: 0, reps: 9 } } });
ok(old.machines.i_peito && old.machines.g_peito.upgrade === 4 && old.story.arrived.garagem === true, 'save antigo ganha as estações do Iron e mantém as da garagem');
s.story.level = 4;
s.story.phase = 'train';
ok(Prog.currentGoal(s).girl === 'camila', 'no Iron o objetivo do nível 4 é a Camila');

// ── O cenário ─────────────────────────────────────────────────────
const { IronTemple } = await import(u('src/world/IronTemple.js'));
const loader = { pbr: async () => ({}), loadGLTF: async () => null };
const w = new IronTemple(loader, {});
await w.build();
ok(w.machines.size === 10 && [...w.machines.values()].every((m) => m.hit && m.camPos && m.camLook && m.promptPos), 'estações montadas com clique e câmera');
const { x0, x1, z0, z1, h } = IRON.size;
for (const m of w.machines.values()) {
  const c = m.camPos;
  const inside = c.x > x0 + 0.15 && c.x < x1 - 0.15 && c.z > z0 + 0.15 && c.z < z1 - 0.15 && c.y < h - 0.2;
  ok(inside, `câmera da ${m.def.id} dentro da sala (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
}
// O Luisão alcança cada estação (auto-caminhada para a 0,85 m da estação)
for (const m of w.machines.values()) {
  const p = m.pos.clone();
  w.collide(p, 0.32);
  ok(p.distanceTo(m.pos) < 0.85, `${m.def.id}: dá pra chegar na estação (${p.distanceTo(m.pos).toFixed(2)} m)`);
}
// NPCs e pontos especiais fora de obstáculos
const spots = { spawn: [IRON.spawn.x, IRON.spawn.z], matheus: IRON.npcs.matheus.pos, ivone: IRON.npcs.seuze.pos, personal: IRON.personalWait.pos, uber: IRON.uberSpot.stand, date: IRON.dateSpot.center };
for (const [k, [x, z]] of Object.entries(spots)) {
  const p = new THREE.Vector3(x, 0, z);
  w.collide(p, 0.32);
  ok(Math.hypot(p.x - x, p.z - z) < 0.2, `${k} em lugar livre`);
}
// Vidro da fachada bloqueia, a porta deixa passar
const through = (x) => {
  const p = new THREE.Vector3(x, 0, z1 - 0.4);
  for (let i = 0; i < 60; i++) {
    p.z += 0.05;
    w.collide(p, 0.32);
  }
  return p.z;
};
ok(through(-5) < z1, 'o vidro da fachada segura o Luisão');
ok(through(0) > z1 + 1.5, 'a porta deixa sair pra calçada (pro Uber e pros encontros)');
// Upgrades e geradores
let err = null;
try {
  for (const m of w.machines.values()) for (let lv = 0; lv <= 12; lv++) w.setMachineLevel(m.def.id, lv);
  for (const g of BALANCE.generators.list.iron) for (const n of [1, 5, 10, 25, 0, 30]) w.setGeneratorVisual(g.id, n);
  w.setGeneratorVisual('g_shake', 3); // da garagem: ignorado aqui
  w.setBeltRunning('i_cardio', true);
  for (let i = 0; i < 200; i++) w.update(0.05);
  w.creak('i_peito');
  for (let i = 0; i < 20; i++) w.update(0.05);
} catch (e) {
  err = e;
}
ok(!err, `upgrades, geradores e animações sem erro${err ? ': ' + err.message : ''}`);
const nObs = w.obstacles.length;
for (let i = 0; i < 5; i++) for (const g of BALANCE.generators.list.iron) w.setGeneratorVisual(g.id, 10 + i);
ok(w.obstacles.length === nObs, 'trocar a quantidade de gerador não acumula colisão');
ok(w.machines.get('i_peito').group.position.distanceTo(w.machines.get('i_peito').pos) < 1e-6, 'máquina volta pro lugar depois de tremer');
ok(w.radioPos && w.cameraColliders.length > 5 && w.floorMeshes.length >= 2, 'som ambiente, colisores de câmera e piso');

console.log(fails ? `\n${fails} TESTE(S) FALHARAM` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
