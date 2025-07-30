import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';

// Metrics for Environment Controller
const httpRequestDuration = new promClient.Histogram({
  name: 'environment_controller_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds for Environment Controller',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const httpRequestTotal = new promClient.Counter({
  name: 'environment_controller_http_requests_total',
  help: 'Total number of HTTP requests for Environment Controller',
  labelNames: ['method', 'route', 'status']
});

const environmentOperations = new promClient.Counter({
  name: 'environment_operations_total',
  help: 'Total number of environment operations',
  labelNames: ['operation', 'status']
});

const activeEnvironments = new promClient.Gauge({
  name: 'active_environments_total',
  help: 'Total number of active environments',
  labelNames: ['status']
});

const dockerOperationDuration = new promClient.Histogram({
  name: 'docker_operation_duration_seconds',
  help: 'Duration of Docker operations in seconds',
  labelNames: ['operation'],
  buckets: [1, 5, 10, 30, 60, 120, 300]
});

// Register metrics
promClient.register.registerMetric(httpRequestDuration);
promClient.register.registerMetric(httpRequestTotal);
promClient.register.registerMetric(environmentOperations);
promClient.register.registerMetric(activeEnvironments);
promClient.register.registerMetric(dockerOperationDuration);

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
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

// Helper functions for custom metrics
export const recordEnvironmentOperation = (operation: string, status: 'success' | 'error') => {
  environmentOperations.labels(operation, status).inc();
};

export const updateActiveEnvironments = (status: string, count: number) => {
  activeEnvironments.labels(status).set(count);
};

export const recordDockerOperation = (operation: string, duration: number) => {
  dockerOperationDuration.labels(operation).observe(duration);
};