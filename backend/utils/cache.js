const redis = require('../config/redis');

const DEFAULT_TTL_SECONDS = 120; // slot state changes on every booking, so a
                                  // short TTL bounds how stale a missed
                                  // invalidation can leave a response.

async function getCache(key) {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`⚠️  Cache read failed for "${key}":`, err.message);
    return null; // fail open — caller falls back to querying the DB
  }
}

async function setCache(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.error(`⚠️  Cache write failed for "${key}":`, err.message);
  }
}

async function invalidateCache(key) {
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`⚠️  Cache invalidation failed for "${key}":`, err.message);
  }
}

// Only used for the rare "regenerate slots for every doctor on this date"
// admin action, where there's no single doctorId to key off of. SCAN (not
// KEYS) so it doesn't block Redis on a large keyspace.
async function invalidateByPattern(pattern) {
  try {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keysToDelete = [];
    for await (const keys of stream) {
      keysToDelete.push(...keys);
    }
    if (keysToDelete.length) await redis.del(...keysToDelete);
  } catch (err) {
    console.error(`⚠️  Cache pattern invalidation failed for "${pattern}":`, err.message);
  }
}

const availabilityKey = (doctorId, date) => `availability:${doctorId}:${date}`;
const availabilityKeyPattern = (date) => `availability:*:${date}`;

module.exports = {
  getCache,
  setCache,
  invalidateCache,
  invalidateByPattern,
  availabilityKey,
  availabilityKeyPattern,
  DEFAULT_TTL_SECONDS,
};
