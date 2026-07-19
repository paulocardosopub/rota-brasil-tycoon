# Rota Brasil Tycoon — PLAYABLE 0.8.7

## Ciclo de 24 horas, trânsito e demanda

- um dia completo dura 96 minutos reais, com relógio compartilhado de 24 horas e continuidade segura no modo solo;
- amanhecer, dia, pôr do sol e noite alteram gradualmente a iluminação, com faróis, lanternas, postes e luzes próximas;
- a densidade do trânsito acompanha oito períodos do dia sem reduzir artificialmente a velocidade dos NPCs;
- os picos de 07:00–09:00 e 17:00–19:00 direcionam os deslocamentos e aumentam a demanda de passageiros em até 10%;
- turnos de funcionários e operações offline consideram proporcionalmente o trânsito e a demanda atravessados;
- o modo online sincroniza apenas a referência do relógio, preservando baixo uso de mensagens e funcionamento integral sem backend;
- save v11 migra jogos anteriores e preserva horário, turnos, economia, frota e a opção de efeitos visuais reduzidos.

## Malha viária, piloto e carregamento progressivo

- larguras e quantidades de faixas agora são normalizadas por corredor, com transições graduais e sem oscilações curtas artificiais;
- asfalto, marcações, colisões e grafo dirigido compartilham a mesma geometria, inclusive em vias largas e conexões;
- o piloto automático usa uma máquina de estados com cancelamento seguro, tentativas limitadas e continuidade entre corridas consecutivas;
- o mapa abre com um núcleo global compacto e carrega blocos locais conforme posição, movimento e rota ativa;
- caches do mapa e dos módulos são versionados, limitados e descartam automaticamente dados de versões anteriores;
- a auditoria completa cobre 32.674 vias, 60.152 faixas, 304.109 nós e 780 blocos em 549,7 km².

## Frota, funcionários e treinamentos

- Minha Frota ganhou navegação direta entre visão geral, veículos, funcionários, garagens, transferências e treinamentos;
- veículos e funcionários possuem busca, filtros, seleção anterior/próxima e links recíprocos sem sequência de janelas;
- o layout usa lista lateral no desktop e seletor compacto no mobile, preservando a seleção atual entre as áreas;
- treinamentos sempre exibem nome, preço e motivo de indisponibilidade com contraste legível;
- funcionários podem levar um veículo danificado ao reparo, pagar o serviço uma única vez e iniciar o turno automaticamente após a manutenção.

## Velocidade e Modo Sport

- o fluxo médio dos veículos ficou aproximadamente 30% mais rápido;
- o botão **Modo Sport** fica ao lado do piloto automático e usa a velocidade máxima do veículo;
- o Sport aumenta o consumo de combustível em 18% enquanto estiver ativo.

## Expansão regional, economia e serviços

- Lago Sul, Jardim Botânico, Lago Norte, Aeroporto e os setores do Plano Piloto participam do mesmo grafo dirigido, com ofertas regionais válidas;
- o jogador escolhe uma região preferida, acumula familiaridade e recebe ofertas com distância e preço calculados pela rota real;
- funcionários recebem região, alcance, política de retorno, combustível, condição e serviços preferidos;
- 7 postos, 5 oficinas e 4 garagens/bases usam posições e acessos OpenStreetMap reais; adaptações fictícias são identificadas;
- o progresso normal ficou 16,3% mais acessível, mantendo combustível, desgaste, reparos e risco de operação;
- rotas de posto, oficina e garagem recalculam sozinhas quando o jogador assume a direção manual e se afasta;
- piloto, funcionários e NPCs ativam recuperação imprudente após 10 segundos de bloqueio persistente;
- save v10 preserva patrimônio anterior e acrescenta região, familiaridade, preferências regionais e linhagem segura da nuvem.

Jogo 2.5D de transporte brasileiro para navegador. Você começa ao volante de um Hatch 1998 em Brasília, atende passageiros, torna-se taxista e monta uma frota com funcionários que percorrem a mesma cidade física do jogador.

## Jogar localmente

