# Cobertura de Brasília — 0.7.0

## Área publicada

- bounding box: `-15.84,-47.95` até `-15.73,-47.83`;
- área aproximada: **157,0 km²**;
- origem métrica: `-15.7942,-47.8822`;
- 279 chunks de 800 m;
- janela ativa de até nove chunks e cache de até 14 chunks;
- 19.756 vias, 36.539 faixas detalhadas, 17.070 edifícios em LOD, 269 semáforos e 498 pontos de ônibus.

## Regiões nomeadas

1. Asa Norte
2. Asa Sul
3. Setores Centrais
4. Sudoeste
5. Cruzeiro
6. Noroeste
7. Vila Planalto
8. Universidade de Brasília

As regiões são derivadas de centros e limites declarados no manifesto. O save registra região e chunk atuais, e o painel Cidade expõe a região ao jogador.

## Pipeline reproduzível

O importador divide a caixa geográfica em tiles, usa a API oficial do OpenStreetMap, guarda a fonte bruta compactada, normaliza tags, aplica overrides controlados e gera vias canônicas, faixas, conectores, sinais, LOD e grafo global. A partida usa somente arquivos locais.

## Licença

Fonte: OpenStreetMap contributors, Open Database License 1.0. Atribuição permanente no HUD e metadados em `public/data/cities/brasilia/metadata.json`.
