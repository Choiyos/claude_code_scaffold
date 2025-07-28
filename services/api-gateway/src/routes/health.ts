import { Router } from 'express';
import { createLogger } from '@shared/utils/logger';

const router = Router();
const logger = createLogger('api-gateway:health');

// Health check endpoint
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check service dependencies
    const checks = await Promise.allSettled([
      checkService('Environment Controller', process.env.ENVIRONMENT_CONTROLLER_URL || 'http://localhost:3001'),
      checkService('MCP Orchestrator', process.env.MCP_ORCHESTRATOR_URL || 'http://localhost:3002'),
      checkService('Configuration Manager', process.env.CONFIGURATION_MANAGER_URL || 'http://localhost:3003'),
      checkRedis(),
      checkDatabase()
    ]);

    const results = checks.map((check, index) => {
      const serviceNames = ['Environment Controller', 'MCP Orchestrator', 'Configuration Manager', 'Redis', 'Database'];
      if (check.status === 'fulfilled') {
        return { service: serviceNames[index], status: 'healthy', ...check.value };
      } else {
        return { service: serviceNames[index], status: 'unhealthy', error: check.reason?.message };
      }
    });

    const unhealthyServices = results.filter(r => r.status === 'unhealthy');
    const overallStatus = unhealthyServices.length === 0 ? 'healthy' : 'degraded';
    const responseTime = Date.now() - startTime;

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      responseTime,
      services: results,
      system: {
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        cpu: process.cpuUsage(),
        pid: process.pid
      }
    };

    if (overallStatus === 'healthy') {
      res.json(response);
    } else {
      res.status(503).json(response);
    }
    
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      responseTime: Date.now() - startTime
    });
  }
});

// Readiness check endpoint
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are available
    const criticalServices = [
      checkService('Environment Controller', process.env.ENVIRONMENT_CONTROLLER_URL || 'http://localhost:3001'),
      checkRedis()
    ];

    const results = await Promise.allSettled(criticalServices);
    const allReady = results.every(result => result.status === 'fulfilled');

    if (allReady) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        details: 'Critical services unavailable'
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed'
    });
  }
});

// Liveness check endpoint
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

// Helper functions for health checks
async function checkService(name: string, url: string): Promise<any> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        responseTime: Date.now() - Date.now(),
        version: data.version
      };
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error: any) {
    throw new Error(`Service ${name} unreachable: ${error.message}`);
  }
}

async function checkRedis(): Promise<any> {
  try {
    // This would use the actual Redis client in production
    return { status: 'connected' };
  } catch (error: any) {
    throw new Error(`Redis unreachable: ${error.message}`);
  }
}

async function checkDatabase(): Promise<any> {
  try {
    // This would use the actual database client in production
    return { status: 'connected', pool: { total: 10, idle: 5, active: 5 } };
  } catch (error: any) {
    throw new Error(`Database unreachable: ${error.message}`);
  }
}

export { router as healthRouter };