Requer Node.js 24 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço exibido e escolha **Jogar como visitante**. Use `WASD` ou as setas para dirigir livremente, `Espaço` para o freio de mão, `H` para buzinar e segure `R` para reposicionar. A roda do mouse controla o zoom. O botão **Piloto automático** segue o GPS, respeita mãos, sinais e trânsito, embarca e entrega passageiros e escolhe a próxima corrida.

## Correções da 0.8.1

- cadastro e login agora aparecem como ações separadas na tela inicial;
- convidados podem vincular um e-mail nas configurações sem perder dinheiro, veículos, frota ou histórico;
- o progresso é salvo na nuvem antes da conversão da conta anônima;
- o taxímetro mostra a tarifa correndo desde a bandeirada e aplica o mínimo somente ao finalizar;
- todas as corridas de veículos licenciados usam o modo oficial e o layout de cadastro funciona em telas compactas.

## Online Alpha 0.8.0

- jogadores visitantes recebem uma identidade pública estável e entram de forma anônima quando o Supabase está configurado;
- jogadores e funcionários próximos aparecem na mesma cidade por canais privados de chunk, com Presence, Broadcast, interpolação e LOD;
- troca de chunk faz handoff com sobreposição, e concessões curtas impedem o mesmo veículo de dirigir em duas sessões;
- a frequência de movimento é adaptativa por distância e estado, com limites de payload, sequência, timestamp e extrapolação;
- falhas de autenticação, rede ou backend nunca bloqueiam a partida: o HUD passa para **Solo temporário** e reconecta em segundo plano;
- a configuração permite alternar Solo/Online, ocultar nome, funcionários e etiqueta da frota, além de vincular a conta visitante por e-mail;
- o save local foi migrado para **v6**, preservando progressão e adicionando perfil público, preferências e estado da sessão online.

Sem as variáveis do Supabase, a mesma compilação funciona integralmente em modo solo. Consulte [SUPABASE.md](./SUPABASE.md) para ativar o backend online.

## Correções da 0.7.2

- geometria de avenidas largas recalculada dentro da largura total do asfalto;
- faixas de mão única e corredores assimétricos usam o mesmo centro de faixa da física do veículo;
- malha completa de Brasília regenerada, removendo 37.958 ocorrências fora da superfície viária;
- auditoria permanente verifica 158.480 nós, 36.539 faixas e todas as ligações com margem suficiente para a largura inteira do carro.

## Correções da 0.7.1

- canvas mobile em resolução nativa e desktop a 95%, substituindo a antiga ampliação borrada de 20%;
- GPS ancorado ao segmento dirigido sob o veículo, sem saltar para vias paralelas;
- progresso de rota sequencial, sem pular instruções em alças ou cruzamentos próximos;
- piloto automático mantido no asfalto inclusive em curvas fechadas e pequenas falhas do mapa.

## O que mudou na 0.7.0

- Brasília cresceu de cerca de 4 km² para **157 km²**, cobrindo Asa Norte, Asa Sul, Setores Centrais, Sudoeste, Cruzeiro, Noroeste, Vila Planalto e Universidade de Brasília;
- 19.756 vias canônicas, 36.539 faixas detalhadas, 109.047 nós globais e 127.036 arestas dirigidas;
- grafo único por faixa para jogador, piloto automático, 72 NPCs e funcionários, com mão correta, `oneway=-1`, níveis, retornos, cruzamentos e conectores;
- 279 chunks de 800 m carregados em janela local, com cache limitado e atualização automática por região;
- GPS do jogador preserva o sentido inicial, não duplica o destino e evita recálculos em avenidas conectadas;
- piloto e funcionários recuperam bloqueios de trânsito, colisões, saída de rota, falta de progresso e órbitas sem permanecer girando;
- viagens curtas, médias, longas e entre regiões, com região de origem/destino visível;
- painel Cidade mostra região atual, regiões disponíveis e quantidade de trechos carregados;
- save local **v5**, com versão do mapa, chunk, região, faixa, segmento, posição geográfica e última posição segura;
- renderização com LOD espacial e escala adaptativa: 37 FPS medianos em 1440×900 e 51 FPS no mobile no benchmark local, mantendo 72 NPCs, 9 ônibus e 10 sombras aéreas;
- PWA mantém apenas o núcleo no precache; chunks e grafo entram no cache sob demanda.

