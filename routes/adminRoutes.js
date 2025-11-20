import express from 'express';
import mongoose from 'mongoose';
import ModerationResult from '../models/ModerationResult.js';

const router = express.Router();

// Pagination and query defaults
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_SORT_BY = 'createdAt';
const DEFAULT_ORDER = 'desc';
const DEFAULT_ACTIVITY_DAYS = 7;

// Valid sort fields to prevent NoSQL injection
const VALID_SORT_FIELDS = ['createdAt', 'updatedAt', 'confidence', 'riskScore', 'decision'];

// Valid decision values
const VALID_DECISIONS = ['approved', 'rejected', 'flagged_for_review'];

// Validate MongoDB ObjectId format
function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

// Safely parse integer with bounds checking
function parseIntSafe(value, defaultValue, min = 0, max = Infinity) {
    const parsed = parseInt(value);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(min, Math.min(max, parsed));
}

// Get all moderation results with filters and pagination
router.get('/results', async (req, res) => {
    try {
        const {
            decision,
            type,
            reviewStatus,
            limit,
            skip,
            sortBy,
            order
        } = req.query;

        // Parse and validate pagination params
        const safeLimit = parseIntSafe(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        const safeSkip = parseIntSafe(skip, 0, 0);
        const safeSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_SORT_BY;
        const safeOrder = order === 'asc' ? 'asc' : DEFAULT_ORDER;

        // Build query filter
        const filter = {};
        if (decision) filter.decision = decision;
        if (type) filter.type = type;
        if (reviewStatus) filter.reviewStatus = reviewStatus;

        // Execute query with validated params
        const results = await ModerationResult.find(filter)
            .sort({ [safeSortBy]: safeOrder === 'desc' ? -1 : 1 })
            .limit(safeLimit)
            .skip(safeSkip)
            .select('-__v'); // Exclude Mongoose version field

        const total = await ModerationResult.countDocuments(filter);

        res.json({
            results,
            pagination: {
                total,
                limit: safeLimit,
                skip: safeSkip,
                hasMore: total > safeSkip + safeLimit
            }
        });
    } catch (error) {
        console.error('Error fetching moderation results:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// Get single result by ID
router.get('/results/:id', async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Invalid result ID format' });
        }

        const result = await ModerationResult.findById(req.params.id);
        
        if (!result) {
            return res.status(404).json({ error: 'Result not found' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching result:', error);
        res.status(500).json({ error: 'Failed to fetch result' });
    }
});

// Submit human review for a moderation result
router.post('/review/:id', async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Invalid result ID format' });
        }

        const { decision, reviewedBy, reviewNotes } = req.body;

        if (!VALID_DECISIONS.includes(decision)) {
            return res.status(400).json({ 
                error: 'Invalid decision. Must be: approved, rejected, or flagged_for_review' 
            });
        }

        if (!reviewedBy || reviewedBy.trim().length === 0) {
            return res.status(400).json({ 
                error: 'reviewedBy is required' 
            });
        }

        // Update moderation result with review
        const result = await ModerationResult.findByIdAndUpdate(
            req.params.id,
            {
                decision,
                reviewStatus: 'reviewed',
                reviewedBy: reviewedBy.trim(),
                reviewNotes: reviewNotes || '',
                reviewedAt: new Date()
            },
            { new: true, runValidators: true } // Return updated doc and run schema validation
        );

        if (!result) {
            return res.status(404).json({ error: 'Result not found' });
        }

        console.log(`Result ${req.params.id} reviewed by ${reviewedBy}: ${decision}`);

        res.json({
            message: 'Review submitted successfully',
            result
        });
    } catch (error) {
        console.error('Error reviewing result:', error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

// Get moderation statistics overview
router.get('/stats/overview', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Build date range filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Run aggregations in parallel for better performance
        const [decisionStats, typeStats, reviewStats, total, pendingReview] = await Promise.all([
            // Group by decision type
            ModerationResult.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$decision',
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Group by content type
            ModerationResult.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$type',
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Group by review status
            ModerationResult.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$reviewStatus',
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Total count
            ModerationResult.countDocuments(dateFilter),
            // Pending review count
            ModerationResult.countDocuments({
                ...dateFilter,
                reviewStatus: 'pending',
                decision: { $in: ['rejected', 'flagged_for_review'] }
            })
        ]);

        res.json({
            total,
            pendingReview,
            byDecision: decisionStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            byType: typeStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            byReviewStatus: reviewStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {})
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get moderation activity over time
router.get('/stats/activity', async (req, res) => {
    try {
        const { days } = req.query;
        const safeDays = parseIntSafe(days, DEFAULT_ACTIVITY_DAYS, 1, 365);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - safeDays);

        const activity = await ModerationResult.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        decision: '$decision'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.date': 1 }
            }
        ]);

        // Transform to easier format for frontend charts
        const formatted = activity.reduce((acc, item) => {
            const date = item._id.date;
            if (!acc[date]) {
                acc[date] = { date, approved: 0, rejected: 0, flagged: 0, total: 0 };
            }
            const key = item._id.decision === 'flagged_for_review' ? 'flagged' : item._id.decision;
            acc[date][key] = item.count;
            acc[date].total += item.count;
            return acc;
        }, {});

        res.json(Object.values(formatted));
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({ error: 'Failed to fetch activity data' });
    }
});

// Bulk review multiple results at once
router.post('/review/bulk', async (req, res) => {
    try {
        const { ids, decision, reviewedBy, reviewNotes } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids must be a non-empty array' });
        }

        if (ids.length > 100) {
            return res.status(400).json({ error: 'Cannot review more than 100 results at once' });
        }

        // Validate all IDs
        if (!ids.every(id => isValidObjectId(id))) {
            return res.status(400).json({ error: 'One or more invalid ID formats' });
        }

        if (!VALID_DECISIONS.includes(decision)) {
            return res.status(400).json({ 
                error: 'Invalid decision. Must be: approved, rejected, or flagged_for_review' 
            });
        }

        if (!reviewedBy || reviewedBy.trim().length === 0) {
            return res.status(400).json({ 
                error: 'reviewedBy is required' 
            });
        }

        const result = await ModerationResult.updateMany(
            { _id: { $in: ids } },
            {
                decision,
                reviewStatus: 'reviewed',
                reviewedBy: reviewedBy.trim(),
                reviewNotes: reviewNotes || '',
                reviewedAt: new Date()
            }
        );

        console.log(`Bulk review: ${result.modifiedCount} results updated`);

        res.json({
            message: 'Bulk review completed',
            modified: result.modifiedCount
        });
    } catch (error) {
        console.error('Error in bulk review:', error);
        res.status(500).json({ error: 'Failed to complete bulk review' });
    }
});

export default router;
