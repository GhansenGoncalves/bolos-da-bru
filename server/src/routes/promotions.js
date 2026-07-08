"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireAuth, requireRole } = require("../auth");
const { promotionSchema, validate } = require("../validation");
const { promoStatus } = require("../pricing");
const { asyncHandler } = require("../asyncHandler");

function serializePromotion(row, refISO) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    value: row.value,
    productId: row.product_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: promoStatus(row, refISO),
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function promotionRoutes({ pool, jwtSecret }) {
  const router = express.Router();
  const auth = requireAuth(jwtSecret);
  const adminOnly = requireRole("admin");

  // Lista pública: a Loja usa isso para mostrar preço promocional no cardápio.
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query("SELECT * FROM promotions ORDER BY start_date DESC");
      res.json(rows.map((r) => serializePromotion(r, todayISO())));
    })
  );

  router.post(
    "/",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const data = validate(promotionSchema, req.body);
      if (data.productId) {
        const { rows } = await pool.query("SELECT id FROM products WHERE id = $1", [data.productId]);
        if (!rows.length) return res.status(400).json({ error: "Produto da promoção não existe." });
      }
      const row = {
        id: randomUUID(),
        name: data.name,
        type: data.type,
        value: data.value,
        product_id: data.productId,
        start_date: data.startDate,
        end_date: data.endDate,
      };
      await pool.query(
        `INSERT INTO promotions (id, name, type, value, product_id, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.name, row.type, row.value, row.product_id, row.start_date, row.end_date]
      );
      res.status(201).json(serializePromotion(row, todayISO()));
    })
  );

  router.put(
    "/:id",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const { rows: existingRows } = await pool.query("SELECT id FROM promotions WHERE id = $1", [req.params.id]);
      if (!existingRows.length) return res.status(404).json({ error: "Promoção não encontrada." });
      const data = validate(promotionSchema, req.body);
      if (data.productId) {
        const { rows } = await pool.query("SELECT id FROM products WHERE id = $1", [data.productId]);
        if (!rows.length) return res.status(400).json({ error: "Produto da promoção não existe." });
      }
      const { rows } = await pool.query(
        `UPDATE promotions SET name=$1, type=$2, value=$3, product_id=$4, start_date=$5, end_date=$6
         WHERE id=$7 RETURNING *`,
        [data.name, data.type, data.value, data.productId, data.startDate, data.endDate, req.params.id]
      );
      res.json(serializePromotion(rows[0], todayISO()));
    })
  );

  router.delete(
    "/:id",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const { rowCount } = await pool.query("DELETE FROM promotions WHERE id = $1", [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: "Promoção não encontrada." });
      res.status(204).end();
    })
  );

  return router;
}

module.exports = { promotionRoutes, serializePromotion };
