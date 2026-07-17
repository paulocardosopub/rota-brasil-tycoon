# Rebalanceamento econômico — PLAYABLE 0.8.2

## Método

O mesmo simulador determinístico foi executado antes e depois da alteração. Foram mantidos combustível, desgaste, colisões, manutenção, comissão, táxi, piloto, frota e limite de renda offline. Os parâmetros continuam centralizados em `EconomyConfig.ts`.

## Comparação principal

| Cenário (30 corridas) | 0.8.1 | 0.8.2 | Diferença |
|---|---:|---:|---:|
| Jogador médio | R$ 357,34 | R$ 415,49 | +16,3% |
| Cuidadoso | R$ 410,63 | R$ 457,16 | +11,3% |
| Manual | R$ 382,12 | R$ 423,67 | +10,9% |
| Piloto automático | R$ 376,41 | R$ 418,50 | +11,2% |
| Corridas curtas | R$ 228,58 | R$ 251,10 | +9,9% |
| Corridas mistas | R$ 442,81 | R$ 490,52 | +10,8% |
| Jogador ruim | R$ 290,02 | R$ 309,58 | +6,7% |

A dívida residual do jogador ruim caiu de R$ 66,86 para R$ 53,03, sem remover o risco de direção descuidada. O ganho médio normal ficou em **+16,3%**, dentro da meta de 10% a 20%.

## Viagens regionais

Os 12 cenários regionais ficaram lucrativos e apresentaram melhoria média de **18,24%**. Lago Sul, Jardim Botânico e viagens entre regiões ultrapassam 20% isoladamente porque a tarifa anterior batia cedo no teto e remunerava uma viagem longa como curta. O teto foi corrigido de forma limitada, sem multiplicador global.

| Cenário | Antes líquido | Depois líquido | Diferença |
|---|---:|---:|---:|
| Curta central | R$ 14,85 | R$ 16,20 | +9,09% |
| Regional | R$ 31,04 | R$ 35,23 | +13,50% |
| Lago Sul | R$ 45,43 | R$ 56,62 | +24,63% |
| Jardim Botânico | R$ 43,45 | R$ 54,67 | +25,82% |
| Entre regiões | R$ 39,83 | R$ 51,09 | +28,27% |
| Retorno | R$ 36,14 | R$ 43,49 | +20,34% |
| Trânsito normal | R$ 37,64 | R$ 42,69 | +13,42% |
| Manual | R$ 46,99 | R$ 53,97 | +14,85% |
| Piloto | R$ 36,76 | R$ 41,89 | +13,96% |
| Combustível baixo | R$ 32,46 | R$ 36,88 | +13,62% |
| Oficina distante | R$ 32,52 | R$ 38,51 | +18,42% |
| Base regional | R$ 31,80 | R$ 39,11 | +22,99% |

## Frota e progressão

- primeiro funcionário: R$ 159,88/h, contra R$ 152,02/h (+5,2%);
- táxi manual: R$ 195,05/h; táxi com piloto: R$ 180,66/h;
- regularização: 72 minutos; primeira contratação: 107 minutos; segundo veículo: 257 minutos;
- retorno offline continua limitado a oito horas e com eficiência reduzida;
- todos os cenários automáticos ficaram com risco baixo de softlock.

## Parâmetros alterados

- tarifa por quilômetro: 4,20 → 4,70;
- teto de tarifa: 48 → 56, principalmente para corrigir viagens longas;
- gorjeta e avaliação receberam aumento discreto;
- reparo rápido: 48 → 44; reparo parcial: 105 → 100;
- desgaste por quilômetro: 0,018 → 0,017;
- deslocamento vazio regional é reduzido pelas preferências do jogador e dos funcionários.

Resultado local: `npm run economy:simulate` aprovado.
