"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireAuth, requireRole, optionalAuth } = require("../auth");
const { productSchema, validate } = require("../validation");
const { asyncHandler } = require("../asyncHandler");

function serializeProduct(row, { includeCost }) {
  const out = {
    id: row.id,
    name: row.name,
    price: row.price_cents / 100,
    stock: row.stock,
    description: row.description,
    allergens: row.allergens,
    shelfLife: row.shelf_life || "",
    image: row.image || null,
  };
  // Custo é informação interna do negócio: só admin autenticado vê.
  if (includeCost) out.cost = row.cost_cents / 100;
  return out;
}

function productRoutes({ pool, jwtSecret }) {
  const router = express.Router();
  const auth = requireAuth(jwtSecret);
  const adminOnly = requireRole("admin");
  const maybeAuth = optionalAuth(jwtSecret);

  // Catálogo é público (vitrine da Loja), mas nunca expõe o custo.
  router.get(
    "/",
    maybeAuth,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query("SELECT * FROM products ORDER BY name");
      const isAdmin = req.user?.role === "admin";
      res.json(rows.map((r) => serializeProduct(r, { includeCost: isAdmin })));
    })
  );

  router.post(
    "/",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const data = validate(productSchema, req.body);
      const row = {
        id: randomUUID(),
        name: data.name,
        price_cents: Math.round(data.price * 100),
        cost_cents: Math.round(data.cost * 100),
        stock: data.stock,
        description: data.description,
        allergens: data.allergens,
        shelf_life: data.shelfLife || null,
        image: data.image || null,
      };
      await pool.query(
        `INSERT INTO products (id, name, price_cents, cost_cents, stock, description, allergens, shelf_life, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [row.id, row.name, row.price_cents, row.cost_cents, row.stock, row.description, row.allergens, row.shelf_life, row.image]
      );
      res.status(201).json(serializeProduct(row, { includeCost: true }));
    })
  );

  router.put(
    "/:id",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const { rows: existingRows } = await pool.query("SELECT id FROM products WHERE id = $1", [req.params.id]);
      if (!existingRows.length) return res.status(404).json({ error: "Produto não encontrado." });
      const data = validate(productSchema, req.body);
      const { rows } = await pool.query(
        `UPDATE products SET name=$1, price_cents=$2, cost_cents=$3, stock=$4, description=$5,
          allergens=$6, shelf_life=$7, image=$8, updated_at=now()
         WHERE id=$9 RETURNING *`,
        [
          data.name,
          Math.round(data.price * 100),
          Math.round(data.cost * 100),
          data.stock,
          data.description,
          data.allergens,
          data.shelfLife || null,
          data.image || null,
          req.params.id,
        ]
      );
      res.json(serializeProduct(rows[0], { includeCost: true }));
    })
  );

  router.delete(
    "/:id",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: "Produto não encontrado." });
      res.status(204).end();
    })
  );

  return router;
}

module.exports = { productRoutes, serializeProduct };
