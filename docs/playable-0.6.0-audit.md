# Auditoria — Playable 0.6.0

## Entrega funcional

- carreira regularizável de taxista, conversão não destrutiva do Hatch e taxímetro por tempo/distância reais;
- três pontos de táxi reais e rastreáveis, corridas de ponto, rua e central;
- contratação de um motorista, compra do Sedan 2012, atribuição exclusiva, turno físico próximo e econômico à distância;
- relatório de frota com receita, combustível, comissão, manutenção, multas, ocorrências e lucro;
- retorno offline limitado, eficiência reduzida e proteção contra retrocesso do relógio;
- save v4 com migração e backup, mantendo identidade, posição, combustível, condição, melhorias, histórico e transações do Hatch legado;
- schema Supabase normalizado, RLS por proprietário e compra atômica/idempotente do segundo veículo;
- HUD compacto com seis destinos principais, alertas clicáveis de combustível/reparo e controles móveis ocultos apenas no piloto;
- trânsito padrão reduzido a 72 NPCs mais 10 sombras aéreas, com teto técnico 350 e vaga reservada para o funcionário;
- convergência de faixas detectada antes do estreitamento, prioridade progressiva e índice de faixa corrigido na via menor.

## Regras verificadas

- veículo, motorista e turno têm um único controlador por vez;
- o jogador não recebe simultaneamente a produção do mesmo veículo dirigido por funcionário;
- toda movimentação financeira relevante passa pelo ledger com proprietário, frota, veículo, motorista e viagem;
- carro do funcionário respeita grafo dirigido, mão correta, semáforos, veículos próximos e superfícies viárias;
- entidades físicas terrestres nunca ultrapassam o teto global;
- produção distante não cria centenas de objetos Phaser;
- pontos adaptados continuam declarados como ficcionais; pontos de táxi são OSM reais.

## Verificações automatizadas

- TypeScript e lint;
- 64 testes unitários de save/migração, taxímetro, regularização, frota, economia, tráfego, física, rota e serviços;
- validação de 1.647 vias, 6.102 nós, 45 semáforos, 26 paradas, 529 prédios e dados dos serviços/pontos de táxi;
- dezenove cenários de navegador, incluindo auditoria visual em desktop/mobile;
- doze cenários novos de economia mais dez cenários herdados;
- build de produção e PWA.
- benchmark reproduzível: 33 FPS medianos em 1440×900 e 39 FPS medianos em 390×844 com piloto, 72 NPCs e 10 sombras aéreas.

## Limites conscientes

- a operação distante da frota é agregada por lotes determinísticos; o veículo só ganha representação física perto do jogador;
- os processos de licença são deliberadamente simplificados e rotulados como gameplay;
- a simulação usa física arcade 2.5D e não pretende reproduzir legislação, tarifa oficial ou trânsito de Brasília em tempo real;
- o teto 350 permanece para testes, mas não é o padrão recomendado para aparelhos modestos.
