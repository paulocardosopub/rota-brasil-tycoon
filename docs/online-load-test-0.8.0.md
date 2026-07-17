# Teste de carga online — 0.8.0

## Estratégia segura

CI usa protocolo puro, `BroadcastChannel` local e dois contextos Chromium. Nenhum teste agressivo aponta para produção. O simulador `npm run online:simulate` modela 10, 100 e 1.000 jogadores sem abrir sockets externos; staging autorizado deve ser usado para latência/fan-out reais.

## Cenários

- serialização, limite de payload, sequência, pacote duplicado e fora de ordem;
- interpolação, menor arco angular, extrapolação curta, freeze e timeout;
- taxa adaptativa parado/lento/rápido e interesse próximo/médio/distante;
- handoff com sobreposição e ausência de tópico global de movimento;
- 2 clientes no mesmo mundo mock, movimento bidirecional, modo solo e remoção;
- orçamento de 10/100/1.000, densidades de 5/10/25 atores por chunk e funcionários;
- baseline preservada: mapa, tráfego 20/40/72/100, economia, frota offline e 20 cenários legados.

## Limites de plataforma considerados

Em 17/07/2026, os [limites oficiais de Realtime](https://supabase.com/docs/guides/realtime/limits) indicam 100 mensagens/s no Free, 500 no Pro com spend cap e 2.500 no Pro sem cap/Team, além de 100 canais por conexão. O cenário de 1.000 jogadores é apenas planejamento: não pode ser executado no projeto público sem particionamento e aumento autorizado de limites.

Resultados reproduzíveis e custo estimado ficam em `online-message-budget-0.8.0.md`.
