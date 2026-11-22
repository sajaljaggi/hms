const mysql = require('mysql2');
require('dotenv').config();

// Managed MySQL hosts (Aiven, AWS RDS, ...) require TLS and reject plain
// connections — set DB_SSL=true for those. Not needed for a local MySQL
// instance (XAMPP/MAMP/Homebrew), which is why it defaults off.
//
// Aiven (and most managed hosts) sign their server cert with their own CA,
// not a publicly-trusted one — verifying the chain (rejectUnauthorized:
// true) needs that CA's cert, which you paste into DB_CA_CERT (the exact
// PEM text from the host's "CA certificate" field, e.g. Aiven's Overview
// tab). Without it, fall back to encrypting the connection without
// verifying the chain — still opaque to network eavesdroppers, just not
// protected against a MITM presenting a different cert. Good enough to not
// hard-block a deploy, but DB_CA_CERT is the correct fix.
const useSSL = process.env.DB_SSL === 'true';
let sslOption;
if (useSSL) {
  if (process.env.DB_CA_CERT) {
    sslOption = { ca: process.env.DB_CA_CERT, rejectUnauthorized: true };
  } else {
    console.warn('⚠️  DB_SSL=true but DB_CA_CERT is not set — encrypting the DB connection without verifying the server certificate.');
    sslOption = { rejectUnauthorized: false };
  }
}

// Create a connection pool for better performance and connection management
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined, // managed hosts (Railway, ...) often use a non-default port
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ...(useSSL && { ssl: sslOption }),
});

// The process runs with TZ=Asia/Kolkata and mysql2 reads DATETIME/TIMESTAMP as Node local time,
// so the session zone must match or NOW()/CURRENT_TIMESTAMP values come back 5.5 h off on a UTC server.
// The offset form needs no MySQL tz tables. Queued before any other query on the connection.
const DB_SESSION_TIME_ZONE = '+05:30';
// On failure, drop the connection rather than crash the process or serve queries with a wrong zone.
pool.on('connection', (conn) => conn.query(`SET time_zone = '${DB_SESSION_TIME_ZONE}'`, (err) => {
  if (err) {
    console.error('❌ Failed to set DB session time zone:', err.message);
    conn.destroy();
  }
}));

// Promisify the pool for async/await usage
const db = pool.promise();

// Test connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ MySQL connected successfully');
    connection.release();
  }
});

module.exports = db;
