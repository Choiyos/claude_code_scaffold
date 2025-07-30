import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createLogger } from './logger';
import { ServiceUnavailableError } from './errors';

const logger = createLogger('service-registry');

export interface ServiceEndpoint {
  name: string;
  url: string;
  version: string;
  health: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date | null;
  retryCount: number;
  timeout: number;
}

export interface ServiceRegistryOptions {
  healthCheckInterval?: number;
  retryAttempts?: number;
  circuitBreakerThreshold?: number;
  timeout?: number;
}

export class ServiceRegistry extends EventEmitter {
  private services: Map<string, ServiceEndpoint> = new Map();
  private httpClients: Map<string, AxiosInstance> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private options: Required<ServiceRegistryOptions>;

  constructor(options: ServiceRegistryOptions = {}) {
    super();
    
    this.options = {
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      retryAttempts: options.retryAttempts || 3,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      timeout: options.timeout || 5000
    };
  }

  register(service: Omit<ServiceEndpoint, 'status' | 'lastCheck' | 'retryCount'>): void {
    const endpoint: ServiceEndpoint = {
      ...service,
      status: 'unknown',
      lastCheck: null,
      retryCount: 0
    };

    this.services.set(service.name, endpoint);
    
    // Create HTTP client for this service
    const client = axios.create({
      baseURL: service.url,
      timeout: endpoint.timeout || this.options.timeout,
      headers: {
        'User-Agent': 'Claude-Environment-Service-Registry/1.0'
      }
    });

    // Add request interceptor for logging
    client.interceptors.request.use(
      (config) => {
        logger.debug(`Service request: ${service.name}`, {
          method: config.method,
          url: config.url,
          timeout: config.timeout
        });
        return config;
      },
      (error) => {
        logger.error(`Service request error: ${service.name}`, error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    client.interceptors.response.use(
      (response) => {
        logger.debug(`Service response: ${service.name}`, {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        logger.error(`Service response error: ${service.name}`, {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );

    this.httpClients.set(service.name, client);

    logger.info(`Service registered: ${service.name}`, {
      url: service.url,
      version: service.version,
      health: service.health
    });

    this.emit('service-registered', endpoint);
  }

  unregister(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (service) {
      this.services.delete(serviceName);
      this.httpClients.delete(serviceName);
      
      logger.info(`Service unregistered: ${serviceName}`);
      this.emit('service-unregistered', service);
    }
  }

  getService(serviceName: string): ServiceEndpoint | null {
    return this.services.get(serviceName) || null;
  }

  getAllServices(): ServiceEndpoint[] {
    return Array.from(this.services.values());
  }

  getHealthyServices(): ServiceEndpoint[] {
    return Array.from(this.services.values()).filter(
      service => service.status === 'healthy'
    );
  }

  async callService<T = any>(
    serviceName: string,
    endpoint: string,
    options: AxiosRequestConfig = {}
  ): Promise<T> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new ServiceUnavailableError(serviceName, { reason: 'Service not registered' });
    }

    if (service.status === 'unhealthy' && service.retryCount >= this.options.circuitBreakerThreshold) {
      throw new ServiceUnavailableError(serviceName, { 
        reason: 'Circuit breaker open',
        retryCount: service.retryCount 
      });
    }

    const client = this.httpClients.get(serviceName);
    if (!client) {
      throw new ServiceUnavailableError(serviceName, { reason: 'HTTP client not found' });
    }

    try {
      const response = await client.request<T>({
        url: endpoint,
        method: 'GET',
        ...options
      });

      // Reset retry count on successful call
      if (service.retryCount > 0) {
        service.retryCount = 0;
        this.services.set(serviceName, service);
      }

      return response.data;
    } catch (error: any) {
      // Increment retry count
      service.retryCount++;
      this.services.set(serviceName, service);

      logger.error(`Service call failed: ${serviceName}${endpoint}`, {
        error: error.message,
        retryCount: service.retryCount,
        status: error.response?.status
      });

      throw new ServiceUnavailableError(serviceName, {
        reason: 'Service call failed',
        error: error.message,
        retryCount: service.retryCount,
        status: error.response?.status
      });
    }
  }

  async healthCheck(serviceName?: string): Promise<void> {
    const services = serviceName 
      ? [this.services.get(serviceName)].filter(Boolean) as ServiceEndpoint[]
      : Array.from(this.services.values());

    const healthCheckPromises = services.map(async (service) => {
      try {
        const client = this.httpClients.get(service.name);
        if (!client) {
          throw new Error('HTTP client not found');
        }

        const response = await client.get(service.health);
        
        const wasUnhealthy = service.status === 'unhealthy';
        service.status = 'healthy';
        service.lastCheck = new Date();
        service.retryCount = 0;
        
        this.services.set(service.name, service);

        if (wasUnhealthy) {
          logger.info(`Service recovered: ${service.name}`);
          this.emit('service-recovered', service);
        }

        logger.debug(`Health check passed: ${service.name}`, {
          status: response.status,
          responseTime: response.headers['x-response-time']
        });

      } catch (error: any) {
        const wasHealthy = service.status === 'healthy';
        service.status = 'unhealthy';
        service.lastCheck = new Date();
        service.retryCount++;
        
        this.services.set(service.name, service);

        if (wasHealthy) {
          logger.warn(`Service became unhealthy: ${service.name}`, {
            error: error.message,
            retryCount: service.retryCount
          });
          this.emit('service-unhealthy', service);
        }

        logger.debug(`Health check failed: ${service.name}`, {
          error: error.message,
          retryCount: service.retryCount
        });
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  startHealthChecking(): void {
    if (this.healthCheckInterval) {
      logger.warn('Health checking is already running');
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        logger.error('Health check interval failed:', error);
      }
    }, this.options.healthCheckInterval);

    logger.info('Health checking started', {
      interval: this.options.healthCheckInterval
    });
  }

  stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Health checking stopped');
    }
  }

  getServiceStats(): any {
    const services = Array.from(this.services.values());
    
    return {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      unknown: services.filter(s => s.status === 'unknown').length,
      averageRetryCount: services.reduce((sum, s) => sum + s.retryCount, 0) / services.length || 0,
      services: services.map(s => ({
        name: s.name,
        status: s.status,
        retryCount: s.retryCount,
        lastCheck: s.lastCheck
      }))
    };
  }

  shutdown(): void {
    this.stopHealthChecking();
    this.services.clear();
    this.httpClients.clear();
    this.removeAllListeners();
    logger.info('Service registry shutdown completed');
  }
}

// Global service registry instance
let globalRegistry: ServiceRegistry | null = null;

export const getServiceRegistry = (): ServiceRegistry => {
  if (!globalRegistry) {
    globalRegistry = new ServiceRegistry();
  }
  return globalRegistry;
};

export const createServiceRegistry = (options?: ServiceRegistryOptions): ServiceRegistry => {
  return new ServiceRegistry(options);
};