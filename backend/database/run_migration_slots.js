// Run with: node database/run_migration_slots.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'migration_slots.sql'), 'utf8');
  const cleanSql = sql
    .replace(/USE\s+hms_db;\s*/i, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .trim();

  try {
    await conn.query(cleanSql);
    console.log('✅ Slots migration completed successfully!');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  is_available column already exists — migration already applied.');
    } else {
      console.error('❌ Migration failed:', err.message);
    }
  } finally {
    await conn.end();
  }
})();
