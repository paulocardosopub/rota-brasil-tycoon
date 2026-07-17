# Simulação de trânsito — 0.7.0

Simulação determinística sobre o mesmo grafo dirigido por faixa usado por jogador, piloto, NPCs e funcionários.

| Veículos | Movimentos | Maior espera | Deadlocks | Colisões | Frente a frente | Loops |
|---:|---:|---:|---:|---:|---:|---:|
| 20 | 24000 | 0 ticks | 0 | 0 | 0 | 0 |
| 40 | 48000 | 0 ticks | 0 | 0 | 0 | 0 |
| 72 | 86395 | 2 ticks | 0 | 0 | 0 | 0 |
| 100 | 119990 | 2 ticks | 0 | 0 | 0 | 0 |

## Cenários cobertos

- 20, 40, 72 e 100 veículos;
- avenidas com quatro ou mais faixas e convergências reais;
- conectores de cruzamento e semáforos existentes nos chunks;
- rotatórias, mãos únicas, pistas paralelas, entradas e saídas;
- reserva de nó para zíper e prioridade alternada;
- veículo parado e recuperação após espera;
- funcionário representado como entidade prioritária dentro do mesmo teto;
- troca de chunk sem duplicação de identidade.

## Resultado

Aprovado: nenhum deadlock permanente, colisão de reserva, conflito frente a frente ou loop de rota.
