"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireAuth, requireRole, optionalAuth } = require("../auth");
const { saleSchema, deliveryFeeUpdateSchema, validate } = require("../validation");
const {
  buildSaleItems,
  saleSubtotalCents,
  saleDiscountCents,
  saleTotalCents,
  saleProfitCents,
} = require("../pricing");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function serializeSale(row, items, { includeCost }) {
  const out = {
    id: row.id,
    dateISO: row.date_iso,
    time: row.time,
    channel: row.channel,
    payment: row.payment,
    status: row.status,
    paid: !!row.paid,
    paymentInformed: !!row.payment_informed,
    customer: row.customer_name
      ? { name: row.customer_name, phone: row.customer_phone, address: row.customer_address }
      : null,
    deliveryFee: row.delivery_fee_cents / 100,
    deliveryDate: row.delivery_date,
    items: items.map((it) => ({
      productId: it.product_id,
      name: it.name,
      unitPrice: it.unit_price_cents / 100,
      qty: it.qty,
      discount: it.discount_cents / 100,
      promoName: it.promo_name,
      ...(includeCost ? { unitCost: it.unit_cost_cents / 100 } : {}),
    })),
    subtotal: saleSubtotalCents(
      items.map((it) => ({ unitPriceCents: it.unit_price_cents, qty: it.qty }))
    ) / 100,
    discount:
      saleDiscountCents(items.map((it) => ({ discountCents: it.discount_cents }))) / 100,
    total:
      saleTotalCents(
        items.map((it) => ({
          unitPriceCents: it.unit_price_cents,
          qty: it.qty,
          discountCents: it.discount_cents,
        })),
        row.delivery_fee_cents
      ) / 100,
  };
  if (includeCost) {
    out.profit =
      saleProfitCents(
        items.map((it) => ({
          unitPriceCents: it.unit_price_cents,
          unitCostCents: it.unit_cost_cents,
          qty: it.qty,
          discountCents: it.discount_cents,
        }))
      ) / 100;
  }
  return out;
}

