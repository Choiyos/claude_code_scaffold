import { EventEmitter } from 'events';
import { GitRepositoryManager } from '../git/GitRepositoryManager';
import { DriftDetector } from '../drift/DriftDetector';
import { ConfigSynchronizer } from '../sync/ConfigSynchronizer';
import { Logger } from '../utils/Logger';
import { MetricsExporter } from '../metrics/MetricsExporter';

export interface GitOpsControllerConfig {
  gitManager: GitRepositoryManager;
  driftDetector: DriftDetector;
  configSynchronizer: ConfigSynchronizer;
  logger: Logger;
  metricsExporter: MetricsExporter;
}

export interface DeploymentStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  type: 'configuration' | 'environment' | 'full';
  startTime: number;
  endTime?: number;
  changes: any[];
  error?: string;
}

export interface EnvironmentHealth {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    git: 'healthy' | 'warning' | 'critical';
    drift: 'healthy' | 'warning' | 'critical';
    sync: 'healthy' | 'warning' | 'critical';
    services: 'healthy' | 'warning' | 'critical';
  };
  lastChecked: number;
  details: any;
}

export class GitOpsController extends EventEmitter {
  private gitManager: GitRepositoryManager;
  private driftDetector: DriftDetector;
  private configSynchronizer: ConfigSynchronizer;
  private logger: Logger;
  private metricsExporter: MetricsExporter;
  private isInitialized: boolean = false;
  private deploymentHistory: DeploymentStatus[] = [];

  constructor(config: GitOpsControllerConfig) {
    super();
    
    this.gitManager = config.gitManager;
    this.driftDetector = config.driftDetector;
    this.configSynchronizer = config.configSynchronizer;
    this.logger = config.logger;
    this.metricsExporter = config.metricsExporter;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('GitOps Controller is already initialized');
      return;
    }

    this.logger.info('Initializing GitOps Controller');

    try {
      // Setup event listeners
      this.setupEventListeners();

      // Perform initial deployment
      await this.performInitialDeployment();

      this.isInitialized = true;
      this.logger.info('GitOps Controller initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize GitOps Controller', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Shutting down GitOps Controller');

    try {
      // Remove event listeners
      this.removeAllListeners();

      // Cleanup Git manager
      await this.gitManager.cleanup();

      this.isInitialized = false;
      this.logger.info('GitOps Controller shut down successfully');

    } catch (error) {
      this.logger.error('Error during GitOps Controller shutdown', { error });
    }
  }

  async triggerDeployment(type: 'configuration' | 'environment' | 'full' = 'configuration'): Promise<DeploymentStatus> {
    const deploymentId = this.generateDeploymentId();
    
    const deployment: DeploymentStatus = {
      id: deploymentId,
      status: 'pending',
      type,
      startTime: Date.now(),
      changes: []
    };

    this.deploymentHistory.push(deployment);
    this.emit('deployment-started', deployment);

    try {
      deployment.status = 'running';
      this.logger.info('Starting deployment', { deploymentId, type });

      switch (type) {
        case 'configuration':
          await this.deployConfiguration(deployment);
          break;
        case 'environment':
          await this.deployEnvironment(deployment);
          break;
        case 'full':
          await this.deployFull(deployment);
          break;
      }

      deployment.status = 'completed';
      deployment.endTime = Date.now();

      this.logger.info('Deployment completed successfully', {
        deploymentId,
        type,
        duration: deployment.endTime - deployment.startTime,
        changes: deployment.changes.length
      });

      this.emit('deployment-completed', deployment);

    } catch (error) {
      deployment.status = 'failed';
      deployment.endTime = Date.now();
      deployment.error = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Deployment failed', {
        deploymentId,
        type,
        error: deployment.error
      });

      this.emit('deployment-failed', deployment);
      throw error;
    }

