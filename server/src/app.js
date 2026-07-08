"use strict";

const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const { productRoutes } = require("./routes/products");
const { promotionRoutes } = require("./routes/promotions");
const saleRoutes = require("./routes/sales");

// Códigos de erro do Postgres para violações de constraint — última linha de
// defesa caso algo escape da validação de aplicação (ex.: corrida entre
// requisições concorrentes pegando a checagem de estoque no meio).
const PG_CONSTRAINT_CODES = {
  "23514": [409, "Operação violaria uma regra do banco de dados (ex.: estoque ou valor inválido)."],
  "23503": [400, "Referência inválida (ex.: produto inexistente)."],
  "23505": [409, "Já existe um registro com esse valor único."],
};

function createApp({ pool, jwtSecret, jwtExpiresIn, corsOrigins }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "3mb" })); // margem para a foto do produto em base64
  app.use(
    cors({
      origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
    })
  );

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes({ pool, jwtSecret, jwtExpiresIn }));
  app.use("/api/products", productRoutes({ pool, jwtSecret }));
  app.use("/api/promotions", promotionRoutes({ pool, jwtSecret }));
  app.use("/api/sales", saleRoutes({ pool, jwtSecret }));

  app.use((req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.code && PG_CONSTRAINT_CODES[err.code]) {
      const [status, message] = PG_CONSTRAINT_CODES[err.code];
      return res.status(status).json({ error: message });
    }
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  return app;
}

module.exports = { createApp };
