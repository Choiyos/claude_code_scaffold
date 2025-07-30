import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@shared/utils/logger';
import { 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  UnauthorizedError, 
  ForbiddenError,
  ConfigurationError
} from '@shared/utils/errors';

const logger = createLogger('configuration-manager:errorHandler');

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.headers['x-request-id'] as string;
  
  // Log error with context
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    requestId,
    userAgent: req.headers['user-agent']
  });

  // Handle known error types
  if (error instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId,
        service: 'configuration-manager'
      }
    });
  }

  if (error instanceof NotFoundError) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message,
        resource: error.resource,
        resourceId: error.resourceId
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId,
        service: 'configuration-manager'
      }
    });
  }

  if (error instanceof ConflictError) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: error.message,
        details: error.details
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId,
        service: 'configuration-manager'
      }
    });
  }

  if (error instanceof UnauthorizedError) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: error.message
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId,
        service: 'configuration-manager'
      }
    });
  }

  if (error instanceof ForbiddenError) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: error.message
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId,
        service: 'configuration-manager'
      }
    });
  }

  if (error instanceof ConfigurationError) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'CONFIGURATION_ERROR',
        message: error.message,
        configPath: error.configPath,
        details: error.details
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId,
        service: 'configuration-manager'
      }
    });
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An internal server error occurred' 
        : error.message
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId,
      service: 'configuration-manager'
    }
  });
};