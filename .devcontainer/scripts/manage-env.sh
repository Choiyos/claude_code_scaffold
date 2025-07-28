#!/bin/bash
# Environment management script for Claude Code + SuperClaude + MCP Development Environment
# Comprehensive environment management utilities with Claude-specific services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# UTILITY FUNCTIONS
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================
# COMMAND FUNCTIONS
# ============================================

# Start the development environment
start_env() {
    log_info "Starting Claude Code development environment..."
    
    cd "$PROJECT_ROOT/.devcontainer"
    docker-compose up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 5
    
    # Check service health
    docker-compose ps
    
    log_success "Development environment started successfully!"
    show_urls
}

# Stop the development environment
stop_env() {
    log_info "Stopping Claude Code development environment..."
    
    cd "$PROJECT_ROOT/.devcontainer"
    docker-compose down
    
    log_success "Development environment stopped!"
}

# Restart the development environment
restart_env() {
    log_info "Restarting Claude Code development environment..."
    stop_env
    start_env
}

# Show service URLs
show_urls() {
    echo ""
    echo -e "${CYAN}🧠 Claude Code + SuperClaude + MCP Services:${NC}"
    echo "  🌐 Main Application:    http://localhost:3000"
    echo "  🔌 Environment Controller: http://localhost:3001"
    echo "  🤖 MCP Orchestrator:   http://localhost:3002"
    echo "  ⚙️  Configuration Manager: http://localhost:3003"
    echo ""
    echo -e "${PURPLE}📊 Monitoring & Analytics:${NC}"
    echo "  📈 Prometheus:         http://localhost:9090"
    echo "  📊 Grafana Dashboard:  http://localhost:3001"
    echo "  🔍 Jaeger Tracing:     http://localhost:16686"
    echo "  📧 MailHog (Email):    http://localhost:8025"
    echo ""
    echo -e "${BLUE}💾 Data Layer:${NC}"
    echo "  🐘 PostgreSQL:         localhost:5432 (claude_user/claude_password)"
    echo "  🔴 Redis Cache:        localhost:6379"
    echo "  🗄️  MinIO S3 Storage:   http://localhost:9000 (UI: :9001)"
    echo ""
    echo -e "${GREEN}🔧 Development Tools:${NC}"
    echo "  📮 SMTP Testing:       localhost:1025 (MailHog)"
    echo "  📊 Node Exporter:      http://localhost:9100"
    echo "  📈 cAdvisor:           http://localhost:8080"
    echo ""
}

# Show logs for a service
show_logs() {
    local service=$1
    
    if [ -z "$service" ]; then
        log_error "Please specify a service name"
        echo "Available services:"
        cd "$PROJECT_ROOT/.devcontainer"
        docker-compose config --services
        return 1
    fi
    
    cd "$PROJECT_ROOT/.devcontainer"
    docker-compose logs -f "$service"
}

# Execute command in a service
exec_in_service() {
    local service=$1
    shift
    local command=$@
    
    if [ -z "$service" ]; then
        log_error "Please specify a service name"
        return 1
    fi
    
    if [ -z "$command" ]; then
        command="/bin/bash"
    fi
    
    cd "$PROJECT_ROOT/.devcontainer"
    docker-compose exec "$service" $command
}

# Show environment status
show_status() {
    log_info "Claude Code Development Environment Status"
    echo ""
    
    cd "$PROJECT_ROOT/.devcontainer"
    
    # Show running services
    echo "🐳 Docker Services:"
    docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    
    # Show resource usage
    echo "💻 Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
    echo ""
    
    # Show disk usage
    echo "💾 Disk Usage:"
    docker system df
}

# Clean up resources
cleanup() {
    log_warning "This will remove all containers, volumes, and images related to Claude Code!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up Claude Code development environment..."
        
        cd "$PROJECT_ROOT/.devcontainer"
        
        # Stop and remove containers
        docker-compose down -v --remove-orphans
        
        # Remove images
        docker-compose down --rmi all
        
        # Clean build cache
        docker builder prune -af
        
        # Clean system
        docker system prune -af --volumes
        
        log_success "Cleanup completed!"
    else
        log_info "Cleanup cancelled."
    fi
}

