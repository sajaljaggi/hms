const Redis = require('ioredis');

// Caching is a performance optimization, not a hard dependency — the app
// must keep working (just slower) if Redis is unreachable. maxRetriesPerRequest
// makes individual commands fail fast instead of hanging, and
// enableOfflineQueue: false stops commands from queueing up indefinitely
// while disconnected. ioredis still retries the connection itself in the
// background with its default backoff, so it reconnects automatically once
// Redis comes back.
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0, // tests use a separate DB index so they never touch dev/prod cache entries
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: false,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('⚠️  Redis error:', err.message));

module.exports = redis;
