# Segurança online — 0.8.0

## Modelo de confiança

O frontend nunca recebe `service_role`/secret key. Aceita `VITE_SUPABASE_PUBLISHABLE_KEY` e mantém compatibilidade temporária com `VITE_SUPABASE_ANON_KEY`. A autorização real está em RLS, RPCs atômicas e Edge Functions autenticadas.

Anonymous Auth cria um usuário real no papel `authenticated`; a distinção usa o claim `is_anonymous`. Isso segue a [documentação oficial de Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous). O limite oficial atual é 30 criações anônimas por IP/hora, e CAPTCHA/Turnstile deve ser habilitado no projeto público; desenvolvimento local não o exige. A limpeza mensal proposta remove anônimos inativos há mais de 30 dias somente por cron administrativo.

## Identidade

Broadcast/Presence expõem `publicPlayerId`, nome normalizado, avatar catalogado, frota pública, veículo, chunk e status. E-mail, UUID de `auth.users`, JWT, IP e save não são publicados. Nome tem 3–20 caracteres, NFKC, remoção de invisíveis/HTML, unicidade case-insensitive e cooldown de 24 h no servidor.

Emblemas, cores e modelos vêm de enumerações próprias. Não existe upload arbitrário de SVG/HTML nem asset por URL.

## Canais privados

Todos os canais têm `private: true`. As policies em `realtime.messages` autorizam `broadcast`/`presence` somente se houver sessão online não expirada e se o tópico for a presença da cidade ou um chunk em `authorized_chunks`. O cliente chama `realtime.setAuth()` antes de assinar. O desenho segue a [autorização oficial de Realtime](https://supabase.com/docs/guides/realtime/authorization).

## Lease e autoridade

`claim_vehicle_control` bloqueia a linha do lease e verifica o veículo dentro do save pertencente a `auth.uid()`. Um lease ativo de outra sessão não pode ser sobrescrito. Heartbeat renova por 45 s; release e expiração liberam controle. Funcionário e jogador não podem controlar o mesmo veículo em paralelo.

Economia permanece no ledger do dono/servidor. Snapshot, colisão ou deployment observado jamais creditam receita. Incidentes remotos retornam explicitamente `economicDamageApplied: false`.

## Edge Functions

As sete funções exigem JWT, corpo POST, protocolo v1 e payload até 8 KiB. O cliente RLS-scoped chama RPCs de banco; não existe loop físico nem função mantida aberta. Erros retornam códigos tipados como `AUTH_REQUIRED`, `RATE_LIMITED`, `VERSION_MISMATCH`, `SESSION_INVALID` e `VEHICLE_NOT_OWNED`.

## RLS coberta

- perfil/sessão/lease/localização/preferência: somente o proprietário;
- deployment: escrita somente via RPC validada; leitura interna do proprietário e futura projeção pública segura;
- incidente: somente relator; validação econômica separada;
- bloqueio: apenas bloqueador, sem revelar ao bloqueado;
- mundo: leitura autenticada;
- tabelas de rate limit: sem acesso direto do frontend.

Antes de produção, executar policies contra dois usuários e desabilitar “Allow public access” nas configurações de Realtime, como exige a documentação do Supabase.
