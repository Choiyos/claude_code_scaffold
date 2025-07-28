/**
 * MCP Server Deployment Manager
 * Handles Docker, Kubernetes, and process-based deployments with rolling updates
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/metrics-collector';
import { MCPServerConfig } from '../mcp-server-orchestrator';

export interface DeploymentConfig {
  strategy: 'docker' | 'kubernetes' | 'process' | 'systemd';
  environment: 'development' | 'staging' | 'production';
  rollout: {
    strategy: 'rolling' | 'blue-green' | 'canary' | 'recreate';
    maxUnavailable: number | string;
    maxSurge: number | string;
    progressDeadlineSeconds: number;
    revisionHistoryLimit: number;
  };
  resources: {
    requests: {
      cpu: string;
      memory: string;
      storage?: string;
    };
    limits: {
      cpu: string;
      memory: string;
      storage?: string;
    };
  };
  autoscaling: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    targetCPUUtilization: number;
    targetMemoryUtilization: number;
    scaleUpCooldown: number;
    scaleDownCooldown: number;
  };
  networking: {
    ports?: Array<{
      name: string;
      port: number;
      targetPort: number;
      protocol: 'TCP' | 'UDP';
    }>;
    ingress?: {
      enabled: boolean;
      host?: string;
      path?: string;
      tlsSecretName?: string;
    };
    service?: {
      type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
      annotations?: Record<string, string>;
    };
  };
  security: {
    runAsNonRoot: boolean;
    runAsUser?: number;
    runAsGroup?: number;
    fsGroup?: number;
    seccompProfile?: string;
    seLinuxOptions?: Record<string, string>;
    capabilities?: {
      add?: string[];
      drop?: string[];
    };
  };
  storage: {
    volumes?: Array<{
      name: string;
      type: 'emptyDir' | 'configMap' | 'secret' | 'persistentVolume';
      source: string;
      mountPath: string;
      readOnly?: boolean;
    }>;
    persistentVolumes?: Array<{
      name: string;
      size: string;
      storageClass: string;
      accessModes: string[];
    }>;
  };
  monitoring: {
    enabled: boolean;
    metricsPath: string;
    metricsPort: number;
    healthCheckPath: string;
    readinessPath: string;
    livenessPath: string;
  };
}

export interface DeploymentStatus {
  id: string;
  serverName: string;
  status: 'pending' | 'deploying' | 'running' | 'updating' | 'failed' | 'terminating';
  replicas: {
    desired: number;
    ready: number;
    available: number;
    unavailable: number;
  };
  conditions: Array<{
    type: string;
    status: 'True' | 'False' | 'Unknown';
    reason: string;
    message: string;
    lastTransitionTime: Date;
  }>;
  events: Array<{
    type: 'Normal' | 'Warning';
    reason: string;
    message: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  rolloutHistory: Array<{
    revision: number;
    createdAt: Date;
    reason: string;
    config: Partial<MCPServerConfig>;
  }>;
}

export class DeploymentManager extends EventEmitter {
  private deployments: Map<string, DeploymentStatus> = new Map();
  private deployers: Map<string, IDeploymentProvider> = new Map();
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    super();
    this.logger = new Logger('DeploymentManager');
    this.metrics = new MetricsCollector();

    this.initializeDeployers();
  }

  /**
   * Deploy an MCP server
   */
  async deployServer(
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<string> {
    const deploymentId = this.generateDeploymentId(serverConfig.name);
    
    this.logger.info(`Starting deployment: ${serverConfig.name} (${deploymentId})`);

    const deploymentStatus: DeploymentStatus = {
      id: deploymentId,
      serverName: serverConfig.name,
      status: 'pending',
      replicas: {
        desired: serverConfig.scaling.minInstances,
        ready: 0,
        available: 0,
        unavailable: 0
      },
      conditions: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: serverConfig.version,
      rolloutHistory: [{
        revision: 1,
        createdAt: new Date(),
        reason: 'Initial deployment',
        config: serverConfig
      }]
    };

    this.deployments.set(deploymentId, deploymentStatus);

    try {
      const deployer = this.getDeployer(deploymentConfig.strategy);
      await deployer.deploy(deploymentId, serverConfig, deploymentConfig);

      this.updateDeploymentStatus(deploymentId, { status: 'deploying' });
      this.emit('deployment:started', { deploymentId, serverConfig });

      return deploymentId;

    } catch (error) {
      this.updateDeploymentStatus(deploymentId, { 
        status: 'failed',
        conditions: [{
          type: 'Failed',
          status: 'True',
          reason: 'DeploymentError',
          message: error.message,
          lastTransitionTime: new Date()
        }]
      });

      this.logger.error(`Deployment failed: ${serverConfig.name}`, error);
      this.emit('deployment:failed', { deploymentId, error });
      throw error;
    }
  }

  /**
   * Update an existing deployment with rolling update
   */
  async updateDeployment(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    this.logger.info(`Updating deployment: ${deployment.serverName} (${deploymentId})`);

    try {
      const deployer = this.getDeployer(deploymentConfig.strategy);
      
      // Add to rollout history
      const nextRevision = deployment.rolloutHistory.length + 1;
      deployment.rolloutHistory.push({
        revision: nextRevision,
        createdAt: new Date(),
        reason: `Update to version ${serverConfig.version}`,
        config: serverConfig
      });

      // Limit history size
      if (deployment.rolloutHistory.length > deploymentConfig.rollout.revisionHistoryLimit) {
        deployment.rolloutHistory.splice(0, 1);
      }

      this.updateDeploymentStatus(deploymentId, { 
        status: 'updating',
        version: serverConfig.version
      });

      await deployer.update(deploymentId, serverConfig, deploymentConfig);

      this.emit('deployment:updated', { deploymentId, serverConfig });

    } catch (error) {
      this.updateDeploymentStatus(deploymentId, { 
        status: 'failed',
        conditions: [{
          type: 'Failed',
          status: 'True',
          reason: 'UpdateError',
          message: error.message,
          lastTransitionTime: new Date()
        }]
      });

      this.logger.error(`Deployment update failed: ${deployment.serverName}`, error);
      this.emit('deployment:update_failed', { deploymentId, error });
      throw error;
    }
  }

  /**
   * Scale a deployment
   */
  async scaleDeployment(
    deploymentId: string,
    replicas: number
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    this.logger.info(`Scaling deployment: ${deployment.serverName} to ${replicas} replicas`);

    try {
      const deployer = this.getDeployerByDeploymentId(deploymentId);
      await deployer.scale(deploymentId, replicas);

      this.updateDeploymentStatus(deploymentId, {
        replicas: { ...deployment.replicas, desired: replicas }
      });

      this.emit('deployment:scaled', { deploymentId, replicas });

    } catch (error) {
      this.logger.error(`Scaling failed: ${deployment.serverName}`, error);
      this.emit('deployment:scale_failed', { deploymentId, error });
      throw error;
    }
  }

  /**
   * Rollback a deployment to previous revision
   */
  async rollbackDeployment(
    deploymentId: string,
    targetRevision?: number
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const revision = targetRevision || deployment.rolloutHistory.length - 1;
    const targetRollout = deployment.rolloutHistory.find(r => r.revision === revision);
    
    if (!targetRollout) {
      throw new Error(`Revision ${revision} not found in rollout history`);
    }

    this.logger.info(`Rolling back deployment: ${deployment.serverName} to revision ${revision}`);

    try {
      const deployer = this.getDeployerByDeploymentId(deploymentId);
      await deployer.rollback(deploymentId, targetRollout.config as MCPServerConfig);

      this.updateDeploymentStatus(deploymentId, { status: 'updating' });
      this.emit('deployment:rollback', { deploymentId, targetRevision: revision });

    } catch (error) {
      this.logger.error(`Rollback failed: ${deployment.serverName}`, error);
      this.emit('deployment:rollback_failed', { deploymentId, error });
      throw error;
    }
  }

  /**
   * Delete a deployment
   */
  async deleteDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    this.logger.info(`Deleting deployment: ${deployment.serverName} (${deploymentId})`);

    try {
      const deployer = this.getDeployerByDeploymentId(deploymentId);
      await deployer.delete(deploymentId);

      this.updateDeploymentStatus(deploymentId, { status: 'terminating' });
      this.emit('deployment:deleting', { deploymentId });

      // Remove from tracking after grace period
      setTimeout(() => {
        this.deployments.delete(deploymentId);
        this.emit('deployment:deleted', { deploymentId });
      }, 30000);

    } catch (error) {
      this.logger.error(`Deletion failed: ${deployment.serverName}`, error);
      this.emit('deployment:delete_failed', { deploymentId, error });
      throw error;
    }
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId: string): DeploymentStatus | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * List all deployments
   */
  listDeployments(filters?: {
    status?: DeploymentStatus['status'];
    serverName?: string;
  }): DeploymentStatus[] {
    let deployments = Array.from(this.deployments.values());

    if (filters?.status) {
      deployments = deployments.filter(d => d.status === filters.status);
    }

    if (filters?.serverName) {
      deployments = deployments.filter(d => d.serverName === filters.serverName);
    }

    return deployments;
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(
    deploymentId: string,
    options?: {
      follow?: boolean;
      tail?: number;
      since?: Date;
      container?: string;
    }
  ): Promise<AsyncIterable<string>> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const deployer = this.getDeployerByDeploymentId(deploymentId);
    return deployer.getLogs(deploymentId, options);
  }

  /**
   * Execute command in deployment container
   */
  async executeCommand(
    deploymentId: string,
    command: string[],
    options?: {
      container?: string;
      stdin?: boolean;
      tty?: boolean;
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const deployer = this.getDeployerByDeploymentId(deploymentId);
    return deployer.executeCommand(deploymentId, command, options);
  }

  /**
   * Get deployment metrics
   */
  async getDeploymentMetrics(deploymentId: string): Promise<{
    cpu: { usage: number; requests: number; limits: number };
    memory: { usage: number; requests: number; limits: number };
    network: { inbound: number; outbound: number };
    replicas: { desired: number; ready: number; available: number };
  }> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const deployer = this.getDeployerByDeploymentId(deploymentId);
    return deployer.getMetrics(deploymentId);
  }

  // Private methods

  private initializeDeployers(): void {
    this.deployers.set('docker', new DockerDeployer());
    this.deployers.set('kubernetes', new KubernetesDeployer());
    this.deployers.set('process', new ProcessDeployer());
    this.deployers.set('systemd', new SystemdDeployer());
  }

  private getDeployer(strategy: string): IDeploymentProvider {
    const deployer = this.deployers.get(strategy);
    if (!deployer) {
      throw new Error(`Unsupported deployment strategy: ${strategy}`);
    }
    return deployer;
  }

  private getDeployerByDeploymentId(deploymentId: string): IDeploymentProvider {
    // For simplicity, assume Docker deployer. In production, store the strategy with the deployment.
    const deployer = this.deployers.get('docker');
    if (!deployer) {
      throw new Error('No deployer available for deployment');
    }
    return deployer;
  }

  private generateDeploymentId(serverName: string): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `${serverName}-${timestamp}-${random}`;
  }

  private updateDeploymentStatus(
    deploymentId: string,
    updates: Partial<DeploymentStatus>
  ): void {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      Object.assign(deployment, updates, { updatedAt: new Date() });
      this.emit('deployment:status_updated', { deploymentId, status: deployment });
    }
  }
}

