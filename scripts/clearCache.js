// Script to clear Redis cache
// Run with: node scripts/clearCache.js

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

async function clearCache() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log('❌ REDIS_URL not found in .env');
        process.exit(1);
    }

    console.log('Connecting to Redis...');
    const redis = new Redis(redisUrl);

    try {
        // Get all keys
        const keys = await redis.keys('*');
        console.log(`Found ${keys.length} keys in cache`);

        if (keys.length > 0) {
            // Delete all keys
            await redis.flushdb();
            console.log('✅ Cache cleared successfully');
        } else {
            console.log('Cache is already empty');
        }

        // Verify
        const remaining = await redis.keys('*');
        console.log(`Remaining keys: ${remaining.length}`);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        redis.disconnect();
        console.log('Disconnected from Redis');
    }
}

clearCache();
