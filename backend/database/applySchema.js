const fs = require('fs');
const path = require('path');

// Applied in order: base schema, then incremental migrations layered on top.
// All of it is written with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so
// re-running this against an already-migrated database is a safe no-op.
const SQL_FILES = [
  'schema.sql',
  'migration_ratings.sql',
  'migration_slots.sql',
  'migration_doctor_image.sql',
];

function stripDatabaseStatements(sql) {
  // The connection is already scoped to the target database via `database:`
  // in the connection config, so any `CREATE DATABASE hms_db` / `USE hms_db`
  // in these files (written assuming the real dev DB name) must not run.
  return sql
    .split('\n')
    .filter((line) => !/^\s*CREATE DATABASE/i.test(line) && !/^\s*USE\s/i.test(line))
    .join('\n');
}

// `conn` must already be connected with `database` set and
// `multipleStatements: true`.
async function applySchema(conn) {
  for (const file of SQL_FILES) {
    const raw = fs.readFileSync(path.join(__dirname, file), 'utf8');
    await conn.query(stripDatabaseStatements(raw));
  }
}

module.exports = { applySchema, SQL_FILES };
