// ════════════════════════════════════════════════════════════════
//  MANIFESTO DE ASSETS
//  Todos os caminhos são relativos a /public/assets.
//  Se o arquivo não existir, o jogo usa o fallback procedural.
//  Veja o README (seção "Guia de Assets") pra saber onde baixar cada um.
// ════════════════════════════════════════════════════════════════

export const ASSETS = {
  characters: {
    luisao: 'models/characters/luisao.glb',
    matheus: 'models/characters/matheus.glb',
    seuze: 'models/characters/seuze.glb',
    brayan: 'models/characters/brayan.glb',
    vizinha: 'models/characters/vizinha.glb',
    vizinho: 'models/characters/vizinho.glb',
    marlene: 'models/characters/marlene.glb',
    jessica: 'models/characters/jessica.glb',
    bruna: 'models/characters/bruna.glb',
    dog: 'models/characters/biscoito_dog.glb',
    // Equipe do Luisão (personals)
    cleiton: 'models/characters/personal_cleiton.glb',
    tati: 'models/characters/personal_tati.glb',
    rafa: 'models/characters/personal_rafa.glb',
    atena: 'models/characters/personal_atena.glb',
  },

  // Waifus do app WaifuFit: ilustração 2D (PNG com fundo transparente, ~512×1024)
  // usada na tela do celular/holograma. Sem o arquivo, o jogo desenha a waifu em canvas.
  // (Modelos VRM do VRoid Studio entram na Fase 2 — veja docs/PLANO.md.)
  waifus: {
    aiko: 'textures/waifus/aiko.png',
    mei: 'textures/waifus/mei.png',
    yume: 'textures/waifus/yume.png',
  },

  // Animações Mixamo (exporte "Without Skin" e converta pra .glb).
  // O nome da chave é o estado da animação no jogo.
  animations: {
    idle: 'animations/idle.glb',
    walk: 'animations/walk.glb',
    run: 'animations/run.glb',
    talk: 'animations/talk.glb',
    celebrate: 'animations/celebrate.glb',
    flex: 'animations/flex.glb',
    sit: 'animations/sit.glb',
    typing: 'animations/typing.glb', // sentado digitando (estação do Vibecoder)
    driving: 'animations/driving.glb', // sentado dirigindo o Subaru (Uber); sem ele usa `sit`
    coach: 'animations/coach.glb', // personal orientando ("Clapping"/"Pointing")
    pushup: 'animations/pushup.glb',
    pullup: 'animations/pullup.glb',
    press: 'animations/overhead_press.glb',
    curl: 'animations/bicep_curl.glb',
    dip: 'animations/dip.glb',
    crunch: 'animations/crunch.glb',
    squat: 'animations/squat.glb',
    calf: 'animations/calf_raise.glb',
    jacks: 'animations/jumping_jacks.glb',
    armwrestle: 'animations/arm_wrestle.glb',
  },

  environments: {
    garagem: 'models/environments/garagem.glb',
    iron: 'models/environments/iron.glb', // Iron Temple completo (opcional; as colisões continuam procedurais)
  },

  props: {
    g_peito: 'models/props/garagem/towel.glb',
    g_costas: 'models/props/garagem/pullup_bar.glb',
    g_ombros: 'models/props/garagem/water_jug.glb',
    g_biceps: 'models/props/garagem/sand_bucket.glb',
    g_triceps: 'models/props/garagem/plastic_chair.glb',
    g_abdomen: 'models/props/garagem/cardboard.glb',
    g_pernas: 'models/props/garagem/cement_bag.glb',
    radio: 'models/props/garagem/old_radio.glb',
    plate: 'models/props/garagem/rusty_plate.glb',
    dumbbell: 'models/props/garagem/rusty_dumbbell.glb',
    tire: 'models/props/garagem/tire.glb',
    golden_shake: 'models/props/golden_shake.glb',
  },

  // Texturas PBR (Poly Haven, CC0). Cada conjunto: _albedo, _normal, _roughness, _ao.
  // Formatos aceitos: .ktx2 (preferido), .jpg, .png, .webp
  textures: {
    concrete_floor: 'textures/concrete_floor',
    plaster_wall: 'textures/plaster_wall',
    brick_wall: 'textures/brick_wall',
    rusty_metal: 'textures/rusty_metal',
    wood: 'textures/wood',
    asphalt: 'textures/asphalt',
    sidewalk: 'textures/sidewalk',
    rubber: 'textures/rubber_floor',
    marble: 'textures/marble',
  },

  hdri: {
    garagem: 'hdri/garagem_entardecer.hdr',
  },

  // Áudio opcional (.ogg ou .mp3). Se existir, substitui o som sintetizado.
  audio: {
    rep: 'audio/rep',
    clank: 'audio/clank',
    crit: 'audio/crit',
    purchase: 'audio/purchase',
    rankup: 'audio/rankup',
    stageup: 'audio/stageup',
    fanfare: 'audio/fanfare',
    golden: 'audio/golden',
    hit: 'audio/hit',
    miss: 'audio/miss',
    music_garagem: 'audio/music_garagem',
    pix: 'audio/pix',
    promotion: 'audio/promotion',
    whistle: 'audio/whistle',
  },
};

/** Sufixos de mapa PBR procurados para cada conjunto de textura. */
export const TEXTURE_MAPS = ['albedo', 'normal', 'roughness', 'ao'];
export const TEXTURE_EXTS = ['ktx2', 'webp', 'jpg', 'png'];
export const AUDIO_EXTS = ['ogg', 'mp3', 'wav'];
