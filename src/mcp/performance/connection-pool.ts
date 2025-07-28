/**
 * Connection Pool Manager for MCP Servers
 * Optimizes connection reuse, multiplexing, and resource management
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/metrics-collector';
import { WebSocketProtocol, WebSocketConnectionConfig } from '../communication/websocket-protocol';
import { HTTPProtocol, HTTPClientConfig } from '../communication/http-protocol';

export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxLifetime: number;
  validationInterval: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'random';
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    maxFailures: number;
  };
  retry: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
  };
}

export interface PooledConnection {
  id: string;
  protocol: 'ws' | 'http' | 'tcp';
  connection: WebSocketProtocol | HTTPProtocol | any;
  endpoint: string;
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
  isActive: boolean;
  isHealthy: boolean;
  metadata: {
    responseTime: number;
    errorCount: number;
    successCount: number;
    bytesTransferred: number;
  };
}

export interface ConnectionRequest {
  id: string;
  endpoint: string;
  protocol: 'ws' | 'http' | 'tcp';
  priority: 'low' | 'normal' | 'high';
  timeout: number;
  metadata?: Record<string, any>;
  resolve: (connection: PooledConnection) => void;
  reject: (error: Error) => void;
  timestamp: Date;
}

export class ConnectionPoolManager extends EventEmitter {
  private pools: Map<string, ConnectionPool> = new Map();
  private logger: Logger;
  private metrics: MetricsCollector;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.logger = new Logger('ConnectionPoolManager');
    this.metrics = new MetricsCollector();
    this.startMonitoring();
  }

  /**
   * Create a new connection pool
   */
  createPool(
    name: string,
    endpoint: string,
    protocol: 'ws' | 'http' | 'tcp',
    config: ConnectionPoolConfig,
    connectionConfig: WebSocketConnectionConfig | HTTPClientConfig | any
  ): void {
    if (this.pools.has(name)) {
      throw new Error(`Connection pool already exists: ${name}`);
    }

    const pool = new ConnectionPool(
      name,
      endpoint,
      protocol,
      config,
      connectionConfig
    );

    this.pools.set(name, pool);
    
    // Forward pool events
    pool.on('connection:created', (event) => this.emit('connection:created', { pool: name, ...event }));
    pool.on('connection:acquired', (event) => this.emit('connection:acquired', { pool: name, ...event }));
    pool.on('connection:released', (event) => this.emit('connection:released', { pool: name, ...event }));
    pool.on('connection:removed', (event) => this.emit('connection:removed', { pool: name, ...event }));
    pool.on('pool:exhausted', (event) => this.emit('pool:exhausted', { pool: name, ...event }));

    this.logger.info(`Created connection pool: ${name} for ${endpoint}`);
  }

  /**
   * Remove a connection pool
   */
  async removePool(name: string): Promise<void> {
    const pool = this.pools.get(name);
    if (!pool) {
      throw new Error(`Connection pool not found: ${name}`);
    }

    await pool.destroy();
    this.pools.delete(name);
    
    this.logger.info(`Removed connection pool: ${name}`);
  }

  /**
   * Acquire a connection from a pool
   */
  async acquireConnection(
    poolName: string,
    options?: {
      timeout?: number;
      priority?: 'low' | 'normal' | 'high';
      metadata?: Record<string, any>;
    }
  ): Promise<PooledConnection> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Connection pool not found: ${poolName}`);
    }

    return pool.acquire(options);
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(poolName: string, connection: PooledConnection): Promise<void> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Connection pool not found: ${poolName}`);
    }

    return pool.release(connection);
  }

  /**
   * Get pool statistics
   */
  getPoolStats(poolName?: string): Record<string, any> {
    if (poolName) {
      const pool = this.pools.get(poolName);
      return pool ? pool.getStats() : {};
    }

    const stats: Record<string, any> = {};
    for (const [name, pool] of this.pools.entries()) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  /**
   * Get all pool names
   */
  getPoolNames(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Destroy all pools
   */
  async destroy(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    const destroyPromises = Array.from(this.pools.values()).map(pool => pool.destroy());
    await Promise.all(destroyPromises);
    
    this.pools.clear();
    this.logger.info('Connection pool manager destroyed');
  }

  // Private methods

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Collect metrics every 30 seconds
  }

  private collectMetrics(): void {
    for (const [name, pool] of this.pools.entries()) {
      const stats = pool.getStats();
      this.metrics.recordPoolStats(name, stats);
    }
  }
}

/**
 * Individual Connection Pool
 */
