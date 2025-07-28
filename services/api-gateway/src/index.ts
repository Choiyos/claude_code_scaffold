import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createClient } from 'redis';
import promClient from 'prom-client';
import dotenv from 'dotenv';

import { createLogger } from '@shared/utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { metricsMiddleware } from './middleware/metrics';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';

// Load environment variables
dotenv.config();

const logger = createLogger('api-gateway');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Redis client for rate limiting
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: promClient.register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

promClient.register.registerMetric(httpRequestDuration);
promClient.register.registerMetric(httpRequestTotal);

// Middleware setup
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [\"'self'\"],
      styleSrc: [\"'self'\", \"'unsafe-inline'\"],
      scriptSrc: [\"'self'\"],
      imgSrc: [\"'self'\", 'data:', 'https:'],
      connectSrc: [\"'self'\"],
      fontSrc: [\"'self'\"],
      objectSrc: [\"'none'\"],
      mediaSrc: [\"'self'\"],
      frameSrc: [\"'none'\"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware
app.use(requestIdMiddleware);

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Metrics middleware
app.use(metricsMiddleware(httpRequestDuration, httpRequestTotal));

// Rate limiting with Redis
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000, // Limit each IP
  message: {
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/metrics';
  },
  store: process.env.REDIS_URL ? undefined : undefined // Use Redis store in production
});

app.use(limiter);

// Health check routes (before auth)
app.use('/health', healthRouter);

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

// Authentication middleware (after health checks)
app.use(authMiddleware);

// Service proxy configurations
const serviceProxies = {
  environments: {
    target: process.env.ENVIRONMENT_CONTROLLER_URL || 'http://localhost:3001',
    pathRewrite: { '^/api/environments': '' },
    timeout: 30000
  },
  mcp: {
    target: process.env.MCP_ORCHESTRATOR_URL || 'http://localhost:3002',
    pathRewrite: { '^/api/mcp': '' },
    timeout: 30000
  },
  config: {
    target: process.env.CONFIGURATION_MANAGER_URL || 'http://localhost:3003',
    pathRewrite: { '^/api/config': '' },
    timeout: 30000
  }
};

// Setup proxy routes
Object.entries(serviceProxies).forEach(([service, config]) => {
  const proxy = createProxyMiddleware({
    target: config.target,
    changeOrigin: true,
    pathRewrite: config.pathRewrite,
    timeout: config.timeout,
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${service}:`, err);
      res.status(503).json({
        error: 'Service temporarily unavailable',
        service,
        code: 'SERVICE_UNAVAILABLE'
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      // Add correlation ID to proxied requests
      proxyReq.setHeader('X-Request-ID', req.headers['x-request-id'] || '');
      proxyReq.setHeader('X-User-ID', (req as any).user?.id || '');
      
      logger.debug(`Proxying ${req.method} ${req.url} to ${service}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      // Add CORS headers to proxied responses
      proxyRes.headers['Access-Control-Allow-Origin'] = res.getHeader('Access-Control-Allow-Origin') as string;
      proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
    }
  });

  app.use(`/api/${service}`, proxy);
});

// WebSocket proxy for real-time updates
const wsProxy = createProxyMiddleware({
  target: process.env.ENVIRONMENT_CONTROLLER_URL || 'http://localhost:3001',
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/ws': '/ws' },
  onError: (err, req, res) => {
    logger.error('WebSocket proxy error:', err);
  }
});

app.use('/ws', wsProxy);

// Default route
app.get('/', (req, res) => {
  res.json({
    service: 'Claude Environment API Gateway',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    code: 'NOT_FOUND'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
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
const server = app.listen(PORT, async () => {
  try {
    // Connect to Redis
    await redisClient.connect();
    logger.info('Connected to Redis');
    
    logger.info(`🚀 API Gateway running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Metrics: http://localhost:${PORT}/metrics`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
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