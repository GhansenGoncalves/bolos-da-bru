"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireAuth, requireRole, optionalAuth } = require("../auth");
const { productSchema, validate } = require("../validation");

function serializeProduct(row, { includeCost }) {
  const out = {
    id: row.id,
    name: row.name,
    price: row.price_cents / 100,
    stock: row.stock,
    description: row.description,
    allergens: row.allergens,
    shelfLifeDays: row.shelf_life_days,
  };
  // Custo é informação interna do negócio: só admin autenticado vê.
  if (includeCost) out.cost = row.cost_cents / 100;
  return out;
}

function productRoutes({ db, jwtSecret }) {
  const router = express.Router();
  const auth = requireAuth(jwtSecret);
  const adminOnly = requireRole("admin");
  const maybeAuth = optionalAuth(jwtSecret);

  // Catálogo é público (vitrine da Loja), mas nunca expõe o custo.
  router.get("/", maybeAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM products ORDER BY name").all();
    const isAdmin = req.user?.role === "admin";
    res.json(rows.map((r) => serializeProduct(r, { includeCost: isAdmin })));
  });

  router.post("/", auth, adminOnly, (req, res) => {
    const data = validate(productSchema, req.body);
    const row = {
      id: randomUUID(),
      name: data.name,
      price_cents: Math.round(data.price * 100),
      cost_cents: Math.round(data.cost * 100),
      stock: data.stock,
      description: data.description,
      allergens: data.allergens,
      shelf_life_days: data.shelfLifeDays ?? null,
    };
    db.prepare(
      `INSERT INTO products (id, name, price_cents, cost_cents, stock, description, allergens, shelf_life_days)
       VALUES (@id, @name, @price_cents, @cost_cents, @stock, @description, @allergens, @shelf_life_days)`
    ).run(row);
    res.status(201).json(serializeProduct(row, { includeCost: true }));
  });

  router.put("/:id", auth, adminOnly, (req, res) => {
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Produto não encontrado." });
    const data = validate(productSchema, req.body);
    db.prepare(
      `UPDATE products SET name=@name, price_cents=@price_cents, cost_cents=@cost_cents,
        stock=@stock, description=@description, allergens=@allergens,
        shelf_life_days=@shelf_life_days, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id=@id`
    ).run({
      id: req.params.id,
      name: data.name,
      price_cents: Math.round(data.price * 100),
      cost_cents: Math.round(data.cost * 100),
      stock: data.stock,
      description: data.description,
      allergens: data.allergens,
      shelf_life_days: data.shelfLifeDays ?? null,
    });
    const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    res.json(serializeProduct(updated, { includeCost: true }));
  });

  router.delete("/:id", auth, adminOnly, (req, res) => {
    const result = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "Produto não encontrado." });
    res.status(204).end();
  });

  return router;
}

module.exports = { productRoutes, serializeProduct };
