# Validação de locais reais — Brasília 0.5.0

Validação realizada em **16/07/2026** sobre o recorte `-47.89155,-15.8032,-47.87285,-15.7852`, usando a API oficial do OpenStreetMap. Os dados são disponibilizados sob **ODbL 1.0** e o jogo exibe `© OpenStreetMap contributors`. Nenhuma imagem, marca ou dado do Google Maps foi copiado.

## Posto Eixo Norte

| Campo | Validação |
|---|---|
| Referência real | BR |
| Categoria | Posto de combustível |
| Coordenadas | `-15.7897976, -47.8859950` |
| Fonte | [OSM node 1412091593](https://www.openstreetmap.org/node/1412091593), `amenity=fuel` |
| Prédio/cobertura | [OSM way 41647726](https://www.openstreetmap.org/way/41647726), `building=roof`, fonte cadastral GDF `0120IV5D0031` |
| Endereço | Setor Hoteleiro Norte, Quadra 2, Brasília, DF |
| Entrada | `-15.7896545, -47.8860750`, nó do grafo `1531823830` |
| Acesso | [OSM way 658928044](https://www.openstreetmap.org/way/658928044), via de serviço |
| Lado | Oeste da via de serviço do SHN Quadra 2 |
| Parada | `-15.7897976, -47.8859950`, sob a cobertura real |
| Confiança | Alta |
| Adaptação | Nome fictício e visual genérico sem logotipo; função, lote, cobertura e acesso permanecem reais. |

## Posto Eixo Sul

| Campo | Validação |
|---|---|
| Referência real | Posto Imperial |
| Categoria | Posto de combustível |
| Coordenadas | `-15.7943667, -47.8888887` |
| Fonte | [OSM node 1685869086](https://www.openstreetmap.org/node/1685869086), `amenity=fuel` |
| Prédio | [OSM way 141913005](https://www.openstreetmap.org/way/141913005), fonte cadastral GDF `0137II2B0066` |
| Endereço | Setor Hoteleiro Sul, Quadra 3, Brasília, DF |
| Entrada | `-15.7939880, -47.8889396`, nó do grafo `984930863` |
| Acesso | [OSM way 124699928](https://www.openstreetmap.org/way/124699928), via de serviço |
| Lado | Sul da via interna do SHS Quadra 3 |
| Parada | `-15.7940400, -47.8888500`, no lote, ao norte das edificações |
| Confiança | Média: o estabelecimento e o conjunto cadastral são reais; o ponto operacional foi deslocado dentro do lote para não atravessar os prédios mapeados. |
| Adaptação | Nome fictício e visual genérico sem logotipo. |

## Oficina Central do Eixo

| Campo | Validação |
|---|---|
| Referência real | Edificação comercial GDF `0120IV5D0031` |
| Categoria | Oficina — **função fictícia declarada** |
| Coordenadas | `-15.7897100, -47.8862000` |
| Fonte/prédio | [OSM way 1528290104](https://www.openstreetmap.org/way/1528290104), `building=yes`, fonte GDF |
| Endereço | Setor Hoteleiro Norte, Quadra 2, Brasília, DF |
| Entrada | `-15.7896545, -47.8860750`, nó `1531823830` |
| Acesso | Via de serviço OSM `658928044` e acesso `139784386` |
| Lado | Oeste do acesso interno do SHN |
| Parada | `-15.7896250, -47.8861800`, área externa ao norte da edificação |
| Confiança | Média |
| Adaptação | A geometria e o acesso são reais. Apenas o uso como oficina e o visual são ficcionais porque não há oficina automotiva mapeada no recorte. |

## Garagem do Hatch

| Campo | Validação |
|---|---|
| Referência real | Edificação de apoio GDF `0137II2B0066` |
| Categoria | Garagem — **função fictícia declarada** |
| Coordenadas | `-15.7946400, -47.8887900` |
| Fonte/prédio | [OSM way 1528581506](https://www.openstreetmap.org/way/1528581506), `building=yes`, fonte GDF |
| Endereço | Setor Hoteleiro Sul, Quadra 3, Brasília, DF |
| Entrada | `-15.7946958, -47.8891575`, nó `984930862` |
| Acesso | [OSM way 84830170](https://www.openstreetmap.org/way/84830170), SHS Quadra 2, via de serviço |
| Lado | Norte da alça de serviço do SHS |
| Parada | `-15.7947200, -47.8888800`, área externa ao sul da edificação |
| Confiança | Média |
| Adaptação | Edificação, implantação e acesso são reais; função de garagem do jogador e visual são ficcionais. |

## Verificações automatizadas

`npm run map:validate` exige fonte, licença e atribuição; IDs únicos; dois postos; prédio existente; posição dentro do recorte; entrada coincidente com nó do grafo; rotas de entrada e saída; ponto de parada fora do centro viário e dentro do envelope do lote; acesso sem cruzar qualquer outro prédio. O piloto usa o nó real de entrada e só então o ponto interno de parada.

Arquivos rastreáveis: `services/fuel-stations.json`, `workshops.json`, `garages.json`, `service-access-nodes.json` e `source-metadata.json`.
