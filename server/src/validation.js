"use strict";

const { z } = require("zod");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD.");
const money = z.number().finite().nonnegative().max(100000, "Valor acima do limite permitido.");

// "identifier" aceita usuário admin OU e-mail/telefone do cliente — a rota
// de login decide qual coluna bate.
const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

const registerCustomerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  phone: z.string().trim().min(1, "Telefone inválido — use DDD + número.").max(30)
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido — use DDD + número."),
  password: z.string().min(6, "A senha precisa de pelo menos 6 caracteres."),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: money,
  cost: money,
  stock: z.number().int().nonnegative().max(100000),
  description: z.string().trim().max(2000).optional().default(""),
  allergens: z.string().trim().max(500).optional().default(""),
  shelfLife: z.string().trim().max(60).optional().default(""),
  image: z.string().trim().max(400000, "Imagem grande demais.").optional().nullable(),
}).refine((p) => p.cost <= p.price, {
  message: "O custo não pode ser maior que o preço de venda.",
  path: ["cost"],
});

const promotionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive(),
  productId: z.string().trim().min(1).nullable().optional().default(null),
  startDate: isoDate,
  endDate: isoDate,
}).refine((p) => p.endDate >= p.startDate, {
  message: "A data final não pode ser anterior à inicial.",
  path: ["endDate"],
}).refine((p) => p.type !== "percent" || p.value <= 90, {
  message: "Desconto máximo permitido: 90%.",
  path: ["value"],
});

const saleItemSchema = z.object({
  productId: z.string().trim().min(1),
  qty: z.number().int().positive().max(1000),
});

const saleSchema = z.object({
  channel: z.enum(["balcao", "delivery", "encomenda"]),
  payment: z.enum(["Pix", "Cartão", "Dinheiro"]),
  items: z.array(saleItemSchema).min(1, "Inclua ao menos um item na venda."),
  customerName: z.string().trim().max(120).optional().default(""),
  customerPhone: z.string().trim().max(30).optional().default(""),
  customerAddress: z.string().trim().max(240).optional().default(""),
  deliveryFee: money.optional().default(0),
  deliveryDate: isoDate.optional().nullable(),
}).superRefine((s, ctx) => {
  if (s.channel === "delivery") {
    if (!s.customerName) ctx.addIssue({ code: "custom", message: "Informe o cliente do delivery.", path: ["customerName"] });
    if (!s.customerAddress) ctx.addIssue({ code: "custom", message: "Informe o endereço de entrega.", path: ["customerAddress"] });
  }
  if (s.channel === "encomenda") {
    if (!s.customerName) ctx.addIssue({ code: "custom", message: "Informe o cliente da encomenda.", path: ["customerName"] });
    if (!s.deliveryDate) ctx.addIssue({ code: "custom", message: "Informe a data de entrega da encomenda.", path: ["deliveryDate"] });
  }
});

const deliveryFeeUpdateSchema = z.object({
  deliveryFee: money,
});

const trackQuerySchema = z.object({
  phone: z.string().trim().refine((v) => v.replace(/\D/g, "").length >= 8, "Telefone incompleto."),
});

function validate(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const err = new Error("Dados inválidos.");
    err.status = 422;
    err.details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw err;
  }
  return result.data;
}

module.exports = {
  loginSchema,
  registerCustomerSchema,
  productSchema,
  promotionSchema,
  saleSchema,
  deliveryFeeUpdateSchema,
  trackQuerySchema,
  validate,
};
