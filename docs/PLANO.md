# 📋 PLANO-MESTRE — SHAPE & CORAÇÃO: Gym Tycoon 3D

Documento vivo. **Leia isto antes de qualquer prompt novo** para saber o que existe, o que está decidido e o que falta.
Última atualização: 02/11/2026 • Status: Milestone 1 + **Sistemas de Dinheiro/Trabalho/Método/Equipe (Fase 1)**, já **balanceados por simulação** (§10). Trabalho da Garagem agora é o **Uber** (§4.2). **Iron Temple (academia 2) jogável** desde 05/11/2026 (§11).

---

## 1. Visão geral

Clicker/tycoon 3D (Vite + Three.js, textos em pt-BR). O Luisão treina 8 músculos em máquinas, passa por 3 academias, namora 10 garotas e vence o amor da vida. Todos adultos (22+), romance fofo e não sexual, términos amigáveis.

**Duas moedas, sem conversão entre si:**

| Moeda | Vem de | Gasta em |
|---|---|---|
| 💪 **Ganhos** | Reps nas máquinas, geradores | Geradores, upgrades de máquina, taxa de reset do Método |
| 💵 **R$ (Dinheiro)** | Trabalho, MRR, Pix de patrocínio por Rank, missões do Matheus | Método Neumman, upgrades de emprego, Equipe (personal/waifu/aparelho) |

Ciclo: `treinar → stats → trabalho rende mais → R$ → Método/Equipe → reps mais fortes` e, no sentido contrário, `trabalhar também treina o stat do emprego`.

**Regra de ouro:** o Shake Dourado e o rádio (`mods.production`) são da **academia** (reps, Ganhos, geradores). Eles **não** mexem em nada do trabalho (R$, MRR, passivo). O único acelerador do trabalho é o **Energético** (§4.1).

---

## 2. Estado de implementação

### ✅ Pronto
- **Milestone 1**: engine, render, personagens procedurais, Garagem do Seu Zé, 8 músculos, fadiga/PUMP/split/PR, geradores e upgrades, Espelho, Matheus, níveis 1–3 (Marlene/Jéssica/Bruna), prova da garagem (Brayan), retenção, som, save, HUD.
- **Dinheiro (R$)** + HUD + save v2 (migra `skillPoints` antigos para R$).
- **Método Neumman** (árvore do Matheus): 21 técnicas em 3 ramos, constelação SVG, compra com Pix, níveis por camada de academia, reset, canto do Matheus que evolui.
- **Trabalho**: Cansaço Mental, CAFEZINHO!, Descanso Ativo, carreira de 10 cargos com teto por academia, emprego principal, upgrades, renda passiva e offline.
  - 🚗 **Uber** (Subaru Legacy azul, câmera interna do carro, passageiros da lista) é o emprego da **Garagem**; 💻 Vibecoder de SaaS B2B (ShapeCRM) está **completo** mas só abre na **academia nova** (Iron Temple).
- **Equipe**: Cleiton (personal) e Aiko (waifu/WaifuFit) completos; Tati, Rafa, Atena, Brayan, Mei e Yume **já têm dados, regras, textos e traços** — só abrem quando as academias 2/3 existirem.
- **Modos de jogo novos**: `work` (estação) e tela `MetodoScreen`.
- **Iron Temple (academia 2)** — §11: cenário 3D próprio (`IronTemple.js`), 10 estações com equipamento de verdade (supino, rack, halteres, paralelas, esteira...), 4 geradores, upgrades até o nível 12, Dona Ivone (dona), Kelly e Brutus (Carisma), Brayan no espelho, frequentadores treinando, viagem da garagem pro Iron, cena de chegada, **níveis 4–7 jogáveis** (encontros completos de Camila, Larissa, Isabela e Yasmin) e a prova de saída (só de shape). O Vibecoder abre sozinho ao chegar.

