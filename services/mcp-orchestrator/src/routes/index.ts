import { Express, Request, Response } from 'express';
import { MCPOrchestrator } from '../orchestrator/MCPOrchestrator';
import { MetricsCollector } from '../metrics/MetricsCollector';

export function setupRoutes(
  app: Express, 
  orchestrator: MCPOrchestrator, 
  metricsCollector: MetricsCollector
): void {
  
  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'mcp-orchestrator',
      version: '1.0.0'
    });
  });

  // Server management endpoints
  app.get('/api/servers', async (req: Request, res: Response) => {
    try {
      const servers = await orchestrator.getAllServers();
      res.json({
        servers,
        count: servers.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get servers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/servers/:serverId', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const server = await orchestrator.getServer(serverId);
      
      if (!server) {
        return res.status(404).json({
          error: 'Server not found',
          serverId
        });
      }

      res.json(server);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get server',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/servers/:serverId/start', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      await orchestrator.startServer(serverId);
      res.json({
        message: 'Server started successfully',
        serverId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start server',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/servers/:serverId/stop', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      await orchestrator.stopServer(serverId);
      res.json({
        message: 'Server stopped successfully',
        serverId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to stop server',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/servers/:serverId/restart', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      await orchestrator.restartServer(serverId);
      res.json({
        message: 'Server restarted successfully',
        serverId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to restart server',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Load balancing endpoints
  app.get('/api/load-balancer/status', async (req: Request, res: Response) => {
    try {
      const status = await orchestrator.getLoadBalancerStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get load balancer status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/load-balancer/strategy', async (req: Request, res: Response) => {
    try {
      const { strategy } = req.body;
      
      if (!['round-robin', 'least-connections', 'resource-based', 'weighted'].includes(strategy)) {
        return res.status(400).json({
          error: 'Invalid strategy',
          validStrategies: ['round-robin', 'least-connections', 'resource-based', 'weighted']
        });
      }

      await orchestrator.updateLoadBalancingStrategy(strategy);
      res.json({
        message: 'Load balancing strategy updated',
        strategy,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to update load balancing strategy',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Health monitoring endpoints
  app.get('/api/health/servers', async (req: Request, res: Response) => {
    try {
      const healthStatus = await orchestrator.getHealthStatus();
      res.json(healthStatus);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get health status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/health/check', async (req: Request, res: Response) => {
    try {
      await orchestrator.performHealthCheck();
      res.json({
        message: 'Health check completed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to perform health check',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Request routing endpoints
  app.post('/api/request', async (req: Request, res: Response) => {
    try {
      const { serverType, capability, request: requestData } = req.body;
      
      if (!requestData) {
        return res.status(400).json({
          error: 'Request data required'
        });
      }

      const result = await orchestrator.routeRequest(serverType, capability, requestData);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to route request',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Metrics endpoints
  app.get('/api/metrics/summary', async (req: Request, res: Response) => {
    try {
      const metrics = await metricsCollector.getMetricsSummary();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get metrics summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/metrics/servers/:serverId', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const metrics = await metricsCollector.getServerMetrics(serverId);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get server metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Configuration endpoints
  app.get('/api/config', async (req: Request, res: Response) => {
    try {
      const config = await orchestrator.getConfiguration();
      res.json(config);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/config/reload', async (req: Request, res: Response) => {
    try {
      await orchestrator.reloadConfiguration();
      res.json({
        message: 'Configuration reloaded successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to reload configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Circuit breaker endpoints
  app.get('/api/circuit-breakers', async (req: Request, res: Response) => {
    try {
      const status = await orchestrator.getCircuitBreakerStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get circuit breaker status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/circuit-breakers/:serverId/reset', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      await orchestrator.resetCircuitBreaker(serverId);
      res.json({
        message: 'Circuit breaker reset successfully',
        serverId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to reset circuit breaker',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Administrative endpoints
  app.get('/api/admin/stats', async (req: Request, res: Response) => {
    try {
      const stats = await orchestrator.getSystemStatistics();
      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get system statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/admin/cleanup', async (req: Request, res: Response) => {
    try {
      await orchestrator.performCleanup();
      res.json({
        message: 'Cleanup completed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to perform cleanup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // System information endpoint
  app.get('/api/system/info', (req: Request, res: Response) => {
    res.json({
      service: 'mcp-orchestrator',
      version: '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  // Prometheus metrics endpoint (delegated to metrics collector)
  app.get('/metrics', (req: Request, res: Response) => {
    // This is handled by the MetricsCollector on a separate port
    res.redirect(`http://localhost:9091/metrics`);
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