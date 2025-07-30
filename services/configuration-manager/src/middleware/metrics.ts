import { Request, Response, NextFunction } from 'express';
import promClient from 'prom-client';

// Metrics for Configuration Manager
const httpRequestDuration = new promClient.Histogram({
  name: 'configuration_manager_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds for Configuration Manager',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
  name: 'configuration_manager_http_requests_total',
  help: 'Total number of HTTP requests for Configuration Manager',
  labelNames: ['method', 'route', 'status']
});

const configurationOperations = new promClient.Counter({
  name: 'configuration_operations_total',
  help: 'Total number of configuration operations',
  labelNames: ['operation', 'status', 'configType']
});

const configurationValidations = new promClient.Counter({
  name: 'configuration_validations_total',
  help: 'Total number of configuration validations',
  labelNames: ['status', 'validationType']
});

const configurationBackups = new promClient.Counter({
  name: 'configuration_backups_total',
  help: 'Total number of configuration backup operations',
  labelNames: ['operation', 'status']
});

const configurationDrift = new promClient.Gauge({
  name: 'configuration_drift_detected',
  help: 'Number of configurations with detected drift',
  labelNames: ['severity']
});

// Register metrics
promClient.register.registerMetric(httpRequestDuration);
promClient.register.registerMetric(httpRequestTotal);
promClient.register.registerMetric(configurationOperations);
promClient.register.registerMetric(configurationValidations);
promClient.register.registerMetric(configurationBackups);
promClient.register.registerMetric(configurationDrift);

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
export const recordConfigurationOperation = (operation: string, status: 'success' | 'error', configType: string) => {
  configurationOperations.labels(operation, status, configType).inc();
};

export const recordConfigurationValidation = (status: 'valid' | 'invalid', validationType: string) => {
  configurationValidations.labels(status, validationType).inc();
};

export const recordConfigurationBackup = (operation: string, status: 'success' | 'error') => {
  configurationBackups.labels(operation, status).inc();
};

export const updateConfigurationDrift = (severity: string, count: number) => {
  configurationDrift.labels(severity).set(count);
};