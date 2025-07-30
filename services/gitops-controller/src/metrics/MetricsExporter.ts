import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import express from 'express';
import { Logger } from '../utils/Logger';

export class MetricsExporter {
  private logger: Logger;
  private app?: express.Application;
  private server?: any;
  private port: number;

  // Metrics
  private driftCounter: Counter<string>;
  private syncDuration: Histogram<string>;
  private deploymentCounter: Counter<string>;
  private healthGauge: Gauge<string>;
  private configChangesCounter: Counter<string>;
  private gitOperationsCounter: Counter<string>;

  constructor(port: number = 9090) {
    this.logger = new Logger('MetricsExporter');
    this.port = port;

    // Initialize metrics
    this.initializeMetrics();
  }

  async start(): Promise<void> {
    this.logger.info('Starting metrics exporter', { port: this.port });

    // Collect default metrics
    collectDefaultMetrics({
      prefix: 'claude_gitops_',
      timeout: 5000,
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
    });

    // Setup metrics endpoint
    this.app = express();
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        this.logger.error('Error generating metrics', { error });
        res.status(500).end('Error generating metrics');
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    this.server = this.app.listen(this.port, () => {
      this.logger.info('Metrics exporter started successfully', { port: this.port });
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping metrics exporter');

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('Metrics exporter stopped');
          resolve(void 0);
        });
      });
    }
  }

  // Drift metrics
  recordDriftDetected(type: string, severity: string): void {
    this.driftCounter.inc({ type, severity });
  }

  recordDriftResolved(type: string, severity: string): void {
    this.driftCounter.inc({ type, severity, status: 'resolved' });
  }

  // Sync metrics
  recordSyncOperation(type: string, status: string, duration: number): void {
    this.syncDuration.observe({ type, status }, duration / 1000);
  }

  recordSyncConflict(type: string): void {
    this.configChangesCounter.inc({ type: 'conflict', operation: type });
  }

  // Deployment metrics
  recordDeploymentStarted(type: string): void {
    this.deploymentCounter.inc({ type, status: 'started' });
  }

  recordDeploymentCompleted(type: string, duration: number): void {
    this.deploymentCounter.inc({ type, status: 'completed' });
  }

  recordDeploymentFailed(type: string, error: string): void {
    this.deploymentCounter.inc({ type, status: 'failed', error });
  }

  // Health metrics
  updateHealthStatus(component: string, status: number): void {
    // 1 = healthy, 0.5 = warning, 0 = critical
    this.healthGauge.set({ component }, status);
  }

  // Config metrics
  recordConfigChange(type: string, source: string): void {
    this.configChangesCounter.inc({ type, source });
  }

  // Git metrics
  recordGitOperation(operation: string, status: string): void {
    this.gitOperationsCounter.inc({ operation, status });
  }

  recordGitCommit(branch: string): void {
    this.gitOperationsCounter.inc({ operation: 'commit', branch });
  }

  recordGitPull(branch: string, changes: number): void {
    this.gitOperationsCounter.inc({ operation: 'pull', branch });
  }

  recordGitPush(branch: string): void {
    this.gitOperationsCounter.inc({ operation: 'push', branch });
  }

  // Custom metrics for specific scenarios
  recordMCPServerHealth(serverName: string, status: number): void {
    this.healthGauge.set({ component: `mcp_${serverName}` }, status);
  }

  recordEnvironmentRestart(): void {
    this.deploymentCounter.inc({ type: 'environment', status: 'restart' });
  }

  recordConfigValidation(status: string, errors: number): void {
    this.configChangesCounter.inc({ type: 'validation', status });
  }

  private initializeMetrics(): void {
    // Drift detection metrics
    this.driftCounter = new Counter({
      name: 'claude_gitops_drift_total',
      help: 'Total number of drift events detected',
      labelNames: ['type', 'severity', 'status']
    });

    // Sync operation metrics
    this.syncDuration = new Histogram({
      name: 'claude_gitops_sync_duration_seconds',
      help: 'Duration of sync operations in seconds',
      labelNames: ['type', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    });

    // Deployment metrics
    this.deploymentCounter = new Counter({
      name: 'claude_gitops_deployments_total',
      help: 'Total number of deployments',
      labelNames: ['type', 'status', 'error']
    });

    // Health metrics
    this.healthGauge = new Gauge({
      name: 'claude_gitops_health_status',
      help: 'Health status of components (1=healthy, 0.5=warning, 0=critical)',
      labelNames: ['component']
    });

    // Configuration change metrics
    this.configChangesCounter = new Counter({
      name: 'claude_gitops_config_changes_total',
      help: 'Total number of configuration changes',
      labelNames: ['type', 'source', 'operation', 'status']
    });

    // Git operation metrics
    this.gitOperationsCounter = new Counter({
      name: 'claude_gitops_git_operations_total',
      help: 'Total number of git operations',
      labelNames: ['operation', 'status', 'branch']
    });

    this.logger.info('Metrics initialized successfully');
  }
}