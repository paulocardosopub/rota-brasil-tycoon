# Cobertura de serviços — PLAYABLE 0.8.2

Todos os pontos usam objetos OpenStreetMap existentes. Um estabelecimento real mantém o nome/função do OSM; uma adaptação usa footprint e acesso reais, mas declara explicitamente que o nome e a função de gameplay são fictícios.

## Postos

| Região | Serviço | Fonte | Função |
|---|---|---|---|
| Centro | Posto Eixo Norte | [OSM node 1412091593](https://www.openstreetmap.org/node/1412091593) | real |
| Centro | Posto Eixo Sul | [OSM node 1685869086](https://www.openstreetmap.org/node/1685869086) | real |
| Lago Sul | Estação 23 | [OSM way 192364030](https://www.openstreetmap.org/way/192364030) | real |
| Lago Sul | Posto Melhor QI 28 | [OSM node 10605334623](https://www.openstreetmap.org/node/10605334623) | real |
| Lago Sul | Ipiranga Lago Sul | [OSM way 240526953](https://www.openstreetmap.org/way/240526953) | real |
| Jardim Botânico | Posto Melhor | [OSM node 7934854620](https://www.openstreetmap.org/node/7934854620) | real |
| Lago Norte | Posto QI 6 | [OSM node 1724366216](https://www.openstreetmap.org/node/1724366216) | real |

## Oficinas

| Região | Serviço | Fonte | Função |
|---|---|---|---|
| Centro | Oficina Central do Eixo | [OSM way 1528290104](https://www.openstreetmap.org/way/1528290104) | adaptação fictícia declarada |
| Lago Sul | Oficina Regional do Lago | [OSM way 529092067](https://www.openstreetmap.org/way/529092067) | adaptação fictícia declarada |
| Jardim Botânico | Oficina Botânica | [OSM way 292744187](https://www.openstreetmap.org/way/292744187) | adaptação fictícia declarada |
| Asa Norte | Polar | [OSM node 5473432024](https://www.openstreetmap.org/node/5473432024) | real (`shop=car_repair`) |
| Lago Norte | Setor de oficinas | [OSM node 6992963002](https://www.openstreetmap.org/node/6992963002) | real (`shop=car_repair`) |

## Garagens e bases

| Região | Serviço | Fonte | Função |
|---|---|---|---|
| Centro | Garagem do Hatch | [OSM way 1528581506](https://www.openstreetmap.org/way/1528581506) | adaptação fictícia declarada |
| Lago Sul | Base Regional Lago Sul | [OSM way 96165939](https://www.openstreetmap.org/way/96165939) | adaptação fictícia declarada |
| Jardim Botânico | Base Regional Jardim Botânico | [OSM way 422725959](https://www.openstreetmap.org/way/422725959) | adaptação fictícia declarada |
| Lago Norte | Base Regional Lago Norte | [OSM way 1214668095](https://www.openstreetmap.org/way/1214668095) | adaptação fictícia declarada |

## Acesso e operação

- cada serviço possui entrada ancorada a uma via OSM dirigível e ponto de parada dentro do lote/recuo;
- pontos adaptados param no recuo externo, antes do footprint, evitando atravessar o prédio;
- o piloto calcula a rota até a entrada, entra no lote, para e aguarda confirmação; não compra automaticamente;
- ao assumir o controle manual e se afastar mais de 28 m, a rota do serviço é recalculada automaticamente após 2,5 s;
- o painel Cidade filtra todos, postos, oficinas ou garagens e identifica adaptações fictícias;
- a validação rejeita fonte ausente, região inexistente, adaptação sem declaração ou parada a mais de 80 m da entrada.

## Cobertura

Lago Sul e Jardim Botânico possuem pelo menos um posto, uma oficina e uma garagem/base, todos com entrada no grafo. Lago Norte recebe as três categorias como alternativa às regiões centrais. As regiões centrais preservam os serviços anteriores.

Distância dirigida a partir do centro operacional de cada geofence até o serviço acessível mais próximo:

| Região | Posto | Oficina | Garagem/base |
|---|---:|---:|---:|
| Aeroporto | 11,9 km | 14,7 km | 13,3 km |
| Jardim Botânico | 5,6 km | 4,4 km | 1,7 km |
| Lago Norte | 1,5 km | 9,7 km | 13,2 km |
| Lago Sul | 7,0 km | 8,1 km | 7,6 km |
| Sudoeste | 5,3 km | 5,9 km | 5,2 km |
| Cruzeiro | 6,8 km | 7,4 km | 6,7 km |
| Vila Planalto | 4,8 km | 4,8 km | 5,7 km |
| Noroeste | 7,7 km | 6,4 km | 8,1 km |
| Asa Norte | 3,7 km | 3,0 km | 4,4 km |
| UnB | 5,5 km | 13,7 km | 17,2 km |
| Asa Sul | 4,8 km | 5,5 km | 4,7 km |
| Centro | 2,1 km | 2,1 km | 2,2 km |

As distâncias são calculadas no grafo dirigido, não em linha reta. Aeroporto e UnB continuam com atendimento mais distante; são áreas de acompanhamento para uma expansão posterior, mas possuem rota válida e alternativas sem risco de aprisionar o veículo.

Fonte geral: © OpenStreetMap contributors, ODbL 1.0. Os dados são empacotados localmente; nenhuma consulta ao OSM ocorre durante a partida.
