// Testes do Uber (Subaru Legacy azul): node test_uber.mjs <raiz do projeto>
//  - save antigo (Entregador) migra pra Uber; Vibecoder volta a ficar trancado na garagem
//  - passageiros: sempre tem gente no carro, nomes vêm da lista, grupo muda a cada corrida
//  - Vibecoder só abre quando o Luisão chega na academia nova
//  - a cena do carro monta e roda (DOM falso) sem erro
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.').split(path.sep).join('/');
const u = (p) => 'file:///' + root + '/' + p;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

let fails = 0;
const ok = (c, m) => {
  if (!c) { console.error('FALHOU:', m); fails++; } else console.log('ok -', m);
};

const { defaultState, migrate, SAVE_VERSION } = await import(u('src/core/GameState.js'));
const { Jobs } = await import(u('src/systems/Jobs.js'));
const { JOBS, PLAYABLE_JOBS } = await import(u('src/config/jobs.js'));
const { PASSENGERS, PASSENGER_BY_U, passengerName } = await import(u('src/config/passengers.js'));
const uber = await import(u('src/systems/jobs/uber.js'));
const { BALANCE } = await import(u('src/config/balance.js'));

// ── Config ────────────────────────────────────────────────────────
ok(JOBS.find((j) => j.id === 'uber')?.gym === 'garagem' && !JOBS.some((j) => j.id === 'entregador'), 'Uber é o trabalho da garagem e o Entregador saiu');
ok(JOBS.find((j) => j.id === 'vibecoder')?.gym === 'iron' && JOBS.find((j) => j.id === 'vibecoder')?.unlock === 'gym', 'Vibecoder abre na academia (Iron)');
ok(PLAYABLE_JOBS.includes('uber') && PLAYABLE_JOBS.includes('vibecoder') && PLAYABLE_JOBS.length === 2, 'empregos jogáveis: uber + vibecoder');
ok(Object.keys(BALANCE.jobs.uber.upgrades).join() === 'carro,agua,palheta,suporte,primo', 'upgrades do Uber');

// ── Lista de passageiros ──────────────────────────────────────────
ok(PASSENGERS.length >= 190, `lista de passageiros (${PASSENGERS.length})`);
ok(new Set(PASSENGERS.map((p) => p.u)).size === PASSENGERS.length, 'usuários únicos');
ok(PASSENGERS.every((p) => passengerName(p).trim().length > 0), 'todo passageiro tem nome (ou @usuário)');
ok(passengerName(PASSENGER_BY_U.t_wronski_) === 'wronski' && passengerName(PASSENGER_BY_U.fabricio_venturi) === 'Fabrício Venturi', 'nomes de exibição');
ok(passengerName(PASSENGER_BY_U.luigihagi) === '@luigihagi', 'sem nome de exibição usa o @');
ok(passengerName(PASSENGER_BY_U['aoi.y_ri']) === 'Wahnsinn' && passengerName(PASSENGER_BY_U.alexnacoleira) === 'alex', 'fontes estilizadas normalizadas');

// ── Save novo ─────────────────────────────────────────────────────
const fresh = defaultState();
ok(fresh.jobs.list.uber && !fresh.jobs.list.entregador && fresh.totals.rides === 0 && fresh.version === SAVE_VERSION, 'save novo tem Uber');

// ── Migração de um save v2 com Entregador ─────────────────────────
const old = defaultState();
old.version = 2;
delete old.jobs.list.uber;
old.jobs.list.entregador = { unlocked: true, cargo: 3, xp: 55, tasks: 400, earned: 9000, upgrades: { bike: 2, bag: 1, capa: 1, suporte: 3, molecada: 4 }, cappedWarned: '', progress: 5, deliveries: 42, rainUntil: 0, rushUntil: 0, nextEventAt: 0 };
old.jobs.list.vibecoder.unlocked = true;
old.jobs.list.vibecoder.cargo = 2;
old.jobs.main = 'vibecoder';
old.totals.deliveries = 42;
const mig = migrate(JSON.parse(JSON.stringify(old)));
const mu = mig.jobs.list.uber;
ok(!mig.jobs.list.entregador && mig.totals.deliveries === undefined, 'Entregador some do save');
ok(mu.unlocked && mu.cargo === 3 && mu.rides === 42 && mu.xp === 55 && mig.totals.rides === 42, 'progresso do Entregador virou o do Uber');
ok(mu.upgrades.carro === 2 && mu.upgrades.agua === 1 && mu.upgrades.palheta === 1 && mu.upgrades.suporte === 3 && mu.upgrades.primo === 4 && !mu.upgrades.bike, 'upgrades renomeados');
ok(mig.jobs.list.vibecoder.unlocked === false && mig.jobs.list.vibecoder.cargo === 2, 'Vibecoder trancado na garagem (progresso guardado)');
ok(mig.jobs.main === 'uber', 'principal que era o Vibecoder passa pro Uber');
const migIron = JSON.parse(JSON.stringify(old));
migIron.story.gym = 'iron';
ok(migrate(migIron).jobs.list.vibecoder.unlocked === true, 'no Iron o Vibecoder segue liberado');
const again = migrate(JSON.parse(JSON.stringify(mig)));
ok(again.jobs.list.uber.rides === 42 && again.jobs.list.uber.upgrades.carro === 2, 'migrar de novo não estraga');

