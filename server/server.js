/**
 * @file server.js
 * @description HTTP + Socket.IO server bootstrap.
 * Connects to MongoDB, starts the HTTP server, attaches Socket.IO,
 * and registers graceful shutdown handlers for SIGTERM/SIGINT.
 */

require('dotenv').config();

const http    = require('http');
const { Server } = require('socket.io');
const app     = require('./src/app');
const connectDB = require('./src/config/db');
const logger  = require('./src/utils/logger');
const env     = require('./src/config/env');
const socketHandler = require('./src/socket/socketHandler');

const PORT = env.PORT;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
(async () => {
  // 1. Connect to database before accepting requests
  await connectDB();
  
  // 1.5 Auto-seed exhibition users if DB is empty
  const { autoSeed } = require('./src/utils/exhibition-helper');
  await autoSeed();

  // 2. Create raw HTTP server from Express app
  const httpServer = http.createServer(app);

  // 3. Attach Socket.IO with CORS matching the API config
  const io = new Server(httpServer, {
    cors: {
      origin     : [env.CLIENT_URL, `http://localhost:${PORT}`],
      credentials: true,
    },
    pingTimeout  : 60000,
    pingInterval : 25000,
  });

  // 4. Register all Socket.IO event handlers
  socketHandler(io);

  // 5. Start listening
  httpServer.listen(PORT, () => {
    logger.info(`MediFlow API running on port ${PORT} [${env.NODE_ENV}]`);
    logger.info(`Health check → http://localhost:${PORT}/health`);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received — starting graceful shutdown`);
    httpServer.close(async () => {
      logger.info('HTTP server closed');
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    });

    // Force exit if shutdown takes too long
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

  // Unhandled promise rejections — log and exit cleanly
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', { reason });
    httpServer.close(() => process.exit(1));
  });
})();