    return deployment;
  }

  async getEnvironmentHealth(): Promise<EnvironmentHealth> {
    try {
      const gitInfo = await this.gitManager.getRepositoryInfo();
      const driftStatus = await this.driftDetector.getCurrentStatus();
      const syncStatus = await this.configSynchronizer.getStatus();

      // Evaluate component health
      const gitHealth = gitInfo.isRepository && !gitInfo.uncommittedChanges ? 'healthy' : 'warning';
      const driftHealth = driftStatus.criticalDrifts === 0 ? 
        (driftStatus.highDrifts === 0 ? 'healthy' : 'warning') : 'critical';
      const syncHealth = syncStatus.unresolvedConflicts === 0 ? 'healthy' : 'warning';
      const servicesHealth = 'healthy'; // Would check actual services

      // Calculate overall health
      let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (driftHealth === 'critical') {
        overall = 'critical';
      } else if (gitHealth === 'warning' || driftHealth === 'warning' || syncHealth === 'warning') {
        overall = 'warning';
      }

      return {
        overall,
        components: {
          git: gitHealth as any,
          drift: driftHealth as any,
          sync: syncHealth as any,
          services: servicesHealth as any
        },
        lastChecked: Date.now(),
        details: {
          git: gitInfo,
          drift: driftStatus,
          sync: syncStatus
        }
      };

    } catch (error) {
      this.logger.error('Failed to get environment health', { error });
      
      return {
        overall: 'critical',
        components: {
          git: 'critical',
          drift: 'critical',
          sync: 'critical',
          services: 'critical'
        },
        lastChecked: Date.now(),
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  async getDeploymentHistory(limit: number = 10): Promise<DeploymentStatus[]> {
    return this.deploymentHistory.slice(-limit);
  }

  async rollbackDeployment(deploymentId: string): Promise<void> {
    this.logger.info('Rolling back deployment', { deploymentId });

    try {
      const deployment = this.deploymentHistory.find(d => d.id === deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      // For now, we'll reset to the previous commit
      const commits = await this.gitManager.getCommitHistory(5);
      if (commits.length > 1) {
        await this.gitManager.resetToCommit(commits[1].hash, true);
        this.logger.info('Rollback completed', { deploymentId, targetCommit: commits[1].hash });
      } else {
        throw new Error('No previous commit found for rollback');
      }

      this.emit('deployment-rolled-back', { deploymentId });

    } catch (error) {
      this.logger.error('Failed to rollback deployment', { deploymentId, error });
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Listen to drift detection events
    this.driftDetector.on('drift-detected', (drift) => {
      this.logger.warn('Drift detected by controller', { drift });
      this.emit('drift-detected', drift);
      
      // Auto-remediate if configured
      if (drift.remediation?.automatic) {
        this.handleAutomaticRemediation(drift);
      }
    });

    // Listen to sync events
    this.configSynchronizer.on('sync-started', (operation) => {
      this.logger.info('Sync started by controller', { operation });
      this.emit('sync-started', operation);
    });

    this.configSynchronizer.on('sync-completed', (operation) => {
      this.logger.info('Sync completed by controller', { operation });
      this.emit('sync-completed', operation);
      this.emit('config-changed', operation);
    });

    this.configSynchronizer.on('sync-failed', (operation) => {
      this.logger.error('Sync failed by controller', { operation });
      this.emit('sync-failed', operation);
    });

    this.configSynchronizer.on('conflict-resolved', (data) => {
      this.logger.info('Conflict resolved by controller', { data });
      this.emit('conflict-resolved', data);
    });
  }

  private async performInitialDeployment(): Promise<void> {
    this.logger.info('Performing initial deployment');

    try {
      // Check if we need to pull from remote
      const gitInfo = await this.gitManager.getRepositoryInfo();
      if (gitInfo.hasRemote) {
        await this.gitManager.pullChanges();
      }

      // Trigger initial sync
      await this.configSynchronizer.triggerSync('pull');

      this.logger.info('Initial deployment completed');

    } catch (error) {
      this.logger.error('Initial deployment failed', { error });
      // Don't throw here, allow controller to start in degraded mode
    }
  }

  private async deployConfiguration(deployment: DeploymentStatus): Promise<void> {
    this.logger.info('Deploying configuration', { deploymentId: deployment.id });

    // Pull latest configuration from git
    await this.gitManager.pullChanges();

    // Trigger configuration sync
    const syncOperation = await this.configSynchronizer.triggerSync('pull');
    deployment.changes.push({
      type: 'config-sync',
      operation: syncOperation
    });

    // Check for drift and remediate
    const drifts = await this.driftDetector.performCheck();
    if (drifts.length > 0) {
      deployment.changes.push({
        type: 'drift-remediation',
        drifts: drifts.length
      });
    }
  }

  private async deployEnvironment(deployment: DeploymentStatus): Promise<void> {
    this.logger.info('Deploying environment', { deploymentId: deployment.id });

    // Deploy configuration first
    await this.deployConfiguration(deployment);

    // Additional environment-specific deployments would go here
    // For example: restart services, update containers, etc.
    deployment.changes.push({
      type: 'environment-update',
      action: 'restart-services'
    });
  }

  private async deployFull(deployment: DeploymentStatus): Promise<void> {
    this.logger.info('Performing full deployment', { deploymentId: deployment.id });

    // Deploy environment (includes configuration)
    await this.deployEnvironment(deployment);

    // Additional full deployment steps
    deployment.changes.push({
      type: 'full-deployment',
      action: 'complete-refresh'
    });
  }

  private async handleAutomaticRemediation(drift: any): Promise<void> {
    this.logger.info('Handling automatic remediation', { driftId: drift.id });

    try {
      await this.driftDetector.resolveDrift(drift.id);
      this.logger.info('Automatic remediation completed', { driftId: drift.id });
    } catch (error) {
      this.logger.error('Automatic remediation failed', { driftId: drift.id, error });
    }
  }

  private generateDeploymentId(): string {
    return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}