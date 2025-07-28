import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Use existing request ID if provided, otherwise generate new one
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  // Set request ID in headers
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Add to request object for easy access
  (req as any).requestId = requestId;
  
  next();
};