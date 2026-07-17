# Desempenho — PLAYABLE 0.8.2

Data local: 17 de julho de 2026. Medição no build de produção, em Chromium headless, após 2,5 s de aquecimento e com oito amostras estabilizadas por cenário.

## Resultado final

| Cenário | Carregamento do documento | Jogo pronto | Heap JS | FPS mínimo | FPS mediano | FPS máximo | Trânsito |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop 1440×900 | 184 ms | 6.302 ms | 415 MB | 30 | 31 | 34 | 72 NPCs |
| Mobile 390×844 + piloto | 168 ms | 4.644 ms | 441 MB | 50 | 57 | 58 | 72 NPCs |

Uma repetição imediatamente anterior registrou 32 FPS medianos no desktop e 56 FPS no mobile. Os dois resultados sustentam a meta de pelo menos 30 FPS, com 9 ônibus, 10 entidades aéreas e 73 entidades terrestres contando o jogador.

O desktop preserva a resolução interna de 95% da versão anterior. Em telas grandes, a alta densidade do canvas permite desligar a suavização multiamostra redundante; marcações de faixa e vegetação distante usam LOD de 240 m. Mobile permanece em resolução nativa e com suavização.

## Comparação com a base 0.8.0

A 0.8.0 preservava o mapa e o benchmark da linha 0.7: 37 FPS medianos no desktop, 51 FPS no mobile, grafo compactado de 5,18 MiB e 73,6 MiB de chunks. Comparação com a 0.8.2:

| Métrica | 0.8.0 | 0.8.2 | Diferença |
|---|---:|---:|---:|
| FPS mediano desktop | 37 | 31 | -16,2% |
| FPS mediano mobile | 51 | 57 | +11,8% |
| Grafo compactado | 5,18 MiB | 15,53 MiB | +199,8% |
| Chunks publicados | 73,6 MiB | 153,8 MiB | +109,0% |
| Chunks ativos | até 9 | até 9 | sem aumento |
| Cache máximo | 14 | 14 | sem aumento |

O aumento em disco decorre da expansão para Lago Sul, Jardim Botânico, Lago Norte e Aeroporto. A partida não carrega os 780 chunks: mantém somente o chunk atual e até oito adjacentes, descartando cache excedente.

## Bundle

Comparação com o build imediatamente anterior da 0.8.1:

| Artefato | 0.8.1 | 0.8.2 | Diferença |
|---|---:|---:|---:|
| JavaScript | 2.032,19 kB | 2.055,01 kB | +1,12% |
| JavaScript gzip | 544,53 kB | 550,67 kB | +1,13% |
| CSS | 29,55 kB | 29,94 kB | +1,32% |
| CSS gzip | 7,54 kB | 7,61 kB | +0,93% |
| Precache PWA | 4.869,00 KiB | 5.216,71 KiB | +7,14% |

Os dados geográficos somam 172,43 MiB publicados, mas permanecem fora do precache principal e entram no cache sob demanda. A fonte OSM bruta compactada ocupa 26,53 MiB e não é baixada pelo jogo.

## Controles preservados

- LOD espacial de vias, prédios, tags, veículos e serviços;
- janela ativa de até nove chunks e cache máximo de 14;
- serviços consultados por região/chunk, sem carregar todos os POIs visuais;
- tráfego com teto técnico de 350 e população padrão de 72 NPCs;
- nenhuma busca de rota global executada por frame;
- movimento online continua por canais de chunk e sem listeners acumulados nos testes;
- troca de chunk mantém o mesmo grafo e substitui somente a janela visual local.

## Limitações observadas

O grafo dirigido ainda é carregado globalmente para permitir viagens contínuas entre regiões, o que elevou o heap observado para cerca de 441 MB. Os 780 chunks visuais não são carregados juntos e a versão se manteve estável nos testes desktop/mobile, mas compactar o grafo em setores hierárquicos é a principal recomendação de desempenho para a próxima versão.

O bundle JavaScript ainda gera o aviso de chunk acima de 500 kB. Separar Phaser, telas administrativas e catálogos regionais por carregamento dinâmico reduzirá o custo inicial sem alterar a simulação.