### ⏳ Falta (ordem sugerida)
1. **Playtest de verdade no navegador** da Fase 1 (nunca rodou em tela; só build + testes de lógica em Node). Checar: encaixe do Luisão no caixote, posição da waifu/personal, legibilidade dos painéis, mobile. **Do Uber (nunca visto em tela, só testes de lógica e conta de enquadramento):** altura do corte da câmera interna, mãos do Luisão no volante, pernas dentro dos bancos, nomes dos passageiros sem se sobrepor, Subaru estacionado no meio-fio e o cenário passando pelas janelas. **Do Iron (também só testado em Node):** pose do supino (barra entre as mãos, pés no chão), esteira (corrida no lugar), halteres nas mãos, barra no ombro no agachamento, câmeras de cada estação, luz/neon/espelho, cena de chegada e a viagem (F9 › "Ir pro Iron").
2. **Resto do Milestone 2**: o Iron está pronto (§11); faltam o **Olympus**, companheiros do Iron abrirem de fato (Tati/Rafa/Mei), Aparelho (smartwatch/projetor), empregos Instrutor/Segurança/Modelo, o **rival da prova do Iron** e calibrar o bônus do Método/trabalho no Iron (§11, medido).
3. **Milestone 3** — garotas 8–10 (as 4–7 já estão escritas), rivais, Brayan vira gerador **e** personal (`flags.brayanFriend`), brinde do Matheus, reações das namoradas à Equipe.
4. **Milestone 4** — conquistas (incl. de trabalho/Equipe), Álbum 3D, NG+, polimento, balanceamento global.
5. Itens opcionais da §8.

---

## 3. Método Neumman (árvore do Matheus)

**Como abre:** conversar com o Matheus. Prioridade em `Story.talkTo()`:
1. Prova de saída pronta → pep talk · 2. Requisitos prontos e dica pendente → Dica do Matheus (libera o encontro) · 3. Apresentação do Método (1x, a partir do nível 2) · 4. **Padrão: abre o Método.**

A apresentação dá a técnica cortesia (Execução Perfeita nv 1) e o primeiro trampo. Matheus ganha **💵** na cabeça quando há técnica comprável (e **!** para história).

**Regras** (`src/systems/Metodo.js`, dados em `src/config/metodo.js`):
- Custo do nível L→L+1: `base × 1,5^L × tierMult[camada]` (×1/×10/×100 por academia).
- Teto por academia: **40%/70%/100%** do nível máximo (`BALANCE.metodo.capFrac`; ou `caps` explícito na técnica). No NG+ níveis acima do teto ficam **adormecidos**.
- Pré-requisito: técnica anterior no nv 1; **capstone** exige o ramo todo no nv 3+.
- Reset devolve todo o R$ gasto e cobra Ganhos (`resetGanhos`). Mantém a técnica cortesia.
- Custo total da camada da Garagem ≈ **R$ 11K** (≈ 1,5 min de Uber no cargo 4). Valor medido por técnica na §10.

| Ramo | Técnicas (efeito por nível) |
|---|---|
| 🔴 **TÉCNICA** | Execução Perfeita (+15% progresso) · Carga Progressiva (+20% Ganhos) · Contração de Pico (+1,5% crítico) · Ritmo de Série (combo até x3) · Falha Concêntrica (+0,25 mult. crítico) · **FÚRIA** ativa, tecla F (x5 por 10+nv s) · ★ **HÉRCULES** (toda 100ª rep = MEGA REP x50) |
| 🔵 **ROTINA** | Descanso Inteligente (+12% recuperação) · Pump Prolongado (+1 rep) · Planilha de Split (+10% e +10 s) · Série Automática (+1 auto-rep/s, até 5) · Treino Fantasma (+20% passivo) · Sono de Qualidade (+1 h offline, até 8 h) · ★ **ROTINA INQUEBRÁVEL** (passivo x2, auto-reps mantêm combo) |
| 🩷 **LÁBIA** | Papo Reto (+12% Carisma) · Fofoca Premium (nv1 avisa o que evitar · nv2 +1 ponto · nv3 marca a melhor) · Rede de Contatos (+8% R$) · Charme (janela de minigame +8%) · Memória Afetiva (Lembranças +10%) · Olho Clínico (Shake Dourado +10% freq., +3 s) · ★ **MAGNETISMO** (Lembranças x2, NPCs aplaudem) |

Efeitos já ligados: tudo, exceto **Charme** (`mods.dateWindow` existe; falta usar nos minigames do M3) e **aplausos do Magnetismo** (M3/M4).
Rank de Atleta **não dá mais ponto de habilidade**: dá +2% Ganhos e um **Pix de patrocínio FIXO** (`BALANCE.rank.stipend` = R$ 60 × mercado da academia). Ele é propositalmente pequeno e **não acompanha a renda do emprego** (versão antiga, de ~25 s de trabalho, já dava a Execução 3 de graça e tornava trabalhar inútil).

---

## 4. Trabalho

