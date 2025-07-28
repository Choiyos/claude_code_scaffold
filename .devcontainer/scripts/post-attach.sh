#!/bin/bash
# Post-attach script for Claude Code + SuperClaude + MCP Development Environment
# This script runs every time a user attaches to the DevContainer terminal

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

# Welcome message
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║           🧠 Claude Code + SuperClaude + MCP Environment         ║"
echo "║                     Development Terminal Ready                   ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info "🚀 Initializing terminal session..."

# Check if this is the first terminal session
TERMINAL_SESSION_FILE="$HOME/.claude/logs/terminal-session.log"
if [ ! -f "$TERMINAL_SESSION_FILE" ]; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"): First terminal session" > "$TERMINAL_SESSION_FILE"
    FIRST_SESSION=true
else
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"): Terminal attached" >> "$TERMINAL_SESSION_FILE"
    FIRST_SESSION=false
fi

# Configure shell environment
log_info "⚙️ Configuring shell environment..."

# Ensure we're using zsh
if [ "$SHELL" != "/bin/zsh" ]; then
    export SHELL="/bin/zsh"
fi

# Load development shortcuts if they exist
if [ -f "$HOME/.claude/shortcuts/services.sh" ]; then
    source "$HOME/.claude/shortcuts/services.sh"
    log_success "Service shortcuts loaded"
fi

if [ -f "$HOME/.claude/shortcuts/projects.sh" ]; then
    source "$HOME/.claude/shortcuts/projects.sh"
    log_success "Project shortcuts loaded"
fi

# Load development environment variables
if [ -f "$HOME/.claude/config/development.env" ]; then
    set -a  # Automatically export all variables
    source "$HOME/.claude/config/development.env"
    set +a
    log_success "Development environment variables loaded"
fi

# Set up Claude-specific environment variables
export CLAUDE_SESSION_ID="$(date +%s)-$$"
export CLAUDE_WORKSPACE="/workspace"
export CLAUDE_CONFIG_DIR="$HOME/.claude"
export CLAUDE_LOG_LEVEL="${CLAUDE_LOG_LEVEL:-info}"

# Configure prompt if using zsh and powerlevel10k
if [ -n "$ZSH_VERSION" ] && [ -d "$HOME/.oh-my-zsh/custom/themes/powerlevel10k" ]; then
    # Check if p10k config exists, create default one if not
    if [ ! -f "$HOME/.p10k.zsh" ]; then
        log_info "🎨 Setting up Powerlevel10k theme..."
        
        # Create a minimal p10k configuration
        cat > "$HOME/.p10k.zsh" << 'EOF'
# Powerlevel10k configuration for Claude Development Environment
# Generated automatically - you can customize this later

# Temporarily change options.
'builtin' 'local' '-a' 'p10k_config_opts'
[[ ! -o 'aliases'         ]] || p10k_config_opts+=('aliases')
[[ ! -o 'sh_glob'         ]] || p10k_config_opts+=('sh_glob')
[[ ! -o 'no_brace_expand' ]] || p10k_config_opts+=('no_brace_expand')
'builtin' 'setopt' 'no_aliases' 'no_sh_glob' 'brace_expand'

