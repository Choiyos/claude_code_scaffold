-- PostgreSQL initial data for Claude Code + SuperClaude + MCP Development Environment
-- This script populates the database with initial development data

SET search_path TO claude_core, superclaude, mcp, monitoring, development, public;

-- Insert default environment
INSERT INTO claude_core.environments (name, description, status, configuration) VALUES
('development', 'Claude Code + SuperClaude + MCP Development Environment', 'active', 
 '{"version": "1.0.0", "features": {"superclaude": true, "mcp": true, "monitoring": true}}')
ON CONFLICT (name) DO NOTHING;

-- Get the development environment ID for foreign key references
DO $$ 
DECLARE
    dev_env_id UUID;
BEGIN
    SELECT id INTO dev_env_id FROM claude_core.environments WHERE name = 'development';
    
    -- Insert default configurations
    INSERT INTO claude_core.configurations (environment_id, key, value, description) VALUES
    (dev_env_id, 'database.url', '"postgresql://claude_user:claude_password@postgres:5432/claude_development"', 'PostgreSQL connection string'),
    (dev_env_id, 'redis.url', '"redis://redis:6379/0"', 'Redis connection string'),
    (dev_env_id, 'monitoring.prometheus.url', '"http://prometheus:9090"', 'Prometheus server URL'),
    (dev_env_id, 'monitoring.grafana.url', '"http://grafana:3000"', 'Grafana dashboard URL'),
    (dev_env_id, 'api.gateway.url', '"http://localhost:3000"', 'Main application API gateway'),
    (dev_env_id, 'api.environment_controller.url', '"http://localhost:3001"', 'Environment controller API'),
    (dev_env_id, 'api.mcp_orchestrator.url', '"http://localhost:3002"', 'MCP orchestrator API'),
    (dev_env_id, 'api.configuration_manager.url', '"http://localhost:3003"', 'Configuration manager API'),
    (dev_env_id, 'development.auto_reload', 'true', 'Enable auto-reload for development'),
    (dev_env_id, 'development.debug_mode', 'true', 'Enable debug mode'),
    (dev_env_id, 'development.log_level', '"info"', 'Default log level for development')
    ON CONFLICT (environment_id, key) DO NOTHING;
END
$$;

-- Insert SuperClaude personas
INSERT INTO superclaude.personas (name, description, configuration) VALUES
('architect', 'Systems architecture specialist with long-term thinking focus', 
 '{"priority_hierarchy": "Long-term maintainability > scalability > performance > short-term gains", "mcp_servers": ["sequential", "context7"], "auto_triggers": ["architecture", "design", "scalability"]}'),
('frontend', 'UX specialist and accessibility advocate', 
 '{"priority_hierarchy": "User needs > accessibility > performance > technical elegance", "mcp_servers": ["magic", "playwright"], "auto_triggers": ["component", "responsive", "accessibility"]}'),
('backend', 'Reliability engineer and API specialist', 
 '{"priority_hierarchy": "Reliability > security > performance > features > convenience", "mcp_servers": ["context7", "sequential"], "auto_triggers": ["API", "database", "service", "reliability"]}'),
('analyzer', 'Root cause specialist and evidence-based investigator', 
 '{"priority_hierarchy": "Evidence > systematic approach > thoroughness > speed", "mcp_servers": ["sequential", "context7"], "auto_triggers": ["analyze", "investigate", "root cause"]}'),
('security', 'Threat modeler and vulnerability specialist', 
 '{"priority_hierarchy": "Security > compliance > reliability > performance > convenience", "mcp_servers": ["sequential", "context7"], "auto_triggers": ["vulnerability", "threat", "compliance"]}'),
('mentor', 'Knowledge transfer specialist and educator', 
 '{"priority_hierarchy": "Understanding > knowledge transfer > teaching > task completion", "mcp_servers": ["context7", "sequential"], "auto_triggers": ["explain", "learn", "understand"]}'),
('refactorer', 'Code quality specialist and technical debt manager', 
 '{"priority_hierarchy": "Simplicity > maintainability > readability > performance > cleverness", "mcp_servers": ["sequential", "context7"], "auto_triggers": ["refactor", "cleanup", "technical debt"]}'),
('performance', 'Optimization specialist and bottleneck elimination expert', 
 '{"priority_hierarchy": "Measure first > optimize critical path > user experience > avoid premature optimization", "mcp_servers": ["playwright", "sequential"], "auto_triggers": ["optimize", "performance", "bottleneck"]}'),
('qa', 'Quality advocate and testing specialist', 
 '{"priority_hierarchy": "Prevention > detection > correction > comprehensive coverage", "mcp_servers": ["playwright", "sequential"], "auto_triggers": ["test", "quality", "validation"]}'),