# Backup data
backup_data() {
    local backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)"
    
    log_info "Creating Claude environment backup in $backup_dir..."
    mkdir -p "$backup_dir"
    
    cd "$PROJECT_ROOT/.devcontainer"
    
    # Backup PostgreSQL
    log_info "Backing up PostgreSQL database..."
    if docker-compose ps postgres | grep -q "Up"; then
        docker-compose exec -T postgres pg_dumpall -U claude_user > "$backup_dir/postgres_backup.sql"
        log_success "PostgreSQL backup completed"
    else
        log_warning "PostgreSQL is not running, skipping database backup"
    fi
    
    # Backup Redis
    log_info "Backing up Redis data..."
    if docker-compose ps redis | grep -q "Up"; then
        docker-compose exec -T redis redis-cli SAVE
        docker cp "$(docker-compose ps -q redis):/data/dump.rdb" "$backup_dir/redis_backup.rdb"
        log_success "Redis backup completed"
    else
        log_warning "Redis is not running, skipping Redis backup"
    fi
    
    # Backup Claude configuration
    log_info "Backing up Claude configuration..."
    if [ -d "$HOME/.claude" ]; then
        cp -r "$HOME/.claude" "$backup_dir/claude_config"
        log_success "Claude configuration backup completed"
    fi
    
    # Backup MinIO data (optional)
    if docker-compose ps minio | grep -q "Up"; then
        log_info "Backing up MinIO storage..."
        docker cp "$(docker-compose ps -q minio):/data" "$backup_dir/minio_data"
        log_success "MinIO backup completed"
    fi
    
    # Create archive
    log_info "Creating backup archive..."
    tar -czf "$backup_dir.tar.gz" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")"
    rm -rf "$backup_dir"
    
    log_success "Backup completed: $backup_dir.tar.gz"
}

# Restore data
restore_data() {
    local backup_file=$1
    
    if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
        log_error "Please specify a valid backup file"
        return 1
    fi
    
    log_warning "This will overwrite all current Claude environment data!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restoring Claude environment from backup..."
        
        # Extract backup
        local temp_dir="/tmp/claude_restore_$(date +%s)"
        mkdir -p "$temp_dir"
        tar -xzf "$backup_file" -C "$temp_dir"
        
        cd "$PROJECT_ROOT/.devcontainer"
        
        # Restore PostgreSQL
        if [ -f "$temp_dir/*/postgres_backup.sql" ]; then
            log_info "Restoring PostgreSQL database..."
            docker-compose exec -T postgres psql -U claude_user < "$temp_dir/*/postgres_backup.sql"
            log_success "PostgreSQL restore completed"
        fi
        
        # Restore Redis
        if [ -f "$temp_dir/*/redis_backup.rdb" ]; then
            log_info "Restoring Redis data..."
            docker cp "$temp_dir/*/redis_backup.rdb" "$(docker-compose ps -q redis):/data/dump.rdb"
            docker-compose restart redis
            log_success "Redis restore completed"
        fi
        
        # Restore Claude configuration
        if [ -d "$temp_dir/*/claude_config" ]; then
            log_info "Restoring Claude configuration..."
            cp -r "$temp_dir/*/claude_config" "$HOME/.claude"
            log_success "Claude configuration restore completed"
        fi
        
        # Restore MinIO data
        if [ -d "$temp_dir/*/minio_data" ]; then
            log_info "Restoring MinIO storage..."
            docker cp "$temp_dir/*/minio_data" "$(docker-compose ps -q minio):/data"
            docker-compose restart minio
            log_success "MinIO restore completed"
        fi
        
        # Cleanup
        rm -rf "$temp_dir"
        
        log_success "Claude environment restore completed!"
    else
        log_info "Restore cancelled."
    fi
}

# Update environment
update_env() {
    log_info "Updating Claude Code development environment..."
    
    cd "$PROJECT_ROOT/.devcontainer"
    
    # Pull latest images
    docker-compose pull
    
    # Rebuild custom images
    docker-compose build --pull
    
    # Restart services
    docker-compose up -d
    
    log_success "Environment updated successfully!"
}

# ============================================
# MAIN SCRIPT
# ============================================

# Claude-specific environment functions
claude_init() {
    log_info "Initializing Claude Code + SuperClaude + MCP environment..."
    
    # Ensure Claude directories exist
    mkdir -p "$HOME/.claude"/{config,environments,mcp-servers,logs,cache,templates,shortcuts,scripts}
    
    # Initialize environment configuration
    if [ ! -f "$HOME/.claude/config/environment.json" ]; then
        cat > "$HOME/.claude/config/environment.json" << EOF
{
  "version": "1.0.0",
  "environment": "development",
  "initialized": true,
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "last_updated": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "services": {
    "postgresql": {
      "enabled": true,
      "host": "postgres",
      "port": 5432,
      "database": "claude_development"
    },
    "redis": {
      "enabled": true,
      "host": "redis",
      "port": 6379
    },
    "monitoring": {
      "prometheus": "http://prometheus:9090",
      "grafana": "http://grafana:3000"
    }
  },
  "features": {
    "superclaude": true,
    "mcp": true,
    "monitoring": true,
    "development_tools": true
  }
}
EOF
        log_success "Claude environment configuration created"
    fi
    
    # Run post-create script if available
    if [ -f "$PROJECT_ROOT/.devcontainer/scripts/post-create.sh" ]; then
        log_info "Running post-create setup..."
        bash "$PROJECT_ROOT/.devcontainer/scripts/post-create.sh"
    fi
    
    log_success "Claude environment initialization completed!"
}

