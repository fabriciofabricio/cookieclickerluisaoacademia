# 💪 SHAPE & CORAÇÃO: Gym Tycoon 3D

Clicker/tycoon 3D no navegador. O Luisão, um loiro alto e magrelo, treina pra ganhar confiança e encontrar o amor da vida dele. Feito com **Vite + Three.js** (sem engine pesada).

> **Status: Milestone 1 de 4 + sistemas de Dinheiro, Trabalho, Método Neumman e Equipe + Iron Temple (academia 2) jogável, com os níveis 4–7.** Tem motor, renderização, personagem, a Garagem do Seu Zé, o loop de clique, o sistema de 8 músculos, o HUD e o save. Os níveis 1–3 e a prova da garagem dão pra jogar do começo ao fim.
>
> 📋 **O plano completo e as decisões de design estão em [`docs/PLANO.md`](docs/PLANO.md)** — leia antes de pedir mudanças grandes.

---

## ▶️ Como rodar

Precisa do **Node.js 18+** (testado no 24).

```bash
npm install      # instala e copia os decoders Draco/KTX2 para public/libs
npm run dev      # abre em http://localhost:5173
```

Pra gerar a versão de produção: `npm run build` (sai em `dist/`), e `npm run preview` pra testar.

O jogo **roda no primeiro clone sem nenhum asset**: personagens, texturas e props são gerados por código. Quando você coloca os arquivos reais em `public/assets/`, o visual melhora sozinho. Com o `npm run dev` rodando, a página recarrega quando um arquivo é adicionado.

---

## 🎮 Controles

| Ação | Desktop | Celular |
|---|---|---|
| Andar | WASD / setas (Shift corre) ou clique no chão | Joystick ou toque no chão |
| Girar câmera / zoom | Arrastar / roda do mouse | Arrastar / pinça |
| Interagir (máquina, NPC) | **E** ou clique | Toque no balão |
| Fazer repetição | Clique, **Espaço** ou o botão. Segurar faz reps automáticas mais lentas | Toque no botão (segurar repete) |
| Sair da máquina / estação | **Esc** ou andar | Botão "Sair" |
| Trabalhar (na estação) | Clique, **Espaço** ou o botão (segurar = tarefas lentas) | Toque no botão |
| FÚRIA (depois de comprada) | **F** treinando | Botão 🔥 |
| Hora da água 💧 | Clicar no botão que aparece | Toque no botão |
| Espelho | **R** ou aba Espelho | Aba Espelho |
| Menu | **M** / Tab / ☰ | ☰ |
| Debug | **F9** | — |

---

## 🗂️ Arquitetura

```
index.html               tela de título + canvas + camada de UI
vite.config.js           plugin "virtual:asset-list" (lista o que existe em public/assets)
scripts/copy-decoders.js copia decoders Draco/Basis do three (roda no postinstall)
src/
  main.js                carregamento e tela de título
  Game.js                orquestrador: loop, entrada, interação, efeitos, HUD, save
  config/
    metodo.js, jobs.js, companions.js   dados da árvore, dos empregos e da Equipe
    balance.js           ★ TODAS as constantes de balanceamento
    story.js             níveis, requisitos, provas, Lembranças, visual das garotas
    gyms.js              layout das academias, máquinas, câmeras, NPCs
    assets.manifest.js   ★ manifesto único de assets (caminhos)
  i18n/pt-BR.js          ★ TODOS os textos do jogo
  core/                  EventBus, GameState (save/migração/export), Input, format (1,2K), utils
  render/                Renderer (pós-processamento + presets), CameraRig, Particles,
                         FloatingText (números 3D), ProceduralTextures (PBR em canvas)
  assets/AssetLoader.js  GLTF+Draco+KTX2+Meshopt, HDR, texturas; fallback automático
  characters/
    ProceduralRig.js     humanoide procedural: esqueleto real + malhas com skinning
    BodyGen.js           corpo contínuo (lofts anatômicos por músculo) + pesos de skin
    HeadGen.js           cabeça esculpida, olhos com íris/pálpebras, orelhas, cabelo modelado
    CharTextures.js      pele, rosto pintado, fios de cabelo, tecidos, tênis, íris (canvas)
    GLTFRig.js           adaptador para .glb (Mixamo): morph targets ou escala por osso
    Poses.js             animações procedurais (idle, andar, 10 exercícios, flex...)
    Character.js         fábrica de personagens + Actor (movimento, auto-caminhada)
  world/                 WorkCorner (caixote do Vibecoder, canto do Matheus), UberCar (Subaru Legacy azul + câmera interna), WaifuDevice (celular/holograma), GarageGym (cenário, luzes, máquinas, upgrades visíveis), Neighborhood (bairro/horizonte), Props, Sky
  systems/
    Metodo.js, CompanionRules.js   regras puras do Método Neumman e da Equipe (testáveis em Node)
    Jobs.js + jobs/                trabalho: cansaço mental, carreira, upgrades, passivo; um módulo por emprego
    Companions.js                  Equipe em tempo real: personal segue, waifu fala, água, teste grátis, vínculo
    Training.js          rep: Ganhos, XP, fadiga, PUMP, crítico, split, PR, nível, limite
    Progression.js       requisitos, simetria, força/estética, modificadores, roupas
    Economy.js           geradores, upgrades de máquina, ganhos offline
    Story.js             intro, Matheus, encontros, términos, foto de progresso, prova
    WorldEvents.js       Shake Dourado, eventos aleatórios, missões
  audio/AudioManager.js  Web Audio: SFX sintetizados, lo-fi procedural no rádio (3D), rua
  ui/                    HUD, Menu, Dialogue+Modal, Mirror (mapa muscular), Minimap, Joystick, Debug,
                         MetodoScreen (constelação), WorkPanel (painel de trabalho), systems.css
```

