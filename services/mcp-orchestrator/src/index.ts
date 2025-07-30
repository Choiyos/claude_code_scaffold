import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { MCPOrchestrator } from './orchestrator/MCPOrchestrator';
import { LoadBalancer } from './balancer/LoadBalancer';
import { HealthMonitor } from './monitoring/HealthMonitor';
import { ConfigManager } from './config/ConfigManager';
import { Logger } from './utils/Logger';
import { MetricsCollector } from './metrics/MetricsCollector';
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
const logger = new Logger('MCP-Orchestrator');
const configManager = new ConfigManager();
const metricsCollector = new MetricsCollector();
const loadBalancer = new LoadBalancer();
const healthMonitor = new HealthMonitor();
const orchestrator = new MCPOrchestrator({
  loadBalancer,
  healthMonitor,
  configManager,
  metricsCollector,
  logger
});

// Setup routes
setupRoutes(app, orchestrator, metricsCollector);

// WebSocket handling for real-time updates
wss.on('connection', (ws, request) => {
  logger.info('New WebSocket connection established', { 
    origin: request.headers.origin,
    userAgent: request.headers['user-agent']
  });

  // Subscribe to orchestrator events
  const handleServerUpdate = (data: any) => {
    ws.send(JSON.stringify({
      type: 'server-update',
      data
    }));
  };

  const handleHealthUpdate = (data: any) => {
    ws.send(JSON.stringify({
      type: 'health-update',
      data
    }));
  };

  const handleMetricsUpdate = (data: any) => {
    ws.send(JSON.stringify({
      type: 'metrics-update',
      data
    }));
  };

  orchestrator.on('server-registered', handleServerUpdate);
  orchestrator.on('server-unregistered', handleServerUpdate);
  orchestrator.on('server-health-changed', handleHealthUpdate);
  metricsCollector.on('metrics-updated', handleMetricsUpdate);

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe-metrics':
          // Send current metrics
          const currentMetrics = await metricsCollector.getAllMetrics();
          ws.send(JSON.stringify({
            type: 'metrics-snapshot',
            data: currentMetrics
          }));
          break;
          
        case 'subscribe-servers':
          // Send current server list
          const servers = await orchestrator.getServerList();
          ws.send(JSON.stringify({
            type: 'servers-snapshot',
            data: servers
          }));
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
    orchestrator.off('server-registered', handleServerUpdate);
    orchestrator.off('server-unregistered', handleServerUpdate);
    orchestrator.off('server-health-changed', handleHealthUpdate);
    metricsCollector.off('metrics-updated', handleMetricsUpdate);
    logger.info('WebSocket connection closed');
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    data: {
      message: 'Connected to MCP Orchestrator',
      timestamp: new Date().toISOString()
    }
  }));
});

// Initialize orchestrator
async function initialize() {
  try {
    logger.info('Initializing MCP Orchestrator...');
    
    // Load configuration
    await configManager.loadConfig();
    
    // Start health monitoring
    await healthMonitor.start();
    
    // Initialize metrics collection
    await metricsCollector.start();
    
    // Load and register configured MCP servers
    const serverConfigs = configManager.getMCPServerConfigs();
    for (const config of serverConfigs) {
      await orchestrator.registerServer(config);
    }
    
    logger.info('MCP Orchestrator initialized successfully', {
      registeredServers: serverConfigs.length,
      port: process.env.PORT || 4000
    });
    
  } catch (error) {
    logger.error('Failed to initialize MCP Orchestrator', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  
  try {
    await healthMonitor.stop();
    await metricsCollector.stop();
    await orchestrator.shutdown();
    
    server.close(() => {
      logger.info('MCP Orchestrator shut down successfully');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  logger.info(`MCP Orchestrator listening on port ${PORT}`);
  initialize();
});

export { app, orchestrator, metricsCollector };