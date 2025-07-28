-- PostgreSQL schema initialization for Claude Code + SuperClaude + MCP Development Environment
-- This script creates the basic schema structure for development

-- Create schemas for different components
CREATE SCHEMA IF NOT EXISTS claude_core;
CREATE SCHEMA IF NOT EXISTS superclaude;
CREATE SCHEMA IF NOT EXISTS mcp;
CREATE SCHEMA IF NOT EXISTS monitoring;
CREATE SCHEMA IF NOT EXISTS development;

-- Set search path
SET search_path TO claude_core, superclaude, mcp, monitoring, development, public;

-- Create enum types
CREATE TYPE environment_status AS ENUM ('active', 'inactive', 'maintenance', 'error');
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warning', 'error', 'critical');
CREATE TYPE service_type AS ENUM ('core', 'mcp', 'monitoring', 'development');

-- Core Claude tables
CREATE TABLE IF NOT EXISTS claude_core.environments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    status environment_status DEFAULT 'inactive',
    configuration JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS claude_core.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    environment_id UUID REFERENCES claude_core.environments(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS claude_core.configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    environment_id UUID REFERENCES claude_core.environments(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value JSONB,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(environment_id, key)
);

-- SuperClaude framework tables
CREATE TABLE IF NOT EXISTS superclaude.personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    configuration JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS superclaude.commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    command_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    wave_enabled BOOLEAN DEFAULT FALSE,
    performance_profile VARCHAR(50),
    configuration JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS superclaude.command_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    command_id UUID REFERENCES superclaude.commands(id) ON DELETE CASCADE,
    session_id UUID REFERENCES claude_core.sessions(id) ON DELETE CASCADE,
    persona_used VARCHAR(100),
    flags_used JSONB DEFAULT '{}',
    execution_time_ms INTEGER,
    status VARCHAR(50),
    result JSONB,
    error_message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MCP (Model Context Protocol) tables
CREATE TABLE IF NOT EXISTS mcp.servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    endpoint_url VARCHAR(500),
    configuration JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT TRUE,
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp.server_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES mcp.servers(id) ON DELETE CASCADE,
    request_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    average_response_time_ms DECIMAL(10,2),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp.requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES mcp.servers(id) ON DELETE CASCADE,
    session_id UUID REFERENCES claude_core.sessions(id) ON DELETE CASCADE,
    request_type VARCHAR(100),
    request_data JSONB,
    response_data JSONB,
    response_time_ms INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Monitoring tables
CREATE TABLE IF NOT EXISTS monitoring.service_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(100) NOT NULL,
    service_type service_type,
    status VARCHAR(50),
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(100),
    level log_level,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    session_id UUID REFERENCES claude_core.sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitoring.metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6),
    labels JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Development tables
CREATE TABLE IF NOT EXISTS development.project_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    framework VARCHAR(50),
    language VARCHAR(50),
    template_data JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS development.workspace_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES claude_core.sessions(id) ON DELETE CASCADE,
    workspace_path VARCHAR(500),
    current_files JSONB DEFAULT '[]',
    git_status JSONB DEFAULT '{}',
    environment_variables JSONB DEFAULT '{}',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_environments_status ON claude_core.environments(status);
CREATE INDEX IF NOT EXISTS idx_environments_created_at ON claude_core.environments(created_at);

CREATE INDEX IF NOT EXISTS idx_sessions_environment_id ON claude_core.sessions(environment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON claude_core.sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON claude_core.sessions(started_at);

CREATE INDEX IF NOT EXISTS idx_configurations_environment_id ON claude_core.configurations(environment_id);
CREATE INDEX IF NOT EXISTS idx_configurations_key ON claude_core.configurations(key);

CREATE INDEX IF NOT EXISTS idx_command_executions_command_id ON superclaude.command_executions(command_id);
CREATE INDEX IF NOT EXISTS idx_command_executions_session_id ON superclaude.command_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_command_executions_executed_at ON superclaude.command_executions(executed_at);

CREATE INDEX IF NOT EXISTS idx_mcp_requests_server_id ON mcp.requests(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_requests_session_id ON mcp.requests(session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_requests_created_at ON mcp.requests(created_at);

CREATE INDEX IF NOT EXISTS idx_service_health_service_name ON monitoring.service_health(service_name);
CREATE INDEX IF NOT EXISTS idx_service_health_checked_at ON monitoring.service_health(checked_at);

CREATE INDEX IF NOT EXISTS idx_logs_service_name ON monitoring.logs(service_name);
CREATE INDEX IF NOT EXISTS idx_logs_level ON monitoring.logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON monitoring.logs(created_at);

CREATE INDEX IF NOT EXISTS idx_metrics_metric_name ON monitoring.metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON monitoring.metrics(recorded_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON claude_core.environments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_configurations_updated_at BEFORE UPDATE ON claude_core.configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_personas_updated_at BEFORE UPDATE ON superclaude.personas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_commands_updated_at BEFORE UPDATE ON superclaude.commands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON mcp.servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_templates_updated_at BEFORE UPDATE ON development.project_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to development roles
GRANT USAGE ON SCHEMA claude_core, superclaude, mcp, monitoring, development TO claude_dev;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA claude_core, superclaude, mcp, monitoring, development TO claude_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA claude_core, superclaude, mcp, monitoring, development TO claude_dev;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA claude_core, superclaude, mcp, monitoring, development GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO claude_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA claude_core, superclaude, mcp, monitoring, development GRANT USAGE, SELECT ON SEQUENCES TO claude_dev;