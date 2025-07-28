#!/bin/bash
# Post-start script for Claude Code + SuperClaude + MCP Development Environment
# This script runs every time the container starts up

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Start service initialization
log_info "🔧 Starting Claude Code + SuperClaude + MCP Development Environment services..."

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local host=$2
    local port=$3
    local max_attempts=${4:-30}
    local attempt=1
    
    log_info "⏳ Waiting for $service_name to be ready at $host:$port..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log_success "$service_name is ready!"
            return 0
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_warning "$service_name is not ready after $max_attempts attempts"
            return 1
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
}

# Function to check service health
check_service_health() {
    local service_name=$1
    local health_url=$2
    
    if command -v curl &> /dev/null; then
        if curl -f -s "$health_url" > /dev/null 2>&1; then
            log_success "$service_name health check passed"
            return 0
        else
            log_warning "$service_name health check failed"
            return 1
        fi
    else
        log_warning "curl not available, skipping health check for $service_name"
        return 0
    fi
}

# Start system monitoring
log_info "📊 Starting system monitoring..."

# Initialize system metrics collection
if command -v htop &> /dev/null; then
    # Create htop config if it doesn't exist
    mkdir -p ~/.config/htop
    if [ ! -f ~/.config/htop/htoprc ]; then
        cat > ~/.config/htop/htoprc << 'EOF'
# Configuration for htop
fields=0 48 17 18 38 39 40 2 46 47 49 1
sort_key=46
sort_direction=1
tree_sort_key=0
tree_sort_direction=1
hide_kernel_threads=1
hide_userland_threads=0
shadow_other_users=0
show_thread_names=0
show_program_path=1
highlight_base_name=0
highlight_megabytes=1
highlight_threads=1
highlight_changes=0
highlight_changes_delay_secs=5
find_comm_in_cmdline=1
strip_exe_from_cmdline=1
show_merged_command=0
tree_view=0
tree_view_always_by_pid=0
header_margin=1
detailed_cpu_time=0
cpu_count_from_one=0
show_cpu_usage=1
show_cpu_frequency=0
show_cpu_temperature=0
degree_fahrenheit=0
update_process_names=0
account_guest_in_cpu_meter=0
color_scheme=0
enable_mouse=1
delay=15
left_meters=LeftCPUs Memory Swap
left_meter_modes=1 1 1
right_meters=RightCPUs Tasks LoadAverage Uptime
right_meter_modes=1 2 2 2
hide_function_bar=0
EOF
    fi
fi

# Check and wait for dependent services
log_info "🔍 Checking service dependencies..."

# Wait for PostgreSQL
if docker-compose ps postgres | grep -q "Up"; then
    wait_for_service "PostgreSQL" "postgres" "5432" 30
    
    # Test database connection
    if command -v psql &> /dev/null; then
        if PGPASSWORD=claude_password psql -h postgres -U claude_user -d claude_development -c "SELECT 1;" > /dev/null 2>&1; then
            log_success "PostgreSQL connection test passed"
        else
            log_warning "PostgreSQL connection test failed"
        fi
    fi
fi

# Wait for Redis
if docker-compose ps redis | grep -q "Up"; then
    wait_for_service "Redis" "redis" "6379" 30
    
    # Test Redis connection
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h redis ping | grep -q "PONG"; then
            log_success "Redis connection test passed"
        else
            log_warning "Redis connection test failed"
        fi
    fi
fi

# Wait for Prometheus
if docker-compose ps prometheus | grep -q "Up"; then
    wait_for_service "Prometheus" "prometheus" "9090" 30
    check_service_health "Prometheus" "http://prometheus:9090/-/ready"
fi

# Wait for Grafana
if docker-compose ps grafana | grep -q "Up"; then
    wait_for_service "Grafana" "grafana" "3000" 30
    check_service_health "Grafana" "http://grafana:3000/api/health"
fi

# Initialize Claude environment
log_info "🧠 Initializing Claude environment..."

