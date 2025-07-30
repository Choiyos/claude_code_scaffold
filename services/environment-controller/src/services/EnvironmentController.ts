import Docker from 'dockerode';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import { createLogger } from '@shared/utils/logger';
import { 
  Environment, 
  EnvironmentConfig, 
  EnvironmentStatus, 
  EnvironmentType,
  MCPServerConfig 
} from '@shared/types';
import { 
  DockerError, 
  EnvironmentError, 
  NotFoundError, 
  ConflictError 
} from '@shared/utils/errors';

const logger = createLogger('environment-controller');

export class EnvironmentController extends EventEmitter {
  private docker: Docker;
  private environments: Map<string, Environment> = new Map();
  private workspaceDir: string;
  private templateDir: string;
  private statusChecker?: NodeJS.Timeout;
  private healthChecker?: string;

  constructor() {
    super();
    this.docker = new Docker();
    this.workspaceDir = process.env.WORKSPACE_DIR || '/tmp/claude-environments';
    this.templateDir = process.env.TEMPLATE_DIR || '/workspace/templates';
  }

  async initialize(): Promise<void> {
    try {
      // Ensure workspace directory exists
      await fs.ensureDir(this.workspaceDir);
      await fs.ensureDir(this.templateDir);

      // Test Docker connection
      await this.docker.ping();
      logger.info('Docker connection established');

      // Load existing environments
      await this.loadExistingEnvironments();

      // Setup periodic status checking
      this.setupStatusChecking();

      // Setup health monitoring
      this.setupHealthMonitoring();

      logger.info('Environment Controller initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Environment Controller:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Clear periodic tasks
    if (this.statusChecker) {
      clearInterval(this.statusChecker);
    }

    // Stop all environments gracefully
    const stopPromises = Array.from(this.environments.values()).map(env => 
      this.stopEnvironmentSafely(env.id)
    );
    
    await Promise.allSettled(stopPromises);
    
    logger.info('Environment Controller shutdown completed');
  }

  async createEnvironment(config: {
    name: string;
    description?: string;
    type: EnvironmentType;
    userId: string;
    teamId?: string;
    config?: EnvironmentConfig;
  }): Promise<Environment> {
    const environmentId = uuidv4();
    logger.info(`Creating environment ${environmentId}`, { config });

    try {
      // Check for name conflicts
      const existingEnv = Array.from(this.environments.values())
        .find(env => env.name === config.name && env.userId === config.userId);
      
      if (existingEnv) {
        throw new ConflictError(`Environment with name '${config.name}' already exists`);
      }

      // Create environment object
      const environment: Environment = {
        id: environmentId,
        name: config.name,
        description: config.description,
        status: EnvironmentStatus.CREATING,
        type: config.type,
        config: config.config || this.getDefaultConfig(config.type),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: config.userId,
        teamId: config.teamId
      };

      // Store environment
      this.environments.set(environmentId, environment);

      // Create workspace directory
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      await fs.ensureDir(envWorkspaceDir);

      // Generate Docker Compose file
      const composeFile = await this.generateComposeFile(environment);
      const composeFilePath = path.join(envWorkspaceDir, 'docker-compose.yml');
      await fs.writeFile(composeFilePath, composeFile);

      // Start environment
      await this.startEnvironment(environmentId);

      // Emit creation event
      this.emit('environment-created', environment);

      logger.info(`Environment ${environmentId} created successfully`);
      return environment;

    } catch (error) {
      logger.error(`Failed to create environment ${environmentId}:`, error);
      
      // Cleanup on failure
      this.environments.delete(environmentId);
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      await fs.remove(envWorkspaceDir).catch(() => {});

      if (error instanceof Error) {
        throw new EnvironmentError(`Failed to create environment: ${error.message}`, environmentId);
      }
      throw error;
    }
  }

  async updateEnvironment(environmentId: string, updates: Partial<Environment>): Promise<Environment> {
    logger.info(`Updating environment ${environmentId}`, { updates });

    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new NotFoundError('Environment', environmentId);
    }

    try {
      // Update environment object
      const updatedEnvironment = {
        ...environment,
        ...updates,
        id: environmentId, // Prevent ID changes
        updatedAt: new Date()
      };

      // If config changed, regenerate compose file and restart
      if (updates.config) {
        updatedEnvironment.status = EnvironmentStatus.UPDATING;
        this.environments.set(environmentId, updatedEnvironment);

        await this.stopEnvironment(environmentId);
        
        const composeFile = await this.generateComposeFile(updatedEnvironment);
        const composeFilePath = path.join(this.workspaceDir, environmentId, 'docker-compose.yml');
        await fs.writeFile(composeFilePath, composeFile);
        
        await this.startEnvironment(environmentId);
      } else {
        this.environments.set(environmentId, updatedEnvironment);
      }

      // Emit update event
      this.emit('environment-updated', updatedEnvironment);

      logger.info(`Environment ${environmentId} updated successfully`);
      return updatedEnvironment;

    } catch (error) {
      logger.error(`Failed to update environment ${environmentId}:`, error);
      
      if (error instanceof Error) {
        throw new EnvironmentError(`Failed to update environment: ${error.message}`, environmentId);
      }
      throw error;
    }
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    logger.info(`Deleting environment ${environmentId}`);

    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new NotFoundError('Environment', environmentId);
    }

    try {
      // Update status
      environment.status = EnvironmentStatus.DESTROYING;
      this.environments.set(environmentId, environment);

      // Stop and remove containers
      await this.stopEnvironment(environmentId);
      await this.removeEnvironmentContainers(environmentId);

      // Remove workspace directory
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      await fs.remove(envWorkspaceDir);

      // Remove from memory
      this.environments.delete(environmentId);

      // Emit deletion event
      this.emit('environment-deleted', environmentId);

      logger.info(`Environment ${environmentId} deleted successfully`);

    } catch (error) {
      logger.error(`Failed to delete environment ${environmentId}:`, error);
      
      if (error instanceof Error) {
        throw new EnvironmentError(`Failed to delete environment: ${error.message}`, environmentId);
      }
      throw error;
    }
  }

