import { Environment, EnvironmentStatus, EnvironmentType, EnvironmentConfig } from '../types';

export class EnvironmentModel {
  static tableName = 'environments';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS environments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'stopped',
      type VARCHAR(50) NOT NULL DEFAULT 'development',
      config JSONB NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      user_id UUID NOT NULL,
      team_id UUID,
      
      CONSTRAINT environments_status_check CHECK (
        status IN ('creating', 'running', 'stopped', 'error', 'updating', 'destroying')
      ),
      CONSTRAINT environments_type_check CHECK (
        type IN ('development', 'testing', 'staging', 'production')
      ),
      CONSTRAINT environments_name_user_unique UNIQUE (name, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_environments_user_id ON environments(user_id);
    CREATE INDEX IF NOT EXISTS idx_environments_team_id ON environments(team_id);
    CREATE INDEX IF NOT EXISTS idx_environments_status ON environments(status);
    CREATE INDEX IF NOT EXISTS idx_environments_type ON environments(type);
    CREATE INDEX IF NOT EXISTS idx_environments_created_at ON environments(created_at);

    -- Trigger to update updated_at timestamp
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS update_environments_updated_at ON environments;
    CREATE TRIGGER update_environments_updated_at
        BEFORE UPDATE ON environments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
  `;

  static fromRow(row: any): Environment {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status as EnvironmentStatus,
      type: row.type as EnvironmentType,
      config: row.config as EnvironmentConfig,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      userId: row.user_id,
      teamId: row.team_id
    };
  }

  static toRow(environment: Partial<Environment>): any {
    return {
      id: environment.id,
      name: environment.name,
      description: environment.description,
      status: environment.status,
      type: environment.type,
      config: JSON.stringify(environment.config),
      metadata: JSON.stringify(environment.metadata),
      user_id: environment.userId,
      team_id: environment.teamId
    };
  }
}