() {
  emulate -L zsh -o extended_glob

  # Unset all configuration options.
  unset -m '(POWERLEVEL9K_*|DEFAULT_USER)~POWERLEVEL9K_GITSTATUS_DIR'

  # Left prompt segments
  typeset -g POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(
    context                 # user@hostname
    dir                     # current directory
    vcs                     # git status
    prompt_char             # prompt symbol
  )

  # Right prompt segments
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(
    status                  # exit code of the last command
    command_execution_time  # duration of the last command
    background_jobs         # presence of background jobs
    virtualenv              # python virtual environment
    nodeenv                 # node.js environment
    time                    # current time
  )

  # Basic colors
  typeset -g POWERLEVEL9K_MODE=nerdfont-complete
  typeset -g POWERLEVEL9K_ICON_PADDING=moderate

  # Context (user@hostname)
  typeset -g POWERLEVEL9K_CONTEXT_DEFAULT_FOREGROUND=180
  typeset -g POWERLEVEL9K_CONTEXT_DEFAULT_BACKGROUND=240
  typeset -g POWERLEVEL9K_CONTEXT_TEMPLATE='%n@%m'

  # Directory
  typeset -g POWERLEVEL9K_DIR_FOREGROUND=31
  typeset -g POWERLEVEL9K_SHORTEN_STRATEGY=truncate_to_unique
  typeset -g POWERLEVEL9K_SHORTEN_DELIMITER=
  typeset -g POWERLEVEL9K_DIR_SHORTENED_FOREGROUND=103
  typeset -g POWERLEVEL9K_DIR_ANCHOR_FOREGROUND=39
  typeset -g POWERLEVEL9K_DIR_ANCHOR_BOLD=true

  # Git status
  typeset -g POWERLEVEL9K_VCS_CLEAN_FOREGROUND=76
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_FOREGROUND=76
  typeset -g POWERLEVEL9K_VCS_MODIFIED_FOREGROUND=178

  # Status
  typeset -g POWERLEVEL9K_STATUS_EXTENDED_STATES=true
  typeset -g POWERLEVEL9K_STATUS_OK=false
  typeset -g POWERLEVEL9K_STATUS_ERROR_FOREGROUND=160
  typeset -g POWERLEVEL9K_STATUS_ERROR_BACKGROUND=52

  # Command execution time
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_THRESHOLD=3
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_PRECISION=0
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FOREGROUND=101

  # Time
  typeset -g POWERLEVEL9K_TIME_FOREGROUND=66
  typeset -g POWERLEVEL9K_TIME_FORMAT='%D{%H:%M:%S}'

  # Python virtual environment
  typeset -g POWERLEVEL9K_VIRTUALENV_FOREGROUND=37
  typeset -g POWERLEVEL9K_VIRTUALENV_SHOW_PYTHON_VERSION=false

  # Node.js environment
  typeset -g POWERLEVEL9K_NODEENV_FOREGROUND=70
  typeset -g POWERLEVEL9K_NODEENV_SHOW_NODE_VERSION=false

  # Prompt character
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OK_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=76
  typeset -g POWERLEVEL9K_PROMPT_CHAR_ERROR_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=196
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,FAILED}_VIINS_CONTENT_EXPANSION='❯'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,FAILED}_VICMD_CONTENT_EXPANSION='❮'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,FAILED}_VIVIS_CONTENT_EXPANSION='V'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,FAILED}_VIOWR_CONTENT_EXPANSION='▶'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OVERWRITE_STATE=true
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL=

  # Instant prompt
  typeset -g POWERLEVEL9K_INSTANT_PROMPT=verbose
  typeset -g POWERLEVEL9K_DISABLE_HOT_RELOAD=true
}

