const fs = require('fs');
const path = require('path');

// Applied in order: base schema, then incremental migrations layered on top.
const SQL_FILES = [
  'schema.sql',
  'migration_ratings.sql',
  'migration_slots.sql',
  'migration_doctor_image.sql',
];

// MySQL error codes that mean "this exact change already happened" — safe
// to ignore when re-applying schema/migrations idempotently.
const IGNORABLE_CODES = new Set([
  'ER_DUP_FIELDNAME',       // column already exists
  'ER_TABLE_EXISTS_ERROR',  // table already exists
  'ER_DUP_KEYNAME',         // index/key already exists
]);

// Drops `CREATE DATABASE hms_db` / `USE hms_db` lines (the connection is
// already scoped to the target database) and `-- ...` comment lines. Comments
// must go before splitting on `;` below — one of them contains a literal
// semicolon ("SET GLOBAL event_scheduler = ON;"), which would otherwise be
// mistaken for a statement terminator and produce a bogus fragment.
function stripNonStatementLines(sql) {
  return sql
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('--') && !/^CREATE DATABASE/i.test(trimmed) && !/^USE\s/i.test(trimmed);
    })
    .join('\n');
}

function splitStatements(sql) {
  return sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
}

// `ADD COLUMN IF NOT EXISTS` needs MySQL 8.0.29+ — Aiven's free tier is on
// an older point release and rejects it as a *syntax* error, not a runtime
// one, so catching ER_DUP_FIELDNAME alone isn't enough; the clause has to
// not be sent at all. Drop "IF NOT EXISTS" after ADD COLUMN specifically —
// CREATE TABLE IF NOT EXISTS elsewhere in these files is unaffected (that
// form has been supported since MySQL 4.1) and is left alone.
function stripUnsupportedIfNotExists(sql) {
  return sql.replace(/ADD COLUMN IF NOT EXISTS/gi, 'ADD COLUMN');
}

// `conn` must already be connected with `database` set.
//
// Idempotency here is this script's responsibility, not the SQL's: plain
// `ADD COLUMN` on a column that already exists throws ER_DUP_FIELDNAME,
// which is caught and ignored below, same effect as IF NOT EXISTS without
// needing the MySQL version that supports it.
async function applySchema(conn) {
  for (const file of SQL_FILES) {
    const raw = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const statements = splitStatements(stripNonStatementLines(stripUnsupportedIfNotExists(raw)));
    for (const statement of statements) {
      try {
        await conn.query(statement);
      } catch (err) {
        if (!IGNORABLE_CODES.has(err.code)) throw err;
      }
    }
  }
}

module.exports = { applySchema, SQL_FILES };
