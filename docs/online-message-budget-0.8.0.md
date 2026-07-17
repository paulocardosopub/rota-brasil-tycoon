# Orçamento de mensagens — Online Alpha 0.8.0

Gerado por `npm run online:simulate`. Não executa carga contra produção; é um modelo local reproduzível.

## Hipóteses

- snapshot compacto médio: 310 bytes antes do envelope WebSocket;
- taxa adaptativa ponderada: movimento rápido/normal a 12 Hz, lento a 5 Hz e parado a 1,5 Hz;
- um funcionário público adicional por parte dos jogadores, usando a mesma taxa;
- fan-out restrito ao chunk: uma emissão conta como uma mensagem enviada e uma por destinatário no mesmo chunk;
- 60 horas de uso no mês para a estimativa, sem incluir o preço base do plano, egress ou impostos;
- referência de preço em 17/07/2026: Pro inclui 5 milhões de mensagens e 500 conexões de pico; excedente em pacotes de 1 milhão a US$ 2,50 e 1.000 conexões a US$ 10.

| Jogadores | Atores com funcionários | Chunks | Densidade/chunk | Hz adaptativo | Envios/s | Mensagens faturáveis/s | Mensagens/h | MB/h por jogador | Estimativa 60 h (US$) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 12 | 2 | 6 | 8.50 | 102 | 612 | 2.203.200 | 68.3 | 320.00 |
| 100 | 125 | 10 | 13 | 9.03 | 1.128 | 14.664 | 52.790.400 | 163.7 | 7907.50 |
| 1000 | 1300 | 40 | 33 | 9.55 | 12.415 | 409.695 | 1.474.902.000 | 457.2 | 221235.00 |

## Efeito da taxa adaptativa

| Jogadores | Mensagens/h adaptativas | Mensagens/h a 15 Hz | Redução |
|---:|---:|---:|---:|
| 10 | 2.203.200 | 3.888.000 | 43.3% |
| 100 | 52.790.400 | 87.750.000 | 39.8% |
| 1000 | 1.474.902.000 | 2.316.600.000 | 36.3% |

## Leitura operacional

10 jogadores cabem no alpha com folga de conexão, mas o fan-out ainda torna sessões longas relevantes para a franquia mensal. Com 100 jogadores, deve-se usar Pro sem limite gratuito como premissa de staging e acompanhar o relatório de Realtime. O cenário de 1.000 jogadores excede o limite padrão agregado de mensagens por segundo e exige reduzir densidade/frequência, dividir mundos ou contratar limite maior; ele não deve ser disparado contra o projeto público.

O modelo é conservador: jogadores fora da área de interesse não recebem movimento direto, chunks vazios não geram broadcast e veículos parados caem para heartbeat. Presence, handoff e eventos visuais representam pequena parcela adicional e devem ser conferidos no painel de uso antes de ampliar o alpha.
