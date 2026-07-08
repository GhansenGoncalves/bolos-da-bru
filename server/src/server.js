"use strict";

require("dotenv").config();
const { createPool } = require("./pool");
const { runMigrations, ensureAdminUser } = require("./db");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!JWT_SECRET || JWT_SECRET === "troque-este-valor-por-um-segredo-aleatorio-forte") {
  console.error(
    "JWT_SECRET não configurado (ou ainda com o valor de exemplo). Defina um segredo forte em .env antes de subir o servidor."
  );
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL não configurado. Aponte para o Postgres (local ou o da Render) em .env antes de subir o servidor."
  );
  process.exit(1);
}

async function main() {
  const pool = createPool(DATABASE_URL);
  await runMigrations(pool);
  await ensureAdminUser(pool, {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME,
  });

  const app = createApp({ pool, jwtSecret: JWT_SECRET, jwtExpiresIn: JWT_EXPIRES_IN, corsOrigins: CORS_ORIGIN });
  app.listen(PORT, () => {
    console.log(`Bolos da Bru API rodando em http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