**Estações:** cada emprego tem a sua. O **Uber** trabalha no **Subaru Legacy azul** estacionado no meio-fio, na frente do portão (`UberCar`); o **Vibecoder** usa o caixote + notebook da Marlene (`WorkCorner`, perto do Matheus). Interação igual às máquinas (E / clique no carro / auto-walk / minimapa "🚗" e "R$"). Cada clique = 1 tarefa; segurar = auto-tarefas lentas.

**Regras** (`src/systems/Jobs.js`, constantes em `BALANCE.work`):
- Pagamento por tarefa: `basePay(10) × 1,25^(cargo−1) × mercado(×1/×10/×100) × (1+Rede de Contatos) × (principal ? 1,5 : 1) × energético`. **Sem** `production` (Shake/rádio).
- **Cansaço Mental**: espelho da fadiga (rende 100% até 45%, cai a 40%); recupera parado e treinando; a waifu reduz pela metade do efeito dela.
- **CAFEZINHO!**: primeiras 8 tarefas descansado valem x2.
- **Descanso Ativo**: trabalhar 30 s+ (20+ tarefas) → 90 s com PUMP de 12 reps **e +25% de progresso** ao voltar a treinar. Cria o ritmo natural treinar ↔ trabalhar.
- **Sinergia nos dois sentidos**: o stat melhora o emprego (Resistência → menos pedaladas; Carisma → gorjeta/clientes) **e o emprego treina o stat** (`work.statTrain`: pedalar = Resistência, vender B2B = Carisma, ~45% de uma rep na estação por tarefa). Trabalhar deixa de ser tempo morto.
- **Carreira**: 10 cargos, XP `220 × 1,6^(c−1)`; teto 4 / 7 / 10 por academia ("o mercado não comporta mais o seu talento").
- **Principal ("carteira assinada")**: +50% R$/XP, passivo cheio; os outros rendem passivo pela metade. Trocar tem aviso prévio de 3 min (a 1ª troca é livre).
- **Upgrades**: `base × 1,6^nível × mercado`, nível máx. limitado por `cargo + 1`.
- **Passivo**: a partir do cargo 3, 5% → 25% do ritmo ativo (sempre menor que clicar). Offline a 50% de eficiência.
- Medição no F9: `% do tempo trabalhando` por nível, R$/min, camada forçada.

**Empregos** (`src/config/jobs.js`; um módulo por emprego em `src/systems/jobs/<id>.js` com a mesma interface: `task / update / action / view / tags / passiveRate / offline`):

| Emprego | Estado | Abre | Stat | Resumo |
|---|---|---|---|---|
| 🚗 Uber (Subaru Legacy azul) | ✅ | Apresentação do Método (**emprego da Garagem**) | Resistência, Carisma | Clique = 1 km; N km = 1 corrida; 5 estrelas + gorjeta (Carisma); chuva x2 / pico x1,5 (tarifa dinâmica). **Câmera interna do carro** (Luisão dirigindo de frente + passageiros) e **sempre tem passageiros** (§4.2). Melhor ativo, passivo fraco |
| 💻 Vibecoder de SaaS B2B (ShapeCRM) | ✅ | **Chegada à academia nova (Iron Temple)** — não abre na Garagem | Carisma | Clique = prompt → FEATURE NO AR → clientes → **MRR** (Pix a cada 60 s, inclusive offline). **Mercado saturado**: máx. de clientes = 4 + 5×cargo (cargo 4 = 24); sem isso o MRR crescia sem limite e passava o ativo. Bugs −5% MRR (máx −30%, clique p/ consertar); decisões "Deploy na sexta?" e "só um botãozinho" (cliente grande limitado a 1 por cargo). Melhor passivo/offline (≈ 47% do ativo do Uber). A Marlene ainda dá o notebook no término, mas ele fica guardado no caixote até a academia nova |
| 🏋️ Instrutor de Academia | ⏳ M2 | Chegada ao Iron | Estética, Simetria | Alunos com barra de transformação; o Matheus é aluno cortesia eternamente em 0% |
| 🕶️ Segurança de Balada | ⏳ M2 | Iron, nível 6 | Força | Turnos de 60 s de "encaradas"; VIPs dão gorjeta; Brayan entra na equipe depois da Valentina |
| 📸 Modelo / Garoto-propaganda | ⏳ M2 | Chegada ao Olympus | Estética, Carisma | Mural de 3 contratos, cachê alto (jackpot de fim de jogo) |

