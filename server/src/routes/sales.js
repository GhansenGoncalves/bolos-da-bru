"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireAuth, requireRole, optionalAuth } = require("../auth");
const { saleSchema, deliveryFeeUpdateSchema, trackQuerySchema, validate } = require("../validation");
const { asyncHandler } = require("../asyncHandler");
const { withTransaction } = require("../pool");
const {
  buildSaleItems,
  saleSubtotalCents,
  saleDiscountCents,
  saleTotalCents,
  saleProfitCents,
} = require("../pricing");

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

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

function saleRoutes({ pool, jwtSecret }) {
  const router = express.Router();
  const auth = requireAuth(jwtSecret);
  const adminOnly = requireRole("admin");
  const maybeAuth = optionalAuth(jwtSecret);

  async function getItems(client, saleId) {
    const { rows } = await client.query("SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id", [saleId]);
    return rows;
  }
  async function getSale(client, id) {
    const { rows } = await client.query("SELECT * FROM sales WHERE id = $1", [id]);
    return rows[0] || null;
  }

  router.get(
    "/",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query("SELECT * FROM sales ORDER BY date_iso DESC, time DESC");
      const out = await Promise.all(
        rows.map(async (r) => serializeSale(r, await getItems(pool, r.id), { includeCost: true }))
      );
      res.json(out);
    })
  );

  // Rastreamento público por telefone, para a cliente acompanhar o pedido
  // sem precisar de login (nunca expõe custo/lucro).
  router.get(
    "/track",
    asyncHandler(async (req, res) => {
      const { phone } = validate(trackQuerySchema, req.query);
      const digits = onlyDigits(phone);
      const { rows } = await pool.query(
        `SELECT * FROM sales
          WHERE regexp_replace(coalesce(customer_phone, ''), '\\D', '', 'g') = $1
          ORDER BY coalesce(delivery_date, date_iso) DESC`,
        [digits]
      );
      const out = await Promise.all(
        rows.map(async (r) => serializeSale(r, await getItems(pool, r.id), { includeCost: false }))
      );
      res.json(out);
    })
  );

  router.post(
    "/",
    maybeAuth,
    asyncHandler(async (req, res) => {
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

      const saleRow = await withTransaction(pool, async (client) => {
        const { rows: products } = await client.query("SELECT * FROM products FOR UPDATE");
        const { rows: promotions } = await client.query("SELECT * FROM promotions");
        const items = buildSaleItems(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            price_cents: p.price_cents,
            cost_cents: p.cost_cents,
            stock: p.stock,
          })),
          promotions.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            value: p.value,
            product_id: p.product_id,
            start_date: p.start_date,
            end_date: p.end_date,
          })),
          data.items,
          todayISO()
        );

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
          for (const item of items) {
            // Grava o valor absoluto (calculado em JS a partir do snapshot
            // travado por FOR UPDATE), em vez de "stock = stock - $1": mesmo
            // resultado no Postgres, mas mais explícito de auditar.
            await client.query("UPDATE products SET stock = $1 WHERE id = $2", [item.stock - item.qty, item.productId]);
          }
        }

        // A taxa de entrega só é aceita quando a admin registra a venda
        // manualmente; pedidos da Loja sempre chegam com taxa zerada e a
        // admin ajusta depois (evita cliente forjar a taxa de entrega).
        const deliveryFeeCents =
          isAdmin && data.channel !== "balcao" ? Math.round(data.deliveryFee * 100) : 0;

        const row = {
          id: randomUUID(),
          date_iso: todayISO(),
          time: nowHHMM(),
          channel: data.channel,
          payment: data.payment,
          status: data.channel === "encomenda" ? "pendente" : "ok",
          paid: data.channel !== "encomenda",
          payment_informed: false,
          customer_name: data.channel === "balcao" ? null : data.customerName || null,
          customer_phone: data.channel === "balcao" ? null : data.customerPhone || null,
          customer_address: data.channel === "balcao" ? null : data.customerAddress || null,
          delivery_fee_cents: deliveryFeeCents,
          delivery_date: data.channel === "encomenda" ? data.deliveryDate : null,
          created_by_user_id: req.user?.sub || null,
        };
        await client.query(
          `INSERT INTO sales (id, date_iso, time, channel, payment, status, paid, payment_informed,
            customer_name, customer_phone, customer_address, delivery_fee_cents, delivery_date, created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            row.id, row.date_iso, row.time, row.channel, row.payment, row.status, row.paid, row.payment_informed,
            row.customer_name, row.customer_phone, row.customer_address, row.delivery_fee_cents, row.delivery_date,
            row.created_by_user_id,
          ]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO sale_items (id, sale_id, product_id, name, unit_price_cents, unit_cost_cents, qty, discount_cents, promo_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [randomUUID(), row.id, item.productId, item.name, item.unitPriceCents, item.unitCostCents, item.qty, item.discountCents, item.promoName]
          );
        }
        return row;
      });

      const items = await getItems(pool, saleRow.id);
      res.status(201).json(serializeSale(saleRow, items, { includeCost: req.user?.role === "admin" }));
    })
  );

  // Confirma a encomenda como concluída (produção entregue) e soma às vendas.
  router.patch(
    "/:id/complete",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const sale = await getSale(pool, req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
      if (sale.status !== "pendente") {
        return res.status(409).json({ error: "Só é possível concluir encomendas pendentes." });
      }
      const deliveryDate = sale.delivery_date > todayISO() ? todayISO() : sale.delivery_date;
      const { rows } = await pool.query(
        "UPDATE sales SET status = 'ok', delivery_date = $1 WHERE id = $2 RETURNING *",
        [deliveryDate, sale.id]
      );
      res.json(serializeSale(rows[0], await getItems(pool, sale.id), { includeCost: true }));
    })
  );

  router.patch(
    "/:id/paid",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const sale = await getSale(pool, req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
      const { rows } = await pool.query("UPDATE sales SET paid = true WHERE id = $1 RETURNING *", [sale.id]);
      res.json(serializeSale(rows[0], await getItems(pool, sale.id), { includeCost: true }));
    })
  );

  // A cliente avisa que já pagou (ex.: enviou o Pix); a admin ainda confirma
  // o recebimento depois. Rota pública — chaveada pelo id (UUID) da venda.
  router.patch(
    "/:id/inform-payment",
    asyncHandler(async (req, res) => {
      const sale = await getSale(pool, req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
      if (sale.paid || sale.payment_informed || sale.status === "cancelled") {
        return res.status(409).json({ error: "Este pedido não pode ser marcado como avisado agora." });
      }
      const { rows } = await pool.query(
        "UPDATE sales SET payment_informed = true WHERE id = $1 RETURNING *",
        [sale.id]
      );
      res.json(serializeSale(rows[0], await getItems(pool, sale.id), { includeCost: false }));
    })
  );

  router.patch(
    "/:id/delivery-fee",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const sale = await getSale(pool, req.params.id);
      if (!sale) return res.status(404).json({ error: "Venda não encontrada." });
      if (sale.status !== "pendente") {
        return res.status(409).json({ error: "Só é possível ajustar a taxa de encomendas pendentes." });
      }
      const data = validate(deliveryFeeUpdateSchema, req.body);
      const { rows } = await pool.query(
        "UPDATE sales SET delivery_fee_cents = $1 WHERE id = $2 RETURNING *",
        [Math.round(data.deliveryFee * 100), sale.id]
      );
      res.json(serializeSale(rows[0], await getItems(pool, sale.id), { includeCost: true }));
    })
  );

  router.patch(
    "/:id/cancel",
    auth,
    adminOnly,
    asyncHandler(async (req, res) => {
      const existing = await getSale(pool, req.params.id);
      if (!existing) return res.status(404).json({ error: "Venda não encontrada." });
      if (existing.status === "cancelled") {
        return res.status(409).json({ error: "Esta venda já está cancelada." });
      }
      const sale = await withTransaction(pool, async (client) => {
        if (existing.channel !== "encomenda") {
          const items = await getItems(client, existing.id);
          for (const item of items) {
            // FOR UPDATE trava a linha do produto (se ainda existir — ele
            // pode ter sido excluído depois da venda, e o histórico continua
            // válido mesmo assim) antes de gravar o valor absoluto.
            const { rows } = await client.query(
              "SELECT stock FROM products WHERE id = $1 FOR UPDATE",
              [item.product_id]
            );
            if (!rows.length) continue;
            await client.query("UPDATE products SET stock = $1 WHERE id = $2", [
              rows[0].stock + item.qty,
              item.product_id,
            ]);
          }
        }
        const { rows } = await client.query(
          "UPDATE sales SET status = 'cancelled' WHERE id = $1 RETURNING *",
          [existing.id]
        );
        return rows[0];
      });
      res.json(serializeSale(sale, await getItems(pool, sale.id), { includeCost: true }));
    })
  );

  return router;
}

module.exports = saleRoutes;
