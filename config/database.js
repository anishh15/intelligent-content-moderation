import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

class Database {
    constructor() {
        this.isConnected = false;
        this.setupEventHandlers(); // Register event listeners once
    }

    // Monitor connection state changes
    setupEventHandlers() {
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            this.isConnected = false;
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            this.isConnected = false;
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
            this.isConnected = true;
        });
    }

    async connect() {
        if (this.isConnected) {
            console.log('MongoDB already connected');
            return;
        }

        try {
            const options = {
                maxPoolSize: 10, // Max concurrent connections
                minPoolSize: 2, // Min idle connections
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                family: 4 // Use IPv4
            };

            console.log('Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI, options);
            
            this.isConnected = true;
            console.log('MongoDB connected successfully');
            console.log(`Database: ${mongoose.connection.db.databaseName}`);
            console.log(`Connection pool: max=${options.maxPoolSize}, min=${options.minPoolSize}`);

        } catch (error) {
            console.error('MongoDB connection failed:', error.message);
            
            // Provide context-specific error hints
            if (error.message.includes('ENOTFOUND')) {
                console.error('Check your MongoDB URI and network connection');
            } else if (error.message.includes('authentication failed')) {
                console.error('Check your MongoDB username and password');
            } else if (error.message.includes('timed out')) {
                console.error('Check if your IP is whitelisted in MongoDB Atlas Network Access');
            }
            
            throw error;
        }
    }

    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            await mongoose.disconnect();
            this.isConnected = false;
            console.log('MongoDB disconnected successfully');
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error);
            throw error;
        }
    }
}

export default new Database();