// ── Passageiros e corridas ────────────────────────────────────────
const s = defaultState();
s.metodo.introSeen = true;
const handlers = {};
const bus = { emit: (e, d) => (handlers[e] ?? []).forEach((f) => f(d)), on: (e, f) => (handlers[e] ??= []).push(f) };
const game = { state: s, bus, mode: 'work' };
const jobs = new Jobs(game);
jobs.unlock('uber', false);
jobs.startSession('uber');
const js = jobs.job('uber');
const first = uber.ensureRiders(js);
ok(first.length >= 1 && first.length <= 3 && first.every((x) => PASSENGER_BY_U[x]), `carro nunca vazio: ${first.map((x) => passengerName(PASSENGER_BY_U[x])).join(', ')}`);
js.riders = [];
ok(uber.ensureRiders(js).length >= 1, 'lista vazia é repovoada');
js.riders = ['conta_que_nao_existe'];
ok(uber.ensureRiders(js).every((x) => PASSENGER_BY_U[x]), 'passageiro inexistente é descartado');

let rides = 0;
let prev = js.riders.join();
const seenSizes = new Set();
const seenNames = new Set();
let lastWho = null;
for (let i = 0; i < 6000 && rides < 300; i++) {
  s.playTime += 0.25;
  s.jobs.mind.fatigue = 0;
  const r = jobs.task('click');
  jobs.update(0.25);
  if (r.kind === 'ride') {
    rides++;
    lastWho = r.who;
    seenSizes.add(r.who.length);
    for (const w of r.who) seenNames.add(w.u);
    if (js.riders.join() === prev) { ok(false, 'o grupo trocou depois da corrida'); break; }
    if (js.riders.some((x) => r.who.some((w) => w.u === x))) { ok(false, 'quem desceu não embarca de novo na hora'); break; }
    if (!js.riders.length) { ok(false, 'carro ficou vazio'); break; }
    if (!(r.rating === 4 || r.rating === 5)) { ok(false, 'nota 4 ou 5'); break; }
    prev = js.riders.join();
  }
}
ok(rides >= 100, `${rides} corridas simuladas`);
ok(seenSizes.has(1) && seenSizes.has(2) && seenSizes.has(3) && seenSizes.size === 3, `grupos de 1, 2 e 3 passageiros (${[...seenSizes]})`);
ok(seenNames.size > 80, `muita gente diferente passou pelo carro (${seenNames.size} nomes)`);
ok(lastWho.every((w) => typeof w.name === 'string' && w.name.length), 'cada passageiro tem nome pra mostrar');
ok(js.rides === rides && s.totals.rides === rides, 'contadores de corrida');
ok(jobs.perTask('uber') > 0 && jobs.passiveRate('uber') >= 0, 'pagamento/passivo funcionam');

// ── Vibecoder só na academia nova ─────────────────────────────────
const s2 = defaultState();
s2.metodo.introSeen = true;
const jobs2 = new Jobs({ state: s2, bus, mode: 'play' });
jobs2.unlock('uber', false);
for (let i = 0; i < 20; i++) jobs2.update(1);
ok(!jobs2.isUnlocked('vibecoder'), 'na Garagem o Vibecoder segue trancado');
s2.notebookGift = true;
s2.flags.notebookGift = true;
s2.story.level = 3;
for (let i = 0; i < 5; i++) jobs2.update(1);
ok(!jobs2.isUnlocked('vibecoder'), 'nem com o notebook da Marlene (nível 3) ele abre');
const unlockedEvents = [];
bus.on('jobUnlocked', (e) => unlockedEvents.push(e));
s2.story.gym = 'iron';
for (let i = 0; i < 3; i++) jobs2.update(1);
ok(jobs2.isUnlocked('vibecoder'), 'chegando no Iron Temple o Vibecoder abre');
ok(unlockedEvents.some((e) => e.id === 'vibecoder' && e.announce === true), 'evento de desbloqueio com aviso');
ok(!jobs2.isUnlocked('instrutor') && !jobs2.isUnlocked('seguranca'), 'empregos sem módulo continuam fechados');
const s3 = defaultState();
s3.metodo.introSeen = true;
s3.debugTier = 1;
const jobs3 = new Jobs({ state: s3, bus, mode: 'play' });
for (let i = 0; i < 3; i++) jobs3.update(1);
ok(jobs3.isUnlocked('vibecoder'), 'F9 Camada 1 libera o Vibecoder pra testar');
const s4 = defaultState();
s4.story.gym = 'iron';
const jobs4 = new Jobs({ state: s4, bus, mode: 'play' });
for (let i = 0; i < 3; i++) jobs4.update(1);
ok(!jobs4.isUnlocked('vibecoder'), 'sem a apresentação do Método nada abre');

