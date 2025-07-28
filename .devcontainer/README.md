# Claude Code Development Environment

Complete containerized development environment for Claude Code + SuperClaude + MCP integration.

## 🚀 Quick Start

### Prerequisites
- Docker Desktop 4.24+ with BuildKit enabled
- VS Code with Remote-Containers extension
- Git 2.30+
- 16GB RAM recommended
- 50GB free disk space

### Option 1: VS Code DevContainer (Recommended)
1. Clone the repository
2. Open in VS Code
3. Click "Reopen in Container" when prompted
4. Wait for container build and initialization (~10-15 minutes first time)

### Option 2: Manual Docker Compose
```bash
cd .devcontainer
./scripts/manage-env.sh start
```

## 📋 What's Included

### Development Tools
- **Languages**: Node.js 20, Python 3.11, Go 1.21, Rust 1.75
- **Package Managers**: npm, yarn, pnpm, pip, poetry, cargo
- **Build Tools**: webpack, vite, esbuild, turbo
- **Testing**: Jest, Mocha, pytest, Go test, Rust test
- **Linting**: ESLint, Prettier, Black, golangci-lint, clippy

### Databases & Storage
- **PostgreSQL 15**: Primary database with extensions
- **Redis 7**: Caching and message broker
- **MongoDB 6**: Document storage
- **Elasticsearch 8**: Search and analytics
- **MinIO**: S3-compatible object storage

### Monitoring & Observability
- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Jaeger**: Distributed tracing
- **OpenTelemetry**: Telemetry collection

### Cloud Tools
- **Docker**: Container management
- **Kubernetes**: kubectl, helm, k9s
- **AWS**: CLI, CDK tools
- **Azure**: CLI, Bicep
- **Google Cloud**: gcloud CLI
- **Terraform**: Infrastructure as code

## 🏗️ Architecture

### Container Structure
```
┌─────────────────────────────────────────────────────────┐
│ VS Code Dev Container (Main)                            │
│ ├── Development Environment                             │
│ ├── All Language Runtimes                              │
│ ├── Development Tools                                   │
│ └── Shell Customization (zsh + oh-my-zsh)              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ Data Services Network                                   │
│ ├── PostgreSQL (Primary DB)                            │
│ ├── Redis (Cache/Queue)                                │
│ ├── MongoDB (Documents)                                │
│ ├── Elasticsearch (Search)                             │
│ └── MinIO (Object Storage)                             │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ Monitoring Network                                      │
│ ├── Prometheus (Metrics)                               │
│ ├── Grafana (Dashboards)                               │
│ ├── Loki (Logs)                                        │
│ ├── Jaeger (Traces)                                    │
│ └── OpenTelemetry Collector                            │
└─────────────────────────────────────────────────────────┘
```

### Volume Strategy
- **Source Code**: Bind mounted with cached consistency
- **Dependencies**: Named volumes for faster rebuilds
- **Data**: Persistent volumes for databases
- **Caches**: Shared volumes for package managers
- **History**: Persistent shell/command history

## 🔧 Configuration

### Environment Variables
Create `.env` file in project root:
```bash
# Development settings
CLAUDE_ENV=development
NODE_ENV=development
DEBUG=true

# Database URLs
DATABASE_URL=postgresql://claude_dev:dev_password@postgres:5432/claude_code
REDIS_URL=redis://redis:6379/0
MONGODB_URL=mongodb://claude_admin:dev_password@mongodb:27017/claude_code

# API Configuration
API_PORT=5000
API_HOST=0.0.0.0

# Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

### VS Code Settings
The environment includes optimized VS Code settings for:
- Format on save with Prettier/Black
- ESLint auto-fix
- Python interpreter detection
- Go formatting with goimports
- Extension recommendations

### Shell Customization
- **Zsh** with Oh My Zsh
- **Powerlevel10k** theme
- **Custom aliases** for Docker, Git, Kubernetes
- **Auto-completion** for all CLI tools
- **History search** with fzf

## 📊 Service URLs

### Development
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Admin Panel: http://localhost:8080
- Documentation: http://localhost:8081

### Monitoring
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3030 (admin/admin)
- Jaeger: http://localhost:16686
- Kibana: http://localhost:5601

### Data Services
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- MongoDB: localhost:27017
- Elasticsearch: localhost:9200
- MinIO Console: http://localhost:9001

## 🛠️ Management Commands

### Environment Management
```bash
# Start environment
./scripts/manage-env.sh start

# Stop environment
./scripts/manage-env.sh stop

# Show status
./scripts/manage-env.sh status

