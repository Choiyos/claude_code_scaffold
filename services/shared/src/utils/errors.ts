export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: Record<string, any>
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  public readonly resource?: string;
  public readonly resourceId?: string;

  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, { resource, id });
    this.resource = resource;
    this.resourceId = id;
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 409, 'CONFLICT', true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, details?: Record<string, any>) {
    super(`Service ${service} is unavailable`, 503, 'SERVICE_UNAVAILABLE', true, details);
  }
}

export class DockerError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 500, 'DOCKER_ERROR', true, details);
  }
}

export class ConfigurationError extends AppError {
  public readonly configPath?: string;

  constructor(message: string, configPath?: string, details?: Record<string, any>) {
    super(message, 422, 'CONFIGURATION_ERROR', true, details);
    this.configPath = configPath;
  }
}

export class EnvironmentError extends AppError {
  constructor(message: string, environmentId?: string, details?: Record<string, any>) {
    super(message, 500, 'ENVIRONMENT_ERROR', true, { environmentId, ...details });
  }
}

export class MCPServerError extends AppError {
  constructor(message: string, serverId?: string, details?: Record<string, any>) {
    super(message, 500, 'MCP_SERVER_ERROR', true, { serverId, ...details });
  }
}

// Error handling utilities
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

export const getErrorDetails = (error: Error): Record<string, any> => {
  const details: Record<string, any> = {
    name: error.name,
    message: error.message,
    stack: error.stack
  };

  if (error instanceof AppError) {
    details.statusCode = error.statusCode;
    details.code = error.code;
    details.isOperational = error.isOperational;
    details.details = error.details;
  }

  return details;
};