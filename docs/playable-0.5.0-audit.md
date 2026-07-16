# Auditoria de entrega — Playable 0.5.0

Data da validação: **16/07/2026**.

## Resultado

| Área | Resultado verificável |
|---|---|
| Trânsito | 350 NPCs simultâneos: 260 carros/táxis, 40 ônibus e 50 utilitários; faixas, sentido, semáforos, prevenção e recuperação de colisões preservados. |
| Ambiente | 7 sombras de aviões e 3 de helicópteros, sem colisão e sem interferência na direção. |
| Corridas | Oferta antes do aceite, três categorias, busca/viagem separadas, preço garantido, prazo, requisito, bônus, penalidades, avaliação e gorjeta. |
| Economia | Ledger idempotente como única escrita de dinheiro; combustível, gastos, dívida, reparos, melhorias e Caixa persistentes. |
| Veículo | Consumo próximo de 9 km/L, alertas, combustível emergencial, desgaste de manutenção e dano de colisão independentes. |
| Progressão | Nível, dez metas, histórico e indicador de prontidão para futura regularização. |
| Serviços | Dois postos OSM reais; oficina e garagem em edificações reais com função fictícia declarada; entrada e parada roteáveis. |
| Save | Versão 3, migração v1/v2, backup anterior à migração, preservação de conteúdo inválido e proteção contra pagamentos duplicados. |
| Desktop/mobile | WASD livre, piloto opcional, controles táteis escondidos durante o piloto e layout vertical validado. |

## Evidências automatizadas

- `npm run typecheck`: aprovado;
- `npm run test`: 52 testes unitários e de integração aprovados;
- `npm run map:validate`: 1.647 vias, 6.102 nós, 45 semáforos, 26 paradas, 529 prédios e 4 serviços validados;
- `npm run economy:simulate`: dez perfis econômicos aprovados, sem softlock do perfil ruim;
- `npm run build`: build de produção aprovada;
- `npm run test:e2e`: 17 cenários Chromium aprovados em desktop e mobile, incluindo partida completa, troca de aba, piloto, colisões, persistência, posto e oficina;
- inspeção no navegador: 350/350 NPCs e 10 sombras aéreas; aproximadamente 31 FPS no dispositivo de teste carregado.

## Rastreabilidade e limites

Os dados de serviço, a licença e os objetos de origem estão descritos em `real-poi-validation-brasilia.md`. A oficina e a garagem não alegam representar estabelecimentos reais: somente prédio, implantação e acesso são reais. A simulação econômica reproduzível e suas metas estão em `economy-simulation-0.5.0.md`.

O trânsito distante usa renderização em lote e atualização escalonada por desempenho. Isso não remove os veículos da simulação. Sombras aéreas são ambientação, não aeronaves físicas pilotáveis.
