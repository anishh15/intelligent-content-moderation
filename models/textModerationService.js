import { pipeline } from '@huggingface/transformers';

class TextModerationService {
    constructor() {
        this.classifier = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('✅ Text moderation model already loaded');
            return;
        }

        try {
            console.log('🔄 Loading text moderation model...');

            // Load toxicity classification model
            this.classifier = await pipeline(
                'text-classification',
                'Xenova/toxic-bert',
                { quantized: true }
            );

            this.isInitialized = true;
            console.log('✅ Text moderation model loaded successfully');
        } catch (error) {
            console.error('❌ Error loading text moderation model:', error);
            throw error;
        }
    }

    async moderateText(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Run toxicity detection (returns array of results)
            const results = await this.classifier(text, { topk: 2 });

            // Handle results - model returns top predictions
            // Results format: [{ label: 'toxic', score: 0.95 }, { label: 'non-toxic', score: 0.05 }]

            let toxicResult = null;
            let nonToxicResult = null;

            // Find toxic and non-toxic results
            for (const result of results) {
                if (result.label === 'toxic') {
                    toxicResult = result;
                } else if (result.label === 'non-toxic') {
                    nonToxicResult = result;
                }
            }

            // If we don't have both results, use the first result
            if (!toxicResult && !nonToxicResult) {
                const firstResult = results[0];
                const isToxic = firstResult.label === 'toxic';

                return {
                    decision: isToxic && firstResult.score > 0.7 ? 'rejected' : 'approved',
                    confidence: firstResult.score.toFixed(4),
                    isToxic: isToxic,
                    predictions: results.map(r => ({
                        label: r.label,
                        score: (r.score * 100).toFixed(2) + '%'
                    })),
                    reasons: isToxic ? [`Toxic content detected with ${(firstResult.score * 100).toFixed(1)}% confidence`] : [],
                    details: {
                        model: 'Xenova/toxic-bert',
                        contentLength: `${text.length} characters`,
                        threshold: 0.7,
                        description: 'BERT-based toxicity classifier'
                    }
                };
            }

            // Determine if content is toxic
            const isToxic = toxicResult && toxicResult.score > 0.7;
            const confidence = toxicResult ? toxicResult.score : (nonToxicResult ? nonToxicResult.score : 0);
            const decision = isToxic ? 'rejected' : 'approved';

            let reasons = [];
            if (isToxic && toxicResult) {
                reasons.push(`Toxic content detected with ${(toxicResult.score * 100).toFixed(1)}% confidence`);

                // Additional context based on confidence level
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
                    model: 'Xenova/toxic-bert',
                    contentLength: `${text.length} characters`,
                    threshold: 0.7,
                    description: 'BERT-based toxicity classifier'
                }
            };
        } catch (error) {
            console.error('Error in text moderation:', error);
            throw error;
        }
    }
}

// Export singleton instance
export default new TextModerationService();
