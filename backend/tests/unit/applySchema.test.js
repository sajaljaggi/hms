const { applySchema, SQL_FILES } = require('../../database/applySchema');

// Regression test for a real deploy failure: Aiven's MySQL version doesn't
// support `ADD COLUMN IF NOT EXISTS` (needs 8.0.29+) and rejected it as a
// syntax error, and a naive split-on-`;` broke on a comment line containing
// a literal semicolon ("SET GLOBAL event_scheduler = ON;"), producing a
// bogus statement fragment sent to MySQL.
describe('applySchema (SQL file parsing/execution)', () => {
  function mockConn(onQuery = () => {}) {
    const statements = [];
    return {
      statements,
      query: jest.fn(async (sql) => {
        statements.push(sql);
        await onQuery(sql, statements.length - 1);
      }),
    };
  }

  test('applies all 4 SQL files without error against a healthy connection', async () => {
    const conn = mockConn();
    await applySchema(conn);
    expect(conn.query).toHaveBeenCalled();
    expect(conn.statements.length).toBeGreaterThan(0);
  });

  test('no statement sent to MySQL uses ADD COLUMN IF NOT EXISTS (unsupported on some MySQL versions)', async () => {
    const conn = mockConn();
    await applySchema(conn);
    for (const statement of conn.statements) {
      expect(statement).not.toMatch(/ADD COLUMN\s+IF NOT EXISTS/i);
    }
  });

  test('no statement is empty or pure comment (a stale bug produced fragments like this)', async () => {
    const conn = mockConn();
    await applySchema(conn);
    for (const statement of conn.statements) {
      const hasRealContent = statement
        .split('\n')
        .some((line) => line.trim() !== '' && !line.trim().startsWith('--'));
      expect(hasRealContent).toBe(true);
    }
  });

  test('no statement contains a stray CREATE DATABASE or USE (connection is already scoped to the target DB)', async () => {
    const conn = mockConn();
    await applySchema(conn);
    for (const statement of conn.statements) {
      expect(statement).not.toMatch(/^\s*CREATE DATABASE/i);
      expect(statement).not.toMatch(/^\s*USE\s/i);
    }
  });

  test('ER_DUP_FIELDNAME (column already exists) is swallowed, not thrown', async () => {
    const conn = mockConn((sql) => {
      if (/ADD COLUMN rating\b/i.test(sql)) {
        const err = new Error("Duplicate column name 'rating'");
        err.code = 'ER_DUP_FIELDNAME';
        throw err;
      }
    });
    await expect(applySchema(conn)).resolves.toBeUndefined();
  });

  test('a real, non-ignorable error still propagates', async () => {
    const conn = mockConn((sql) => {
      if (/CREATE TABLE IF NOT EXISTS users/i.test(sql)) {
        const err = new Error('Access denied for user');
        err.code = 'ER_ACCESS_DENIED_ERROR';
        throw err;
      }
    });
    await expect(applySchema(conn)).rejects.toThrow('Access denied');
  });

  test('SQL_FILES lists schema.sql first (tables must exist before migrations ALTER them)', () => {
    expect(SQL_FILES[0]).toBe('schema.sql');
  });
});
