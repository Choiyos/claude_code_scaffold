# Claude Environment CLI Tools & Management Scripts

Comprehensive CLI tools and management scripts for Claude Code + SuperClaude + MCP integration, providing a complete development environment management system.

## 🚀 Overview

This collection provides production-ready CLI tools for:

- **Environment Management**: Configuration synchronization and drift detection
- **Health Monitoring**: System health validation and performance monitoring
- **Backup & Restore**: Comprehensive backup and disaster recovery
- **MCP Server Management**: Lifecycle management for MCP servers
- **Project Initialization**: Bootstrap new projects with Claude environment
- **Development Utilities**: Testing, validation, and development workflow automation

## 📁 Directory Structure

```
scripts/
├── claude-env                    # Main CLI tool (comprehensive)
├── claude-env-utils              # Unified utilities CLI wrapper
├── test-suite.py                 # Comprehensive test suite
├── setup/                        # Installation and setup scripts
│   ├── install.sh               # Automated installation script
│   ├── requirements.txt         # Python dependencies
│   └── setup.py                 # Package setup configuration
├── utils/                        # Individual utility scripts
│   ├── environment-validator.py # Configuration validation
│   ├── backup-restore.py        # Backup and restore operations
│   ├── mcp-manager.py           # MCP server lifecycle management
│   └── project-init.py          # Project initialization utility
└── monitoring/                   # Health and monitoring tools
    └── health-check.py          # Comprehensive system health check
```

## 🛠️ Installation

### Quick Install

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd claude_code_scaffold/scripts

# Run the automated installer
chmod +x setup/install.sh
./setup/install.sh
```

### Manual Install

```bash
# Install Python dependencies
pip install -r setup/requirements.txt

# Make scripts executable
chmod +x claude-env claude-env-utils

# Add to PATH (optional)
ln -sf $(pwd)/claude-env /usr/local/bin/claude-env
ln -sf $(pwd)/claude-env-utils /usr/local/bin/claude-env-utils
```

### Development Install

```bash
# Install in development mode
pip install -e setup/

# Run tests to verify installation
python test-suite.py
```

## 🎯 Quick Start

### 1. Main CLI Tool (`claude-env`)

The primary interface for Claude environment management:

```bash
# Interactive mode (recommended for beginners)
claude-env

# Check environment status
claude-env status

# Sync environment configuration
claude-env sync --environment development

# Check for configuration drift
claude-env status --check-drift

# Create backup
claude-env backup create --environment development

# Show help
claude-env --help
```

### 2. Utilities CLI (`claude-env-utils`)

Unified interface for all utility tools:

```bash
# List available utilities
claude-env-utils list

# Run quick health and validation checks
claude-env-utils quick-check

# Show comprehensive system status
claude-env-utils status

# Run specific utilities
claude-env-utils health-check --continuous
claude-env-utils backup create --environment development
claude-env-utils mcp status --watch
```

## 📖 Detailed Tool Documentation

### Main CLI Tool (`claude-env`)

**Comprehensive environment management with interactive UI**

```bash
# Environment synchronization
claude-env sync --environment development --dry-run
claude-env sync --environment production --force

# Status and monitoring
claude-env status --check-drift --environment all
claude-env status --detailed --json

# Configuration management
claude-env config get mcp.servers
claude-env config set sync_interval 600
claude-env config validate --environment development

# Backup and restore
claude-env backup create --environment production --description "pre-deploy"
claude-env backup list --environment production
claude-env backup restore backup_id --force

# Rollback operations
claude-env rollback --to-backup latest
claude-env rollback --list-backups

# Diff and comparison
claude-env diff --compare-with remote --output json
```

**Key Features:**
- Rich interactive UI with progress indicators
- Comprehensive drift detection and remediation
- Atomic backup and restore operations
- Real-time validation and error handling
- Production-ready with comprehensive logging

### Health Check (`health-check.py`)

**Comprehensive system health validation**

```bash
# Basic health check
python monitoring/health-check.py

# JSON output for automation
python monitoring/health-check.py --json

# Continuous monitoring
python monitoring/health-check.py --continuous --interval 60

# Custom configuration directory
python monitoring/health-check.py --config-dir /custom/path
```

**Health Check Components:**
- System resources (CPU, memory, disk)
- Python environment and dependencies
- Claude configuration integrity
- MCP server connectivity
- Docker services status
- Network connectivity
- File permissions and security
- SSL certificate validation

### Environment Validator (`environment-validator.py`)

**Configuration validation and compliance checking**

```bash
# Validate all configurations
python utils/environment-validator.py