Humor nas situações, nunca em quem exerce a profissão; sem marcas reais.

### 4.1 Energético ⚡ (item raro)
- Lata verde-neon que aparece na academia (mesmo esquema do Shake Dourado, mas **bem mais raro**): 1º entre 6 e 9 min depois de ter um trampo, depois a cada 8–12 min; só nasce se houver emprego liberado. Dura 22 s no mapa; dá pra pegar andando ou **clicando nele enquanto trabalha**.
- Efeito (45 s, `BALANCE.energy`): tarefa de trabalho paga **x3**; Vibecoder avança features **+50%**. **Não** afeta passivo, MRR, offline, Ganhos nem treino. Pegar outro durante o efeito só renova o tempo (não acumula).
- Debug F9: botão "Energético".
### 4.2 Uber: Subaru Legacy azul, câmera interna e passageiros
- **Carro**: Subaru Legacy sedan azul (placa LEG-4C9, adesivo "UBER") estacionado em `gyms.js › uberSpot` (`stand` = onde o Luisão fica de pé, `car` = centro do carro). Clicar nele ou apertar E leva ao carro.
- **Câmera interna** (`src/world/UberCar.js`): ao começar a dirigir há um **corte (fade)** para uma cena separada, longe do bairro (`CAR_ORIGIN` = x 1800). A câmera fica no teto perto do para-brisa **olhando pra trás**: mostra o **Luisão dirigindo (de frente, mãos no volante)** e os passageiros no banco de trás/carona; o cenário (prédios, postes, carros, faixa) passa pelas janelas e acelera a cada clique. Chuva real quando a tarifa dinâmica de chuva está ativa. Poses novas: `driving` e `seated` (Poses.js).
- **Passageiros**: `src/config/passengers.js` (192 contas: `u` = @usuário, `n` = nome de exibição, `null` = só o @). **Sempre tem passageiro** (1 a 3 por corrida: 45% / 35% / 20%). Quando a corrida termina o grupo desce (nota de 4–5★) e outro **sorteado da lista** já embarca; ninguém repete antes de 14 corridas. O **nome de cada passageiro flutua em cima dele** (e o @ embaixo). Cada @ tem sempre a mesma aparência (8 aparências procedurais). Pra mudar a lista edite só o `passengers.js`.
- **Mecânica = a do antigo Entregador** (números inalterados, então o balanceamento da §10 continua valendo): `BALANCE.jobs.uber`; upgrades *Subaru afinado, Balinha e aguinha, Palhetas novas, Suporte de celular + GPS, Primo no volante*.
- **Equipe no carro**: o personal fica em casa; a waifu aparece (celular/mini-holograma) flutuando sobre o console. O **Energético** vai junto pro carro (fica entre os bancos da frente, clicável).
- **Marcas reais**: *exceção a pedido do usuário* — "Uber", "Subaru Legacy" e o **Claude Code** do Vibecoder aparecem pelo nome (o resto do jogo segue com marcas fictícias).

### 4.3 Vibecoder: Claude Code no notebook (05/11/2026)
- O notebook da Marlene roda um **Claude Code** (tela 3D em `WorkCorner._drawClaudeCode`, 512×330, ~15 quadros/s; e o mini terminal do painel em `vibecoder.js › ccTerminalHtml`): caixa de boas-vindas, cada clique **digita o prompt** letra por letra, a IA responde (`STR.jobs.vibecoder.ccReplies`), spinner "✻ Vibando…" (`ccVerbs`), `git push` + FEATURE NO AR em verde, bugs em vermelho. As mensagens antigas (prompts, features, bugs, decisões) continuam as mesmas.
- O log fica no save (`jobs.list.vibecoder.cc`, últimas 8, `ccN` = contador).
- **Consertar bug**: cada clique no 🐞 agora dá retorno ("🔧 1/3", contador no bug, linha no terminal); o 3º conserta. Corrigido também o CSS: `#ui * { pointer-events: auto }` fazia toasts, balões e nomes flutuantes pegarem o clique por cima dos botões; agora eles nunca pegam, e o painel de trabalho fica acima do HUD (z-index 4).
- Save **v3**: o Entregador vira Uber (progresso e upgrades migram); o Vibecoder volta a ficar trancado se o Luisão ainda está na Garagem (progresso guardado).

