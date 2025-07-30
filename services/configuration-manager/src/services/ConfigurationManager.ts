import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { v4 as uuidv4 } from 'uuid';
import * as chokidar from 'chokidar';
import { createLogger } from '@shared/utils/logger';
import { 
  Configuration,
  ConfigurationSchema,
  ConfigurationBackup,
  ConfigurationDrift,
  ConfigurationValidationResult
} from '@shared/types';
import { 
  ConfigurationError,
  NotFoundError,
  ConflictError,
  ValidationError
} from '@shared/utils/errors';

const logger = createLogger('configuration-manager');

export class ConfigurationManager extends EventEmitter {
  private configurations: Map<string, Configuration> = new Map();
  private schemas: Map<string, ConfigurationSchema> = new Map();
  private backups: Map<string, ConfigurationBackup[]> = new Map();
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private configDir: string;
  private schemaDir: string;
  private backupDir: string;
  private ajv: Ajv;
  private maxBackups: number;
  private driftCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.configDir = process.env.CONFIG_DIR || '/workspace/config';
    this.schemaDir = process.env.SCHEMA_DIR || '/workspace/schemas';
    this.backupDir = process.env.BACKUP_DIR || '/workspace/backups';
    this.maxBackups = parseInt(process.env.MAX_BACKUPS || '10');
    
    // Initialize AJV for JSON schema validation
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await fs.ensureDir(this.configDir);
      await fs.ensureDir(this.schemaDir);
      await fs.ensureDir(this.backupDir);

      // Load existing schemas
      await this.loadSchemas();

      // Load existing configurations
      await this.loadConfigurations();

      // Setup file watchers for drift detection
      await this.setupFileWatchers();

      // Start drift checking
      this.startDriftChecking();

      logger.info('Configuration Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Configuration Manager:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Stop drift checking
    if (this.driftCheckInterval) {
      clearInterval(this.driftCheckInterval);
    }

    // Close file watchers
    for (const [path, watcher] of this.watchers) {
      await watcher.close();
    }
    this.watchers.clear();

    logger.info('Configuration Manager shutdown completed');
  }

