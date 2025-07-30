import { Router, Request, Response } from 'express';
import { createLogger } from '@shared/utils/logger';
import * as fs from 'fs-extra';

const logger = createLogger('configuration-manager:health');
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const healthCheck = {
    service: 'Configuration Manager',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      filesystem: 'unknown',
      memory: 'unknown',
      schemas: 'unknown'
    }
  };

  try {
    // Check filesystem access
    try {
      const configDir = process.env.CONFIG_DIR || '/workspace/config';
      const schemaDir = process.env.SCHEMA_DIR || '/workspace/schemas';
      const backupDir = process.env.BACKUP_DIR || '/workspace/backups';
      
      await fs.ensureDir(configDir);
      await fs.ensureDir(schemaDir);
      await fs.ensureDir(backupDir);
      
      // Test write access
      const testFile = require('path').join(configDir, '.health-check');
      await fs.writeFile(testFile, 'health check');
      await fs.remove(testFile);
      
      healthCheck.checks.filesystem = 'healthy';
    } catch (error) {
      healthCheck.checks.filesystem = 'unhealthy';
      healthCheck.status = 'degraded';
      logger.warn('Filesystem health check failed:', error);
    }

    // Check memory usage
    try {
      const used = process.memoryUsage();
      const memoryUsageMB = Math.round(used.heapUsed / 1024 / 1024);
      const memoryLimitMB = parseInt(process.env.MEMORY_LIMIT_MB || '512');
      
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

    // Check schema validation capability
    try {
      const Ajv = require('ajv');
      const ajv = new Ajv();
      
      // Test with simple schema
      const testSchema = {
        type: 'object',
        properties: {
          test: { type: 'string' }
        }
      };
      
      const validate = ajv.compile(testSchema);
      const isValid = validate({ test: 'value' });
      
      if (isValid) {
        healthCheck.checks.schemas = 'healthy';
      } else {
        healthCheck.checks.schemas = 'unhealthy';
        healthCheck.status = 'degraded';
      }
    } catch (error) {
      healthCheck.checks.schemas = 'unhealthy';
      healthCheck.status = 'unhealthy';
      logger.warn('Schema validation health check failed:', error);
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
    const configDir = process.env.CONFIG_DIR || '/workspace/config';
    await fs.ensureDir(configDir);
    
    res.status(200).json({
      service: 'Configuration Manager',
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      service: 'Configuration Manager',
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
    service: 'Configuration Manager',
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export { router as healthRoutes };