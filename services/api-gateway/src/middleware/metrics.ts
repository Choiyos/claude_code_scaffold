import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';

export const metricsMiddleware = (
  httpRequestDuration: promClient.Histogram<string>,
  httpRequestTotal: promClient.Counter<string>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Continue with request processing
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const method = req.method;
      const status = res.statusCode.toString();
      
      // Record metrics
      httpRequestDuration
        .labels(method, route, status)
        .observe(duration);
      
      httpRequestTotal
        .labels(method, route, status)
        .inc();
    });
    
    next();
  };
};