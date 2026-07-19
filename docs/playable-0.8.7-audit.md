# Auditoria curta — PLAYABLE 0.8.7

Data da validação: 18 de julho de 2026.

## Resultado

- Relógio compartilhado de 24 horas: um dia dura 96 minutos reais; o horário continua com a aba fechada e sincroniza suavemente com a referência do servidor quando disponível.
- Oito períodos controlam iluminação, faróis, lanternas, luzes próximas, densidade do trânsito e fluxo direcional. A população muda gradualmente apenas fora da câmera; jogadores e frota substituem NPCs dentro do teto.
- Os picos de 07:00–09:00 e 17:00–19:00 exibem aviso não bloqueante e aplicam uma única vez até 10% de demanda adicional às novas ofertas de passageiros.
- Turnos ativos e retorno offline ponderam trânsito e demanda pelos períodos atravessados. Save v11 preserva progresso anterior e a opção de efeitos reduzidos.
- O online usa a referência de horário na entrada e no heartbeat de 15 segundos, sem transmitir atualizações do relógio a cada quadro.

## Verificação

- 161 testes unitários aprovados em 39 arquivos.
- 27 cenários ponta a ponta aprovados em desktop e mobile. A execução completa revelou um roteiro antigo tentando clicar através do painel de desenvolvimento; a interação foi corrigida e o cenário isolado passou na repetição direcionada.
- Simulação de trânsito aprovada com 20, 40, 72 e 100 veículos, sem deadlock permanente, colisão de reserva, conflito frente a frente ou loop.
- Simulações de economia e orçamento online aprovadas; compilação de produção concluída.
- Inspeção visual local confirmou dia, pico da tarde e noite, incluindo relógio, aviso de pico, redução gradual de NPCs e luzes dos veículos.

## Desempenho

Medição na compilação de produção, mantendo o mapa progressivo e comparando madrugada, pico da manhã, dia, pico da tarde e noite:

| Plataforma | Menor mediana | Maior mediana | Meta |
|---|---:|---:|---:|
| Desktop 1440 × 900 | 33 FPS | 44 FPS | 30 FPS |
| Mobile 390 × 844 | 50 FPS | 60 FPS | 28 FPS |

Os dados reproduzíveis estão em `docs/performance-0.8.7.json`; o ciclo e os multiplicadores estão em `docs/traffic-simulation-0.8.7.md`. A malha viária e seus arquivos permanecem na versão de dados 0.8.6, sem regeneração ou repetição da auditoria histórica do mapa.