Para criar um emprego novo: adicionar em `jobs.js`, `BALANCE.jobs.<id>`, `STR.jobs.<id>`, módulo em `systems/jobs/`, registrar em `MODULES` (Jobs.js) e `jobEntry()` (GameState.js). Empregos de academia (`unlock: 'gym'`) abrem sozinhos quando o Luisão chega lá (`Jobs.checkGymUnlocks`; F9 › Camada força).

---

## 5. Equipe do Luisão

**Compra com R$.** Pagamento único (sem mensalidade). Teste grátis de 60 s antes de pagar (1x por companheiro). Troca livre fora do treino (recarga 60 s). Efeitos só no **treino ativo** (nunca no passivo/offline).

**Níveis** (1–10): `levelBase × 1,8^(n−1) × tierMult`; teto por academia 3/6/10.
**Vínculo** (Parceria 🤝 / Sintonia ✨, 0–5): sobe com reps/tarefas juntos, nunca diminui, +10% no efeito por nível; nv 5 libera um **Momento** (cena curta + brinde).
**Química**: duplas secretas dão +10% em tudo dos dois (Cleiton+Aiko, Rafa+Mei, Tati+Yume, Atena+Yume).
**Aparelho do WaifuFit** (R$): celular rachado → smartwatch (+25%) → projetor (+50%); muda como ela aparece (tela / mini-holograma / tamanho real). Compra liberada por academia.

| Companheiro | Slot | Abre | Efeito base | Traço |
|---|---|---|---|---|
| **Cleiton** "Só Mais Uma" ✅ | Personal | Meio do nível 3 (primo da Jéssica, espera no portão) | +12% Ganhos/rep por nível | A cada 10 reps seguidas, a 11ª é crítico garantido (apito) |
| **Tati Turbo** | Personal | Iron | +12% | Split com +25% de bônus e +30 s |
| **Rafa "Monstro"** | Personal | Iron, nível 5 | +18% | +0,5 no crítico, mas **+20% de fadiga** |
| **Dra. Atena** | Personal | Olympus | +12% | PONTO FRACO +40% progresso; PUMP x2,5 |
| **Brayan Shake** | Personal | Depois da Valentina (`flags.brayanFriend`) | +14% | Bater PR solta explosão de Ganhos |
| **Aiko** (Genki) ✅ | Waifu | Anúncio no meio das entregas (nível 2+) | −4% fadiga/rep por nível | PUMP dura +3 reps |
| **Mei** (Tsundere) | Waifu | Iron, nível 6 | −4% | Trocar de máquina recupera 15% dos outros músculos (recarga 20 s) |
| **Yume** (Kuudere) | Waifu | Olympus, nível 9 | −4% | Músculo > 60% de fadiga: ela tira 40% (recarga 30 s) |

Teto somado de redução de fadiga: **−50%** (rotacionar de máquina continua valendo).
O personal **segue** o Luisão, vira coach ao lado da máquina, sugere a próxima máquina (chip **📣 treino guiado**, +15% nas 10 reps seguintes) e conta as reps. A waifu comenta, avisa de músculo esgotado e chama **💧 Hora da água!** a cada ~2 min (clicar tira 30% de fadiga).
Falas em balões curtos (setting "Falas da equipe": muitas/poucas/nenhuma). Sem voz.

**A waifu é um app** (WaifuFit), não uma namorada: proporções adultas, roupa de treino, nada sexualizado; não concorre com as 10 garotas.

Assets: waifus são **desenhadas em canvas** (`WaifuDevice.drawWaifu`) ou PNG em `public/assets/textures/waifus/<id>.png`. Personals: `models/characters/personal_<id>.glb` ou procedural.
Fase 2 opcional: modelos `.vrm` (VRoid Studio + `@pixiv/three-vrm`).

---

## 6. Arquitetura (arquivos dos sistemas novos)

```
src/config/   metodo.js jobs.js companions.js        dados (+ balance.js: work / jobs / metodo / companions)
src/systems/  Metodo.js CompanionRules.js            regras puras (sem DOM/3D) → testáveis em Node
              Jobs.js jobs/uber.js jobs/vibecoder.js
              Companions.js                          tempo real (seguir, falas, água, teste, vínculo, Momentos)
src/world/    WorkCorner.js (caixote do Vibecoder, canto do Matheus) · UberCar.js (Subaru + cena interna) · WaifuDevice.js (celular/holograma)
src/render/   Hologram.js
src/ui/       MetodoScreen.js · WorkPanel.js · systems.css · Menu.js (abas Método/Trabalho/Equipe)
```

