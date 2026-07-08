"use strict";

/* Regras de negócio replicadas do frontend, mas calculadas aqui no servidor a
   partir do banco de dados — nunca a partir de valores enviados pelo cliente.
   Isso é o que impede alguém de montar um pedido com preço ou desconto
   forjado direto na requisição. */

function promoStatus(promo, refISO) {
  if (refISO < promo.start_date) return "agendada";
  if (refISO > promo.end_date) return "expirada";
  return "ativa";
}

/* Maior desconto por unidade entre as promoções vigentes que cobrem o
   produto (específicas do produto ou gerais). */
function bestPromoFor(promotions, productId, unitPriceCents, dateISO) {
  let best = null;
  for (const promo of promotions) {
    if (promoStatus(promo, dateISO) !== "ativa") continue;
    if (promo.product_id && promo.product_id !== productId) continue;
    const offCents =
      promo.type === "percent"
        ? Math.round((unitPriceCents * promo.value) / 100)
        : Math.min(Math.round(promo.value * 100), unitPriceCents);
    if (!best || offCents > best.discountPerUnitCents) {
      best = { name: promo.name, discountPerUnitCents: offCents };
    }
  }
  return best;
}

/* Resolve a lista de itens pedidos (productId + qty) usando SEMPRE o preço,
   custo e promoções atuais do banco — o cliente nunca decide o preço. Lança
   erro se algum produto não existir. Não verifica estoque aqui (isso muda
   por canal, ver routes/sales.js). */
function buildSaleItems(products, promotions, requestedItems, dateISO) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return requestedItems.map(({ productId, qty }) => {
    const product = byId.get(productId);
    if (!product) {
      const err = new Error(`Produto ${productId} não encontrado.`);
      err.status = 400;
      throw err;
    }
    const promo = bestPromoFor(promotions, productId, product.price_cents, dateISO);
    return {
      productId,
      name: product.name,
      unitPriceCents: product.price_cents,
      unitCostCents: product.cost_cents,
      qty,
      discountCents: (promo ? promo.discountPerUnitCents : 0) * qty,
      promoName: promo ? promo.name : null,
      stock: product.stock,
    };
  });
}

function saleSubtotalCents(items) {
  return items.reduce((s, it) => s + it.unitPriceCents * it.qty, 0);
}
function saleDiscountCents(items) {
  return items.reduce((s, it) => s + it.discountCents, 0);
}
function saleTotalCents(items, deliveryFeeCents) {
  return saleSubtotalCents(items) - saleDiscountCents(items) + deliveryFeeCents;
}
/* A taxa de entrega não entra no lucro: assume-se que cobre o deslocamento. */
function saleProfitCents(items) {
  return items.reduce(
    (s, it) => s + (it.unitPriceCents - it.unitCostCents) * it.qty - it.discountCents,
    0
  );
}

module.exports = {
  promoStatus,
  bestPromoFor,
  buildSaleItems,
  saleSubtotalCents,
  saleDiscountCents,
  saleTotalCents,
  saleProfitCents,
};
