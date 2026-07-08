# Bolos da Bru — API (backend)

API REST em Node.js/Express + Postgres, com autenticação e validação
**reais**, feitas no servidor — substitui a confiança cega no que o
navegador manda. Antes, tudo (login, preço, estoque, promoção) vivia só no
JavaScript do cliente, o que qualquer pessoa podia inspecionar e alterar
pelo DevTools. Agora:

- **Autenticação de verdade**: senha com hash bcrypt, sessão via JWT assinado
  pelo servidor. Ninguém vira admin editando uma variável no navegador.
  Clientes cadastram e logam com e-mail **ou** telefone.
- **Preço e custo nunca vêm do cliente**: toda venda recalcula o preço, o
  custo e a promoção aplicável a partir do banco de dados no momento da
  venda. Um payload forjado com `unitPrice: 0.01` é ignorado.
- **Estoque é conferido e debitado no servidor**, dentro de uma transação com
  `SELECT ... FOR UPDATE` — não dá para vender além do que existe, duas
  vendas simultâneas não disputam o mesmo estoque, e uma falha no meio da
  operação não deixa o estoque inconsistente.
- **Regras por canal são reforçadas no servidor**: só a administradora
  autenticada pode registrar venda de balcão/delivery; a Loja (sem login)
  só pode criar encomendas, sempre com taxa de entrega zerada até a
  administradora ajustar manualmente.
- **Autorização por papel**: rotas de escrita (produtos, promoções, vendas)
  exigem token de `admin`; o catálogo público e o rastreio de pedidos nunca
  expõem custo/lucro.
- **Dados persistem de verdade**: Postgres, não `localStorage` do navegador
  nem um arquivo que some a cada deploy.

## Rodando localmente

Precisa de um Postgres rodando (local ou Docker):

```bash
# opção rápida com Docker
docker run --name bolos-pg -e POSTGRES_PASSWORD=bolos123 -e POSTGRES_DB=bolosdabru -p 5432:5432 -d postgres:16
```

```bash
cd server
npm install
cp .env.example .env
# edite o .env: DATABASE_URL, um JWT_SECRET forte e a senha do admin
npm start
```

O servidor sobe em `http://127.0.0.1:3000` (ou a porta do `.env`), cria as
tabelas automaticamente (`CREATE TABLE IF NOT EXISTS`) e cria o usuário
administrador na primeira execução, com as credenciais de
`ADMIN_USERNAME`/`ADMIN_PASSWORD` do `.env`.

## Testes

```bash
npm test
```

20 testes de integração (`node:test` + `supertest`, banco simulado com
`pg-mem` — não precisa de Postgres rodando para testar), cobrindo
autenticação (login por e-mail/telefone, duplicidade), autorização por
papel e tentativas de fraude: preço/custo forjados, estoque negativo, taxa
de entrega forjada por cliente anônimo, promoção acima do limite de 90%,
cliente tentando registrar venda de balcão, exclusão de produto com
histórico de vendas.

## Endpoints

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | login por usuário/e-mail/telefone, devolve JWT |
| POST | `/api/auth/register` | público | autocadastro de cliente (nunca cria admin) |
| GET | `/api/products` | público | catálogo (custo só aparece para admin autenticado) |
| POST/PUT/DELETE | `/api/products` | admin | CRUD de produtos (nome, preço, custo, estoque, validade, foto) |
| GET | `/api/promotions` | público | promoções vigentes/agendadas/expiradas |
| POST/PUT/DELETE | `/api/promotions` | admin | CRUD de promoções (% até 90 ou R$ fixo) |
| POST | `/api/sales` | público* | registra venda/encomenda (*balcão e delivery exigem admin*) |
| GET | `/api/sales` | admin | histórico completo, com lucro |
| GET | `/api/sales/track?phone=` | público | pedidos de um telefone, sem custo/lucro |
| PATCH | `/api/sales/:id/complete` | admin | conclui encomenda pendente |
| PATCH | `/api/sales/:id/paid` | admin | confirma pagamento recebido |
| PATCH | `/api/sales/:id/inform-payment` | público | cliente avisa que já pagou (Pix) |
| PATCH | `/api/sales/:id/delivery-fee` | admin | ajusta taxa de entrega de encomenda pendente |
| PATCH | `/api/sales/:id/cancel` | admin | cancela venda e devolve estoque (exceto encomenda) |

## Banco de dados

Postgres, schema em `src/db.js` (`CREATE TABLE IF NOT EXISTS`, aplicado
automaticamente ao subir o servidor). Conexão via `DATABASE_URL` (formato
`postgres://usuario:senha@host:porta/banco`).

## Deploy na Render

Este repo já tem um `server/render.yaml` (Blueprint) que cria o Web Service
e um banco Postgres free juntos:

1. No painel da Render, **New → Blueprint**, aponte para este repositório.
2. A Render lê o `render.yaml`, cria o Postgres (`bolos-da-bru-db`) e o Web
   Service (`bolos-da-bru-api`) já conectados via `DATABASE_URL`.
3. Preencha manualmente (marcados `sync: false` no blueprint): `ADMIN_USERNAME`,
   `ADMIN_PASSWORD`, `ADMIN_NAME`, `CORS_ORIGIN` (a URL do frontend, ex.:
   `https://ghansengoncalves.github.io`). `JWT_SECRET` já é gerado sozinho.
4. Sobe. O plano free do Postgres da Render costuma expirar depois de 30 dias
   sem cartão cadastrado — se isso acontecer, o painel avisa antes.

Se preferir criar o Web Service manualmente (sem Blueprint): Root Directory
`server`, Build Command `npm install`, Start Command `npm start`, e crie um
Postgres separado no painel, colando a "Internal Database URL" dele em
`DATABASE_URL`.

## O que ainda falta — e que só você pode resolver

1. **Terminar a configuração no painel da Render**: preencher as variáveis
   marcadas `sync: false` acima (usuário/senha do admin reais, CORS) — são
   credenciais do seu negócio, não posso inventar por você.
2. **Apontar o domínio/URL da API publicada** no frontend (isso faz parte da
   integração `js/app.js` ↔ API, próximo passo).
3. **Decidir sobre LGPD/dados de clientes em produção real** (retenção,
   exclusão a pedido, etc.) — é uma decisão de negócio/jurídica, não técnica.
4. **Acompanhar o uso do plano free da Render** (Postgres free expira em 30
   dias sem cartão; o Web Service free hiberna após inatividade — a primeira
   requisição depois de um tempo ocioso demora alguns segundos a mais). Se o
   negócio crescer, migrar para um plano pago é decisão sua, de custo.

O próximo passo natural é religar `index.html`/`js/app.js` para consumir
esta API (login real, produtos/estoque/promoções e vendas via `fetch`),
mantendo a mesma interface visual.
