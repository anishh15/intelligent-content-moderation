import axios from 'axios';

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/';
const TEXT_MODEL = 's-nlp/roberta_toxicity_classifier';
const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';

class TextModerationService {
    constructor() {
        this.isInitialized = false;
        this.hfToken = null;
        this.openaiKey = null;
    }

    async initialize() {
        // Get API tokens from environment
        this.hfToken = process.env.HF_TOKEN;
        this.openaiKey = process.env.OPENAI_API_KEY;

        if (!this.hfToken && !this.openaiKey) {
            console.warn('⚠️  No AI API tokens set - text moderation will use keyword fallback only');
        } else {
            const providers = [];
            if (this.hfToken) providers.push('HuggingFace');
            if (this.openaiKey) providers.push('OpenAI');
            console.log(`✅ Text moderation initialized with providers: ${providers.join(', ')}`);
        }

        this.isInitialized = true;
    }

    async moderateText(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Try providers in order: HuggingFace -> OpenAI -> Keyword fallback
        if (this.hfToken) {
            const result = await this._tryHuggingFace(text);
            if (result) return result;
        }

        if (this.openaiKey) {
            const result = await this._tryOpenAI(text);
            if (result) return result;
        }

        // Last resort: keyword-based fallback
        console.log('All AI providers failed, using keyword fallback');
        return this._keywordFallback(text);
    }

    async _tryHuggingFace(text) {
        try {
            const response = await axios.post(
                `${HF_API_URL}${TEXT_MODEL}`,
                { inputs: text },
                {
                    headers: {
                        'Authorization': `Bearer ${this.hfToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

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
                    provider: 'huggingface',
                    contentLength: `${text.length} characters`,
                    threshold: 0.7,
                    runtime: 'cloud'
                }
            };
        } catch (error) {
            console.error('HuggingFace API error:', error.message);

            // Model loading - suggest retry
            if (error.response?.status === 503) {
                return {
                    decision: 'flagged_for_review',
                    confidence: '0.0000',
                    isToxic: false,
                    predictions: [],
                    reasons: ['AI model is loading, please retry in a moment'],
                    details: {
                        model: TEXT_MODEL,
                        provider: 'huggingface',
                        error: 'Model loading',
                        runtime: 'cloud'
                    }
                };
            }

            return null; // Try next provider
        }
    }

    async _tryOpenAI(text) {
        try {
            const response = await axios.post(
                OPENAI_MODERATION_URL,
                { input: text },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const result = response.data.results[0];
            const flagged = result.flagged;

            // Get the highest scoring category
            const categories = result.category_scores;
            const highestCategory = Object.entries(categories)
                .sort((a, b) => b[1] - a[1])[0];

            const confidence = highestCategory[1];
            const decision = flagged ? 'rejected' : 'approved';

            let reasons = [];
            if (flagged) {
                const flaggedCategories = Object.entries(result.categories)
                    .filter(([_, v]) => v)
                    .map(([k, _]) => k.replace(/[/-]/g, ' '));
                reasons = flaggedCategories.map(cat => `Flagged for: ${cat}`);
            }

            return {
                decision,
                confidence: confidence.toFixed(4),
                isToxic: flagged,
                predictions: Object.entries(categories)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([label, score]) => ({
                        label: label.replace(/[/-]/g, ' '),
                        score: (score * 100).toFixed(2) + '%'
                    })),
                reasons,
                details: {
                    model: 'text-moderation-latest',
                    provider: 'openai',
                    contentLength: `${text.length} characters`,
                    runtime: 'cloud'
                }
            };
        } catch (error) {
            console.error('OpenAI Moderation API error:', error.message);
            return null; // Try next provider
        }
    }

    _keywordFallback(text) {
        const toxicKeywords = ['hate', 'kill', 'die', 'stupid', 'idiot', 'damn', 'hell', 'fuck', 'shit', 'ass'];
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
                model: 'keyword-filter',
                provider: 'fallback',
                contentLength: `${text.length} characters`,
                description: 'Basic keyword filter (all AI providers unavailable)',
                runtime: 'local'
            }
        };
    }
}

export default new TextModerationService();
