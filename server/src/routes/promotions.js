"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireAuth, requireRole } = require("../auth");
const { promotionSchema, validate } = require("../validation");
const { promoStatus } = require("../pricing");

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

function promotionRoutes({ db, jwtSecret }) {
  const router = express.Router();
  const auth = requireAuth(jwtSecret);
  const adminOnly = requireRole("admin");

  // Lista pública: a Loja usa isso para mostrar preço promocional no cardápio.
  router.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM promotions ORDER BY start_date DESC").all();
    res.json(rows.map((r) => serializePromotion(r, todayISO())));
  });

  router.post("/", auth, adminOnly, (req, res) => {
    const data = validate(promotionSchema, req.body);
    if (data.productId) {
      const product = db.prepare("SELECT id FROM products WHERE id = ?").get(data.productId);
      if (!product) return res.status(400).json({ error: "Produto da promoção não existe." });
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
    db.prepare(
      `INSERT INTO promotions (id, name, type, value, product_id, start_date, end_date)
       VALUES (@id, @name, @type, @value, @product_id, @start_date, @end_date)`
    ).run(row);
    res.status(201).json(serializePromotion(row, todayISO()));
  });

  router.put("/:id", auth, adminOnly, (req, res) => {
    const existing = db.prepare("SELECT * FROM promotions WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Promoção não encontrada." });
    const data = validate(promotionSchema, req.body);
    if (data.productId) {
      const product = db.prepare("SELECT id FROM products WHERE id = ?").get(data.productId);
      if (!product) return res.status(400).json({ error: "Produto da promoção não existe." });
    }
    db.prepare(
      `UPDATE promotions SET name=@name, type=@type, value=@value, product_id=@product_id,
        start_date=@start_date, end_date=@end_date WHERE id=@id`
    ).run({
      id: req.params.id,
      name: data.name,
      type: data.type,
      value: data.value,
      product_id: data.productId,
      start_date: data.startDate,
      end_date: data.endDate,
    });
    const updated = db.prepare("SELECT * FROM promotions WHERE id = ?").get(req.params.id);
    res.json(serializePromotion(updated, todayISO()));
  });

  router.delete("/:id", auth, adminOnly, (req, res) => {
    const result = db.prepare("DELETE FROM promotions WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "Promoção não encontrada." });
    res.status(204).end();
  });

  return router;
}

module.exports = { promotionRoutes, serializePromotion };
