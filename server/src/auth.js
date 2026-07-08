"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user, secret, expiresIn) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, username: user.username },
    secret,
    { expiresIn }
  );
}

/* Exige um token Bearer válido. Não confia em nenhum dado de papel/identidade
   enviado pelo cliente fora do token assinado pelo servidor. */
function requireAuth(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Autenticação necessária." });
    }
    try {
      req.user = jwt.verify(token, secret);
      next();
    } catch {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissão para esta ação." });
    }
    next();
  };
}

/* Preenche req.user quando há um token Bearer válido, mas nunca bloqueia a
   requisição — usado em rotas públicas cujo conteúdo muda para admins
   (ex.: catálogo mostrando o custo) ou que aceitam acesso anônimo (Loja). */
function optionalAuth(secret) {
  return (req, _res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme === "Bearer" && token) {
      try {
        req.user = jwt.verify(token, secret);
      } catch {
        /* token inválido: segue anônimo */
      }
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireRole,
  optionalAuth,
};
