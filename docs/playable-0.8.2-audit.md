# Auditoria — PLAYABLE 0.8.2

Data local: 17 de julho de 2026.

## Estado inicial preservado

- base auditada: `v0.8.1`, commit público `a42474a`;
- cadastro, login, conversão de visitante, recuperação de senha, save local/nuvem e conflito foram preservados, sem reimplementar autenticação;
- modo visitante, solo e fallback offline continuam independentes de conexão;
- táxi e taxímetro permanecem independentes do piloto automático;
- frota, segundo veículo, funcionário, renda offline, trânsito, chunks e migrações anteriores foram mantidos;
- nenhuma operação de reset destrutivo foi executada.

## Auditoria funcional

| Área | Resultado local |
|---|---|
| Save antigo | Migração idempotente para v7, sem apagar patrimônio |
| Visitante | Fluxo preservado e conversão continua no mesmo save |
| Conta e senha | Cadastro/login/recuperação presentes e tipados |
| Conflito de nuvem | Detecta edições concorrentes por linhagem e revisão; não confunde avanço unilateral com conflito |
| Solo/offline | Jogo inicia e salva sem Supabase |
| Online | Presence inclui `regionId`; movimento permanece por canais de chunk |
| Piloto | Rotas regionais e de serviço usam o mesmo grafo dirigido |
| Controle manual em serviço | Desvio persistente recalcula automaticamente após 2,5 s |
| Funcionários | Preferências regionais, distância, retorno, combustível, condição e serviços persistidos |
| Economia | Jogador médio +16,3%; média dos cenários regionais +18,24% |
| Mapa | 32.674 vias, 60.598 faixas, 298.000 nós e 780 chunks |
| Serviços | 7 postos, 5 oficinas e 4 garagens |
| Desempenho | 31–32 FPS medianos desktop; 56–57 FPS mobile em duas repetições finais |
| E2E | 22/22 cenários aprovados em Chromium, incluindo dois jogadores e recarregamento |

## Save e segurança

O save v7 acrescenta região preferida, região atual, familiaridade, histórico regional, serviços favoritos, base regional, preferência regional por funcionário, linhagem da nuvem e última revisão sincronizada. A migração é idempotente e mantém dinheiro, veículos, táxi, funcionários, posição, corrida, piloto, configurações e identidade pública.

O cliente não registra senha, e-mail, JWT ou `service_role` no save. O movimento online não é gravado por frame no Postgres. As funções públicas continuam protegidas por sessão autenticada/RLS e o frontend recebe somente URL e chave publicável.

## Limites da validação local

Os testes automatizados validam migração, conflito, visitante, economia, online simulado, tráfego, mapa e navegação. O teste real de dois dispositivos com uma conta privada exige credenciais do usuário e um backend Supabase publicado; nenhuma credencial foi lida, registrada ou exposta nesta auditoria. A aplicação continua funcional em Solo temporário se o backend estiver indisponível.

## Publicação

A publicação da 0.8.2 foi autorizada somente depois da bateria final. A release 0.8.1 permanece preservada; a 0.8.2 usa branch, PR, tag e release próprios, sem sobrescrever artefatos históricos.

## Validação final automatizada

- typecheck, lint e 125 testes unitários;
- mapa: 32.674 vias, 60.598 faixas, 298.000 nós, 780 chunks e 549,7 km²;
- navegação: 112 rotas dirigidas, nenhuma falha;
- trânsito: 20/40/72/100 veículos, sem deadlock permanente, colisão simulada, contramão ou loop;
- economia regional: média +18,24%, com o progresso normal médio em +16,3%;
- online simulado e dois clientes no navegador;
- build PWA e 22/22 cenários E2E;
- benchmark final repetido acima de 30 FPS medianos no desktop e acima de 50 FPS no mobile.
