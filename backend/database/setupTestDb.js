/**
 * (Re)creates the integration-test database from schema.sql + migrations.
 * Only ever run against a database whose name contains "test" — this drops
 * and recreates the database, so pointing it at the real dev DB by mistake
 * would be destructive.
 *
 * Usage: node database/setupTestDb.js   (reads backend/.env.test)
 */
const path = require('path');
const mysql = require('mysql2/promise');
const { applySchema, SQL_FILES } = require('./applySchema');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test') });

async function setupTestDb() {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_NAME || !DB_NAME.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run: DB_NAME ("${DB_NAME}") doesn't look like a test database (expected it to contain "test"). ` +
      'This script drops and recreates the database — check backend/.env.test.'
    );
  }

  const rootConn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASSWORD });
  await rootConn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await rootConn.query(`CREATE DATABASE \`${DB_NAME}\``);
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

  console.log(`✅ Test database "${DB_NAME}" set up from ${SQL_FILES.join(', ')}.`);
}

module.exports = setupTestDb;

if (require.main === module) {
  setupTestDb().catch((err) => {
    console.error('❌ Test DB setup failed:', err.message);
    process.exit(1);
  });
}
