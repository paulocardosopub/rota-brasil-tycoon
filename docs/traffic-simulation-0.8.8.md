# Simulação de trânsito — 0.8.8

Simulação determinística sobre o mesmo grafo dirigido por faixa usado por jogador, piloto, NPCs e funcionários.

| Veículos | Movimentos | Maior espera | Recuperações | Deadlocks | Colisões | Frente a frente | Loops permanentes |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 20 | 13206 | 0 ticks | 0 | 0 | 0 | 0 | 0 |
| 40 | 27864 | 10 ticks | 2 | 0 | 0 | 0 | 0 |
| 72 | 59109 | 10 ticks | 7 | 0 | 0 | 0 | 0 |
| 100 | 85531 | 10 ticks | 9 | 0 | 0 | 0 | 0 |

## Ciclo diário

| Período | Horário amostrado | Multiplicador | NPCs-alvo sobre 72 | Fluxo direcional |
|---|---:|---:|---:|---|
| Madrugada | 02:00 | 40% | 29 | balanced |
| Amanhecer | 06:00 | 57% | 41 | balanced |
| Pico da manhã | 07:30 | 100% | 72 | toward-central |
| Dia | 12:00 | 70% | 50 | balanced |
| Transição da tarde | 16:30 | 77% | 56 | toward-residential |
| Pico da tarde | 17:30 | 100% | 72 | toward-residential |
| Noite | 21:00 | 65% | 47 | balanced |
| Noite avançada | 23:00 | 50% | 36 | balanced |

A população muda gradualmente e somente fora da câmera. Nos picos, manhã direciona o fluxo às áreas centrais/comerciais/UnB e tarde às áreas residenciais, Lago Sul, Sudoeste e Jardim Botânico. Jogadores online e veículos de funcionários ocupam primeiro as vagas do teto, substituindo NPCs.

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
