import textModerationService from './textModerationService.js';
import imageModerationService from './imageModerationService.js';

class MultimodalModerationService {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('✅ Multimodal moderation already initialized');
            return;
        }

        try {
            console.log('🔄 Initializing multimodal moderation services...');

            // Initialize both services
            await Promise.all([
                textModerationService.initialize(),
                imageModerationService.initialize()
            ]);

            this.isInitialized = true;
            console.log('✅ Multimodal moderation initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing multimodal moderation:', error);
            throw error;
        }
    }

    async moderateContent(text, imageBuffer) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            console.log('🔍 Running multimodal analysis...');

            // Run both analyses in parallel
            const [textResult, imageResult] = await Promise.all([
                textModerationService.moderateText(text),
                imageModerationService.moderateImage(imageBuffer)
            ]);

            console.log('📊 Text result:', textResult.decision, `(${textResult.confidence})`);
            console.log('📊 Image result:', imageResult.decision, `(${imageResult.confidence})`);

            // Fusion logic
            const fusedResult = this._fuseResults(textResult, imageResult, text);

            return fusedResult;
        } catch (error) {
            console.error('Error in multimodal moderation:', error);
            throw error;
        }
    }

    _fuseResults(textResult, imageResult, text) {
        const reasons = [];
        let finalDecision = 'approved';
        let riskScore = 0;

        // Both are flagged - High risk
        if (textResult.decision === 'rejected' && imageResult.decision === 'rejected') {
            finalDecision = 'rejected';
            riskScore = 1.0;
            reasons.push('Both text and image contain inappropriate content');
            reasons.push(...textResult.reasons);
            reasons.push(...imageResult.reasons);
        }
        // Text is toxic but image is clean
        else if (textResult.decision === 'rejected' && imageResult.decision === 'approved') {
            finalDecision = 'rejected';
            riskScore = 0.8;
            reasons.push('Text contains inappropriate content');
            reasons.push(...textResult.reasons);
            reasons.push('Image appears safe but text violates policy');
        }
        // Image is NSFW but text is clean
        else if (textResult.decision === 'approved' && imageResult.decision === 'rejected') {
            finalDecision = 'rejected';
            riskScore = 0.9;
            reasons.push('Image contains inappropriate content');
            reasons.push(...imageResult.reasons);
            reasons.push('Text appears safe but image violates policy');
        }
        // Either flagged for review
        else if (textResult.decision === 'flagged_for_review' || imageResult.decision === 'flagged_for_review') {
            finalDecision = 'flagged_for_review';
            riskScore = 0.5;
            reasons.push('Content flagged for manual review');
            if (textResult.decision === 'flagged_for_review') {
                reasons.push(...textResult.reasons);
            }
            if (imageResult.decision === 'flagged_for_review') {
                reasons.push(...imageResult.reasons);
            }
        }
        // Both approved
        else {
            const evasionDetected = this._detectEvasion(textResult, imageResult, text);
            if (evasionDetected.isEvasion) {
                finalDecision = 'flagged_for_review';
                riskScore = evasionDetected.score;
                reasons.push(...evasionDetected.reasons);
            } else {
                finalDecision = 'approved';
                riskScore = 0.0;
                reasons.push('Content appears safe across all modalities');
            }
        }

        return {
            decision: finalDecision,
            riskScore: riskScore.toFixed(4),
            modalities: {
                text: {
                    decision: textResult.decision,
                    confidence: textResult.confidence,
                    isToxic: textResult.isToxic
                },
                image: {
                    decision: imageResult.decision,
                    confidence: imageResult.confidence,
                    isNSFW: imageResult.isNSFW
                }
            },
            reasons,
            details: {
                textModel: textResult.details.model,
                imageModel: imageResult.details.model,
                fusionStrategy: 'cross-modal-correlation',
                runtime: 'cloud',
                timestamp: new Date().toISOString()
            }
        };
    }

    _detectEvasion(textResult, imageResult, text) {
        const evasionPatterns = {
            isEvasion: false,
            score: 0,
            reasons: []
        };

        const textScore = parseFloat(textResult.confidence);
        const imageScore = parseFloat(imageResult.confidence);

        // Borderline scores on both
        if (textScore < 0.7 && textScore > 0.4 && imageScore < 0.7 && imageScore > 0.4) {
            evasionPatterns.isEvasion = true;
            evasionPatterns.score = 0.6;
            evasionPatterns.reasons.push('Borderline scores detected on both modalities');
        }

        // Text references visual content
        const visualReferences = ['see image', 'check pic', 'look at this', 'click here', 'watch this'];
        const hasVisualReference = visualReferences.some(ref => text.toLowerCase().includes(ref));

        if (hasVisualReference && imageScore < 0.6) {
            evasionPatterns.isEvasion = true;
            evasionPatterns.score = Math.max(evasionPatterns.score, 0.65);
            evasionPatterns.reasons.push('Text references image with borderline classification');
        }

        // Very short text with borderline image
        if (text.length < 20 && imageScore > 0.4 && imageScore < 0.7) {
            evasionPatterns.isEvasion = true;
            evasionPatterns.score = Math.max(evasionPatterns.score, 0.55);
            evasionPatterns.reasons.push('Minimal text with borderline image content');
        }

        return evasionPatterns;
    }
}

export default new MultimodalModerationService();
