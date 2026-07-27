/**
 * @file db.js
 * @description MongoDB connection manager using Mongoose.
 * Implements connection retry logic and graceful shutdown hooks.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Establishes a connection to MongoDB Atlas / local MongoDB.
 * Exits the process on unrecoverable connection failure.
 */
const connectDB = async () => {
  let uri = process.env.MONGO_URI;

  if (!uri) {
    logger.error('MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 100, // Handle high concurrency (up to 100 parallel connections per worker)
      minPoolSize: 10,  // Keep 10 connections warm for lower latency
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed on app termination.');
      process.exit(0);
    });
  } catch (error) {
    logger.warn(`MongoDB connection error: ${error.message}`);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info('Attempting to start in-memory MongoDB for development...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongoServer = await MongoMemoryServer.create();
        uri = mongoServer.getUri();
        
        const conn = await mongoose.connect(uri);
        logger.info(`In-Memory MongoDB Connected: ${conn.connection.host}`);
        
        process.on('SIGINT', async () => {
          await mongoose.connection.close();
          if (mongoServer) {
            await mongoServer.stop();
          }
          logger.info('In-Memory MongoDB closed on app termination.');
          process.exit(0);
        });
        return;
      } catch (memError) {
        logger.error(`In-Memory MongoDB failed: ${memError.message}`);
      }
    }
    
    process.exit(1);
  }
};

// Monitor connection events in production
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected successfully.');
});

module.exports = connectDB;
