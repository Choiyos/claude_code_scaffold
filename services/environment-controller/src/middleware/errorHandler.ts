import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@shared/utils/logger';
import { AppError, isOperationalError, getErrorDetails } from '@shared/utils/errors';

const logger = createLogger('environment-controller:error-handler');

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error details
  const errorDetails = getErrorDetails(error);
  const requestDetails = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.headers['x-request-id']
  };

  if (error instanceof AppError) {
    logger.warn('Application error occurred', {
      error: errorDetails,
      request: requestDetails
    });
  } else {
    logger.error('Unexpected error occurred', {
      error: errorDetails,
      request: requestDetails
    });
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Handle different error types
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: isDevelopment ? error.details : undefined
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
        version: process.env.SERVICE_VERSION || '1.0.0'
      }
    });
  }

  // Handle validation errors from express-validator
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: isDevelopment ? error.message : undefined
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
        version: process.env.SERVICE_VERSION || '1.0.0'
      }
    });
  }

  // Handle Docker errors
  if (error.message.includes('docker') || error.message.includes('Docker')) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DOCKER_ERROR',
        message: 'Docker service error',
        details: isDevelopment ? error.message : undefined
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
        version: process.env.SERVICE_VERSION || '1.0.0'
      }
    });
  }

  // Handle environment-specific errors
  if (error.message.includes('Environment')) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'ENVIRONMENT_ERROR',
        message: 'Environment operation failed',
        details: isDevelopment ? error.message : undefined
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'],
        version: process.env.SERVICE_VERSION || '1.0.0'
      }
    });
  }

  // Default error response
  const statusCode = 500;
  const response = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isDevelopment ? error.message : 'An unexpected error occurred'
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'],
      version: process.env.SERVICE_VERSION || '1.0.0'
    }
  };

  if (isDevelopment) {
    (response.error as any).stack = error.stack;
    (response.error as any).details = errorDetails;
  }

  res.status(statusCode).json(response);
};