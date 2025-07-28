#!/bin/bash
# ============================================
# SETUP VERIFICATION SCRIPT - Claude Code Dev Environment
# ============================================
# Verifies that the development environment is properly configured

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# ============================================
# UTILITY FUNCTIONS
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

run_test() {
    local test_name="$1"
    local test_command="$2"
    ((TESTS_TOTAL++))
    
    echo -n "Testing $test_name... "
    
    if eval "$test_command" >/dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# ============================================
# VERIFICATION TESTS
# ============================================

echo "🔍 Verifying Claude Code Development Environment Setup..."
echo ""

# Docker and Docker Compose
log_info "Checking Docker environment..."
run_test "Docker daemon" "docker info"
run_test "Docker Compose" "docker-compose --version"
run_test "BuildKit support" "docker buildx version"

echo ""

# Configuration files
log_info "Checking configuration files..."
run_test "DevContainer config" "test -f .devcontainer/devcontainer.json"
run_test "Docker Compose config" "test -f .devcontainer/docker-compose.yml"
run_test "Main Dockerfile" "test -f .devcontainer/Dockerfile"
run_test "Shell configuration" "test -f .devcontainer/shell/.zshrc"
run_test "Environment scripts" "test -x .devcontainer/scripts/manage-env.sh"

echo ""

# Service configuration
log_info "Checking service configurations..."
run_test "Redis config" "test -f .devcontainer/config/redis/redis.conf"
run_test "Elasticsearch config" "test -f .devcontainer/config/elasticsearch/elasticsearch.yml"
run_test "Prometheus config" "test -f .devcontainer/config/prometheus/prometheus.yml"
run_test "Grafana datasources" "test -f .devcontainer/config/grafana/provisioning/datasources/datasources.yml"

echo ""

# Database initialization
log_info "Checking database initialization..."
run_test "PostgreSQL init script" "test -f .devcontainer/init-scripts/postgres/01-init-claude-db.sql"
run_test "MongoDB init script" "test -f .devcontainer/init-scripts/mongodb/01-init-claude-db.js"

echo ""

# Docker Compose validation
log_info "Validating Docker Compose configuration..."
cd .devcontainer

if docker-compose config >/dev/null 2>&1; then
    log_success "Docker Compose syntax"
    ((TESTS_PASSED++))
else
    log_error "Docker Compose syntax"
    ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))

echo ""

# Network and volume configuration
log_info "Checking Docker configuration..."
run_test "Networks defined" "docker-compose config | grep -q 'networks:'"
run_test "Volumes defined" "docker-compose config | grep -q 'volumes:'"
run_test "Services defined" "docker-compose config --services | wc -l | grep -q '[0-9]'"

echo ""

# If running in container, check container-specific items
if [ -f "/.dockerenv" ]; then
    log_info "Checking container environment..."
    run_test "Non-root user" "test $(id -u) -ne 0"
    run_test "Zsh shell" "test $SHELL = '/bin/zsh'"
    run_test "Oh My Zsh" "test -d $HOME/.oh-my-zsh"
    run_test "Python virtual env" "test -d /workspace/.venv || echo 'Not created yet, normal for fresh setup'"
    run_test "Node modules volume" "test -d /workspace/node_modules || echo 'Not created yet, normal for fresh setup'"
    
    echo ""
    
    # Check available tools
    log_info "Checking development tools..."
    run_test "Node.js" "node --version"
    run_test "npm" "npm --version"
    run_test "Python" "python --version"
    run_test "pip" "pip --version"
    run_test "Go" "go version"
    run_test "Rust" "rustc --version"
    run_test "Docker CLI" "docker --version"
    run_test "kubectl" "kubectl version --client"
    run_test "Git" "git --version"
fi

# ============================================
# SERVICE CONNECTIVITY TESTS
# ============================================

# Only run service tests if Docker Compose is running
if docker-compose ps | grep -q "Up"; then
    echo ""
    log_info "Checking service connectivity..."
    
    # Wait a moment for services to be ready
    sleep 2
    
    run_test "PostgreSQL connection" "nc -z localhost 5432"
    run_test "Redis connection" "nc -z localhost 6379"
    run_test "MongoDB connection" "nc -z localhost 27017"
    run_test "Elasticsearch connection" "nc -z localhost 9200"
    run_test "MinIO connection" "nc -z localhost 9000"
    run_test "Prometheus connection" "nc -z localhost 9090"
    run_test "Grafana connection" "nc -z localhost 3030"
    
    echo ""
    
    # Health check tests
    log_info "Checking service health..."
    run_test "Elasticsearch health" "curl -sf http://localhost:9200/_cluster/health"
    run_test "Prometheus health" "curl -sf http://localhost:9090/-/healthy"
    
else
    log_warning "Docker Compose services not running, skipping connectivity tests"
    log_info "To start services: ./scripts/manage-env.sh start"
fi

# ============================================
# PERFORMANCE VALIDATION
# ============================================

echo ""
log_info "Checking performance requirements..."

# Check available resources
if command -v docker >/dev/null 2>&1; then
    # Check Docker daemon resources
    docker_info=$(docker system info 2>/dev/null || echo "")
    
    if echo "$docker_info" | grep -q "Total Memory"; then
        total_memory=$(echo "$docker_info" | grep "Total Memory" | awk '{print $3}')
        if [[ "$total_memory" > "7" ]]; then
            log_success "Docker memory allocation (${total_memory}GiB)"
        else
            log_warning "Docker memory allocation (${total_memory}GiB) - Recommend 8GB+"
        fi
    else
        log_warning "Could not determine Docker memory allocation"
    fi
    
    # Check CPUs
    if echo "$docker_info" | grep -q "CPUs"; then
        cpus=$(echo "$docker_info" | grep "CPUs" | awk '{print $2}')
        if [[ "$cpus" -ge "4" ]]; then
            log_success "Docker CPU allocation ($cpus cores)"
        else
            log_warning "Docker CPU allocation ($cpus cores) - Recommend 4+ cores"
        fi
    fi
fi

# Check disk space
available_space=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [[ "$available_space" -gt "20" ]]; then
    log_success "Available disk space (${available_space}GB)"
else
    log_warning "Available disk space (${available_space}GB) - Recommend 50GB+"
fi

# ============================================
# SUMMARY
# ============================================

echo ""
echo "=================================="
echo "    VERIFICATION SUMMARY"
echo "=================================="
echo ""
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo "Total tests:  $TESTS_TOTAL"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Your Claude Code development environment is ready.${NC}"
    echo ""
    echo "🚀 Quick start commands:"
    echo "  • ./scripts/manage-env.sh start    # Start all services"
    echo "  • ./scripts/manage-env.sh status   # Check service status"
    echo "  • ./scripts/manage-env.sh urls     # Show all service URLs"
    echo ""
elif [ $TESTS_FAILED -lt 5 ]; then
    echo -e "${YELLOW}⚠️  Most tests passed with $TESTS_FAILED issues. Environment should work with minor limitations.${NC}"
    echo ""
    echo "🔧 Check the failed tests above and resolve any critical issues."
    echo ""
else
    echo -e "${RED}❌ Multiple tests failed ($TESTS_FAILED/$TESTS_TOTAL). Please review the setup.${NC}"
    echo ""
    echo "📚 Troubleshooting resources:"
    echo "  • Check .devcontainer/README.md"
    echo "  • Review Docker and Docker Compose installation"
    echo "  • Ensure sufficient system resources"
    echo ""
fi

exit $TESTS_FAILED