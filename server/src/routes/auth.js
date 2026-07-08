"use strict";

const express = require("express");
const { randomUUID } = require("node:crypto");
const { hashPassword, verifyPassword, signToken } = require("../auth");
const { loginSchema, registerCustomerSchema, validate } = require("../validation");

function authRoutes({ db, jwtSecret, jwtExpiresIn }) {
  const router = express.Router();

  router.post("/login", (req, res) => {
    const { username, password } = validate(loginSchema, req.body);
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    // Mesma mensagem para usuário inexistente ou senha errada: não revela
    // se o usuário existe.
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }
    const token = signToken(user, jwtSecret, jwtExpiresIn);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, name: user.name },
    });
  });

  // Autocadastro de clientes para a Loja. Nunca permite criar admin por aqui.
  router.post("/register", (req, res) => {
    const data = validate(registerCustomerSchema, req.body);
    const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(data.username);
    if (exists) {
      return res.status(409).json({ error: "Este nome de usuário já está em uso." });
    }
    const user = {
      id: randomUUID(),
      username: data.username,
      password_hash: hashPassword(data.password),
      role: "cliente",
      name: data.name,
      phone: data.phone,
      address: data.address,
    };
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, name, phone, address)
       VALUES (@id, @username, @password_hash, @role, @name, @phone, @address)`
    ).run(user);
    const token = signToken(user, jwtSecret, jwtExpiresIn);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, role: user.role, name: user.name },
    });
  });

  return router;
}

module.exports = authRoutes;
