# Cobertura regional — PLAYABLE 0.8.2

## Catálogo e geofences

As regiões usam IDs estáveis, polígono/geofence, vizinhas, cor, demanda, tipo predominante, serviços e fonte aberta. Lago Sul, Lago Norte e Jardim Botânico usam relações administrativas OSM simplificadas; subdivisões do Plano Piloto usam geofences operacionais ancoradas em objetos OSM. O Aeroporto tem prioridade de enclave e não é classificado como Lago Sul enquanto o veículo estiver dentro de sua geofence.

| `regionId` | Área da geofence | Chunks | Vias | Faixas | Candidatos no grafo | Serviços P/O/G | Situação |
|---|---:|---:|---:|---:|---:|---|---|
| aeroporto | 14,7 km² | 18 | 611 | 1.076 | 5.504 | 0/0/0 | jogável, serviços regionais externos |
| jardim-botanico | 37,8 km² | 124 | 3.174 | 5.794 | 21.516 | 1/1/1 | prioridade habilitada |
| lago-norte | 64,2 km² | 274 | 5.939 | 11.320 | 28.678 | 1/1/1 | habilitada |
| lago-sul | 183,3 km² | 198 | 7.596 | 13.998 | 33.876 | 3/1/1 | prioridade habilitada |
| sudoeste | 6,1 km² | 12 | 1.872 | 3.397 | 14.233 | 0/0/0 | habilitada |
| cruzeiro | 2,8 km² | 13 | 984 | 1.909 | 6.685 | 0/0/0 | habilitada |
| vila-planalto | 1,2 km² | 2 | 214 | 429 | 1.792 | 0/0/0 | habilitada |
| noroeste | 11,3 km² | 29 | 1.058 | 1.951 | 9.633 | 0/0/0 | habilitada |
| asa-norte | 31,6 km² | 44 | 4.490 | 8.174 | 37.438 | 0/1/0 | habilitada |
| unb | 20,0 km² | 12 | 185 | 362 | 7.007 | 0/0/0 | habilitada |
| asa-sul | 22,6 km² | 33 | 4.168 | 7.640 | 32.508 | 0/0/0 | habilitada |
| centro | 13,9 km² | 21 | 3.352 | 6.485 | 26.451 | 2/1/1 | habilitada |

P/O/G significa postos/oficinas/garagens localizados dentro da região. Serviços de regiões vizinhas continuam disponíveis por rota válida.

## Malha e conectividade

- bounding box publicada: 549,7 km²;
- 32.674 vias canônicas, 60.598 faixas detalhadas e 298.000 nós globais;
- 780 chunks de 800 m, carregados somente na janela local;
- núcleo viário contínuo: 293.213 nós (98,4% do grafo);
- 53 componentes restantes correspondem principalmente a estacionamentos, acessos privados ou trechos realmente isolados;
- cabeceiras reais de pontes/túneis aceitam a mudança de `layer`; cruzamentos intermediários em níveis diferentes continuam sem conexão;
- Lago Sul, Jardim Botânico e Lago Norte possuem rota dirigida desde o Plano Piloto.

## Embarques e destinos

O gerador tenta até 36 candidatos dentro da distribuição regional e confirma cada par com rota dirigida real. Somente depois usa o conjunto global como fallback, evitando deixar o jogador sem oferta. Não usa distância em linha reta como preço principal.

Distribuição configurável:

- 70% na região preferida;
- 20% nas regiões vizinhas;
- 10% em viagem longa;
- `Qualquer região` distribui pelas regiões jogáveis;
- embarque ou destino sem rota é descartado antes de virar oferta.

As ofertas mostram região de embarque/destino, deslocamento até embarque, distância dirigida, tempo, tarifa, demanda, familiaridade e combustível recomendado.

## Região preferida e familiaridade

O jogador seleciona a região nas Configurações sem bloquear outras ofertas. Familiaridade registra corridas, quilômetros, embarques, destinos, corredores, tempo e avaliação. Há apenas três classes: nova, conhecida e favorita. Os bônus de eficiência são moderados (2% e 4%).

Funcionários persistem região preferida, regiões permitidas, distância máxima, viagem longa, retorno à região/garagem, posto/oficina preferidos, combustível mínimo e condição mínima. A política é congelada durante o turno para impedir duplicação ou mudança incoerente de deployment.

## Fontes

- [Jardim Botânico — relation 3359472](https://www.openstreetmap.org/relation/3359472)
- [Lago Norte — relation 3359473](https://www.openstreetmap.org/relation/3359473)
- [Lago Sul — relation 3359474](https://www.openstreetmap.org/relation/3359474)
- [Aeroporto — way 534162966](https://www.openstreetmap.org/way/534162966)
- demais referências individuais ficam no catálogo regional e no manifesto.

Fonte geral: © OpenStreetMap contributors, ODbL 1.0.
