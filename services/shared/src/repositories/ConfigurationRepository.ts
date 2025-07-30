import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { Configuration, ConfigurationSchema, ConfigurationBackup } from '../types';
import { ConfigurationModel, ConfigurationSchemaModel, ConfigurationBackupModel } from '../models/Configuration';
import { NotFoundError } from '../utils/errors';

export class ConfigurationRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(configuration: Omit<Configuration, 'id' | 'createdAt' | 'updatedAt'>): Promise<Configuration> {
    const query = `
      INSERT INTO configurations (name, description, type, data, schema_id, version, checksum, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [
      configuration.name,
      configuration.description,
      configuration.type,
      JSON.stringify(configuration.data),
      configuration.schemaId,
      configuration.version,
      configuration.checksum,
      JSON.stringify(configuration.metadata)
    ];

    const result = await this.query(query, values);
    return ConfigurationModel.fromRow(result.rows[0]);
  }

  async findById(id: string): Promise<Configuration> {
    const query = 'SELECT * FROM configurations WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Configuration', id);
    }
    
    return ConfigurationModel.fromRow(result.rows[0]);
  }

  async findAll(filters?: {
    type?: string;
    environment?: string;
    userId?: string;
    teamId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Configuration[]> {
    let query = 'SELECT * FROM configurations';
    const conditions: Record<string, any> = {};
    
    if (filters?.type) {
      conditions.type = filters.type;
    }
    
    if (filters?.environment) {
      query += ` WHERE metadata->>'environment' = $1`;
    }
    
    if (filters?.userId) {
      query += ` ${filters.environment ? 'AND' : 'WHERE'} metadata->>'userId' = $${filters.environment ? '2' : '1'}`;
    }
    
    if (filters?.teamId) {
      const paramIndex = (filters.environment ? 1 : 0) + (filters.userId ? 1 : 0) + 1;
      query += ` ${filters.environment || filters.userId ? 'AND' : 'WHERE'} metadata->>'teamId' = $${paramIndex}`;
    }

    const { clause, params } = this.buildWhereClause(conditions);
    if (clause && !filters?.environment && !filters?.userId && !filters?.teamId) {
      query += ` ${clause}`;
    }

    query += ' ORDER BY created_at DESC';
    
    if (filters?.limit) {
      query += ` ${this.buildLimitClause(filters.limit, filters.offset)}`;
    }

    const allParams = [];
    if (filters?.environment) allParams.push(filters.environment);
    if (filters?.userId) allParams.push(filters.userId);
    if (filters?.teamId) allParams.push(filters.teamId);
    if (clause && !filters?.environment && !filters?.userId && !filters?.teamId) {
      allParams.push(...params);
    }

    const result = await this.query(query, allParams);
    return result.rows.map(ConfigurationModel.fromRow);
  }

  async update(id: string, updates: Partial<Configuration>): Promise<Configuration> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    
    if (updates.data !== undefined) {
      fields.push(`data = $${paramIndex++}`);
      values.push(JSON.stringify(updates.data));
    }
    
    if (updates.schemaId !== undefined) {
      fields.push(`schema_id = $${paramIndex++}`);
      values.push(updates.schemaId);
    }
    
    if (updates.version !== undefined) {
      fields.push(`version = $${paramIndex++}`);
      values.push(updates.version);
    }
    
    if (updates.checksum !== undefined) {
      fields.push(`checksum = $${paramIndex++}`);
      values.push(updates.checksum);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE configurations 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    values.push(id);
    const result = await this.query(query, values);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Configuration', id);
    }
    
    return ConfigurationModel.fromRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM configurations WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new NotFoundError('Configuration', id);
    }
  }

  async findByName(name: string, environment?: string): Promise<Configuration | null> {
    let query = 'SELECT * FROM configurations WHERE name = $1';
    const params = [name];
    
    if (environment) {
      query += ` AND metadata->>'environment' = $2`;
      params.push(environment);
    }
    
    const result = await this.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return ConfigurationModel.fromRow(result.rows[0]);
  }
}

export class ConfigurationSchemaRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(schema: Omit<ConfigurationSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConfigurationSchema> {
    const query = `
      INSERT INTO configuration_schemas (name, description, version, schema, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      schema.name,
      schema.description,
      schema.version,
      JSON.stringify(schema.schema),
      JSON.stringify(schema.metadata)
    ];

    const result = await this.query(query, values);
    return ConfigurationSchemaModel.fromRow(result.rows[0]);
  }

  async findById(id: string): Promise<ConfigurationSchema> {
    const query = 'SELECT * FROM configuration_schemas WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('ConfigurationSchema', id);
    }
    
    return ConfigurationSchemaModel.fromRow(result.rows[0]);
  }

  async findAll(limit?: number, offset?: number): Promise<ConfigurationSchema[]> {
    let query = 'SELECT * FROM configuration_schemas ORDER BY created_at DESC';
    
    if (limit) {
      query += ` ${this.buildLimitClause(limit, offset)}`;
    }

    const result = await this.query(query);
    return result.rows.map(ConfigurationSchemaModel.fromRow);
  }

  async findByNameAndVersion(name: string, version: string): Promise<ConfigurationSchema | null> {
    const query = 'SELECT * FROM configuration_schemas WHERE name = $1 AND version = $2';
    const result = await this.query(query, [name, version]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return ConfigurationSchemaModel.fromRow(result.rows[0]);
  }
}

export class ConfigurationBackupRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(backup: Omit<ConfigurationBackup, 'id' | 'createdAt'>): Promise<ConfigurationBackup> {
    const query = `
      INSERT INTO configuration_backups (configuration_id, version, data, reason)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [
      backup.configurationId,
      backup.version,
      JSON.stringify(backup.data),
      backup.reason
    ];

    const result = await this.query(query, values);
    return ConfigurationBackupModel.fromRow(result.rows[0]);
  }

  async findById(id: string): Promise<ConfigurationBackup> {
    const query = 'SELECT * FROM configuration_backups WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('ConfigurationBackup', id);
    }
    
    return ConfigurationBackupModel.fromRow(result.rows[0]);
  }

  async findByConfigurationId(configurationId: string, limit?: number): Promise<ConfigurationBackup[]> {
    let query = 'SELECT * FROM configuration_backups WHERE configuration_id = $1 ORDER BY created_at DESC';
    
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await this.query(query, [configurationId]);
    return result.rows.map(ConfigurationBackupModel.fromRow);
  }

  async deleteOldBackups(configurationId: string, keepCount: number): Promise<void> {
    const query = `
      DELETE FROM configuration_backups 
      WHERE configuration_id = $1 
      AND id NOT IN (
        SELECT id FROM configuration_backups 
        WHERE configuration_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      )
    `;
    
    await this.query(query, [configurationId, keepCount]);
  }
}