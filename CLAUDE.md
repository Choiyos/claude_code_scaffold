# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code + SuperClaude + MCP Unified Development Environment** - A scaffolding system that enables development teams to share consistent AI-powered development environments based on Claude Code, SuperClaude, and MCP servers.

**Tech Stack**: TypeScript microservices, Python CLI tools, Docker/DevContainer, PostgreSQL, Redis, React/Next.js frontend

**Current Status**: Phase 2 completed (MCP integration & GitOps automation)

## Essential Development Commands

### Starting the Environment
```bash
# Start all services with Docker Compose
docker-compose up -d

# View service logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down
```

### Service-Specific Commands
```bash
# Build individual service
cd services/[service-name]
npm run build

# Run tests for a service
npm test

# Run a single test file
npm test -- path/to/test.spec.ts

# Lint TypeScript code
npm run lint

# Fix linting issues
npm run lint:fix

# Development mode with hot reload
npm run dev
```

### CLI Tool Usage
```bash
# Install CLI tool
pip install -e ./scripts/

# Check environment status
./scripts/claude-env status

# Sync configuration
./scripts/claude-env sync

# Detect configuration drift
./scripts/detect-drift.sh

# Run comprehensive test suite
python scripts/test-suite.py
```

### Database Operations
```bash
# Access PostgreSQL
docker exec -it claude-env-postgres psql -U claude_env -d claude_environment

# Run migrations (from services/shared)
npm run migrate

# Create new migration
npm run migrate:create -- migration_name
```

## High-Level Architecture

### Service Architecture
The system is built as containerized microservices communicating through HTTP and WebSocket:

1. **API Gateway** (port 3000) - Central entry point, handles authentication, rate limiting, request routing
2. **Environment Controller** (port 3001) - Manages development environments, WebSocket real-time updates
3. **Configuration Manager** (port 3003) - Hierarchical configuration management with Git sync
4. **MCP Orchestrator** - Load balances and manages MCP servers (Context7, Sequential, Magic)
5. **GitOps Controller** - Automated drift detection and configuration synchronization

### Configuration Layer System
Hierarchical configuration with intelligent merging:
- **Base Layer**: Core configurations all teams inherit
- **Team Layer**: Team-specific overrides
- **Project Layer**: Project-specific settings
- **User Layer**: Individual developer preferences

### MCP Server Integration
The system orchestrates multiple MCP servers:
- **Context7**: Documentation and code patterns
- **Sequential**: Multi-step reasoning and analysis
- **Magic**: UI component generation
- **Playwright**: Browser automation and testing

### Key Design Patterns
1. **Event-Driven Architecture**: Services communicate through EventBus for loose coupling
2. **Repository Pattern**: Database abstraction in `services/shared/repositories`
3. **Middleware Pipeline**: Consistent error handling, metrics, and request tracking
4. **Health Check System**: All services expose `/health` endpoints with readiness checks
5. **WebSocket Real-time Updates**: Environment changes broadcast to connected clients

### Critical Integration Points
- Services discover each other through environment variables (see docker-compose.yml)
- Shared database models in `services/shared/src/models`
- Common utilities in `services/shared/src/utils`
- Prometheus metrics exposed on `/metrics` for all services
- GitOps synchronization through dedicated Git repositories

## Development Workflow

1. **Making Changes**: Always run services in development mode (`npm run dev`) for hot reload
2. **Testing**: Write tests alongside code, aim for >80% coverage
3. **Database Changes**: Create migrations in `services/shared/src/database/migrations`
4. **Configuration Updates**: Use Configuration Manager API, changes auto-sync via GitOps
5. **Monitoring**: Access Grafana at localhost:3001 (admin/admin) for metrics dashboards

## Project Structure Notes

- **services/**: Each microservice is independent with its own package.json and tests
- **scripts/**: Python-based CLI tools and utilities for environment management
- **config/**: YAML configurations for environments, teams, and MCP servers
- **src/**: Frontend applications (dashboard, VS Code extension, onboarding)
- **architecture/**: Detailed system design documents and diagrams

## Known Complexities

1. **Service Dependencies**: Environment Controller requires Docker socket access for container management
2. **Configuration Merging**: Complex priority system - review ConfigurationLayerManager for details
3. **MCP Load Balancing**: Uses circuit breaker pattern, see LoadBalancer.ts for strategies
4. **WebSocket State**: Environment Controller maintains persistent connections, handle reconnection
5. **GitOps Sync**: Asynchronous with eventual consistency, monitor drift detection logs