# View logs
./scripts/manage-env.sh logs postgres

# Execute commands
./scripts/manage-env.sh exec dev-environment bash

# Backup data
./scripts/manage-env.sh backup

# Update environment
./scripts/manage-env.sh update

# Clean up
./scripts/manage-env.sh cleanup
```

### Development Shortcuts
```bash
# Project initialization
claude-init

# Docker commands
dps          # Show running containers
dclean       # Clean up Docker resources
dlogs <name> # Follow container logs

# Kubernetes
k get pods   # List pods
kctx         # Show current context
klog <pod>   # Pod logs

# Git shortcuts
gs           # Git status
glog         # Pretty git log
gcleanup     # Clean merged branches
```

## 🚄 Performance Optimization

### Build Performance
- **Multi-stage Dockerfile** for parallel builds
- **BuildKit cache mounts** for package managers
- **Registry cache** for shared layers
- **Optimized layer ordering** for cache efficiency

### Runtime Performance
- **Resource limits** prevent resource exhaustion
- **Named volumes** for database performance
- **Cached bind mounts** for development files
- **Custom networks** for service isolation

### Development Workflow
- **Hot reload** configured for all frameworks
- **File watching** optimized for large codebases
- **Package manager caches** in persistent volumes
- **Pre-commit hooks** for code quality

See [PERFORMANCE_GUIDE.md](PERFORMANCE_GUIDE.md) for detailed optimization strategies.

## 🔍 Monitoring & Debugging

### Application Monitoring
- **Prometheus** collects metrics from all services
- **Grafana** provides pre-configured dashboards
- **OpenTelemetry** traces requests across services
- **Loki** aggregates logs with structured data

### Development Debugging
- **VS Code debugger** configured for all languages
- **Browser DevTools** integration
- **Database clients** included
- **Performance profiling** tools available

### Health Checks
All services include health checks:
```bash
# Check service health
curl http://localhost:5000/health
curl http://localhost:9090/-/healthy
```

## 📚 Documentation

### Architecture Documents
- [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)
- [Component Specifications](../architecture/COMPONENT_SPECIFICATIONS.md)
- [API Design](../architecture/API_DESIGN.md)
- [Deployment Architecture](../architecture/DEPLOYMENT_ARCHITECTURE.md)

### Development Guides
- [Performance Guide](PERFORMANCE_GUIDE.md)
- [Getting Started](../docs/getting-started.md)
- [API Documentation](../docs/api.md)
- [Contributing Guidelines](../docs/contributing.md)

## 🔒 Security

### Development Security
- **Non-root user** for development container
- **Minimal permissions** for service accounts
- **Secret management** through environment variables
- **Network isolation** between service groups

### Production Considerations
- Change all default passwords
- Enable SSL/TLS for all services
- Configure proper firewall rules
- Use secret management systems
- Enable audit logging

## 🐛 Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check Docker daemon
docker info

# Check logs
docker-compose logs <service>

# Rebuild container
docker-compose build --no-cache <service>
```

#### Port Conflicts
```bash
# Check port usage
netstat -tulpn | grep :5432

# Kill process using port
sudo kill -9 $(lsof -t -i:5432)
```

#### Performance Issues
```bash
# Check resource usage
docker stats

# Monitor container logs
docker-compose logs -f --tail=100

# Check disk space
docker system df
```

#### VS Code Issues
```bash
# Reload VS Code window
Ctrl+Shift+P -> "Developer: Reload Window"

# Rebuild container
Ctrl+Shift+P -> "Remote-Containers: Rebuild Container"
```

### Getting Help
1. Check [troubleshooting guide](../docs/troubleshooting.md)
2. Review [performance guide](PERFORMANCE_GUIDE.md)
3. Search existing issues in repository
4. Create new issue with logs and environment details

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Make changes in devcontainer
4. Run tests and linting
5. Submit pull request

### Adding New Services
1. Add service to `docker-compose.yml`
2. Update health checks
3. Add monitoring configuration
4. Update documentation
5. Test thoroughly

### Environment Updates
1. Update Dockerfile stages
2. Test build performance
3. Update documentation
4. Create migration guide if needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE.md) file for details.

## 🙏 Acknowledgments

- [VS Code Dev Containers](https://containers.dev/)
- [Docker BuildKit](https://docs.docker.com/build/buildkit/)
- [Oh My Zsh](https://ohmyz.sh/)
- [Powerlevel10k](https://github.com/romkatv/powerlevel10k)
- [Prometheus](https://prometheus.io/)
- [Grafana](https://grafana.com/)

---

**Happy Coding!** 🚀