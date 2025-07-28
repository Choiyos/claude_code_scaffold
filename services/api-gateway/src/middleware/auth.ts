import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '@shared/utils/logger';
import { UnauthorizedError, ForbiddenError } from '@shared/utils/errors';

const logger = createLogger('api-gateway:auth');

interface JWTPayload {
  id: string;
  email: string;
  role: string;
  teamId?: string;
  iat: number;
  exp: number;
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip authentication for health checks and metrics
  const publicPaths = ['/health', '/metrics', '/'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or invalid authorization header', {
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    });
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable is not set');
      throw new Error('Server configuration error');
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Add user information to request
    (req as any).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      teamId: decoded.teamId
    };

    logger.debug('User authenticated successfully', {
      userId: decoded.id,
      role: decoded.role,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    });

    next();
  } catch (error: any) {
    logger.warn('Token verification failed', {
      error: error.message,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    });

    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid token');
    } else {
      throw new UnauthorizedError('Authentication failed');
    }
  }
};

// Role-based access control middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(user.role)) {
      logger.warn('Access denied - insufficient permissions', {
        userId: user.id,
        userRole: user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id']
      });
      
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
};

// Team access control middleware
export const requireTeamAccess = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const teamId = req.params.teamId || req.body.teamId || req.query.teamId;
  
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  // Admin users can access any team
  if (user.role === 'admin') {
    return next();
  }

  // Check if user belongs to the requested team
  if (teamId && user.teamId !== teamId) {
    logger.warn('Access denied - team mismatch', {
      userId: user.id,
      userTeamId: user.teamId,
      requestedTeamId: teamId,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    });
    
    throw new ForbiddenError('Access denied to team resources');
  }

  next();
};