- `Progression.computeMods()` soma Lembranças + Método + Equipe + buffs. **Toda constante nova vai em `balance.js`.**
- Eventos no `bus`: `task, promotion, cargoCapped, jobUnlocked, jobUpgrade, jobEvent, feature, mrr, bug, bugFixed, incident, descansoAtivo, trait`.
- Save **v2** (`SAVE_VERSION`): `dinheiro, metodo, jobs, companions, timeLog, debugTier`. `migrate()` converte `skillPoints` v1 em R$.
- F9: `+R$`, `Liberar tudo`, `+1 cargo`, `+vínculo`, `Camada` (força camada 0/1/2 do Método/Equipe/cargo para testar sem o M2).
- Smoke test da lógica (Node, sem DOM): recriar um script que importa `Metodo / CompanionRules / Progression / Jobs / Training` com `localStorage` falso.

---

## 7. Itens do M2 que dependem destes sistemas

- Cada academia nova define `workStation`, `uberSpot`, `personalWait`, `matheusCorner` (ver `gyms.js`); **ao chegar no Iron o Vibecoder abre sozinho** (já implementado em `Jobs.checkGymUnlocks`) e o **canto do Matheus** ganha mesinha com notebook (Iron) e letreiro neon (Olympus).
- Gerador "Personal trainer" do Iron vira **"Aulas coletivas"** (evita 2 personals).
- Perks do prompt original continuam (cartas 3D no fim de cada nível); perks de trabalho/Equipe entram no M4.
- Skill points do prompt original **foram substituídos** pelo Método (decisão do usuário).
- Matheus reage a: personal ("eu sou a teoria, ele é a prática"), waifu ("usuário não encontrado"), Pix do açaí (já implementado).

## 8. Backlog / ideias aprovadas
- "Preparar o encontro": mimo comprado com R$ dá bônus no minigame (iniciativa do Luisão, nunca requisito).
- Brinde da gala: Matheus guardou 10% de todo Pix e devolve de presente.
- "Exit" do ShapeCRM (vender a empresa) como conquista/NG+.
- Namoradas reagem à Equipe (Marlene tem chaveiro da Aiko; Camila "quem é essa no seu relógio?"; Morgana "a tsundere eu respeito").
- Conquistas: primeira promoção, 1º cliente, 100 entregas, 0 bugs com 20 clientes, vínculo 5, química descoberta, MEGA REP.

## 9. Decisões já tomadas (não reabrir sem pedir)
1. Método substitui a árvore de pontos original (Rank dá Pix, não ponto).
2. Compra de técnicas **só com o Matheus** (menu mostra a árvore e leva até ele).
3. Equipe paga em **R$** (Ganhos pagam a academia, R$ paga a "vida do Luisão").
4. Empregos da Fase 1: **Uber (Garagem)**; o **Vibecoder só abre na academia nova** (pedido do usuário, 02/11/2026); os outros 3 chegam com M2. O Entregador (bike) foi removido.
5. Waifu = app WaifuFit; personal "Instrutor de Academia" é o emprego, "personal" é a companhia.
6. Mensalidade nenhuma; trabalho passivo nunca supera o ativo (por isso o teto de clientes do Vibecoder).
7. **Shake Dourado/rádio não afetam trabalho.** Só o Energético (raro) acelera o trabalho ativo.
8. Patrocínio de Rank é fixo e pequeno; trabalhar treina o stat do emprego (sinergia nos dois sentidos).
9. Balanceamento se valida com `tools/balance/` antes de mexer em número (e o plano é atualizado com o resultado).
10. **Viagem entre academias = salvar e recarregar a página** (05/11/2026): cada academia é um mundo próprio construído no `Game.init` a partir de `state.story.gym`; a tela de carregamento é a "viagem". Evita trocar dezenas de referências em tempo real.
11. **Prova do Iron é só de shape** (simetria 80 inclusa); o rival chega depois (decisão do usuário: "academia jogável" agora, rival depois).
12. Os encontros 4–7 foram escritos seguindo os teasers (Camila/Economia+apelidos, Larissa/yoga, Isabela/influencer sem filtro, Yasmin/advogada) — mesmo formato e tom dos da garagem; o usuário pode revisar os textos em `pt-BR.js`.

## 10. Balanceamento: o que foi medido (e como repetir)

