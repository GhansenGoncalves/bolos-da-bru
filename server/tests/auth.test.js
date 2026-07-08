"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { buildApp } = require("./helpers");

test("login recusa senha errada com 401 e sem revelar detalhes", async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "senha-errada" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "Usuário ou senha inválidos.");
});

test("login aceita a senha correta e devolve um JWT", async () => {
  const { app } = buildApp();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "senha-forte-123" });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "admin");
  assert.ok(res.body.token.split(".").length === 3, "deve devolver um JWT");
});

test("registro de cliente não permite criar admin nem senha curta", async () => {
  const { app } = buildApp();
  const weak = await request(app)
    .post("/api/auth/register")
    .send({ username: "cliente1", password: "123", name: "Fulano" });
  assert.equal(weak.status, 422);

  const ok = await request(app)
    .post("/api/auth/register")
    .send({ username: "cliente1", password: "senha123", name: "Fulano" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.role, "cliente");
});

test("nome de usuário duplicado é rejeitado", async () => {
  const { app } = buildApp();
  await request(app)
    .post("/api/auth/register")
    .send({ username: "cliente2", password: "senha123", name: "Fulano" });
  const dup = await request(app)
    .post("/api/auth/register")
    .send({ username: "cliente2", password: "outrasenha", name: "Outro" });
  assert.equal(dup.status, 409);
});

test("rota protegida sem token retorna 401, e com token de cliente em rota admin retorna 403", async () => {
  const { app } = buildApp();
  const noToken = await request(app).post("/api/products").send({});
  assert.equal(noToken.status, 401);

  const register = await request(app)
    .post("/api/auth/register")
    .send({ username: "cliente3", password: "senha123", name: "Fulano" });
  const asCustomer = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${register.body.token}`)
    .send({ name: "Produto", price: 10, cost: 5, stock: 1 });
  assert.equal(asCustomer.status, 403);
});
