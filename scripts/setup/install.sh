#!/bin/bash
set -e

# Claude Environment CLI Installation Script
# Comprehensive setup for development teams

echo "🚀 Claude Environment CLI Installation"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
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

check_command() {
    if command -v "$1" &> /dev/null; then
        log_success "$1 is installed"
        return 0
    else
        log_error "$1 is not installed"
        return 1
    fi
}

# Check prerequisites
log_info "Checking prerequisites..."

MISSING_DEPS=0

if ! check_command python3; then
    log_error "Python 3.9+ is required"
    MISSING_DEPS=1
fi

if ! check_command pip; then
    log_error "pip is required"
    MISSING_DEPS=1
fi

if ! check_command git; then
    log_warning "git is recommended for version control features"
fi

if ! check_command docker; then
    log_warning "Docker is required for full functionality"
fi

if [[ $MISSING_DEPS -eq 1 ]]; then
    log_error "Please install missing dependencies before continuing"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
REQUIRED_VERSION="3.9"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    log_error "Python $REQUIRED_VERSION or higher is required. Found: $PYTHON_VERSION"
    exit 1
fi

log_success "Python version check passed: $PYTHON_VERSION"

# Create virtual environment (optional but recommended)
if [[ "${CLAUDE_ENV_GLOBAL:-}" != "true" ]]; then
    log_info "Creating virtual environment..."
    python3 -m venv ~/.claude-env-venv
    source ~/.claude-env-venv/bin/activate
    log_success "Virtual environment created and activated"
    
    # Add activation to shell profiles
    for profile in ~/.bashrc ~/.zshrc ~/.profile; do
        if [[ -f "$profile" ]] && ! grep -q "claude-env-venv" "$profile"; then
            echo "" >> "$profile"
            echo "# Claude Environment CLI" >> "$profile"
            echo "alias claude-env-activate='source ~/.claude-env-venv/bin/activate'" >> "$profile"
            log_info "Added activation alias to $profile"
        fi
    done
fi

# Install dependencies
log_info "Installing Python dependencies..."
pip install --upgrade pip

# Install from requirements.txt
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/requirements.txt" ]]; then
    pip install -r "$SCRIPT_DIR/requirements.txt"
    log_success "Dependencies installed from requirements.txt"
else
    log_warning "requirements.txt not found, installing core dependencies..."
    pip install rich>=13.0.0 PyYAML>=6.0 requests>=2.28.0 click>=8.0.0
fi

# Install the CLI tool
log_info "Installing Claude Environment CLI..."

# Make the main script executable
CLI_SCRIPT="$(dirname "$SCRIPT_DIR")/claude-env"
if [[ -f "$CLI_SCRIPT" ]]; then
    chmod +x "$CLI_SCRIPT"
    
    # Create symlink or copy to system path
    if [[ -w "/usr/local/bin" ]]; then
        ln -sf "$CLI_SCRIPT" /usr/local/bin/claude-env
        log_success "CLI installed to /usr/local/bin/claude-env"
    elif [[ -w "$HOME/.local/bin" ]]; then
        mkdir -p "$HOME/.local/bin"
        ln -sf "$CLI_SCRIPT" "$HOME/.local/bin/claude-env"
        log_success "CLI installed to $HOME/.local/bin/claude-env"
        
        # Add to PATH if not already there
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
            log_info "Added $HOME/.local/bin to PATH in ~/.bashrc"
        fi
    else
        log_warning "Cannot install to system path. You can run the CLI directly: $CLI_SCRIPT"
    fi
else
    log_error "CLI script not found at $CLI_SCRIPT"
    exit 1
fi

# Setup configuration directories
log_info "Setting up configuration directories..."

CONFIG_DIR="$HOME/.claude"
mkdir -p "$CONFIG_DIR"/{environments,teams,backups,logs}

# Create default configuration
if [[ ! -f "$CONFIG_DIR/config.yml" ]]; then
    cat > "$CONFIG_DIR/config.yml" << EOF
# Claude Environment CLI Configuration
version: "2.0.0"
default_environment: "development"
auto_sync: false
sync_interval: 300  # 5 minutes
backup_retention: 30  # days

# Logging configuration
logging:
  level: "INFO"
  file: "$CONFIG_DIR/logs/claude-env.log"
  max_size: "10MB"
  max_files: 5

# UI preferences
ui:
  color: true
  progress_bars: true
  interactive: true
  
# Integration settings
integrations:
  mcp_servers:
    auto_discovery: true
    health_check_interval: 60
  vscode:
    auto_configure: true
  docker:
    auto_detect: true
EOF
    log_success "Default configuration created at $CONFIG_DIR/config.yml"
fi

# Create environment templates
ENVS_DIR="$CONFIG_DIR/environments"
for env in development staging production; do
    if [[ ! -f "$ENVS_DIR/$env/config.yml" ]]; then
        mkdir -p "$ENVS_DIR/$env"
        cat > "$ENVS_DIR/$env/config.yml" << EOF
# $env environment configuration
environment: "$env"
created: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# MCP Server configuration
mcp_servers:
  context7:
    enabled: true
    auto_start: true
  sequential:
    enabled: true
    auto_start: true
  magic:
    enabled: $([ "$env" = "development" ] && echo "true" || echo "false")
    auto_start: false

# Development tools
tools:
  node_version: "20"
  python_version: "3.11"
  docker_compose: true

# Security settings
security:
  strict_mode: $([ "$env" = "production" ] && echo "true" || echo "false")
  auto_updates: $([ "$env" = "development" ] && echo "true" || echo "false")
EOF
        log_success "Environment template created: $env"
    fi
done

# Setup shell completion (if supported)
if command -v claude-env &> /dev/null; then
    log_info "Setting up shell completion..."
    
    # Bash completion
    if [[ -n "$BASH_VERSION" ]] && [[ -d "/etc/bash_completion.d" ]] && [[ -w "/etc/bash_completion.d" ]]; then
        claude-env --completion bash > /etc/bash_completion.d/claude-env 2>/dev/null || true
    elif [[ -n "$BASH_VERSION" ]] && [[ -d "$HOME/.bash_completion.d" ]]; then
        mkdir -p "$HOME/.bash_completion.d"
        claude-env --completion bash > "$HOME/.bash_completion.d/claude-env" 2>/dev/null || true
    fi
    
    # Zsh completion
    if [[ -n "$ZSH_VERSION" ]] && [[ -d "$HOME/.oh-my-zsh/completions" ]]; then
        claude-env --completion zsh > "$HOME/.oh-my-zsh/completions/_claude-env" 2>/dev/null || true
    fi
fi

# Test installation
log_info "Testing installation..."
if claude-env version &> /dev/null; then
    log_success "Installation successful! 🎉"
    echo ""
    echo "🚀 Quick Start:"
    echo "  claude-env                    # Interactive mode"
    echo "  claude-env status             # Check environment status"
    echo "  claude-env sync --environment development"
    echo ""
    echo "📖 Documentation:"
    echo "  claude-env --help            # Show all commands"
    echo "  claude-env interactive       # Full interactive mode"
    echo ""
else
    log_error "Installation test failed"
    exit 1
fi

# Optional: Run initial setup
if [[ "${CLAUDE_ENV_AUTO_SETUP:-}" == "true" ]] || [[ "$1" == "--auto-setup" ]]; then
    log_info "Running initial environment setup..."
    claude-env sync --environment development --dry-run
    log_success "Initial setup completed"
fi

log_success "Claude Environment CLI is ready! 🚀"