// Run: node database/run_migration_doctor_image.js
// Adds profile_image column to doctors table

const db = require('../config/db');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    // Check if column already exists
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doctors' AND COLUMN_NAME = 'profile_image'`
    );

    if (cols.length > 0) {
      console.log('ℹ️  profile_image column already exists — migration already applied.');
    } else {
      const sql = fs.readFileSync(path.join(__dirname, 'migration_doctor_image.sql'), 'utf8');
      await db.query(sql);
      console.log('✅ Migration applied: added profile_image column to doctors table.');
    }

    // Ensure uploads/doctors directory exists
    const uploadsDir = path.join(__dirname, '..', 'uploads', 'doctors');
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ uploads/doctors directory ready.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

run();
