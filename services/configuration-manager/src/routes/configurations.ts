import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { createLogger } from '@shared/utils/logger';
import { BadRequestError, NotFoundError } from '@shared/utils/errors';

const logger = createLogger('configuration-manager:routes');

export const configurationRoutes = (manager: ConfigurationManager): Router => {
  const router = Router();

  // Validation middleware
  const validateRequest = (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new BadRequestError('Validation failed', { errors: errors.array() });
    }
    next();
  };

  // GET /configurations - List configurations
  router.get('/',
    [
      query('type').optional().isString(),
      query('environment').optional().isString(),
      query('userId').optional().isUUID(),
      query('teamId').optional().isUUID(),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { type, environment, userId, teamId, page = 1, limit = 20 } = req.query;
        
        logger.info('Listing configurations', {
          type,
          environment,
          userId,
          teamId,
          requestId: req.headers['x-request-id']
        });

        const configurations = await manager.listConfigurations({
          type: type as string,
          environment: environment as string,
          userId: userId as string,
          teamId: teamId as string
        });

        // Apply pagination
        const startIndex = (Number(page) - 1) * Number(limit);
        const paginatedConfigurations = configurations.slice(startIndex, startIndex + Number(limit));

        res.json({
          success: true,
          data: {
            items: paginatedConfigurations,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: configurations.length,
              totalPages: Math.ceil(configurations.length / Number(limit))
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to list configurations:', error);
        throw error;
      }
    }
  );

  // POST /configurations - Create configuration
  router.post('/',
    [
      body('name').isString().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().isLength({ max: 1000 }),
      body('type').isString().isLength({ min: 1, max: 100 }),
      body('data').isObject(),
      body('schemaId').optional().isUUID(),
      body('userId').isUUID(),
      body('teamId').optional().isUUID(),
      body('environment').optional().isString()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { name, description, type, data, schemaId, userId, teamId, environment } = req.body;
        
        logger.info('Creating configuration', {
          name,
          type,
          userId,
          teamId,
          environment,
          requestId: req.headers['x-request-id']
        });

        const configuration = await manager.createConfiguration({
          name,
          description,
          type,
          data,
          schemaId,
          userId,
          teamId,
          environment
        });

        res.status(201).json({
          success: true,
          data: configuration,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to create configuration:', error);
        throw error;
      }
    }
  );

  // GET /configurations/:id - Get configuration by ID
  router.get('/:id',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Getting configuration', {
          configurationId: id,
          requestId: req.headers['x-request-id']
        });

        const configuration = await manager.getConfiguration(id);

        res.json({
          success: true,
          data: configuration,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to get configuration:', error);
        throw error;
      }
    }
  );

  // PUT /configurations/:id - Update configuration
  router.put('/:id',
    [
      param('id').isUUID(),
      body('name').optional().isString().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().isLength({ max: 1000 }),
      body('data').optional().isObject(),
      body('schemaId').optional().isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body;
        
        logger.info('Updating configuration', {
          configurationId: id,
          updates: Object.keys(updates),
          requestId: req.headers['x-request-id']
        });

        const configuration = await manager.updateConfiguration(id, updates);

        res.json({
          success: true,
          data: configuration,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to update configuration:', error);
        throw error;
      }
    }
  );

  // DELETE /configurations/:id - Delete configuration
  router.delete('/:id',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Deleting configuration', {
          configurationId: id,
          requestId: req.headers['x-request-id']
        });

        await manager.deleteConfiguration(id);

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
        logger.error('Failed to delete configuration:', error);
        throw error;
      }
    }
  );

  // POST /configurations/:id/validate - Validate configuration
  router.post('/:id/validate',
    [
      param('id').isUUID(),
      body('schemaId').optional().isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { schemaId } = req.body;
        
        logger.info('Validating configuration', {
          configurationId: id,
          schemaId,
          requestId: req.headers['x-request-id']
        });

        const configuration = await manager.getConfiguration(id);
        const finalSchemaId = schemaId || configuration.schemaId;
        
        if (!finalSchemaId) {
          throw new BadRequestError('No schema specified for validation');
        }

        const validationResult = await manager.validateConfiguration(configuration.data, finalSchemaId);

        res.json({
          success: true,
          data: validationResult,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to validate configuration:', error);
        throw error;
      }
    }
  );

  // GET /configurations/:id/backups - Get configuration backups
  router.get('/:id/backups',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Getting configuration backups', {
          configurationId: id,
          requestId: req.headers['x-request-id']
        });

        const backups = await manager.getConfigurationBackups(id);

        res.json({
          success: true,
          data: backups,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to get configuration backups:', error);
        throw error;
      }
    }
  );

  // POST /configurations/:id/restore/:backupId - Restore configuration from backup
  router.post('/:id/restore/:backupId',
    [
      param('id').isUUID(),
      param('backupId').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id, backupId } = req.params;
        
        logger.info('Restoring configuration from backup', {
          configurationId: id,
          backupId,
          requestId: req.headers['x-request-id']
        });

        const configuration = await manager.restoreConfiguration(id, backupId);

        res.json({
          success: true,
          data: configuration,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to restore configuration:', error);
        throw error;
      }
    }
  );

  // GET /configurations/drift - Detect configuration drift
  router.get('/drift',
    async (req: Request, res: Response) => {
      try {
        logger.info('Detecting configuration drift', {
          requestId: req.headers['x-request-id']
        });

        const drifts = await manager.detectDrift();

        res.json({
          success: true,
          data: drifts,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to detect drift:', error);
        throw error;
      }
    }
  );

  return router;
};