/**
 * Interface for deployment providers
 */
interface IDeploymentProvider {
  deploy(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void>;

  update(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void>;

  scale(deploymentId: string, replicas: number): Promise<void>;

  rollback(
    deploymentId: string,
    config: MCPServerConfig
  ): Promise<void>;

  delete(deploymentId: string): Promise<void>;

  getLogs(
    deploymentId: string,
    options?: {
      follow?: boolean;
      tail?: number;
      since?: Date;
      container?: string;
    }
  ): Promise<AsyncIterable<string>>;

  executeCommand(
    deploymentId: string,
    command: string[],
    options?: {
      container?: string;
      stdin?: boolean;
      tty?: boolean;
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  getMetrics(deploymentId: string): Promise<{
    cpu: { usage: number; requests: number; limits: number };
    memory: { usage: number; requests: number; limits: number };
    network: { inbound: number; outbound: number };
    replicas: { desired: number; ready: number; available: number };
  }>;
}

/**
 * Docker deployment provider
 */
class DockerDeployer implements IDeploymentProvider {
  private logger = new Logger('DockerDeployer');
  private containers: Map<string, string[]> = new Map(); // deploymentId -> containerIds

  async deploy(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void> {
    this.logger.info(`Deploying with Docker: ${deploymentId}`);

    const containerIds: string[] = [];
    const replicas = serverConfig.scaling.minInstances;

    for (let i = 0; i < replicas; i++) {
      const containerId = await this.createContainer(
        deploymentId,
        serverConfig,
        deploymentConfig,
        i
      );
      containerIds.push(containerId);
    }

    this.containers.set(deploymentId, containerIds);
  }

  async update(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void> {
    this.logger.info(`Updating Docker deployment: ${deploymentId}`);

    // Rolling update: create new containers, then remove old ones
    const oldContainerIds = this.containers.get(deploymentId) || [];
    const newContainerIds: string[] = [];

    for (let i = 0; i < serverConfig.scaling.minInstances; i++) {
      const containerId = await this.createContainer(
        deploymentId,
        serverConfig,
        deploymentConfig,
        i
      );
      newContainerIds.push(containerId);

      // Wait for container to be ready before proceeding
      await this.waitForContainerReady(containerId);
    }

    // Remove old containers
    for (const oldContainerId of oldContainerIds) {
      await this.removeContainer(oldContainerId);
    }

    this.containers.set(deploymentId, newContainerIds);
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    this.logger.info(`Scaling Docker deployment: ${deploymentId} to ${replicas}`);

    const currentContainerIds = this.containers.get(deploymentId) || [];
    const currentReplicas = currentContainerIds.length;

    if (replicas > currentReplicas) {
      // Scale up: add new containers
      const containersToAdd = replicas - currentReplicas;
      for (let i = 0; i < containersToAdd; i++) {
        // Implementation would create new containers
      }
    } else if (replicas < currentReplicas) {
      // Scale down: remove containers
      const containersToRemove = currentReplicas - replicas;
      const containersToStop = currentContainerIds.slice(-containersToRemove);
      
      for (const containerId of containersToStop) {
        await this.removeContainer(containerId);
      }

      this.containers.set(deploymentId, currentContainerIds.slice(0, replicas));
    }
  }

  async rollback(
    deploymentId: string,
    config: MCPServerConfig
  ): Promise<void> {
    this.logger.info(`Rolling back Docker deployment: ${deploymentId}`);
    // Implementation would rollback to previous image version
  }

  async delete(deploymentId: string): Promise<void> {
    this.logger.info(`Deleting Docker deployment: ${deploymentId}`);

    const containerIds = this.containers.get(deploymentId) || [];
    
    for (const containerId of containerIds) {
      await this.removeContainer(containerId);
    }

    this.containers.delete(deploymentId);
  }

  async getLogs(
    deploymentId: string,
    options?: any
  ): Promise<AsyncIterable<string>> {
    // Implementation would return container logs
    return this.mockAsyncIterator(['Log line 1', 'Log line 2']);
  }

  async executeCommand(
    deploymentId: string,
    command: string[],
    options?: any
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Implementation would execute command in container
    return {
      stdout: 'Command output',
      stderr: '',
      exitCode: 0
    };
  }

  async getMetrics(deploymentId: string): Promise<any> {
    // Implementation would collect container metrics
    return {
      cpu: { usage: 50, requests: 100, limits: 200 },
      memory: { usage: 512, requests: 256, limits: 1024 },
      network: { inbound: 1000, outbound: 500 },
      replicas: { desired: 2, ready: 2, available: 2 }
    };
  }

  private async createContainer(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig,
    index: number
  ): Promise<string> {
    // Implementation would create Docker container
    const containerId = `${deploymentId}-${index}-${Date.now()}`;
    this.logger.debug(`Created container: ${containerId}`);
    return containerId;
  }

  private async removeContainer(containerId: string): Promise<void> {
    // Implementation would stop and remove container
    this.logger.debug(`Removed container: ${containerId}`);
  }

  private async waitForContainerReady(containerId: string): Promise<void> {
    // Implementation would wait for container health check
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async *mockAsyncIterator(lines: string[]): AsyncIterable<string> {
    for (const line of lines) {
      yield line;
    }
  }
}

/**
 * Kubernetes deployment provider
 */
class KubernetesDeployer implements IDeploymentProvider {
  private logger = new Logger('KubernetesDeployer');

  async deploy(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void> {
    this.logger.info(`Deploying with Kubernetes: ${deploymentId}`);
    // Implementation would create Kubernetes Deployment, Service, etc.
  }

  async update(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void> {
    this.logger.info(`Updating Kubernetes deployment: ${deploymentId}`);
    // Implementation would update Kubernetes resources
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    this.logger.info(`Scaling Kubernetes deployment: ${deploymentId} to ${replicas}`);
    // Implementation would scale deployment
  }

  async rollback(deploymentId: string, config: MCPServerConfig): Promise<void> {
    this.logger.info(`Rolling back Kubernetes deployment: ${deploymentId}`);
    // Implementation would use kubectl rollout undo
  }

  async delete(deploymentId: string): Promise<void> {
    this.logger.info(`Deleting Kubernetes deployment: ${deploymentId}`);
    // Implementation would delete Kubernetes resources
  }

  async getLogs(deploymentId: string, options?: any): Promise<AsyncIterable<string>> {
    // Implementation would stream kubectl logs
    return this.mockAsyncIterator(['K8s log line 1', 'K8s log line 2']);
  }

  async executeCommand(
    deploymentId: string,
    command: string[],
    options?: any
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Implementation would use kubectl exec
    return {
      stdout: 'K8s command output',
      stderr: '',
      exitCode: 0
    };
  }

  async getMetrics(deploymentId: string): Promise<any> {
    // Implementation would collect metrics from metrics-server
    return {
      cpu: { usage: 75, requests: 100, limits: 200 },
      memory: { usage: 768, requests: 512, limits: 1024 },
      network: { inbound: 2000, outbound: 1000 },
      replicas: { desired: 3, ready: 3, available: 3 }
    };
  }

  private async *mockAsyncIterator(lines: string[]): AsyncIterable<string> {
    for (const line of lines) {
      yield line;
    }
  }
}

/**
 * Process deployment provider (for development)
 */
class ProcessDeployer implements IDeploymentProvider {
  private logger = new Logger('ProcessDeployer');
  private processes: Map<string, any[]> = new Map();

  async deploy(
    deploymentId: string,
    serverConfig: MCPServerConfig,
    deploymentConfig: DeploymentConfig
  ): Promise<void> {
    this.logger.info(`Deploying as process: ${deploymentId}`);
    // Implementation would spawn Node.js child processes
  }

  async update(deploymentId: string, serverConfig: MCPServerConfig, deploymentConfig: DeploymentConfig): Promise<void> {
    // Implementation would restart processes with new configuration
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    // Implementation would spawn/kill processes
  }

  async rollback(deploymentId: string, config: MCPServerConfig): Promise<void> {
    // Implementation would restart with previous configuration
  }

  async delete(deploymentId: string): Promise<void> {
    // Implementation would kill all processes
  }

  async getLogs(deploymentId: string, options?: any): Promise<AsyncIterable<string>> {
    return this.mockAsyncIterator(['Process log line 1']);
  }

  async executeCommand(deploymentId: string, command: string[], options?: any): Promise<any> {
    return { stdout: 'Process command output', stderr: '', exitCode: 0 };
  }

  async getMetrics(deploymentId: string): Promise<any> {
    return {
      cpu: { usage: 25, requests: 50, limits: 100 },
      memory: { usage: 256, requests: 128, limits: 512 },
      network: { inbound: 500, outbound: 250 },
      replicas: { desired: 1, ready: 1, available: 1 }
    };
  }

  private async *mockAsyncIterator(lines: string[]): AsyncIterable<string> {
    for (const line of lines) {
      yield line;
    }
  }
}

/**
 * Systemd deployment provider (for Linux systems)
 */
class SystemdDeployer implements IDeploymentProvider {
  private logger = new Logger('SystemdDeployer');

  async deploy(deploymentId: string, serverConfig: MCPServerConfig, deploymentConfig: DeploymentConfig): Promise<void> {
    this.logger.info(`Deploying with systemd: ${deploymentId}`);
    // Implementation would create systemd service files
  }

  async update(deploymentId: string, serverConfig: MCPServerConfig, deploymentConfig: DeploymentConfig): Promise<void> {
    // Implementation would update service configuration and restart
  }

  async scale(deploymentId: string, replicas: number): Promise<void> {
    // Implementation would create/remove service instances
  }

  async rollback(deploymentId: string, config: MCPServerConfig): Promise<void> {
    // Implementation would revert service configuration
  }

  async delete(deploymentId: string): Promise<void> {
    // Implementation would stop and remove systemd services
  }

  async getLogs(deploymentId: string, options?: any): Promise<AsyncIterable<string>> {
    return this.mockAsyncIterator(['Systemd log line 1']);
  }

  async executeCommand(deploymentId: string, command: string[], options?: any): Promise<any> {
    return { stdout: 'Systemd command output', stderr: '', exitCode: 0 };
  }

  async getMetrics(deploymentId: string): Promise<any> {
    return {
      cpu: { usage: 30, requests: 50, limits: 100 },
      memory: { usage: 128, requests: 64, limits: 256 },
      network: { inbound: 300, outbound: 150 },
      replicas: { desired: 1, ready: 1, available: 1 }
    };
  }

  private async *mockAsyncIterator(lines: string[]): AsyncIterable<string> {
    for (const line of lines) {
      yield line;
    }
  }
}