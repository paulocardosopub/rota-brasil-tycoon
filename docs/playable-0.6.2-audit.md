# Hotfix — Playable 0.6.2

Correção pontual anterior à reconstrução viária planejada para a 0.7.0.

## Causa da órbita intermitente

Ao recriar a simulação detalhada entre dois nós do grafo, o roteador podia selecionar o nó geometricamente mais próximo mesmo quando ele estava atrás do veículo. Em vias de mão única, a navegação tentava retornar enquanto a assistência de faixa preservava o sentido legal, fazendo o funcionário andar em círculos. Além disso, cada recriação da camada reiniciava a detecção de falta de progresso.

## Correções

- entrada da rota considera posição e direção atual do veículo;
- nós adiante são priorizados sem permitir caminho contra a mão;
- progresso é calculado sobre segmentos da rota, inclusive entre pontos distantes;
- memória de progresso permanece ativa durante recálculos para o mesmo destino;
- órbita é detectada pelo giro acumulado sem redução do caminho restante;
- a primeira recuperação recalcula e realinha o veículo;
- uma reincidência reposiciona o carro poucos metros adiante sobre a própria rota válida;
- filas e sinais vermelhos não são confundidos com órbita.

## Regressão automatizada

O funcionário percorre sete destinos consecutivos no mapa real. Em cada viagem, a camada detalhada é recriada entre nós do grafo e o teste exige chegada ao destino. O navegador também desativa e reativa o acompanhamento, confirma o mesmo alvo e verifica que o caminho restante continua diminuindo.
