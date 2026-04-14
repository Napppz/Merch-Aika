// api/_lib/cache.js — In-Memory Caching System
// Reduces database transfer by caching frequently accessed data

/**
 * Simple in-memory cache with TTL (Time To Live)
 * Reduces network transfer from database significantly
 * 
 * Usage:
 *   const { setCache, getCache, invalidateCache, cacheStats } = require('./_lib/cache');
 *   
 *   // Cache response for 1 hour
 *   const cached = getCache('products_all');
 *   if (cached) return res.json(cached);
 *   
 *   const data = await db.query(...);
 *   setCache('products_all', data, 3600); // 3600 seconds = 1 hour
 */

const cache = {};
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0
};

/**
 * Set cache with TTL
 * @param {String} key - Cache key (e.g., 'products_all', 'reviews_product_123')
 * @param {*} data - Data to cache
 * @param {Number} ttlSeconds - Time to live in seconds (default: 300 = 5 min)
 */
function setCache(key, data, ttlSeconds = 300) {
  if (!key || data === undefined) {
    console.warn('[CACHE] Invalid setCache call - key or data missing');
    return;
  }

  cache[key] = {
    data: data,
    expiry: Date.now() + (ttlSeconds * 1000),
    size: JSON.stringify(data).length,
    createdAt: Date.now()
  };

  stats.sets++;
  
  const sizeMB = (cache[key].size / 1024 / 1024).toFixed(2);
  const ttlMin = (ttlSeconds / 60).toFixed(1);
  console.log(`[CACHE] SET: ${key} (${sizeMB}MB, TTL: ${ttlMin}min)`);
}

/**
 * Get from cache (returns null if not found or expired)
 * @param {String} key - Cache key
 * @returns {*} Cached data or null
 */
function getCache(key) {
  const item = cache[key];
  
  if (!item) {
    stats.misses++;
    return null;
  }

  // Check expiry
  if (Date.now() > item.expiry) {
    delete cache[key]; // Clean up expired
    stats.misses++;
    console.log(`[CACHE] EXPIRED: ${key}`);
    return null;
  }

  // Cache hit!
  stats.hits++;
  const ageSec = Math.floor((Date.now() - item.createdAt) / 1000);
  console.log(`[CACHE] HIT: ${key} (age: ${ageSec}s)`);
  return item.data;
}

/**
 * Invalidate cache by pattern matching
 * @param {String} pattern - Pattern to match (e.g., 'products_*', 'reviews_product_123')
 */
function invalidateCache(pattern) {
  const keysToDelete = Object.keys(cache).filter(key => {
    // Simple pattern matching: 'products_*' matches 'products_all', 'products_123', etc
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      return regex.test(key);
    }
    return key === pattern;
  });

  keysToDelete.forEach(key => {
    delete cache[key];
    stats.invalidations++;
    console.log(`[CACHE] INVALIDATED: ${key}`);
  });

  return keysToDelete.length;
}

/**
 * Clear all cache
 */
function clearAllCache() {
  const count = Object.keys(cache).length;
  Object.keys(cache).forEach(key => delete cache[key]);
  stats.invalidations += count;
  console.log(`[CACHE] CLEARED ALL (${count} entries)`);
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats (hits, misses, hit rate, etc)
 */
function cacheStats() {
  const total = stats.hits + stats.misses;
  const hitRate = total === 0 ? 0 : ((stats.hits / total) * 100).toFixed(1);
  
  const totalSize = Object.values(cache).reduce((sum, item) => sum + (item.size || 0), 0);
  const sizeMB = (totalSize / 1024 / 1024).toFixed(2);

  return {
    entries: Object.keys(cache).length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${hitRate}%`,
    sets: stats.sets,
    invalidations: stats.invalidations,
    totalSizeMB: sizeMB,
    cacheDetails: Object.entries(cache).map(([key, item]) => ({
      key,
      sizeMB: (item.size / 1024 / 1024).toFixed(3),
      ageSec: Math.floor((Date.now() - item.createdAt) / 1000),
      ttlRemainingSec: Math.floor((item.expiry - Date.now()) / 1000)
    }))
  };
}

/**
 * Get cache entry details (for debugging)
 */
function getCacheEntry(key) {
  const item = cache[key];
  if (!item) return null;

  return {
    key,
    size: item.size,
    sizeMB: (item.size / 1024 / 1024).toFixed(3),
    createdAt: new Date(item.createdAt),
    expiry: new Date(item.expiry),
    ageSec: Math.floor((Date.now() - item.createdAt) / 1000),
    ttlRemainingSec: Math.floor((item.expiry - Date.now()) / 1000),
    isExpired: Date.now() > item.expiry
  };
}

module.exports = {
  setCache,
  getCache,
  invalidateCache,
  clearAllCache,
  cacheStats,
  getCacheEntry
};