# Apply configuration options.
(( ${#p10k_config_opts} )) && setopt ${p10k_config_opts[@]}
'builtin' 'unset' 'p10k_config_opts'
EOF
        
        log_success "Powerlevel10k configuration created"
    fi
fi

# Set up development aliases
log_info "🔗 Setting up development aliases..."

# Create session-specific aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# Claude-specific aliases
alias claude-status='cat ~/.claude/config/environment.json | jq .'
alias claude-logs='tail -f ~/.claude/logs/*.log 2>/dev/null || echo "No log files found"'
alias claude-config='code ~/.claude/config/'
alias claude-env='source ~/.claude/config/development.env'

# Development shortcuts
alias dc='docker-compose'
alias dps='docker ps'
alias dlog='docker logs'
alias dexec='docker exec -it'

# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline --graph --decorate'
alias gd='git diff'

# Python shortcuts
alias py='python3'
alias pip='pip3'
alias venv='python3 -m venv'

# Node.js shortcuts
alias nr='npm run'
alias ni='npm install'
alias nid='npm install --save-dev'
alias ns='npm start'
alias nt='npm test'

log_success "Development aliases configured"

# Check system status
log_info "📊 Checking system status..."

# Quick system health check
DISK_USAGE=$(df /workspace 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
MEMORY_USAGE=$(free 2>/dev/null | awk 'NR==2{printf "%.0f", $3*100/$2}' || echo "0")

echo ""
echo "💻 System Status:"
echo "  - Workspace: ${DISK_USAGE}% disk usage"
echo "  - Memory: ${MEMORY_USAGE}% used"
echo "  - Shell: $SHELL"
echo "  - Terminal: $(basename "$TERM")"

# Check Docker connectivity
if docker info >/dev/null 2>&1; then
    CONTAINERS_RUNNING=$(docker ps --format "table {{.Names}}" | grep -v "NAMES" | wc -l)
    echo "  - Docker: ✅ ($CONTAINERS_RUNNING containers running)"
else
    echo "  - Docker: ❌ Not accessible"
fi

# Check database connectivity
if command -v psql >/dev/null 2>&1; then
    if PGPASSWORD=claude_password psql -h postgres -U claude_user -d claude_development -c "SELECT 1;" >/dev/null 2>&1; then
        echo "  - PostgreSQL: ✅ Connected"
    else
        echo "  - PostgreSQL: ⚠️ Not accessible"
    fi
fi

# Check Redis connectivity
if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h redis ping | grep -q "PONG" 2>/dev/null; then
        echo "  - Redis: ✅ Connected"
    else
        echo "  - Redis: ⚠️ Not accessible"
    fi
fi

# Set up development workspace
log_info "📁 Setting up workspace..."

# Ensure workspace directory structure
cd /workspace

# Create common development directories if they don't exist
mkdir -p {src,tests,docs,scripts,config,logs,tmp}

# Update last attach timestamp
if [ -f "$HOME/.claude/config/environment.json" ]; then
    if command -v jq >/dev/null 2>&1; then
        jq --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.last_attached = $timestamp' \
           "$HOME/.claude/config/environment.json" > "$HOME/.claude/config/environment.json.tmp" && \
           mv "$HOME/.claude/config/environment.json.tmp" "$HOME/.claude/config/environment.json"
    fi
fi

# Show helpful information
echo ""
log_info "🎯 Quick Start Commands:"
echo "  🔍 services-status     - Check all service status"
echo "  📊 ~/.claude/scripts/monitor-performance.sh - System performance"
echo "  ✅ ~/.claude/scripts/verify-services.sh - Verify all services"
echo "  📝 claude-logs         - View Claude environment logs"
echo "  ⚙️  claude-config       - Open Claude configuration"

# Show available development shortcuts
if [ -f "$HOME/.claude/shortcuts/services.sh" ] || [ -f "$HOME/.claude/shortcuts/projects.sh" ]; then
    echo ""
    log_info "🛠️  Development Shortcuts Available:"
    echo "  🐳 dc, dps, dlog       - Docker commands"
    echo "  🗄️  db-connect          - Connect to PostgreSQL"
    echo "  📊 prometheus-ui       - Open Prometheus UI"
    echo "  📈 grafana-ui          - Open Grafana dashboard"
    echo "  🚀 dev-start           - Start development server"
    echo "  🧪 test-run            - Run tests"
fi

# Check for project-specific configurations
if [ -f "package.json" ]; then
    echo ""
    log_info "📦 Node.js project detected"
    if [ -f "package-lock.json" ]; then
        echo "  - Run 'npm install' to install dependencies"
    fi
    if grep -q '"dev"' package.json; then
        echo "  - Run 'npm run dev' to start development server"
    fi
fi

if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
    echo ""
    log_info "🐍 Python project detected"
    if [ -f "requirements.txt" ]; then
        echo "  - Run 'pip install -r requirements.txt' to install dependencies"
    fi
    if [ -f "manage.py" ]; then
        echo "  - Django project - Run 'python manage.py runserver'"
    fi
fi

if [ -f "Dockerfile" ] || [ -f "docker-compose.yml" ]; then
    echo ""
    log_info "🐳 Docker configuration detected"
    echo "  - Run 'dc up -d' to start services"
    echo "  - Run 'dc ps' to check service status"
fi

# Set up session history
export HISTFILE="$HOME/.claude/logs/terminal-history-$(date +%Y%m%d).log"
export HISTSIZE=10000
export SAVEHIST=10000

# Git configuration check
if [ ! -f "$HOME/.gitconfig" ]; then
    log_warning "Git not configured. Run: git config --global user.name 'Your Name' && git config --global user.email 'your.email@example.com'"
fi

# Claude environment status
if [ -f "$HOME/.claude/config/environment.json" ]; then
    if command -v jq >/dev/null 2>&1; then
        CLAUDE_VERSION=$(jq -r '.version // "unknown"' "$HOME/.claude/config/environment.json")
        CLAUDE_INITIALIZED=$(jq -r '.initialized // false' "$HOME/.claude/config/environment.json")
        
        echo ""
        log_success "🧠 Claude Environment Ready (v$CLAUDE_VERSION)"
        if [ "$CLAUDE_INITIALIZED" = "true" ]; then
            echo "  - Status: ✅ Initialized and ready"
        else
            echo "  - Status: ⚠️ Needs initialization"
            echo "  - Run the post-create script to complete setup"
        fi
    fi
else
    log_warning "Claude environment not found - run post-create script"
fi

# Show welcome message for first session
if [ "$FIRST_SESSION" = "true" ]; then
    echo ""
    echo -e "${GREEN}🎉 Welcome to your Claude Code + SuperClaude + MCP Development Environment!${NC}"
    echo ""
    echo "This environment includes:"
    echo "  🧠 Claude Code integration"
    echo "  ⚡ SuperClaude framework"
    echo "  🔌 MCP (Model Context Protocol) support"
    echo "  🐳 Docker development stack"
    echo "  📊 Prometheus + Grafana monitoring"
    echo "  🗄️ PostgreSQL + Redis data layer"
    echo ""
    echo "For help and documentation, visit: https://docs.claude.ai/code"
fi

# Create session marker
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"): Session $CLAUDE_SESSION_ID ready" >> "$HOME/.claude/logs/sessions.log"

# Final status
echo ""
log_success "🚀 Terminal session initialized successfully!"
log_info "💡 Current directory: $(pwd)"
log_info "🕒 Session started at: $(date)"

echo ""