**Fluxo de dados:** `Training` e os outros sistemas mexem no `state` e emitem eventos no `EventBus` (`rep`, `muscleLevel`, `stageUp`, `rankUp`...). O `Game` escuta esses eventos e dispara efeitos, som e HUD. A UI só redesenha o DOM quando algo visível muda.

**Os dois rigs têm a mesma interface** (`setMuscles`, `setState`, `rep`, `attach`...). O jogo não precisa saber se está usando o personagem procedural ou o `.glb` do Mixamo.

---

## ⚖️ Decisões de balanceamento (tudo em `src/config/balance.js`)

- **Custo de nível do músculo:** `8 × 1,09^nível` pontos. Na garagem: 0→4 custa ~37 pontos por músculo, 4→10 ~85, 10→18 ~209 e 18→25 ~347.
- **Por rep:** Ganhos = `base × academia × (1 + 0,5·upgrade) × (1 + 6%·nível do músculo) × PUMP × fadiga × crítico × split × buffs`. O progresso muscular segue a mesma ideia, com +25% por upgrade.
- **Fadiga:** cada rep enche ~3,4% da barra. Até 35% de fadiga o rendimento é cheio, e com a barra cheia cai pra 25%. A fadiga recupera com o tempo e mais rápido quando você treina **outro** músculo. Um músculo descansado ganha **PUMP x2** nas primeiras 8 reps. Por isso rodar entre máquinas é ~2–3× melhor que ficar numa só, sem punir quem não roda.
- **Split:** 12 reps em cada músculo do par dão +50% por 60 s. A sugestão muda a cada 3 min.
- **Geradores:** custo `base × 1,15^qtd`. O treino passivo vai sempre pro PONTO FRACO e fica bem abaixo do treino ativo (~0,05–1 pt/s contra ~3–5 pts/s clicando). Ficar só no idle nunca é mais rápido.
- **Upgrades de máquina:** custo `12 × 1,6^nível`, até o nível 10 na garagem. Sempre aparece algo novo pra comprar a cada 30–90 s.
- **Academias:** limite de 25/60/100 e salto de poder de ~x10 por academia (`ganhosMult`/`progressMult`).
- **Rank de Atleta:** custa `40 × 1,3^rank` de XP. Cada rank dá +2% de Ganhos e um **Pix de patrocínio fixo** (R$ 60 × mercado da academia, pequeno de propósito). Não existem mais pontos de habilidade: a árvore é o Método Neumman, paga em R$.
- **Tempos-alvo:** 3/5/7 min nos níveis 1–3 e ~6 min na prova. O Matheus dá dica se você passar de 2× o tempo-alvo.
- **Encontros:** nota de 0 a 2 por rodada, com Ouro ≥ 6, Prata ≥ 4 e Bronze ≥ 2. Se perder, dá pra tentar de novo em 20 s, e cada derrota remove uma opção ruim.
- **Offline:** até 2 h, com 50% de eficiência e +15% pela Lembrança da Jéssica.
- Números no formato brasileiro: `1,2K / 3,4M / 5,6B / 7,8T`.

