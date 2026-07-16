# Ajuste — Playable 0.6.1

Esta versão é uma correção pontual da 0.6.0, sem ampliar o escopo da frota.

## Funcionários em circulação

- o motorista mantém o mesmo destino durante recálculos e mudanças entre simulação detalhada e simplificada;
- o próximo ponto só é escolhido quando o atual é alcançado ou comprovadamente não possui rota;
- os pontos de busca e entrega são distribuídos por diferentes regiões da cidade, evitando trajetos circulares repetitivos;
- o veículo continua usando o mesmo grafo dirigido, faixas, semáforos e prevenção de colisões dos NPCs;
- o estado do turno alterna de forma estável entre busca de passageiro e corrida em andamento.

## Identificação

- o nome aparece sobre o carro ativo no formato **Motorista Bia Rocha**;
- o mesmo formato é usado no painel **Minha Frota**;
- a identificação acompanha o veículo quando o jogador escolhe localizá-lo.

## Verificações

- testes unitários garantem destino estável, distribuição dos pontos pela cidade e formatação do nome;
- cenário de navegador verifica a identificação e o progresso do funcionário numa rota física;
- TypeScript, suíte unitária, mapa, economia, desempenho, navegador e build de produção são validados antes da publicação.
