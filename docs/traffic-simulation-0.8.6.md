# Simulação de trânsito — 0.8.6

Simulação determinística sobre o mesmo grafo dirigido por faixa usado por jogador, piloto, NPCs e funcionários.

| Veículos | Movimentos | Maior espera | Recuperações | Deadlocks | Colisões | Frente a frente | Loops permanentes |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 20 | 13206 | 0 ticks | 0 | 0 | 0 | 0 | 0 |
| 40 | 27864 | 10 ticks | 2 | 0 | 0 | 0 | 0 |
| 72 | 59109 | 10 ticks | 7 | 0 | 0 | 0 | 0 |
| 100 | 85531 | 10 ticks | 9 | 0 | 0 | 0 | 0 |

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