---

## 💵 Dinheiro, Trabalho, Método e Equipe

Duas moedas que **não se convertem**: **Ganhos 💪** (reps → geradores e máquinas) e **R$ 💵** (trabalho → Método, carreira e Equipe).

- **Método Neumman** (fale com o Matheus quando ele não tiver nada da história): 21 técnicas em 3 ramos (Técnica / Rotina / Lábia). Custo `base × 1,5^nível × (×1/×10/×100 por academia)`; cada academia libera uma fatia dos níveis (40% / 70% / 100%). Reset devolve o R$ e cobra Ganhos.
- **Trabalho**: **Uber** (Subaru Legacy azul estacionado na rua, câmera interna do carro com o Luisão dirigindo e passageiros com nome; liberado na apresentação do Método) e Vibecoder de SaaS B2B (caixote do Matheus; só abre na academia nova). Cansaço Mental, CAFEZINHO!, Descanso Ativo (PUMP de 12 reps e +25% de progresso ao voltar a treinar), 10 cargos (teto 4/7/10 por academia), emprego principal (+50%), upgrades, renda passiva e offline. Trabalhar também treina o stat do emprego (dirigir = Resistência, vender B2B = Carisma). O Vibecoder tem teto de clientes por cargo ("mercado saturado").
- **Equipe**: Cleiton (personal, chega no meio do nível 3) e Aiko (waifu do app WaifuFit, aparece num anúncio durante as corridas). Teste grátis de 60 s, vínculo, química entre duplas, aparelho do WaifuFit. Tati, Rafa, Atena, Brayan, Mei e Yume já têm dados e traços, mas só abrem com as outras academias.
- **Energético ⚡**: lata rara (a cada ~8–12 min, só com trampo liberado) que faz o **trabalho** pagar x3 por 45 s. O Shake Dourado e o rádio mexem só na academia, nunca no trabalho.
- **Balanceamento medido**: `npm run balance` simula a Garagem inteira com 0–45% do tempo trabalhando (faixa útil: 10–22%); `npm run balance:valor`, `npm run balance:empregos` e `npm run teste` completam. Detalhes em [`tools/balance/README.md`](tools/balance/README.md) e `docs/PLANO.md` §10.
- **F9 (debug)**: `+R$`, `Energético`, `Liberar Método/trampos/equipe`, `+1 cargo`, `+vínculo` e `Camada` (força a camada 0/1/2 pra testar o que depende do Iron/Olympus). Mostra também o % do tempo treinando × trabalhando por nível, pra calibrar.

> Os números estão todos em `src/config/balance.js` (`work`, `jobs`, `metodo`, `companions`). Saves antigos (v1) são migrados: os pontos de habilidade viram R$.

---

## 🎨 Guia de Assets

Todos os caminhos ficam em `src/config/assets.manifest.js`, relativos a **`public/assets/`**. Coloque o arquivo com **exatamente** o nome da tabela. O que faltar continua procedural.

### Personagens (`public/assets/models/characters/`)

| Arquivo | Quem | Sugestão (grátis) |
|---|---|---|
| `luisao.glb` | Luisão: loiro, alto, magro | Mixamo (personagem rigado) ou Ready Player Me → Mixamo |
| `matheus.glb` | Matheus: magro, cabelo preto comprido, camiseta de banda, bermuda | Mixamo / Sketchfab (CC-BY) |
| `seuze.glb` | Seu Zé: senhor, bigode, regata | Mixamo / Sketchfab |
| `brayan.glb` | Brayan Shake: marombeiro | Mixamo |
| `vizinha.glb`, `vizinho.glb` | Dona Cida e Seu Arlindo | Mixamo |
| `marlene.glb`, `jessica.glb`, `bruna.glb` | Namoradas 1–3 (adultas, roupa casual) | Mixamo / Sketchfab |
| `biscoito_dog.glb` | O cachorro | Quaternius (Animals pack, CC0) |
| `personal_cleiton.glb`, `personal_tati.glb`, `personal_rafa.glb`, `personal_atena.glb` | Personals da Equipe | Mixamo / Sketchfab |

