"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { hashPassword, verifyPassword, signToken } = require("../auth");
const { loginSchema, registerCustomerSchema, validate } = require("../validation");
const { asyncHandler } = require("../asyncHandler");

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

function authRoutes({ pool, jwtSecret, jwtExpiresIn }) {
  const router = express.Router();

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { identifier, password } = validate(loginSchema, req.body);
      const idLower = identifier.trim().toLowerCase();
      const idDigits = onlyDigits(identifier);

      const { rows } = await pool.query(
        `SELECT * FROM users WHERE lower(username) = $1
           OR ($2 <> '' AND length($2) >= 8 AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $2)
         LIMIT 1`,
        [idLower, idDigits]
      );
      const user = rows[0];
      // Mesma mensagem para usuário inexistente ou senha errada: não revela
      // se a conta existe.
      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: "Usuário ou senha inválidos." });
      }
      const token = signToken(user, jwtSecret, jwtExpiresIn);
      res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role, name: user.name },
      });
    })
  );

  // Autocadastro de clientes para a Loja. Nunca permite criar admin por aqui.
  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const data = validate(registerCustomerSchema, req.body);
      const phoneDigits = onlyDigits(data.phone);

      const { rows: dupes } = await pool.query(
        `SELECT id FROM users
          WHERE lower(username) = $1
             OR regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $2`,
        [data.email, phoneDigits]
      );
      if (dupes.length) {
        return res.status(409).json({ error: "Já existe uma conta com esse e-mail ou telefone." });
      }

      const user = {
        id: randomUUID(),
        username: data.email,
        password_hash: hashPassword(data.password),
        role: "cliente",
        name: data.name,
        phone: data.phone,
        address: "",
      };
      await pool.query(
        `INSERT INTO users (id, username, password_hash, role, name, phone, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, user.username, user.password_hash, user.role, user.name, user.phone, user.address]
      );
      const token = signToken(user, jwtSecret, jwtExpiresIn);
      res.status(201).json({
        token,
        user: { id: user.id, username: user.username, role: user.role, name: user.name },
      });
    })
  );

  return router;
}

module.exports = authRoutes;
