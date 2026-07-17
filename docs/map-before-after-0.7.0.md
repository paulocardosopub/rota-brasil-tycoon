# Mapa antes e depois — 0.6.x → 0.7.0

| Métrica | 0.6.x | 0.7.0 |
|---|---:|---:|
| Área aproximada | 4 km² | 157 km² |
| Vias | 1.647 | 19.756 |
| Nós do grafo | 6.102 | 109.047 |
| Faixas detalhadas | derivadas em runtime | 36.539 |
| Arestas dirigidas | grafo central | 127.036 |
| Regiões jogáveis nomeadas | 1 recorte central | 8 regiões |
| Streaming | mapa único | 279 chunks |
| Save | v4 | v5 com contexto do mapa |

## Diferença funcional

Na 0.6.x, jogador, funcionários e tráfego dependiam de um grafo central pequeno e de aproximações de faixa. Na 0.7.0, todos consomem o mesmo grafo dirigido por faixa. A direção inicial é considerada ao entrar na rota, conectores respeitam níveis e sentidos, e a malha global usada pelo GPS é o maior componente fortemente conectado.

O render não tenta manter 157 km² desenhados ao mesmo tempo: dados físicos entram por janela 3×3 e os elementos visuais usam LOD ao redor do veículo ou do funcionário acompanhado.
