# Limitações conhecidas — Online Alpha 0.8.0

- Não existe servidor físico dedicado. Movimento remoto é validado por limites e tratado como corpo cinemático, mas o cliente local ainda é autoridade visual.
- Colisão online nunca gera reparo, multa ou transferência financeira nesta versão. Validação econômica por servidor fica para 0.8.5.
- Deployments de frota offline possuem schema, criação/finalização validada e seed determinística; a distribuição visual completa de corredores entre todos os clientes ainda precisa de staging com dados reais.
- O mock de dois clientes valida o pipeline sem Supabase. Latência, perda e reconexão do serviço hospedado só podem ser medidas após configurar/deployar um projeto de staging.
- A chave/public URL do Supabase não existe no repositório nem nas variáveis do GitHub auditadas. Assim, Pages entra em `SOLO_TEMPORARY` até o operador configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, aplicar migrations e publicar Functions.
- CAPTCHA/Turnstile é configuração do projeto e não foi forçado localmente. Produção deve habilitá-lo antes de abrir criação anônima ampla.
- Bloqueio oculta tags/sons na base de dados, mas não remove o corpo físico para evitar colisões invisíveis. Chat não existe.
- O pacote principal ainda é grande (Phaser + jogo); code splitting não é requisito desta alpha, mas é recomendável para 0.8.5.
- O custo de mensagens cresce com o número de destinatários do chunk. Um mundo de 1.000 jogadores exige shards/mundos adicionais, densidade menor e orçamento contratado.
- Compatibilidade visual mobile é mantida, porém testes reais em aparelhos físicos e redes celulares continuam necessários antes de chamar o online de beta.

## Recomendação para 0.8.5

Adicionar autoridade leve de movimento/incidentes em servidor, projeção segura e consulta regional dos deployments offline, sharding de mundos, teste de staging com telemetria real de p95, Turnstile de produção e ferramentas de moderação de nomes/denúncias.
