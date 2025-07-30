import { Configuration, ConfigurationSchema, ConfigurationBackup } from '../types';

export class ConfigurationModel {
  static tableName = 'configurations';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      type VARCHAR(100) NOT NULL,
      data JSONB NOT NULL,
      schema_id UUID REFERENCES configuration_schemas(id),
      version INTEGER NOT NULL DEFAULT 1,
      checksum VARCHAR(64) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      
      CONSTRAINT configurations_name_environment_unique UNIQUE (name, (metadata->>'environment'))
    );

    CREATE INDEX IF NOT EXISTS idx_configurations_type ON configurations(type);
    CREATE INDEX IF NOT EXISTS idx_configurations_user_id ON configurations((metadata->>'userId'));
    CREATE INDEX IF NOT EXISTS idx_configurations_team_id ON configurations((metadata->>'teamId'));
    CREATE INDEX IF NOT EXISTS idx_configurations_environment ON configurations((metadata->>'environment'));
    CREATE INDEX IF NOT EXISTS idx_configurations_schema_id ON configurations(schema_id);
    CREATE INDEX IF NOT EXISTS idx_configurations_created_at ON configurations(created_at);

    -- Trigger to update updated_at timestamp
    DROP TRIGGER IF EXISTS update_configurations_updated_at ON configurations;
    CREATE TRIGGER update_configurations_updated_at
        BEFORE UPDATE ON configurations
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
  `;

  static fromRow(row: any): Configuration {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      data: row.data,
      schemaId: row.schema_id,
      version: row.version,
      checksum: row.checksum,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  static toRow(configuration: Partial<Configuration>): any {
    return {
      id: configuration.id,
      name: configuration.name,
      description: configuration.description,
      type: configuration.type,
      data: JSON.stringify(configuration.data),
      schema_id: configuration.schemaId,
      version: configuration.version,
      checksum: configuration.checksum,
      metadata: JSON.stringify(configuration.metadata)
    };
  }
}

export class ConfigurationSchemaModel {
  static tableName = 'configuration_schemas';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS configuration_schemas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      version VARCHAR(50) NOT NULL,
      schema JSONB NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      
      CONSTRAINT configuration_schemas_name_version_unique UNIQUE (name, version)
    );

    CREATE INDEX IF NOT EXISTS idx_configuration_schemas_name ON configuration_schemas(name);
    CREATE INDEX IF NOT EXISTS idx_configuration_schemas_user_id ON configuration_schemas((metadata->>'userId'));
    CREATE INDEX IF NOT EXISTS idx_configuration_schemas_created_at ON configuration_schemas(created_at);

    -- Trigger to update updated_at timestamp
    DROP TRIGGER IF EXISTS update_configuration_schemas_updated_at ON configuration_schemas;
    CREATE TRIGGER update_configuration_schemas_updated_at
        BEFORE UPDATE ON configuration_schemas
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
  `;

  static fromRow(row: any): ConfigurationSchema {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      schema: row.schema,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  static toRow(schema: Partial<ConfigurationSchema>): any {
    return {
      id: schema.id,
      name: schema.name,
      description: schema.description,
      version: schema.version,
      schema: JSON.stringify(schema.schema),
      metadata: JSON.stringify(schema.metadata)
    };
  }
}

export class ConfigurationBackupModel {
  static tableName = 'configuration_backups';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS configuration_backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      configuration_id UUID NOT NULL REFERENCES configurations(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      data JSONB NOT NULL,
      reason VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_configuration_backups_config_id ON configuration_backups(configuration_id);
    CREATE INDEX IF NOT EXISTS idx_configuration_backups_created_at ON configuration_backups(created_at);
  `;

  static fromRow(row: any): ConfigurationBackup {
    return {
      id: row.id,
      configurationId: row.configuration_id,
      version: row.version,
      data: row.data,
      reason: row.reason,
      createdAt: new Date(row.created_at)
    };
  }

  static toRow(backup: Partial<ConfigurationBackup>): any {
    return {
      id: backup.id,
      configuration_id: backup.configurationId,
      version: backup.version,
      data: JSON.stringify(backup.data),
      reason: backup.reason
    };
  }
}