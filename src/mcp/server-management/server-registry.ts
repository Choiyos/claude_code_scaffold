/**
 * MCP Server Registry
 * Service discovery, registration, and health monitoring for MCP servers
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/metrics-collector';
import { MCPServerConfig, MCPServerInstance } from '../mcp-server-orchestrator';

export interface ServerRegistryConfig {
  discovery: {
    enabled: boolean;
    mechanisms: ('consul' | 'etcd' | 'kubernetes' | 'dns' | 'static')[];
    interval: number;
    timeout: number;
  };
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    unhealthyThreshold: number;
    healthyThreshold: number;
    endpoints: {
      http?: string;
      tcp?: { host: string; port: number };
      custom?: string;
    };
  };
  loadBalancing: {
    strategy: 'round-robin' | 'least-connections' | 'weighted' | 'consistent-hash';
    weights?: Record<string, number>;
    consistentHashConfig?: {
      replicas: number;
      hashFunction: 'sha1' | 'md5' | 'crc32';
    };
  };
  failover: {
    enabled: boolean;
    maxFailures: number;
    recoveryTime: number;
    fallbackServers: string[];
  };
  persistence: {
    enabled: boolean;
    storage: 'file' | 'redis' | 'database';
    config: Record<string, any>;
  };
}

export interface ServerMetadata {
  id: string;
  name: string;
  type: string;
  version: string;
  endpoint: string;
  protocol: 'ws' | 'http' | 'tcp';
  status: 'healthy' | 'unhealthy' | 'unknown' | 'draining';
  lastSeen: Date;
  registeredAt: Date;
  metadata: Record<string, any>;
  tags: string[];
  capabilities: string[];
  weight: number;
  region?: string;
  datacenter?: string;
  healthCheck: {
    lastCheck: Date;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    responseTime: number;
  };
  metrics: {
    requests: number;
    errors: number;
    averageResponseTime: number;
    connections: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

export class ServerRegistry extends EventEmitter {
  private servers: Map<string, ServerMetadata> = new Map();
  private serviceGroups: Map<string, Set<string>> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private discoveryInterval?: NodeJS.Timeout;
  private loadBalancer: LoadBalancer;
  private persistenceManager: PersistenceManager;
  private logger: Logger;
  private metrics: MetricsCollector;
  private isShuttingDown = false;

  constructor(private config: ServerRegistryConfig) {
    super();
    this.logger = new Logger('ServerRegistry');
    this.metrics = new MetricsCollector();
    this.loadBalancer = new LoadBalancer(config.loadBalancing);
    this.persistenceManager = new PersistenceManager(config.persistence);

    this.startHealthChecks();
    this.startServiceDiscovery();
    this.setupGracefulShutdown();
  }

  /**
   * Register a new MCP server
   */
  async registerServer(
    serverConfig: MCPServerConfig,
    metadata?: Partial<ServerMetadata>
  ): Promise<void> {
    const serverId = this.generateServerId(serverConfig.name);
    
    const serverMetadata: ServerMetadata = {
      id: serverId,
      name: serverConfig.name,
      type: serverConfig.type,
      version: serverConfig.version,
      endpoint: `${serverConfig.endpoint}:${serverConfig.port}`,
      protocol: serverConfig.protocol,
      status: 'unknown',
      lastSeen: new Date(),
      registeredAt: new Date(),
      metadata: { ...serverConfig.environment, ...metadata?.metadata },
      tags: [...(serverConfig.labels ? Object.keys(serverConfig.labels) : []), ...(metadata?.tags || [])],
      capabilities: this.extractCapabilities(serverConfig),
      weight: metadata?.weight || 1,
      region: metadata?.region,
      datacenter: metadata?.datacenter,
      healthCheck: {
        lastCheck: new Date(0),
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        responseTime: 0
      },
      metrics: {
        requests: 0,
        errors: 0,
        averageResponseTime: 0,
        connections: 0,
        cpuUsage: 0,
        memoryUsage: 0
      }
    };

    this.servers.set(serverId, serverMetadata);
    this.addToServiceGroup(serverConfig.type, serverId);

    // Persist registration
    if (this.config.persistence.enabled) {
      await this.persistenceManager.saveServer(serverMetadata);
    }

    // Perform initial health check
    await this.performHealthCheck(serverMetadata);

    this.logger.info(`Registered server: ${serverConfig.name} (${serverId})`);
    this.emit('server:registered', { serverId, metadata: serverMetadata });
  }

  /**
   * Unregister an MCP server
   */
  async unregisterServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      this.logger.warn(`Attempted to unregister unknown server: ${serverId}`);
      return;
    }

    this.servers.delete(serverId);
    this.removeFromServiceGroup(server.type, serverId);

    // Remove from persistence
    if (this.config.persistence.enabled) {
      await this.persistenceManager.removeServer(serverId);
    }

    this.logger.info(`Unregistered server: ${server.name} (${serverId})`);
    this.emit('server:unregistered', { serverId, metadata: server });
  }

  /**
   * Get server by ID
   */
  getServer(serverId: string): ServerMetadata | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get all servers of a specific type
   */
  getServersByType(serverType: string): ServerMetadata[] {
    const serverIds = this.serviceGroups.get(serverType) || new Set();
    return Array.from(serverIds)
      .map(id => this.servers.get(id))
      .filter((server): server is ServerMetadata => server !== undefined);
  }

  /**
   * Get healthy servers of a specific type
   */
  getHealthyServersByType(serverType: string): ServerMetadata[] {
    return this.getServersByType(serverType)
      .filter(server => server.status === 'healthy');
  }

  /**
   * Select a server using load balancing strategy
   */
  selectServer(
    serverType: string,
    requestMetadata?: {
      affinityKey?: string;
      preferredRegion?: string;
      requiredCapabilities?: string[];
    }
  ): ServerMetadata | null {
    let candidates = this.getHealthyServersByType(serverType);

    // Filter by region preference
    if (requestMetadata?.preferredRegion) {
      const regionalCandidates = candidates.filter(
        server => server.region === requestMetadata.preferredRegion
      );
      if (regionalCandidates.length > 0) {
        candidates = regionalCandidates;
      }
    }

    // Filter by required capabilities
    if (requestMetadata?.requiredCapabilities) {
      candidates = candidates.filter(server =>
        requestMetadata.requiredCapabilities!.every(cap =>
          server.capabilities.includes(cap)
        )
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    return this.loadBalancer.selectServer(candidates, requestMetadata);
  }

  /**
   * Update server metrics
   */
  updateServerMetrics(
    serverId: string,
    metrics: Partial<ServerMetadata['metrics']>
  ): void {
    const server = this.servers.get(serverId);
    if (!server) {
      return;
    }

    server.metrics = { ...server.metrics, ...metrics };
    server.lastSeen = new Date();

    this.emit('server:metrics_updated', { serverId, metrics: server.metrics });
  }

  /**
   * Mark server as draining (graceful shutdown)
   */
  async drainServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    server.status = 'draining';
    this.logger.info(`Server ${server.name} (${serverId}) is draining`);
    this.emit('server:draining', { serverId, metadata: server });
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalServers: number;
    healthyServers: number;
    unhealthyServers: number;
    drainingServers: number;
    serversByType: Record<string, number>;
    averageResponseTime: number;
    totalRequests: number;
    totalErrors: number;
  } {
    const servers = Array.from(this.servers.values());
    const serversByType: Record<string, number> = {};

    for (const server of servers) {
      serversByType[server.type] = (serversByType[server.type] || 0) + 1;
    }

    const totalRequests = servers.reduce((sum, s) => sum + s.metrics.requests, 0);
    const totalErrors = servers.reduce((sum, s) => sum + s.metrics.errors, 0);
    const totalResponseTime = servers.reduce((sum, s) => sum + s.metrics.averageResponseTime, 0);

    return {
      totalServers: servers.length,
      healthyServers: servers.filter(s => s.status === 'healthy').length,
      unhealthyServers: servers.filter(s => s.status === 'unhealthy').length,
      drainingServers: servers.filter(s => s.status === 'draining').length,
      serversByType,
      averageResponseTime: servers.length > 0 ? totalResponseTime / servers.length : 0,
      totalRequests,
      totalErrors
    };
  }

  /**
   * Search servers by tags and capabilities
   */
  searchServers(criteria: {
    tags?: string[];
    capabilities?: string[];
    region?: string;
    status?: ServerMetadata['status'];
    type?: string;
  }): ServerMetadata[] {
    return Array.from(this.servers.values()).filter(server => {
      if (criteria.type && server.type !== criteria.type) {
        return false;
      }

      if (criteria.status && server.status !== criteria.status) {
        return false;
      }

      if (criteria.region && server.region !== criteria.region) {
        return false;
      }

      if (criteria.tags && !criteria.tags.every(tag => server.tags.includes(tag))) {
        return false;
      }

      if (criteria.capabilities && 
          !criteria.capabilities.every(cap => server.capabilities.includes(cap))) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get server health report
   */
  getHealthReport(): {
    timestamp: Date;
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    servers: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      lastCheck: Date;
      responseTime: number;
      consecutiveFailures: number;
    }>;
    summary: {
      healthy: number;
      unhealthy: number;
      unknown: number;
      draining: number;
    };
  } {
    const servers = Array.from(this.servers.values());
    const summary = {
      healthy: servers.filter(s => s.status === 'healthy').length,
      unhealthy: servers.filter(s => s.status === 'unhealthy').length,
      unknown: servers.filter(s => s.status === 'unknown').length,
      draining: servers.filter(s => s.status === 'draining').length
    };

    let overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    const healthyPercentage = summary.healthy / servers.length;

    if (healthyPercentage >= 0.9) {
      overallHealth = 'healthy';
    } else if (healthyPercentage >= 0.5) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'unhealthy';
    }

    return {
      timestamp: new Date(),
      overallHealth,
      servers: servers.map(server => ({
        id: server.id,
        name: server.name,
        type: server.type,
        status: server.status,
        lastCheck: server.healthCheck.lastCheck,
        responseTime: server.healthCheck.responseTime,
        consecutiveFailures: server.healthCheck.consecutiveFailures
      })),
      summary
    };
  }

  /**
   * Shutdown the registry
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down server registry...');

    // Stop intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    // Save current state
    if (this.config.persistence.enabled) {
      await this.persistenceManager.saveAll(Array.from(this.servers.values()));
    }

    this.emit('registry:shutdown');
    this.logger.info('Server registry shutdown complete');
  }

  // Private methods

  private startHealthChecks(): void {
    if (!this.config.healthCheck.enabled) {
      return;
    }

    this.healthCheckInterval = setInterval(
      () => this.performAllHealthChecks(),
      this.config.healthCheck.interval
    );
  }

  private startServiceDiscovery(): void {
    if (!this.config.discovery.enabled) {
      return;
    }

    this.discoveryInterval = setInterval(
      () => this.performServiceDiscovery(),
      this.config.discovery.interval
    );
  }

  private async performAllHealthChecks(): Promise<void> {
    const servers = Array.from(this.servers.values());
    const healthCheckPromises = servers.map(server => 
      this.performHealthCheck(server).catch(error => 
        this.logger.error(`Health check failed for ${server.id}:`, error)
      )
    );

    await Promise.all(healthCheckPromises);
  }

  private async performHealthCheck(server: ServerMetadata): Promise<void> {
    const startTime = Date.now();

    try {
      let isHealthy = false;

      switch (server.protocol) {
        case 'http':
          isHealthy = await this.performHttpHealthCheck(server);
          break;
        case 'ws':
          isHealthy = await this.performWebSocketHealthCheck(server);
          break;
        case 'tcp':
          isHealthy = await this.performTcpHealthCheck(server);
          break;
        default:
          this.logger.warn(`Unknown protocol for health check: ${server.protocol}`);
          return;
      }

      const responseTime = Date.now() - startTime;
      server.healthCheck.lastCheck = new Date();
      server.healthCheck.responseTime = responseTime;

      if (isHealthy) {
        server.healthCheck.consecutiveFailures = 0;
        server.healthCheck.consecutiveSuccesses++;

        if (server.healthCheck.consecutiveSuccesses >= this.config.healthCheck.healthyThreshold) {
          if (server.status !== 'healthy' && server.status !== 'draining') {
            server.status = 'healthy';
            this.logger.info(`Server ${server.name} (${server.id}) is now healthy`);
            this.emit('server:healthy', { serverId: server.id, metadata: server });
          }
        }
      } else {
        server.healthCheck.consecutiveSuccesses = 0;
        server.healthCheck.consecutiveFailures++;

        if (server.healthCheck.consecutiveFailures >= this.config.healthCheck.unhealthyThreshold) {
          if (server.status !== 'unhealthy') {
            server.status = 'unhealthy';
            this.logger.warn(`Server ${server.name} (${server.id}) is now unhealthy`);
            this.emit('server:unhealthy', { serverId: server.id, metadata: server });
          }
        }
      }

    } catch (error) {
      server.healthCheck.consecutiveFailures++;
      server.healthCheck.responseTime = Date.now() - startTime;
      
      this.logger.error(`Health check error for ${server.name} (${server.id}):`, error);
    }
  }

  private async performHttpHealthCheck(server: ServerMetadata): Promise<boolean> {
    const healthCheckUrl = server.endpoint + (this.config.healthCheck.endpoints.http || '/health');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheck.timeout);

      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'claude-env-registry/1.0'
        }
      });

      clearTimeout(timeoutId);
      return response.ok;

    } catch (error) {
      return false;
    }
  }

  private async performWebSocketHealthCheck(server: ServerMetadata): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const WebSocket = require('ws');
        const ws = new WebSocket(server.endpoint);
        
        const timeout = setTimeout(() => {
          ws.terminate();
          resolve(false);
        }, this.config.healthCheck.timeout);

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        });

        ws.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });

      } catch (error) {
        resolve(false);
      }
    });
  }

  private async performTcpHealthCheck(server: ServerMetadata): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const net = require('net');
        const [host, port] = server.endpoint.split(':');
        
        const socket = net.createConnection({
          host,
          port: parseInt(port),
          timeout: this.config.healthCheck.timeout
        });

        socket.on('connect', () => {
          socket.end();
          resolve(true);
        });

        socket.on('error', () => {
          resolve(false);
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });

      } catch (error) {
        resolve(false);
      }
    });
  }

  private async performServiceDiscovery(): Promise<void> {
    // Implementation would depend on the discovery mechanism
    // For now, this is a placeholder
    this.logger.debug('Performing service discovery...');
  }

  private generateServerId(serverName: string): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `${serverName}-${timestamp}-${random}`;
  }

  private extractCapabilities(config: MCPServerConfig): string[] {
    const capabilities: string[] = [];
    
    // Extract capabilities based on server type and configuration
    switch (config.type) {
      case 'context7':
        capabilities.push('documentation', 'search', 'library-resolution');
        break;
      case 'sequential':
        capabilities.push('analysis', 'reasoning', 'problem-solving');
        break;
      case 'magic':
        capabilities.push('ui-generation', 'component-creation', 'design-system');
        break;
      case 'playwright':
        capabilities.push('browser-automation', 'testing', 'performance-monitoring');
        break;
    }

    // Add custom capabilities from labels
    if (config.labels && config.labels.capabilities) {
      capabilities.push(...config.labels.capabilities.split(','));
    }

    return capabilities;
  }

  private addToServiceGroup(serverType: string, serverId: string): void {
    if (!this.serviceGroups.has(serverType)) {
      this.serviceGroups.set(serverType, new Set());
    }
    this.serviceGroups.get(serverType)!.add(serverId);
  }

  private removeFromServiceGroup(serverType: string, serverId: string): void {
    const group = this.serviceGroups.get(serverType);
    if (group) {
      group.delete(serverId);
      if (group.size === 0) {
        this.serviceGroups.delete(serverType);
      }
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async () => {
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }
}

/**
 * Load Balancer for server selection
 */
class LoadBalancer {
  private roundRobinCounters: Map<string, number> = new Map();
  private consistentHashRing?: ConsistentHashRing;

  constructor(private config: ServerRegistryConfig['loadBalancing']) {
    if (config.strategy === 'consistent-hash') {
      this.consistentHashRing = new ConsistentHashRing(
        config.consistentHashConfig?.replicas || 150,
        config.consistentHashConfig?.hashFunction || 'sha1'
      );
    }
  }

  selectServer(
    servers: ServerMetadata[],
    requestMetadata?: { affinityKey?: string }
  ): ServerMetadata {
    switch (this.config.strategy) {
      case 'round-robin':
        return this.roundRobinSelection(servers);
      case 'least-connections':
        return this.leastConnectionsSelection(servers);
      case 'weighted':
        return this.weightedSelection(servers);
      case 'consistent-hash':
        return this.consistentHashSelection(servers, requestMetadata?.affinityKey);
      default:
        return servers[0];
    }
  }

  private roundRobinSelection(servers: ServerMetadata[]): ServerMetadata {
    const key = servers.map(s => s.id).sort().join(',');
    const counter = this.roundRobinCounters.get(key) || 0;
    const index = counter % servers.length;
    this.roundRobinCounters.set(key, counter + 1);
    return servers[index];
  }

  private leastConnectionsSelection(servers: ServerMetadata[]): ServerMetadata {
    return servers.reduce((least, current) =>
      current.metrics.connections < least.metrics.connections ? current : least
    );
  }

  private weightedSelection(servers: ServerMetadata[]): ServerMetadata {
    const totalWeight = servers.reduce((sum, server) => 
      sum + (this.config.weights?.[server.name] || server.weight), 0
    );

    let random = Math.random() * totalWeight;
    
    for (const server of servers) {
      const weight = this.config.weights?.[server.name] || server.weight;
      random -= weight;
      if (random <= 0) {
        return server;
      }
    }

    return servers[0];
  }

  private consistentHashSelection(
    servers: ServerMetadata[],
    affinityKey?: string
  ): ServerMetadata {
    if (!this.consistentHashRing || !affinityKey) {
      return this.roundRobinSelection(servers);
    }

    // Update ring with current servers
    this.consistentHashRing.updateServers(servers.map(s => s.id));
    
    const selectedId = this.consistentHashRing.getServer(affinityKey);
    return servers.find(s => s.id === selectedId) || servers[0];
  }
}

/**
 * Consistent Hash Ring implementation
 */
class ConsistentHashRing {
  private ring: Map<number, string> = new Map();
  private sortedHashes: number[] = [];

  constructor(
    private replicas: number,
    private hashFunction: 'sha1' | 'md5' | 'crc32'
  ) {}

  updateServers(serverIds: string[]): void {
    this.ring.clear();
    this.sortedHashes = [];

    for (const serverId of serverIds) {
      for (let i = 0; i < this.replicas; i++) {
        const hash = this.hash(`${serverId}:${i}`);
        this.ring.set(hash, serverId);
        this.sortedHashes.push(hash);
      }
    }

    this.sortedHashes.sort((a, b) => a - b);
  }

  getServer(key: string): string | null {
    if (this.sortedHashes.length === 0) {
      return null;
    }

    const hash = this.hash(key);
    
    // Find first hash >= key hash
    let index = this.sortedHashes.findIndex(h => h >= hash);
    if (index === -1) {
      index = 0; // Wrap around
    }

    const selectedHash = this.sortedHashes[index];
    return this.ring.get(selectedHash) || null;
  }

  private hash(input: string): number {
    // Simple hash implementation - use proper crypto in production
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Persistence Manager for server registry data
 */
class PersistenceManager {
  private logger: Logger;

  constructor(private config: ServerRegistryConfig['persistence']) {
    this.logger = new Logger('PersistenceManager');
  }

  async saveServer(server: ServerMetadata): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Implementation would depend on storage type
    this.logger.debug(`Saving server: ${server.id}`);
  }

  async removeServer(serverId: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.logger.debug(`Removing server: ${serverId}`);
  }

  async saveAll(servers: ServerMetadata[]): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.logger.debug(`Saving ${servers.length} servers`);
  }

  async loadAll(): Promise<ServerMetadata[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Implementation would load from storage
    return [];
  }
}