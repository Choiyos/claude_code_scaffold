import { Router, Request, Response } from 'express';
import { createLogger } from '@shared/utils/logger';
import Docker from 'dockerode';

const logger = createLogger('environment-controller:health');
const router = Router();

// Docker instance for health checks
const docker = new Docker();

router.get('/', async (req: Request, res: Response) => {
  const healthCheck = {
    service: 'Environment Controller',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      docker: 'unknown',
      memory: 'unknown',
      disk: 'unknown'
    }
  };

  try {
    // Check Docker connection
    try {
      await docker.ping();
      healthCheck.checks.docker = 'healthy';
    } catch (error) {
      healthCheck.checks.docker = 'unhealthy';
      healthCheck.status = 'degraded';
      logger.warn('Docker health check failed:', error);
    }

    // Check memory usage
    try {
      const used = process.memoryUsage();
      const memoryUsageMB = Math.round(used.heapUsed / 1024 / 1024);
      const memoryLimitMB = parseInt(process.env.MEMORY_LIMIT_MB || '1024');
      
      if (memoryUsageMB < memoryLimitMB * 0.9) {
        healthCheck.checks.memory = 'healthy';
      } else {
        healthCheck.checks.memory = 'warning';
        if (healthCheck.status === 'healthy') {
          healthCheck.status = 'degraded';
        }
      }
    } catch (error) {
      healthCheck.checks.memory = 'error';
      healthCheck.status = 'degraded';
    }

    // Check disk space for workspace directory
    try {
      const fs = require('fs-extra');
      const path = require('path');
      const workspaceDir = process.env.WORKSPACE_DIR || '/tmp/claude-environments';
      
      await fs.ensureDir(workspaceDir);
      const stats = await fs.stat(workspaceDir);
      
      if (stats.isDirectory()) {
        healthCheck.checks.disk = 'healthy';
      } else {
        healthCheck.checks.disk = 'unhealthy';
        healthCheck.status = 'unhealthy';
      }
    } catch (error) {
      healthCheck.checks.disk = 'unhealthy';
      healthCheck.status = 'unhealthy';
      logger.warn('Disk health check failed:', error);
    }

    // Determine response status code
    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    const errorResponse = {
      ...healthCheck,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    res.status(503).json(errorResponse);
  }
});

// Readiness probe
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if the service is ready to accept traffic
    await docker.ping();
    
    res.status(200).json({
      service: 'Environment Controller',
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      service: 'Environment Controller',
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Liveness probe
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    service: 'Environment Controller',
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export { router as healthRoutes };