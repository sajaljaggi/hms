/**
 * Idempotent, non-destructive schema setup for the real dev/prod database —
 * creates it if missing, then applies schema.sql + migrations (safe to
 * re-run any number of times). Used by `docker-compose up` so a fresh
 * MySQL container gets a working schema automatically, and can also be run
 * by hand for local (non-Docker) setup instead of importing schema.sql
 * through phpMyAdmin/mysql CLI.
 *
 * Usage: node database/migrate.js   (reads backend/.env)
 */
const path = require('path');
const mysql = require('mysql2/promise');
const { applySchema, SQL_FILES } = require('./applySchema');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const useSSL = process.env.DB_SSL === 'true';
let sslOption = {};
if (useSSL) {
  sslOption = process.env.DB_CA_CERT
    ? { ssl: { ca: process.env.DB_CA_CERT, rejectUnauthorized: true } }
    : { ssl: { rejectUnauthorized: false } }; // see config/db.js for why
}

async function migrate() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const port = DB_PORT ? parseInt(DB_PORT, 10) : undefined;

  // Managed hosts (Railway, PlanetScale, RDS, ...) typically pre-provision
  // the database and may not grant CREATE DATABASE to the app user — that's
  // fine, DB_NAME already exists there, so tolerate the failure and move on.
  try {
    const rootConn = await mysql.createConnection({ host: DB_HOST, port, user: DB_USER, password: DB_PASSWORD, ...sslOption });
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await rootConn.end();
  } catch (err) {
    console.warn(`⚠️  Could not run CREATE DATABASE IF NOT EXISTS (${err.message}) — assuming "${DB_NAME}" already exists.`);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
    ...sslOption,
  });

  await applySchema(conn);
  await conn.end();

  console.log(`✅ Database "${DB_NAME}" is up to date (${SQL_FILES.join(', ')}).`);
}

module.exports = migrate;

if (require.main === module) {
  migrate().catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
}
