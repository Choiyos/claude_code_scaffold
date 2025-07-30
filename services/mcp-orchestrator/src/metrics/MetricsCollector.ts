import { EventEmitter } from 'events';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { MetricsConfig, RequestMetric, SystemMetric, ServerMetrics } from '../types';
import { MCPServerInstance } from '../orchestrator/MCPServerInstance';
import { Logger } from '../utils/Logger';

export class MetricsCollector extends EventEmitter {
  private config: MetricsConfig;
  private logger: Logger;
  private isRunning: boolean = false;
  private collectTimer?: NodeJS.Timeout;
  private monitoredServers: Map<string, MCPServerInstance> = new Map();

  // Prometheus metrics
  private requestCounter: Counter<string>;
  private requestDuration: Histogram<string>;
  private activeConnections: Gauge<string>;
  private serverStatus: Gauge<string>;
  private systemCpu: Gauge<string>;
  private systemMemory: Gauge<string>;
  private errorCounter: Counter<string>;

  constructor(config?: Partial<MetricsConfig>) {
    super();
    
    this.config = {
      collectInterval: 10000, // 10 seconds
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      aggregationWindow: 60000, // 1 minute
      ...config
    };

    this.logger = new Logger('MetricsCollector');
    
    // Initialize Prometheus metrics
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Enable default metrics collection (CPU, memory, etc.)
    collectDefaultMetrics({
      register,
      prefix: 'mcp_orchestrator_'
    });

    // Request metrics
    this.requestCounter = new Counter({
      name: 'mcp_requests_total',
      help: 'Total number of MCP requests',
      labelNames: ['server_id', 'method', 'status']
    });

    this.requestDuration = new Histogram({
      name: 'mcp_request_duration_seconds',
      help: 'Duration of MCP requests in seconds',
      labelNames: ['server_id', 'method'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10]
    });

    this.activeConnections = new Gauge({
      name: 'mcp_active_connections',
      help: 'Number of active connections per server',
      labelNames: ['server_id']
    });

    this.serverStatus = new Gauge({
      name: 'mcp_server_status',
      help: 'Server status (1 = healthy, 0 = unhealthy)',
      labelNames: ['server_id', 'server_type']
    });

    this.systemCpu = new Gauge({
      name: 'mcp_system_cpu_usage',
      help: 'System CPU usage percentage'
    });

    this.systemMemory = new Gauge({
      name: 'mcp_system_memory_usage',
      help: 'System memory usage percentage'
    });

    this.errorCounter = new Counter({
      name: 'mcp_errors_total',
      help: 'Total number of errors',
      labelNames: ['server_id', 'error_type']
    });

    this.logger.info('Prometheus metrics initialized');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Metrics collector is already running');
      return;
    }

    this.logger.info('Starting metrics collector', { 
      interval: this.config.collectInterval 
    });

    this.isRunning = true;
    this.scheduleNextCollection();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping metrics collector');
    
    if (this.collectTimer) {
      clearTimeout(this.collectTimer);
      this.collectTimer = undefined;
    }

    this.isRunning = false;
    
