# Auditoria Playable — 0.7.0

## Entrega

A versão substitui o recorte central por uma Brasília de 157 km², sem remover economia, táxi, serviços, garagem, frota, funcionários, direção manual ou piloto automático.

## Rotas e dirigibilidade

- rota do jogador considera a direção atual e não seleciona o nó atrás em mão única;
- progresso da rota mantém um único segmento final e não provoca recálculo ao passar por conexões paralelas;
- piloto embarca, entrega, freia no destino e aguarda a próxima recomendação;
- bloqueio atrás de NPC imóvel é liberado após espera segura;
- colisão e impasse de frente usam período sem física para separar os veículos;
- funcionário usa destino estável, grafo global, recuperação de saída de rota, órbita, falta de progresso e bloqueio no trânsito;
- ao acompanhar um funcionário, o streaming muda o foco para o chunk dele.

## Mapa e trânsito

- validação estrutural aprovada: 19.756 vias, 36.539 faixas, 109.047 nós e 279 chunks;
- oito rotas entre regiões aprovadas;
- simulação determinística aprovada com 20, 40, 72 e 100 veículos;
- zero deadlock permanente, colisão de reserva, conflito frente a frente ou loop;
- sentidos, `oneway=-1`, camadas e conectores possuem testes unitários próprios.

## Persistência

O save v5 migra saves anteriores com backup, preserva a posição antiga quando válida e, caso contrário, usa a última posição segura ou a faixa mais próxima. São persistidos mapa, chunk, região, faixa, segmento, posição local/geográfica e missão ativa.

## Validações executadas

- TypeScript/build: aprovado;
- Vitest: 24 arquivos, 80 testes aprovados;
- Playwright: 20 cenários funcionais/visuais aprovados após o ajuste de prioridade do serviço selecionado;
- mapa: aprovado em 157,0 km²;
- trânsito: aprovado em 20/40/72/100;
- economia: cenários anteriores aprovados;
- PWA: 23 entradas no precache, chunks em cache de runtime;
- benchmark: 37 FPS desktop e 51 FPS mobile de mediana.

## Observações

Os 440 corredores apontados pela auditoria com variação de largura superior a 25% refletem tags reais/explicitadas e permanecem listados para inspeção visual futura; não são erros estruturais. O pipeline mantém overrides separados dos dados brutos.
