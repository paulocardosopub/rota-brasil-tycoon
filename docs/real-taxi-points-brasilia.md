# Pontos de táxi reais — Brasília central

## Critério

Os três locais desta versão são objetos existentes do OpenStreetMap com `amenity=taxi`. Nenhum ponto foi inventado ou deslocado para parecer real. O jogo usa o nó viário roteável mais próximo como entrada e preserva o ponto original para desenho, embarque e atribuição.

Os arquivos são locais e versionados em `public/data/cities/brasilia/central/services/taxi-points.json`; não existe consulta externa durante a partida. A capacidade não estava informada nos objetos consultados, portanto o campo de origem permanece nulo e a capacidade 2 é apenas uma regra explícita de gameplay.

| ID do jogo | Objeto OSM | Posição local | Entrada roteável | Via de acesso |
| --- | --- | ---: | ---: | --- |
| `taxi-rank-sinpetaxi` | node 4185562619, Sinpetaxi | -29,948; -644,375 | node 2525721471 | way 245361255 |
| `taxi-rank-4608731445` | node 4608731445 | -272,018; -815,249 | node 2525721454 | way 124324176 |
| `taxi-rank-9966320444` | node 9966320444 | -972,292; 202,798 | próprio nó do grafo | way 527117799, mão única |

## Uso no jogo

- corridas oficiais podem nascer em ponto, por chamada de rua ou por central;
- o GPS termina na entrada correta e o piloto freia dentro do raio de embarque;
- os pontos mostram fila visual segura, sem bloquear a pista;
- o taxímetro só começa depois do embarque e usa distância/tempo realmente simulados.

Fonte e licença: OpenStreetMap contributors, ODbL 1.0. Consulte também `metadata.json` e a atribuição permanente no HUD.
