/**
 * Simple in-memory cache utility
 * For production, consider using Redis or similar
 */

class SimpleCache {
  constructor(defaultTTL = 60000) { // 1 minute default
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// Create singleton instances for different cache types
export const tokenCache = new SimpleCache(300000); // 5 minutes for tokens
export const zohoCache = new SimpleCache(60000); // 1 minute for Zoho data

// Cleanup expired entries every 5 minutes
setInterval(() => {
  tokenCache.cleanup();
  zohoCache.cleanup();
}, 300000);

