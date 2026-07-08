"use strict";

const { newDb } = require("pg-mem");
const { runMigrations, ensureAdminUser } = require("../src/db");
const { createApp } = require("../src/app");

/* pg-mem simula um Postgres real em memória, com a mesma interface do driver
   `pg` — dá para testar toda a camada de banco sem precisar de um servidor
   Postgres de verdade rodando. */
async function buildApp() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => require("node:crypto").randomUUID(),
  });
  // pg-mem só implementa um punhado de funções nativas do Postgres; as
  // rotas de auth/rastreio usam length() e regexp_replace() de verdade, que
  // o Postgres real já tem — aqui só precisamos equivalê-las para o teste.
  mem.public.registerFunction({
    name: "length",
    args: ["text"],
    returns: "int",
    implementation: (s) => String(s || "").length,
  });
  mem.public.registerFunction({
    name: "regexp_replace",
    args: ["text", "text", "text", "text"],
    returns: "text",
    implementation: (s, pattern, replacement, flags) =>
      String(s || "").replace(new RegExp(pattern, flags && flags.includes("g") ? "g" : ""), replacement),
  });
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  await runMigrations(pool);
  await ensureAdminUser(pool, { username: "admin", password: "senha-forte-123", name: "Admin Teste" });

  const app = createApp({
    pool,
    jwtSecret: "segredo-de-teste",
    jwtExpiresIn: "1h",
    corsOrigins: [],
  });
  return { app, pool };
}

module.exports = { buildApp };
