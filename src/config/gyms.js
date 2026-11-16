// Layout e máquinas de cada academia.
// Coordenadas em metros. yaw = 0 → personagem olhando pra +Z (pro portão).
// cam: posição da câmera cinematográfica relativa à estação (já girada pelo yaw).

const PI = Math.PI;

export const GARAGE = {
  id: 'garagem',
  size: { x0: -6, x1: 6, z0: -4.5, z1: 4.5, h: 3.2 },
  gate: { x0: -3.5, x1: 3.5 },
  spawn: { x: 0, z: 2.6, yaw: PI },
  machines: [
    {
      id: 'g_peito', muscle: 'peito', anim: 'pushup', sound: 'thump', prop: 'towel',
      pos: [-3.4, -2.3], yaw: PI / 2, cam: [-2.0, 1.1, 1.1], look: [0, 0.35, 0.8],
    },
    {
      id: 'g_costas', muscle: 'costas', anim: 'pullup', sound: 'clank', prop: 'gatebar',
      pos: [2.6, 4.05], yaw: PI, cam: [2.0, 1.9, 2.4], look: [0, 1.9, 0],
    },
    {
      id: 'g_ombros', muscle: 'ombros', anim: 'press', sound: 'slosh', prop: 'jugs',
      pos: [0.0, -2.9], yaw: 0, cam: [1.8, 1.7, 2.3], look: [0, 1.5, 0],
    },
    {
      id: 'g_biceps', muscle: 'biceps', anim: 'curl', sound: 'thump', prop: 'bucket',
      pos: [2.9, -2.6], yaw: 0, cam: [-1.4, 1.5, 2.0], look: [0, 1.2, 0],
    },
    {
      id: 'g_triceps', muscle: 'triceps', anim: 'dip', sound: 'thump', prop: 'chairs',
      pos: [4.95, 0.4], yaw: -PI / 2, cam: [1.6, 1.3, 2.2], look: [0, 0.8, 0],
    },
    {
      id: 'g_abdomen', muscle: 'abdomen', anim: 'crunch', sound: 'thump', prop: 'cardboard',
      pos: [-1.9, 1.7], yaw: 0, cam: [1.8, 1.4, -1.2], look: [0, 0.3, -0.9],
    },
    {
      id: 'g_pernas', muscle: 'pernas', anim: 'squat', sound: 'thump', prop: 'cementbag',
      pos: [1.8, 1.2], yaw: 0, cam: [1.7, 1.4, 2.3], look: [0, 1.0, 0],
    },
    {
      id: 'g_panturrilhas', muscle: 'panturrilhas', anim: 'calf', sound: 'thump', prop: 'steps',
      pos: [-5.15, -2.8], yaw: -PI / 2, cam: [1.5, 1.2, 2.1], look: [0, 0.7, 0],
    },
    {
      id: 'g_cardio', muscle: 'resistencia', anim: 'jacks', sound: 'step', prop: 'sidewalkmark',
      pos: [-2.4, 5.8], yaw: PI, cam: [1.6, 1.6, 3.0], look: [0, 1.1, 0],
    },
    {
      id: 'g_social', muscle: 'carisma', anim: 'talk', sound: 'chat', prop: 'neighbors',
      pos: [2.5, 5.7], yaw: 0, cam: [-2.0, 1.7, -1.2], look: [0, 1.5, 0.8],
    },
  ],
  npcs: {
    matheus: { pos: [-4.5, 2.5], yaw: PI / 2 + 0.3 },
    seuze: { pos: [5.0, -1.9], yaw: -PI / 2 },
    dog: { pos: [-5.1, 0.3], yaw: 0.6 },
    neighborA: { pos: [2.1, 6.75], yaw: PI - 0.3 },
    neighborB: { pos: [3.05, 6.6], yaw: PI + 0.5 },
    brayan: { pos: [0, 5.6], yaw: PI },
  },
  // Onde o Shake Dourado pode aparecer.
  goldenSpots: [
    [-0.6, 0.2], [0.8, -1.2], [-3.4, 0.0], [3.6, 2.2], [-1.2, 3.2], [0.4, 5.4], [-4.2, 5.6], [4.6, 5.8], [-2.8, -0.6], [2.2, -0.8],
  ],
  // Mesa da queda de braço (aparece só na prova).
  armwrestleTable: [0, 0.6],
  // Estação do Vibecoder (caixote + notebook velho da Marlene), pertinho do Matheus. Só abre na academia nova.
  // Mesmo formato das máquinas: cam/look relativos e girados pelo yaw.
  workStation: { pos: [-3.3, 3.55], yaw: PI, cam: [-1.35, 1.45, 2.15], look: [0, 0.82, -0.25] },
  // Subaru Legacy azul do Uber, estacionado no meio-fio da frente do portão (olhando pra -X, carona na calçada).
  // stand = onde o Luisão fica de pé pra entrar (borda da calçada); car = centro do carro; yaw do carro.
  uberSpot: { stand: [-1.5, 7.0], standYaw: 0, car: [-1.5, 8.95], yaw: -PI / 2 },
  // Canto do Matheus (evolui com o dinheiro investido no Método).
  matheusCorner: { notebook: [-4.85, 2.1], board: [-5.9, 1.75], ring: [-5.35, 3.0], banner: [-5.93, 2.6] },
  // Onde o personal ainda não contratado espera (no portão).
  personalWait: { pos: [0.9, 5.05], yaw: PI },
  // Dono da academia (o "slot" seuze do jogo): Seu Zé, sentado no banquinho.
  host: 'seuze',
  hostIdle: 'sit',
  // Quem conversa com o Luisão na estação de Carisma (os atores vizinha/vizinho).
  socialLooks: { a: 'vizinha', b: 'vizinho' },
  // Encontros e términos acontecem na calçada, vistos de dentro pelo portão.
  dateSpot: { center: [-0.2, 6.15], cam: [-0.2, 1.7, 3.6] },
  passersbyZ: 16.4,
  // Áreas cobertas (a câmera nunca passa do teto): garagem e a sacada sobre a calçada.
  ceilings: [
    { x0: -6.0, x1: 6.0, z0: -4.5, z1: 4.5, y: 3.2 },
    { x0: -3.6, x1: 3.6, z0: 4.5, z1: 5.95, y: 3.3 },
  ],
  // Áreas onde dá pra andar (o resto é parede/rua).
  walkBounds: { x0: -6.8, x1: 6.8, z0: -4.2, z1: 7.15 },
  // Pontos de câmera da revelação (fly-through) da academia.
  flythrough: [
    { pos: [0, 2.4, 13], look: [0, 1.4, 4] },
    { pos: [0, 2.2, 6.5], look: [0, 1.4, 0] },
    { pos: [-3.5, 2.6, 2.5], look: [2, 1.0, -2.5] },
    { pos: [3.5, 2.3, 1.5], look: [-1, 1.2, -1.5] },
  ],
};

