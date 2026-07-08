"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  description TEXT DEFAULT '',
  allergens TEXT DEFAULT '',
  shelf_life_days INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'value')),
  value REAL NOT NULL CHECK (value > 0),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_date >= start_date),
  CHECK (type != 'percent' OR value <= 100)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  time TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('balcao', 'delivery', 'encomenda')),
  payment TEXT NOT NULL CHECK (payment IN ('Pix', 'Cartão', 'Dinheiro')),
  status TEXT NOT NULL CHECK (status IN ('pendente', 'ok', 'cancelled')),
  paid INTEGER NOT NULL DEFAULT 0,
  payment_informed INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  delivery_date TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  qty INTEGER NOT NULL CHECK (qty > 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  promo_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(channel);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_promotions_product ON promotions(product_id);
`;

function openDatabase(filePath) {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

function ensureAdminUser(db, { username, password, name }) {
  if (!username || !password) return;
  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get();
  if (existingAdmin) return;

  const existingUsername = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (existingUsername) return;

  const { randomUUID } = require("node:crypto");
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, name)
     VALUES (?, ?, ?, 'admin', ?)`
  ).run(randomUUID(), username, bcrypt.hashSync(password, 12), name || "Administradora");
}

module.exports = { openDatabase, ensureAdminUser };
