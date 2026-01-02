import axios from 'axios';

const HF_API_URL = 'https://api-inference.huggingface.co/models/';
const IMAGE_MODEL = 'Falconsai/nsfw_image_detection';

class ImageModerationService {
    constructor() {
        this.isInitialized = false;
        this.apiToken = null;
    }

    async initialize() {
        // Get HuggingFace API token from environment
        this.apiToken = process.env.HF_TOKEN;

        if (!this.apiToken) {
            console.warn('⚠️  HF_TOKEN not set - image moderation will use fallback');
        }

        this.isInitialized = true;
        console.log('✅ Image moderation service initialized (HuggingFace Inference API)');
    }

    async moderateImage(imageBuffer) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Fallback if no API token
        if (!this.apiToken) {
            return this._fallbackModeration(imageBuffer);
        }

        try {
            // Send image buffer directly to HuggingFace
            const response = await axios.post(
                `${HF_API_URL}${IMAGE_MODEL}`,
                imageBuffer,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/octet-stream'
                    },
                    timeout: 60000,
                    maxContentLength: 20 * 1024 * 1024,
                    maxBodyLength: 20 * 1024 * 1024
                }
            );

            // Parse response - format: [{label: "nsfw", score: 0.95}, {label: "normal", score: 0.05}]
            const results = response.data;

            let nsfwResult = null;
            let sfwResult = null;

            for (const result of results) {
                const label = result.label.toLowerCase();
                if (label === 'nsfw' || label === 'porn' || label === 'sexy' || label === 'hentai') {
                    nsfwResult = result;
                } else if (label === 'normal' || label === 'safe' || label === 'sfw' || label === 'neutral' || label === 'drawings') {
                    sfwResult = result;
                }
            }

            // If no clear NSFW result, check if highest score is a problematic category
            if (!nsfwResult) {
                const sortedResults = [...results].sort((a, b) => b.score - a.score);
                const topResult = sortedResults[0];
                const problematicLabels = ['nsfw', 'porn', 'sexy', 'hentai'];
                if (problematicLabels.includes(topResult.label.toLowerCase())) {
                    nsfwResult = topResult;
                }
            }

            const isNSFW = nsfwResult && nsfwResult.score > 0.5;
            const confidence = isNSFW ? nsfwResult.score : (sfwResult ? sfwResult.score : results[0]?.score || 0);
            const decision = isNSFW ? 'rejected' : 'approved';

            let reasons = [];
            if (isNSFW && nsfwResult) {
                reasons.push(`NSFW content detected with ${(nsfwResult.score * 100).toFixed(1)}% confidence`);
                if (nsfwResult.score > 0.9) {
                    reasons.push('High confidence detection - explicit content');
                } else if (nsfwResult.score > 0.7) {
                    reasons.push('Moderate confidence - potentially inappropriate content');
                } else {
                    reasons.push('Low-moderate confidence - borderline content');
                }
            }

            return {
                decision,
                confidence: confidence.toFixed(4),
                isNSFW,
                predictions: results.map(r => ({
                    label: r.label,
                    score: (r.score * 100).toFixed(2) + '%'
                })),
                reasons,
                details: {
                    model: IMAGE_MODEL,
                    imageSize: `${imageBuffer.length} bytes`,
                    threshold: 0.5,
                    description: 'NSFW image classifier (HuggingFace Inference API)',
                    runtime: 'cloud'
                }
            };
        } catch (error) {
            console.error('HuggingFace Image API error:', error.message);

            // If model is loading, return a retry indicator
            if (error.response?.status === 503) {
                return {
                    decision: 'flagged_for_review',
                    confidence: '0.0000',
                    isNSFW: false,
                    predictions: [],
                    reasons: ['AI model is loading, please retry in a moment'],
                    details: {
                        model: IMAGE_MODEL,
                        error: 'Model loading',
                        runtime: 'cloud'
                    }
                };
            }

            // Fallback for other errors
            return this._fallbackModeration(imageBuffer);
        }
    }

    // Fallback when API is unavailable - flags all images for manual review
    _fallbackModeration(imageBuffer) {
        return {
            decision: 'flagged_for_review',
            confidence: '0.5000',
            isNSFW: false,
            predictions: [
                { label: 'unknown', score: '50.00%' }
            ],
            reasons: ['Image moderation API unavailable - flagged for manual review'],
            details: {
                model: 'fallback-manual-review',
                imageSize: `${imageBuffer.length} bytes`,
                description: 'Manual review required (API unavailable)',
                runtime: 'local'
            }
        };
    }
}

export default new ImageModerationService();
