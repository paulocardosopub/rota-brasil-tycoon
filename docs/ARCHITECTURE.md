# Decisões de arquitetura — Playable 0.4.0

## Limites dos módulos

- `src/game`: simulação Phaser. A cena orquestra sistemas, mas direção, pista, missão, tarifa, trânsito e entidades têm módulos próprios.
- `src/map`: carregamento, projeção em metros e Dijkstra sobre grafo dirigido.
- `src/ui`: React para HUD, telas, painéis e controles de toque; não calcula física nem economia.
- `src/services`: save local e integração Supabase opcional.
- `src/config`: valores de balanceamento e parâmetros de simulação centralizados.
- `src/types`: contratos compartilhados de mapa, save, missão e telemetria.

Phaser e React trocam apenas comandos e snapshots por `game/events.ts`. Isso mantém a futura substituição do HUD ou empacotamento via Capacitor sem acoplar a simulação ao DOM.

`src/config/vehiclePhysics.ts` é a fonte única para aceleração, frenagem, direção, resistência, recuperação e resposta de colisão. `TrafficPhysics.ts` mantém cálculos puros (previsão, contato varrido, velocidade relativa e gravidade), enquanto `TrafficSystem.ts` administra o estado dos veículos e a política de sinais. O save v2 persiste progresso e preferências, mantém backup rotativo e nunca apaga automaticamente o conteúdo corrompido.

## Mapa e desempenho

Latitude/longitude é convertida para coordenadas cartesianas locais em metros. O render usa uma transformação ortográfica inclinada, mas física, distância, combustível e rotas permanecem no espaço métrico. O importador gera chunks de 400 m e o índice de superfície agrupa segmentos em células de 100 m. Veículos e NPCs são criados de um pool fixo; os distantes são ocultados ou atualizados com menor frequência.

## Expansão futura

O grafo dirigido serve a missões, tráfego e piloto automático. O modo manual envia entradas sem correção de direção; o piloto usa a rota e os avisos do trânsito para controlar direção e velocidade. Novos veículos devem implementar parâmetros compatíveis com `VehicleController`; novas carreiras podem reutilizar rotas e lançar suas próprias missões sem alterar o HUD principal.
