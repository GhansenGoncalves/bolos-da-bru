"use strict";

const { Pool } = require("pg");

function createPool(connectionString) {
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || "");
  return new Pool({
    connectionString,
    // Render (e a maioria dos Postgres gerenciados) exige TLS, mas usa
    // certificado que o Node não valida por padrão. Localmente não há TLS.
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createPool, withTransaction };
