import { EventEmitter } from 'events';
import { MCPRequest, LoadBalancerConfig, LoadBalancerStrategy } from '../types';
import { MCPServerInstance } from '../orchestrator/MCPServerInstance';
import { Logger } from '../utils/Logger';

export class LoadBalancer extends EventEmitter {
  private servers: Map<string, MCPServerInstance> = new Map();
  private config: LoadBalancerConfig;
  private strategy: LoadBalancerStrategy;
  private logger: Logger;
  private roundRobinIndex: number = 0;
  private serverWeights: Map<string, number> = new Map();

  constructor(config?: Partial<LoadBalancerConfig>) {
    super();
    
    this.config = {
      strategy: 'resource-based',
      healthCheckInterval: 30000,
      unhealthyThreshold: 3,
      recoveryThreshold: 2,
      ...config
    };

    this.logger = new Logger('LoadBalancer');
    this.strategy = this.createStrategy(this.config.strategy);
  }

  addServer(server: MCPServerInstance): void {
    const serverId = server.getId();
    
    this.servers.set(serverId, server);
    this.serverWeights.set(serverId, 1.0); // Default weight
    
    this.logger.info('Server added to load balancer', { serverId });
    this.emit('server-added', { serverId });
  }

  removeServer(server: MCPServerInstance): void {
    const serverId = server.getId();
    
    this.servers.delete(serverId);
    this.serverWeights.delete(serverId);
    
    this.logger.info('Server removed from load balancer', { serverId });
    this.emit('server-removed', { serverId });
  }

  selectServer(request?: MCPRequest): MCPServerInstance | null {
    const healthyServers = this.getHealthyServers();
    
    if (healthyServers.length === 0) {
      this.logger.warn('No healthy servers available');
      return null;
    }

    const selected = this.strategy.selectServer(healthyServers, request);
    
    if (selected) {
      this.logger.debug('Server selected by load balancer', { 
        serverId: selected.getId(),
        strategy: this.config.strategy,
        availableServers: healthyServers.length
      });
      
      // Check if server is overloaded
      if (this.isServerOverloaded(selected)) {
        this.emit('server-overloaded', selected.getId());
      }
    }

    return selected;
  }

  markServerHealthy(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.markHealthy();
      this.logger.info('Server marked as healthy', { serverId });
      this.emit('server-health-changed', { serverId, healthy: true });
    }
  }

  markServerUnhealthy(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.markUnhealthy();
      this.logger.warn('Server marked as unhealthy', { serverId });
      this.emit('server-health-changed', { serverId, healthy: false });
    }
  }

  setServerWeight(serverId: string, weight: number): void {
    if (weight < 0 || weight > 1) {
      throw new Error('Server weight must be between 0 and 1');
    }
    
    this.serverWeights.set(serverId, weight);
    this.logger.info('Server weight updated', { serverId, weight });
  }

  getServerWeight(serverId: string): number {
    return this.serverWeights.get(serverId) || 1.0;
  }

  getHealthyServers(): MCPServerInstance[] {
    return Array.from(this.servers.values()).filter(server => 
      server.isHealthyServer()
    );
  }

  getServerCount(): number {
    return this.servers.size;
  }

  getHealthyServerCount(): number {
    return this.getHealthyServers().length;
  }

  getServerDistribution(): Record<string, number> {
    // This would track request distribution in a real implementation
    const distribution: Record<string, number> = {};
    
    for (const [serverId] of this.servers) {
      distribution[serverId] = 0; // Placeholder
    }
    
    return distribution;
  }

  private createStrategy(strategyName: string): LoadBalancerStrategy {
    switch (strategyName) {
      case 'round-robin':
        return new RoundRobinStrategy();
      case 'least-connections':
        return new LeastConnectionsStrategy();
      case 'resource-based':
        return new ResourceBasedStrategy();
      case 'weighted':
        return new WeightedStrategy(this.serverWeights);
      default:
        this.logger.warn('Unknown strategy, falling back to round-robin', { strategyName });
        return new RoundRobinStrategy();
    }
  }

  private isServerOverloaded(server: MCPServerInstance): boolean {
    // This would check actual metrics in a real implementation
    // For now, we'll use a simple placeholder
    return false;
  }

  updateStrategy(strategyName: string): void {
    this.config.strategy = strategyName as any;
    this.strategy = this.createStrategy(strategyName);
    this.logger.info('Load balancing strategy updated', { strategy: strategyName });
  }

  getStats(): any {
    return {
      totalServers: this.servers.size,
      healthyServers: this.getHealthyServerCount(),
      strategy: this.config.strategy,
      distribution: this.getServerDistribution()
    };
  }
}

// Strategy Implementations
class RoundRobinStrategy implements LoadBalancerStrategy {
  name = 'round-robin';
  private index = 0;

  selectServer(servers: MCPServerInstance[]): MCPServerInstance | null {
    if (servers.length === 0) return null;
    
    const server = servers[this.index % servers.length];
    this.index++;
    
    return server;
  }
}

class LeastConnectionsStrategy implements LoadBalancerStrategy {
  name = 'least-connections';

  selectServer(servers: MCPServerInstance[]): MCPServerInstance | null {
    if (servers.length === 0) return null;
    
    // In a real implementation, this would track active connections
    // For now, we'll return the first server
    return servers[0];
  }
}

class ResourceBasedStrategy implements LoadBalancerStrategy {
  name = 'resource-based';

  selectServer(servers: MCPServerInstance[], request?: MCPRequest): MCPServerInstance | null {
    if (servers.length === 0) return null;
    
    // Score servers based on resource utilization and capabilities
    const scoredServers = servers.map(server => ({
      server,
      score: this.calculateScore(server, request)
    }));
    
    // Sort by score (lower is better)
    scoredServers.sort((a, b) => a.score - b.score);
    
    return scoredServers[0].server;
  }

  private calculateScore(server: MCPServerInstance, request?: MCPRequest): number {
    let score = 0;
    
    // Base score from error count (higher errors = higher score = lower priority)
    score += server.getErrorCount() * 10;
    
    // Type-based scoring
    if (request && this.getPreferredServerTypes(request.method).includes(server.getType())) {
      score -= 20; // Prefer servers that handle this type of request
    }
    
    // In a real implementation, add:
    // - CPU utilization
    // - Memory usage
    // - Active connections
    // - Response time metrics
    
    return score;
  }

  private getPreferredServerTypes(method: string): string[] {
    const typeMap: Record<string, string[]> = {
      'context/search': ['context7'],
      'sequential/analyze': ['sequential'],
      'ui/generate': ['magic'],
      'file/read': ['filesystem'],
      'file/write': ['filesystem']
    };
    
    return typeMap[method] || [];
  }
}

class WeightedStrategy implements LoadBalancerStrategy {
  name = 'weighted';
  
  constructor(private weights: Map<string, number>) {}

  selectServer(servers: MCPServerInstance[]): MCPServerInstance | null {
    if (servers.length === 0) return null;
    
    // Calculate weighted selection
    const totalWeight = servers.reduce((sum, server) => {
      return sum + (this.weights.get(server.getId()) || 1.0);
    }, 0);
    
    let random = Math.random() * totalWeight;
    
    for (const server of servers) {
      const weight = this.weights.get(server.getId()) || 1.0;
      random -= weight;
      
      if (random <= 0) {
        return server;
      }
    }
    
    // Fallback to first server
    return servers[0];
  }
}