-- Claude Code PostgreSQL Initialization Script

-- Create additional databases
CREATE DATABASE claude_code_test;
CREATE DATABASE claude_code_analytics;

-- Create users with appropriate permissions
CREATE USER claude_app WITH PASSWORD 'app_password';
CREATE USER claude_readonly WITH PASSWORD 'readonly_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE claude_code TO claude_app;
GRANT ALL PRIVILEGES ON DATABASE claude_code_test TO claude_app;
GRANT ALL PRIVILEGES ON DATABASE claude_code_analytics TO claude_app;

GRANT CONNECT ON DATABASE claude_code TO claude_readonly;
GRANT CONNECT ON DATABASE claude_code_test TO claude_readonly;
GRANT CONNECT ON DATABASE claude_code_analytics TO claude_readonly;

-- Switch to claude_code database
\c claude_code;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "hstore";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS claude_core;
CREATE SCHEMA IF NOT EXISTS claude_analytics;
CREATE SCHEMA IF NOT EXISTS claude_monitoring;

-- Grant schema permissions
GRANT USAGE ON SCHEMA claude_core TO claude_app, claude_readonly;
GRANT USAGE ON SCHEMA claude_analytics TO claude_app, claude_readonly;
GRANT USAGE ON SCHEMA claude_monitoring TO claude_app, claude_readonly;

-- Grant table permissions to readonly user
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA claude_core TO claude_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA claude_analytics TO claude_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA claude_monitoring TO claude_readonly;

-- Set default permissions for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA claude_core GRANT SELECT ON TABLES TO claude_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA claude_analytics GRANT SELECT ON TABLES TO claude_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA claude_monitoring GRANT SELECT ON TABLES TO claude_readonly;

-- Create example tables
CREATE TABLE IF NOT EXISTS claude_core.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS claude_core.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES claude_core.projects(id),
    user_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS claude_analytics.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES claude_core.sessions(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_name ON claude_core.projects USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON claude_core.sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON claude_core.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON claude_analytics.events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON claude_analytics.events(event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_data ON claude_analytics.events USING gin(event_data);

-- Insert sample data
INSERT INTO claude_core.projects (name, description, metadata) VALUES
('claude-code-core', 'Core Claude Code functionality', '{"version": "1.0.0", "language": "typescript"}'),
('superlaude-framework', 'SuperClaude framework implementation', '{"version": "1.0.0", "language": "typescript"}'),
('mcp-integration', 'MCP server integration', '{"version": "1.0.0", "language": "typescript"}')
ON CONFLICT DO NOTHING;

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON claude_core.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();