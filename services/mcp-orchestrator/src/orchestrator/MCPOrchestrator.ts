import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { MCPServerInstance } from './MCPServerInstance';
import { LoadBalancer } from '../balancer/LoadBalancer';
import { HealthMonitor } from '../monitoring/HealthMonitor';
import { ConfigManager } from '../config/ConfigManager';
import { MetricsCollector } from '../metrics/MetricsCollector';
import { Logger } from '../utils/Logger';
import { 
  MCPServerConfig, 
  MCPRequest, 
  MCPResponse, 
  OrchestratorOptions,
  ServerStatus 
} from '../types';

export class MCPOrchestrator extends EventEmitter {
  private servers: Map<string, MCPServerInstance> = new Map();
  private loadBalancer: LoadBalancer;
  private healthMonitor: HealthMonitor;
  private configManager: ConfigManager;
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private requestQueue: Map<string, MCPRequest[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(options: OrchestratorOptions) {
    super();
    this.loadBalancer = options.loadBalancer;
    this.healthMonitor = options.healthMonitor;
    this.configManager = options.configManager;
    this.metricsCollector = options.metricsCollector;
    this.logger = options.logger;

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Health monitor events
    this.healthMonitor.on('server-unhealthy', (serverId: string) => {
      this.handleServerUnhealthy(serverId);
    });

    this.healthMonitor.on('server-recovered', (serverId: string) => {
      this.handleServerRecovered(serverId);
    });

    // Load balancer events
    this.loadBalancer.on('server-overloaded', (serverId: string) => {
      this.handleServerOverloaded(serverId);
    });
  }

  async registerServer(config: MCPServerConfig): Promise<void> {
    const serverId = config.id || uuidv4();
    
    try {
      this.logger.info('Registering MCP server', { serverId, type: config.type });

      // Create server instance
      const instance = new MCPServerInstance(serverId, config, this.logger);
      
      // Initialize the server
      await instance.initialize();
      
      // Add to our registry
      this.servers.set(serverId, instance);
      
      // Register with load balancer
      this.loadBalancer.addServer(instance);
      
      // Start health monitoring
      this.healthMonitor.monitor(instance);
      
      // Setup circuit breaker
      this.circuitBreakers.set(serverId, new CircuitBreaker(serverId, {
        failureThreshold: 5,
        resetTimeout: 30000,
        monitoringPeriod: 60000
      }));

      // Start metrics collection for this server
      this.metricsCollector.addServer(instance);

      this.emit('server-registered', { serverId, config });
      this.logger.info('MCP server registered successfully', { serverId });

    } catch (error) {
      this.logger.error('Failed to register MCP server', { serverId, error });
      throw error;
    }
  }

  async unregisterServer(serverId: string): Promise<void> {
    const instance = this.servers.get(serverId);
    
    if (!instance) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      this.logger.info('Unregistering MCP server', { serverId });

      // Remove from load balancer
      this.loadBalancer.removeServer(instance);
      
      // Stop health monitoring
      this.healthMonitor.unmonitor(serverId);
      
      // Remove circuit breaker
      this.circuitBreakers.delete(serverId);
      
      // Stop metrics collection
      this.metricsCollector.removeServer(serverId);
      
      // Shutdown the instance
      await instance.shutdown();
      
      // Remove from registry
      this.servers.delete(serverId);

      this.emit('server-unregistered', { serverId });
      this.logger.info('MCP server unregistered successfully', { serverId });

    } catch (error) {
      this.logger.error('Failed to unregister MCP server', { serverId, error });
      throw error;
    }
  }

  async routeRequest(request: MCPRequest): Promise<MCPResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      this.logger.debug('Routing MCP request', { requestId, method: request.method });

      // Select appropriate server
      const server = this.loadBalancer.selectServer(request);
      
      if (!server) {
        throw new Error('No healthy MCP servers available');
      }

      const serverId = server.getId();
      const circuitBreaker = this.circuitBreakers.get(serverId);

      // Check circuit breaker
      if (circuitBreaker && circuitBreaker.isOpen()) {
        throw new Error(`Circuit breaker open for server ${serverId}`);
      }

      // Execute request
      const response = await this.executeRequest(server, request, requestId);
      
      // Record success metrics
      const duration = Date.now() - startTime;
      this.metricsCollector.recordRequest(serverId, 'success', duration);
      
      if (circuitBreaker) {
        circuitBreaker.recordSuccess();
      }

