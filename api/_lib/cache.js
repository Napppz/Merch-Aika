// Simple in-memory cache utility for products and reviews
// In production, use Redis or similar instead

const cache = {};

/**
 * Get cached data
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/not found
 */
function getCache(key) {
  const item = cache[key];
  
  if (!item) {
    return null;
  }
  
  // Check if expired
  if (item.expiry && Date.now() > item.expiry) {
    delete cache[key];
    return null;
  }
  
  return item.value;
}

/**
 * Set cache data
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (default: 3600 = 1 hour)
 */
function setCache(key, value, ttl = 3600) {
  cache[key] = {
    value: value,
    expiry: Date.now() + (ttl * 1000)
  };
}

/**
 * Invalidate cache with wildcard pattern
 * @param {string} pattern - Pattern like 'products_*' to match keys
 */
function invalidateCache(pattern) {
  if (pattern.endsWith('*')) {
    // Wildcard invalidation
    const prefix = pattern.slice(0, -1);
    Object.keys(cache).forEach(key => {
      if (key.startsWith(prefix)) {
        delete cache[key];
      }
    });
  } else {
    // Direct key invalidation
    delete cache[key];
  }
}

/**
 * Clear all cache
 */
function clearAllCache() {
  Object.keys(cache).forEach(key => {
    delete cache[key];
  });
}

module.exports = {
  getCache,
  setCache,
  invalidateCache,
  clearAllCache
};
