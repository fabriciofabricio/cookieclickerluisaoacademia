# Ferramentas de balanceamento

Scripts em Node (sem navegador) que usam as classes REAIS do jogo (`Training`, `Jobs`, `Metodo`,
`CompanionRules`, `computeMods`). Rode na raiz do projeto.

| Comando | O que faz |
|---|---|
| `npm run balance` | Simula a Garagem inteira (níveis 1-3 + prova) com 0%, 8%, 15%, 22%, 30% e 45% do tempo trabalhando. Mostra o tempo por nível, o total, R$ ganho e % gasto. Argumentos: `node tools/balance/tune.mjs . <cliques/s> '<json de overrides>'` |
| `npm run balance:valor` | Mede quanto CADA técnica/companheiro acelera o jogo sozinho (pra achar o que está fraco ou forte demais). |
| `npm run balance:empregos` | R$/min de cada emprego isolado (ativo e passivo), minuto a minuto. |
| `npm run teste` | Testes de lógica: Método, empregos, Equipe, Shake x trabalho, energético, mercado saturado. |

Overrides do `tune.mjs` aceitam caminhos do BALANCE (`"rank.stipend": 60`, `"work.basePay": 10`,
`"metodo.capFrac": [0.4,0.7,1]`) e multiplicadores (`"nodeBase": 0.5`, `"hire": 2`, `"levelBase": 1`,
`"val.tec_pico": 0.025`). Eles só valem naquela execução: depois de achar o número bom, copie pra `src/config/balance.js`.

O jogador simulado treina rodando entre as máquinas (troca quando a fadiga passa de 50%), trabalha em rajadas de 45 s,
compra Equipe > Método (por prioridade) > upgrades de emprego > geradores/máquinas, e gasta 2,5 s andando entre as estações.
Cada nível soma 90 s de "overhead" fixo (conversas, encontro, foto). As médias usam 12 sementes.
