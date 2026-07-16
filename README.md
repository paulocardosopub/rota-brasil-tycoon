# Rota Brasil Tycoon — Playable 0.3.0

Protótipo realmente jogável no navegador de um tycoon de transporte brasileiro. Você começa com o **Hatch 1998**, busca um passageiro no centro de Brasília, segue uma rota calculada sobre vias reais e recebe pela corrida.

## Jogar localmente

Requer Node.js 24 ou mais recente.

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal e escolha **Jogar como visitante**. Use `WASD` ou as setas para dirigir livremente, `Espaço` para o freio de mão, `R` para reposicionar e a roda do mouse para zoom. O botão flutuante **Piloto automático** assume a rota e completa as corridas. Em telas de toque, volante e pedais somem enquanto o piloto está ligado.

Para testar a build final:

```bash
npm run build
npm run preview
```

## Verificações

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run map:validate
```

O teste de navegador abre o jogo, entra como visitante, aguarda o mapa, confirma o carro/HUD e abre a oferta de corrida. O painel de desenvolvimento existe apenas em `npm run dev` e abre com `Ctrl + Shift + D`.

## O que está nesta versão

- mapa 2.5D vetorial com escala interna de 1 unidade = 1 metro;
- recorte de aproximadamente 2 × 2 km da Rodoviária do Plano Piloto e Eixo Monumental;
- física arcade, direção manual totalmente livre, ré, freio, combustível, condição e redução de velocidade fora do asfalto sem barreiras invisíveis;
- piloto automático opcional que mantém o ritmo, segue a rota, para em semáforos e trânsito, embarca, entrega e aceita a próxima corrida recomendada;
- missão completa com embarque, rota dirigida estável, recálculo somente ao sair do trajeto, desembarque, recibo, dinheiro, XP e avaliação;
- 35 veículos de trânsito entre carros, táxis, ônibus e utilitários, com prevenção de colisões, pausa após impacto, distância de segurança e respeito aos semáforos;
- faixas separadas por sentido, tráfego pela direita, mãos únicas e rotas sem vias de pedestres;
- semáforos com fases opostas, infração e pequena penalidade;
- pontos de ônibus, abrigos e grupos de NPCs animados;
- HUD e controles responsivos para desktop, celular vertical e horizontal;
- save local versionado, recuperação de dado inválido e Supabase opcional;
- PWA instalável e publicação automática pelo GitHub Pages.

## Dados de Brasília

O recorte processado está em `public/data/cities/brasilia/central/`. Os arquivos carregados pelo jogo são locais; **nenhuma consulta ao OpenStreetMap ou Overpass ocorre durante a partida**.

Fonte: OpenStreetMap, baixado pela API 0.6, sob ODbL 1.0. A origem, caixa geográfica, data da importação, licença e atribuição estão em `metadata.json`. O jogo mostra “© OpenStreetMap contributors” no mapa.

Para reproduzir a importação e o grafo:

```bash
npm run map:import
npm run map:validate
```

O importador converte latitude/longitude em metros, preserva nós, curvas, mão única, faixas e larguras disponíveis, aplica padrões por classe de via, gera arestas dirigidas e divide o conteúdo em chunks de 400 m. A importação baixa novamente os dados atuais e, portanto, pode produzir pequenas diferenças futuras.

## Supabase opcional

O jogo funciona integralmente sem backend. Para habilitar login e sincronização:

1. Crie um projeto no Supabase.
2. Aplique `supabase/migrations/202607160001_initial_schema.sql` pelo SQL Editor ou com `supabase db push`.
3. Copie `.env.example` para `.env.local`.
4. Preencha somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Reinicie `npm run dev`.

Nunca use `service_role` no frontend. Todas as tabelas expostas têm RLS e políticas limitadas ao `auth.uid()` do jogador. Consulte [SUPABASE.md](./SUPABASE.md) para testar as políticas e a resolução de conflito.

## GitHub Pages

O workflow `.github/workflows/web.yml` testa, compila e publica a branch `main`. Em **Settings → Pages**, escolha **GitHub Actions** como origem. O `base` do Vite é calculado pelo nome do repositório durante a Action.

Se ainda não houver remote:

```bash
git init
git add .
git commit -m "feat: create playable 0.3.0"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/rota-brasil-tycoon.git
git push -u origin main
```

## Arquitetura

Phaser cuida da cidade, direção e simulação. React cuida apenas do HUD e das telas externas. Eventos tipados fazem a ponte entre ambos. Cálculo econômico, missões, tráfego, física, rotas, persistência e Supabase ficam em módulos separados. Veja [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Limitações conhecidas

- o trânsito usa uma simulação local por faixas e reduz a atualização de veículos muito distantes;
- colisões são focadas na superfície viária e veículos, sem dano visual complexo;
- locais das corridas usam nós reais do grafo e rótulos de referência provisórios;
- autenticação por e-mail pressupõe que o provedor esteja habilitado no projeto Supabase;
- a câmera inclinada é uma projeção 2.5D estilizada, não renderização 3D.

Próximo passo recomendado: adicionar posto de combustível e oficina jogáveis e persistir a missão em andamento.