    // Clear Prometheus registry
    register.clear();
  }

  addServer(server: MCPServerInstance): void {
    const serverId = server.getId();
    
    this.logger.info('Adding server to metrics collection', { serverId });
    this.monitoredServers.set(serverId, server);
    
    // Initialize server metrics
    this.serverStatus.set(
      { server_id: serverId, server_type: server.getType() },
      server.isHealthyServer() ? 1 : 0
    );
    
    this.activeConnections.set({ server_id: serverId }, 0);
  }

  removeServer(serverId: string): void {
    this.logger.info('Removing server from metrics collection', { serverId });
    
    const server = this.monitoredServers.get(serverId);
    if (server) {
      // Remove metrics for this server
      this.serverStatus.remove({ server_id: serverId, server_type: server.getType() });
      this.activeConnections.remove({ server_id: serverId });
      
      this.monitoredServers.delete(serverId);
    }
  }

  recordRequest(
    serverId: string, 
    status: 'success' | 'error' | 'timeout', 
    duration: number,
    method?: string,
    errorMessage?: string
  ): void {
    const labels = {
      server_id: serverId,
      method: method || 'unknown',
      status
    };

    // Record request count
    this.requestCounter.inc(labels);
    
    // Record duration (convert to seconds)
    this.requestDuration.observe(
      { server_id: serverId, method: method || 'unknown' },
      duration / 1000
    );

    // Record errors
    if (status === 'error' && errorMessage) {
      this.errorCounter.inc({
        server_id: serverId,
        error_type: this.categorizeError(errorMessage)
      });
    }

    this.logger.debug('Request metrics recorded', {
      serverId,
      method,
      status,
      duration
    });

    // Emit metrics update event
    this.emit('metrics-updated', {
      type: 'request',
      serverId,
      data: { status, duration, method }
    });
  }

  async getServerMetrics(serverId: string): Promise<ServerMetrics | null> {
    const server = this.monitoredServers.get(serverId);
    if (!server) {
      return null;
    }

    try {
      const status = await server.getStatus();
      
      return {
        requestCount: await this.getRequestCount(serverId),
        errorCount: await this.getErrorCount(serverId),
        averageResponseTime: await this.getAverageResponseTime(serverId),
        cpuUsage: await this.getServerCpuUsage(serverId),
        memoryUsage: await this.getServerMemoryUsage(serverId),
        connectionCount: await this.getConnectionCount(serverId)
      };
    } catch (error) {
      this.logger.error('Failed to get server metrics', { serverId, error });
      return null;
    }
  }

  async getAllMetrics(): Promise<any> {
    const metrics = {
      system: await this.getSystemMetrics(),
      servers: {} as any,
      aggregated: await this.getAggregatedMetrics()
    };

    for (const serverId of this.monitoredServers.keys()) {
      metrics.servers[serverId] = await this.getServerMetrics(serverId);
    }

    return metrics;
  }

  async getPrometheusMetrics(): Promise<string> {
    return register.metrics();
  }

  private scheduleNextCollection(): void {
    if (!this.isRunning) {
      return;
    }

    this.collectTimer = setTimeout(async () => {
      await this.collectMetrics();
      this.scheduleNextCollection();
    }, this.config.collectInterval);
  }

  private async collectMetrics(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.debug('Collecting metrics', { 
        serverCount: this.monitoredServers.size 
      });

      // Collect system metrics
      await this.collectSystemMetrics();
      
      // Collect server metrics
      await this.collectServerMetrics();
      
      // Emit collection complete event
      this.emit('collection-complete');

    } catch (error) {
      this.logger.error('Error during metrics collection', { error });
    }
  }

  private async collectSystemMetrics(): Promise<void> {
    try {
      // Get system metrics (simplified implementation)
      const systemMetrics = await this.getSystemResourceUsage();
      
      this.systemCpu.set(systemMetrics.cpu);
      this.systemMemory.set(systemMetrics.memory);
      
    } catch (error) {
      this.logger.error('Failed to collect system metrics', { error });
    }
  }

  private async collectServerMetrics(): Promise<void> {
    for (const [serverId, server] of this.monitoredServers) {
      try {
        const status = await server.getStatus();
        
        // Update server status
        this.serverStatus.set(
          { server_id: serverId, server_type: server.getType() },
          status.healthy ? 1 : 0
        );
        
        // Update connection count (placeholder)
        this.activeConnections.set({ server_id: serverId }, 0);
        
      } catch (error) {
        this.logger.error('Failed to collect server metrics', { serverId, error });
      }
    }
  }

  private async getSystemResourceUsage(): Promise<SystemMetric> {
    // Simplified system metrics - in production, use proper system monitoring
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    
    return {
      timestamp: Date.now(),
      cpu: 0, // Placeholder - would calculate from cpuUsage
      memory: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      disk: 0, // Placeholder
      network: {
        bytesIn: 0,
        bytesOut: 0
      }
    };
  }

  private async getRequestCount(serverId: string): Promise<number> {
    // Get from Prometheus counter
    const metric = await register.getSingleMetric('mcp_requests_total') as Counter<string>;
    return metric ? 0 : 0; // Placeholder - would get actual count
  }

  private async getErrorCount(serverId: string): Promise<number> {
    // Get from Prometheus counter
    const metric = await register.getSingleMetric('mcp_errors_total') as Counter<string>;
    return metric ? 0 : 0; // Placeholder
  }

  private async getAverageResponseTime(serverId: string): Promise<number> {
    // Calculate from histogram
    const metric = await register.getSingleMetric('mcp_request_duration_seconds') as Histogram<string>;
    return metric ? 0 : 0; // Placeholder
  }

  private async getServerCpuUsage(serverId: string): Promise<number> {
    // Would get from container stats or process monitoring
    return 0; // Placeholder
  }

  private async getServerMemoryUsage(serverId: string): Promise<number> {
    // Would get from container stats or process monitoring
    return 0; // Placeholder
  }

  private async getConnectionCount(serverId: string): Promise<number> {
    // Get from gauge
    const metric = await register.getSingleMetric('mcp_active_connections') as Gauge<string>;
    return metric ? 0 : 0; // Placeholder
  }

  private async getSystemMetrics(): Promise<SystemMetric> {
    return this.getSystemResourceUsage();
  }

  private async getAggregatedMetrics(): Promise<any> {
    return {
      totalRequests: 0, // Aggregate from all servers
      totalErrors: 0,
      averageResponseTime: 0,
      throughput: 0, // Requests per second
      errorRate: 0 // Percentage
    };
  }

  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes('timeout')) return 'timeout';
    if (errorMessage.includes('connection')) return 'connection';
    if (errorMessage.includes('validation')) return 'validation';
    if (errorMessage.includes('authentication')) return 'auth';
    return 'unknown';
  }

  // Configuration and management
  updateConfig(newConfig: Partial<MetricsConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Metrics collector configuration updated', { config: this.config });
  }

  getConfig(): MetricsConfig {
    return { ...this.config };
  }

  getStats(): any {
    return {
      isRunning: this.isRunning,
      monitoredServers: this.monitoredServers.size,
      config: this.config,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }
}