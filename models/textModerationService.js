import axios from 'axios';

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/';
const TEXT_MODEL = 's-nlp/roberta_toxicity_classifier';

class TextModerationService {
    constructor() {
        this.isInitialized = false;
        this.apiToken = null;
    }

    async initialize() {
        // Get HuggingFace API token from environment
        this.apiToken = process.env.HF_TOKEN;

        if (!this.apiToken) {
            console.warn('⚠️  HF_TOKEN not set - text moderation will use fallback');
        }

        this.isInitialized = true;
        console.log('✅ Text moderation service initialized (HuggingFace Inference API)');
    }

    async moderateText(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Fallback if no API token
        if (!this.apiToken) {
            return this._fallbackModeration(text);
        }

        try {
            const response = await axios.post(
                `${HF_API_URL}${TEXT_MODEL}`,
                { inputs: text },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            // Parse HuggingFace response
            // Response format: [[{label: "toxic", score: 0.95}, {label: "neutral", score: 0.05}]]
            const results = response.data[0] || response.data;

            let toxicResult = null;
            let nonToxicResult = null;

            for (const result of results) {
                const label = result.label.toLowerCase();
                if (label === 'toxic' || label === 'toxicity') {
                    toxicResult = result;
                } else if (label === 'non-toxic' || label === 'neutral' || label === 'non_toxic') {
                    nonToxicResult = result;
                }
            }

            const isToxic = toxicResult && toxicResult.score > 0.7;
            const confidence = toxicResult ? toxicResult.score : (nonToxicResult ? nonToxicResult.score : 0);
            const decision = isToxic ? 'rejected' : 'approved';

            let reasons = [];
            if (isToxic && toxicResult) {
                reasons.push(`Toxic content detected with ${(toxicResult.score * 100).toFixed(1)}% confidence`);
                if (toxicResult.score > 0.9) {
                    reasons.push('High confidence detection - highly toxic content');
                } else if (toxicResult.score > 0.8) {
                    reasons.push('Moderate-high confidence - toxic language detected');
                } else {
                    reasons.push('Moderate confidence - potentially toxic content');
                }
            }

            return {
                decision,
                confidence: confidence.toFixed(4),
                isToxic,
                predictions: results.map(r => ({
                    label: r.label,
                    score: (r.score * 100).toFixed(2) + '%'
                })),
                reasons,
                details: {
                    model: TEXT_MODEL,
                    contentLength: `${text.length} characters`,
                    threshold: 0.7,
                    description: 'BERT-based toxicity classifier (HuggingFace Inference API)',
                    runtime: 'cloud'
                }
            };
        } catch (error) {
            console.error('HuggingFace API error:', error.message);

            // If model is loading, return a retry indicator
            if (error.response?.status === 503) {
                return {
                    decision: 'flagged_for_review',
                    confidence: '0.0000',
                    isToxic: false,
                    predictions: [],
                    reasons: ['AI model is loading, please retry in a moment'],
                    details: {
                        model: TEXT_MODEL,
                        error: 'Model loading',
                        runtime: 'cloud'
                    }
                };
            }

            // Fallback for other errors
            return this._fallbackModeration(text);
        }
    }

    // Simple keyword-based fallback when API is unavailable
    _fallbackModeration(text) {
        const toxicKeywords = ['hate', 'kill', 'die', 'stupid', 'idiot', 'damn', 'hell'];
        const lowerText = text.toLowerCase();
        const foundKeywords = toxicKeywords.filter(kw => lowerText.includes(kw));
        const isToxic = foundKeywords.length > 0;

        return {
            decision: isToxic ? 'flagged_for_review' : 'approved',
            confidence: isToxic ? '0.6000' : '0.4000',
            isToxic,
            predictions: [
                { label: isToxic ? 'potentially_toxic' : 'likely_safe', score: '60.00%' }
            ],
            reasons: isToxic ? [`Keyword match: ${foundKeywords.join(', ')}`] : [],
            details: {
                model: 'fallback-keyword-filter',
                contentLength: `${text.length} characters`,
                description: 'Basic keyword filter (API unavailable)',
                runtime: 'local'
            }
        };
    }
}

export default new TextModerationService();