# Check Claude environment health
claude_health() {
    log_info "Checking Claude Code + SuperClaude + MCP environment health..."
    echo ""
    
    # Check core services
    echo -e "${BLUE}🧠 Core Claude Services:${NC}"
    services=("postgres:5432" "redis:6379" "prometheus:9090" "grafana:3000")
    
    for service in "${services[@]}"; do
        IFS=':' read -r host port <<< "$service"
        if nc -z "$host" "$port" 2>/dev/null; then
            echo "  ✅ $host:$port - Healthy"
        else
            echo "  ❌ $host:$port - Unhealthy"
        fi
    done
    
    echo ""
    echo -e "${PURPLE}📊 Additional Services:${NC}"
    additional_services=("jaeger:16686" "mailhog:8025" "minio:9000" "node-exporter:9100" "cadvisor:8080")
    
    for service in "${additional_services[@]}"; do
        IFS=':' read -r host port <<< "$service"
        if nc -z "$host" "$port" 2>/dev/null; then
            echo "  ✅ $host:$port - Healthy"
        else
            echo "  ⚠️ $host:$port - Optional service not running"
        fi
    done
    
    # Check Claude configuration
    echo ""
    echo -e "${GREEN}⚙️ Claude Configuration:${NC}"
    if [ -f "$HOME/.claude/config/environment.json" ]; then
        echo "  ✅ Environment configuration exists"
        if command -v jq >/dev/null 2>&1; then
            version=$(jq -r '.version // "unknown"' "$HOME/.claude/config/environment.json")
            echo "  📋 Version: $version"
        fi
    else
        echo "  ❌ Environment configuration missing"
        echo "  💡 Run: $0 claude-init"
    fi
    
    # Check development environment
    echo ""
    echo -e "${CYAN}🔧 Development Environment:${NC}"
    
    # Check Docker
    if docker info >/dev/null 2>&1; then
        echo "  ✅ Docker daemon accessible"
        container_count=$(docker ps --format "{{.Names}}" | wc -l)
        echo "  📊 Running containers: $container_count"
    else
        echo "  ❌ Docker daemon not accessible"
    fi
    
    # Check workspace
    if [ -d "/workspace" ]; then
        echo "  ✅ Workspace directory accessible"
        workspace_size=$(du -sh /workspace 2>/dev/null | cut -f1 || echo "Unknown")
        echo "  📁 Workspace size: $workspace_size"
    else
        echo "  ❌ Workspace directory not found"
    fi
    
    echo ""
}

show_help() {
    echo -e "${CYAN}🧠 Claude Code + SuperClaude + MCP Environment Manager${NC}"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo -e "${GREEN}Environment Management:${NC}"
    echo "  start              Start the development environment"
    echo "  stop               Stop the development environment"
    echo "  restart            Restart the development environment"
    echo "  status             Show environment status"
    echo "  urls               Show service URLs"
    echo "  update             Update environment images"
    echo "  cleanup            Clean up all resources"
    echo ""
    echo -e "${BLUE}Claude-Specific Commands:${NC}"
    echo "  claude-init        Initialize Claude environment"
    echo "  claude-health      Check Claude services health"
    echo ""
    echo -e "${PURPLE}Service Management:${NC}"
    echo "  logs <service>     Show logs for a service"
    echo "  exec <service>     Execute command in a service"
    echo ""
    echo -e "${YELLOW}Data Management:${NC}"
    echo "  backup             Backup all data and configuration"
    echo "  restore <file>     Restore data from backup"
    echo ""
    echo -e "${CYAN}Available Services:${NC}"
    echo "  postgres, redis, prometheus, grafana, jaeger, mailhog, minio"
    echo "  node-exporter, cadvisor, devcontainer"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  $0 start           # Start all services"
    echo "  $0 logs postgres   # View PostgreSQL logs"
    echo "  $0 exec redis bash # Open shell in Redis container"
    echo "  $0 claude-health   # Check all Claude services"
    echo ""
}

# Parse command
case "$1" in
    start)
        start_env
        ;;
    stop)
        stop_env
        ;;
    restart)
        restart_env
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    exec)
        shift
        exec_in_service "$@"
        ;;
    urls)
        show_urls
        ;;
    backup)
        backup_data
        ;;
    restore)
        restore_data "$2"
        ;;
    update)
        update_env
        ;;
    cleanup)
        cleanup
        ;;
    claude-init)
        claude_init
        ;;
    claude-health)
        claude_health
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac