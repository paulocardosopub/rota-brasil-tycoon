# PLAYABLE 0.8.3 — auditoria de entrega

## Escopo

- A Garagem do Hatch foi migrada gratuitamente para **GARAGEM CENTRAL**.
- As três bases regionais reais já validadas na 0.8.2 podem ser compradas como propriedades individuais do jogador.
- Cada garagem comporta 5 veículos e 5 funcionários; saves antigos acima do limite são preservados, mas novas inclusões ficam bloqueadas.
- Veículos e funcionários registram sua garagem-base. Compras, transferências, custos e limites ficam centralizados no serviço da frota e protegidos por migration/RLS no backend.
- Ofertas de corrida só aceitam embarques entre 500 m e 2 km pela rota viária real.
- Balões compactos usam menor antecipação, limite de 20 km/h e direção tangencial mais suave.
- NPCs não usam mais conexões sintéticas sem superfície viária; a recuperação do piloto recalcula a rota somente depois de retornar à faixa.
- O canvas voltou a renderizar em resolução nativa (relação backing store/CSS 1:1), com antialiasing ativo.

## Migração

Save 8 é idempotente. Todo veículo e funcionário antigo recebe a Garagem Central como base. Nenhuma entidade, patrimônio, conta, save local ou save em nuvem é removido. A migration `202607170005_playable_083_regional_garages.sql` cria propriedades por usuário, atribuições e validação de capacidade no servidor.

## Validação local

- Identidade exibida: `PLAYABLE 0.8.3 — GARAGENS REGIONAIS E AJUSTES DE NAVEGAÇÃO`.
- Canvas desktop observado: 1146×920 exibido e 1146×920 renderizado (1:1).
- Oferta observada: embarque a 1,6 km pela rota e viagem mostrada separadamente.
- Desempenho observado no navegador de desenvolvimento: 96 FPS com 72 NPCs.

## Bateria final

- lint e typecheck: aprovados;
- 127 testes unitários: aprovados;
- mapa: 32.674 vias, 60.598 faixas, 298.000 nós e 780 chunks validados;
- trânsito: 20/40/72/100 veículos, sem deadlock, colisão, contramão ou loop;
- economia e online: aprovados;
- build: 2.059,24 kB (551,73 kB gzip) no pacote principal;
- navegador: 22/22 cenários aprovados, incluindo recarga de corrida e ledger sem duplicação.