// ── A cena do carro (DOM falso) ───────────────────────────────────
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : () => ctx2d), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d, style: {} }) };
globalThis.window = { innerWidth: 1280, innerHeight: 720 };
const THREE = await import('three');
const { UberCar, CAR_ORIGIN } = await import(u('src/world/UberCar.js'));
const { GARAGE } = await import(u('src/config/gyms.js'));

const made = [];
const rigFactory = async (look) => {
  const g = new THREE.Group();
  g.scale.setScalar(0.9); // a altura da pessoa fica na escala do root (como no ProceduralRig)
  const head = new THREE.Object3D();
  head.position.y = 1.2;
  g.add(head);
  const rig = {
    look, object3D: g, state: '', t: 0, talking: false, target: null,
    setState(n) { this.state = n; }, lookAt(v) { this.target = v; }, update() {},
    get headWorld() { return head.getWorldPosition(new THREE.Vector3()); },
  };
  made.push(rig);
  return rig;
};
const scene = new THREE.Scene();
const car = new UberCar({ scene, def: GARAGE.uberSpot, loader: null, clips: {}, rigFactory });
ok(car.locked === true && car.pos.z <= 7.15 && car.hit.userData.workStation === 'uber', 'carro começa trancado, de pé na calçada, com área de clique');
ok(Math.hypot(car.pos.x - car.carPos.x, car.pos.z - car.carPos.z) < 2.5, 'ponto de entrada fica colado no carro');
ok(car.camPos.distanceTo(CAR_ORIGIN) < 3 && car.driverPos.distanceTo(car.camPos) < 2, 'câmera interna perto do motorista, bem longe do bairro');
ok(car.camPos.x > 1000, 'cena fica longe do bairro');
await car.warm();
ok(car.ready && made.length === 8, 'aparências dos passageiros prontas');
car.setActive(true);
car.setRiders(['t_wronski_', 'kairo.godoy', 'dorathetuxie'], true);
car.update(0.1);
let labels = car.labels();
ok(labels.length === 3 && labels.map((l) => l.name).join('|') === 'wronski|Kairo|Dora', `nomes na tela: ${labels.map((l) => l.name).join(', ')}`);
ok(labels.every((l) => l.pos.x > 1000) && labels[0].sub === '@t_wronski_', 'nomes projetados dentro do carro, com o @ embaixo');
const seats = car.entries.map((e) => e.seat.x).sort();
ok(new Set(seats).size === 3, 'cada passageiro num banco diferente');
ok(car.entries.every((e) => e.rig.state === 'seated' && e.rig.object3D.visible), 'passageiros sentados e visíveis');
ok(car.entries.every((e) => Math.abs(e.rig.object3D.scale.x - 0.9) < 1e-6), 'a animação de embarque preserva a altura da pessoa');
// troca de grupo com animação: quem estava desce, os novos chegam
car.setRiders(['luigihagi', '_dsliv'], false);
for (let i = 0; i < 60; i++) car.update(1 / 30);
labels = car.labels();
ok(labels.length === 2 && labels.map((l) => l.name).sort().join('|') === '@luigihagi|Liv', `grupo novo embarcou: ${labels.map((l) => l.name).join(', ')}`);
ok(car.entries.length === 2 && car.variants.filter((v) => v.used).length === 2, 'os antigos saíram e liberaram a aparência');
ok(made.filter((r) => r.object3D.visible).length === 2, 'só 2 passageiros visíveis');
// 300 trocas seguidas não vazam nem travam
for (let i = 0; i < 300; i++) {
  car.setRiders(uber.pickRiders({ recent: [] }), i % 7 === 0);
  car.update(0.05);
  car.update(0.5);
}
ok(car.entries.length >= 1 && car.entries.length <= 3 && car.variants.filter((v) => v.used).length === car.entries.length, 'trocas seguidas sem vazar aparência');
car.kick();
car.setRain(true);
const z0 = car.scroll[0].o.position.z;
for (let i = 0; i < 100; i++) car.update(0.05);
ok(car.scroll[0].o.position.z !== z0 && car.scroll.every((it) => it.o.position.z >= -81 && it.o.position.z <= 90), 'cenário passa pela janela e dá a volta');
car.attachDriver({ lookAt() {} });
for (let i = 0; i < 100; i++) car.update(0.05);
car.detachDriver();
car.setActive(false);
ok(car.interior.visible === false && car.domeLight.intensity === 0, 'saindo do carro a cena some e a luz apaga');
ok(scene.getObjectByName('uberCarScene') && scene.getObjectByName('uberCarExterior'), 'carro e cena estão na cena do jogo');

console.log(fails ? `\n${fails} TESTE(S) FALHARAM` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
