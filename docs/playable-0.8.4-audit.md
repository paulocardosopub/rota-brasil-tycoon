# PLAYABLE 0.8.4 — auditoria final

Base preservada: versão oficial 0.8.3 (`b6e806f`), autenticação, visitante, nuvem, solo/online, regiões, rotas, serviços, trânsito, piloto, táxi, taxímetro, frota e saves. A migração do save avançou de 8 para 9 e mantém os campos anteriores.

## Catálogos e empresas

- Candidatos: 12 cadastrados; até 8 opções não contratadas aparecem por vez; limite 5/5 por garagem.
- Passageiros/táxi: Hatch 1998, Sedan 2012, Compacto 2010, Sedan Executivo 2018 e SUV Urbano 2020.
- Central de Entregas: Moto Urbana 125, Moto Cargo 160, Scooter Express 150, Triciclo Cargo 200 e Hatch Entrega.
- Frete Brasília: Furgão Compacto, Van de Carga, Picape Leve, Furgão Médio e Utilitário Baú.
- Empresas possuem compra idempotente, base operacional, trabalhos concluídos e receita bruta persistidos.

## Operação

Entregas e fretes reutilizam o roteamento viário validado. A coleta é selecionada entre 500 m e 2 km por distância de rota, não em linha reta. Ofertas registram carga, volume, fragilidade, veículo exigido, coleta, destino, prazo e pagamento. Os veículos podem ser dirigidos pelo jogador, atribuídos a funcionários qualificados e publicados pelo protocolo online sem criar tráfego adicional fora do orçamento.

Motos têm aceleração, direção, consumo e tolerância fora de pista próprios. Vans e utilitários têm aceleração, frenagem, direção, consumo e porte diferenciados. Todos usam o piloto, recuperação de rota, chunks e serviços existentes.

## Save, nuvem e segurança

A migração 9 é idempotente e adiciona empresas, qualificações e capacidade de carga sem remover patrimônio. A nuvem continua usando revisão/linhagem e o save local de emergência. A migration `202607180001_playable_084_delivery_freight.sql` adiciona tabela de empresas com RLS por proprietário, qualificações e capacidade dos veículos, além dos modelos aceitos no online.

## Limites conhecidos

- Uma operação detalhada de funcionário permanece ativa por vez, preservando a arquitetura e o orçamento de tráfego da 0.8.3.
- Os novos modelos usam visuais vetoriais leves derivados das famílias carro, moto e utilitário; não adicionam assets pesados.
- Medições finais, Pages, PR, tag e release são registradas após a bateria única de validação e a publicação.
