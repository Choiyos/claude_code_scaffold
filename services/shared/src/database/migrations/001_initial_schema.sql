-- Claude Environment System Initial Schema
-- Migration: 001_initial_schema
-- Created: 2025-01-28

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'developer',
    team_id UUID,
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT users_role_check CHECK (
        role IN ('admin', 'team_lead', 'developer', 'viewer')
    )
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT team_members_role_check CHECK (
        role IN ('owner', 'admin', 'member')
    ),
    CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

-- Create environments table
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
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    
    CONSTRAINT environments_status_check CHECK (
        status IN ('creating', 'running', 'stopped', 'error', 'updating', 'destroying')
    ),
    CONSTRAINT environments_type_check CHECK (
        type IN ('development', 'testing', 'staging', 'production')
    ),
    CONSTRAINT environments_name_user_unique UNIQUE (name, user_id)
);

-- Create mcp_servers table
CREATE TABLE IF NOT EXISTS mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    image VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    config JSONB NOT NULL DEFAULT '{}',
    endpoints TEXT[],
    health_check_url VARCHAR(255),
    resources JSONB,
    environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT mcp_servers_type_check CHECK (
        type IN ('context7', 'sequential', 'magic', 'playwright', 'custom')
    ),
    CONSTRAINT mcp_servers_status_check CHECK (
        status IN ('inactive', 'starting', 'running', 'error', 'stopping')
    )
);

-- Create configuration_schemas table
CREATE TABLE IF NOT EXISTS configuration_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    version VARCHAR(50) NOT NULL,
    schema JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT configuration_schemas_name_version_unique UNIQUE (name, version)
);

-- Create configurations table
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

-- Create configuration_backups table
CREATE TABLE IF NOT EXISTS configuration_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID NOT NULL REFERENCES configurations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data JSONB NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create configuration_values table
CREATE TABLE IF NOT EXISTS configuration_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,
    scope VARCHAR(50) NOT NULL,
    encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}',
    environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT configuration_values_scope_check CHECK (
        scope IN ('global', 'team', 'user', 'environment')
    ),
    CONSTRAINT configuration_values_scope_reference_check CHECK (
        (scope = 'global' AND environment_id IS NULL AND team_id IS NULL AND user_id IS NULL) OR
        (scope = 'team' AND team_id IS NOT NULL AND environment_id IS NULL AND user_id IS NULL) OR
        (scope = 'user' AND user_id IS NOT NULL AND environment_id IS NULL AND team_id IS NULL) OR
        (scope = 'environment' AND environment_id IS NOT NULL)
    )
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    resource_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB NOT NULL DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

CREATE INDEX IF NOT EXISTS idx_environments_user_id ON environments(user_id);
CREATE INDEX IF NOT EXISTS idx_environments_team_id ON environments(team_id);
CREATE INDEX IF NOT EXISTS idx_environments_status ON environments(status);
CREATE INDEX IF NOT EXISTS idx_environments_type ON environments(type);
CREATE INDEX IF NOT EXISTS idx_environments_created_at ON environments(created_at);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_environment_id ON mcp_servers(environment_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_type ON mcp_servers(type);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);

CREATE INDEX IF NOT EXISTS idx_configuration_schemas_name ON configuration_schemas(name);
CREATE INDEX IF NOT EXISTS idx_configuration_schemas_version ON configuration_schemas(version);

CREATE INDEX IF NOT EXISTS idx_configurations_type ON configurations(type);
CREATE INDEX IF NOT EXISTS idx_configurations_user_id ON configurations((metadata->>'userId'));
CREATE INDEX IF NOT EXISTS idx_configurations_team_id ON configurations((metadata->>'teamId'));
CREATE INDEX IF NOT EXISTS idx_configurations_environment ON configurations((metadata->>'environment'));
CREATE INDEX IF NOT EXISTS idx_configurations_schema_id ON configurations(schema_id);
CREATE INDEX IF NOT EXISTS idx_configurations_created_at ON configurations(created_at);

CREATE INDEX IF NOT EXISTS idx_configuration_backups_config_id ON configuration_backups(configuration_id);
CREATE INDEX IF NOT EXISTS idx_configuration_backups_created_at ON configuration_backups(created_at);

CREATE INDEX IF NOT EXISTS idx_configuration_values_key ON configuration_values(key);
CREATE INDEX IF NOT EXISTS idx_configuration_values_scope ON configuration_values(scope);
CREATE INDEX IF NOT EXISTS idx_configuration_values_environment_id ON configuration_values(environment_id);
CREATE INDEX IF NOT EXISTS idx_configuration_values_team_id ON configuration_values(team_id);
CREATE INDEX IF NOT EXISTS idx_configuration_values_user_id ON configuration_values(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Create functions and triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables that need them
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_environments_updated_at ON environments;
CREATE TRIGGER update_environments_updated_at
    BEFORE UPDATE ON environments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mcp_servers_updated_at ON mcp_servers;
CREATE TRIGGER update_mcp_servers_updated_at
    BEFORE UPDATE ON mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_configuration_schemas_updated_at ON configuration_schemas;
CREATE TRIGGER update_configuration_schemas_updated_at
    BEFORE UPDATE ON configuration_schemas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_configurations_updated_at ON configurations;
CREATE TRIGGER update_configurations_updated_at
    BEFORE UPDATE ON configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_configuration_values_updated_at ON configuration_values;
CREATE TRIGGER update_configuration_values_updated_at
    BEFORE UPDATE ON configuration_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraint for users.team_id (after teams table is created)
ALTER TABLE users ADD CONSTRAINT users_team_id_fkey 
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Insert default data
INSERT INTO users (id, email, name, password_hash, role) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'admin@claude-env.local', 'System Administrator', '$2b$10$rDgGjEZjEQjfXVJ3mKJrwOUFjYlJjCjcRxHvJsNsNsNsNsNsNsNsN', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO teams (id, name, description) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Default Team', 'Default team for new users')
ON CONFLICT (name) DO NOTHING;

INSERT INTO team_members (team_id, user_id, role) VALUES 
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner')
ON CONFLICT (team_id, user_id) DO NOTHING;

-- Insert default configuration schemas
INSERT INTO configuration_schemas (name, version, schema, metadata) VALUES 
    ('environment-config', '1.0.0', '{
        "type": "object",
        "properties": {
            "image": {"type": "string"},
            "nodeVersion": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
            "pythonVersion": {"type": "string", "pattern": "^\\d+\\.\\d+(\\.\\d+)?$"},
            "ports": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "host": {"type": "integer", "minimum": 1, "maximum": 65535},
                        "container": {"type": "integer", "minimum": 1, "maximum": 65535},
                        "protocol": {"type": "string", "enum": ["tcp", "udp"]}
                    },
                    "required": ["host", "container"]
                }
            },
            "volumes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "host": {"type": "string"},
                        "container": {"type": "string"},
                        "mode": {"type": "string", "enum": ["ro", "rw"]}
                    },
                    "required": ["host", "container"]
                }
            },
            "environmentVariables": {
                "type": "object",
                "patternProperties": {
                    "^[A-Z][A-Z0-9_]*$": {"type": "string"}
                }
            },
            "resources": {
                "type": "object",
                "properties": {
                    "memory": {"type": "string", "pattern": "^\\d+[MG]i?$"},
                    "cpu": {"type": "string", "pattern": "^\\d+(\\.\\d+)?$"},
                    "storage": {"type": "string", "pattern": "^\\d+[MG]i?$"}
                }
            }
        }
    }', '{"description": "Schema for environment configuration"}')
ON CONFLICT (name, version) DO NOTHING;

COMMIT;