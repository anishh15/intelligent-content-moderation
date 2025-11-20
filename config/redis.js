import NodeCache from 'node-cache';

class CacheService {
    constructor() {
        this.DEFAULT_TTL = 3600; // 1 hour in seconds
        this.CLEANUP_INTERVAL = 600; // Check for expired keys every 10 minutes
        
        this.cache = new NodeCache({
            stdTTL: this.DEFAULT_TTL,
            checkperiod: this.CLEANUP_INTERVAL,
            useClones: false // Skip cloning for better performance
        });
        this.isConnected = false;
        this.client = null; // For compatibility with existing code
    }

    async connect() {
        console.log('Initializing local cache...');
        this.isConnected = true;
        console.log('Local cache ready (node-cache)');
        console.log('Cache: In-memory storage, TTL=1h');
        return Promise.resolve();
    }

    async get(key) {
        if (!this.isConnected) return null;
        try {
            const value = this.cache.get(key);
            return value !== undefined ? value : null;
        } catch (error) {
            console.error('Cache GET error:', error);
            return null;
        }
    }

    async set(key, value, ttl = null) {
        if (!this.isConnected) return false;
        try {
            // Use provided TTL or fall back to default
            const finalTTL = ttl !== null ? ttl : this.DEFAULT_TTL;
            this.cache.set(key, value, finalTTL);
            return true;
        } catch (error) {
            console.error('Cache SET error:', error);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected) return false;
        try {
            this.cache.del(key);
            return true;
        } catch (error) {
            console.error('Cache DEL error:', error);
            return false;
        }
    }

    // Get cache performance statistics
    getStats() {
        return this.cache.getStats();
    }

    async disconnect() {
        if (!this.isConnected) return;
        try {
            this.cache.flushAll(); // Clear all cached entries
            this.isConnected = false;
            console.log('Local cache closed');
        } catch (error) {
            console.error('Error closing cache:', error);
        }
        return Promise.resolve();
    }
}

export default new CacheService();