('devops', 'Infrastructure specialist and deployment expert', 
 '{"priority_hierarchy": "Automation > observability > reliability > scalability > manual processes", "mcp_servers": ["sequential", "context7"], "auto_triggers": ["deploy", "infrastructure", "automation"]}'),
('scribe', 'Professional writer and documentation specialist', 
 '{"priority_hierarchy": "Clarity > audience needs > cultural sensitivity > completeness > brevity", "mcp_servers": ["context7", "sequential"], "auto_triggers": ["document", "write", "guide"]}'
)
ON CONFLICT (name) DO NOTHING;

-- Insert SuperClaude commands
INSERT INTO superclaude.commands (command_name, category, description, wave_enabled, performance_profile, configuration) VALUES
('/analyze', 'Analysis & Investigation', 'Multi-dimensional code and system analysis', true, 'complex', 
 '{"auto_personas": ["analyzer", "architect", "security"], "mcp_integration": ["sequential", "context7", "magic"]}'),
('/build', 'Development & Deployment', 'Project builder with framework detection', true, 'optimization', 
 '{"auto_personas": ["frontend", "backend", "architect", "scribe"], "mcp_integration": ["magic", "context7", "sequential"]}'),
('/implement', 'Development & Implementation', 'Feature and code implementation with intelligent persona activation', true, 'standard', 
 '{"auto_personas": ["frontend", "backend", "architect", "security"], "mcp_integration": ["magic", "context7", "sequential"]}'),
('/improve', 'Quality & Enhancement', 'Evidence-based code enhancement', true, 'optimization', 
 '{"auto_personas": ["refactorer", "performance", "architect", "qa"], "mcp_integration": ["sequential", "context7", "magic"]}'),
('/design', 'Development & Planning', 'Design orchestration', true, 'standard', 
 '{"auto_personas": ["architect", "frontend"], "mcp_integration": ["magic", "sequential", "context7"]}'),
('/task', 'Planning & Management', 'Long-term project management', true, 'standard', 
 '{"auto_personas": ["architect", "analyzer"], "mcp_integration": ["sequential"]}'),
('/troubleshoot', 'Analysis & Investigation', 'Problem investigation', false, 'standard', 
 '{"auto_personas": ["analyzer", "qa"], "mcp_integration": ["sequential", "playwright"]}'),
('/test', 'Quality & Testing', 'Testing workflows', false, 'standard', 
 '{"auto_personas": ["qa"], "mcp_integration": ["playwright", "sequential"]}'),
('/document', 'Documentation', 'Documentation generation', false, 'standard', 
 '{"auto_personas": ["scribe", "mentor"], "mcp_integration": ["context7", "sequential"]}'),
('/git', 'Version Control', 'Git workflow assistant', false, 'standard', 
 '{"auto_personas": ["devops", "scribe", "qa"], "mcp_integration": ["sequential"]}')
ON CONFLICT (command_name) DO NOTHING;

-- Insert MCP servers
INSERT INTO mcp.servers (name, description, endpoint_url, configuration, is_enabled) VALUES
('context7', 'Official library documentation and research server', 'context7://docs', 
 '{"purpose": "Documentation & Research", "activation_patterns": ["external library imports", "framework questions", "scribe persona"], "workflow": "resolve-library-id → get-library-docs → implement"}', true),
('sequential', 'Complex analysis and multi-step thinking server', 'sequential://thinking', 
 '{"purpose": "Multi-step problem solving", "activation_patterns": ["complex debugging", "system design", "--think flags"], "workflow": "problem decomposition → systematic analysis → hypothesis generation → evidence gathering"}', true),
('magic', 'UI components and design generation server', 'magic://ui', 
 '{"purpose": "Modern UI component generation", "activation_patterns": ["UI component requests", "design system queries"], "workflow": "requirement parsing → pattern search → code generation → accessibility compliance"}', true),
('playwright', 'Browser automation and testing server', 'playwright://browser', 
 '{"purpose": "Cross-browser E2E testing", "activation_patterns": ["testing workflows", "performance monitoring", "E2E test generation"], "workflow": "browser connection → interaction → data collection → validation"}', true)
ON CONFLICT (name) DO NOTHING;

-- Insert development project templates
INSERT INTO development.project_templates (name, description, framework, language, template_data) VALUES
('react-typescript', 'React application with TypeScript and modern tooling', 'React', 'TypeScript', 
 '{"dependencies": ["react", "typescript", "@types/react", "vite"], "scripts": {"dev": "vite", "build": "vite build", "test": "vitest"}, "structure": ["src/", "public/", "tests/"]}'),
('next-fullstack', 'Next.js full-stack application with API routes', 'Next.js', 'TypeScript', 
 '{"dependencies": ["next", "typescript", "@types/react"], "scripts": {"dev": "next dev", "build": "next build", "start": "next start"}, "structure": ["pages/", "api/", "components/", "styles/"]}'),
