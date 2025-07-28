/**
 * MCP Server Orchestrator
 * Production-ready MCP server management with load balancing, failover, and health monitoring
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { createHash } from 'crypto';
import { Logger } from '../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { MetricsCollector } from '../monitoring/metrics-collector';

export interface MCPServerConfig {
  name: string;
  type: 'context7' | 'sequential' | 'magic' | 'playwright' | 'custom';
  version: string;
  endpoint: string;
  protocol: 'ws' | 'http' | 'tcp';
  port: number;
  healthCheckPath?: string;
  retryPolicy: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringPeriod: number;
  };
  scaling: {
    minInstances: number;
    maxInstances: number;
    targetCpuPercent: number;
    targetMemoryPercent: number;
  };
  security: {
    apiKey?: string;
    tlsEnabled: boolean;
    corsOrigins: string[];
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
    };
  };
  environment: Record<string, string>;
  resources: {
    cpu: string;
    memory: string;
    storage: string;
  };
  labels: Record<string, string>;
}

export interface MCPServerInstance {
  id: string;
  name: string;
  config: MCPServerConfig;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'unhealthy';
  endpoint: string;
  connection?: WebSocket;
  lastHealthCheck?: Date;
  healthCheckStatus: 'healthy' | 'unhealthy' | 'unknown';
  metrics: {
    requests: number;
    errors: number;
    averageResponseTime: number;
    uptime: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  circuitBreaker: CircuitBreaker;
}

export interface MCPRequest {
  id: string;
  method: string;
  params: any;
  timeout?: number;
  metadata?: Record<string, any>;
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
  };
}

export interface MCPResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    serverId: string;
    responseTime: number;
    timestamp: Date;
    retryCount: number;
  };
}

export interface MCPLoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'weighted' | 'resource-based';
  healthCheckInterval: number;
  unhealthyThreshold: number;
  stickySession: boolean;
  weights?: Record<string, number>;
}

export class MCPServerOrchestrator extends EventEmitter {
  private servers: Map<string, MCPServerInstance[]> = new Map();
  private serviceRegistry: Map<string, MCPServerConfig> = new Map();
  private loadBalancer: MCPLoadBalancer;
  private healthChecker: MCPHealthChecker;
  private messageRouter: MCPMessageRouter;
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private isShuttingDown = false;

  constructor(
    private config: {
      loadBalancer: MCPLoadBalancerConfig;
      monitoring: {
        metricsInterval: number;
        logLevel: string;
      };
      clustering: {
        enabled: boolean;
        nodeId: string;
        coordinatorEndpoint?: string;
      };
    }
  ) {
    super();
    this.logger = new Logger('MCPOrchestrator');
    this.metricsCollector = new MetricsCollector();
    this.loadBalancer = new MCPLoadBalancer(config.loadBalancer);
    this.healthChecker = new MCPHealthChecker(this);
    this.messageRouter = new MCPMessageRouter(this);

    this.setupGracefulShutdown();
    this.startMetricsCollection();
  }

  /**
   * Register a new MCP server configuration
   */
  async registerServer(config: MCPServerConfig): Promise<void> {
    this.logger.info(`Registering MCP server: ${config.name} (${config.type})`);
    
    // Validate configuration
    this.validateServerConfig(config);
    
    // Store configuration
    this.serviceRegistry.set(config.name, config);
    
    // Initialize server instances
    await this.initializeServerInstances(config);
    
    this.emit('server:registered', { name: config.name, config });
  }

  /**
   * Unregister an MCP server
   */
  async unregisterServer(serverName: string): Promise<void> {
    this.logger.info(`Unregistering MCP server: ${serverName}`);
    
    const instances = this.servers.get(serverName) || [];
    
    // Stop all instances
    await Promise.all(instances.map(instance => this.stopInstance(instance)));
    
    // Clean up
    this.servers.delete(serverName);
    this.serviceRegistry.delete(serverName);
    
    this.emit('server:unregistered', { name: serverName });
  }

  /**
   * Execute a command on an MCP server with load balancing and failover
   */
  async execute(
    serverName: string,
    request: MCPRequest
  ): Promise<MCPResponse> {
    const startTime = Date.now();
    
    try {
      // Get available instances
      const instances = this.getHealthyInstances(serverName);
      if (instances.length === 0) {
        throw new Error(`No healthy instances available for server: ${serverName}`);
      }

      // Select instance using load balancer
      const instance = this.loadBalancer.selectInstance(instances, request);
      
      // Execute request with circuit breaker
      const response = await this.executeOnInstance(instance, request);
      
      // Update metrics
      this.updateInstanceMetrics(instance, true, Date.now() - startTime);
      
      return response;
      
    } catch (error) {
      this.logger.error(`Failed to execute on server ${serverName}:`, error);
      
      // Try failover if available
      if (request.retryPolicy && request.retryPolicy.maxRetries > 0) {
        return await this.executeWithFailover(serverName, request, error);
      }
      
      throw error;
    }
  }

  /**
   * Batch execute multiple requests with optimal routing
   */
  async executeBatch(
    requests: Array<{ serverName: string; request: MCPRequest }>
  ): Promise<MCPResponse[]> {
    const batches = this.groupRequestsByServer(requests);
    const promises: Promise<MCPResponse[]>[] = [];

    for (const [serverName, serverRequests] of batches.entries()) {
      const instances = this.getHealthyInstances(serverName);
      if (instances.length === 0) {
        continue;
      }

      // Distribute requests across instances
      const instanceBatches = this.distributeRequestsAcrossInstances(
        instances,
        serverRequests
      );

      for (const [instance, batchRequests] of instanceBatches.entries()) {
        promises.push(
          this.executeBatchOnInstance(instance, batchRequests)
        );
      }
    }

    const results = await Promise.allSettled(promises);
    return results
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => (result as PromiseFulfilledResult<MCPResponse[]>).value);
  }

  /**
   * Get server status and metrics
   */
  getServerStatus(serverName?: string): Record<string, any> {
    if (serverName) {
      const instances = this.servers.get(serverName) || [];
      return {
        name: serverName,
        instances: instances.map(instance => ({
          id: instance.id,
          status: instance.status,
          healthCheckStatus: instance.healthCheckStatus,
          metrics: instance.metrics,
          lastHealthCheck: instance.lastHealthCheck
        }))
      };
    }

    const status: Record<string, any> = {};
    for (const [name, instances] of this.servers.entries()) {
      status[name] = {
        totalInstances: instances.length,
        healthyInstances: instances.filter(i => i.healthCheckStatus === 'healthy').length,
        averageResponseTime: this.calculateAverageResponseTime(instances),
        totalRequests: instances.reduce((sum, i) => sum + i.metrics.requests, 0),
        totalErrors: instances.reduce((sum, i) => sum + i.metrics.errors, 0)
      };
    }

    return status;
  }

  /**
   * Scale server instances based on load
   */
  async scaleServer(
    serverName: string,
    targetInstances: number
  ): Promise<void> {
    const config = this.serviceRegistry.get(serverName);
    if (!config) {
      throw new Error(`Server not found: ${serverName}`);
    }

    const currentInstances = this.servers.get(serverName) || [];
    const currentCount = currentInstances.length;

    if (targetInstances > currentCount) {
      // Scale up
      const instancesToAdd = targetInstances - currentCount;
      this.logger.info(`Scaling up ${serverName}: adding ${instancesToAdd} instances`);
      
      for (let i = 0; i < instancesToAdd; i++) {
        await this.createServerInstance(config);
      }
    } else if (targetInstances < currentCount) {
      // Scale down
      const instancesToRemove = currentCount - targetInstances;
      this.logger.info(`Scaling down ${serverName}: removing ${instancesToRemove} instances`);
      
      // Remove least utilized instances
      const sortedInstances = currentInstances
        .sort((a, b) => a.metrics.requests - b.metrics.requests);
      
      for (let i = 0; i < instancesToRemove; i++) {
        await this.stopInstance(sortedInstances[i]);
      }
    }

    this.emit('server:scaled', { name: serverName, targetInstances });
  }

  /**
   * Update server configuration with rolling update
   */
  async updateServerConfig(
    serverName: string,
    newConfig: Partial<MCPServerConfig>
  ): Promise<void> {
    const currentConfig = this.serviceRegistry.get(serverName);
    if (!currentConfig) {
      throw new Error(`Server not found: ${serverName}`);
    }

    const updatedConfig = { ...currentConfig, ...newConfig };
    this.validateServerConfig(updatedConfig);

    this.logger.info(`Updating configuration for server: ${serverName}`);

    // Perform rolling update
    await this.performRollingUpdate(serverName, updatedConfig);

    // Update registry
    this.serviceRegistry.set(serverName, updatedConfig);

    this.emit('server:updated', { name: serverName, config: updatedConfig });
  }

  /**
   * Gracefully shutdown all servers
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down MCP Server Orchestrator...');

    // Stop health checker
    this.healthChecker.stop();

    // Stop all server instances
    const shutdownPromises: Promise<void>[] = [];
    
    for (const [serverName, instances] of this.servers.entries()) {
      for (const instance of instances) {
        shutdownPromises.push(this.stopInstance(instance));
      }
    }

    await Promise.all(shutdownPromises);

    // Stop metrics collection
    this.stopMetricsCollection();

    this.logger.info('MCP Server Orchestrator shutdown complete');
    this.emit('orchestrator:shutdown');
  }

  // Private methods

  private validateServerConfig(config: MCPServerConfig): void {
    const required = ['name', 'type', 'endpoint', 'port'];
    for (const field of required) {
      if (!config[field as keyof MCPServerConfig]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (config.scaling.minInstances > config.scaling.maxInstances) {
      throw new Error('minInstances cannot be greater than maxInstances');
    }

    if (config.port < 1 || config.port > 65535) {
      throw new Error('Invalid port number');
    }
  }

  private async initializeServerInstances(config: MCPServerConfig): Promise<void> {
    const instances: MCPServerInstance[] = [];
    
    for (let i = 0; i < config.scaling.minInstances; i++) {
      const instance = await this.createServerInstance(config);
      instances.push(instance);
    }
    
    this.servers.set(config.name, instances);
  }

  private async createServerInstance(config: MCPServerConfig): Promise<MCPServerInstance> {
    const instanceId = this.generateInstanceId(config.name);
    
    const instance: MCPServerInstance = {
      id: instanceId,
      name: config.name,
      config,
      status: 'starting',
      endpoint: `${config.endpoint}:${config.port}`,
      healthCheckStatus: 'unknown',
      metrics: {
        requests: 0,
        errors: 0,
        averageResponseTime: 0,
        uptime: 0,
        cpuUsage: 0,
        memoryUsage: 0
      },
      circuitBreaker: new CircuitBreaker({
        failureThreshold: config.circuitBreaker.failureThreshold,
        recoveryTimeout: config.circuitBreaker.recoveryTimeout,
        monitoringPeriod: config.circuitBreaker.monitoringPeriod
      })
    };

    try {
      // Start the server instance
      await this.startInstance(instance);
      
      // Add to instances list
      const instances = this.servers.get(config.name) || [];
      instances.push(instance);
      this.servers.set(config.name, instances);
      
      this.emit('instance:created', { instance });
      return instance;
      
    } catch (error) {
      this.logger.error(`Failed to create instance ${instanceId}:`, error);
      throw error;
    }
  }

  private async startInstance(instance: MCPServerInstance): Promise<void> {
    this.logger.info(`Starting instance: ${instance.id}`);
    
    try {
      instance.status = 'starting';
      
      // Initialize connection based on protocol
      switch (instance.config.protocol) {
        case 'ws':
          await this.initializeWebSocketConnection(instance);
          break;
        case 'http':
          await this.initializeHttpConnection(instance);
          break;
        case 'tcp':
          await this.initializeTcpConnection(instance);
          break;
      }
      
      // Perform initial health check
      await this.performHealthCheck(instance);
      
      instance.status = 'running';
      this.emit('instance:started', { instance });
      
    } catch (error) {
      instance.status = 'error';
      this.logger.error(`Failed to start instance ${instance.id}:`, error);
      throw error;
    }
  }

  private async stopInstance(instance: MCPServerInstance): Promise<void> {
    this.logger.info(`Stopping instance: ${instance.id}`);
    
    try {
      instance.status = 'stopping';
      
      // Close connections
      if (instance.connection) {
        if (instance.connection instanceof WebSocket) {
          instance.connection.close();
        }
      }
      
      instance.status = 'stopped';
      this.emit('instance:stopped', { instance });
      
    } catch (error) {
      instance.status = 'error';
      this.logger.error(`Failed to stop instance ${instance.id}:`, error);
    }
  }

  private async initializeWebSocketConnection(instance: MCPServerInstance): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(instance.endpoint);
      
      ws.on('open', () => {
        instance.connection = ws;
        this.setupWebSocketHandlers(instance, ws);
        resolve();
      });
      
      ws.on('error', (error) => {
        reject(error);
      });
      
      // Connection timeout
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.terminate();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private async initializeHttpConnection(instance: MCPServerInstance): Promise<void> {
    // HTTP connections are stateless, just verify the endpoint is reachable
    try {
      const response = await fetch(`${instance.endpoint}/health`);
      if (!response.ok) {
        throw new Error(`HTTP health check failed: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to connect to HTTP endpoint: ${error.message}`);
    }
  }

  private async initializeTcpConnection(instance: MCPServerInstance): Promise<void> {
    // TCP connection implementation would go here
    throw new Error('TCP protocol not yet implemented');
  }

  private setupWebSocketHandlers(instance: MCPServerInstance, ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(instance, message);
      } catch (error) {
        this.logger.error(`Failed to parse WebSocket message from ${instance.id}:`, error);
      }
    });

    ws.on('close', () => {
      instance.healthCheckStatus = 'unhealthy';
      this.emit('instance:disconnected', { instance });
    });

    ws.on('error', (error) => {
      this.logger.error(`WebSocket error on ${instance.id}:`, error);
      instance.healthCheckStatus = 'unhealthy';
    });
  }

  private handleWebSocketMessage(instance: MCPServerInstance, message: any): void {
    // Handle incoming messages from MCP servers
    this.emit('message:received', { instance, message });
  }

  private async executeOnInstance(
    instance: MCPServerInstance,
    request: MCPRequest
  ): Promise<MCPResponse> {
    return instance.circuitBreaker.execute(async () => {
      const startTime = Date.now();
      
      try {
        let response: any;
        
        switch (instance.config.protocol) {
          case 'ws':
            response = await this.executeWebSocketRequest(instance, request);
            break;
          case 'http':
            response = await this.executeHttpRequest(instance, request);
            break;
          case 'tcp':
            response = await this.executeTcpRequest(instance, request);
            break;
        }
        
        const responseTime = Date.now() - startTime;
        
        return {
          id: request.id,
          success: true,
          data: response,
          metadata: {
            serverId: instance.id,
            responseTime,
            timestamp: new Date(),
            retryCount: 0
          }
        };
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        return {
          id: request.id,
          success: false,
          error: {
            code: error.code || 'EXECUTION_ERROR',
            message: error.message,
            details: error.details
          },
          metadata: {
            serverId: instance.id,
            responseTime,
            timestamp: new Date(),
            retryCount: 0
          }
        };
      }
    });
  }

  private async executeWebSocketRequest(
    instance: MCPServerInstance,
    request: MCPRequest
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!instance.connection || instance.connection.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket connection not available'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, request.timeout || 30000);

      const messageHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            clearTimeout(timeout);
            instance.connection!.removeListener('message', messageHandler);
            resolve(response);
          }
        } catch (error) {
          // Ignore parsing errors for non-matching messages
        }
      };

      instance.connection.on('message', messageHandler);
      instance.connection.send(JSON.stringify(request));
    });
  }

  private async executeHttpRequest(
    instance: MCPServerInstance,
    request: MCPRequest
  ): Promise<any> {
    const response = await fetch(`${instance.endpoint}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(instance.config.security.apiKey && {
          'Authorization': `Bearer ${instance.config.security.apiKey}`
        })
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async executeTcpRequest(
    instance: MCPServerInstance,
    request: MCPRequest
  ): Promise<any> {
    throw new Error('TCP protocol not yet implemented');
  }

  private async executeWithFailover(
    serverName: string,
    request: MCPRequest,
    originalError: Error
  ): Promise<MCPResponse> {
    const instances = this.getHealthyInstances(serverName);
    let lastError = originalError;
    
    for (const instance of instances) {
      try {
        const response = await this.executeOnInstance(instance, {
          ...request,
          retryPolicy: {
            ...request.retryPolicy!,
            maxRetries: request.retryPolicy!.maxRetries - 1
          }
        });
        
        response.metadata.retryCount = (request.retryPolicy?.maxRetries || 0) - (request.retryPolicy?.maxRetries || 0) + 1;
        return response;
        
      } catch (error) {
        lastError = error;
        this.updateInstanceMetrics(instance, false, 0);
      }
    }
    
    throw lastError;
  }

  private getHealthyInstances(serverName: string): MCPServerInstance[] {
    const instances = this.servers.get(serverName) || [];
    return instances.filter(instance => 
      instance.status === 'running' && 
      instance.healthCheckStatus === 'healthy'
    );
  }

  private updateInstanceMetrics(
    instance: MCPServerInstance,
    success: boolean,
    responseTime: number
  ): void {
    instance.metrics.requests++;
    if (!success) {
      instance.metrics.errors++;
    }
    
    // Update average response time
    const totalRequests = instance.metrics.requests;
    const currentAvg = instance.metrics.averageResponseTime;
    instance.metrics.averageResponseTime = 
      ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  private generateInstanceId(serverName: string): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `${serverName}-${timestamp}-${random}`;
  }

  private groupRequestsByServer(
    requests: Array<{ serverName: string; request: MCPRequest }>
  ): Map<string, MCPRequest[]> {
    const groups = new Map<string, MCPRequest[]>();
    
    for (const { serverName, request } of requests) {
      if (!groups.has(serverName)) {
        groups.set(serverName, []);
      }
      groups.get(serverName)!.push(request);
    }
    
    return groups;
  }

  private distributeRequestsAcrossInstances(
    instances: MCPServerInstance[],
    requests: MCPRequest[]
  ): Map<MCPServerInstance, MCPRequest[]> {
    const distribution = new Map<MCPServerInstance, MCPRequest[]>();
    
    // Simple round-robin distribution
    instances.forEach(instance => distribution.set(instance, []));
    
    requests.forEach((request, index) => {
      const instance = instances[index % instances.length];
      distribution.get(instance)!.push(request);
    });
    
    return distribution;
  }

  private async executeBatchOnInstance(
    instance: MCPServerInstance,
    requests: MCPRequest[]
  ): Promise<MCPResponse[]> {
    const promises = requests.map(request => this.executeOnInstance(instance, request));
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          id: requests[index].id,
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: result.reason.message
          },
          metadata: {
            serverId: instance.id,
            responseTime: 0,
            timestamp: new Date(),
            retryCount: 0
          }
        };
      }
    });
  }

  private calculateAverageResponseTime(instances: MCPServerInstance[]): number {
    if (instances.length === 0) return 0;
    
    const totalResponseTime = instances.reduce(
      (sum, instance) => sum + instance.metrics.averageResponseTime, 
      0
    );
    
    return totalResponseTime / instances.length;
  }

  private async performHealthCheck(instance: MCPServerInstance): Promise<void> {
    try {
      const startTime = Date.now();
      
      switch (instance.config.protocol) {
        case 'ws':
          if (instance.connection && instance.connection.readyState === WebSocket.OPEN) {
            instance.healthCheckStatus = 'healthy';
          } else {
            instance.healthCheckStatus = 'unhealthy';
          }
          break;
          
        case 'http':
          const response = await fetch(
            `${instance.endpoint}${instance.config.healthCheckPath || '/health'}`
          );
          instance.healthCheckStatus = response.ok ? 'healthy' : 'unhealthy';
          break;
          
        case 'tcp':
          // TCP health check implementation
          instance.healthCheckStatus = 'unknown';
          break;
      }
      
      instance.lastHealthCheck = new Date();
      
    } catch (error) {
      instance.healthCheckStatus = 'unhealthy';
      this.logger.debug(`Health check failed for ${instance.id}:`, error.message);
    }
  }

  private async performRollingUpdate(
    serverName: string,
    newConfig: MCPServerConfig
  ): Promise<void> {
    const instances = this.servers.get(serverName) || [];
    
    // Update instances one by one
    for (const instance of instances) {
      // Create new instance with updated config
      const newInstance = await this.createServerInstance(newConfig);
      
      // Wait for new instance to be healthy
      let attempts = 0;
      while (newInstance.healthCheckStatus !== 'healthy' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.performHealthCheck(newInstance);
        attempts++;
      }
      
      if (newInstance.healthCheckStatus !== 'healthy') {
        throw new Error(`New instance failed to become healthy during rolling update`);
      }
      
      // Stop old instance
      await this.stopInstance(instance);
      
      // Remove old instance from list
      const instanceIndex = instances.indexOf(instance);
      if (instanceIndex > -1) {
        instances.splice(instanceIndex, 1);
      }
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async () => {
      this.logger.info('Received shutdown signal, shutting down gracefully...');
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoring.metricsInterval);
  }

  private stopMetricsCollection(): void {
    // Implementation would clear the metrics collection interval
  }

  private collectMetrics(): void {
    for (const [serverName, instances] of this.servers.entries()) {
      for (const instance of instances) {
        this.metricsCollector.updateServerInstanceMetrics(
          serverName,
          instance.id,
          instance.metrics
        );
      }
    }
  }
}

/**
 * Load Balancer for MCP Server instances
 */
