# Decisões de arquitetura — Playable 0.1.0

## Limites dos módulos

- `src/game`: simulação Phaser. A cena orquestra sistemas, mas direção, pista, missão, tarifa, trânsito e entidades têm módulos próprios.
- `src/map`: carregamento, projeção em metros e Dijkstra sobre grafo dirigido.
- `src/ui`: React para HUD, telas, painéis e controles de toque; não calcula física nem economia.
- `src/services`: save local e integração Supabase opcional.
- `src/config`: valores de balanceamento e parâmetros de simulação centralizados.
- `src/types`: contratos compartilhados de mapa, save, missão e telemetria.

Phaser e React trocam apenas comandos e snapshots por `game/events.ts`. Isso mantém a futura substituição do HUD ou empacotamento via Capacitor sem acoplar a simulação ao DOM.

## Mapa e desempenho

Latitude/longitude é convertida para coordenadas cartesianas locais em metros. O render usa uma transformação ortográfica inclinada, mas física, distância, combustível e rotas permanecem no espaço métrico. O importador gera chunks de 400 m e o índice de superfície agrupa segmentos em células de 100 m. Veículos e NPCs são criados de um pool fixo; os distantes são ocultados ou atualizados com menor frequência.

## Expansão futura

O grafo dirigido já serve a missões, tráfego e ao futuro piloto automático. Novos veículos devem implementar parâmetros compatíveis com `VehicleController`; novas carreiras podem reutilizar rotas e lançar suas próprias missões sem alterar o HUD principal.
