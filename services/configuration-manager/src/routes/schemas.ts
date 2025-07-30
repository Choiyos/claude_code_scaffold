import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { createLogger } from '@shared/utils/logger';
import { BadRequestError } from '@shared/utils/errors';

const logger = createLogger('configuration-manager:schemas');

export const schemaRoutes = (manager: ConfigurationManager): Router => {
  const router = Router();

  // Validation middleware
  const validateRequest = (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new BadRequestError('Validation failed', { errors: errors.array() });
    }
    next();
  };

  // GET /schemas - List schemas
  router.get('/',
    [
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { page = 1, limit = 20 } = req.query;
        
        logger.info('Listing schemas', {
          requestId: req.headers['x-request-id']
        });

        const schemas = await manager.listSchemas();

        // Apply pagination
        const startIndex = (Number(page) - 1) * Number(limit);
        const paginatedSchemas = schemas.slice(startIndex, startIndex + Number(limit));

        res.json({
          success: true,
          data: {
            items: paginatedSchemas,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: schemas.length,
              totalPages: Math.ceil(schemas.length / Number(limit))
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to list schemas:', error);
        throw error;
      }
    }
  );

  // POST /schemas - Create schema
  router.post('/',
    [
      body('name').isString().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().isLength({ max: 1000 }),
      body('version').isString().isLength({ min: 1, max: 50 }),
      body('schema').isObject(),
      body('userId').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { name, description, version, schema, userId } = req.body;
        
        logger.info('Creating schema', {
          name,
          version,
          userId,
          requestId: req.headers['x-request-id']
        });

        const configSchema = await manager.createSchema({
          name,
          description,
          version,
          schema,
          userId
        });

        res.status(201).json({
          success: true,
          data: configSchema,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to create schema:', error);
        throw error;
      }
    }
  );

  // GET /schemas/:id - Get schema by ID
  router.get('/:id',
    [
      param('id').isUUID()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        
        logger.info('Getting schema', {
          schemaId: id,
          requestId: req.headers['x-request-id']
        });

        const schema = await manager.getSchema(id);

        res.json({
          success: true,
          data: schema,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: process.env.SERVICE_VERSION || '1.0.0'
          }
        });
      } catch (error) {
        logger.error('Failed to get schema:', error);
        throw error;
      }
    }
  );

  // POST /schemas/:id/validate - Validate data against schema
  router.post('/:id/validate',
    [
      param('id').isUUID(),
      body('data').exists()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { data } = req.body;
        
        logger.info('Validating data against schema', {
          schemaId: id,
          requestId: req.headers['x-request-id']
        });

        const validationResult = await manager.validateConfiguration(data, id);

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
        logger.error('Failed to validate data against schema:', error);
        throw error;
      }
    }
  );

  return router;
};