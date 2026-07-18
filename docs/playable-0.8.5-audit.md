# PLAYABLE 0.8.5 — Empresa de ônibus e transporte coletivo

## Base preservada

A implementação parte da release pública 0.8.4 e preserva autenticação, visitante, vínculo de conta, recuperação, nuvem com revisão/linhagem, modo solo/online, regiões, chunks, rotas, serviços, trânsito, táxi, taxímetro, frota, empresas comerciais e migrações anteriores. Não houve reset destrutivo. O save passa de 9 para 10 de forma idempotente.

## Transporte coletivo

- Empresa `Rota Coletiva Brasília`, liberada depois das empresas de entrega/frete e 15 corridas.
- Dois modelos genéricos: Micro-ônibus Urbano (24 passageiros, tanque 110 L) e Ônibus Urbano Convencional (72 passageiros, tanque 220 L).
- Física específica para massa, aceleração, frenagem, esterço, consumo e baixa tolerância fora de pista.
- Qualificação `BUS` para funcionários, com treinamento e validação antes de atribuir o veículo.
- Garagens compatíveis limitadas a Centro, Asa Sul e Sudoeste; permanece o limite 5 veículos/5 funcionários por base.
- Uma operação detalhada permanece ativa por vez. As demais continuam no simulador econômico resumido da frota.

## Linhas e fontes

O catálogo de gameplay usa códigos/corredores públicos e âncoras geográficas OSM auditáveis. Ele não se apresenta como reprodução integral dos horários oficiais.

| Linha | Corredor de gameplay | Fonte operacional | Geografia |
|---|---|---|---|
| 0.107 | Rodoviária, W3/L2 Sul, Esplanada | [DF no Ponto](https://dfnoponto.semob.df.gov.br/pesquisa-por-linhas/) | OSM ways 41648328, 263590275, 915117546 e 915505200 |
| 0.110 | Rodoviária, Universidade de Brasília | [DF no Ponto](https://dfnoponto.semob.df.gov.br/pesquisa-por-linhas/) | OSM ways 41648328 e 704086715 |
| 0.385 | Rodoviária, Sudoeste/Octogonal | [DF no Ponto](https://dfnoponto.semob.df.gov.br/pesquisa-por-linhas/) | OSM relation 3359488 e way 1456382131 |
| 0.147 | Rodoviária, Ponte das Garças, Jardim Botânico | [Administração do Jardim Botânico](https://www.jardimbotanico.df.gov.br/visitacao/como-chegar/) | OSM ways 41648328, 14477045 e 293384918 |

Geografia © OpenStreetMap contributors, ODbL 1.0. A Semob/DF também mantém a [página de dados do STPC](https://www.semob.df.gov.br/dados-do-sistema-de-transporte-publico-do-df). Nenhum dado do Google Maps foi utilizado.

## Operação e economia

O jogador seleciona uma linha, segue a rota viária até cada parada, precisa parar, abrir portas, embarcar/desembarcar e fechar portas antes de partir. O sistema persiste próxima parada, portas, ocupação, embarques, desembarques, recusados, receita e viagens concluídas. A tarifa de gameplay é R$ 5,50 por embarque. Lotação impede embarque acima da capacidade e registra passageiros recusados. Ao chegar ao terminal, a receita entra uma única vez no ledger e no histórico da empresa.

O HUD mostra linha, próxima parada, lotação, portas, receita e recusados. Piloto automático e direção manual compartilham a mesma rota. Os dois modelos foram incluídos no protocolo online sem elevar o teto terrestre.

## Nuvem e segurança

A migration `202607180002_playable_085_bus_transport.sql` amplia os modelos aceitos, inclui a empresa `bus` e cria resumos operacionais com RLS `owner_user_id = auth.uid()`. O save em nuvem continua sendo o documento autoritativo com conflito por revisão e linhagem; senha, JWT e service role não são gravados no jogo.

## Validação final

- TypeScript/lint: aprovado.
- Vitest: 37 arquivos, 133 testes aprovados.
- Playwright: 22 E2E aprovados em Chromium, incluindo desktop, mobile, piloto, serviços, online e frota.
- Mapa: 32.674 vias, 60.598 faixas, 298.000 nós, 780 chunks e 549,7 km² validados.
- Trânsito: cenários 20/40/72/100 aprovados, sem deadlock, colisão, contramão ou loop na simulação.
- Economia e online: simuladores aprovados.
- Desktop 1440×900: mínimo/mediana/máximo 31/31/32 FPS; 468 MB de heap no benchmark.
- Mobile 390×844 com piloto: mínimo/mediana/máximo 47/54/57 FPS; 631 MB de heap no benchmark.
- Build: JavaScript 2.092,33 kB bruto / 560,97 kB gzip; CSS 29,94 kB / 7,61 kB gzip.

## Limitações declaradas

- O catálogo é uma seleção operacional de quatro linhas e paradas de gameplay, não um espelho em tempo real de horários.
- Passageiros são simulação agregada e visual leve para preservar o orçamento mobile.
- Não há ônibus articulado, relógio global, horários de pico, amigos, comboios ou frotas compartilhadas nesta versão.