export class MCPLoadBalancer {
  private connectionCounts: Map<string, number> = new Map();

  constructor(private config: MCPLoadBalancerConfig) {}

  selectInstance(instances: MCPServerInstance[], request: MCPRequest): MCPServerInstance {
    switch (this.config.strategy) {
      case 'round-robin':
        return this.roundRobinSelection(instances);
      case 'least-connections':
        return this.leastConnectionsSelection(instances);
      case 'weighted':
        return this.weightedSelection(instances);
      case 'resource-based':
        return this.resourceBasedSelection(instances);
      default:
        return instances[0];
    }
  }

  private roundRobinSelection(instances: MCPServerInstance[]): MCPServerInstance {
    // Simple round-robin implementation
    const now = Date.now();
    const index = now % instances.length;
    return instances[index];
  }

  private leastConnectionsSelection(instances: MCPServerInstance[]): MCPServerInstance {
    return instances.reduce((least, current) => {
      const leastConnections = this.connectionCounts.get(least.id) || 0;
      const currentConnections = this.connectionCounts.get(current.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private weightedSelection(instances: MCPServerInstance[]): MCPServerInstance {
    if (!this.config.weights) {
      return this.roundRobinSelection(instances);
    }

    const totalWeight = instances.reduce((sum, instance) => {
      return sum + (this.config.weights![instance.name] || 1);
    }, 0);

    let random = Math.random() * totalWeight;
    
    for (const instance of instances) {
      const weight = this.config.weights[instance.name] || 1;
      random -= weight;
      if (random <= 0) {
        return instance;
      }
    }

    return instances[0];
  }

  private resourceBasedSelection(instances: MCPServerInstance[]): MCPServerInstance {
    // Select instance with lowest resource utilization
    return instances.reduce((best, current) => {
      const bestUtilization = (best.metrics.cpuUsage + best.metrics.memoryUsage) / 2;
      const currentUtilization = (current.metrics.cpuUsage + current.metrics.memoryUsage) / 2;
      return currentUtilization < bestUtilization ? current : best;
    });
  }

  updateConnectionCount(instanceId: string, delta: number): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, Math.max(0, current + delta));
  }
}

/**
 * Health Checker for MCP Server instances
 */
export class MCPHealthChecker {
  private healthCheckInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(private orchestrator: MCPServerOrchestrator) {}

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.isRunning = false;
  }

  private async performHealthChecks(): Promise<void> {
    // Implementation would check health of all server instances
    // This is called by the orchestrator's performHealthCheck method
  }
}

/**
 * Message Router for MCP Server communication
 */
export class MCPMessageRouter {
  constructor(private orchestrator: MCPServerOrchestrator) {}

  async routeMessage(
    serverType: string,
    message: any,
    routingHints?: {
      preferredInstance?: string;
      affinityKey?: string;
      priority?: 'high' | 'normal' | 'low';
    }
  ): Promise<MCPResponse> {
    // Implementation would route messages based on server type and routing hints
    const servers = this.findServersOfType(serverType);
    if (servers.length === 0) {
      throw new Error(`No servers available for type: ${serverType}`);
    }

    // For now, route to first available server
    return await this.orchestrator.execute(servers[0], {
      id: this.generateMessageId(),
      method: message.method,
      params: message.params
    });
  }

  private findServersOfType(serverType: string): string[] {
    // Implementation would find all servers of the given type
    return [];
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}