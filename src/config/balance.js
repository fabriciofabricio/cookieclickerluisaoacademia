// ════════════════════════════════════════════════════════════════
//  TODAS as constantes de balanceamento do jogo vivem aqui.
//  Mexeu aqui, mudou o jogo inteiro. Os comentários explicam a conta.
// ════════════════════════════════════════════════════════════════

export const MUSCLES = ['peito', 'costas', 'ombros', 'biceps', 'triceps', 'abdomen', 'pernas', 'panturrilhas'];
export const STATS = ['resistencia', 'carisma'];
export const TRAINABLE = [...MUSCLES, ...STATS];

/** Pares de split (combo de treino). A letra é só pra exibir "TREINO A". */
export const SPLITS = [
  { letter: 'A', a: 'peito', b: 'triceps' },
  { letter: 'B', a: 'costas', b: 'biceps' },
  { letter: 'C', a: 'pernas', b: 'panturrilhas' },
  { letter: 'D', a: 'ombros', b: 'abdomen' },
];

export const BALANCE = {
  saveKey: 'shape-coracao-save-v1',
  settingsKey: 'shape-coracao-settings-v1',
  autosaveSec: 10,

  // Custo (em "pontos de progresso") pra subir do nível L pro L+1:
  //   custo(L) = base × growth^L
  // Garagem: 0→4 ≈ 37 pts/músculo, 4→10 ≈ 85, 10→18 ≈ 209, 18→25 ≈ 347.
  levelCost: { base: 10, growth: 1.093 },
  // Resistência e Carisma sobem um pouco mais fácil (vêm de 1 estação só).
  statCost: { base: 7, growth: 1.09 },

  // Estágios visuais de cada músculo (mínimo 6). A interpolação entre eles é suave.
  visualStages: [0, 15, 30, 50, 75, 100],

  // Cada academia: limite dos músculos e salto de poder (~x10 por academia).
  gyms: {
    garagem: { cap: 25, ganhosMult: 1, progressMult: 1, xpMult: 1, upgradeBase: 12, upgradeMax: 10 },
    iron: { cap: 60, ganhosMult: 10, progressMult: 4, xpMult: 4, upgradeBase: 2500, upgradeMax: 12 }, // progressMult 4 (era 6): medido no tools/balance/iron.mjs
    olympus: { cap: 100, ganhosMult: 100, progressMult: 40, xpMult: 16, upgradeBase: 400000, upgradeMax: 15 },
  },
  gymOrder: ['garagem', 'iron', 'olympus'],

  rep: {
    baseGanhos: 1,
    baseProgress: 1,
    baseXp: 1,
    ganhosPerMuscleLevel: 0.06, // +6% de Ganhos por nível do músculo treinado
    critChance: 0.05,
    critMult: 2,
    holdInterval: 0.42, // segurar o botão = 1 rep a cada 0,42 s (mais lento que clicar)
    capGanhosMult: 0.35, // no limite da máquina ainda rende um pouquinho de Ganhos
    animDuration: 0.5, // duração de 1 rep na animação (acelera se clicar rápido)
  },

  // Fadiga: força a rotação entre máquinas sem punir demais.
  fatigue: {
    perRep: 0.034, // ~30 reps enchem a barra
    recoverPerSec: 0.055, // recupera sozinha quando você não treina esse músculo
    recoverPerOtherRep: 0.01, // treinar OUTRO músculo acelera a recuperação
    startDrop: 0.35, // até 35% de fadiga o rendimento é cheio
    minYield: 0.25, // com fadiga cheia rende só 25%
    restedThreshold: 0.06, // abaixo disso o músculo está "descansado"
    pumpReps: 8, // as primeiras 8 reps de um músculo descansado...
    pumpMult: 2, // ...valem x2 (PUMP!)
  },

  split: {
    repsEach: 12, // reps em cada músculo do par
    windowSec: 150, // tempo pra completar as duas partes
    bonusMult: 1.5, // +50% de Ganhos e progresso
    durationSec: 60,
    rotateSec: 180, // a sugestão muda a cada 3 min
  },

  golden: {
    minSec: 180, // aparece a cada 3–5 min (raro e especial)
    maxSec: 300,
    lifeSec: 25,
    mult: 7,
    durationSec: 30,
    instantChance: 0.3,
    instantProductionSec: 90, // recompensa instantânea = 90 s de produção (mín. abaixo)
    instantMin: 40,
    pickupRadius: 1.1,
  },

  randomEvents: { minSec: 140, maxSec: 240 },

  // ENERGÉTICO: item RARO que só aparece depois que você tem um trampo. Acelera só o TRABALHO
  // ativo (o Shake Dourado é da academia e não mexe no trabalho). Ele não acumula com ele mesmo.
  energy: {
    firstMinSec: 360, // primeiro energético: de 6 a 9 min depois de ter um trampo
    firstMaxSec: 540,
    minSec: 480, // depois: de 8 a 12 min
    maxSec: 720,
    lifeSec: 22,
    durationSec: 45,
    workMult: 3, // tarefa paga x3
    featureMult: 1.5, // Vibecoder: features saem 50% mais rápido
    pickupRadius: 1.1,
  },

  // Cada Rank dá +2% de Ganhos e um "Pix de patrocínio" FIXO (× mercado da academia). É propositalmente
  // pequeno e não acompanha a renda do emprego: quem nunca trabalha só recebe o básico.
  rank: { xpBase: 40, xpGrowth: 1.3, ganhosBonusPerRank: 0.02, stipend: 60 },

  upgrades: {
    costGrowth: 1.6, // custo = base × 1,6^nível
    ganhosPerLevel: 0.5, // +50% Ganhos por nível (aditivo)
    progressPerLevel: 0.2, // +20% progresso muscular por nível
    xpPerLevel: 0.2,
  },

  // Geradores: custo = base × 1,15^qtd. "train" = pontos/s no PONTO FRACO.
  // O treino passivo é sempre bem menor que o ativo (clicar compensa até o fim).
  generators: {
    costGrowth: 1.15,
    list: {
      garagem: [
        { id: 'g_shake', base: 15, gps: 0.4, train: 0.025 },
        { id: 'g_playlist', base: 110, gps: 2.2, train: 0.05 },
        { id: 'g_parceiro', base: 700, gps: 11, train: 0.1 },
        { id: 'g_halteres', base: 3800, gps: 50, train: 0.2 },
      ],
      // Iron Temple: ~x10 de poder (as reps já rendem x10). Retorno parecido com o da garagem (~1–1,5 min por compra).
      // 'Aulas coletivas' no lugar de 'Personal trainer' (a Equipe já tem personal).
      iron: [
        { id: 'i_whey', base: 20000, gps: 260, train: 0.15 },
        { id: 'i_aulas', base: 120000, gps: 1400, train: 0.3 },
        { id: 'i_dj', base: 650000, gps: 6800, train: 0.6 },
        { id: 'i_patrocinio', base: 3600000, gps: 32000, train: 1.2 },
      ],
    },
  },

  offline: { capHours: 2, efficiency: 0.5, trainEfficiency: 0.4, minSecToShow: 60 },

  streak: { maxDays: 7, bonusPerDay: 0.05 },

  matheus: {
    carismaCooldownSec: 40,
    carismaPoints: 5,
    missionChance: 0.4,
    missionCooldownSec: 75,
    missionReps: [30, 60], // multiplicado por (1 + nível/3)
    missionRewardSec: 45, // recompensa = 45 s de produção + carisma
    missionPixSec: 8, // Pix do açaí = 8 s de trabalho no principal
    missionCarisma: 6,
  },

  mirrorPose: { cooldownSec: 20, carismaPoints: 4 },

  // Tempo-alvo por nível (min). Se passar de stuckFactor×, o Matheus dá dica.
  levelTargetMin: [3, 5, 7, 9, 11, 13, 15, 17, 19, 22],
  examTargetMin: { garagem: 6, iron: 10 },
  stuckFactor: 2,
  stuckHintEverySec: 150,

  quaseLaThreshold: 0.9, // "QUASE LÁ!" quando >= 90% de tudo

  date: {
    retrySec: 20,
    // Nota: soma de pontos (0–2 por rodada). Ouro >= 6, Prata >= 4, Bronze >= 2.
    ouro: 6,
    prata: 4,
    bronze: 2,
  },

  armwrestle: {
    playerPerClick: 0.045,
    brayanPush: 0.16, // por segundo
    brayanPushGrowth: 0.035, // aumenta com o tempo
    easierPerFail: 0.2, // cada derrota deixa o Brayan 20% mais fraco
  },

  symmetry: {
    // simetria = 0,55×(1 − desvio/(média+3)) + 0,45×((mín+1)/(máx+1))
    frangoRatio: 0.6, // pernas < 60% da parte de cima = frango de perna fina
    frangoMinUpper: 6,
  },

  // ══ DINHEIRO (R$), TRABALHO, MÉTODO NEUMMAN E EQUIPE ══════════════
  // Ganhos 💪 pagam a academia (geradores, máquinas). R$ paga a vida do Luisão
  // (Método do Matheus, carreira, personal e waifu). As moedas não se convertem.

  // Trabalho: cada clique na estação = 1 tarefa.
  work: {
    basePay: 10, // R$ por tarefa no cargo 1 da Garagem
    refTasksPerSec: 3, // ritmo de referência pra renda passiva / patrocínio
    cargoGrowth: 1.25, // pagamento x1,25 por cargo
    market: { garagem: 1, iron: 10, olympus: 100 }, // "o mercado paga mais quem tá em academia chique"
    cargoCap: { garagem: 4, iron: 7, olympus: 10 }, // teto de cargo por academia
    xp: { base: 220, growth: 1.6 }, // tarefas pra subir do cargo c pro c+1 = base × growth^(c−1)
    mainBonus: 0.5, // emprego principal: +50% R$ e XP
    // Trabalhar também treina o stat do emprego (dirigir = Resistência, vender B2B = Carisma):
    // pontos de progresso por tarefa, em relação a ~1 ponto de uma rep na estação do stat.
    statTrain: 0.45,
    secondaryPassive: 0.5, // empregos que não são o principal rendem passivo pela metade
    switchCooldownSec: 180, // "aviso prévio"
    passive: { fromCargo: 3, base: 0.05, perCargo: 0.03, max: 0.25 }, // fração do ativo
    offlineEfficiency: 0.5,
    holdInterval: 0.42,
    statSynergyMax: 1, // sinergia de stat no máximo +100%
    // Cansaço Mental: mesma lógica da fadiga muscular.
    mind: {
      perTask: 0.0024, // ~190 tarefas (40–60 s) rendendo 100%
      startDrop: 0.45,
      minYield: 0.4,
      recoverPerSec: 0.016, // recupera quando você não está trabalhando
      recoverPerRep: 0.004, // e mais rápido treinando
      restedThreshold: 0.08,
      cafezinhoTasks: 8, // CAFEZINHO! primeiras tarefas descansado valem x2
      cafezinhoMult: 2,
    },
    // Descanso Ativo: depois de trabalhar 30 s+, o PUMP dura mais por um tempo.
    descansoAtivo: { minWorkSec: 30, durationSec: 90, pumpReps: 12, progress: 0.25 },
    upgradeGrowth: 1.6,
  },

  jobs: {
    uber: {
      tapsBase: 12, // km (cliques) por corrida
      tapsMin: 5,
      resistPerLevel: 0.015, // cada nível de Resistência = menos cliques por corrida (aguenta dirigir mais tempo)
      tipBase: 0.12, // chance de 5 estrelas + gorjeta
      tipPerCarisma: 0.004,
      tipMax: 0.6,
      tipMult: 0.5, // gorjeta = +50% da corrida
      eventEverySec: [70, 130],
      rain: { sec: 40, pay: 2, taps: 1.3 }, // tarifa dinâmica na chuva
      rush: { sec: 30, pay: 1.5 }, // horário de pico
      // Passageiros: cada corrida leva de 1 a 3 pessoas (a mesma renda, só muda a companhia).
      riders: { weights: [0.45, 0.35, 0.2], recentMemory: 14 },
      upgrades: {
        carro: { base: 500, max: 5, value: 0.08 }, // −8% cliques/nível (Subaru mais afinado)
        agua: { base: 650, max: 5, value: 0.15 }, // +15% por corrida (balinha e aguinha)
        palheta: { base: 800, max: 3, value: 0.25 }, // chuva +25% e sem atraso
        suporte: { base: 700, max: 5, value: 0.05 }, // +5% chance de gorjeta
        primo: { base: 1200, max: 5, value: 0.5 }, // +50% renda passiva (o primo pega o carro no seu horário)
      },
    },
    vibecoder: {
      promptPay: 0.45, // freela: cada prompt paga 45% de uma tarefa
      featureBase: 14, // prompts pra primeira feature
      featurePer: 2, // +2 por feature lançada
      featureMax: 50,
      clientTicket: 0.12, // R$/s por cliente (× pagamento por tarefa)
      clientCapBase: 4, // mercado: máximo de clientes = base + porCargo × cargo ("mercado saturado")
      clientCapPerCargo: 5,
      bigClientMult: 3,
      carismaClientChance: 0.01, // por nível de Carisma, chance de cliente extra (máx 50%)
      bugChance: 0.035,
      bugMin: 0.01,
      bugMax: 6,
      bugPenalty: 0.05, // −5% MRR por bug (máx −30%)
      bugPenaltyMax: 0.3,
      bugClicks: 3,
      churnBugs: 3,
      churnEverySec: 120,
      mrrEverySec: 60,
      decisionEverySec: [120, 180],
      sextaIncident: 0.4,
      sextaBugs: 3,
      botaoExtraCost: 0.5,
      upgrades: {
        notebook: { base: 600, max: 5, value: 0.2 }, // +20% progresso por prompt
        iaPro: { base: 1100, max: 5, value: 0.15 }, // prompts automáticos/s enquanto você treina
        testes: { base: 700, max: 5, value: 0.005 }, // −0,5% chance de bug
        landing: { base: 900, max: 5, value: 0.25 }, // +25% clientes por feature
        cs: { base: 1400, max: 4, value: 15 }, // conserta 1 bug a cada (100 − 15×nível) s
        servidor: { base: 1000, max: 5, value: 0.25 }, // +25% MRR
      },
    },
  },

  // Método Neumman (árvore paga ao Matheus em R$).
  // custo(nível L → L+1) = base × 1,5^L × tierMult[camada do nível L]
  metodo: {
    costGrowth: 1.5,
    tierMult: [1, 10, 100], // garagem / iron / olympus
    capFrac: [0.4, 0.7, 1], // fração do nível máximo liberada em cada academia (40% / 70% / 100%)
    resetGanhos: { garagem: 500, iron: 50000, olympus: 5e6 },
    matheusStages: [0, 1500, 5000, 12000, 60000, 400000], // R$ investidos → canto do Matheus evolui
  },

  // Equipe: personal (Ganhos por rep) e waifu (fadiga mais lenta).
  companions: {
    levelGrowth: 1.8,
    tierMult: [1, 10, 100],
    capFrac: [0.3, 0.6, 1],
    maxLevel: 10,
    trialSec: 60,
    switchCooldownSec: 60,
    bondThresholds: [0, 120, 400, 1000, 2200, 4500], // reps juntos → Parceria/Sintonia 0..5
    bondBonus: 0.1, // +10% no efeito por nível de vínculo
    chemistryBonus: 0.1,
    personalPerLevel: 0.12, // +12% Ganhos por rep por nível
    waifuPerLevel: 0.04, // −4% fadiga por rep por nível
    fatigueCutMax: 0.5, // teto: −50% de fadiga somando tudo
    deviceMult: [1, 1.25, 1.5], // celular, smartwatch, projetor
    deviceCost: [0, 25000, 4e6],
    guidedReps: 10,
    guidedBonus: 0.15,
    waterEverySec: [110, 140],
    waterLifeSec: 12,
    waterRecover: 0.3,
    talkGap: { muitas: 2.5, poucas: 7, nenhuma: Infinity },
  },

  camera: { followDistance: 4.6, followHeight: 2.2, minDistance: 1.6, maxDistance: 7.5 },

  player: { walkSpeed: 3.4, runSpeed: 5.6, turnSpeed: 12, radius: 0.32, interactRadius: 1.5 },
};

/** Custo pra subir do nível L pro L+1 (músculo ou stat). */
export function levelCost(id, level) {
  const c = STATS.includes(id) ? BALANCE.statCost : BALANCE.levelCost;
  return c.base * Math.pow(c.growth, level);
}

export function gymOf(id) {
  return BALANCE.gyms[id] ?? BALANCE.gyms.garagem;
}

/** 0 = garagem, 1 = iron, 2 = olympus. */
export function gymIndex(id) {
  return Math.max(0, BALANCE.gymOrder.indexOf(id));
}

/**
 * Até que nível algo com `max` níveis pode subir em cada academia.
 * caps explícitos (ex.: [3,3,3]) têm prioridade.
 */
export function tierCaps(max, capFrac, caps) {
  if (caps) return caps;
  return capFrac.map((f, i) => (i === capFrac.length - 1 ? max : Math.max(1, Math.round(max * f))));
}

/** Camada (0/1/2) em que o nível L (0-based, o próximo a comprar) é liberado. */
export function tierOfLevel(L, caps) {
  for (let i = 0; i < caps.length; i++) if (L < caps[i]) return i;
  return caps.length - 1;
}
