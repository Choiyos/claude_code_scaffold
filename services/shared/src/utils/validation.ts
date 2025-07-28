import Joi from 'joi';
import { ValidationError } from './errors';

// Common validation schemas
export const commonSchemas = {
  id: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')),
  timestamp: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
};

// Environment validation schemas
export const environmentSchemas = {
  create: Joi.object({
    name: commonSchemas.name,
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('development', 'testing', 'staging', 'production').required(),
    config: Joi.object({
      image: Joi.string().optional(),
      nodeVersion: Joi.string().pattern(/^\d+\.\d+\.\d+$/).optional(),
      pythonVersion: Joi.string().pattern(/^\d+\.\d+(\.\d+)?$/).optional(),
      ports: Joi.array().items(
        Joi.object({
          host: Joi.number().integer().min(1).max(65535).required(),
          container: Joi.number().integer().min(1).max(65535).required(),
          protocol: Joi.string().valid('tcp', 'udp').default('tcp')
        })
      ).optional(),
      volumes: Joi.array().items(
        Joi.object({
          host: Joi.string().required(),
          container: Joi.string().required(),
          mode: Joi.string().valid('ro', 'rw').default('rw')
        })
      ).optional(),
      environmentVariables: Joi.object().pattern(
        Joi.string(),
        Joi.string()
      ).optional(),
      resources: Joi.object({
        memory: Joi.string().pattern(/^\d+[MG]i?$/).optional(),
        cpu: Joi.string().pattern(/^\d+(\.\d+)?$/).optional(),
        storage: Joi.string().pattern(/^\d+[MG]i?$/).optional()
      }).optional()
    }).optional(),
    metadata: Joi.object().optional()
  }),

  update: Joi.object({
    name: commonSchemas.name.optional(),
    description: Joi.string().max(1000).optional(),
    config: Joi.object().optional(),
    metadata: Joi.object().optional()
  }).min(1)
};

// MCP Server validation schemas
export const mcpServerSchemas = {
  config: Joi.object({
    id: commonSchemas.id,
    name: commonSchemas.name,
    type: Joi.string().valid('context7', 'sequential', 'magic', 'playwright', 'custom').required(),
    image: Joi.string().required(),
    config: Joi.object().required(),
    endpoints: Joi.array().items(Joi.string().uri()).optional(),
    healthCheckUrl: Joi.string().uri().optional(),
    resources: Joi.object({
      memory: Joi.string().pattern(/^\d+[MG]i?$/).optional(),
      cpu: Joi.string().pattern(/^\d+(\.\d+)?$/).optional()
    }).optional()
  })
};

// Configuration validation schemas
export const configurationSchemas = {
  value: Joi.object({
    key: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9_.-]*$/).required(),
    value: Joi.any().required(),
    scope: Joi.string().valid('global', 'team', 'user', 'environment').required(),
    encrypted: Joi.boolean().default(false),
    metadata: Joi.object().optional()
  }),

  schema: Joi.object({
    name: commonSchemas.name,
    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
    schema: Joi.object().required(),
    metadata: Joi.object().optional()
  })
};

// User validation schemas
export const userSchemas = {
  create: Joi.object({
    email: commonSchemas.email,
    name: commonSchemas.name,
    password: commonSchemas.password,
    role: Joi.string().valid('admin', 'team_lead', 'developer', 'viewer').default('developer'),
    teamId: commonSchemas.id.optional()
  }),

  update: Joi.object({
    name: commonSchemas.name.optional(),
    role: Joi.string().valid('admin', 'team_lead', 'developer', 'viewer').optional(),
    preferences: Joi.object({
      theme: Joi.string().valid('light', 'dark', 'auto').optional(),
      language: Joi.string().optional(),
      timezone: Joi.string().optional(),
      notifications: Joi.object({
        email: Joi.boolean().optional(),
        webPush: Joi.boolean().optional(),
        desktop: Joi.boolean().optional(),
        environmentUpdates: Joi.boolean().optional(),
        systemAlerts: Joi.boolean().optional()
      }).optional()
    }).optional()
  }).min(1)
};

// Team validation schemas
export const teamSchemas = {
  create: Joi.object({
    name: commonSchemas.name,
    description: Joi.string().max(1000).optional(),
    config: Joi.object({
      defaultEnvironmentType: Joi.string().valid('development', 'testing', 'staging', 'production').default('development'),
      resourceLimits: Joi.object({
        memory: Joi.string().pattern(/^\d+[MG]i?$/).optional(),
        cpu: Joi.string().pattern(/^\d+(\.\d+)?$/).optional(),
        storage: Joi.string().pattern(/^\d+[MG]i?$/).optional()
      }).optional(),
      allowedMCPServers: Joi.array().items(
        Joi.string().valid('context7', 'sequential', 'magic', 'playwright', 'custom')
      ).optional(),
      customSettings: Joi.object().optional()
    }).optional()
  })
};

// Validation helper function
export const validate = <T>(schema: Joi.ObjectSchema, data: any): T => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const details = error.details.reduce((acc, detail) => {
      acc[detail.path.join('.')] = detail.message;
      return acc;
    }, {} as Record<string, string>);

    throw new ValidationError('Validation failed', details);
  }

  return value as T;
};

// Query parameter validation
export const validateQuery = (req: any, schema: Joi.ObjectSchema) => {
  return validate(schema, req.query);
};

// Request body validation
export const validateBody = (req: any, schema: Joi.ObjectSchema) => {
  return validate(schema, req.body);
};

// Request params validation
export const validateParams = (req: any, schema: Joi.ObjectSchema) => {
  return validate(schema, req.params);
};