# JSON output
python utils/environment-validator.py --json

# Validate specific component
python utils/environment-validator.py --component main_config

# Auto-fix issues where possible
python utils/environment-validator.py --fix
```

**Validation Features:**
- YAML/JSON syntax validation
- Schema compliance checking
- Semantic rule validation
- Dependency verification
- Security settings validation
- Cross-reference validation

### Backup & Restore (`backup-restore.py`)

**Production-grade backup and disaster recovery**

```bash
# Create backups
python utils/backup-restore.py create --environment development
python utils/backup-restore.py create --type configuration_only
python utils/backup-restore.py create --description "pre-migration"

# List and manage backups
python utils/backup-restore.py list --environment production
python utils/backup-restore.py list --json

# Restore operations
python utils/backup-restore.py restore backup_id
python utils/backup-restore.py restore backup_id --target-dir /restore/path
python utils/backup-restore.py restore backup_id --force --no-verify

# Verify backup integrity
python utils/backup-restore.py verify backup_id

# Cleanup old backups
python utils/backup-restore.py cleanup --retention-days 30 --keep-minimum 5
```

**Backup Features:**
- Incremental and full backup support
- Compression and encryption
- Integrity verification with checksums
- Atomic restore operations
- Retention policy management
- Metadata tracking and search

### MCP Server Manager (`mcp-manager.py`)

**Complete MCP server lifecycle management**

```bash
# Server status and monitoring
python utils/mcp-manager.py status
python utils/mcp-manager.py status --json --watch

# Start/stop/restart servers
python utils/mcp-manager.py start all
python utils/mcp-manager.py start context7
python utils/mcp-manager.py stop all --force
python utils/mcp-manager.py restart sequential

# Deploy new server configurations
python utils/mcp-manager.py deploy new_server --config server-config.json
python utils/mcp-manager.py deploy test_server --command python test_server.py

# Monitoring mode
python utils/mcp-manager.py monitor --interval 30
```

**MCP Features:**
- Process lifecycle management
- Health monitoring and auto-restart
- Resource usage tracking
- Configuration deployment
- Log aggregation
- Performance metrics

### Project Initializer (`project-init.py`)

**Bootstrap new projects with Claude environment**

```bash
# List available templates
python utils/project-init.py list

# Create new projects
python utils/project-init.py create my-api --template nodejs
python utils/project-init.py create my-app --template react
python utils/project-init.py create my-service --template python
python utils/project-init.py create my-fullstack --template nextjs

# Non-interactive mode
python utils/project-init.py create automated-project --template minimal --non-interactive
```

**Available Templates:**
- **nodejs**: TypeScript + Express + Claude integration
- **python**: FastAPI + async support + Claude integration
- **react**: React + TypeScript + Tailwind CSS + Claude integration
- **nextjs**: Next.js + TypeScript + Tailwind CSS + Claude integration
- **minimal**: Basic Claude environment setup

**Project Features:**
- Comprehensive project scaffolding
- Dependency management
- Claude environment pre-configuration
- MCP server integration
- Development workflow setup
- Testing infrastructure

## 🔧 Advanced Configuration

### Environment Variables

```bash
# Claude configuration directory
export CLAUDE_CONFIG_DIR="/custom/claude/path"

# Default environment
export CLAUDE_DEFAULT_ENV="development"

# Enable debug logging
export CLAUDE_DEBUG=true

# MCP server configuration
export MCP_CONFIG_PATH="/custom/mcp.json"
```

### Configuration Files

**Main Configuration (`.claude/config.yml`)**:
```yaml
version: "2.0.0"
default_environment: "development"
auto_sync: false
sync_interval: 300
backup_retention: 30

logging:
  level: "INFO"
  file: "logs/claude-env.log"
  max_size: "10MB"
  max_files: 5

ui:
  color: true
  progress_bars: true
  interactive: true

integrations:
  mcp_servers:
    auto_discovery: true
    health_check_interval: 60
  vscode:
    auto_configure: true
  docker:
    auto_detect: true
```

**MCP Configuration (`.claude/mcp.json`)**:
```json
{
  "mcpServers": {
    "context7": {
      "command": ["node", "@anthropic-ai/mcp-server-context7"],
      "auto_start": true,
      "auto_restart": true,
      "health_check_url": "http://localhost:3001/health"
    },
    "sequential": {
      "command": ["python", "-m", "mcp_server_sequential"],
      "auto_start": true,
      "auto_restart": true,
      "max_restarts": 5,
      "restart_delay": 5
    }
  }
}
```

## 🧪 Testing

### Run Test Suite

```bash
# Run all tests
python test-suite.py