// ════════════════════════════════════════════════════════════════
//  IRON TEMPLE — academia de verdade: piso de borracha, parede de espelho,
//  neon roxo/vermelho, fachada de vidro pra avenida. A dona é a Dona Ivone
//  "Ferro" (ex-campeã de fisiculturismo). O Brayan vive se admirando no espelho.
//  Planta (x pra direita, z pro vidro da frente):
//    fundo (espelho, z −7): barra no rack · desenvolvimento · rosca (rack de halteres)
//    esquerda: supino (fundo) · colchonete de abdominal · canto do Matheus + caixote do Vibecoder (frente)
//    centro: rack de agachamento · esteiras (frente)
//    direita: paralelas · panturrilha · balcão de suplementos (Carisma, frente)
// ════════════════════════════════════════════════════════════════
export const IRON = {
  id: 'iron',
  size: { x0: -8, x1: 8, z0: -7, z1: 5, h: 4.2 },
  gate: { x0: -1.3, x1: 1.3 }, // porta de vidro no meio da fachada
  spawn: { x: 0, z: 3.6, yaw: PI },
  machines: [
    {
      // Deitado no banco: o pé fica na origem e o corpo vai pra −Z (cabeça pro espelho).
      id: 'i_peito', muscle: 'peito', anim: 'bench', sound: 'clank', prop: 'bench',
      pos: [-5.6, -4.2], yaw: 0, cam: [1.9, 1.6, -0.5], look: [0, 0.65, -1.3],
    },
    {
      id: 'i_costas', muscle: 'costas', anim: 'pullup', sound: 'clank', prop: 'rackbar',
      pos: [-2.6, -5.6], yaw: 0, cam: [2.0, 1.9, 2.4], look: [0, 1.9, 0],
    },
    {
      id: 'i_ombros', muscle: 'ombros', anim: 'press', sound: 'clank', prop: 'dumbbells',
      pos: [0.2, -5.6], yaw: 0, cam: [1.8, 1.7, 2.3], look: [0, 1.5, 0],
    },
    {
      id: 'i_biceps', muscle: 'biceps', anim: 'curl', sound: 'clank', prop: 'dbrack',
      pos: [3.0, -5.6], yaw: 0, cam: [-1.4, 1.5, 2.0], look: [0, 1.2, 0],
    },
    {
      id: 'i_triceps', muscle: 'triceps', anim: 'dip', sound: 'clank', prop: 'dipstation',
      pos: [6.9, -3.6], yaw: -PI / 2, cam: [1.6, 1.3, 2.2], look: [0, 0.8, 0],
    },
    {
      id: 'i_abdomen', muscle: 'abdomen', anim: 'crunch', sound: 'thump', prop: 'mat',
      pos: [-5.5, -0.8], yaw: PI / 2, cam: [1.8, 1.4, -1.2], look: [0, 0.3, -0.9],
    },
    {
      id: 'i_pernas', muscle: 'pernas', anim: 'squat', sound: 'clank', prop: 'squatrack',
      pos: [-2.4, -2.0], yaw: 0, cam: [1.7, 1.4, 2.3], look: [0, 1.0, 0],
    },
    {
      id: 'i_panturrilhas', muscle: 'panturrilhas', anim: 'calf', sound: 'thump', prop: 'calfblock',
      pos: [6.9, -1.2], yaw: -PI / 2, cam: [1.5, 1.2, 2.1], look: [0, 0.7, 0],
    },
    {
      id: 'i_cardio', muscle: 'resistencia', anim: 'treadmill', sound: 'step', prop: 'treadmill',
      pos: [-3.4, 2.2], yaw: 0, cam: [1.9, 1.5, 1.4], look: [0, 1.1, 0],
    },
    {
      id: 'i_social', muscle: 'carisma', anim: 'talk', sound: 'chat', prop: 'counter',
      pos: [5.0, 2.6], yaw: PI / 2, cam: [-2.0, 1.7, -1.2], look: [0, 1.5, 0.8],
    },
  ],
  npcs: {
    matheus: { pos: [-6.6, 2.6], yaw: PI / 2 + 0.3 },
    seuze: { pos: [2.6, 3.9], yaw: PI }, // Dona Ivone, perto da porta, de olho em todo mundo
    neighborA: { pos: [6.9, 2.4], yaw: -PI / 2 }, // Kelly, atrás do balcão
    neighborB: { pos: [6.0, 3.8], yaw: -PI / 2 - 0.5 }, // Brutus, encostado no balcão
    brayan: { pos: [5.4, -6.3], yaw: PI }, // se admirando no espelho
  },
  host: 'ivone',
  hostIdle: 'idle',
  socialLooks: { a: 'kelly', b: 'brutus' },
  // Gente treinando de enfeite (dá vida à academia)
  extras: [
    { look: 'frequentador1', pos: [-2.2, 2.2], yaw: 0, state: 'treadmill' },
    { look: 'frequentador2', pos: [4.7, -5.6], yaw: 0, state: 'curl', rep: 1.1 },
    { look: 'frequentador3', pos: [1.6, -2.6], yaw: -0.4, state: 'squat', rep: 1.6 },
  ],
  goldenSpots: [
    [-0.8, 0.2], [1.6, -1.4], [3.6, -3.2], [-4.2, -2.8], [0.4, 1.8], [3.0, 0.6], [-0.6, -3.8], [4.4, -0.4], [-4.4, 0.8], [1.8, 3.0],
  ],
  armwrestleTable: [0, 0.6],
  // Caixote do Vibecoder (o Luisão trouxe o caixote e o notebook da Marlene da garagem)
  workStation: { pos: [-5.4, 4.1], yaw: PI, cam: [-1.35, 1.45, 2.15], look: [0, 0.82, -0.25] },
  // O Subaru do Uber fica estacionado na avenida, na frente da fachada
  uberSpot: { stand: [-4.2, 7.5], standYaw: 0, car: [-4.2, 9.45], yaw: -PI / 2 },
  matheusCorner: { notebook: [-7.3, 1.8], board: [-7.95, 1.5], ring: [-7.2, 3.7], banner: [-7.97, 2.6] },
  personalWait: { pos: [1.6, 4.3], yaw: PI },
  dateSpot: { center: [-0.2, 6.6], cam: [-0.2, 1.7, 4.0] },
  passersbyZ: 16.9,
  ceilings: [
    { x0: -8.0, x1: 8.0, z0: -7.0, z1: 5.0, y: 4.2 },
    { x0: -2.2, x1: 2.2, z0: 5.0, z1: 6.3, y: 3.3 }, // marquise da porta
  ],
  walkBounds: { x0: -8.8, x1: 8.8, z0: -6.7, z1: 7.65 },
  flythrough: [
    { pos: [0, 3.2, 15], look: [0, 2.2, 5] },
    { pos: [0, 2.4, 6.8], look: [0, 1.6, 0] },
    { pos: [-5.5, 3.3, 3.4], look: [2, 1.0, -4.5] },
    { pos: [5.5, 2.8, 1.6], look: [-2, 1.2, -4] },
  ],
};

export const GYMS = { garagem: GARAGE, iron: IRON };

// Cada máquina sabe a academia a que pertence (define o limite e o salto de poder).
for (const gym of Object.values(GYMS)) for (const m of gym.machines) m.gym = gym.id;

export function machineDef(id) {
  for (const gym of Object.values(GYMS)) {
    const m = gym.machines.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}
