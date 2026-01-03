// Script to clear all moderation results from database
// Run with: node scripts/clearDatabase.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Define a simple schema for ModerationResult
const moderationResultSchema = new mongoose.Schema({}, { strict: false });
const ModerationResult = mongoose.model('ModerationResult', moderationResultSchema);

async function clearDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Count existing records
        const count = await ModerationResult.countDocuments();
        console.log(`Found ${count} moderation results`);

        if (count > 0) {
            // Delete all records
            const result = await ModerationResult.deleteMany({});
            console.log(`✅ Deleted ${result.deletedCount} records`);
        } else {
            console.log('Database already empty');
        }

        // Verify deletion
        const remaining = await ModerationResult.countDocuments();
        console.log(`Remaining records: ${remaining}`);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

clearDatabase();
