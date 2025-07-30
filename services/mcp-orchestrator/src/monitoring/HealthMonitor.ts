import { EventEmitter } from 'events';
import { HealthCheckConfig, HealthCheckResult } from '../types';
import { MCPServerInstance } from '../orchestrator/MCPServerInstance';
import { Logger } from '../utils/Logger';

export class HealthMonitor extends EventEmitter {
  private config: HealthCheckConfig;
  private logger: Logger;
  private monitoredServers: Map<string, MonitoredServer> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config?: Partial<HealthCheckConfig>) {
    super();
    
    this.config = {
      interval: 30000, // 30 seconds
      timeout: 5000,   // 5 seconds
      retries: 3,
      failureThreshold: 3,
      recoveryThreshold: 2,
      ...config
    };

    this.logger = new Logger('HealthMonitor');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Health monitor is already running');
      return;
    }

    this.logger.info('Starting health monitor', { 
      interval: this.config.interval,
      timeout: this.config.timeout 
    });

    this.isRunning = true;
    this.scheduleNextHealthCheck();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping health monitor');
    
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.isRunning = false;
    this.monitoredServers.clear();
  }

  monitor(server: MCPServerInstance): void {
    const serverId = server.getId();
    
    if (this.monitoredServers.has(serverId)) {
      this.logger.warn('Server is already being monitored', { serverId });
      return;
    }

    this.logger.info('Adding server to health monitoring', { serverId });
    
    this.monitoredServers.set(serverId, {
      server,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheckTime: 0,
      lastCheckResult: null,
      isHealthy: true
    });

    // Perform immediate health check
    this.performHealthCheck(serverId);
  }

  unmonitor(serverId: string): void {
    if (this.monitoredServers.has(serverId)) {
      this.logger.info('Removing server from health monitoring', { serverId });
      this.monitoredServers.delete(serverId);
    }
  }

  async getServerHealth(serverId: string): Promise<HealthCheckResult | null> {
    const monitored = this.monitoredServers.get(serverId);
    return monitored?.lastCheckResult || null;
  }

  getAllServerHealth(): Record<string, HealthCheckResult | null> {
    const health: Record<string, HealthCheckResult | null> = {};
    
    for (const [serverId, monitored] of this.monitoredServers) {
      health[serverId] = monitored.lastCheckResult;
    }
    
    return health;
  }

  getHealthyServers(): string[] {
    return Array.from(this.monitoredServers.entries())
      .filter(([_, monitored]) => monitored.isHealthy)
      .map(([serverId]) => serverId);
  }

  getUnhealthyServers(): string[] {
    return Array.from(this.monitoredServers.entries())
      .filter(([_, monitored]) => !monitored.isHealthy)
      .map(([serverId]) => serverId);
  }

  private scheduleNextHealthCheck(): void {
    if (!this.isRunning) {
      return;
    }

    this.healthCheckTimer = setTimeout(() => {
      this.performAllHealthChecks();
      this.scheduleNextHealthCheck();
    }, this.config.interval);
  }

  private async performAllHealthChecks(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.debug('Performing health checks', { 
      serverCount: this.monitoredServers.size 
    });

    const healthCheckPromises = Array.from(this.monitoredServers.keys()).map(
      serverId => this.performHealthCheck(serverId)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  private async performHealthCheck(serverId: string): Promise<void> {
    const monitored = this.monitoredServers.get(serverId);
    
    if (!monitored) {
      return;
    }

    const startTime = Date.now();
    
    try {
      this.logger.debug('Performing health check', { serverId });

      // Perform the actual health check with timeout
      const isHealthy = await Promise.race([
        monitored.server.healthCheck(),
        this.createTimeoutPromise()
      ]);

      const responseTime = Date.now() - startTime;
      
      const result: HealthCheckResult = {
        serverId,
        healthy: isHealthy,
        responseTime,
        timestamp: Date.now()
      };

      this.processHealthCheckResult(serverId, result);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      const result: HealthCheckResult = {
        serverId,
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };

      this.processHealthCheckResult(serverId, result);
    }
  }

  private processHealthCheckResult(serverId: string, result: HealthCheckResult): void {
    const monitored = this.monitoredServers.get(serverId);
    
    if (!monitored) {
      return;
    }

    monitored.lastCheckTime = result.timestamp;
    monitored.lastCheckResult = result;

    if (result.healthy) {
      monitored.consecutiveFailures = 0;
      monitored.consecutiveSuccesses++;

      // Check if server has recovered
      if (!monitored.isHealthy && 
          monitored.consecutiveSuccesses >= this.config.recoveryThreshold) {
        
        this.logger.info('Server has recovered', { 
          serverId, 
          consecutiveSuccesses: monitored.consecutiveSuccesses 
        });
        
        monitored.isHealthy = true;
        this.emit('server-recovered', serverId);
      }

    } else {
      monitored.consecutiveSuccesses = 0;
      monitored.consecutiveFailures++;

      this.logger.warn('Health check failed', { 
        serverId, 
        error: result.error,
        consecutiveFailures: monitored.consecutiveFailures
      });

      // Check if server should be marked unhealthy
      if (monitored.isHealthy && 
          monitored.consecutiveFailures >= this.config.failureThreshold) {
        
        this.logger.error('Server marked as unhealthy', { 
          serverId, 
          consecutiveFailures: monitored.consecutiveFailures 
        });
        
        monitored.isHealthy = false;
        this.emit('server-unhealthy', serverId);
      }
    }

    // Emit health check result
    this.emit('health-check-completed', result);
    
    this.logger.debug('Health check result processed', {
      serverId,
      healthy: result.healthy,
      responseTime: result.responseTime,
      consecutiveFailures: monitored.consecutiveFailures,
      consecutiveSuccesses: monitored.consecutiveSuccesses
    });
  }

  private createTimeoutPromise(): Promise<boolean> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Health check timeout'));
      }, this.config.timeout);
    });
  }

  // Statistics and reporting
  getMonitoringStats(): any {
    const stats = {
      totalServers: this.monitoredServers.size,
      healthyServers: this.getHealthyServers().length,
      unhealthyServers: this.getUnhealthyServers().length,
      isRunning: this.isRunning,
      config: this.config,
      servers: {} as any
    };

    for (const [serverId, monitored] of this.monitoredServers) {
      stats.servers[serverId] = {
        isHealthy: monitored.isHealthy,
        consecutiveFailures: monitored.consecutiveFailures,
        consecutiveSuccesses: monitored.consecutiveSuccesses,
        lastCheckTime: monitored.lastCheckTime,
        lastResponseTime: monitored.lastCheckResult?.responseTime,
        lastError: monitored.lastCheckResult?.error
      };
    }

    return stats;
  }

  // Manual health check trigger
  async triggerHealthCheck(serverId?: string): Promise<void> {
    if (serverId) {
      await this.performHealthCheck(serverId);
    } else {
      await this.performAllHealthChecks();
    }
  }

  // Configuration updates
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Health monitor configuration updated', { config: this.config });
  }

  // Health check history (simplified implementation)
  getHealthHistory(serverId: string, limit: number = 100): HealthCheckResult[] {
    // In a real implementation, this would return historical data
    // For now, return the last result if available
    const monitored = this.monitoredServers.get(serverId);
    return monitored?.lastCheckResult ? [monitored.lastCheckResult] : [];
  }
}

interface MonitoredServer {
  server: MCPServerInstance;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckTime: number;
  lastCheckResult: HealthCheckResult | null;
  isHealthy: boolean;
}