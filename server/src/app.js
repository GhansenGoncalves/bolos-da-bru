"use strict";

const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const { productRoutes } = require("./routes/products");
const { promotionRoutes } = require("./routes/promotions");
const saleRoutes = require("./routes/sales");

function createApp({ db, jwtSecret, jwtExpiresIn, corsOrigins }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
    })
  );

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes({ db, jwtSecret, jwtExpiresIn }));
  app.use("/api/products", productRoutes({ db, jwtSecret }));
  app.use("/api/promotions", promotionRoutes({ db, jwtSecret }));
  app.use("/api/sales", saleRoutes({ db, jwtSecret }));

  app.use((req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  return app;
}

module.exports = { createApp };
