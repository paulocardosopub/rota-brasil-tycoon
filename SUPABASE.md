# Configuração e teste do Supabase

## Aplicar a migration

Com a CLI autenticada e o projeto associado:

```bash
supabase link --project-ref ahryycnozuyolmrbbslo
supabase db push
```

Também é possível aplicar, em ordem, os arquivos de `supabase/migrations/` no SQL Editor. A migration inicial cria saves e estatísticas; `202607170001_online_alpha_080.sql` acrescenta mundos, perfis públicos, sessões, concessões, localizações, frotas, turnos, incidentes, bloqueios e limites, todos protegidos por RLS. A migration `202607170004_playable_082_regions.sql` autoriza exclusivamente o mapa `brasilia-0.8.2`, preserva o protocolo 1 e mantém a função de entrada restrita a usuários autenticados.

Sem essa última migration, o backend recusa corretamente o cliente 0.8.2 com `VERSION_MISMATCH`; o jogo continua em Solo temporário. A migration está preparada no repositório, mas não deve ser aplicada nem publicada sem uma sessão autenticada da CLI ou ação explícita do responsável pelo ambiente.

Depois da migration, publique as funções autenticadas:

```bash
supabase functions deploy join-online-world
supabase functions deploy claim-vehicle-control
supabase functions deploy release-vehicle-control
supabase functions deploy online-heartbeat
supabase functions deploy report-online-incident
supabase functions deploy report-player-location
supabase functions deploy create-fleet-deployment
supabase functions deploy finish-fleet-deployment
```

Em **Realtime Settings**, use canais privados e mantenha a autorização por RLS. O cliente assina apenas `city:brasilia:presence` e os canais `city:brasilia:chunk:<id>:movement|events` do chunk atual e adjacentes.

## Variáveis públicas permitidas

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

A chave publicável ou anônima pode ficar no frontend porque a autorização real é feita por Auth, RLS e funções. Não use senha do banco, segredo JWT nem `service_role`.

## Testar RLS

1. Crie dois usuários pelo fluxo de autenticação.
2. Entre como o usuário A e confirme que ele cria/atualiza apenas `game_saves.user_id = auth.uid()`.
3. No SQL Editor, execute consultas dentro de uma sessão autenticada ou use o cliente com o token do usuário A.
4. Tente ler ou atualizar o UUID do usuário B: o `select` deve retornar zero linhas e a escrita deve falhar.
5. Confirme também que um usuário não altera concessões, sessões ou turnos de outro e não assina um tópico privado fora do mundo autorizado.

## Visitantes e proteção contra abuso

Ative Anonymous Sign-Ins em **Authentication**. Visitantes recebem uma sessão `authenticated`, marcada pelo claim `is_anonymous`; podem depois vincular o mesmo usuário por e-mail. Para ambiente público, configure CAPTCHA/Turnstile, restrinja origens e acompanhe os limites de Auth, Realtime e Edge Functions.

## Conflitos e modo offline

O save contém `saveVersion`, `revision` e `updatedAt`. Conflitos entre local e nuvem são exibidos para escolha explícita; não há sobrescrita silenciosa. Sem variáveis, sem sessão ou sem rede, o save local continua funcionando, o HUD informa **Solo temporário** e a sincronização é adiada.
