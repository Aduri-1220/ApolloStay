const fs = require("node:fs");
const { Pool } = require("pg");
const { databaseUrl } = require("./config");

let pool = null;

function isPostgresEnabled() {
  return Boolean(databaseUrl);
}

function getPool() {
  if (!isPostgresEnabled()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  await query(sql);
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  isPostgresEnabled,
  getPool,
  query,
  runSqlFile,
  closePool
};