function saleRoutes({ db, jwtSecret }) {
  const router = express.Router();
  const auth = requireAuth(jwtSecret);
  const adminOnly = requireRole("admin");
  const maybeAuth = optionalAuth(jwtSecret);

  const getItemsStmt = db.prepare("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY rowid");

  router.get("/", auth, adminOnly, (req, res) => {
    const rows = db.prepare("SELECT * FROM sales ORDER BY date_iso DESC, time DESC").all();
    res.json(rows.map((r) => serializeSale(r, getItemsStmt.all(r.id), { includeCost: true })));
  });

  router.post("/", maybeAuth, (req, res) => {
    const data = validate(saleSchema, req.body);
    const isAdmin = req.user?.role === "admin";

    // Só a administradora pode registrar venda de balcão ou delivery (feitas
    // presencialmente). Sem login (Loja) ou como cliente, só encomenda.
    if (!isAdmin && data.channel !== "encomenda") {
      return res.status(403).json({ error: "Somente a administradora pode registrar esta venda." });
    }
    if (data.channel === "encomenda" && data.deliveryDate < todayISO()) {
      return res.status(422).json({ error: "A data de entrega não pode estar no passado." });
    }

    const run = db.transaction(() => {
      const products = db.prepare("SELECT * FROM products").all();
      const promotions = db.prepare("SELECT * FROM promotions").all();
      const items = buildSaleItems(products, promotions, data.items, todayISO());

      // Estoque só é verificado/baixado para balcão e delivery: encomenda é
      // produção sob demanda, não depende do estoque pronto.
      if (data.channel !== "encomenda") {
        for (const item of items) {
          if (item.qty > item.stock) {
            const err = new Error(`Estoque insuficiente de ${item.name}.`);
            err.status = 409;
            throw err;
          }
        }
        const decrementStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
        for (const item of items) decrementStmt.run(item.qty, item.productId);
      }

      // A taxa de entrega só é aceita quando a admin registra a venda
      // manualmente; pedidos da Loja sempre chegam com taxa zerada e a admin
      // ajusta depois (evita cliente forjar a taxa de entrega).
      const deliveryFeeCents =
        isAdmin && data.channel !== "balcao" ? Math.round(data.deliveryFee * 100) : 0;

      const saleRow = {
        id: randomUUID(),
        date_iso: todayISO(),
        time: nowHHMM(),
        channel: data.channel,
        payment: data.payment,
        status: data.channel === "encomenda" ? "pendente" : "ok",
        paid: data.channel !== "encomenda" ? 1 : 0,
        payment_informed: 0,
        customer_name: data.channel === "balcao" ? null : data.customerName || null,
        customer_phone: data.channel === "balcao" ? null : data.customerPhone || null,
        customer_address: data.channel === "balcao" ? null : data.customerAddress || null,
        delivery_fee_cents: deliveryFeeCents,
        delivery_date: data.channel === "encomenda" ? data.deliveryDate : null,
        created_by_user_id: req.user?.sub || null,
      };
      db.prepare(
        `INSERT INTO sales (id, date_iso, time, channel, payment, status, paid, payment_informed,
          customer_name, customer_phone, customer_address, delivery_fee_cents, delivery_date, created_by_user_id)
         VALUES (@id, @date_iso, @time, @channel, @payment, @status, @paid, @payment_informed,
          @customer_name, @customer_phone, @customer_address, @delivery_fee_cents, @delivery_date, @created_by_user_id)`
      ).run(saleRow);

      const insertItemStmt = db.prepare(
        `INSERT INTO sale_items (id, sale_id, product_id, name, unit_price_cents, unit_cost_cents, qty, discount_cents, promo_name)
         VALUES (@id, @sale_id, @product_id, @name, @unit_price_cents, @unit_cost_cents, @qty, @discount_cents, @promo_name)`
      );
      for (const item of items) {
        insertItemStmt.run({
          id: randomUUID(),
          sale_id: saleRow.id,
          product_id: item.productId,
          name: item.name,
          unit_price_cents: item.unitPriceCents,
          unit_cost_cents: item.unitCostCents,
          qty: item.qty,
          discount_cents: item.discountCents,
          promo_name: item.promoName,
        });
      }
      return saleRow;
    });

    try {
      const saleRow = run();
      const full = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleRow.id);
      res.status(201).json(serializeSale(full, getItemsStmt.all(saleRow.id), { includeCost: isAdmin }));
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  // Confirma a encomenda como concluída (produção entregue) e soma às vendas.
  router.patch("/:id/complete", auth, adminOnly, (req, res) => {
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
    if (sale.status !== "pendente") {
      return res.status(409).json({ error: "Só é possível concluir encomendas pendentes." });
    }
    const deliveryDate = sale.delivery_date > todayISO() ? todayISO() : sale.delivery_date;
    db.prepare("UPDATE sales SET status = 'ok', delivery_date = ? WHERE id = ?").run(
      deliveryDate,
      sale.id
    );
    const updated = db.prepare("SELECT * FROM sales WHERE id = ?").get(sale.id);
    res.json(serializeSale(updated, getItemsStmt.all(sale.id), { includeCost: true }));
  });

  router.patch("/:id/paid", auth, adminOnly, (req, res) => {
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
    db.prepare("UPDATE sales SET paid = 1 WHERE id = ?").run(sale.id);
    const updated = db.prepare("SELECT * FROM sales WHERE id = ?").get(sale.id);
    res.json(serializeSale(updated, getItemsStmt.all(sale.id), { includeCost: true }));
  });

  router.patch("/:id/delivery-fee", auth, adminOnly, (req, res) => {
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
    if (sale.status !== "pendente") {
      return res.status(409).json({ error: "Só é possível ajustar a taxa de encomendas pendentes." });
    }
    const data = validate(deliveryFeeUpdateSchema, req.body);
    db.prepare("UPDATE sales SET delivery_fee_cents = ? WHERE id = ?").run(
      Math.round(data.deliveryFee * 100),
      sale.id
    );
    const updated = db.prepare("SELECT * FROM sales WHERE id = ?").get(sale.id);
    res.json(serializeSale(updated, getItemsStmt.all(sale.id), { includeCost: true }));
  });

  router.patch("/:id/cancel", auth, adminOnly, (req, res) => {
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
    if (sale.status === "cancelled") {
      return res.status(409).json({ error: "Esta venda já está cancelada." });
    }
    const run = db.transaction(() => {
      if (sale.channel !== "encomenda") {
        const items = getItemsStmt.all(sale.id);
        const restockStmt = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
        for (const item of items) restockStmt.run(item.qty, item.product_id);
      }
      db.prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?").run(sale.id);
    });
    run();
    const updated = db.prepare("SELECT * FROM sales WHERE id = ?").get(sale.id);
    res.json(serializeSale(updated, getItemsStmt.all(sale.id), { includeCost: true }));
  });

  return router;
}

module.exports = saleRoutes;