# Ensure Claude directories exist
mkdir -p ~/.claude/{config,environments,mcp-servers,logs,cache,templates}

# Update environment status
if [ -f ~/.claude/config/environment.json ]; then
    # Update last started timestamp
    if command -v jq &> /dev/null; then
        jq --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.last_started = $timestamp' ~/.claude/config/environment.json > ~/.claude/config/environment.json.tmp && mv ~/.claude/config/environment.json.tmp ~/.claude/config/environment.json
    else
        # Fallback without jq
        sed -i "s/\"last_started\": \".*\"/\"last_started\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"/g" ~/.claude/config/environment.json
    fi
    log_success "Claude environment status updated"
else
    log_warning "Claude environment configuration not found"
fi

# Start background services
log_info "🚀 Starting background services..."

# Start SSH agent if not running
if [ -z "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)" > /dev/null
    log_success "SSH agent started"
fi

# Initialize Git credentials helper if configured
if git config --global credential.helper > /dev/null 2>&1; then
    log_info "Git credentials helper is configured"
fi

# Start development file watcher (if available)
if command -v watchman &> /dev/null; then
    watchman --foreground --logfile=/dev/null &
    log_success "Watchman file watcher started"
fi

# Setup development environment variables
log_info "⚙️ Setting up development environment variables..."

# Create or update environment file
cat > ~/.claude/config/development.env << EOF
# Claude Development Environment Variables
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Application settings
NODE_ENV=development
PYTHONPATH=/workspace
CLAUDE_ENV_MODE=development
CLAUDE_CONFIG_DIR=$HOME/.claude

# Database connections
DATABASE_URL=postgresql://claude_user:claude_password@postgres:5432/claude_development
REDIS_URL=redis://redis:6379/0

# API service URLs
API_GATEWAY_URL=http://localhost:3000
ENVIRONMENT_CONTROLLER_URL=http://localhost:3001
MCP_ORCHESTRATOR_URL=http://localhost:3002
CONFIGURATION_MANAGER_URL=http://localhost:3003

# Monitoring URLs
PROMETHEUS_URL=http://prometheus:9090
GRAFANA_URL=http://grafana:3000

# Development tools
DOCKER_HOST=unix:///var/run/docker.sock
COMPOSE_PROJECT_NAME=claude-dev-env

# Feature flags
CLAUDE_DEBUG_MODE=false
CLAUDE_TELEMETRY_ENABLED=false
CLAUDE_AUTO_SYNC=true

# Performance settings
CLAUDE_MAX_WORKERS=4
CLAUDE_CACHE_SIZE=100MB
CLAUDE_LOG_LEVEL=info
EOF

log_success "Development environment variables configured"

# Setup development shortcuts and aliases
log_info "🔗 Setting up development shortcuts..."

# Create development shortcuts directory
mkdir -p ~/.claude/shortcuts

# Create service management shortcuts
cat > ~/.claude/shortcuts/services.sh << 'EOF'
#!/bin/bash
# Service management shortcuts

# Quick service status
alias services-status='docker-compose ps'
alias services-logs='docker-compose logs -f'
alias services-restart='docker-compose restart'
alias services-stop='docker-compose stop'
alias services-start='docker-compose start'

# Database shortcuts
alias db-connect='PGPASSWORD=claude_password psql -h postgres -U claude_user -d claude_development'
alias db-reset='docker-compose stop postgres && docker-compose rm -f postgres && docker-compose up -d postgres'
alias redis-cli='redis-cli -h redis'
alias redis-reset='docker-compose stop redis && docker-compose rm -f redis && docker-compose up -d redis'

# Monitoring shortcuts
alias prometheus-ui='echo "Prometheus: http://localhost:9090"'
alias grafana-ui='echo "Grafana: http://localhost:3001 (admin/admin)"'
alias metrics='curl -s http://prometheus:9090/api/v1/query?query=up'

# Claude environment shortcuts
alias claude-status='cat ~/.claude/config/environment.json | jq .'
alias claude-logs='tail -f ~/.claude/logs/*.log'
alias claude-config='code ~/.claude/config/'
EOF

# Make shortcuts executable
chmod +x ~/.claude/shortcuts/services.sh

# Create project management shortcuts
cat > ~/.claude/shortcuts/projects.sh << 'EOF'
#!/bin/bash
# Project management shortcuts

# Quick project creation
create-react-project() {
    local name=${1:-"my-react-app"}
    npx create-react-app "$name" --template typescript
    cd "$name"
    code .
}

create-next-project() {
    local name=${1:-"my-next-app"}
    npx create-next-app@latest "$name" --typescript --tailwind --eslint --app
    cd "$name"
    code .
}

create-python-project() {
    local name=${1:-"my-python-app"}
    mkdir "$name"
    cd "$name"
    python -m venv venv
    source venv/bin/activate
    echo "# $name" > README.md
    echo "__version__ = '0.1.0'" > __init__.py
    code .
}

# Development server shortcuts
dev-start() {
    if [ -f "package.json" ]; then
        npm run dev
    elif [ -f "manage.py" ]; then
        python manage.py runserver
    elif [ -f "main.py" ]; then
        python main.py
    else
        echo "No development server configuration found"
    fi
}

# Testing shortcuts
test-run() {
    if [ -f "package.json" ]; then
        npm test
    elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
        pytest
    elif [ -f "manage.py" ]; then
        python manage.py test
    else
        echo "No test configuration found"
    fi
}
EOF

chmod +x ~/.claude/shortcuts/projects.sh

log_success "Development shortcuts configured"

# Check system resources and performance
log_info "📈 Checking system resources..."

# Display system information
echo ""
echo "💻 System Information:"
echo "  - CPU Cores: $(nproc)"
echo "  - Memory: $(free -h | awk '/^Mem/ {print $2}') total, $(free -h | awk '/^Mem/ {print $7}') available"
echo "  - Disk Space: $(df -h /workspace | awk 'NR==2 {print $4}') available"
echo "  - Docker: $(docker --version 2>/dev/null || echo 'Not available')"

# Check for potential issues
echo ""
echo "🔍 System Health Check:"

# Check disk space
DISK_USAGE=$(df /workspace | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    log_warning "Disk usage is high: ${DISK_USAGE}%"
else
    log_success "Disk usage is normal: ${DISK_USAGE}%"
fi

# Check memory usage
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ "$MEMORY_USAGE" -gt 80 ]; then
    log_warning "Memory usage is high: ${MEMORY_USAGE}%"
else
    log_success "Memory usage is normal: ${MEMORY_USAGE}%"
fi

# Check Docker daemon
if docker info > /dev/null 2>&1; then
    log_success "Docker daemon is running"
else
    log_warning "Docker daemon is not accessible"
fi

# Initialize Claude CLI if available
if command -v claude-env &> /dev/null; then
    log_info "🔧 Initializing Claude CLI..."
    claude-env init --quiet || log_warning "Claude CLI initialization failed"
fi

# Setup development database if needed
log_info "🗄️ Setting up development database..."

if docker-compose ps postgres | grep -q "Up"; then
    # Wait a bit more for PostgreSQL to be fully ready
    sleep 5
    
    # Check if database schema exists
    if PGPASSWORD=claude_password psql -h postgres -U claude_user -d claude_development -c "\dt" > /dev/null 2>&1; then
        TABLE_COUNT=$(PGPASSWORD=claude_password psql -h postgres -U claude_user -d claude_development -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
        if [ "$TABLE_COUNT" -eq 0 ]; then
            log_info "Setting up initial database schema..."
            # Run initial schema setup if needed
            if [ -f ".devcontainer/scripts/init-schema.sql" ]; then
                PGPASSWORD=claude_password psql -h postgres -U claude_user -d claude_development -f .devcontainer/scripts/init-schema.sql
                log_success "Database schema initialized"
            fi
        else
            log_success "Database schema already exists ($TABLE_COUNT tables)"
        fi
    fi
fi

# Create performance monitoring script
log_info "📊 Setting up performance monitoring..."

cat > ~/.claude/scripts/monitor-performance.sh << 'EOF'
#!/bin/bash
# Performance monitoring script

echo "🖥️ System Performance Monitor"
echo "==============================="
echo "Date: $(date)"
echo ""

# CPU Information
echo "💾 CPU Usage:"
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print "  CPU Usage: " 100 - $1 "%"}'
echo "  Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo ""

# Memory Information
echo "🧠 Memory Usage:"
free -h | awk '/^Mem/ {printf "  Total: %s, Used: %s, Free: %s, Usage: %.1f%%\n", $2, $3, $4, ($3/$2)*100}'
echo ""

# Disk Information
echo "💿 Disk Usage:"
df -h /workspace | awk 'NR==2 {printf "  Workspace: %s used of %s (%.1f%%)\n", $3, $2, ($3/$2)*100}'
echo ""

# Docker Information
if docker info > /dev/null 2>&1; then
    echo "🐳 Docker Status:"
    echo "  Containers Running: $(docker ps -q | wc -l)"
    echo "  Images: $(docker images -q | wc -l)"
    echo "  System Disk Usage: $(docker system df --format 'table {{.Type}}\t{{.Size}}' | tail -n +2 | awk '{sum+=$2} END {print sum "B"}' 2>/dev/null || echo 'N/A')"
fi
echo ""

# Service Status
echo "🚀 Service Status:"
if command -v docker-compose &> /dev/null; then
    docker-compose ps --format "table {{.Name}}\t{{.Status}}" | grep -v "^NAME"
fi
EOF

chmod +x ~/.claude/scripts/monitor-performance.sh
mkdir -p ~/.claude/scripts

log_success "Performance monitoring configured"

# Final service verification
log_info "✅ Final service verification..."

# Create service verification script
cat > ~/.claude/scripts/verify-services.sh << 'EOF'
#!/bin/bash
# Service verification script

echo "🔍 Service Verification Report"
echo "=============================="
echo "Generated: $(date)"
echo ""

# Check Docker Compose services
if command -v docker-compose &> /dev/null; then
    echo "📦 Docker Compose Services:"
    docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
fi

# Check network connectivity
echo "🌐 Network Connectivity:"
services=("postgres:5432" "redis:6379" "prometheus:9090" "grafana:3000")
for service in "${services[@]}"; do
    IFS=':' read -r host port <<< "$service"
    if nc -z "$host" "$port" 2>/dev/null; then
        echo "  ✅ $service - OK"
    else
        echo "  ❌ $service - FAILED"
    fi
done
echo ""

# Check API endpoints
echo "🔗 API Endpoints:"
if command -v curl &> /dev/null; then
    endpoints=("http://prometheus:9090/-/ready" "http://grafana:3000/api/health")
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "$endpoint" > /dev/null 2>&1; then
            echo "  ✅ $endpoint - OK"
        else
            echo "  ❌ $endpoint - FAILED"
        fi
    done
fi
echo ""

# Check Claude environment
echo "🧠 Claude Environment:"
if [ -f ~/.claude/config/environment.json ]; then
    echo "  ✅ Configuration file exists"
    if command -v jq &> /dev/null; then
        version=$(jq -r '.version' ~/.claude/config/environment.json)
        echo "  📋 Version: $version"
    fi
else
    echo "  ❌ Configuration file missing"
fi
EOF

chmod +x ~/.claude/scripts/verify-services.sh

# Run service verification
~/.claude/scripts/verify-services.sh

# Show completion status
echo ""
log_success "🎉 Claude Code + SuperClaude + MCP Development Environment services started successfully!"
log_info "💡 Run 'cat ~/.claude/welcome.txt' to see usage information"
log_info "🔧 Run '~/.claude/scripts/verify-services.sh' to verify all services"
log_info "📊 Run '~/.claude/scripts/monitor-performance.sh' to check system performance"

# Create startup timestamp
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > ~/.claude/logs/last-startup.log

echo ""
exit 0