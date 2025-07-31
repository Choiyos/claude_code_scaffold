# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code DevContainer Environment** - A DevContainer-based development environment that allows developers with zero Claude Code/MCP setup on their machines to achieve identical development environment through simple git clone + VS Code container opening.

**Tech Stack**: DevContainer + Docker Compose, Ubuntu 22.04, Node.js 18.20.8, Python 3.11, Zsh + Oh My Zsh

**Current Status**: DevContainer environment ready for immediate use

## Essential Development Commands

### Starting the Environment
```bash
# Open DevContainer in VS Code
# 1. Clone repository
# 2. Open in VS Code
# 3. Click "Reopen in Container" or Ctrl+Shift+P → "Dev Containers: Reopen in Container"

# Inside container - check Claude CLI
claude --version
claude --help

# Check services
docker-compose ps

# View service logs
docker-compose logs -f
```

### Environment Management
```bash
# Check Claude CLI configuration
ls -la ~/.claude/
cat ~/.claude/.claude.json

# Check MCP servers
claude mcp list

# Verify MCP servers installation (npm packages)
npm list -g --depth=0

# Check Node.js and Python versions
node --version
python3 --version

# Test development tools
git --version
zsh --version
```

### Service Operations
```bash
# Infrastructure services only (simplified from original)
docker-compose up -d postgres redis prometheus grafana

# Stop services
docker-compose down

# Service status
docker-compose ps

# Individual service logs
docker-compose logs -f grafana
```

### Development Workflow
```bash
# Typical development workflow
cd /workspace
claude --help
# Start development with Claude CLI

# Access monitoring
# Grafana: http://localhost:3010 (admin/admin)
# Prometheus: http://localhost:9090
```

## High-Level Architecture

### DevContainer Architecture
The environment is built as a portable DevContainer that provides:

1. **Base OS**: Ubuntu 22.04 LTS for maximum compatibility
2. **Runtime Environments**: Node.js 18.20.8, Python 3.11
3. **Shell Environment**: Zsh + Oh My Zsh with productivity enhancements
4. **Claude CLI**: Version 1.0.64+ with npm global installation
5. **MCP Servers**: Semi-automatic setup (Sequential, Context7, Magic, Playwright)

### Configuration System
Claude CLI-based configuration management:
- **MCP Management**: `claude mcp add/remove` commands for MCP server registration
- **Configuration Storage**: `~/.claude/.claude.json` managed by Claude CLI
- **Environment Variables**: 
  - `CLAUDE_CODE_OAUTH_TOKEN` (추천): OAuth 토큰을 통한 안정적 인증
  - `ANTHROPIC_API_KEY` (fallback): API 키를 통한 인증
- **Node.js Management**: Direct APT installation with npm global package support

### Infrastructure Services
Minimal infrastructure for development support:
- **PostgreSQL**: Development database
- **Redis**: Caching layer
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards

### Key Design Principles
1. **Zero Installation**: No host setup required beyond VS Code + Docker
2. **Environment Isolation**: Complete isolation from host environment
3. **Team Consistency**: Identical environment across all team members
4. **Instant Ready**: 3-5 minutes from clone to productive development
5. **Simplified Stack**: Removed complex microservices, kept essentials

## Development Workflow

1. **Environment Setup**: VS Code automatically builds and configures container
2. **Automatic Configuration**: Team settings applied during container startup  
3. **Claude CLI Setup**: 2-step manual configuration required
   - `claude auth login` - Browser authentication
   - `bash .devcontainer/setup-mcp-servers.sh` - MCP server registration
4. **Development Ready**: Full Claude Code CLI with MCP servers available
5. **Infrastructure Access**: Database, cache, and monitoring ready for use
6. **Productivity Tools**: Git aliases, shell enhancements, development utilities

## Project Structure Notes

- **.devcontainer/**: DevContainer configuration and setup scripts
- **team-config/**: Shared team configuration files
- **config/**: Infrastructure service configurations
- **docker-compose.yml**: Simplified infrastructure services only

## DevContainer Features

### Automatic Setup
The container automatically:
1. Installs Claude Code CLI 1.0.63
2. Installs required MCP servers
3. Applies team configuration settings
4. Sets up development tools and aliases
5. Starts infrastructure services
6. Configures Zsh with productivity enhancements

### Development Tools Included
- Git with team aliases and configuration
- Node.js development tools (npm, yarn, TypeScript)
- Python development environment
- Database clients (PostgreSQL, Redis)
- Monitoring access (Grafana, Prometheus)
- Shell productivity tools

### Team Configuration
- Claude Code settings automatically applied
- MCP servers configured and ready
- Git configuration with team standards
- Development aliases and shortcuts
- Consistent environment variables

## Usage Notes

### First Time Setup

#### 1. 환경변수 설정 (호스트 머신에서)
OAuth 토큰 방식 (추천):
```bash
# 토큰 생성
claude setup-token

# 환경변수 설정 (받은 토큰으로 교체)
export CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat01-..."
```

또는 API 키 방식:
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

#### 2. DevContainer 시작
1. Clone repository to local machine
2. Open folder in VS Code
3. Accept "Reopen in Container" prompt
4. Wait 3-5 minutes for automatic setup
5. Use Claude Code CLI immediately (인증 자동 완료)

### Daily Development
- Open VS Code, container resumes in seconds
- Claude Code CLI ready immediately
- Infrastructure services auto-start
- All team settings preserved

### Troubleshooting
- Container rebuild: Ctrl+Shift+P → "Dev Containers: Rebuild Container"
- Service logs: `docker-compose logs -f`
- Configuration check: `cat ~/.claude/config.json`