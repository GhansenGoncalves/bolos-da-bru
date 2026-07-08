"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { buildApp } = require("./helpers");

async function adminToken(app) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "admin", password: "senha-forte-123" });
  return res.body.token;
}

test("catálogo público nunca expõe o custo do produto", async () => {
  const { app } = await buildApp();
  const token = await adminToken(app);
  await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Chocolate", price: 15, cost: 6.5, stock: 10, shelfLife: "5 dias refrigerado" });

  const publicList = await request(app).get("/api/products");
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body[0].cost, undefined);
  assert.equal(publicList.body[0].shelfLife, "5 dias refrigerado");

  const adminList = await request(app)
    .get("/api/products")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(adminList.body[0].cost, 6.5);
});

test("custo maior que o preço de venda é rejeitado", async () => {
  const { app } = await buildApp();
  const token = await adminToken(app);
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Produto ruim", price: 5, cost: 10, stock: 1 });
  assert.equal(res.status, 422);
});

test("estoque e preço negativos são rejeitados pela validação", async () => {
  const { app } = await buildApp();
  const token = await adminToken(app);
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Produto", price: -1, cost: 0, stock: -5 });
  assert.equal(res.status, 422);
  assert.ok(res.body.details.length > 0);
});

test("deletar produto não é bloqueado por vendas antigas (histórico é mantido)", async () => {
  const { app } = await buildApp();
  const token = await adminToken(app);
  const product = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Sabor sazonal", price: 15, cost: 6, stock: 5 });

  await request(app)
    .post("/api/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({ channel: "balcao", payment: "Pix", items: [{ productId: product.body.id, qty: 1 }] });

  const del = await request(app)
    .delete(`/api/products/${product.body.id}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(del.status, 204);
});
