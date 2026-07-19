# Auditoria curta — PLAYABLE 0.8.8

## Escopo entregue

- Ritmo global centralizado em `GAMEPLAY_SPEED_MULTIPLIER = 2`; dia completo em 48 minutos reais e HUD “Ritmo do mundo: 2×”.
- Simulação física em passos de até 67 ms, com colisão varrida no trajeto, maior orçamento por quadro e descarte seguro de travadas longas para evitar teletransporte.
- Piloto com limpeza de ruído/duplicatas/emendas, curvas leves/médias/fechadas, antecipação 2×, histerese de retomada e perfis para motos, carros, vans, micro-ônibus e ônibus.
- Streaming com bloco atual prioritário, prefetch direcional e do corredor da rota, três buscas seguras (uma em conexão limitada), cancelamento de trabalho obsoleto, cache persistente e parsing em worker quando disponível. A renderização recentraliza durante a viagem e limita temporariamente a velocidade se o carro alcançar a margem segura antes de o próximo bloco ficar pronto.
- Preparação remota confirmável com combustível, reparo, taxa de conveniência de 10% (mínimo R$ 5), tempo e total; uma cobrança idempotente e início automático após o serviço.
- Visualização de qualquer veículo sem alterar a operação; controle temporário do carro do funcionário com pausa da renda, lease online, posição final preservada e retomada sem duplicidade.
- Mapa geral lazy de Brasília em WebP (aprox. 94 KiB), gerado de 5.156 vias principais OSM; marcadores dinâmicos apenas para jogador, frota própria, funcionários, garagens próprias e jogadores online.
- Save v12 preserva visualização, controle temporário, operação pausada, posição, preparação, reparo e custos já cobrados.

## Segurança de dados e online

Não foi necessária migration nova. O lease por veículo e as políticas RLS do proprietário já existiam no schema publicado; a 0.8.8 passa a trocar o lease ao assumir/devolver um veículo e mantém heartbeat, timeout e reconexão existentes.

## Validação

- Testes unitários cobrem projeção do mapa, ruído de rota, categorias de veículo, preparação/cobrança, reload e controle temporário.
- E2E cobre lazy load/cache do mapa, filtros, ausência de NPC, desktop/mobile sem rolagem horizontal e entrada/movimento/saída de jogador online.
- Resultado final: 167 testes unitários e 30 cenários E2E aprovados, incluindo duas abas disputando o mesmo veículo e liberação do lease ao fechar.
- As simulações finais de economia, trânsito, navegação, online e desempenho foram executadas no fechamento da release.

## Resultados medidos

- Progressão: o cenário de primeiro funcionário mantém lucro de R$ 203,49 por hora de jogo. Como uma hora do jogo agora leva 30 minutos reais, o potencial passa de aproximadamente R$ 203,49/h real na 0.8.7 para R$ 406,98/h real na 0.8.8, sem alterar pagamentos ou preços.
- Trânsito e navegação: 20/40/72/100 veículos sem deadlock ou colisão de reserva; 112 rotas globais e 304.109 nós de superfície sem falhas.
- Desempenho: desktop 1440×900 com medianas de 31–37 FPS; mobile 390×844 com piloto em 47–60 FPS. Interface pronta em 137 ms/71 ms e jogo pronto em 2,94 s/1,06 s.
- Bundle: 2.027.056 bytes nos assets da aplicação; mapa geral WebP com 95.892 bytes, carregado apenas ao abrir o painel.
- Carregamento: o mapa inicial continua progressivo (17 requisições até o jogo ficar pronto); o mapa geral não entra nesse caminho e não instancia blocos detalhados.

Os dados reproduzíveis ficam em `performance-0.8.8.json` e `traffic-simulation-0.8.8.md`. A versão dos dados viários permanece `brasilia-0.8.6`; não houve regeneração histórica do mapa.
