# Rota Brasil Tycoon — Playable 0.6.2

Jogo 2.5D de transporte brasileiro para navegador. Você começa com o Hatch 1998 no centro de Brasília, dirige corridas informais, regulariza-se como taxista, converte o carro sem perder seu histórico e monta a primeira frota com motorista e segundo veículo.

## Jogar localmente

Requer Node.js 24 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço exibido e escolha **Jogar como visitante**. Use `WASD` ou as setas para dirigir livremente, `Espaço` para o freio de mão, `H` para buzinar, segure `R` para reposicionar e use a roda do mouse para zoom. O botão **Piloto automático** segue o GPS, respeita ruas/sinais/trânsito e completa corridas. No celular, volante e pedais somem enquanto ele está ligado.

Os indicadores de combustível e condição são botões: quando clicados, escolhem o posto ou a oficina mais próxima, traçam o GPS e ligam o piloto. Nenhum serviço é comprado sem confirmação.

## O que está nesta versão

- mapa vetorial de aproximadamente 2 × 2 km do centro de Brasília, com escala física de 1 unidade = 1 metro;
- direção manual livre, piloto opcional, ré, freio, combustível, condição, colisões graduais e acostamento/calçada como redução de velocidade, não barreira invisível;
- missões informais com preço garantido e corridas oficiais de táxi por ponto, chamada de rua ou central;
- regularização simplificada, conversão preservando o Hatch e taxímetro compacto por distância/tempo reais após o embarque;
- três pontos de táxi `amenity=taxi` reais do OpenStreetMap, com entrada roteável;
- contratação de Bia, Léo ou Nara, limite inicial de um funcionário e dois veículos, Sedan 2012 e atribuição exclusiva;
- turnos físicos perto do jogador, simplificados à média distância e econômicos longe/offline, com limite de oito horas e perda de eficiência;
- funcionários identificados como **Motorista + nome**, com destinos estáveis e rotas distribuídas pela cidade sem movimento circular;
- relatório de frota com receitas, combustível, comissão, manutenção, multas, ocorrências e lucro;
- ledger auditável com contexto de proprietário, frota, veículo, motorista e viagem;
- 72 NPCs terrestres por padrão (54 carros/táxis, 9 ônibus e 9 utilitários), 10 sombras aéreas e teto técnico 350;
- trânsito pela direita, mãos corretas, semáforos, prevenção de colisões e convergência progressiva nas vias que estreitam;
- HUD responsivo com **Dirigir, Corridas, Garagem, Minha Frota, Caixa e Cidade**;
- save local v4, migração/backup e Supabase opcional com tabelas normalizadas, RLS e compra atômica/idempotente;
- PWA instalável e publicação automática no GitHub Pages.

## Verificações

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run map:validate
npm run economy:simulate
npm run performance:benchmark
npm run build
```

O painel de desenvolvimento só aparece em `npm run dev` e abre com `Ctrl + Shift + D`. Ele permite testar regularização, conversão, taxímetro, contratação, compra, atribuição, turnos, retorno offline, manutenção, combustível, colisões e trânsito.

## Dados de Brasília

O recorte processado está em `public/data/cities/brasilia/central/`. Todos os arquivos usados na partida são locais; nenhuma consulta ao OpenStreetMap/Overpass ocorre durante o jogo.

Fonte: OpenStreetMap contributors, ODbL 1.0. Caixa geográfica, data de importação, licença e atribuição estão em `metadata.json`, e o HUD mostra a atribuição permanentemente. Para reproduzir a importação e validar o grafo:

```bash
npm run map:import
npm run map:validate
```

O importador preserva curvas, mão única, faixas e larguras disponíveis, aplica padrões quando faltam dados e gera arestas dirigidas/chunks de 400 m. Oficina e garagem adaptadas são identificadas como ficcionais; os três pontos de táxi não são adaptações.

## Supabase opcional

O jogo funciona integralmente sem backend. Para habilitar login/sincronização:

1. Crie um projeto no Supabase.
2. Aplique, na ordem, `supabase/migrations/202607160001_initial_schema.sql` e `supabase/migrations/202607160002_playable_060_fleet.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Reinicie o jogo.

Nunca use `service_role` no frontend. As tabelas expostas têm RLS limitada ao jogador autenticado. Consulte [SUPABASE.md](./SUPABASE.md).

## GitHub Pages

O workflow `.github/workflows/web.yml` testa, compila e publica `main`. Em **Settings → Pages**, a origem deve ser **GitHub Actions**. O caminho base é calculado automaticamente pelo nome do repositório.

## Arquitetura e auditoria

Phaser cuida da cidade e simulação; React, do HUD. Comandos/snapshots tipados ligam ambos. Economia, taxímetro, frota, missões, trânsito, física, rotas, persistência e backend são módulos separados.

- [arquitetura](./docs/ARCHITECTURE.md)
- [hotfix 0.6.2 — recuperação de órbita da frota](./docs/playable-0.6.2-audit.md)
- [ajuste 0.6.1 — rotas dos funcionários](./docs/playable-0.6.1-audit.md)
- [auditoria 0.6.0](./docs/playable-0.6.0-audit.md)
- [pontos de táxi reais](./docs/real-taxi-points-brasilia.md)
- [simulação econômica](./docs/economy-simulation-0.6.0.md)
- [benchmark de desempenho](./docs/performance-0.6.0.md)

## Limitações conhecidas

- a frota distante é agregada por lotes; só veículos próximos recebem corpo físico detalhado;
- o processo de licença e os valores do taxímetro são claramente rotulados como regras de gameplay;
- colisões usam física arcade, sem deformação visual complexa;
- autenticação por e-mail depende do provedor habilitado no projeto Supabase;
- a câmera inclinada é uma projeção 2.5D estilizada, não renderização 3D.
