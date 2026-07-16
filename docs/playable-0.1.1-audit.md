# Auditoria de estabilização — base histórica 0.1.1, estado atual 0.4.0

> O nome deste arquivo foi mantido conforme o pedido original. A auditoria foi executada sobre o estado real mais recente do repositório: `main` em 0.3.2, promovido para 0.4.0 depois das correções. Nenhuma mudança posterior à 0.1.1 foi removida.

## Escopo auditado

- histórico de 0.1.0 a 0.3.2, documentação, configuração, save, cena Phaser, HUD React, mapa e workflow;
- direção manual, piloto automático, rotas, corridas, trânsito, semáforos, colisões, câmera, áudio e controles móveis;
- 1.647 vias, 6.102 nós dirigíveis, 45 semáforos, 26 paradas e 529 prédios do recorte atual;
- testes unitários/de integração, testes reais do mapa, build de produção e testes de navegador em desktop e viewport móvel.

## Matriz de compatibilidade e resultado

| Área | Estado encontrado em 0.3.2 | Decisão de compatibilidade | Estabilização 0.4.0 | Verificação |
|---|---|---|---|---|
| Direção manual | WASD/setas livres, sem assistência oculta; meio-fio apenas reduz velocidade | Preservar integralmente | Parâmetros reunidos em `vehiclePhysics.ts`; freio de mão progressivo, arrasto suave e direção sem números mágicos | testes de aceleração, curva, troca de faixa, cruzamento e fora do asfalto |
| Piloto automático | Botão explícito, respeita rota/trânsito, conclui e aceita próxima corrida; recuperação de curva/impasse | Preservar os refinamentos 0.3.0–0.3.2 | Estado visível (`seguindo`, `freando`, `chegando`, `aguardando`, `recuperando`) e velocidade-alvo no HUD | E2E de rota, frenagem, missão, colisão e impasse |
| Colisões | Sobreposição binária, dano fixo de 0,35 e redução fixa; cooldown global | Substituir sem voltar a barreiras invisíveis | Velocidade relativa, orientação frontal/lateral/traseira, níveis contato/leve/moderada/severa, detecção varrida, resolução no ponto de contato, dano e resposta graduais, faíscas/vibração/tremor | testes puros de gravidade e tunneling + E2E de contato único |
| Câmera | Seguimento/fixa e zoom pela roda | Preservar | Presets próxima/normal/distante, opção de tremor, persistência e feedback curto só em impacto real | typecheck, build e viewport desktop/móvel |
| Corridas | Embarque/desembarque automáticos por área/velocidade; recibo único; nova recomendação automática | Preservar | Missão ativa passa a fazer parte do save; área segura fica visível e a rota recebe setas direcionais | testes de missão e E2E do fluxo completo |
| Rotas | Grafo dirigido, mão correta e recálculo somente após desvio persistente | Preservar, sem encurtar por calçada | Linha com contraste, setas e progresso local; piloto continua preferindo asfalto e tolerando pequenas falhas de renderização | testes de grafo, mapa real e curvas fechadas |
| Tráfego | Pool fixo de 35 carros/táxis/ônibus/utilitários; prevenção, sinais e recuperação de impasse | Preservar sentidos/faixas | Estados explícitos, motivo de parada, densidade configurável e amarelo com zona de decisão; pool distante continua oculto/atualizado em baixa frequência | telemetria no painel dev e E2E |
| Semáforos | Verde/amarelo/vermelho e multa por proximidade | Corrigir falso positivo | NPC só para no amarelo quando há distância segura; multa exige movimento cruzando a linha e é ignorada no quadro de colisão externa | testes de navegador e inspeção dev |
| Save | v1, migração rasa; JSON corrompido era apagado e substituído | Não perder progresso | v2 com migração explícita, preferências, missão/piloto, backup rotativo e cópia do conteúdo corrompido sem apagar o original | testes de migração, backup e recuperação |
| Mobile | Pedais/volante, ocultos no piloto; pointer cancel parcial | Preservar layout | Liberação total em `blur`, troca de orientação, aba oculta, cancelamento e perda de captura; opções continuam acessíveis | E2E 390×844 e teste de troca de aba |
| Áudio | Ausente | Adicionar sem bloquear a partida | Síntese leve para motor, ambiente, frenagem, buzina (H), colisão e alerta; chave e volume geral persistentes | falha de áudio nunca impede simulação |

## Problemas priorizados

1. **P0 — integridade:** save corrompido era removido; colisão rápida podia atravessar um NPC; impacto externo podia coincidir com detecção de infração.
2. **P1 — previsibilidade:** toda batida parecia igual; faltavam estados do piloto e motivos de parada; amarelo funcionava como vermelho imediato para NPCs.
3. **P1 — continuidade:** missão ativa e piloto não eram persistidos; controles móveis podiam reter entrada após perda de captura.
4. **P2 — acabamento:** rota sem setas, área de interação pouco explícita, câmera sem presets, ausência de áudio e painel dev com pouca telemetria.
5. **P2 — desempenho:** o pacote principal continua grande por incluir Phaser, embora a simulação use pool fixo, oculte distantes e reduza sua frequência. Divisão de chunks fica registrada como melhoria de infraestrutura, não como bloqueio de jogabilidade.

## Critérios de aceite

- nenhum regresso no controle manual livre, mãos corretas, piloto explícito, missão automática ou simulação em segundo plano;
- contato parado não causa dano; velocidade relativa crescente produz resposta e dano crescentes;
- um contato contínuo gera um evento, NPC fica temporariamente imobilizado e o piloto se recupera;
- save v1 migra para v2 e save inválido é preservado, com tentativa de backup;
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run map:validate`, `npm run build` e `npm run test:e2e` devem passar antes da publicação.

## Resultado final medido

- testes unitários/de integração: **35/35 na base** e **39/39 após a estabilização**;
- testes de navegador: **14/14**, incluindo desktop, celular 390×844, troca de aba, controle manual, piloto, colisões, impasse, missão e recarga do save;
- desempenho visual: as auditorias exigem mais de 30 FPS no desktop e 28 FPS no viewport móvel durante a cena real;
- JavaScript principal: 1.634.694 → 1.653.265 bytes; comprimido: 438,52 → 443,22 kB (**+4,70 kB / cerca de 1,1%**);
- CSS: 16,92 → 18,09 kB; build de produção concluída sem erro;
- mapa validado: **1.647 vias, 6.102 nós, 45 semáforos, 26 paradas e 529 prédios**.

## Fora de escopo deliberado

Nenhuma cidade, empresa ou categoria foi acrescentada. Prédios permanecem visuais e o mundo continua 2.5D; a estabilização não transforma o protótipo em uma simulação 3D nem cria barreiras rígidas nas calçadas.
