import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import promClient from 'prom-client';
import dotenv from 'dotenv';

import { createLogger } from '@shared/utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { metricsMiddleware } from './middleware/metrics';
import { environmentRoutes } from './routes/environments';
import { healthRoutes } from './routes/health';
import { EnvironmentController } from './services/EnvironmentController';
import { WebSocketHandler } from './services/WebSocketHandler';

// Load environment variables
dotenv.config();

const logger = createLogger('environment-controller');
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const environmentController = new EnvironmentController();

// Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: promClient.register });

// Middleware setup
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID middleware
app.use(requestIdMiddleware);

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Metrics middleware
app.use(metricsMiddleware);

// Routes
app.use('/health', healthRoutes);
app.use('/environments', environmentRoutes(environmentController));

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await promClient.register.metrics();
    res.set('Content-Type', promClient.register.contentType);
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.json({
    service: 'Environment Controller',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Setup WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

const wsHandler = new WebSocketHandler(wss, environmentController);

// Initialize environment controller
environmentController.initialize().then(() => {
  logger.info('Environment Controller initialized successfully');
}).catch((error) => {
  logger.error('Failed to initialize Environment Controller:', error);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  // Close WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await environmentController.shutdown();
      logger.info('Environment Controller shutdown completed');
    } catch (error) {
      logger.error('Error during Environment Controller shutdown:', error);
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Environment Controller running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`WebSocket: ws://localhost:${PORT}/ws`);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;