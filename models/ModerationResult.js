import mongoose from 'mongoose';

const moderationResultSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['text', 'image', 'multimodal'],
        required: true
    },
    decision: {
        type: String,
        enum: ['approved', 'rejected', 'flagged_for_review'],
        required: true
    },
    confidence: {
        type: Number,
        required: true
    },
    content: {
        text: String,
        imageMetadata: {
            filename: String,
            size: Number,
            mimeType: String
        }
    },
    modalities: {
        text: mongoose.Schema.Types.Mixed,
        image: mongoose.Schema.Types.Mixed
    },
    reasons: [String],
    details: mongoose.Schema.Types.Mixed,
    riskScore: Number,
    reviewStatus: {
        type: String,
        enum: ['pending', 'reviewed', 'appealed'],
        default: 'pending'
    },
    reviewedBy: String,
    reviewNotes: String,
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Indexes for faster queries
moderationResultSchema.index({ decision: 1, createdAt: -1 });
moderationResultSchema.index({ type: 1, decision: 1 });
moderationResultSchema.index({ reviewStatus: 1 });

export default mongoose.model('ModerationResult', moderationResultSchema);