**Músculos no `.glb`:** se a malha tiver *shape keys / morph targets* chamados `peito`, `costas`, `ombros`, `biceps`, `triceps`, `abdomen`, `pernas` e `panturrilhas` (também aceita `chest`, `back`, `shoulders`, `abs`, `legs`, `calves`), o jogo usa eles. Se não tiver, o jogo escala os ossos do rig Mixamo (`Spine2`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftUpLeg`, `LeftLeg`...) com valores travados e compensação nos filhos, pra malha não quebrar.

### Animações (`public/assets/animations/`)

Baixe no **Mixamo** com o **mesmo esqueleto** do personagem. Marque **"In Place"** e escolha **"Without Skin"** (só a animação).

| Arquivo | Estado no jogo | Busca no Mixamo |
|---|---|---|
| `idle.glb` | parado | "Idle" / "Breathing Idle" |
| `walk.glb`, `run.glb` | andar / correr | "Walking", "Running" |
| `talk.glb` | conversa | "Talking" |
| `celebrate.glb` | comemorar | "Victory" / "Cheering" |
| `flex.glb` | pose no espelho | "Flexing" / "Bodybuilder Pose" |
| `sit.glb` | Seu Zé sentado | "Sitting Idle" |
| `pushup.glb` | flexão | "Push Up" |
| `pullup.glb` | barra | "Pull Up" |
| `overhead_press.glb` | desenvolvimento | "Overhead Press" / "Lifting" |
| `bicep_curl.glb` | rosca | "Bicep Curl" |
| `dip.glb` | mergulho | "Dip" / "Bench Dips" |
| `crunch.glb` | abdominal | "Situps" / "Crunch" |
| `squat.glb` | agachamento | "Air Squat" |
| `calf_raise.glb` | panturrilha | "Calf Raise" (ou "Standing Idle On Toes") |
| `jumping_jacks.glb` | polichinelo | "Jumping Jacks" |
| `arm_wrestle.glb` | queda de braço | "Arm Wrestling" (ou "Pushing") |
| `typing.glb` | digitando no notebook (estação do Vibecoder) | "Typing" / "Sitting Typing" (sem ele, usa `sit`) |
| `driving.glb` | dirigindo o Subaru (Uber) | "Driving" / "Sitting Driving" (sem ele, usa a pose procedural `driving`) |
| `coach.glb` | personal orientando | "Clapping" / "Pointing" (sem ele, usa `talk`) |

A animação de exercício é **sincronizada com o clique**: cada rep percorre o clipe uma vez.

### Cenário e props (`public/assets/models/`)

| Arquivo | O quê | Fonte |
|---|---|---|
| `environments/garagem.glb` | Garagem completa (substitui paredes e piso; as colisões continuam) | Sketchfab "garage interior" (CC-BY) |
| `props/garagem/old_radio.glb`, `tire.glb`, `rusty_plate.glb`, `rusty_dumbbell.glb` | Ambientação | Kenney, Quaternius, Poly Haven Models |
| `props/garagem/water_jug.glb`, `sand_bucket.glb`, `plastic_chair.glb`, `cardboard.glb`, `cement_bag.glb`, `pullup_bar.glb`, `towel.glb` | Equipamentos improvisados | Sketchfab / Poly Haven |
| `props/golden_shake.glb` | Shake Dourado | qualquer copo (o jogo aplica o dourado) |

> No Milestone 1, `garagem.glb` e os modelos de personagem já são carregados. Os `.glb` de props individuais estão no manifesto, mas a troca prop por prop fica pro Milestone 4 (por enquanto eles continuam procedurais).

### Texturas PBR (`public/assets/textures/`, Poly Haven, CC0)

Cada conjunto tem 4 mapas: `<nome>_albedo`, `<nome>_normal`, `<nome>_roughness` e `<nome>_ao`, em `.ktx2` (preferido), `.webp`, `.jpg` ou `.png`.

| Prefixo | Sugestão Poly Haven |
|---|---|
| `concrete_floor` | "concrete_floor_02", "garage_floor" |
| `plaster_wall` | "painted_plaster_wall", "concrete_block_wall" |
| `rusty_metal` | "rusty_metal_02" |
| `wood` | "wood_table_001" |
| `asphalt` | "asphalt_02" |
| `sidewalk` | "patterned_paving_02" |
| `rubber_floor`, `marble` | (próximas academias) |

Exemplo: `public/assets/textures/concrete_floor_albedo.jpg`.

### Waifus do WaifuFit (`public/assets/textures/waifus/`)

`aiko.png`, `mei.png`, `yume.png`: ilustração em PNG com fundo transparente (~512×1024), busto ou corpo inteiro, **roupa de treino e proporções adultas**. Sem o arquivo, o jogo desenha cada waifu em canvas (piscando e falando). Fonte sugerida: VRoid Studio (grátis) exportando uma imagem, ou arte própria/licenciada.

### HDRI (`public/assets/hdri/`)

| Arquivo | Sugestão Poly Haven |
|---|---|
| `garagem_entardecer.hdr` | "kloofendal_48d_partly_cloudy" ou "venice_sunset" (1k ou 2k) |

### Áudio opcional (`public/assets/audio/`, `.ogg` / `.mp3` / `.wav`)

`rep`, `clank`, `crit`, `purchase`, `rankup`, `stageup`, `fanfare`, `golden`, `hit`, `miss`, `music_garagem`, `pix`, `promotion`, `whistle`. Se o arquivo existir, ele substitui o som sintetizado (fontes: Kenney Audio, freesound.org CC0, Pixabay Music).

### Convertendo para `.glb` comprimido (gltf-transform)

```bash
npm i -g @gltf-transform/cli

# FBX do Mixamo → GLB (com Blender: File > Import FBX > Export glTF Binary)
# ou: npx fbx2gltf personagem.fbx

# Otimizar: Draco nas malhas + texturas KTX2 (UASTC p/ normal, ETC1S p/ cor)
gltf-transform optimize luisao.glb luisao_opt.glb --compress draco --texture-compress ktx2
# Só redimensionar texturas (mais leve no celular):
gltf-transform resize luisao_opt.glb luisao_final.glb --width 2048 --height 2048
# Texturas soltas → KTX2:
gltf-transform uastc concrete_floor_normal.png concrete_floor_normal.ktx2
```

O carregador já suporta **Draco**, **KTX2/Basis** e **Meshopt**.

---

## ✅ O que tem no Milestone 1

- Renderização PBR, tom ACES Filmic, sombras PCF suaves, ambiente HDRI (ou RoomEnvironment), **GTAO, bloom, profundidade de campo nos diálogos, vinheta e SMAA/FXAA**. Presets **Baixo/Médio/Alto/Ultra** e **Auto**, que detecta celular e baixa a qualidade se o FPS cair.
- **Garagem do Seu Zé** ao entardecer: lâmpada piscando, luz fria fluorescente, pôr do sol entrando pelo portão, rua com casas e postes, bandeirinhas, rádio velho, manchas de óleo, pneus, cimento, o Biscoito dormindo (e abanando o rabo).
- **Câmera esperta**: conhece os tetos de cada cenário (abaixa o ângulo pra caber em vez de bater), colide com uma sonda de 5 raios, desliza ao longo da parede quando você encosta nela, aproxima rápido e afasta devagar (sem tranco), e esconde o Luisão se a câmera ficar colada nele.
- **Bairro sem fim do mundo**: a rua continua pros dois lados com casas, muros, portões, ipês, carros estacionados e postes; prédios atrás, quarteirões fechando as pontas da rua, um morro com casinhas acesas e o horizonte da cidade em camadas, tudo sumindo na neblina do entardecer. A casa ganhou andar de cima, sacada com varal e caixa d'água. Tudo mesclado em ~18 draw calls.
- **10 estações** com props, câmera cinematográfica própria, animação por exercício sincronizada ao clique, dica engraçada do Seu Zé na primeira vez e **upgrades visíveis** (tapete → giz → anilhas → LED → troféu, com o metal ficando mais brilhante).
- **Personagens procedurais detalhados** (sem nenhum asset): corpo contínuo com skinning que dobra nas juntas, cabeça esculpida com rosto pintado, íris, pálpebras que piscam, olhos que acompanham quem fala, mãos com dedos, tênis, roupas que acompanham o corpo e cabelo modelado (o do Matheus balança).
- **8 músculos independentes** com 6 estágios visuais cada. O abdômen vai de liso → contorno → 4 → 6 → 8 gomos, os braços ganham veias nos níveis altos, as costas abrem em V. Tem **pump** (infla e ruboriza) e close-up em câmera lenta com "BÍCEPS EVOLUIU!".
- **Fadiga, PUMP, crítico, split, PR por máquina, limite da garagem** (a máquina range e treme), Simetria, Força, Estética e a piada do **frango de perna fina**.
- **Geradores** que aparecem no mundo (liquidificador, caixinha de som, Juninho fazendo polichinelo, halteres de concreto) e treinam o ponto fraco.
- **Espelho**: câmera orbitando 360° e mapa muscular clicável (cinza/laranja/verde/dourado) com "Ir pra máquina" e "Posar" (+Carisma).
- **Matheus Neumman**: cabelo comprido com mola, "!" quando tem algo importante, **Dica do Matheus** obrigatória, falas aleatórias com +Carisma (com cooldown), **missões do açaí** e dica quando você trava.
- **Níveis 1–3** (Marlene, Jéssica, Bruna) com silhueta-teaser, encontro em diálogo com escolhas (a dica do Matheus conta do que ela gosta, mas a resposta certa não vem marcada), nota Bronze/Prata/Ouro, Lembrança permanente, término amigável e **foto de progresso**.
- **Prova da Garagem**: checklist e **queda de braço contra o Brayan Shake** com plateia. Cada derrota deixa ele mais fraco.
- **Retenção**: barra "Próximo encontro: X%", números 3D flutuantes, suor, giz, poeira, faíscas, confete, tremor de câmera, **Shake Dourado** raro (a cada 3–5 min; x7 ou prêmio na hora), eventos aleatórios engraçados, "QUASE LÁ!", sequência diária e ganhos offline.
- **Som**: Web Audio sintetizado com limite de 10 reps/s, volume caindo, mixer separado e mudo. Lo-fi procedural saindo do **rádio em áudio 3D** e grilos e trânsito na rua.
- **HUD** glassmorphism responsivo, mini-mapa clicável, joystick no celular e diálogos com tarjas e máquina de escrever.
- **Save** automático a cada 10 s e ao fechar, exportar/importar como texto, resetar com confirmação. **Debug (F9).**

## ✅ O que foi adicionado depois do Milestone 1

- Moeda **R$**, save v2 e migração. Chip de dinheiro no HUD.
- **Método Neumman**: tela de constelação em SVG, 21 técnicas com efeitos reais (FÚRIA, HÉRCULES, combo, auto-reps, Fofoca Premium nos encontros...), canto do Matheus que evolui com o dinheiro investido.
- **Trabalho**: Uber no Subaru Legacy azul (câmera interna, passageiros da lista, cenário passando pelas janelas), estação do Vibecoder com notebook, mini-cenas, bugs, decisões e MRR.
- **Equipe**: Cleiton (personal que acompanha) e Aiko (waifu em celular rachado com balões e "Hora da água!"), treino guiado, vínculo, química e Momentos.
- Matheus: nova prioridade de conversa (história primeiro, depois o Método), missão do açaí agora paga Pix, reações ao personal e à waifu.

> ⚠️ Esses sistemas passaram por build e por testes de lógica em Node, mas **ainda não foram jogados em tela**. Se algo estiver fora do lugar (câmera da estação, posição do personal/waifu, painéis no celular), me mande o print.

## 🔜 Próximos milestones

2. ~~Iron Temple~~ (pronto: cenário, 10 estações, geradores, viagem, níveis 4–7) + Olympus, rival do Iron, perks.
3. As 10 namoradas com cenários 3D e minigames próprios, apelido "Luisão Gostosão", rivais e história completa.
4. Som final, polimento, 30+ conquistas, Álbum de Memórias 3D, New Game+, performance e balanceamento.
