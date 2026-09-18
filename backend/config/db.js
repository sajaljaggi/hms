const mysql = require('mysql2');
require('dotenv').config();

// Managed MySQL hosts (PlanetScale, Railway, AWS RDS, ...) require TLS and
// reject plain connections — set DB_SSL=true for those. Not needed for a
// local MySQL instance (XAMPP/MAMP/Homebrew), which is why it defaults off.
const useSSL = process.env.DB_SSL === 'true';

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
  ...(useSSL && { ssl: { rejectUnauthorized: true } }),
});

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
