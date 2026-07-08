"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { buildApp } = require("./helpers");

test("login recusa senha errada com 401 e sem revelar detalhes", async () => {
  const { app } = await buildApp();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "admin", password: "senha-errada" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "Usuário ou senha inválidos.");
});

test("login aceita a senha correta e devolve um JWT", async () => {
  const { app } = await buildApp();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "admin", password: "senha-forte-123" });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "admin");
  assert.ok(res.body.token.split(".").length === 3, "deve devolver um JWT");
});

test("registro de cliente não permite senha curta, e exige e-mail e telefone válidos", async () => {
  const { app } = await buildApp();
  const weak = await request(app)
    .post("/api/auth/register")
    .send({ email: "fulano@example.com", phone: "11999990000", password: "123", name: "Fulano" });
  assert.equal(weak.status, 422);

  const badEmail = await request(app)
    .post("/api/auth/register")
    .send({ email: "não-é-email", phone: "11999990000", password: "senha123", name: "Fulano" });
  assert.equal(badEmail.status, 422);

  const ok = await request(app)
    .post("/api/auth/register")
    .send({ email: "fulano@example.com", phone: "(11) 99999-0000", password: "senha123", name: "Fulano" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.role, "cliente");
});

test("e-mail ou telefone já cadastrado é rejeitado", async () => {
  const { app } = await buildApp();
  await request(app)
    .post("/api/auth/register")
    .send({ email: "ciclana@example.com", phone: "11988887777", password: "senha123", name: "Ciclana" });

  const dupEmail = await request(app)
    .post("/api/auth/register")
    .send({ email: "ciclana@example.com", phone: "11900001111", password: "outrasenha", name: "Outra" });
  assert.equal(dupEmail.status, 409);

  const dupPhone = await request(app)
    .post("/api/auth/register")
    .send({ email: "outra@example.com", phone: "11988887777", password: "outrasenha", name: "Outra" });
  assert.equal(dupPhone.status, 409);
});

test("cliente cadastrado consegue logar tanto pelo e-mail quanto pelo telefone", async () => {
  const { app } = await buildApp();
  await request(app)
    .post("/api/auth/register")
    .send({ email: "beltrana@example.com", phone: "11977776666", password: "senha123", name: "Beltrana" });

  const byEmail = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "beltrana@example.com", password: "senha123" });
  assert.equal(byEmail.status, 200);

  const byPhone = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "(11) 97777-6666", password: "senha123" });
  assert.equal(byPhone.status, 200);
});

test("rota protegida sem token retorna 401, e com token de cliente em rota admin retorna 403", async () => {
  const { app } = await buildApp();
  const noToken = await request(app).post("/api/products").send({});
  assert.equal(noToken.status, 401);

  const register = await request(app)
    .post("/api/auth/register")
    .send({ email: "cliente3@example.com", phone: "11966665555", password: "senha123", name: "Fulano" });
  const asCustomer = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${register.body.token}`)
    .send({ name: "Produto", price: 10, cost: 5, stock: 1 });
  assert.equal(asCustomer.status, 403);
});