      this.logger.debug('Request routed successfully', { 
        requestId, 
        serverId, 
        duration 
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Request routing failed', { requestId, error, duration });
      
      // Record failure metrics
      if (error instanceof Error) {
        this.metricsCollector.recordRequest('unknown', 'error', duration, error.message);
      }

      throw error;
    }
  }

  private async executeRequest(
    server: MCPServerInstance, 
    request: MCPRequest, 
    requestId: string
  ): Promise<MCPResponse> {
    const serverId = server.getId();
    
    try {
      // Add request to queue for monitoring
      if (!this.requestQueue.has(serverId)) {
        this.requestQueue.set(serverId, []);
      }
      this.requestQueue.get(serverId)!.push(request);

      // Execute the request
      const response = await server.handleRequest(request);
      
      // Remove from queue
      const queue = this.requestQueue.get(serverId);
      if (queue) {
        const index = queue.indexOf(request);
        if (index > -1) {
          queue.splice(index, 1);
        }
      }

      return response;

    } catch (error) {
      // Handle server error
      await this.handleServerError(server, error as Error, requestId);
      throw error;
    }
  }

  private async handleServerError(
    server: MCPServerInstance, 
    error: Error, 
    requestId: string
  ): Promise<void> {
    const serverId = server.getId();
    
    this.logger.warn('Server error occurred', { 
      serverId, 
      requestId, 
      error: error.message 
    });

    // Record error in circuit breaker
    const circuitBreaker = this.circuitBreakers.get(serverId);
    if (circuitBreaker) {
      circuitBreaker.recordFailure();
    }

    // Update server error count
    server.recordError(error);

    // Check if server should be marked unhealthy
    if (server.getErrorCount() > 3) {
      this.logger.warn('Server marked as unhealthy due to errors', { serverId });
      server.markUnhealthy();
      this.emit('server-health-changed', { serverId, healthy: false });

      // Schedule recovery attempt
      setTimeout(() => {
        this.attemptServerRecovery(serverId);
      }, 30000);
    }
  }

  private handleServerUnhealthy(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.markUnhealthy();
      this.loadBalancer.markServerUnhealthy(serverId);
      this.emit('server-health-changed', { serverId, healthy: false });
    }
  }

  private handleServerRecovered(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.markHealthy();
      server.resetErrorCount();
      this.loadBalancer.markServerHealthy(serverId);
      this.emit('server-health-changed', { serverId, healthy: true });
    }
  }

  private handleServerOverloaded(serverId: string): void {
    this.logger.warn('Server is overloaded', { serverId });
    
    // Could implement auto-scaling here
    this.emit('server-overloaded', { serverId });
  }

  private async attemptServerRecovery(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    
    if (!server) {
      return;
    }

    try {
      this.logger.info('Attempting server recovery', { serverId });
      
      // Try to restart the server
      await server.restart();
      
      // Reset circuit breaker
      const circuitBreaker = this.circuitBreakers.get(serverId);
      if (circuitBreaker) {
        circuitBreaker.reset();
      }

      this.logger.info('Server recovery successful', { serverId });
      
    } catch (error) {
      this.logger.error('Server recovery failed', { serverId, error });
      
      // Schedule another recovery attempt
      setTimeout(() => {
        this.attemptServerRecovery(serverId);
      }, 60000);
    }
  }

  async getServerList(): Promise<ServerStatus[]> {
    const servers: ServerStatus[] = [];
    
    for (const [serverId, instance] of this.servers) {
      const status = await instance.getStatus();
      const metrics = await this.metricsCollector.getServerMetrics(serverId);
      
      servers.push({
        id: serverId,
        type: instance.getType(),
        status: status.status,
        healthy: status.healthy,
        uptime: status.uptime,
        metrics,
        lastHealthCheck: status.lastHealthCheck
      });
    }
    
    return servers;
  }

  async getServerMetrics(serverId?: string): Promise<any> {
    if (serverId) {
      return this.metricsCollector.getServerMetrics(serverId);
    }
    return this.metricsCollector.getAllMetrics();
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP Orchestrator...');
    
    // Shutdown all servers
    const shutdownPromises = Array.from(this.servers.values()).map(
      server => server.shutdown()
    );
    
    await Promise.all(shutdownPromises);
    
    // Clear all data structures
    this.servers.clear();
    this.requestQueue.clear();
    this.circuitBreakers.clear();
    
    this.logger.info('MCP Orchestrator shutdown complete');
  }
}

// Circuit Breaker implementation
class CircuitBreaker {
  private serverId: string;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private options: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  };

  constructor(serverId: string, options: any) {
    this.serverId = serverId;
    this.options = options;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
}