class ConnectionPool extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map();
  private availableConnections: Set<string> = new Set();
  private pendingRequests: ConnectionRequest[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private validationInterval?: NodeJS.Timeout;
  private logger: Logger;
  private metrics: MetricsCollector;
  private isDestroyed = false;

  constructor(
    private name: string,
    private endpoint: string,
    private protocol: 'ws' | 'http' | 'tcp',
    private config: ConnectionPoolConfig,
    private connectionConfig: any
  ) {
    super();
    this.logger = new Logger(`ConnectionPool:${name}`);
    this.metrics = new MetricsCollector();

    this.startHealthChecks();
    this.startValidation();
    this.initializeMinConnections();
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(options?: {
    timeout?: number;
    priority?: 'low' | 'normal' | 'high';
    metadata?: Record<string, any>;
  }): Promise<PooledConnection> {
    if (this.isDestroyed) {
      throw new Error('Connection pool has been destroyed');
    }

    const timeout = options?.timeout || this.config.acquireTimeout;
    const priority = options?.priority || 'normal';

    // Try to get an available connection immediately
    const availableConnection = this.getAvailableConnection();
    if (availableConnection) {
      this.markConnectionAsUsed(availableConnection);
      this.emit('connection:acquired', { connectionId: availableConnection.id });
      return availableConnection;
    }

    // Create new connection if under max limit
    if (this.connections.size < this.config.maxConnections) {
      try {
        const newConnection = await this.createConnection();
        this.markConnectionAsUsed(newConnection);
        this.emit('connection:acquired', { connectionId: newConnection.id });
        return newConnection;
      } catch (error) {
        this.logger.error('Failed to create new connection:', error);
      }
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      const request: ConnectionRequest = {
        id: this.generateRequestId(),
        endpoint: this.endpoint,
        protocol: this.protocol,
        priority,
        timeout,
        metadata: options?.metadata,
        resolve,
        reject,
        timestamp: new Date()
      };

      // Insert request based on priority
      this.insertRequestByPriority(request);

      // Set timeout
      setTimeout(() => {
        const index = this.pendingRequests.findIndex(r => r.id === request.id);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
          reject(new Error('Connection acquire timeout'));
        }
      }, timeout);

      this.emit('pool:exhausted', { queueLength: this.pendingRequests.length });
    });
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: PooledConnection): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    if (!this.connections.has(connection.id)) {
      this.logger.warn(`Attempted to release unknown connection: ${connection.id}`);
      return;
    }

    connection.lastUsed = new Date();
    connection.isActive = false;

    // Check if connection is still healthy
    if (!connection.isHealthy || this.shouldEvictConnection(connection)) {
      await this.removeConnection(connection.id);
      return;
    }

    // Make connection available
    this.availableConnections.add(connection.id);

    // Process pending requests
    if (this.pendingRequests.length > 0) {
      const request = this.pendingRequests.shift()!;
      this.markConnectionAsUsed(connection);
      request.resolve(connection);
      this.emit('connection:acquired', { connectionId: connection.id });
    }

    this.emit('connection:released', { connectionId: connection.id });
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    availableConnections: number;
    activeConnections: number;
    pendingRequests: number;
    healthyConnections: number;
    averageResponseTime: number;
    totalRequests: number;
    totalErrors: number;
  } {
    const connections = Array.from(this.connections.values());
    const totalResponseTime = connections.reduce((sum, c) => sum + c.metadata.responseTime, 0);
    const totalRequests = connections.reduce((sum, c) => sum + c.usageCount, 0);
    const totalErrors = connections.reduce((sum, c) => sum + c.metadata.errorCount, 0);

    return {
      totalConnections: this.connections.size,
      availableConnections: this.availableConnections.size,
      activeConnections: connections.filter(c => c.isActive).length,
      pendingRequests: this.pendingRequests.length,
      healthyConnections: connections.filter(c => c.isHealthy).length,
      averageResponseTime: connections.length > 0 ? totalResponseTime / connections.length : 0,
      totalRequests,
      totalErrors
    };
  }

  /**
   * Destroy the pool
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Reject pending requests
    for (const request of this.pendingRequests) {
      request.reject(new Error('Connection pool destroyed'));
    }
    this.pendingRequests = [];

    // Close intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(id => 
      this.removeConnection(id)
    );
    await Promise.all(closePromises);

    this.logger.info(`Connection pool destroyed: ${this.name}`);
  }

  // Private methods

  private async initializeMinConnections(): Promise<void> {
    const connectionsToCreate = this.config.minConnections;
    const createPromises: Promise<void>[] = [];

    for (let i = 0; i < connectionsToCreate; i++) {
      createPromises.push(
        this.createConnection().then(connection => {
          this.availableConnections.add(connection.id);
        }).catch(error => {
          this.logger.error(`Failed to create initial connection ${i}:`, error);
        })
      );
    }

    await Promise.allSettled(createPromises);
    this.logger.info(`Initialized ${this.availableConnections.size}/${connectionsToCreate} connections`);
  }

  private async createConnection(): Promise<PooledConnection> {
    const connectionId = this.generateConnectionId();
    
    let connection: WebSocketProtocol | HTTPProtocol | any;

    switch (this.protocol) {
      case 'ws':
        connection = new WebSocketProtocol(this.connectionConfig as WebSocketConnectionConfig);
        await connection.connect();
        break;
        
      case 'http':
        connection = new HTTPProtocol(this.connectionConfig as HTTPClientConfig);
        break;
        
      case 'tcp':
        // TCP connection implementation
        throw new Error('TCP protocol not yet implemented');
        
      default:
        throw new Error(`Unsupported protocol: ${this.protocol}`);
    }

    const pooledConnection: PooledConnection = {
      id: connectionId,
      protocol: this.protocol,
      connection,
      endpoint: this.endpoint,
      createdAt: new Date(),
      lastUsed: new Date(),
      usageCount: 0,
      isActive: false,
      isHealthy: true,
      metadata: {
        responseTime: 0,
        errorCount: 0,
        successCount: 0,
        bytesTransferred: 0
      }
    };

    this.connections.set(connectionId, pooledConnection);
    this.emit('connection:created', { connectionId });

    return pooledConnection;
  }

  private async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Close the underlying connection
      if (connection.protocol === 'ws' && connection.connection.close) {
        await connection.connection.close();
      }
    } catch (error) {
      this.logger.error(`Error closing connection ${connectionId}:`, error);
    }

    this.connections.delete(connectionId);
    this.availableConnections.delete(connectionId);
    
    this.emit('connection:removed', { connectionId });

    // Maintain minimum connections
    if (this.connections.size < this.config.minConnections && !this.isDestroyed) {
      try {
        const newConnection = await this.createConnection();
        this.availableConnections.add(newConnection.id);
      } catch (error) {
        this.logger.error('Failed to replace removed connection:', error);
      }
    }
  }

  private getAvailableConnection(): PooledConnection | null {
    if (this.availableConnections.size === 0) {
      return null;
    }

    // Apply eviction policy to select connection
    const connectionId = this.selectConnectionByEvictionPolicy();
    if (!connectionId) {
      return null;
    }

    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isHealthy) {
      this.availableConnections.delete(connectionId);
      return this.getAvailableConnection(); // Recurse to find another
    }

    return connection;
  }

  private selectConnectionByEvictionPolicy(): string | null {
    const availableIds = Array.from(this.availableConnections);
    if (availableIds.length === 0) {
      return null;
    }

    switch (this.config.evictionPolicy) {
      case 'lru': // Least Recently Used
        return availableIds.reduce((oldest, current) => {
          const oldestConn = this.connections.get(oldest)!;
          const currentConn = this.connections.get(current)!;
          return currentConn.lastUsed < oldestConn.lastUsed ? current : oldest;
        });

      case 'lfu': // Least Frequently Used
        return availableIds.reduce((leastUsed, current) => {
          const leastUsedConn = this.connections.get(leastUsed)!;
          const currentConn = this.connections.get(current)!;
          return currentConn.usageCount < leastUsedConn.usageCount ? current : leastUsed;
        });

      case 'fifo': // First In, First Out
        return availableIds.reduce((oldest, current) => {
          const oldestConn = this.connections.get(oldest)!;
          const currentConn = this.connections.get(current)!;
          return currentConn.createdAt < oldestConn.createdAt ? current : oldest;
        });

      case 'random':
        return availableIds[Math.floor(Math.random() * availableIds.length)];

      default:
        return availableIds[0];
    }
  }

  private markConnectionAsUsed(connection: PooledConnection): void {
    connection.isActive = true;
    connection.lastUsed = new Date();
    connection.usageCount++;
    this.availableConnections.delete(connection.id);
  }

  private insertRequestByPriority(request: ConnectionRequest): void {
    const priorities = { high: 3, normal: 2, low: 1 };
    const requestPriority = priorities[request.priority];

    let insertIndex = this.pendingRequests.length;
    
    for (let i = 0; i < this.pendingRequests.length; i++) {
      const existingPriority = priorities[this.pendingRequests[i].priority];
      if (requestPriority > existingPriority) {
        insertIndex = i;
        break;
      }
    }

    this.pendingRequests.splice(insertIndex, 0, request);
  }

  private shouldEvictConnection(connection: PooledConnection): boolean {
    const now = Date.now();
    
    // Check idle timeout
    if (now - connection.lastUsed.getTime() > this.config.idleTimeout) {
      return true;
    }

    // Check max lifetime
    if (now - connection.createdAt.getTime() > this.config.maxLifetime) {
      return true;
    }

    // Check error rate
    const totalRequests = connection.metadata.successCount + connection.metadata.errorCount;
    if (totalRequests > 10 && connection.metadata.errorCount / totalRequests > 0.5) {
      return true;
    }

    return false;
  }

  private startHealthChecks(): void {
    if (!this.config.healthCheck.enabled) {
      return;
    }

    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheck.interval
    );
  }

  private startValidation(): void {
    this.validationInterval = setInterval(
      () => this.validateConnections(),
      this.config.validationInterval
    );
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.connections.values())
      .map(connection => this.performHealthCheck(connection));

    await Promise.allSettled(healthCheckPromises);
  }

  private async performHealthCheck(connection: PooledConnection): Promise<void> {
    if (connection.isActive) {
      return; // Skip active connections
    }

    try {
      const startTime = Date.now();
      
      // Perform protocol-specific health check
      let isHealthy = false;
      
      switch (connection.protocol) {
        case 'ws':
          // WebSocket ping/pong
          if (connection.connection.getStats) {
            const stats = connection.connection.getStats();
            isHealthy = stats.connected;
          }
          break;
          
        case 'http':
          // HTTP health check
          try {
            await connection.connection.get('/health', { timeout: this.config.healthCheck.timeout });
            isHealthy = true;
          } catch (error) {
            isHealthy = false;
          }
          break;
      }

      const responseTime = Date.now() - startTime;
      connection.metadata.responseTime = responseTime;

      if (isHealthy) {
        connection.isHealthy = true;
        connection.metadata.successCount++;
      } else {
        connection.metadata.errorCount++;
        
        // Mark as unhealthy after max failures
        if (connection.metadata.errorCount >= this.config.healthCheck.maxFailures) {
          connection.isHealthy = false;
          await this.removeConnection(connection.id);
        }
      }

    } catch (error) {
      connection.metadata.errorCount++;
      connection.isHealthy = false;
      this.logger.debug(`Health check failed for connection ${connection.id}:`, error.message);
    }
  }

  private validateConnections(): void {
    const connectionsToRemove: string[] = [];
    
    for (const [id, connection] of this.connections.entries()) {
      if (this.shouldEvictConnection(connection)) {
        connectionsToRemove.push(id);
      }
    }

    // Remove invalid connections
    for (const id of connectionsToRemove) {
      this.removeConnection(id).catch(error => {
        this.logger.error(`Failed to remove invalid connection ${id}:`, error);
      });
    }
  }

  private generateConnectionId(): string {
    return `${this.name}-conn-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }
}

/**
 * Connection Pool Factory
 */
