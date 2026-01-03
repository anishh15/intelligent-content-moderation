// Script to promote a user to admin role
// Run with: node scripts/promoteToAdmin.js <email>

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const userSchema = new mongoose.Schema({
    email: String,
    role: String,
    name: String
});

const User = mongoose.model('User', userSchema);

async function promoteUser(email) {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { role: 'admin' },
            { new: true }
        );

        if (user) {
            console.log(`✅ User promoted to admin: ${user.email}`);
            console.log(`   Name: ${user.name}`);
            console.log(`   Role: ${user.role}`);
        } else {
            console.log(`❌ User not found: ${email}`);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

const email = process.argv[2];
if (!email) {
    console.log('Usage: node scripts/promoteToAdmin.js <email>');
    process.exit(1);
}

promoteUser(email);
