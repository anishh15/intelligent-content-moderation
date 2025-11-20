import crypto from 'crypto';
import redisCache from '../config/redis.js';

// Size of buffer sample to use for image hash generation
const BUFFER_SAMPLE_SIZE = 1024; // First 1KB of file

// Generate unique cache key based on request content
function generateCacheKey(req) {
    const { text } = req.body;
    const file = req.file;

    // Text-only moderation requests
    if (text && !file) {
        const hash = crypto.createHash('md5').update(text).digest('hex');
        return `text:${hash}`;
    }

    // Image-only moderation requests
    // WARNING: Uses metadata + first 1KB only for performance
    // Images with identical metadata and similar headers may collide
    if (file && !text) {
        const metadata = `${file.originalname}:${file.size}:${file.mimetype}`;
        const bufferSample = file.buffer.slice(0, BUFFER_SAMPLE_SIZE);
        const hash = crypto.createHash('md5')
            .update(metadata)
            .update(bufferSample)
            .digest('hex');
        return `image:${hash}`;
    }

    // Multimodal (text + image) requests
    if (text && file) {
        const metadata = `${file.originalname}:${file.size}`;
        const bufferSample = file.buffer.slice(0, BUFFER_SAMPLE_SIZE);
        const hash = crypto.createHash('md5')
            .update(text)
            .update(metadata)
            .update(bufferSample)
            .digest('hex');
        return `multimodal:${hash}`;
    }

    return null;
}

// Middleware to cache moderation results
export function cacheMiddleware(options = {}) {
    const { ttl = redisCache.DEFAULT_TTL } = options; // Use default TTL from cache service

    return async (req, res, next) => {
        // Skip if cache is unavailable
        if (!redisCache.isConnected) {
            return next();
        }

        try {
            const cacheKey = generateCacheKey(req);
            
            if (!cacheKey) {
                return next();
            }

            // Check if result exists in cache
            const cachedResult = await redisCache.get(cacheKey);
            
            if (cachedResult) {
                console.log(`Cache HIT: ${cacheKey}`);
                return res.json({
                    ...cachedResult,
                    cached: true,
                    cacheTimestamp: new Date().toISOString()
                });
            }

            console.log(`Cache MISS: ${cacheKey}`);
            
            // Intercept res.json to cache the response
            const originalJson = res.json.bind(res);
            
            res.json = (body) => {
                // Store response in cache (exclude metadata fields)
                const { cached, cacheTimestamp, ...dataToCache } = body;
                
                redisCache.set(cacheKey, dataToCache, ttl)
                    .catch(err => {
                        console.error('Failed to cache response:', err.message);
                    });
                
                // Send response to client
                return originalJson(body);
            };

            next();
        } catch (error) {
            console.error('Cache middleware error:', error);
            next(); // Continue even if caching fails
        }
    };
}
