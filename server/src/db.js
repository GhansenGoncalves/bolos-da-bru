"use strict";

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cliente')),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  description TEXT NOT NULL DEFAULT '',
  allergens TEXT NOT NULL DEFAULT '',
  shelf_life TEXT,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value DOUBLE PRECISION NOT NULL CHECK (value > 0),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (type <> 'percent' OR value <= 90)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  time TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('balcao', 'delivery', 'encomenda')),
  payment TEXT NOT NULL CHECK (payment IN ('Pix', 'Cartão', 'Dinheiro')),
  status TEXT NOT NULL CHECK (status IN ('pendente', 'ok', 'cancelled')),
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_informed BOOLEAN NOT NULL DEFAULT false,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  delivery_date TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- product_id não referencia products(id) de propósito: excluir um produto não
-- pode falhar nem apagar o histórico de vendas (cada item já guarda seu
-- próprio nome/preço/custo no momento da venda).
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  qty INTEGER NOT NULL CHECK (qty > 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  promo_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(channel);
CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON sales(customer_phone);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_promotions_product ON promotions(product_id);
`;

async function runMigrations(pool) {
  await pool.query(SCHEMA);
}

async function ensureAdminUser(pool, { username, password, name }) {
  if (!username || !password) return;
  const { rows: admins } = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admins.length) return;

  const { rows: taken } = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
  if (taken.length) return;

  await pool.query(
    `INSERT INTO users (id, username, password_hash, role, name) VALUES ($1, $2, $3, 'admin', $4)`,
    [randomUUID(), username, bcrypt.hashSync(password, 12), name || "Administradora"]
  );
}

module.exports = { runMigrations, ensureAdminUser };
