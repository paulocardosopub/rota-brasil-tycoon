# Desempenho e streaming — 0.7.0

## Resultado do benchmark de produção

| Cenário | FPS mínimo | FPS mediano | FPS máximo | Trânsito |
|---|---:|---:|---:|---:|
| Desktop 1440×900 | 36 | 37 | 40 | 72 NPCs |
| Mobile 390×844 + piloto | 50 | 51 | 52 | 72 NPCs |

Ambos mantiveram 9 ônibus, 10 entidades aéreas e 73 entidades terrestres totais contando o jogador. O limite técnico continua em 350.

## Controles de custo

- chunks de mapa e grafo fora do precache da PWA;
- 23 arquivos e cerca de 4,59 MiB no precache do núcleo;
- grafo global gzip de cerca de 5,18 MiB;
- 73,6 MiB de chunks publicados, carregados somente sob demanda;
- cache de 14 chunks e janela ativa de até nove;
- LOD visual com raio móvel e atualização a cada deslocamento relevante;
- escala interna de 80% em telas largas, preservando o tamanho visual e coordenadas de entrada;
- 72 NPCs continuam simulados; veículos distantes compartilham uma camada gráfica;
- marcações detalhadas priorizam avenidas e o modo de qualidade alta mantém todos os detalhes;
- HUD usa superfícies opacas leves, sem desfoque contínuo sobre o canvas.

O benchmark descarta 2,5 segundos de aquecimento de GPU/chunks e mede oito amostras estabilizadas por cenário. A aprovação exige mediana mínima de 30 FPS, exatamente 72 NPCs e respeito ao teto terrestre.
