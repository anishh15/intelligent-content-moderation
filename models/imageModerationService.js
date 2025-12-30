import { pipeline } from '@huggingface/transformers';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// For ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ImageModerationService {
    constructor() {
        this.classifier = null;
        this.isInitialized = false;
        this.tempDir = path.join(__dirname, '../temp');

        // Create temp directory if it doesn't exist
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('✅ Image moderation model already loaded');
            return;
        }

        try {
            console.log('🔄 Loading NSFW detection model (this may take 1-2 minutes on first run)...');

            // Load NSFW detection model
            this.classifier = await pipeline(
                'image-classification',
                'AdamCodd/vit-base-nsfw-detector',
                { quantized: true }
            );

            this.isInitialized = true;
            console.log('✅ NSFW detection model loaded successfully');
        } catch (error) {
            console.error('❌ Error loading NSFW detection model:', error);
            throw error;
        }
    }

    async moderateImage(imageBuffer) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Create a temporary file path
        const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        const tempFilePath = path.join(this.tempDir, tempFileName);

        try {
            // Resize image to model's expected size
            await sharp(imageBuffer)
                .resize(384, 384, { fit: 'cover' })
                .png()
                .toFile(tempFilePath);

            console.log(`📁 Analyzing image: ${tempFilePath}`);

            // Pass the file path to the NSFW classifier
            const results = await this.classifier(tempFilePath, { topk: 2 });

            // Delete the temp file after processing
            fs.unlinkSync(tempFilePath);
            console.log(`✅ Analysis complete, temp file cleaned up`);

            // Extract results
            const nsfwResult = results.find(r => r.label.toLowerCase() === 'nsfw');
            const sfwResult = results.find(r => r.label.toLowerCase() === 'sfw');

            const isNSFW = nsfwResult && nsfwResult.score > 0.5;
            const confidence = isNSFW ? nsfwResult.score : sfwResult.score;
            const decision = isNSFW ? 'rejected' : 'approved';

            let reasons = [];
            if (isNSFW) {
                reasons.push(`NSFW content detected with ${(nsfwResult.score * 100).toFixed(1)}% confidence`);

                // Additional context based on confidence level
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
                    model: 'AdamCodd/vit-base-nsfw-detector',
                    imageSize: `${imageBuffer.length} bytes`,
                    threshold: 0.5,
                    description: 'ViT-based NSFW detector (96.54% accuracy)'
                }
            };
        } catch (error) {
            // Clean up temp file if it exists
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            console.error('Error in image moderation:', error);
            throw error;
        }
    }
}

export default new ImageModerationService();
