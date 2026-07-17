# Decisões de arquitetura — Playable 0.7.0

## Limites dos módulos

- `src/game`: simulação Phaser. A cena orquestra sistemas, mas direção, pista, missão, tarifa, trânsito e entidades têm módulos próprios.
- `src/map`: carregamento, projeção em metros e Dijkstra sobre grafo dirigido.
- `src/ui`: React para HUD, telas, painéis e controles de toque; não calcula física nem economia.
- `src/services`: save local e integração Supabase opcional.
- `src/config`: valores de balanceamento e parâmetros de simulação centralizados.
- `src/types`: contratos compartilhados de mapa, save, missão e telemetria.

Phaser e React trocam apenas comandos e snapshots por `game/events.ts`. Isso mantém a futura substituição do HUD ou empacotamento via Capacitor sem acoplar a simulação ao DOM.

`src/config/vehiclePhysics.ts` é a fonte única para aceleração, frenagem, direção, resistência, recuperação e resposta de colisão. `TrafficPhysics.ts` mantém cálculos puros (previsão, contato varrido, velocidade relativa e gravidade), enquanto `TrafficSystem.ts` administra o estado dos veículos e a política de sinais.

`TransactionLedger.ts` é o único módulo autorizado a alterar o dinheiro. `FareCalculator.ts` fixa o preço informal no aceite; `TaxiMeter.ts` mede a corrida oficial a partir do embarque. `ExpenseCalculator.ts` concentra combustível, reparos e melhorias. `DriverProgression.ts` e `RegularizationService.ts` governam a mudança profissional sem duplicar regras no HUD. O save v5 acrescenta versão do mapa, chunk, região, faixa, segmento, posição geográfica e última posição segura ao estado anterior; ele cria backup antes de migrar e nunca apaga automaticamente conteúdo corrompido.

## Mapa e desempenho

Latitude/longitude é convertida para coordenadas cartesianas locais em metros. O pipeline canônico normaliza vias, propaga largura/faixas ao corredor, gera faixas dirigidas e conectores por cruzamento e publica um grafo global compactado. O mapa é dividido em chunks de 800 m; uma janela 3×3 alimenta render, superfície, sinais e trânsito, enquanto o roteador mantém o grafo conectado da cidade. O render usa projeção ortográfica inclinada e LOD espacial adaptativo, mas física, distância, combustível e rotas permanecem métricos. O pool suporta teto 350 e usa 72 NPCs por padrão. Modelos próximos recebem detalhes próprios e os demais compartilham uma camada desenhada em lote. Aviões e helicópteros são ambiente visual sem colisão.

`FleetService.ts` é a autoridade transacional da frota. Um turno possui um motorista e um veículo exclusivos. `FleetVehicleSystem.ts` materializa esse veículo quando ele está no raio do jogador, usa o mesmo grafo dirigido e reserva uma vaga no pool de trânsito. Fora do raio, `fleetSimulationLevel` troca para simulação simplificada/econômica e `advanceFleetShift` agrega corridas sem instanciar entidades. A autoridade e o lease ficam explícitos no estado para evitar dupla simulação em futura sincronização online.

No backend opcional, a migração 0.6.0 normaliza carteiras, frotas, membros, veículos, propriedade, funcionários, atribuições, turnos, viagens, transações e posições. As políticas RLS comparam `owner_id` a `auth.uid()`. A função de compra do Sedan bloqueia carteira/frota, valida capacidade e idempotência, e confirma débito, veículo, propriedade e ledger em uma única transação.

Serviços são carregados de arquivos locais rastreáveis. Cada registro aponta para objeto, prédio, entrada e acesso do OpenStreetMap. O roteamento termina primeiro no nó viário de entrada e depois segue ao ponto de parada no lote. Oficina e garagem adaptadas carregam explicitamente `functionFictional: true`; nenhum ponto é sorteado em tempo de execução.

## Expansão futura

O grafo dirigido serve a missões, tráfego e piloto automático. O modo manual envia entradas sem correção de direção; o piloto usa a rota e os avisos do trânsito para controlar direção e velocidade. Novos veículos devem implementar parâmetros compatíveis com `VehicleController`; novas carreiras podem reutilizar rotas e lançar suas próprias missões sem alterar o HUD principal.
