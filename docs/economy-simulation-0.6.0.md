# Simulação econômica — Playable 0.6.0

Executada pelo comando `npm run economy:simulate`. O simulador reutiliza as regras reais de regularização, contratação, compra, atribuição, turno, combustível, comissão, manutenção e ledger. Os valores abaixo são determinísticos e servem como alarme de regressão, não como promessa de renda fixa.

## Doze cenários obrigatórios

| Cenário | Horas | Corridas | Receita bruta | Custos | Lucro líquido |
| --- | ---: | ---: | ---: | ---: | ---: |
| jogador clandestino | 1 | 15 | R$ 66,83 | R$ 0,00 | R$ 66,83 |
| táxi manual | 1 | 12 | R$ 233,76 | R$ 48,30 | R$ 185,46 |
| táxi com piloto | 1 | 11 | R$ 220,08 | R$ 48,30 | R$ 171,78 |
| primeiro funcionário | 1 | 11 | R$ 219,10 | R$ 67,08 | R$ 152,02 |
| veículo compartilhado | 1 | 7 | R$ 157,75 | R$ 48,30 | R$ 109,45 |
| dois veículos | 1 | 23 | R$ 452,86 | R$ 115,38 | R$ 337,48 |
| operação de 1 hora | 1 | 11 | R$ 219,10 | R$ 67,08 | R$ 152,02 |
| operação de 4 horas | 4 | 45 | R$ 896,31 | R$ 274,42 | R$ 621,89 |
| retorno offline de 8 horas | 8 | 74 | R$ 1.473,93 | R$ 451,28 | R$ 1.022,65 |
| motorista seguro | 4 | 45 | R$ 896,31 | R$ 274,42 | R$ 621,89 |
| motorista menos experiente | 4 | 46 | R$ 906,84 | R$ 325,21 | R$ 581,63 |
| manutenção baixa | 4 | 45 | R$ 896,31 | R$ 274,42 | R$ 621,89 |

O cenário de manutenção baixa termina muito próximo da parada obrigatória e tem 82% de chance indicativa de interrupção. O offline perde eficiência depois de quatro horas e nunca ultrapassa oito horas acumuladas. Alterar o relógio para trás não concede renda.

## Marcos e conclusão

- regularização estimada: 76 minutos;
- primeira contratação: 111 minutos;
- segundo veículo: 261 minutos;
- o jogador ativo mantém vantagem sobre a primeira renda passiva;
- o primeiro funcionário permanece lucrativo depois de combustível, comissão e reserva de manutenção;
- a renda offline não cresce linearmente sem limites.

Além desses cenários, os dez perfis históricos da economia 0.5.0 continuam rodando. O teste automático reprova lucro médio negativo, primeiro abastecimento/compra fora da janela de 15–30 minutos, diferença excessiva entre manual e piloto ou quebra das três relações acima.
