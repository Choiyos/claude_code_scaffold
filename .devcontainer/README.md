# Claude Code DevContainer Environment

Simple and efficient DevContainer setup for Claude Code + AI development tools.

## 🚀 Quick Start

1. **Prerequisites**: VS Code + Docker Desktop + Dev Containers extension
2. **Clone repository**: `git clone <repo-url>`
3. **Open in VS Code**: Click "Reopen in Container"
4. **Wait for setup**: ~3-5 minutes first time

## 🛠️ What's Included

### AI Development Tools
- **Claude CLI**: Latest version with auto-installation
- **5 MCP Servers**: Auto-configured and ready to use
- **Claude Squad**: Team collaboration tool
- **SuperClaude Framework**: Advanced AI automation

### Development Environment
- **Languages**: Node.js 18, Python 3.11
- **Shell**: Zsh + Oh My Zsh with productivity enhancements
- **Tools**: Git, tmux, GitHub CLI

### Infrastructure Services
- **PostgreSQL**: Development database
- **Redis**: Caching layer
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards (http://localhost:3010)

## 📋 Service Access

- **Grafana Dashboard**: http://localhost:3010 (admin/admin)
- **Prometheus**: http://localhost:9090
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## 🔧 Management Commands

```bash
# Check all services
docker-compose ps

# View service logs
docker-compose logs -f

# Claude CLI commands
claude --help
claude mcp list

# AI tool aliases
cs --help          # Claude Squad
sc --help          # SuperClaude Framework (after setup)
```

## 🐛 Troubleshooting

### Common Issues
- **Container build slow**: See performance optimizations in main README
- **MCP servers not working**: Check authentication with `claude mcp list`
- **Services not starting**: Check Docker daemon and port conflicts

### Getting Help
1. Check main project README
2. Check container logs: `docker-compose logs -f`
3. Create issue with logs and environment details

## 📄 Architecture

Simple, focused architecture for AI development:
- **DevContainer**: Main development environment
- **Infrastructure Services**: Supporting tools (DB, monitoring)
- **Auto-Configuration**: Everything set up automatically

Built for developers who want to focus on AI development, not DevOps complexity.