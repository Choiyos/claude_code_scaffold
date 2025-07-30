import winston from 'winston';

export interface LogMetadata {
  [key: string]: any;
}

export class Logger {
  private logger: winston.Logger;
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            service: this.serviceName,
            message,
            ...meta
          });
        })
      ),
      defaultMeta: {
        service: this.serviceName
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaString = Object.keys(meta).length > 0 ? 
                JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${service}] ${level}: ${message} ${metaString}`;
            })
          )
        })
      ]
    });

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(new winston.transports.File({
        filename: '/var/log/claude-env/mcp-orchestrator.log',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true
      }));
    }
  }

  info(message: string, meta?: LogMetadata): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: LogMetadata): void {
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: LogMetadata): void {
    this.logger.debug(message, meta);
  }

  verbose(message: string, meta?: LogMetadata): void {
    this.logger.verbose(message, meta);
  }

  setLevel(level: string): void {
    this.logger.level = level;
  }

  child(metadata: LogMetadata): Logger {
    const childLogger = new Logger(this.serviceName);
    childLogger.logger = this.logger.child(metadata);
    return childLogger;
  }
}