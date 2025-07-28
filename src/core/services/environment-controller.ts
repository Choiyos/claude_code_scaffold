/**
 * Environment Controller Implementation
 * Central orchestrator for Claude development environments
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  IEnvironmentController, 
  EnvironmentConfig, 
  Environment, 
  EnvironmentStatus,
  HealthCheckResult,
  ValidationResult,
  ContainerStatus,
  ResourceLimits
} from '../../interfaces/IEnvironmentController';
import { DockerService } from '../infrastructure/docker-service';
import { ConfigurationManager } from './configuration-manager';
import { MCPServerManager } from './mcp-server-manager';
import { WorkspaceManager } from './workspace-manager';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { Logger } from '../utils/logger';

export class EnvironmentController extends EventEmitter implements IEnvironmentController {
  private environments: Map<string, Environment> = new Map();
  private docker: DockerService;
  private configManager: ConfigurationManager;
  private mcpManager: MCPServerManager;
  private workspaceManager: WorkspaceManager;
  private metrics: MetricsCollector;
  private logger: Logger;

  constructor() {
    super();
    this.docker = new DockerService();
    this.configManager = new ConfigurationManager();
    this.mcpManager = new MCPServerManager();
    this.workspaceManager = new WorkspaceManager();
    this.metrics = new MetricsCollector();
    this.logger = new Logger('EnvironmentController');
  }

  async initialize(config: EnvironmentConfig): Promise<Environment> {
    const startTime = Date.now();
    const environmentId = config.id || uuidv4();
    
    this.logger.info(`Initializing environment ${environmentId}`, { config });

    try {
      // Validate configuration
      const validation = await this.validateConfiguration(config);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Prepare Docker network
      await this.docker.ensureNetwork('claude-network');

      // Create environment object
      const environment: Environment = {
        id: environmentId,
        config,
        status: 'initializing',
        containers: [],
        createdAt: new Date(),
        lastSync: null
      };

      // Start DevContainer
      const devContainer = await this.startDevContainer(environment);
      environment.containers.push(devContainer);

      // Start MCP servers
      const mcpServers = await this.mcpManager.startServers(config.mcpServers);
      environment.containers.push(...mcpServers);

      // Initialize workspaces
      await this.workspaceManager.initializeForEnvironment(environmentId, config);

      // Load and apply configurations
      const mergedConfig = await this.configManager.loadConfiguration({
        team: config.team,
        project: config.project,
        environment: 'development'
      });
      await this.applyConfiguration(environment, mergedConfig);

      // Update status
      environment.status = 'running';
      this.environments.set(environmentId, environment);

      // Record metrics
      const duration = Date.now() - startTime;
      this.metrics.recordEnvironmentInit(environmentId, duration, 'success');

      // Emit event
      this.emit('environment:initialized', { environmentId, duration });

      this.logger.info(`Environment ${environmentId} initialized successfully`, { duration });
      return environment;

    } catch (error) {
      this.logger.error(`Failed to initialize environment ${environmentId}`, error);
      this.metrics.recordEnvironmentInit(environmentId, Date.now() - startTime, 'failure');
      
      // Cleanup on failure
      await this.cleanup(environmentId);
      throw error;
    }
  }

  async start(environmentId: string): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    
    if (environment.status === 'running') {
      this.logger.warn(`Environment ${environmentId} is already running`);
      return;
    }

    this.logger.info(`Starting environment ${environmentId}`);

    try {
      // Start all containers
      for (const container of environment.containers) {
        await this.docker.startContainer(container.id);
      }

      // Wait for health checks
      await this.waitForHealthy(environmentId);

      environment.status = 'running';
      this.emit('environment:started', { environmentId });

    } catch (error) {
      this.logger.error(`Failed to start environment ${environmentId}`, error);
      environment.status = 'error';
      throw error;
    }
  }

  async stop(environmentId: string): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    
    this.logger.info(`Stopping environment ${environmentId}`);

    try {
      // Gracefully stop all containers
      for (const container of environment.containers) {
        await this.docker.stopContainer(container.id, { timeout: 30 });
      }

      environment.status = 'stopped';
      this.emit('environment:stopped', { environmentId });

    } catch (error) {
      this.logger.error(`Failed to stop environment ${environmentId}`, error);
      throw error;
    }
  }

  async destroy(environmentId: string): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    
    this.logger.info(`Destroying environment ${environmentId}`);

    try {
      // Stop if running
      if (environment.status === 'running') {
        await this.stop(environmentId);
      }

      // Remove containers
      for (const container of environment.containers) {
        await this.docker.removeContainer(container.id);
      }

      // Clean up workspaces
      await this.workspaceManager.cleanupEnvironment(environmentId);

      // Remove from registry
      this.environments.delete(environmentId);
      
      this.emit('environment:destroyed', { environmentId });

    } catch (error) {
      this.logger.error(`Failed to destroy environment ${environmentId}`, error);
      throw error;
    }
  }

  async getStatus(environmentId: string): Promise<EnvironmentStatus> {
    const environment = this.getEnvironment(environmentId);
    
    // Get container statuses
    const containerStatuses = await Promise.all(
      environment.containers.map(async (container) => {
        const status = await this.docker.getContainerStatus(container.id);
        return {
          ...container,
          ...status
        };
      })
    );

    // Calculate health score
    const healthyContainers = containerStatuses.filter(c => c.state === 'running').length;
    const healthScore = (healthyContainers / containerStatuses.length) * 100;

    // Get drift percentage
    const driftAnalysis = await this.configManager.analyzeDrift({
      team: environment.config.team,
      project: environment.config.project
    });

    return {
      id: environmentId,
      state: environment.status,
      containers: containerStatuses,
      lastSync: environment.lastSync || new Date(),
      driftPercentage: driftAnalysis.percentage,
      healthScore
    };
  }

  async healthCheck(environmentId: string): Promise<HealthCheckResult> {
    const environment = this.getEnvironment(environmentId);
    const checks: any[] = [];

    // Check DevContainer
    const devContainerHealth = await this.checkDevContainer(environment);
    checks.push({
      component: 'devcontainer',
      status: devContainerHealth.healthy ? 'healthy' : 'unhealthy',
      details: devContainerHealth
    });

    // Check MCP servers
    for (const server of environment.config.mcpServers) {
      const serverHealth = await this.mcpManager.healthCheck(server.id);
      checks.push({
        component: `mcp-${server.name}`,
        status: serverHealth.status,
        details: serverHealth
      });
    }

    // Check workspaces
    const workspaceHealth = await this.workspaceManager.healthCheck(environmentId);
    checks.push({
      component: 'workspaces',
      status: workspaceHealth.healthy ? 'healthy' : 'unhealthy',
      details: workspaceHealth
    });

    // Overall health
    const healthy = checks.every(check => check.status === 'healthy');
    const summary = {
      healthy,
      checks,
      timestamp: new Date()
    };

    this.metrics.recordHealthCheck(environmentId, summary);
    return summary;
  }

  async updateConfiguration(
    environmentId: string, 
    updates: Partial<EnvironmentConfig>
  ): Promise<void> {
    const environment = this.getEnvironment(environmentId);
    
    this.logger.info(`Updating configuration for environment ${environmentId}`, { updates });

    try {
      // Merge configurations
      const newConfig = {
        ...environment.config,
        ...updates
      };

      // Validate new configuration
      const validation = await this.validateConfiguration(newConfig);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Apply changes that don't require restart
      if (updates.environment) {
        await this.updateEnvironmentVariables(environment, updates.environment);
      }

      // Apply changes that require restart
      const requiresRestart = this.requiresRestart(updates);
      if (requiresRestart) {
        await this.stop(environmentId);
        environment.config = newConfig;
        await this.start(environmentId);
      } else {
        environment.config = newConfig;
      }

      this.emit('environment:updated', { environmentId, updates });

    } catch (error) {
      this.logger.error(`Failed to update configuration for ${environmentId}`, error);
      throw error;
    }
  }

  async validateConfiguration(config: EnvironmentConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate required fields
    if (!config.team) {
      errors.push('Team is required');
    }

    if (!config.baseImage) {
      errors.push('Base image is required');
    }

    if (!config.nodeVersion) {
      errors.push('Node version is required');
    }

    // Validate Node.js version
    const validNodeVersions = ['18', '20', '21'];
    const majorVersion = config.nodeVersion.split('.')[0];
    if (!validNodeVersions.includes(majorVersion)) {
      errors.push(`Invalid Node version. Supported: ${validNodeVersions.join(', ')}`);
    }

    // Validate MCP servers
    for (const server of config.mcpServers) {
      if (!server.name || !server.type) {
        errors.push('MCP server must have name and type');
      }
      
      const validTypes = ['context7', 'sequential', 'magic', 'playwright'];
      if (!validTypes.includes(server.type)) {
        errors.push(`Invalid MCP server type: ${server.type}`);
      }
    }

    // Validate resource limits
    if (config.resources) {
      if (config.resources.memory && !this.isValidMemoryLimit(config.resources.memory)) {
        errors.push('Invalid memory limit format');
      }
      
      if (config.resources.cpu && config.resources.cpu <= 0) {
        errors.push('CPU limit must be positive');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Private helper methods

  private getEnvironment(environmentId: string): Environment {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new Error(`Environment ${environmentId} not found`);
    }
    return environment;
  }

  private async startDevContainer(environment: Environment): Promise<ContainerStatus> {
    const containerConfig = {
      name: `claude-env-${environment.id}`,
      image: environment.config.baseImage,
      environment: {
        NODE_VERSION: environment.config.nodeVersion,
        CLAUDE_ENV_ID: environment.id,
        ...environment.config.environment
      },
      volumes: [
        {
          source: `${environment.id}-workspaces`,
          target: '/workspaces',
          type: 'volume'
        },
        {
          source: `${environment.id}-claude`,
          target: '/home/vscode/.claude',
          type: 'volume'
        }
      ],
      network: 'claude-network',
      resources: environment.config.resources
    };

    const containerId = await this.docker.createContainer(containerConfig);
    await this.docker.startContainer(containerId);

    return {
      id: containerId,
      name: containerConfig.name,
      type: 'devcontainer',
      state: 'running',
      createdAt: new Date()
    };
  }

  private async applyConfiguration(environment: Environment, config: any): Promise<void> {
    // Apply configuration to DevContainer
    const devContainer = environment.containers.find(c => c.type === 'devcontainer');
    if (devContainer) {
      await this.docker.execInContainer(devContainer.id, [
        'claude-env', 'apply-config', '--config', JSON.stringify(config)
      ]);
    }

    environment.lastSync = new Date();
  }

  private async waitForHealthy(environmentId: string, timeout: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const health = await this.healthCheck(environmentId);
      if (health.healthy) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Environment ${environmentId} failed to become healthy within ${timeout}ms`);
  }

  private async checkDevContainer(environment: Environment): Promise<any> {
    const devContainer = environment.containers.find(c => c.type === 'devcontainer');
    if (!devContainer) {
      return { healthy: false, reason: 'DevContainer not found' };
    }

    try {
      const status = await this.docker.getContainerStatus(devContainer.id);
      if (status.state !== 'running') {
        return { healthy: false, reason: `Container state: ${status.state}` };
      }

      // Check Node.js
      const nodeVersion = await this.docker.execInContainer(devContainer.id, ['node', '--version']);
      const expectedMajor = environment.config.nodeVersion.split('.')[0];
      const actualMajor = nodeVersion.trim().substring(1).split('.')[0];
      
      if (actualMajor !== expectedMajor) {
        return { 
          healthy: false, 
          reason: `Node version mismatch: expected ${expectedMajor}, got ${actualMajor}` 
        };
      }

      return { healthy: true, nodeVersion: nodeVersion.trim() };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }

  private async cleanup(environmentId: string): Promise<void> {
    try {
      const environment = this.environments.get(environmentId);
      if (environment) {
        for (const container of environment.containers) {
          await this.docker.removeContainer(container.id).catch(() => {});
        }
      }
      this.environments.delete(environmentId);
    } catch (error) {
      this.logger.error(`Cleanup failed for ${environmentId}`, error);
    }
  }

  private requiresRestart(updates: Partial<EnvironmentConfig>): boolean {
    const restartRequired = [
      'baseImage',
      'nodeVersion',
      'mcpServers',
      'volumes',
      'resources'
    ];
    
    return Object.keys(updates).some(key => restartRequired.includes(key));
  }

  private updateEnvironmentVariables(
    environment: Environment, 
    variables: Record<string, string>
  ): Promise<void> {
    const devContainer = environment.containers.find(c => c.type === 'devcontainer');
    if (!devContainer) {
      throw new Error('DevContainer not found');
    }

    // Update environment variables in running container
    const exports = Object.entries(variables)
      .map(([key, value]) => `export ${key}="${value}"`)
      .join('\n');
    
    return this.docker.execInContainer(devContainer.id, [
      'sh', '-c', `echo '${exports}' >> ~/.bashrc`
    ]);
  }

  private isValidMemoryLimit(memory: string): boolean {
    return /^\d+[kmg]b?$/i.test(memory);
  }
}