**Ferramenta:** `tools/balance/` (Node, sem navegador, usa as classes reais). `npm run balance` (grade de % de trabalho), `npm run balance:valor` (valor de cada técnica), `npm run balance:empregos` (R$/min por emprego), `npm run teste` (lógica). O jogador simulado roda entre as máquinas, trabalha em rajadas de 45 s e compra Equipe > Método > upgrades; cada nível soma 90 s fixos de conversa/encontro.

**Problemas achados e corrigidos (02/11/2026):**
1. **Shake x trabalho**: `mods.production` (Shake x7, rádio x2) multiplicava o pagamento e o passivo do trabalho. Agora o trabalho ignora; só o Energético acelera (§4.1).
2. **Patrocínio de Rank grande demais** (~25 s de trabalho por Rank): quem nunca trabalhava ganhava R$ 4,5K e ficava 17% mais rápido, então trabalhar era sempre prejuízo. Agora é fixo (R$ 60 × mercado).
3. **MRR do Vibecoder sem teto**: no min 12 rendia R$ 6,4K/min parado, quase o dobro do ativo do (então) Entregador, hoje Uber (viola "passivo < ativo"). Agora há teto de clientes por cargo e o ticket caiu de 0,2 para 0,12.
4. **Trabalho era tempo morto**: agora treina Resistência/Carisma (sinergia) e o Descanso Ativo dá +25% de progresso.
5. **Renda do trabalho x2** (`basePay` 5 → 10) e **40% da árvore** liberada na Garagem (era 30%), pra o dinheiro ter destino.

**Resultado final (Garagem, 4 cliques/s, média de 12 execuções; tempo total vs. jogador que nunca usa Método/trabalho):**

| % do tempo trabalhando | 0% | ~12% | ~16–22% | ~30% | ~42% |
|---|---|---|---|---|---|
| Garagem inteira | −5% | **−15%** | −8% | +1% | +19% |

Mesma forma de curva a 3 e 5 cliques/s. Leitura: quem nunca trabalha ainda ganha o básico; **a faixa útil é 10–22%** (sprints curtos que compram a árvore); acima de ~30% o dinheiro vira desperdício e a penalidade fica clara. Não há estratégia dominante (cuidado: o loop treinar↔trabalhar com o Descanso Ativo fica ~neutro no tempo, de propósito).

**Valor de cada item sozinho (Garagem, no teto, vs. nada):** Execução Perfeita −14% (o "compra óbvia") · Pump Prolongado −6% · Planilha de Split −5% · Aiko nv3 −5% · Cleiton nv3 −4% · Carga Progressiva −3% · Contração de Pico −3% · **Descanso Inteligente 0%** e **Papo Reto 0%** (valem só pra quem não rotaciona de máquina / pro stat Carisma — conhecidos e aceitos). Máximo teórico com dinheiro infinito na Garagem: **−29% do tempo total** (≈ −42% do tempo só de treino).

**Empregos isolados (4 cliques/s, cargo 4, ritmo 45 s trabalha / 15 s descansa):** Uber (mesma mecânica do antigo Entregador) ≈ R$ 7–9K/min ativo, passivo ≈ R$ 280/min. Vibecoder: ativo ≈ R$ 2,5K/min + MRR parado ≈ R$ 3,8K/min com o mercado cheio (24 clientes).

**Tempos-alvo:** sem Método/trabalho a Garagem fecha em ~15 min a 4 cliques/s e ~17 min a 3 (o alvo do prompt é ~21 min, que inclui andar, menus e erros de clique). Com o Método e um pouco de trabalho fica ~10–15% abaixo. Se no playtest estiver rápido demais, suba `levelCost.growth` ou `levelCost.base` em 10–15% antes de mexer em R$.

**O que ainda NÃO foi medido** (precisa de M2/M3): Iron e Olympus (multiplicadores x10/x100 e as camadas 2/3 do Método), Instrutor/Segurança/Modelo, Tati/Rafa/Atena/Mei/Yume, e o efeito do Charme nos minigames de encontro.

**Re-medido em 02/11/2026 com o Uber como único emprego da Garagem** (Vibecoder agora só no Iron; mecânica do Uber = a do antigo Entregador): 0% trabalhando −5% · ~12% −16% · ~17% −11% · ~22% −8% · ~30% 0% · ~42% +18% — mesma curva de antes, faixa útil 10–22%. `npm run teste` agora também roda `test_uber.mjs` (migração do save, passageiros, desbloqueio do Vibecoder e a cena do carro com DOM falso).