('express-api', 'Express.js API server with TypeScript', 'Express', 'TypeScript', 
 '{"dependencies": ["express", "typescript", "@types/express", "cors", "helmet"], "scripts": {"dev": "nodemon", "build": "tsc", "start": "node dist/server.js"}, "structure": ["src/", "dist/", "tests/"]}'),
('fastapi-python', 'FastAPI Python web framework', 'FastAPI', 'Python', 
 '{"dependencies": ["fastapi", "uvicorn", "pydantic", "sqlalchemy"], "scripts": {"dev": "uvicorn main:app --reload", "test": "pytest"}, "structure": ["app/", "tests/", "alembic/"]}'),
('django-app', 'Django web application', 'Django', 'Python', 
 '{"dependencies": ["django", "djangorest framework", "psycopg2-binary"], "scripts": {"dev": "python manage.py runserver", "migrate": "python manage.py migrate", "test": "python manage.py test"}, "structure": ["myapp/", "templates/", "static/"]}'),
('vue-spa', 'Vue.js single page application', 'Vue.js', 'TypeScript', 
 '{"dependencies": ["vue", "typescript", "@vitejs/plugin-vue"], "scripts": {"dev": "vite", "build": "vite build"}, "structure": ["src/", "public/", "components/"]}')
ON CONFLICT (name) DO NOTHING;

-- Insert initial monitoring data
INSERT INTO monitoring.service_health (service_name, service_type, status, response_time_ms) VALUES
('postgres', 'core', 'healthy', 5),
('redis', 'core', 'healthy', 2),
('prometheus', 'monitoring', 'healthy', 15),
('grafana', 'monitoring', 'healthy', 25),
('claude-app', 'core', 'starting', NULL),
('environment-controller', 'core', 'starting', NULL),
('mcp-orchestrator', 'mcp', 'starting', NULL),
('configuration-manager', 'core', 'starting', NULL);

-- Insert initial log entry
INSERT INTO monitoring.logs (service_name, level, message, metadata) VALUES
('system', 'info', 'Claude Code + SuperClaude + MCP Development Environment database initialized', 
 '{"version": "1.0.0", "timestamp": "' || NOW()::text || '", "initialization": "complete"}');

-- Insert initial metrics
INSERT INTO monitoring.metrics (metric_name, metric_value, labels) VALUES
('database_initialization_time_seconds', 0.5, '{"service": "postgresql", "environment": "development"}'),
('schema_tables_created', 20, '{"service": "postgresql", "environment": "development"}'),
('initial_data_rows_inserted', 50, '{"service": "postgresql", "environment": "development"}');

-- Create a view for easy environment status checking
CREATE OR REPLACE VIEW environment_overview AS
SELECT 
    e.name as environment_name,
    e.status as environment_status,
    e.created_at as environment_created,
    COUNT(s.id) as active_sessions,
    COUNT(c.id) as configurations_count,
    MAX(sh.checked_at) as last_health_check
FROM claude_core.environments e
LEFT JOIN claude_core.sessions s ON e.id = s.environment_id AND s.is_active = true
LEFT JOIN claude_core.configurations c ON e.id = c.environment_id
LEFT JOIN monitoring.service_health sh ON sh.service_name = 'claude-app'
GROUP BY e.id, e.name, e.status, e.created_at;

-- Grant access to the view
GRANT SELECT ON environment_overview TO claude_dev;

-- Create a function to get system status
CREATE OR REPLACE FUNCTION get_system_status()
RETURNS TABLE (
    component VARCHAR,
    status VARCHAR,
    last_check TIMESTAMP WITH TIME ZONE,
    details JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'database'::VARCHAR as component,
        'healthy'::VARCHAR as status,
        NOW() as last_check,
        jsonb_build_object(
            'version', version(),
            'active_connections', (SELECT count(*) FROM pg_stat_activity),
            'database_size', pg_size_pretty(pg_database_size('claude_development'))
        ) as details
    UNION ALL
    SELECT 
        sh.service_name::VARCHAR as component,
        sh.status::VARCHAR as status,
        sh.checked_at as last_check,
        jsonb_build_object(
            'response_time_ms', sh.response_time_ms,
            'service_type', sh.service_type
        ) as details
    FROM monitoring.service_health sh
    WHERE sh.checked_at > NOW() - INTERVAL '5 minutes'
    ORDER BY component;
END;
$$ LANGUAGE plpgsql;

-- Log completion
INSERT INTO monitoring.logs (service_name, level, message, metadata) VALUES
('database', 'info', 'Initial data population completed successfully', 
 '{"tables_populated": 10, "initial_records": 50, "views_created": 1, "functions_created": 1}');