  async createConfiguration(config: {
    name: string;
    description?: string;
    type: string;
    data: any;
    schemaId?: string;
    userId: string;
    teamId?: string;
    environment?: string;
  }): Promise<Configuration> {
    const configId = uuidv4();
    logger.info(`Creating configuration ${configId}`, { config: config.name });

    try {
      // Check for name conflicts
      const existingConfig = Array.from(this.configurations.values())
        .find(c => c.name === config.name && c.environment === config.environment);
      
      if (existingConfig) {
        throw new ConflictError(`Configuration with name '${config.name}' already exists in environment '${config.environment}'`);
      }

      // Validate against schema if provided
      if (config.schemaId) {
        const validationResult = await this.validateConfiguration(config.data, config.schemaId);
        if (!validationResult.isValid) {
          throw new ValidationError('Configuration validation failed', validationResult.errors);
        }
      }

      // Create configuration object
      const configuration: Configuration = {
        id: configId,
        name: config.name,
        description: config.description,
        type: config.type,
        data: config.data,
        schemaId: config.schemaId,
        version: 1,
        checksum: this.calculateChecksum(config.data),
        metadata: {
          userId: config.userId,
          teamId: config.teamId,
          environment: config.environment || 'development'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store configuration
      this.configurations.set(configId, configuration);

      // Save to file system
      await this.saveConfigurationToFile(configuration);

      // Create initial backup
      await this.createBackup(configId, 'created');

      // Emit creation event
      this.emit('configuration-created', configuration);

      logger.info(`Configuration ${configId} created successfully`);
      return configuration;

    } catch (error) {
      logger.error(`Failed to create configuration ${configId}:`, error);
      throw error;
    }
  }

  async updateConfiguration(configId: string, updates: {
    name?: string;
    description?: string;
    data?: any;
    schemaId?: string;
  }): Promise<Configuration> {
    logger.info(`Updating configuration ${configId}`, { updates: Object.keys(updates) });

    const configuration = this.configurations.get(configId);
    if (!configuration) {
      throw new NotFoundError('Configuration', configId);
    }

    try {
      // Create backup before update
      await this.createBackup(configId, 'pre-update');

      // Validate data if provided
      if (updates.data && (updates.schemaId || configuration.schemaId)) {
        const schemaId = updates.schemaId || configuration.schemaId!;
        const validationResult = await this.validateConfiguration(updates.data, schemaId);
        if (!validationResult.isValid) {
          throw new ValidationError('Configuration validation failed', validationResult.errors);
        }
      }

      // Update configuration
      const updatedConfiguration: Configuration = {
        ...configuration,
        ...updates,
        id: configId, // Prevent ID changes
        version: configuration.version + 1,
        checksum: this.calculateChecksum(updates.data || configuration.data),
        updatedAt: new Date()
      };

      // Store updated configuration
      this.configurations.set(configId, updatedConfiguration);

      // Save to file system
      await this.saveConfigurationToFile(updatedConfiguration);

      // Emit update event
      this.emit('configuration-updated', updatedConfiguration);

      logger.info(`Configuration ${configId} updated successfully`);
      return updatedConfiguration;

    } catch (error) {
      logger.error(`Failed to update configuration ${configId}:`, error);
      throw error;
    }
  }

  async deleteConfiguration(configId: string): Promise<void> {
    logger.info(`Deleting configuration ${configId}`);

    const configuration = this.configurations.get(configId);
    if (!configuration) {
      throw new NotFoundError('Configuration', configId);
    }

    try {
      // Create final backup
      await this.createBackup(configId, 'deleted');

      // Remove from file system
      const filePath = this.getConfigurationFilePath(configuration);
      await fs.remove(filePath);

      // Remove from memory
      this.configurations.delete(configId);

      // Emit deletion event
      this.emit('configuration-deleted', configId);

      logger.info(`Configuration ${configId} deleted successfully`);

    } catch (error) {
      logger.error(`Failed to delete configuration ${configId}:`, error);
      throw error;
    }
  }

  async getConfiguration(configId: string): Promise<Configuration> {
    const configuration = this.configurations.get(configId);
    if (!configuration) {
      throw new NotFoundError('Configuration', configId);
    }
    return configuration;
  }

  async listConfigurations(filters?: {
    type?: string;
    environment?: string;
    userId?: string;
    teamId?: string;
  }): Promise<Configuration[]> {
    let configurations = Array.from(this.configurations.values());

    if (filters) {
      if (filters.type) {
        configurations = configurations.filter(c => c.type === filters.type);
      }
      if (filters.environment) {
        configurations = configurations.filter(c => c.metadata.environment === filters.environment);
      }
      if (filters.userId) {
        configurations = configurations.filter(c => c.metadata.userId === filters.userId);
      }
      if (filters.teamId) {
        configurations = configurations.filter(c => c.metadata.teamId === filters.teamId);
      }
    }

    return configurations;
  }

  async validateConfiguration(data: any, schemaId: string): Promise<ConfigurationValidationResult> {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      throw new NotFoundError('Schema', schemaId);
    }

    try {
      const validate = this.ajv.compile(schema.schema);
      const isValid = validate(data);
      
      return {
        isValid,
        errors: isValid ? [] : validate.errors?.map(error => ({
          path: error.instancePath,
          message: error.message || 'Validation error',
          value: error.data
        })) || []
      };
    } catch (error) {
      logger.error(`Validation error for schema ${schemaId}:`, error);
      throw new ConfigurationError(`Validation failed: ${error}`, schemaId);
    }
  }

  async createSchema(schema: {
    name: string;
    description?: string;
    version: string;
    schema: any;
    userId: string;
  }): Promise<ConfigurationSchema> {
    const schemaId = uuidv4();
    logger.info(`Creating schema ${schemaId}`, { schema: schema.name });

    try {
      // Validate schema structure
      this.ajv.compile(schema.schema);

      const configSchema: ConfigurationSchema = {
        id: schemaId,
        name: schema.name,
        description: schema.description,
        version: schema.version,
        schema: schema.schema,
        metadata: {
          userId: schema.userId
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store schema
      this.schemas.set(schemaId, configSchema);

      // Save to file system
      await this.saveSchemaToFile(configSchema);

      logger.info(`Schema ${schemaId} created successfully`);
      return configSchema;

    } catch (error) {
      logger.error(`Failed to create schema ${schemaId}:`, error);
      throw new ConfigurationError(`Invalid schema: ${error}`, schemaId);
    }
  }

  async getSchema(schemaId: string): Promise<ConfigurationSchema> {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      throw new NotFoundError('Schema', schemaId);
    }
    return schema;
  }

  async listSchemas(): Promise<ConfigurationSchema[]> {
    return Array.from(this.schemas.values());
  }

  async getConfigurationBackups(configId: string): Promise<ConfigurationBackup[]> {
    return this.backups.get(configId) || [];
  }

  async restoreConfiguration(configId: string, backupId: string): Promise<Configuration> {
    const backups = this.backups.get(configId) || [];
    const backup = backups.find(b => b.id === backupId);
    
    if (!backup) {
      throw new NotFoundError('Backup', backupId);
    }

    logger.info(`Restoring configuration ${configId} from backup ${backupId}`);

    try {
      const updatedConfiguration = await this.updateConfiguration(configId, {
        data: backup.data
      });

      logger.info(`Configuration ${configId} restored from backup ${backupId}`);
      return updatedConfiguration;

    } catch (error) {
      logger.error(`Failed to restore configuration ${configId}:`, error);
      throw error;
    }
  }

  async detectDrift(): Promise<ConfigurationDrift[]> {
    const drifts: ConfigurationDrift[] = [];

    for (const [configId, configuration] of this.configurations) {
      try {
        const filePath = this.getConfigurationFilePath(configuration);
        
        if (await fs.pathExists(filePath)) {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const fileData = yaml.load(fileContent) as any;
          const fileChecksum = this.calculateChecksum(fileData.data);

          if (fileChecksum !== configuration.checksum) {
            const drift: ConfigurationDrift = {
              configurationId: configId,
              detectedAt: new Date(),
              severity: 'warning',
              description: 'Configuration file has been modified outside of the system',
              currentChecksum: configuration.checksum,
              fileChecksum: fileChecksum
            };

            drifts.push(drift);
          }
        } else {
          const drift: ConfigurationDrift = {
            configurationId: configId,
            detectedAt: new Date(),
            severity: 'error',
            description: 'Configuration file has been deleted',
            currentChecksum: configuration.checksum,
            fileChecksum: null
          };

          drifts.push(drift);
        }
      } catch (error) {
        logger.warn(`Failed to check drift for configuration ${configId}:`, error);
      }
    }

    if (drifts.length > 0) {
      this.emit('drift-detected', drifts);
    }

    return drifts;
  }

  private async loadConfigurations(): Promise<void> {
    try {
      const configFiles = await fs.readdir(this.configDir);
      
      for (const file of configFiles) {
        if (file.endsWith('.yml') || file.endsWith('.yaml')) {
          const filePath = path.join(this.configDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const configData = yaml.load(content) as Configuration;
          
          if (configData && configData.id) {
            this.configurations.set(configData.id, configData);
          }
        }
      }

      logger.info(`Loaded ${this.configurations.size} configurations`);
    } catch (error) {
      logger.warn('Failed to load configurations:', error);
    }
  }

  private async loadSchemas(): Promise<void> {
    try {
      const schemaFiles = await fs.readdir(this.schemaDir);
      
      for (const file of schemaFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.schemaDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const schemaData = JSON.parse(content) as ConfigurationSchema;
          
          if (schemaData && schemaData.id) {
            this.schemas.set(schemaData.id, schemaData);
          }
        }
      }

      logger.info(`Loaded ${this.schemas.size} schemas`);
    } catch (error) {
      logger.warn('Failed to load schemas:', error);
    }
  }

  private async saveConfigurationToFile(configuration: Configuration): Promise<void> {
    const filePath = this.getConfigurationFilePath(configuration);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, yaml.dump(configuration), 'utf8');
  }

  private async saveSchemaToFile(schema: ConfigurationSchema): Promise<void> {
    const filePath = path.join(this.schemaDir, `${schema.name}-${schema.version}.json`);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2), 'utf8');
  }

  private getConfigurationFilePath(configuration: Configuration): string {
    const env = configuration.metadata.environment || 'development';
    return path.join(this.configDir, env, `${configuration.name}.yml`);
  }

  private calculateChecksum(data: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private async createBackup(configId: string, reason: string): Promise<void> {
    const configuration = this.configurations.get(configId);
    if (!configuration) {
      return;
    }

    const backup: ConfigurationBackup = {
      id: uuidv4(),
      configurationId: configId,
      version: configuration.version,
      data: configuration.data,
      reason,
      createdAt: new Date()
    };

    // Add to backups list
    const configBackups = this.backups.get(configId) || [];
    configBackups.unshift(backup);

    // Limit number of backups
    if (configBackups.length > this.maxBackups) {
      configBackups.splice(this.maxBackups);
    }

    this.backups.set(configId, configBackups);

    // Save backup to file
    const backupPath = path.join(this.backupDir, configId, `${backup.id}.json`);
    await fs.ensureDir(path.dirname(backupPath));
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  }

  private async setupFileWatchers(): Promise<void> {
    // Watch configuration directory for changes
    const watcher = chokidar.watch(this.configDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });

    watcher.on('change', async (filePath) => {
      logger.info('Configuration file changed:', filePath);
      await this.detectDrift();
    });

    this.watchers.set(this.configDir, watcher);
  }

  private startDriftChecking(): void {
    // Check for drift every 5 minutes
    this.driftCheckInterval = setInterval(async () => {
      try {
        await this.detectDrift();
      } catch (error) {
        logger.warn('Drift check failed:', error);
      }
    }, 5 * 60 * 1000);
  }
}