**Botões úteis no F9 pra playtest real:** % trabalhando por nível, R$/min, passivo/min, Método investido, camada forçada (0/1/2).

## 11. Iron Temple (academia 2) — o que existe

**Mundo** (`src/world/IronTemple.js`, layout em `gyms.js › IRON`, 16×12 m, pé-direito 4,2 m): piso de borracha, parede de espelho no fundo (reflete o ambiente), neon roxo/vermelho/ciano (um pisca), painéis de LED, letreiro "IRON TEMPLE" dentro e fora, fachada de vidro com porta no meio (o vidro bloqueia, a porta deixa sair pra calçada), marquise, prédio comercial e lojas vizinhas, avenida com o bairro infinito. O Subaru do Uber fica na avenida (`uberSpot`), o caixote do Vibecoder e o canto do Matheus ficam na frente-esquerda. `.glb` opcional em `models/environments/iron.glb`.

**Estações** (`i_*`): Supino reto (pose nova `bench`, a barra segue o meio das mãos) · Barra fixa no rack · Desenvolvimento com halteres · Rosca com halteres (rack de halteres no fundo) · Paralelas · Abdominal no colchonete · Agachamento livre no rack (barra no ombro) · Panturrilha no step (0,18 m) · Esteira (pose nova `treadmill`, a lona anda) · Papo no balcão de suplementos (Carisma, com Kelly e Brutus). Upgrades: giz → anilhas → anel de LED ciano → dourado → troféu (nv 12).

**Geradores do Iron**: Whey importado · Aulas coletivas (bikes de spinning aparecem) · DJ da academia (caixas pulsando) · Patrocínio da Ferro Whey (banner + pote inflável na calçada). Os da garagem continuam rendendo.

**Gente**: Dona Ivone "Ferro" (dona, slot `seuze` — falas em `STR.ivone`, `hostStr()`), Kelly e Brutus no balcão, Brayan se admirando no espelho (enfeite), 3 frequentadores treinando. Eventos aleatórios próprios (`RANDOM_EVENTS_IRON`) e textos "iron_" pro Shake/Energético.

**Fluxo**: venceu o Brayan → "Garagem concluída" → convite "Bora pro Iron Temple!" (ou depois, pelo objetivo) → `Game.travelTo('iron')` salva e recarrega → `Story.arrival()`: tour de câmera, boas-vindas da Ivone e do Matheus → nível 4 (Camila). Níveis 4–7 com encontros completos e términos no ponto de encontro da calçada (`dateSpot`). Depois do nível 7: prova do Iron (checklist de shape) → "Iron Temple concluído" → Olympus "em breve". Save novo ganha `story.arrived`.

**Modo de teste** (F9, ou **Opções → tocar 5x na versão no rodapé** → "Modo de teste" → Abrir; fica liberado no aparelho via `settings.devMenu`): pular nível, bater requisitos, encontro agora, prova agora, concluir academia, **ir pro nível 1–7** (`Game._debugJump`: monta a história até ali, ajusta o shape e recarrega na academia certa), Garagem/Iron, +Ganhos/+R$, liberar sistemas, camada, shake, energético. `npm run teste` inclui `test_iron.mjs` (cenário com DOM falso, câmeras dentro da sala, alcance das estações, vidro × porta, geradores, upgrades, textos das 4 garotas). `npm run balance:iron` mede o ritmo.

**Ritmo medido (05/11/2026, 4 cliques/s, a partir da chegada, minutos)** — com `progressMult` do Iron baixado de 6 para **4** (com 6 o Iron inteiro levava ~32 min, mais rápido que a garagem por nível):

| cenário | L4 | L5 | L6 | L7 | prova | total |
|---|---|---|---|---|---|---|
| sem trabalho/Método/Equipe | 2,6 | 5,6 | 7,9 | 10,9 | 12,4 | **39** |
| trabalho 12% | 2,1 | 3,6 | 5,2 | 6,1 | 7,5 | **24** |
| trabalho 30% | 2,1 | 5,3 | 6,0 | 6,5 | 7,8 | 28 |

Leitura: sem os sistemas fica na escala do alvo (≈ 0,7 × 58 min, a mesma proporção sim/alvo da garagem). **Pendência:** no Iron o Método (camada 1, 70%) + trabalho dão −38%, contra −16% na garagem, e trabalhar 30% ainda compensa. Se o playtest confirmar, encarecer a camada 1 do Método (`tierMult` 10 → 14) ou reduzir `work.market.iron`.
