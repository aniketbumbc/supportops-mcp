import pino from 'pino';
import { env } from './env.js';

/**
 * Structured JSON logger. Pretty output in development, JSON in production.
 * Sensitive fields are redacted so they never reach log storage.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.email',
      '*.phone',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }
    : {}),
});
