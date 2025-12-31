import Redis from 'ioredis';

class CacheService {
    constructor() {
        this.DEFAULT_TTL = 3600; // 1 hour in seconds
        this.client = null;
        this.isConnected = false;
    }

    async connect() {
        // Use REDIS_URL from environment or default to localhost
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        console.log('Connecting to Redis...');

        this.client = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => {
                // Only retry 3 times during initial connection, then give up
                if (times > 3) {
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 1000);
            },
            enableReadyCheck: true,
            lazyConnect: true // Don't connect immediately, wait for explicit connect
        });

        // Handle connection events
        this.client.on('connect', () => {
            console.log('Redis connected successfully');
            this.isConnected = true;
        });

        this.client.on('error', (err) => {
            // Only log once, not for every retry
            if (this.isConnected) {
                console.error('Redis error:', err.message);
            }
            this.isConnected = false;
        });

        this.client.on('close', () => {
            this.isConnected = false;
        });

        // Try to connect
        try {
            await this.client.connect();
            await this.client.ping();
            this.isConnected = true;
            console.log('Cache: Redis, TTL=1h');
        } catch (error) {
            console.warn('Redis not available, cache disabled:', error.message);
            this.isConnected = false;
            // Disconnect to stop retry attempts
            try {
                this.client.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
    }

    async get(key) {
        if (!this.isConnected || !this.client) return null;

        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Cache GET error:', error.message);
            return null;
        }
    }

    async set(key, value, ttl = null) {
        if (!this.isConnected || !this.client) return false;

        try {
            const finalTTL = ttl !== null ? ttl : this.DEFAULT_TTL;
            // Redis SET with EX for expiration in seconds
            await this.client.set(key, JSON.stringify(value), 'EX', finalTTL);
            return true;
        } catch (error) {
            console.error('Cache SET error:', error.message);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected || !this.client) return false;

        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Cache DEL error:', error.message);
            return false;
        }
    }

    // Get cache performance statistics
    async getStats() {
        if (!this.isConnected || !this.client) {
            return { keys: 0, connected: false };
        }

        try {
            const info = await this.client.info('stats');
            const dbSize = await this.client.dbsize();

            // Parse Redis INFO output
            const stats = {};
            info.split('\r\n').forEach(line => {
                const [key, value] = line.split(':');
                if (key && value) {
                    stats[key] = value;
                }
            });

            return {
                keys: dbSize,
                hits: parseInt(stats.keyspace_hits) || 0,
                misses: parseInt(stats.keyspace_misses) || 0,
                connected: true
            };
        } catch (error) {
            console.error('Error getting cache stats:', error.message);
            return { keys: 0, connected: false };
        }
    }

    async disconnect() {
        if (!this.client) return;

        try {
            await this.client.quit();
            this.isConnected = false;
            console.log('Redis disconnected');
        } catch (error) {
            console.error('Error disconnecting from Redis:', error.message);
        }
    }
}

export default new CacheService();