Todos os sistemas anteriores continuam disponíveis: direção manual livre, combustível, oficina, colisões, serviços reais/adaptados, táxi oficial, taxímetro, regularização, segundo veículo, funcionários identificados como **Motorista + nome**, turnos e relatórios financeiros.

## Verificações

```bash
npm run typecheck
npm test
npm run test:e2e
npm run map:validate
npm run traffic:simulate
npm run economy:simulate
npm run online:simulate
npm run performance:benchmark -- http://127.0.0.1:4174
npm run build
```

O painel de desenvolvimento só aparece em `npm run dev` e abre com `Ctrl + Shift + D`.

## Dados de Brasília

O manifesto está em `public/data/cities/brasilia/manifest.json`; os chunks ficam em `public/data/cities/brasilia/chunks/` e o grafo global compactado em `routing-core-0.8.6.json.gz`. Durante a partida não ocorre consulta ao OpenStreetMap.

Fonte: OpenStreetMap contributors, ODbL 1.0. A caixa geográfica, data de importação, licença e atribuição estão em `metadata.json`, e a atribuição permanece visível no HUD. A fonte bruta compactada e seus metadados ficam em `data/map-sources/brasilia/`; o cache temporário de download não entra no Git.

```bash
npm run map:import
npm run map:validate
```

## GitHub Pages

O workflow `.github/workflows/web.yml` testa, compila e publica `main`. Em **Settings → Pages**, a origem deve ser **GitHub Actions**. O caminho base é calculado pelo nome do repositório.

## Auditorias

- [auditoria final da PLAYABLE 0.8.7](./docs/playable-0.8.7-audit.md)
- [desempenho nos cinco períodos da 0.8.7](./docs/performance-0.8.7.json)
- [simulação de trânsito e ciclo diário 0.8.7](./docs/traffic-simulation-0.8.7.md)
- [malha viária 0.8.6](./docs/road-network-audit-0.8.6.md)
- [desempenho 0.8.6](./docs/performance-0.8.6.json)
- [auditoria final da PLAYABLE 0.8.6](./docs/playable-0.8.6-audit.md)
- [auditoria da PLAYABLE 0.8.2](./docs/playable-0.8.2-audit.md)
- [cobertura regional 0.8.2](./docs/regional-coverage-0.8.2.md)
- [rebalanceamento econômico 0.8.2](./docs/economy-rebalance-0.8.2.md)
- [cobertura de serviços 0.8.2](./docs/service-coverage-0.8.2.md)
- [malha viária 0.8.2](./docs/road-network-audit-0.8.2.md)
- [simulação de trânsito 0.8.2](./docs/traffic-simulation-0.8.2.md)
- [desempenho 0.8.2](./docs/performance-0.8.2.md)
- [arquitetura online 0.8.0](./docs/online-architecture-0.8.0.md)
- [segurança online 0.8.0](./docs/online-security-0.8.0.md)
- [simulação e carga online](./docs/online-load-test-0.8.0.md)
- [orçamento de mensagens](./docs/online-message-budget-0.8.0.md)
- [limitações do Online Alpha](./docs/online-limitations-0.8.0.md)
- [auditoria completa da 0.7.0](./docs/playable-0.7.0-audit.md)
- [cobertura do mapa](./docs/map-coverage-brasilia-0.7.0.md)
- [comparação 0.6 → 0.7](./docs/map-before-after-0.7.0.md)
- [malha viária](./docs/road-network-audit-0.7.0.md)
- [simulação de trânsito](./docs/traffic-simulation-0.7.0.md)
- [desempenho e streaming](./docs/performance-map-0.7.0.md)
- [arquitetura](./docs/ARCHITECTURE.md)
- [pontos de táxi reais](./docs/real-taxi-points-brasilia.md)

## Limitações conhecidas

- a frota distante continua agregada por lotes; só a região acompanhada usa física visual detalhada;
- o processo de licença e os valores do taxímetro são regras de gameplay;
- colisões usam física arcade, sem deformação visual complexa;
- autenticação por e-mail depende do Supabase opcional;
- o backend público precisa receber a migration `202607170004_playable_082_regions.sql` antes de aceitar o mapa 0.8.2 no modo online;
- a câmera inclinada é uma projeção 2.5D estilizada.
