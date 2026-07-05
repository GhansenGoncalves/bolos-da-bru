# Busca de pedido no ADM (código curto + status de pagamento)

## Contexto

O usuário trouxe um checklist genérico de validação de pedidos em backoffice
(busca por ID/CPF/e-mail, status de pagamento, Transaction ID/NSU, webhook de
gateway). O sistema **Bolos da Bru** roda 100% no navegador (localStorage, sem
backend, sem gateway de pagamento real): o cliente escolhe a forma de
pagamento e o admin apenas confirma manualmente o recebimento. O checklist
original não se aplica como está — este documento adapta a intenção (localizar
um pedido e conferir o status do pagamento) à realidade do sistema.

## Problema

Hoje não existe nenhuma forma de localizar um pedido específico no ADM. A aba
Vendas mostra só as últimas 100 vendas, sem busca. O `id` interno de cada
venda é um UUID gerado por `crypto.randomUUID()` e nunca é exposto ao
cliente — nem no resumo do WhatsApp, nem na tela de acompanhamento, nem no CSV
exportado. Não há como o cliente informar um identificador que ele nunca viu.

## Decisões

- Busca por **código curto do pedido** ou **telefone do cliente** — não por
  CPF/e-mail (o sistema não coleta esses dados hoje e adicioná-los foi
  descartado para não aumentar a fricção da Loja nem os dados sensíveis
  guardados em localStorage).
- A busca vive como um campo de texto dentro da aba **Vendas** já existente
  (não uma aba nova).

## Design

### 1. Código curto do pedido

- Cada venda ganha um campo `code`: 4 caracteres do alfabeto
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem `0/O/1/I`, pra evitar confusão ao
  ditar por telefone).
- Gerado no momento da criação da venda, nos dois pontos onde uma venda é
  criada: `registerSale` (venda feita pelo admin) e `submitShopOrder` (pedido
  feito pelo cliente na Loja).
- Geração checa colisão contra os `code` já existentes em `db.sales` e tenta
  de novo se colidir (na prática, irrelevante no volume de uma padaria
  pequena, mas custa nada garantir).
- **Migração de dados antigos:** ao carregar o banco (`loadDB`), qualquer
  venda sem `code` recebe um gerado na hora e é persistida de volta —
  migração silenciosa, sem quebrar dados existentes.
- **Exposição ao cliente**, em três pontos:
  - Tela de confirmação do pedido na Loja (`renderShopConfirmation`): destaque
    "Seu código: **#A1B2**".
  - Mensagem de resumo do WhatsApp (`submitShopOrder`): nova linha `Código do
    pedido: A1B2`.
  - Tela de acompanhamento por telefone (`trackOrders`): código exibido junto
    de cada pedido encontrado.

### 2. Busca no ADM (aba Vendas)

- Campo de texto acima da tabela: placeholder "Buscar por código do pedido ou
  telefone".
- Filtragem em tempo real (a cada tecla), client-side, sobre `db.sales`
  **completo** (não só as últimas 100) — permite achar pedidos antigos.
  Quando o campo está vazio, volta ao comportamento atual (últimas 100, mais
  recentes primeiro).
- Match de código: case-insensitive, por prefixo (`"a1b"` encontra `A1B2`).
- Match de telefone: compara apenas dígitos (mesma normalização que
  `trackOrders` já usa via `onlyDigits`), por prefixo.
- Um termo de busca pode casar por código OU telefone (OR, não precisa
  escolher qual campo buscar).
- Tabela sem resultado: mesma linha de "vazio" já usada hoje, texto ajustado
  para refletir que é resultado de busca ("Nenhuma venda encontrada para essa
  busca.").
- A célula de data/canal na tabela passa a mostrar o código do pedido (abaixo
  da data, estilo `cell-sub` já usado para outras informações secundárias na
  mesma tabela) — assim a equipe vê o código pra conferir contra o que o
  cliente informou.

### 3. Status de pagamento na tabela de Vendas

- A célula de pagamento (hoje só mostra o texto da forma escolhida) passa a
  incluir também o badge de status já usado em `renderOrders` e
  `trackOrders`: **Pago** (`sale.paid`) / **Cliente avisou**
  (`sale.paymentInformed`) / **A receber** (nenhum dos dois) — reaproveitando
  a lógica existente, sem novo estado.
- Não há Transaction ID/NSU/webhook de gateway nesse sistema — essa parte do
  checklist original não tem equivalente aqui e fica de fora. O "detalhe do
  pagamento" possível é: forma escolhida pelo cliente + status de confirmação
  manual do admin.

## Fora de escopo

- CPF, e-mail, ou qualquer campo novo de identificação do cliente.
- Nova aba/tela dedicada de busca (fica dentro de Vendas).
- Qualquer integração com gateway de pagamento real, Transaction ID/NSU ou
  webhook — o sistema continua sem backend.

## Testes

Cobrir com Playwright (suíte já existente em `tests/e2e.spec.js`):
- Código do pedido aparece na confirmação da Loja, no resumo do WhatsApp e na
  busca por telefone (`trackOrders`).
- Busca na aba Vendas por código (prefixo, case-insensitive) e por telefone
  (com/sem máscara) retornam a venda esperada, incluindo uma venda fora das
  últimas 100 (ou um teste equivalente que comprove que a busca não está
  limitada ao slice de 100).
- Campo de busca vazio volta a mostrar as últimas 100 vendas, como hoje.
- Badge de status de pagamento (Pago / Cliente avisou / A receber) aparece
  corretamente na tabela de Vendas para os três estados.
- Migração: uma venda sem `code` no localStorage recebe um código ao carregar
  a página, sem erros.
