import winston from 'winston';
import { format } from 'winston';

const { combine, timestamp, errors, json, printf, colorize } = format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level}]: ${message} ${
    Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
  }`;
});

// Create logger configuration
const createLogger = (service: string) => {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      json()
    ),
    defaultMeta: {
      service,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.SERVICE_VERSION || '1.0.0'
    },
    transports: [
      // Write all logs with level 'error' and below to error.log
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: combine(timestamp(), errors({ stack: true }), json())
      }),
      // Write all logs to combined.log
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: combine(timestamp(), json())
      })
    ]
  });

  // Add console transport for development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(
      new winston.transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          consoleFormat
        )
      })
    );
  }

  return logger;
};

// Export logger factory
export { createLogger };

// Export default logger for shared usage
export const logger = createLogger('shared');