# Simulação econômica — 0.5.0

Execução reproduzível: `npm run economy:simulate`. O simulador usa os mesmos calculadores de tarifa, gorjeta, combustível, transações, progressão e custos do jogo, sem Phaser ou navegador.

## Resultado de 30 corridas

| Perfil | Minutos | Saldo final | Lucro | 1º abastecimento | 1ª melhoria | 1º reparo | Pronto para regularizar |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cuidadoso | 120 | R$ 510,63 | R$ 410,63 | 16 min | 28 min | — | 72 min |
| Médio | 120 | R$ 457,34 | R$ 357,34 | 20 min | 28 min | — | 80 min |
| Ruim | 150 | R$ 390,02 + R$ 66,86 de dívida | R$ 290,02 | 20 min | 35 min | 45 min | não |
| Manual | 114 | R$ 482,12 | R$ 382,12 | 15 min | 27 min | — | 72 min |
| Piloto | 123 | R$ 476,41 | R$ 376,41 | 16 min | 29 min | — | 78 min |
| Corridas curtas | 90 | R$ 328,58 | R$ 228,58 | 27 min | 18 min | — | 84 min |
| Misto | 156 | R$ 542,81 | R$ 442,81 | 21 min | 31 min | — | 88 min |
| Foco em melhorias | 120 | R$ 474,79 | R$ 374,79 | 16 min | 28 min | — | 76 min |
| Foco em reparo | 135 | R$ 539,19 | R$ 439,19 | 18 min | — | 54 min | não |
| Regularização | 120 | R$ 478,89 | R$ 378,89 | 16 min | 28 min | — | 76 min |

## Leitura do equilíbrio

- primeira compra relevante: 15–30 minutos nos perfis centrais;
- primeiro abastecimento: 15–30 minutos em todos os perfis, inclusive corridas curtas;
- reparo: 45–54 minutos quando o perfil realmente acumula danos;
- regularização: 72–88 minutos para perfis aptos, dentro da meta de 45–90 minutos;
- jogador médio permanece lucrativo; jogador ruim acumula dívida recuperável, mas não entra em softlock;
- piloto e manual ficam próximos: o manual competente ganha vantagem pequena, não uma categoria econômica separada;
- combustível corresponde a aproximadamente 9 km/L antes de melhorias.

O comando falha com código diferente de zero se o perfil médio deixar de ser lucrativo, se abastecimento/compra saírem da janela ou se a diferença entre manual e piloto ficar excessiva.
