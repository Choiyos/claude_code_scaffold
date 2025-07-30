import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { EnvironmentController } from '../services/EnvironmentController';
import { createLogger } from '@shared/utils/logger';
import { BadRequestError, NotFoundError } from '@shared/utils/errors';
import { EnvironmentType } from '@shared/types';

const logger = createLogger('environment-controller:routes');

export const environmentRoutes = (controller: EnvironmentController): Router => {
  const router = Router();

  // Validation middleware
  const validateRequest = (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new BadRequestError('Validation failed', { errors: errors.array() });
    }
    next();
  };

  // GET /environments - List environments
  router.get('/',
    [
      query('userId').optional().isUUID(),
      query('teamId').optional().isUUID(),
      query('type').optional().isIn(Object.values(EnvironmentType)),
      query('status').optional().isString(),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { userId, teamId, type, status, page = 1, limit = 20 } = req.query;
        
        logger.info('Listing environments', {
          userId,
          teamId,
          type,
          status,
          requestId: req.headers['x-request-id']
        });

        let environments = await controller.listEnvironments(
          userId as string,
          teamId as string
        );

        // Apply additional filters
        if (type) {
          environments = environments.filter(env => env.type === type);
        }
        if (status) {
          environments = environments.filter(env => env.status === status);
        }

        // Apply pagination
        const startIndex = (Number(page) - 1) * Number(limit);
        const paginatedEnvironments = environments.slice(startIndex, startIndex + Number(limit));

        res.json({
          success: true,
          data: {
            items: paginatedEnvironments,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: environments.length,
              totalPages: Math.ceil(environments.length / Number(limit))
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to list environments:', error);
        throw error;
      }
    }
  );

  // POST /environments - Create environment
  router.post('/',
    [
      body('name').isString().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().isLength({ max: 1000 }),
      body('type').isIn(Object.values(EnvironmentType)),
      body('userId').isUUID(),
      body('teamId').optional().isUUID(),
      body('config').optional().isObject()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { name, description, type, userId, teamId, config } = req.body;
        
        logger.info('Creating environment', {
          name,
          type,
          userId,
          teamId,
          requestId: req.headers['x-request-id']
        });

        const environment = await controller.createEnvironment({
          name,
          description,
          type,
          userId,
          teamId,
          config
        });

        res.status(201).json({
          success: true,
          data: environment,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to create environment:', error);
        throw error;
      }
    }
  );

  // GET /environments/:id - Get environment by ID
  router.get('/:id',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Getting environment', {
          environmentId: id,
          requestId: req.headers['x-request-id']
        });

        const environment = await controller.getEnvironment(id);

        res.json({
          success: true,
          data: environment,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to get environment:', error);
        throw error;
      }
    }
  );

  // PUT /environments/:id - Update environment
  router.put('/:id',
    [
      param('id').isUUID(),
      body('name').optional().isString().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().isLength({ max: 1000 }),
      body('type').optional().isIn(Object.values(EnvironmentType)),
      body('config').optional().isObject()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        
        logger.info('Updating environment', {
          environmentId: id,
          updates: Object.keys(updates),
          requestId: req.headers['x-request-id']
        });

        const environment = await controller.updateEnvironment(id, updates);

        res.json({
          success: true,
          data: environment,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to update environment:', error);
        throw error;
      }
    }
  );

  // DELETE /environments/:id - Delete environment
  router.delete('/:id',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Deleting environment', {
          environmentId: id,
          requestId: req.headers['x-request-id']
        });

        await controller.deleteEnvironment(id);

        res.json({
          success: true,
          data: { deleted: true },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to delete environment:', error);
        throw error;
      }
    }
  );

  // GET /environments/:id/status - Get environment status
  router.get('/:id/status',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Getting environment status', {
          environmentId: id,
          requestId: req.headers['x-request-id']
        });

        const status = await controller.getEnvironmentStatus(id);

        res.json({
          success: true,
          data: status,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to get environment status:', error);
        throw error;
      }
    }
  );

  // GET /environments/:id/logs - Get environment logs
  router.get('/:id/logs',
    [
      param('id').isUUID(),
      query('service').optional().isString(),
      query('since').optional().isString(),
      query('tail').optional().isInt({ min: 1, max: 10000 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { service, since, tail } = req.query;
        
        logger.info('Getting environment logs', {
          environmentId: id,
          service,
          since,
          tail,
          requestId: req.headers['x-request-id']
        });

        const logs = await controller.getEnvironmentLogs(id, {
          service: service as string,
          since: since as string,
          tail: tail ? Number(tail) : undefined
        });

        res.json({
          success: true,
          data: { logs },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to get environment logs:', error);
        throw error;
      }
    }
  );

  // POST /environments/:id/start - Start environment
  router.post('/:id/start',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Starting environment', {
          environmentId: id,
          requestId: req.headers['x-request-id']
        });

        const environment = await controller.getEnvironment(id);
        
        // Start the environment (this would call the private method)
        // For now, we'll update the status directly
        await controller.updateEnvironment(id, { status: 'running' as any });

        res.json({
          success: true,
          data: { message: 'Environment start initiated' },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to start environment:', error);
        throw error;
      }
    }
  );

  // POST /environments/:id/stop - Stop environment
  router.post('/:id/stop',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Stopping environment', {
          environmentId: id,
          requestId: req.headers['x-request-id']
        });

        const environment = await controller.getEnvironment(id);
        
        // Stop the environment (this would call the private method)
        // For now, we'll update the status directly
        await controller.updateEnvironment(id, { status: 'stopped' as any });

        res.json({
          success: true,
          data: { message: 'Environment stop initiated' },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to stop environment:', error);
        throw error;
      }
    }
  );

  // POST /environments/:id/restart - Restart environment
  router.post('/:id/restart',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Restarting environment', {
          environmentId: id,
          requestId: req.headers['x-request-id']
        });

        const environment = await controller.getEnvironment(id);
        
        // Restart the environment
        await controller.updateEnvironment(id, { status: 'updating' as any });
        
        // Simulate restart process
        setTimeout(async () => {
          try {
            await controller.updateEnvironment(id, { status: 'running' as any });
          } catch (error) {
            logger.error('Failed to complete environment restart:', error);
          }
        }, 5000);

        res.json({
          success: true,
          data: { message: 'Environment restart initiated' },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to restart environment:', error);
        throw error;
      }
    }
  );

  return router;
};