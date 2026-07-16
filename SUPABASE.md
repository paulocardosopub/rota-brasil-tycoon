# Configuração e teste do Supabase

## Aplicar a migration

Com a CLI autenticada e o projeto associado:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Também é possível colar o conteúdo de `supabase/migrations/202607160001_initial_schema.sql` no SQL Editor. A migration cria `profiles`, `game_saves`, `player_statistics` e `economy_transactions`, índices, trigger do perfil e políticas RLS.

## Variáveis públicas permitidas

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

A chave anônima pode ficar no frontend porque a autorização real é feita por RLS. Não use senha do banco nem `service_role`.

## Testar RLS

1. Crie dois usuários pelo fluxo de autenticação.
2. Entre como o usuário A e confirme que ele cria/atualiza apenas `game_saves.user_id = auth.uid()`.
3. No SQL Editor, execute consultas dentro de uma sessão autenticada ou use o cliente com o token do usuário A.
4. Tente ler ou atualizar o UUID do usuário B: o `select` deve retornar zero linhas e a escrita deve falhar.
5. Repita para as quatro tabelas.

## Conflitos e modo offline

O save contém `saveVersion`, `revision` e `updatedAt`. Ao entrar, vence primeiro a maior revisão; em empate, vence a data mais recente. Sem variáveis, sem sessão ou sem rede, o save local continua funcionando e a sincronização é simplesmente adiada.
