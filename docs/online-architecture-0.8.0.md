# Arquitetura online — 0.8.0

## Limite entre jogo e rede

A simulação local continua sendo a autoridade de direção, missão e economia do proprietário. `OnlineWorldClient` publica somente snapshots visuais compactos; `RemoteVehicleSystem` interpola veículos recebidos sem pathfinding ou IA. O jogo abre primeiro o mapa, o save e os sistemas locais. Falha de autenticação, Edge Function ou Realtime muda o indicador para `SOLO_TEMPORARY` e não interrompe o controle.

O mundo inicial é `city:brasilia:public:1`, protocolo 1 e mapa `brasilia-0.7.0`. A versão do jogo é 0.8.0 e o save é v6; a malha de 157 km² permanece idêntica à 0.7.1.

## Fluxo

1. `Jogar como visitante` tenta recuperar a sessão persistida ou chama `signInAnonymously()`.
2. `join-online-world` valida versão, nome, mundo, chunks e cria uma sessão pública temporária.
3. `claim-vehicle-control` adquire lease atômico do veículo. Outra aba fica espectadora.
4. O cliente entra em `city:brasilia:presence` e somente nos canais `movement`/`events` do chunk atual e adjacentes.
5. Movimento usa Broadcast privado em tupla de 23 campos. Presence carrega apenas identidade pública e estado resumido.
6. Ao trocar de chunk, o heartbeat autoriza a nova janela, os canais novos entram primeiro e os antigos permanecem por 2,5 s.
7. A cada 15 s, `online-heartbeat` renova sessão e lease. Perda de conexão mantém a direção e usa backoff exponencial.

## Protocolo de movimento

Cada snapshot possui versão, sessão pública, jogador/veículo públicos, sequência, relógios, versão do mapa, chunk, coordenadas locais, layer, heading, velocidade, aceleração resumida, estado, piloto, seta, freio, controlador, modelo e cor catalogada. Dinheiro, rota, save, ledger, e-mail, UUID interno, JWT e URL de asset não entram no pacote.

A taxa varia entre 1–2 Hz parado, 5 Hz lento, 8–12 Hz normal e até 15 Hz em movimento rápido/curvas. Eventos importantes ignoram a espera. O receptor rejeita sequência antiga, duplicata, layer impossível, velocidade/aceleração física inválida e teleporte incompatível.

## Interpolação e interesse

O buffer visual usa atraso alvo de 120 ms, interpolação linear de posição, menor arco angular e até 400 ms de extrapolação. Depois disso reduz a velocidade e congela; o objeto é removido após 8 s sem snapshot.

- próximo, até 180 m: modelo/tag completos e corpo cinemático;
- médio, até 520 m: modelo reduzido, tag opcional e prioridade simplificada;
- distante, até 1.200 m: LOD leve, sem física completa;
- fora: não renderiza nem processa movimento.

Veículos online reservam vagas do orçamento de tráfego. NPCs e funcionários recebem os remotos próximos como veículos prioritários para frenagem/evitação. Colisão remota só reduz movimento local e gera incidente; nunca altera dinheiro ou cobra reparo sem validação futura.

## Persistência

Postgres guarda perfil público, sessão, lease, último checkpoint espaçado, preferência, bloqueio, incidente e deployment público de frota. Nenhum frame é persistido e Postgres Changes não é usado como protocolo de movimento. Deployments offline validam veículo/motorista contra o save do dono e usam seed determinística; clientes observadores não calculam receita.

## Arquivos principais

- `src/online/OnlineWorldClient.ts`: sessão, canais, Presence, Broadcast e reconexão;
- `src/online/protocol.ts`: wire format e validação;
- `src/online/interpolation.ts`: buffer remoto;
- `src/online/RemoteVehicleSystem.ts`: render, LOD, colisão e integração com tráfego;
- `supabase/migrations/202607170001_online_alpha_080.sql`: schema, RPCs e RLS;
- `supabase/functions/*`: fronteiras HTTP pequenas e autenticadas.
