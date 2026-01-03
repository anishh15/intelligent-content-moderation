import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redisCache from '../config/redis.js';

// Create rate limiter with optional Redis store
function createLimiter(options) {
    const config = {
        windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
        max: options.max || 100,
        message: {
            error: 'Too many requests',
            message: options.message || 'Please try again later',
            retryAfter: Math.ceil(options.windowMs / 1000 / 60) + ' minutes'
        },
        standardHeaders: true, // Return rate limit info in headers
        legacyHeaders: false,
        // Disable validations that cause issues behind reverse proxies like Render
        validate: {
            xForwardedForHeader: false,
            trustProxy: false, // Disable trust proxy validation for Render
        }
    };

    // Use Redis store if connected (for distributed rate limiting)
    if (redisCache.isConnected && redisCache.client) {
        config.store = new RedisStore({
            sendCommand: (...args) => redisCache.client.call(...args),
            prefix: `rl:${options.prefix || 'general'}:`
        });
    }

    return rateLimit(config);
}

// General API rate limit: 100 requests per 15 minutes
export const generalLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    prefix: 'general',
    message: 'Too many requests from this IP, please try again later'
});

// Moderation endpoints: 20 requests per minute (AI API is expensive)
export const moderationLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 20,
    prefix: 'moderation',
    message: 'Moderation rate limit exceeded. Please wait before submitting more content.'
});

// Auth endpoints: 5 requests per 15 minutes (brute force protection)
export const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    prefix: 'auth',
    message: 'Too many login attempts. Please try again in 15 minutes.'
});

// Strict limiter for sensitive operations: 3 requests per hour
export const strictLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    prefix: 'strict',
    message: 'Rate limit for sensitive operations exceeded.'
});
