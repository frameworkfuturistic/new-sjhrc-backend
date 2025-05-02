const NodeCache = require('node-cache');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutes default TTL
      checkperiod: 60, // Check for expired keys every 60 seconds
      useClones: false
    });

    this.cache.on('expired', (key, value) => {
      logger.info(`Cache key expired: ${key}`);
    });

    this.cache.on('flush', () => {
      logger.info('Cache flushed');
    });
  }

  get(key) {
    try {
      return this.cache.get(key);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  set(key, value, ttl = 300) {
    try {
      return this.cache.set(key, value, ttl);
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  del(key) {
    try {
      return this.cache.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  flush() {
    try {
      return this.cache.flushAll();
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  stats() {
    return this.cache.getStats();
  }

  keys() {
    return this.cache.keys();
  }
}

module.exports = new CacheManager();