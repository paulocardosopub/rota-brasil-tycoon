# Auditoria local — PLAYABLE 0.8.6

Data da validação: 18 de julho de 2026.

Esta atualização permanece somente no ambiente local. Não houve commit, push, PR, tag, release ou publicação no GitHub Pages.

## Resultado funcional

- As larguras das vias agora vêm de perfis graduais por corredor. Vias comuns de mão dupla sem informação de faixas deixam de ser tratadas como avenidas de quatro faixas, e encontros de larguras diferentes recebem transição limitada em vez de um alargamento abrupto.
- O carregamento progressivo do mapa tolera a falha isolada de um trecho, repete a leitura com a revisão de dados atual e só interrompe a abertura se o trecho central realmente não puder ser carregado.
- O piloto automático mantém uma rota local provisória enquanto o grafo global termina de carregar. Rotas pendentes são recuperadas sem descartar o destino atual.
- Pausas longas de quadro não são mais reproduzidas como vários segundos de simulação acumulada. O mapa só recompõe a janela quando há um novo trecho e o índice global de rotas é reutilizado, reduzindo mini travadas e impedindo o teleporte depois de uma entrega.
- Os contornos das ruas são polígonos contínuos, sem círculos de preenchimento em cada ponto. Conectores de cruzamento penalizam curvas fechadas e rejeitam encaixes atrás do carro, eliminando ganchos e voltas desnecessárias nas entradas e saídas.
- A velocidade média dos veículos foi elevada em 30%. O Modo Sport conduz no limite do veículo e aplica consumo de combustível 18% maior.
- Minha Frota e Funcionários ganharam navegação anterior/próximo, busca, filtros, seleção persistente e links diretos entre veículo, funcionário, garagem e treinamento, com apresentação adaptada para desktop e mobile.
- Cidade foi dividida em Visão geral, Regiões e Locais. Posto, oficina e garagem agora abrem atendimento em uma janela própria, sem anexar as ações ao fim da Cidade.
- Garagem separa veículos próprios, catálogo e melhorias, com categorias liberadas pelas empresas do jogador. Piloto automático e Modo Sport somem enquanto qualquer janela principal está aberta.
- Um índice de 12.909 vias nomeadas fornece endereços com via, setor e quadra quando disponíveis no OSM (SQS, SQN, SHN, SHS, SHIN QI e equivalentes); o fallback central diferencia norte/sul e leste/oeste.
- Turnos, treinamentos, troca de motorista e reparos ativos persistem no save e possuem proteção contra cobranças repetidas.

## Mapa validado

| Item | Resultado |
| --- | ---: |
| Vias | 32.674 |
| Faixas | 60.152 |
| Nós | 304.109 |
| Trechos progressivos | 780 |
| Edificações | 122.231 |
| Área coberta | 549,7 km² |

O validador rejeita largura fora do limite de cada classe, faixa estreita, variação excessiva dentro da mesma via e desencontro entre extremidades equivalentes de um corredor. A simulação de navegação percorreu 112 rotas, com zero falha, zero trecho ausente e zero falha de superfície.

## Carregamento e desempenho

Medição feita contra a compilação de produção local em 1.440 × 900 e 390 × 844:

| Cenário | Jogo pronto | Mediana | Mapa antes de pronto |
| --- | ---: | ---: | ---: |
| Desktop, primeira abertura | 2,835 s | 32 FPS | 4,11 MB |
| Desktop, cache aquecido | 1,919 s | 34 FPS | 0,47 MB |
| Mobile, primeira abertura | 1,366 s | 48 FPS | 4,11 MB |
| Mobile, cache aquecido | 1,070 s | 53 FPS | 0,47 MB |

Comparado com a 0.8.5, o pacote inicial caiu de 1,91 MB para 295 KB (redução de 84,5%) e o núcleo de rotas caiu de 16,28 MB para 4,60 MB (redução de 71,7%). O mapa publicado completo ocupa 167,59 MB, mas é dividido em 780 trechos e não é baixado integralmente na abertura.

A meta de mediana de pelo menos 30 FPS foi atingida. A mediana ainda é inferior à referência da 0.8.5 (35 FPS no desktop e 54 FPS no mobile) porque a 0.8.6 mantém 72 veículos, 9 ônibus e 10 entidades aéreas durante a medição, além do mapa progressivo completo. O maior módulo do jogo continua com 1,58 MB minificado (418 KB comprimido), portanto divisão adicional desse módulo permanece como oportunidade futura.

Os dados completos e reproduzíveis da medição estão em `docs/performance-0.8.6.json`.

## Verificação no navegador

- Piloto automático e Modo Sport foram ativados simultaneamente e o veículo seguiu a rota.
- Os dois controles somem ao abrir Corridas, Garagem, Minha Frota, Caixa ou Cidade e voltam ao fechar a janela.
- Cidade e Garagem foram inspecionadas em 1.440 × 900 e 390 × 844, sem rolagem horizontal no mobile.
- A localização visível mudou durante a condução de um fallback setorial para uma via real, por exemplo “SRPS, Setores Centrais, Brasília, DF”.
- Não houve o aviso “O próximo trecho do mapa não pôde ser carregado. Tentando novamente.” na compilação atual.
- Não houve erro ou alerta de console associado à URL da compilação atual.
- A inspeção visual confirmou transições de largura contínuas, sem círculos de preenchimento redundantes em segmentos retos e sem emendas abertas.

## Bateria automatizada

- Validação estrutural do mapa: aprovada.
- Simulação de navegação: aprovada.
- Simulações de tráfego nas densidades 20, 40, 72 e 100: aprovadas.
- Simulação de economia: aprovada.
- Testes unitários: 152 aprovados em 37 arquivos.
- Testes ponta a ponta: 24 aprovados, incluindo desktop, mobile, frota, funcionários, Cidade, Garagem, piloto automático, Modo Sport, colisões, congestionamento, abastecimento, oficina e persistência.