# Verbose output
python test-suite.py --verbose

# Keep test environment for debugging
python test-suite.py --no-cleanup
```

### Individual Tool Testing

```bash
# Test main CLI
python test-suite.py --test main_cli

# Test specific utility
python test-suite.py --test health_check

# Test with custom configuration
CLAUDE_CONFIG_DIR=/test/config python test-suite.py
```

## 🚀 Development Workflow

### Adding New Utilities

1. Create utility script in `utils/` directory
2. Add entry to `claude-env-utils` utilities dictionary
3. Add tests to `test-suite.py`
4. Update documentation

### Contributing

1. Follow Python best practices and type hints
2. Use Rich library for beautiful console output
3. Implement comprehensive error handling
4. Add tests for new functionality
5. Update documentation

## 📊 Performance & Monitoring

### Metrics Collection

The tools collect performance metrics including:
- Command execution times
- Resource usage statistics
- Error rates and patterns
- User interaction patterns

### Monitoring Integration

```bash
# Continuous health monitoring
claude-env-utils health-check --continuous --interval 30

# MCP server monitoring
claude-env-utils mcp monitor --interval 60

# System status dashboard
claude-env-utils status --watch
```

## 🔒 Security Considerations

### File Permissions

The tools automatically manage secure file permissions:
- Configuration directory: `700` (rwx------)
- Sensitive files: `600` (rw-------)
- Log files: `640` (rw-r-----)

### Backup Security

- Checksums for integrity verification
- Encrypted backup storage (when configured)
- Secure temporary file handling
- Access logging for audit trails

## 🆘 Troubleshooting

### Common Issues

**1. Permission Denied**
```bash
# Fix file permissions
chmod +x claude-env claude-env-utils
chmod 700 ~/.claude
```

**2. Missing Dependencies**
```bash
# Install required packages
pip install -r setup/requirements.txt
```

**3. MCP Server Issues**
```bash
# Check MCP server status
claude-env-utils mcp status
# Restart problematic servers
claude-env-utils mcp restart all
```

**4. Configuration Issues**
```bash
# Validate configuration
claude-env-utils validate
# Check specific component
claude-env-utils validate --component mcp_config
```

### Debug Mode

```bash
# Enable verbose logging
export CLAUDE_DEBUG=true
claude-env --verbose sync --environment development

# Check system health
claude-env-utils health-check --json | jq '.'
```

### Getting Help

```bash
# Show command help
claude-env --help
claude-env-utils help <utility>

# Show utility-specific help
python utils/backup-restore.py --help
python monitoring/health-check.py --help
```

## 📋 Best Practices

### Environment Management

1. **Regular Health Checks**: Run `claude-env-utils quick-check` daily
2. **Backup Before Changes**: Always backup before major configuration changes
3. **Validation After Changes**: Run validation after configuration updates
4. **Monitor MCP Servers**: Keep MCP servers healthy and updated

### Development Workflow

1. **Use Interactive Mode**: Start with `claude-env` for guided operations
2. **Validate Early**: Use `claude-env config validate` before deployment
3. **Test Changes**: Use `--dry-run` flags to preview changes
4. **Monitor Continuously**: Use `--watch` flags for real-time monitoring

### Production Deployment

1. **Automated Health Checks**: Integrate health checks into CI/CD
2. **Backup Automation**: Schedule regular backups
3. **Monitoring Alerts**: Set up monitoring and alerting
4. **Security Audits**: Regular security validation

## 🔗 Integration Examples

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Claude Environment Health Check
  run: |
    claude-env-utils health-check --json
    claude-env-utils validate --json

- name: Backup Before Deployment
  run: |
    claude-env backup create --environment production --description "pre-deploy-$(date +%Y%m%d)"
```

### Docker Integration

```dockerfile
# Include in Dockerfile
COPY scripts/ /opt/claude-env/
RUN pip install -r /opt/claude-env/setup/requirements.txt
RUN ln -sf /opt/claude-env/claude-env /usr/local/bin/claude-env
```

### VS Code Integration

Add to VS Code tasks.json:
```json
{
  "tasks": [
    {
      "label": "Claude Environment Status",
      "type": "shell",
      "command": "claude-env-utils",
      "args": ["status"]
    }
  ]
}
```

---

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests for any improvements.

## 📞 Support

For support and questions:
- Check the troubleshooting section above
- Run `claude-env-utils quick-check` for common issues
- Use `--help` flags for command-specific help
- Check logs in `.claude/logs/` directory