  async getEnvironment(environmentId: string): Promise<Environment> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new NotFoundError('Environment', environmentId);
    }
    return environment;
  }

  async listEnvironments(userId?: string, teamId?: string): Promise<Environment[]> {
    let environments = Array.from(this.environments.values());

    if (userId) {
      environments = environments.filter(env => env.userId === userId);
    }

    if (teamId) {
      environments = environments.filter(env => env.teamId === teamId);
    }

    return environments;
  }

  async getEnvironmentLogs(environmentId: string, options?: {
    service?: string;
    since?: string;
    follow?: boolean;
    tail?: number;
  }): Promise<string> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new NotFoundError('Environment', environmentId);
    }

    try {
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      const args = ['logs'];
      
      if (options?.service) {
        args.push(options.service);
      }
      
      if (options?.since) {
        args.push('--since', options.since);
      }
      
      if (options?.follow) {
        args.push('--follow');
      }
      
      args.push('--tail', (options?.tail || 1000).toString());
      
      const result = await this.executeDockerCompose(envWorkspaceDir, args);
      
      return result;
    } catch (error) {
      logger.error(`Failed to get logs for environment ${environmentId}:`, error);
      throw new EnvironmentError(`Failed to get environment logs`, environmentId);
    }
  }

  async getEnvironmentStatus(environmentId: string): Promise<any> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new NotFoundError('Environment', environmentId);
    }

    try {
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      const status = await this.executeDockerCompose(envWorkspaceDir, ['ps', '--format', 'json']);
      
      const containers = status.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      return {
        environment: {
          id: environment.id,
          name: environment.name,
          status: environment.status,
          type: environment.type
        },
        containers: containers.map(container => ({
          name: container.Name,
          state: container.State,
          status: container.Status,
          ports: container.Ports
        }))
      };
    } catch (error) {
      logger.error(`Failed to get status for environment ${environmentId}:`, error);
      throw new EnvironmentError(`Failed to get environment status`, environmentId);
    }
  }

  private async startEnvironment(environmentId: string): Promise<void> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new NotFoundError('Environment', environmentId);
    }

    try {
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      
      // Start containers
      await this.executeDockerCompose(envWorkspaceDir, ['up', '-d']);
      
      // Wait for containers to be ready
      await this.waitForEnvironmentReady(environmentId);
      
      // Update status
      environment.status = EnvironmentStatus.RUNNING;
      this.environments.set(environmentId, environment);

      logger.info(`Environment ${environmentId} started successfully`);
    } catch (error) {
      logger.error(`Failed to start environment ${environmentId}:`, error);
      
      environment.status = EnvironmentStatus.ERROR;
      this.environments.set(environmentId, environment);
      
      throw new DockerError(`Failed to start environment: ${error}`);
    }
  }

  private async stopEnvironment(environmentId: string): Promise<void> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      return;
    }

    try {
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      await this.executeDockerCompose(envWorkspaceDir, ['down']);
      
      environment.status = EnvironmentStatus.STOPPED;
      this.environments.set(environmentId, environment);

      logger.info(`Environment ${environmentId} stopped successfully`);
    } catch (error) {
      logger.error(`Failed to stop environment ${environmentId}:`, error);
      throw new DockerError(`Failed to stop environment: ${error}`);
    }
  }

  private async stopEnvironmentSafely(environmentId: string): Promise<void> {
    try {
      await this.stopEnvironment(environmentId);
    } catch (error) {
      logger.warn(`Failed to stop environment ${environmentId} during shutdown:`, error);
    }
  }

  private async removeEnvironmentContainers(environmentId: string): Promise<void> {
    try {
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      await this.executeDockerCompose(envWorkspaceDir, ['down', '-v', '--remove-orphans']);
    } catch (error) {
      logger.error(`Failed to remove containers for environment ${environmentId}:`, error);
    }
  }

  private async generateComposeFile(environment: Environment): Promise<string> {
    const config = environment.config;
    
    const composeConfig = {
      version: '3.8',
      services: {
        devcontainer: {
          image: config.image || 'claude-env/devcontainer:latest',
          container_name: `claude-env-${environment.id}`,
          volumes: [
            `claude-workspace-${environment.id}:/workspace`,
            ...(config.volumes?.map(v => `${v.host}:${v.container}:${v.mode}`) || [])
          ],
          ports: config.ports?.map(p => `${p.host}:${p.container}`) || [],
          environment: {
            NODE_VERSION: config.nodeVersion || '20',
            PYTHON_VERSION: config.pythonVersion || '3.11',
            ENVIRONMENT_ID: environment.id,
            ENVIRONMENT_NAME: environment.name,
            USER_ID: environment.userId,
            ...(config.environmentVariables || {})
          },
          networks: ['claude-network'],
          restart: 'unless-stopped',
          ...(config.resources && {
            deploy: {
              resources: {
                limits: config.resources
              }
            }
          }),
          ...(config.healthCheck && {
            healthcheck: {
              test: [`CMD-SHELL`, `curl -f ${config.healthCheck.endpoint} || exit 1`],
              interval: `${config.healthCheck.interval}s`,
              timeout: `${config.healthCheck.timeout}s`,
              retries: config.healthCheck.retries,
              start_period: '30s'
            }
          })
        }
      },
      volumes: {
        [`claude-workspace-${environment.id}`]: {
          driver: 'local'
        }
      },
      networks: {
        'claude-network': {
          driver: 'bridge'
        }
      }
    };

    // Add MCP servers
    if (config.mcpServers) {
      config.mcpServers.forEach(server => {
        composeConfig.services[`mcp-${server.name}`] = {
          image: server.image,
          container_name: `mcp-${server.name}-${environment.id}`,
          environment: {
            MCP_CONFIG: JSON.stringify(server.config),
            ENVIRONMENT_ID: environment.id
          },
          networks: ['claude-network'],
          restart: 'unless-stopped',
          ...(server.resources && {
            deploy: {
              resources: {
                limits: server.resources
              }
            }
          })
        };
      });
    }

    return yaml.dump(composeConfig);
  }

  private async executeDockerCompose(workingDir: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const process = spawn('docker-compose', args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Docker Compose failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  private async waitForEnvironmentReady(environmentId: string, timeoutMs: number = 300000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
        const status = await this.executeDockerCompose(envWorkspaceDir, ['ps', '--format', 'json']);
        
        const containers = status.trim().split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        
        const allRunning = containers.every(container => 
          container.State === 'running' || container.State === 'Up'
        );
        
        if (allRunning && containers.length > 0) {
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.debug(`Waiting for environment ${environmentId} to be ready...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    throw new Error(`Environment ${environmentId} failed to become ready within ${timeoutMs}ms`);
  }

  private getDefaultConfig(type: EnvironmentType): EnvironmentConfig {
    const baseConfig: EnvironmentConfig = {
      image: 'claude-env/devcontainer:latest',
      nodeVersion: '20',
      pythonVersion: '3.11',
      ports: [
        { host: 8080, container: 8080, protocol: 'tcp' }
      ],
      volumes: [],
      environmentVariables: {
        NODE_ENV: type === EnvironmentType.PRODUCTION ? 'production' : 'development'
      },
      resources: {
        memory: type === EnvironmentType.PRODUCTION ? '2G' : '1G',
        cpu: '1.0'
      },
      healthCheck: {
        endpoint: 'http://localhost:8080/health',
        interval: 30,
        timeout: 10,
        retries: 3
      }
    };

    return baseConfig;
  }

  private async loadExistingEnvironments(): Promise<void> {
    try {
      // In production, this would load from database
      // For now, we'll scan the workspace directory
      const workspaceDirs = await fs.readdir(this.workspaceDir);
      
      for (const dir of workspaceDirs) {
        const envPath = path.join(this.workspaceDir, dir);
        const stat = await fs.stat(envPath);
        
        if (stat.isDirectory()) {
          const composeFile = path.join(envPath, 'docker-compose.yml');
          if (await fs.pathExists(composeFile)) {
            // Try to restore environment state
            await this.restoreEnvironmentState(dir);
          }
        }
      }
      
      logger.info(`Loaded ${this.environments.size} existing environments`);
    } catch (error) {
      logger.warn('Failed to load existing environments:', error);
    }
  }

  private async restoreEnvironmentState(environmentId: string): Promise<void> {
    try {
      // This would typically load from database
      // For now, create a basic environment object
      const environment: Environment = {
        id: environmentId,
        name: `Restored Environment ${environmentId}`,
        status: EnvironmentStatus.STOPPED,
        type: EnvironmentType.DEVELOPMENT,
        config: this.getDefaultConfig(EnvironmentType.DEVELOPMENT),
        metadata: { restored: true },
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'system'
      };

      this.environments.set(environmentId, environment);
      logger.debug(`Restored environment ${environmentId}`);
    } catch (error) {
      logger.warn(`Failed to restore environment ${environmentId}:`, error);
    }
  }

  private setupStatusChecking(): void {
    this.statusChecker = setInterval(async () => {
      for (const [id, environment] of this.environments) {
        try {
          await this.checkEnvironmentStatus(id);
        } catch (error) {
          logger.warn(`Failed to check status for environment ${id}:`, error);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async checkEnvironmentStatus(environmentId: string): Promise<void> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      return;
    }

    try {
      const envWorkspaceDir = path.join(this.workspaceDir, environmentId);
      const status = await this.executeDockerCompose(envWorkspaceDir, ['ps', '--format', 'json']);
      
      const containers = status.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      const hasRunningContainers = containers.some(container => 
        container.State === 'running' || container.State === 'Up'
      );
      
      const newStatus = hasRunningContainers ? EnvironmentStatus.RUNNING : EnvironmentStatus.STOPPED;
      
      if (environment.status !== newStatus) {
        environment.status = newStatus;
        environment.updatedAt = new Date();
        this.environments.set(environmentId, environment);
        
        this.emit('environment-status-changed', environment);
      }
    } catch (error) {
      if (environment.status !== EnvironmentStatus.ERROR) {
        environment.status = EnvironmentStatus.ERROR;
        environment.updatedAt = new Date();
        this.environments.set(environmentId, environment);
        
        this.emit('environment-status-changed', environment);
      }
    }
  }

  private setupHealthMonitoring(): void {
    // Schedule periodic cleanup of stopped environments
    this.healthChecker = cron.schedule('0 0 * * *', async () => {
      logger.info('Running daily environment cleanup...');
      
      const stoppedEnvironments = Array.from(this.environments.values())
        .filter(env => env.status === EnvironmentStatus.STOPPED);
      
      for (const env of stoppedEnvironments) {
        const daysSinceUpdate = (Date.now() - env.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > 7) { // Clean up environments stopped for more than 7 days
          logger.info(`Cleaning up old environment ${env.id}`);
          try {
            await this.deleteEnvironment(env.id);
          } catch (error) {
            logger.warn(`Failed to cleanup environment ${env.id}:`, error);
          }
        }
      }
    });
  }
}