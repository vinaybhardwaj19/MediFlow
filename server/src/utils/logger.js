/**
 * @file logger.js
 * @description Winston logger with environment-aware transports.
 * - Development : Colorized console output
 * - Production  : Structured JSON files (combined + error-only)
 * PHI/sensitive data must NEVER be passed directly to logger methods.
 */

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;
const path = require('path');

const isDev = process.env.NODE_ENV !== 'production';

/** Pretty single-line format for development console. */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `[${timestamp}] ${level}: ${message}\n${stack}`
      : `[${timestamp}] ${level}: ${message}`
  )
);

/** Structured JSON format for production log files. */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isDev ? devFormat : prodFormat,
  transports: isDev
    ? [new transports.Console()]
    : [
        new transports.Console(),
        new transports.File({
          filename: path.join('logs', 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10 MB
          maxFiles: 5,
        }),
        new transports.File({
          filename: path.join('logs', 'combined.log'),
          maxsize: 20 * 1024 * 1024, // 20 MB
          maxFiles: 10,
        }),
      ],
  exitOnError: false,
});

module.exports = logger;
