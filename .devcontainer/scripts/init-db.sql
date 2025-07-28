-- PostgreSQL initialization script for Claude Code + SuperClaude + MCP Development Environment
-- This script runs first during database initialization

-- Create extensions that might be useful for development
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create development user if not exists (in addition to the main user)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'claude_dev') THEN
        CREATE ROLE claude_dev WITH LOGIN PASSWORD 'dev_password' CREATEDB;
    END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE claude_development TO claude_dev;
GRANT claude_dev TO claude_user;

-- Set up basic database configuration for development
ALTER DATABASE claude_development SET timezone TO 'UTC';
ALTER DATABASE claude_development SET default_text_search_config TO 'pg_catalog.english';

-- Log successful initialization
INSERT INTO pg_stat_activity_history (created_at, message) 
VALUES (NOW(), 'Claude Development Database initialized successfully')
ON CONFLICT DO NOTHING;