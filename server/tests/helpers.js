"use strict";

const { openDatabase, ensureAdminUser } = require("../src/db");
const { createApp } = require("../src/app");

function buildApp() {
  const db = openDatabase(":memory:");
  ensureAdminUser(db, { username: "admin", password: "senha-forte-123", name: "Admin Teste" });
  const app = createApp({
    db,
    jwtSecret: "segredo-de-teste",
    jwtExpiresIn: "1h",
    corsOrigins: [],
  });
  return { app, db };
}

module.exports = { buildApp };
