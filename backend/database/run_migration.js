// One-time migration script — run with: node database/run_migration.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'migration_ratings.sql'), 'utf8');
  // Remove "USE hms_db;" since we already connect to the DB
  const cleanSql = sql.replace(/USE\s+hms_db;\s*/i, '');

  try {
    await conn.query(cleanSql);
    console.log('✅ Migration completed successfully!');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Columns already exist — migration already applied.');
    } else {
      console.error('❌ Migration failed:', err.message);
    }
  } finally {
    await conn.end();
  }
})();
