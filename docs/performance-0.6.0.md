# Desempenho — Playable 0.6.0

Benchmark reproduzível com `npm run performance:benchmark`, Chromium headless, oito amostras após o carregamento e execução sequencial para evitar dois jogos disputando a mesma GPU/CPU.

| Preset | FPS mínimo | FPS mediano | FPS máximo | NPCs | Ônibus | Sombras aéreas | Entidades terrestres |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop 1440×900 | 24 | 33 | 47 | 72 | 9 | 10 | 73 |
| mobile 390×844, piloto ligado | 29 | 39 | 50 | 72 | 9 | 10 | 73 |

O critério automatizado exige mediana mínima de 30 FPS, exatamente 72 NPCs no preset alto/automático e no máximo 350 entidades terrestres. A captura visual do desktop registrou 47 FPS em um quadro estável; a tabela usa a repetição mais conservadora do benchmark para comparação futura.

A redução em relação aos 350 NPCs padrão anteriores é intencional. O teto técnico continua disponível, mas o jogo inicia leve e reserva uma vaga do trânsito ambiente sempre que o carro de um funcionário entra na camada física.
