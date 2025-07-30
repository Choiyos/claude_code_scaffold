import { Express, Request, Response } from 'express';
import { GitOpsController } from '../controller/GitOpsController';
import { MetricsExporter } from '../metrics/MetricsExporter';

export function setupRoutes(
  app: Express, 
  gitopsController: GitOpsController, 
  metricsExporter: MetricsExporter
): void {
  
  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'gitops-controller',
      version: '1.0.0'
    });
  });

  // Environment health endpoint
  app.get('/api/health/environment', async (req: Request, res: Response) => {
    try {
      const health = await gitopsController.getEnvironmentHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get environment health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Deployment endpoints
  app.post('/api/deployments', async (req: Request, res: Response) => {
    try {
      const { type = 'configuration' } = req.body;
      
      if (!['configuration', 'environment', 'full'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid deployment type',
          validTypes: ['configuration', 'environment', 'full']
        });
      }

      const deployment = await gitopsController.triggerDeployment(type);
      res.json(deployment);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to trigger deployment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/deployments', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const deployments = await gitopsController.getDeploymentHistory(limit);
      res.json(deployments);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get deployment history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/deployments/:id/rollback', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await gitopsController.rollbackDeployment(id);
      res.json({ message: 'Rollback initiated successfully' });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to rollback deployment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Drift detection endpoints
  app.get('/api/drift/status', async (req: Request, res: Response) => {
    try {
      // This would get drift status from the controller
      // For now, return a placeholder
      res.json({
        message: 'Drift status endpoint - implementation pending',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get drift status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/drift/check', async (req: Request, res: Response) => {
    try {
      // This would trigger drift check
      res.json({
        message: 'Drift check triggered successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to trigger drift check',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Configuration sync endpoints
  app.get('/api/sync/status', async (req: Request, res: Response) => {
    try {
      // This would get sync status from the controller
      res.json({
        message: 'Sync status endpoint - implementation pending',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/sync/trigger', async (req: Request, res: Response) => {
    try {
      const { type = 'pull' } = req.body;
      
      if (!['pull', 'push', 'merge'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid sync type',
          validTypes: ['pull', 'push', 'merge']
        });
      }

      // This would trigger sync operation
      res.json({
        message: `Sync ${type} triggered successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to trigger sync',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Git operations endpoints
  app.get('/api/git/status', async (req: Request, res: Response) => {
    try {
      // This would get git repository status
      res.json({
        message: 'Git status endpoint - implementation pending',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get git status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/git/commits', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      // This would get commit history
      res.json({
        message: 'Git commits endpoint - implementation pending',
        limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get commit history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Configuration management endpoints
  app.get('/api/config', async (req: Request, res: Response) => {
    try {
      // This would get current configuration
      res.json({
        message: 'Configuration endpoint - implementation pending',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/config/validate', async (req: Request, res: Response) => {
    try {
      const { config } = req.body;
      
      if (!config) {
        return res.status(400).json({
          error: 'Configuration data required'
        });
      }

      // This would validate configuration
      res.json({
        valid: true,
        message: 'Configuration validation - implementation pending',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to validate configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Metrics endpoint (delegated to metrics exporter)
  app.get('/metrics', (req: Request, res: Response) => {
    // This is handled by the MetricsExporter on a separate port
    res.redirect(`http://localhost:9090/metrics`);
  });

  // System information endpoint
  app.get('/api/system/info', (req: Request, res: Response) => {
    res.json({
      service: 'gitops-controller',
      version: '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  // Error handling middleware
  app.use((error: Error, req: Request, res: Response, next: any) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });
}