import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { GitOpsController } from './controller/GitOpsController';
import { DriftDetector } from './drift/DriftDetector';
import { ConfigSynchronizer } from './sync/ConfigSynchronizer';
import { GitRepositoryManager } from './git/GitRepositoryManager';
import { Logger } from './utils/Logger';
import { MetricsExporter } from './metrics/MetricsExporter';
import { setupRoutes } from './routes';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize core components
const logger = new Logger('GitOps-Controller');
const metricsExporter = new MetricsExporter();
const gitManager = new GitRepositoryManager({
  workDir: process.env.GIT_WORK_DIR || '/tmp/claude-env-git',
  defaultBranch: process.env.GIT_BRANCH || 'main'
});

const driftDetector = new DriftDetector({
  checkInterval: parseInt(process.env.DRIFT_CHECK_INTERVAL || '60000'), // 1 minute
  thresholds: {
    critical: 0.8,
    high: 0.6,
    medium: 0.4,
    low: 0.2
  }
});

const configSynchronizer = new ConfigSynchronizer({
  autoSync: process.env.AUTO_SYNC === 'true',
  syncInterval: parseInt(process.env.SYNC_INTERVAL || '300000'), // 5 minutes
  maxRetries: parseInt(process.env.MAX_RETRIES || '3')
});

const gitopsController = new GitOpsController({
  gitManager,
  driftDetector,
  configSynchronizer,
  logger,
  metricsExporter
});

// Setup routes
setupRoutes(app, gitopsController, metricsExporter);

// WebSocket handling for real-time updates
wss.on('connection', (ws, request) => {
  logger.info('New WebSocket connection established', { 
    origin: request.headers.origin,
    userAgent: request.headers['user-agent']
  });

  // Subscribe to controller events
  const handleDriftDetected = (data: any) => {
    ws.send(JSON.stringify({
      type: 'drift-detected',
      data
    }));
  };

  const handleSyncStarted = (data: any) => {
    ws.send(JSON.stringify({
      type: 'sync-started',
      data
    }));
  };

  const handleSyncCompleted = (data: any) => {
    ws.send(JSON.stringify({
      type: 'sync-completed',
      data
    }));
  };

  const handleConfigChanged = (data: any) => {
    ws.send(JSON.stringify({
      type: 'config-changed',
      data
    }));
  };

  driftDetector.on('drift-detected', handleDriftDetected);
  configSynchronizer.on('sync-started', handleSyncStarted);
  configSynchronizer.on('sync-completed', handleSyncCompleted);
  gitopsController.on('config-changed', handleConfigChanged);

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe-drift':
          // Send current drift status
          const driftStatus = await driftDetector.getCurrentStatus();
          ws.send(JSON.stringify({
            type: 'drift-status',
            data: driftStatus
          }));
          break;
          
        case 'subscribe-sync':
          // Send current sync status
          const syncStatus = await configSynchronizer.getStatus();
          ws.send(JSON.stringify({
            type: 'sync-status',
            data: syncStatus
          }));
          break;
          
        case 'trigger-sync':
          // Trigger manual sync
          await configSynchronizer.triggerSync();
          break;
          
        case 'trigger-drift-check':
          // Trigger manual drift check
          await driftDetector.performCheck();
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      logger.error('Error processing WebSocket message', { error });
    }
  });

  // Cleanup on disconnect
  ws.on('close', () => {
    driftDetector.off('drift-detected', handleDriftDetected);
    configSynchronizer.off('sync-started', handleSyncStarted);
    configSynchronizer.off('sync-completed', handleSyncCompleted);
    gitopsController.off('config-changed', handleConfigChanged);
    logger.info('WebSocket connection closed');
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    data: {
      message: 'Connected to GitOps Controller',
      timestamp: new Date().toISOString(),
      features: ['drift-detection', 'auto-sync', 'config-management']
    }
  }));
});

// Initialize controller
async function initialize() {
  try {
    logger.info('Initializing GitOps Controller...');
    
    // Initialize Git repository
    await gitManager.initialize();
    
    // Start drift detection
    await driftDetector.start();
    
    // Start config synchronization
    await configSynchronizer.start();
    
    // Start metrics collection
    await metricsExporter.start();
    
    // Initialize controller
    await gitopsController.initialize();
    
    logger.info('GitOps Controller initialized successfully', {
      port: process.env.PORT || 5000,
      gitRepo: gitManager.getRepositoryInfo(),
      features: {
        driftDetection: true,
        autoSync: configSynchronizer.isAutoSyncEnabled(),
        metricsCollection: true
      }
    });
    
  } catch (error) {
    logger.error('Failed to initialize GitOps Controller', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  
  try {
    await driftDetector.stop();
    await configSynchronizer.stop();
    await metricsExporter.stop();
    await gitopsController.shutdown();
    
    server.close(() => {
      logger.info('GitOps Controller shut down successfully');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.kill(process.pid, 'SIGTERM');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`GitOps Controller listening on port ${PORT}`);
  initialize();
});

export { app, gitopsController, driftDetector, configSynchronizer };