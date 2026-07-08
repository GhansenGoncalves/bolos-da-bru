"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { buildApp } = require("./helpers");

async function adminToken(app) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "senha-forte-123" });
  return res.body.token;
}

async function createProduct(app, token, overrides = {}) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Chocolate", price: 15, cost: 6.5, stock: 5, ...overrides });
  return res.body;
}

test("preço e custo enviados pelo cliente são ignorados: o servidor usa o valor real do produto", async () => {
  const { app } = buildApp();
  const token = await adminToken(app);
  const product = await createProduct(app, token);

  const sale = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      channel: "balcao",
      payment: "Pix",
      items: [{ productId: product.id, qty: 2, unitPrice: 0.01, unitCost: 0 }],
    });

  assert.equal(sale.status, 201);
  assert.equal(sale.body.items[0].unitPrice, 15); // preço real do produto, não o forjado
  assert.equal(sale.body.total, 30);
});

test("venda de balcão não pode passar do estoque disponível, e não decrementa se a transação falhar", async () => {
  const { app } = buildApp();
  const token = await adminToken(app);
  const product = await createProduct(app, token, { stock: 3 });

  const sale = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({ channel: "balcao", payment: "Dinheiro", items: [{ productId: product.id, qty: 10 }] });

  assert.equal(sale.status, 409);

  const list = await request(app).get("/api/products");
  assert.equal(list.body.find((p) => p.id === product.id).stock, 3, "estoque não deve mudar");
});

test("venda de balcão decrementa estoque; cancelar devolve o estoque", async () => {
  const { app } = buildApp();
  const token = await adminToken(app);
  const product = await createProduct(app, token, { stock: 5 });

  const sale = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({ channel: "balcao", payment: "Pix", items: [{ productId: product.id, qty: 2 }] });
  assert.equal(sale.status, 201);

  let list = await request(app).get("/api/products");
  assert.equal(list.body.find((p) => p.id === product.id).stock, 3);

  const cancel = await request(app)
    .patch(`/api/sales/${sale.body.id}/cancel`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(cancel.status, 200);

  list = await request(app).get("/api/products");
  assert.equal(list.body.find((p) => p.id === product.id).stock, 5, "estoque deve voltar ao cancelar");
});

test("encomenda não exige nem baixa estoque, mesmo além do disponível", async () => {
  const { app } = buildApp();
  const token = await adminToken(app);
  const product = await createProduct(app, token, { stock: 0 });

  const sale = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      channel: "encomenda",
      payment: "Pix",
      items: [{ productId: product.id, qty: 20 }],
      customerName: "Cliente Teste",
      deliveryDate: "2999-01-01",
    });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.status, "pendente");
  assert.equal(sale.body.paid, false);

  const list = await request(app).get("/api/products");
  assert.equal(list.body.find((p) => p.id === product.id).stock, 0);
});

test("cliente sem papel admin só pode registrar encomenda, nunca balcão ou delivery", async () => {
  const { app } = buildApp();
  const adminTok = await adminToken(app);
  const product = await createProduct(app, adminTok);

  const register = await request(app)
    .post("/api/auth/register")
    .send({ username: "cliente-loja", password: "senha123", name: "Cliente" });
  const customerToken = register.body.token;

  const balcao = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${customerToken}`)
    .send({ channel: "balcao", payment: "Pix", items: [{ productId: product.id, qty: 1 }] });
  assert.equal(balcao.status, 403);

  const encomenda = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${customerToken}`)
    .send({
      channel: "encomenda",
      payment: "Pix",
      items: [{ productId: product.id, qty: 1 }],
      customerName: "Cliente",
      deliveryDate: "2999-01-01",
    });
  assert.equal(encomenda.status, 201);
});

test("pedido anônimo da Loja (sem token) não pode forjar taxa de entrega; fica zerada até a admin ajustar", async () => {
  const { app } = buildApp();
  const adminTok = await adminToken(app);
  const product = await createProduct(app, adminTok);

  const sale = await request(app)
    .post("/api/sales")
    .send({
      channel: "encomenda",
      payment: "Pix",
      items: [{ productId: product.id, qty: 1 }],
      customerName: "Cliente Anônimo",
      deliveryDate: "2999-01-01",
      deliveryFee: 999, // tentativa de forjar taxa alta
    });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.deliveryFee, 0, "taxa forjada pelo cliente deve ser ignorada");

  const adjust = await request(app)
    .patch(`/api/sales/${sale.body.id}/delivery-fee`)
    .set("Authorization", `Bearer ${adminTok}`)
    .send({ deliveryFee: 8 });
  assert.equal(adjust.status, 200);
  assert.equal(adjust.body.deliveryFee, 8);
});

test("promoção ativa é aplicada automaticamente pelo servidor, mesmo sem o cliente informar desconto", async () => {
  const { app } = buildApp();
  const token = await adminToken(app);
  const product = await createProduct(app, token, { price: 20, cost: 8, stock: 10 });

  await request(app)
    .post("/api/promotions")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Promo relâmpago", type: "percent", value: 10, startDate: "2000-01-01", endDate: "2999-01-01" });

  const sale = await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({ channel: "balcao", payment: "Pix", items: [{ productId: product.id, qty: 1 }] });

  assert.equal(sale.status, 201);
  assert.equal(sale.body.items[0].discount, 2); // 10% de 20
  assert.equal(sale.body.total, 18);
});
