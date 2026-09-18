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

async function migrate() {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  const rootConn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD });
  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await rootConn.end();

  const conn = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
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
