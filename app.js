import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import textModerationService from './models/textModerationService.js';
import imageModerationService from './models/imageModerationService.js';
import multimodalModerationService from './models/multimodalModerationService.js';
import { upload } from './middleware/uploadMiddleware.js';
import database from './config/database.js';
import ModerationResult from './models/ModerationResult.js';
import redisCache from './config/redis.js';
import { cacheMiddleware } from './middleware/cacheMiddleware.js';
import { generalLimiter, moderationLimiter, authLimiter } from './middleware/rateLimitMiddleware.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true); // Enables correct IP detection behind proxies/load balancers

// Security and parsing middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined')); // HTTP request logger
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Root endpoint - API documentation
app.get('/', (req, res) => {
    res.json({
        message: 'Content Moderation System API',
        version: '2.0.0',
        status: 'running',
        endpoints: {
            health: 'GET /health',
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                profile: 'GET /api/auth/me'
            },
            moderation: {
                text: 'POST /api/moderate/text',
                image: 'POST /api/moderate/image',
                multimodal: 'POST /api/moderate/multimodal'
            },
            admin: {
                results: 'GET /api/admin/results (auth required)',
                review: 'POST /api/admin/review/:id (auth required)',
                stats: 'GET /api/admin/stats/overview (auth required)',
                activity: 'GET /api/admin/stats/activity (auth required)'
            }
        }
    });
});

// System health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            aiModels: textModerationService.isInitialized &&
                imageModerationService.isInitialized &&
                multimodalModerationService.isInitialized,
            database: database.isConnected,
            cache: redisCache.isConnected
        }
    });
});

// Cache performance metrics
app.get('/api/stats/cache', async (req, res) => {
    if (!redisCache.isConnected) {
        return res.json({
            status: 'disabled',
            message: 'Cache is not connected'
        });
    }

    try {
        const stats = await redisCache.getStats();
        res.json({
            status: 'active',
            type: 'redis',
            stats: {
                keys: stats.keys,
                hits: stats.hits,
                misses: stats.misses
            }
        });
    } catch (error) {
        console.error('Error fetching cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

// Moderate text content (rate limited)
app.post('/api/moderate/text', moderationLimiter, cacheMiddleware({ ttl: 3600 }), async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                error: 'Text is required and cannot be empty'
            });
        }

        if (text.length > 5000) {
            return res.status(400).json({
                error: 'Text exceeds maximum length of 5000 characters'
            });
        }

        const result = await textModerationService.moderateText(text);

        // Save moderation result to database
        const moderationRecord = new ModerationResult({
            type: 'text',
            decision: result.decision,
            confidence: parseFloat(result.confidence),
            content: {
                text: text.substring(0, 500)
            },
            reasons: result.reasons,
            details: result.details || {},
            riskScore: parseFloat(result.confidence),
            // Auto-approve high-confidence safe content, others need review
            reviewStatus: result.decision === 'approved' && parseFloat(result.confidence) < 0.3 ? 'reviewed' : 'pending',
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        await moderationRecord.save();

        res.json({
            id: moderationRecord._id,
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in text moderation:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Moderate image content (rate limited)
app.post('/api/moderate/image', moderationLimiter, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No image file provided. Use field name "image"'
            });
        }

        console.log(`Processing image: ${req.file.originalname} (${req.file.size} bytes)`);

        const result = await imageModerationService.moderateImage(req.file.buffer);

        // Save moderation result to database
        const moderationRecord = new ModerationResult({
            type: 'image',
            decision: result.decision,
            confidence: parseFloat(result.confidence),
            content: {
                imageMetadata: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    mimeType: req.file.mimetype
                },
                // Store images up to 500KB as base64 for preview
                imageThumbnail: req.file.size < 500000
                    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
                    : null
            },
            reasons: result.reasons,
            details: result.details || {},
            riskScore: parseFloat(result.confidence),
            // Auto-approve high-confidence safe content, others need review
            reviewStatus: result.decision === 'approved' && parseFloat(result.confidence) > 0.9 ? 'reviewed' : 'pending',
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        await moderationRecord.save();

        res.json({
            id: moderationRecord._id,
            filename: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in image moderation:', error);

        if (error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Moderate text + image together (rate limited)
app.post('/api/moderate/multimodal', moderationLimiter, upload.single('image'), async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                error: 'Text is required and cannot be empty'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'Image file is required. Use field name "image"'
            });
        }

        console.log(`Multimodal analysis: ${text.substring(0, 50)}... + ${req.file.originalname}`);

        const result = await multimodalModerationService.moderateContent(text, req.file.buffer);

        // Save combined moderation to database
        const moderationRecord = new ModerationResult({
            type: 'multimodal',
            decision: result.decision,
            confidence: parseFloat(result.riskScore),
            content: {
                text: text.substring(0, 500),
                imageMetadata: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    mimeType: req.file.mimetype
                },
                // Store images up to 500KB as base64 for preview
                imageThumbnail: req.file.size < 500000
                    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
                    : null
            },
            modalities: result.modalities,
            reasons: result.reasons,
            details: result.details,
            riskScore: parseFloat(result.riskScore),
            // Auto-approve high-confidence safe content, others need review
            reviewStatus: result.decision === 'approved' && parseFloat(result.riskScore) < 0.3 ? 'reviewed' : 'pending',
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        await moderationRecord.save();
        console.log(`Saved moderation result with ID: ${moderationRecord._id}`);

        res.json({
            id: moderationRecord._id,
            content: {
                text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                image: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    mimeType: req.file.mimetype
                }
            },
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in multimodal moderation:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Auth routes (with strict rate limiting for brute force protection)
app.use('/api/auth', authLimiter, authRoutes);

// Admin routes (authentication required - handled by adminRoutes middleware)
app.use('/api/admin', adminRoutes);

// Handle undefined routes
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Bootstrap server with all dependencies
async function startServer() {
    try {
        console.log('Initializing Content Moderation System...\n');

        console.log('Step 1/3: Connecting to database...');
        await database.connect();
        console.log('');

        console.log('Step 2/3: Connecting to cache...');
        await redisCache.connect();
        console.log('');

        console.log('Step 3/3: Loading AI models (this may take a few minutes on first run)...');
        // Load models sequentially to avoid race conditions during first-time download
        await textModerationService.initialize();
        await imageModerationService.initialize();
        await multimodalModerationService.initialize();
        console.log('');

        app.listen(PORT, () => {
            console.log('System fully initialized and ready!\n');
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/health`);
            console.log(`Text moderation: POST http://localhost:${PORT}/api/moderate/text`);
            console.log(`Image moderation: POST http://localhost:${PORT}/api/moderate/image`);
            console.log(`Multimodal: POST http://localhost:${PORT}/api/moderate/multimodal\n`);
        });

    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

// Clean shutdown handler
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await database.disconnect();
    await redisCache.disconnect();
    process.exit(0);
});

startServer();