export class ConnectionPoolFactory {
  private static defaultConfigs: Record<string, Partial<ConnectionPoolConfig>> = {
    development: {
      minConnections: 1,
      maxConnections: 5,
      acquireTimeout: 10000,
      idleTimeout: 30000,
      maxLifetime: 300000, // 5 minutes
      evictionPolicy: 'lru'
    },
    production: {
      minConnections: 5,
      maxConnections: 50,
      acquireTimeout: 30000,
      idleTimeout: 60000,
      maxLifetime: 3600000, // 1 hour
      evictionPolicy: 'lru'
    },
    testing: {
      minConnections: 1,
      maxConnections: 3,
      acquireTimeout: 5000,
      idleTimeout: 10000,
      maxLifetime: 60000, // 1 minute
      evictionPolicy: 'fifo'
    }
  };

  static createConfig(
    environment: 'development' | 'production' | 'testing',
    overrides?: Partial<ConnectionPoolConfig>
  ): ConnectionPoolConfig {
    const baseConfig = this.defaultConfigs[environment] || this.defaultConfigs.development;
    
    return {
      minConnections: 1,
      maxConnections: 10,
      acquireTimeout: 30000,
      idleTimeout: 60000,
      maxLifetime: 3600000,
      validationInterval: 60000,
      evictionPolicy: 'lru',
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
        maxFailures: 3
      },
      retry: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000
      },
      ...baseConfig,
      ...overrides
    };
  }
}