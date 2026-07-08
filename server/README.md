# Bolos da Bru — API (backend)

API REST em Node.js/Express com autenticação e validação **reais**, feitas no
servidor — substitui a confiança cega no que o navegador manda. Antes, tudo
(login, preço, estoque, promoção) vivia só no JavaScript do cliente, o que
qualquer pessoa podia inspecionar e alterar pelo DevTools. Agora:

- **Autenticação de verdade**: senha com hash bcrypt, sessão via JWT assinado
  pelo servidor. Ninguém vira admin editando uma variável no navegador.
- **Preço e custo nunca vêm do cliente**: toda venda recalcula o preço, o
  custo e a promoção aplicável a partir do banco de dados no momento da
  venda. Um payload forjado com `unitPrice: 0.01` é ignorado.
- **Estoque é conferido e debitado no servidor**, dentro de uma transação —
  não dá para vender além do que existe, e uma falha no meio da operação não
  deixa o estoque inconsistente.
- **Regras por canal são reforçadas no servidor**: só a administradora
  autenticada pode registrar venda de balcão/delivery; a Loja (sem login)
  só pode criar encomendas, sempre com taxa de entrega zerada até a
  administradora ajustar manualmente.
- **Autorização por papel**: rotas de escrita (produtos, promoções, vendas)
  exigem token de `admin`; o catálogo público nunca expõe o custo do produto.

## Rodando localmente

```bash
cd server
npm install
cp .env.example .env
# edite o .env: gere um JWT_SECRET forte e defina a senha do admin
npm start
```

O servidor sobe em `http://127.0.0.1:3000` (ou a porta do `.env`) e cria o
usuário administrador automaticamente na primeira execução, com as
credenciais de `ADMIN_USERNAME`/`ADMIN_PASSWORD` do `.env`.

## Testes

```bash
npm test
```

15 testes de integração (`node:test` + `supertest`), cobrindo autenticação,
autorização por papel e tentativas de fraude: preço/custo forjados, estoque
negativo, taxa de entrega forjada por cliente anônimo, cliente tentando
registrar venda de balcão, promoção aplicada mesmo sem o cliente informar
desconto.

## Endpoints

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | login, devolve JWT |
| POST | `/api/auth/register` | público | autocadastro de cliente (nunca cria admin) |
| GET | `/api/products` | público | catálogo (custo só aparece para admin autenticado) |
| POST/PUT/DELETE | `/api/products` | admin | CRUD de produtos |
| GET | `/api/promotions` | público | promoções vigentes/agendadas/expiradas |
| POST/PUT/DELETE | `/api/promotions` | admin | CRUD de promoções |
| POST | `/api/sales` | público* | registra venda/encomenda (*balcão e delivery exigem admin*) |
| GET | `/api/sales` | admin | histórico completo, com lucro |
| PATCH | `/api/sales/:id/complete` | admin | conclui encomenda pendente |
| PATCH | `/api/sales/:id/paid` | admin | confirma pagamento recebido |
| PATCH | `/api/sales/:id/delivery-fee` | admin | ajusta taxa de entrega de encomenda pendente |
| PATCH | `/api/sales/:id/cancel` | admin | cancela venda e devolve estoque (exceto encomenda) |

## Banco de dados

SQLite via `better-sqlite3`, arquivo local definido em `DATABASE_FILE`. Sem
serviço externo para rodar localmente. Schema em `src/db.js`, criado
automaticamente na primeira execução.

## O que ainda falta — e que só você pode resolver

O código acima é tudo o que dá para construir sem decisões ou credenciais
que são suas:

1. **Escolher e criar uma conta de hospedagem que rode Node** (Render,
   Railway, Fly.io, um VPS, etc.) — GitHub Pages só serve arquivos estáticos,
   não roda este servidor. Isso envolve criar conta, plano (gratuito ou
   pago) e é uma decisão de custo/fornecedor que é sua.
2. **Gerar e guardar em segredo os valores de produção**: `JWT_SECRET` real
   e a senha do admin. Eu posso gerar um valor aleatório, mas não posso
   "guardar" um segredo de produção por você nem sei qual host/senha você
   vai usar.
3. **Configurar o `DATABASE_FILE`** para um disco persistente no host
   escolhido (a maioria dos hosts "grátis" apaga o filesystem a cada
   deploy — se isso importa pra você, precisa de um plano com disco
   persistente ou migrar para um Postgres gerenciado).
4. **Apontar o domínio/URL da API** e ajustar `CORS_ORIGIN` para a URL real
   onde o frontend (`index.html`) vai ficar publicado.
5. **Migrar o frontend (`js/app.js`) para chamar esta API** em vez do
   `localStorage` — troca de fonte de verdade de dados, com risco de
   quebrar os 41 testes E2E atuais. Se você quiser, eu faço essa etapa a
   seguir; só não fiz agora para não misturar "criar o backend" com
   "reescrever o app inteiro" numa única entrega sem você revisar o
   backend primeiro.
6. **Decidir sobre LGPD/dados de clientes em produção real** (retenção,
   exclusão a pedido, etc.) — é uma decisão de negócio/jurídica, não técnica.

Se quiser, meu próximo passo natural é o item 5: religar `index.html`/`app.js`
para consumir esta API (login real, produtos/estoque/promoções e vendas via
`fetch`), mantendo a mesma interface visual.
