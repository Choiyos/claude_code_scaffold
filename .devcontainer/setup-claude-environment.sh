#!/bin/bash

echo "🚀 Claude Code 개발환경 설정을 시작합니다..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
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

# Claude Code CLI 설치
install_claude_code() {
    log_info "Claude Code CLI 설치 중..."
    
    # Volta 환경변수 설정 (즉시 적용)
    export VOLTA_HOME="$HOME/.volta"
    export PATH="$VOLTA_HOME/bin:$PATH"
    source ~/.volta/load.sh 2>/dev/null || true
    
    # Node.js가 설치되어 있는지 확인
    if ! command -v node &> /dev/null; then
        log_error "Node.js가 설치되지 않았습니다."
        log_info "Volta 환경 확인: $VOLTA_HOME"
        return 1
    fi
    
    log_info "Node.js 버전: $(node --version)"
    log_info "npm 버전: $(npm --version)"
    
    # npm 글로벌 prefix를 사용자 디렉토리로 변경 (권한 문제 해결)
    npm config set prefix ~/.npm-global
    export PATH=~/.npm-global/bin:$PATH
    echo "export PATH=~/.npm-global/bin:\$PATH" >> ~/.zshrc
    echo "export PATH=~/.npm-global/bin:\$PATH" >> ~/.bashrc
    log_info "npm 글로벌 prefix를 사용자 디렉토리로 설정: ~/.npm-global"
    
    # Claude CLI가 이미 설치되어 있는지 확인
    if command -v claude &> /dev/null; then
        log_success "Claude CLI가 이미 설치되어 있습니다: $(claude --version)"
        return 0
    fi
    
    # Claude CLI 설치
    log_info "npm으로 Claude Code CLI 설치 중..."
    if npm install -g @anthropic-ai/claude-code; then
        log_success "Claude Code CLI 설치 완료"
        
        # PATH 새로 로드
        export PATH=~/.npm-global/bin:$PATH
        
        # 설치 확인
        if command -v claude &> /dev/null; then
            log_success "Claude CLI 설치 확인됨: $(claude --version)"
        else
            log_warning "Claude CLI가 PATH에서 찾을 수 없습니다. 터미널을 재시작해주세요."
        fi
    else
        log_error "Claude Code CLI 설치 실패"
        log_info "수동 설치: npm install -g @anthropic-ai/claude-code"
        return 1
    fi
}

# Claude CLI 자동 인증 (향후 수동 인증용)
setup_claude_auth_manual() {
    log_info "Claude CLI 인증 안내..."
    
    # Claude CLI 인증 상태 확인 (MCP 명령어로 간접 확인)
    local mcp_output
    if mcp_output=$(timeout 10 claude mcp list 2>&1); then
        log_success "Claude CLI가 이미 인증되어 있습니다."
        return 0
    fi
    
    log_info "🔐 Claude CLI 인증이 필요합니다."
    log_info "💡 DevContainer 시작 후 터미널에서 다음 명령어를 실행하세요:"
    log_info "    claude"
    log_info "    → 대화형 터미널이 시작되면서 브라우저로 인증 진행"
    log_info ""
    log_info "브라우저가 열리면 Claude 계정으로 로그인하고 인증을 완료하세요."
    
    return 1  # 수동 인증 필요함을 알림
}

# Claude CLI 환경변수 기반 인증 시도
setup_claude_auth() {
    log_info "Claude CLI 인증 설정 중..."
    
    # Claude CLI 인증 상태 확인 (MCP 명령어로 간접 확인)
    local mcp_output
    if mcp_output=$(timeout 10 claude mcp list 2>&1); then
        log_success "Claude CLI가 이미 인증되어 있습니다."
        return 0
    fi
    
    # CLAUDE_CODE_OAUTH_TOKEN 환경변수 확인 (우선순위)
    if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
        log_info "CLAUDE_CODE_OAUTH_TOKEN 환경변수를 사용하여 인증 시도 중..."
        export CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN"
        if mcp_output=$(timeout 10 claude mcp list 2>&1); then
            log_success "✅ OAuth 토큰을 통한 Claude CLI 인증 완료!"
            return 0
        fi
    fi
    
    # ANTHROPIC_API_KEY 환경변수 확인 (fallback)
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        log_info "ANTHROPIC_API_KEY 환경변수를 사용하여 인증 시도 중..."
        export ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
        if mcp_output=$(timeout 10 claude mcp list 2>&1); then
            log_success "✅ API 키를 통한 Claude CLI 인증 완료!"
            return 0
        fi
    fi
    
    log_info "🔐 Claude CLI 수동 인증이 필요합니다."
    log_info "💡 다음 중 하나의 방법을 사용하세요:"
    log_info ""
    log_info "  방법 1 - OAuth 토큰 (추천):"
    log_info "    claude setup-token"
    log_info "    → 받은 토큰을 CLAUDE_CODE_OAUTH_TOKEN 환경변수로 설정"
    log_info ""
    log_info "  방법 2 - 대화형 인증:"
    log_info "    claude"
    log_info "    → 대화형 터미널이 시작되면서 브라우저로 인증 진행"
    log_info ""
    log_info "OAuth 토큰 방식이 DevContainer 환경에서 더 안정적입니다."
    
    return 1  # 수동 인증 필요함을 알림
}

# MCP 서버 설치 (Claude CLI installer 사용)
install_mcp_servers() {
    log_info "MCP 서버들 설치 중 (Claude CLI installer 사용)..."
    
    # Claude CLI가 설치되어 있는지 확인
    if ! command -v claude &> /dev/null; then
        log_error "Claude CLI를 찾을 수 없습니다. 먼저 Claude CLI를 설치해야 합니다."
        return 1
    fi
    
    # Claude CLI 인증 확인 및 자동 설정
    local auth_success=false
    local mcp_output
    if mcp_output=$(timeout 10 claude mcp list 2>&1); then
        auth_success=true
        log_success "Claude CLI가 이미 인증되어 있습니다."
    else
        log_warning "Claude CLI가 인증되지 않았습니다."
        if setup_claude_auth; then
            auth_success=true
        else
            log_warning "Claude CLI 인증 실패. npm으로 MCP 패키지만 설치합니다."
        fi
    fi
    
    # MCP 서버들 설치 (claude mcp add 사용)
    local servers=(
        "@modelcontextprotocol/server-sequential-thinking"  
        "@upstash/context7-mcp"
        "@21st-dev/magic"
        "@playwright/mcp"
    )
    
    for server in "${servers[@]}"; do
        if [ "$auth_success" = true ]; then
            log_info "Claude MCP 추가 중: $server"
            if claude mcp add "$server"; then
                log_success "$server MCP 추가 완료"
            else
                log_warning "$server MCP 추가 실패 - npm으로 패키지 설치"
                log_info "npm으로 패키지 설치: $server"
                npm install -g "$server" 2>/dev/null || true
            fi
        else
            # 인증 실패 시 npm으로만 설치
            log_info "npm으로 패키지 설치: $server"
            npm install -g "$server" 2>/dev/null || true
        fi
    done
    
    # MCP 서버 설치 확인
    log_info "설치된 MCP 서버 확인 중..."
    if claude mcp list &>/dev/null; then
        log_success "Claude MCP 서버 목록:"
        claude mcp list
    else
        log_warning "Claude MCP 서버 목록을 가져올 수 없습니다."
    fi
}

# Claude Code 환경 설정 (Claude CLI 자체 관리)
setup_claude_config() {
    log_info "Claude Code 환경 설정 중 (Claude CLI 자체 관리)..."
    
    # Claude CLI가 자체적으로 ~/.claude 디렉토리 생성 및 관리
    # MCP 서버들이 설치되면 자동으로 .claude.json 파일이 생성됨
    
    # 기본 Claude 설정 확인
    if command -v claude &> /dev/null; then
        log_success "Claude CLI 사용 가능: $(claude --version)"
        
        # Claude 설정 디렉토리 확인
        if [ -d ~/.claude ]; then
            log_success "Claude 설정 디렉토리 확인: ~/.claude"
            
            # 설정 파일들 확인
            if [ -f ~/.claude/.claude.json ]; then
                log_success "Claude 설정 파일 확인: ~/.claude/.claude.json"
            else
                log_info "Claude 설정 파일이 아직 생성되지 않았습니다. MCP 서버 설치 후 자동 생성됩니다."
            fi
        else
            log_info "Claude 설정 디렉토리가 아직 생성되지 않았습니다. 첫 실행 시 자동 생성됩니다."
        fi
        
        log_info "Claude CLI가 설정을 자동으로 관리합니다."
        log_info "MCP 서버 추가/제거는 'claude mcp install/uninstall' 명령어를 사용하세요."
    else
        log_error "Claude CLI를 찾을 수 없습니다."
        return 1
    fi
}

# Python 환경 설정
setup_python_env() {
    log_info "Python 개발환경 설정 중..."
    
    # PATH에 ~/.local/bin 추가 (Python 패키지용)
    export PATH="$HOME/.local/bin:$PATH"
    
    # Python 3.11이 설치되어 있는지 확인
    if ! command -v python3 &> /dev/null; then
        log_error "Python3가 설치되지 않았습니다. DevContainer features에서 설치될 예정입니다."
        return 1
    fi
    
    # 기본 Python 패키지 설치 (경고 없이)
    python3 -m pip install --user --upgrade pip setuptools wheel --no-warn-script-location
    log_success "Python 기본 패키지 설치 완료"
}

# Git 설정
setup_git_config() {
    log_info "Git 기본 설정 중..."
    
    # Git 기본 설정
    git config --global init.defaultBranch main
    git config --global pull.rebase false
    git config --global core.autocrlf input
    
    # Git 별칭 설정
    git config --global alias.st status
    git config --global alias.co checkout
    git config --global alias.br branch
    git config --global alias.ci commit
    git config --global alias.unstage 'reset HEAD --'
    git config --global alias.last 'log -1 HEAD'
    git config --global alias.graph 'log --oneline --graph --decorate --all'
    
    # Git Hooks 설치 (팀 설정 동기화용)
    if [ -f "/workspace/scripts/install-git-hooks.sh" ]; then
        cd /workspace
        bash scripts/install-git-hooks.sh
        log_success "Git Hooks 설치 완료 (팀 설정 자동 동기화 활성화)"
    fi
    
    log_success "Git 설정 완료"
}

# Docker Compose 서비스 시작
start_services() {
    log_info "인프라 서비스 시작 중..."
    
    # 현재 작업 디렉토리 확인 및 조정
    local workspace_dir
    if [ -d "/workspaces/claude_code_scaffold" ]; then
        workspace_dir="/workspaces/claude_code_scaffold"
    elif [ -d "/workspace" ]; then
        workspace_dir="/workspace"
    else
        workspace_dir="$(pwd)"
    fi
    
    if [ -f "$workspace_dir/docker-compose.yml" ]; then
        cd "$workspace_dir"
        log_info "Docker Compose 파일 위치: $workspace_dir/docker-compose.yml"
        
        # PostgreSQL, Redis, Prometheus, Grafana만 시작 (실패하는 TypeScript 서비스 제외)
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d postgres redis prometheus grafana
        elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
            docker compose up -d postgres redis prometheus grafana
        else
            log_warning "Docker Compose를 찾을 수 없습니다. 서비스를 수동으로 시작해야 합니다."
            return 1
        fi
        
        if [ $? -eq 0 ]; then
            log_success "인프라 서비스 시작 완료"
            log_info "서비스 접속 정보:"
            log_info "  - Grafana: http://localhost:3010 (admin/admin)"
            log_info "  - Prometheus: http://localhost:9090"
            log_info "  - PostgreSQL: localhost:5432 (claude_env/dev_password_change_in_production)"
            log_info "  - Redis: localhost:6379"
        else
            log_warning "일부 서비스 시작에 실패했을 수 있습니다."
            log_info "서비스 상태 확인: docker-compose ps"
        fi
    else
        log_warning "docker-compose.yml 파일을 찾을 수 없습니다: $workspace_dir/docker-compose.yml"
        log_info "가능한 위치들을 확인합니다:"
        find /workspaces -name "docker-compose.yml" 2>/dev/null || true
        find /workspace -name "docker-compose.yml" 2>/dev/null || true
    fi
}

# zsh 설정 개선
setup_zsh_config() {
    log_info "Zsh 설정 개선 중..."
    
    # .zshrc에 유용한 설정 추가
    cat >> ~/.zshrc << 'EOF'

# Claude Code 개발환경 설정
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
export PYTHONPATH="/workspace:$PYTHONPATH"

# Volta 환경변수 설정
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"


# 유용한 별칭
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# Git 관련 별칭
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gd='git diff'
alias gb='git branch'
alias gco='git checkout'

# Docker 관련 별칭
alias dps='docker ps'
alias dpa='docker ps -a'
alias di='docker images'
alias dc='docker-compose'
alias dcup='docker-compose up -d'
alias dcdown='docker-compose down'
alias dclogs='docker-compose logs -f'

# 개발 관련 별칭
alias python='python3'
alias pip='pip3'

# Claude CLI 관련 설정
if command -v claude &> /dev/null; then
    # Claude CLI 자동완성 (사용 가능한 경우)
    # eval "$(claude completion zsh)"
    echo "🤖 Claude CLI 사용 가능"
fi

# Claude Squad 관련 설정
if command -v claude-squad &> /dev/null; then
    alias cs='claude-squad'
    echo "🤖 Claude Squad 사용 가능 (cs 별칭)"
fi

# SuperClaude Framework 관련 설정
if python3 -c "import SuperClaude" 2>/dev/null; then
    echo "🚀 SuperClaude Framework 사용 가능"
    # SuperClaude 별칭 추가
    alias sc='python3 -m SuperClaude'
    
    # PATH에 user site-packages 추가 (pip --user 설치용)
    export PATH="$HOME/.local/bin:$PATH"
fi

EOF
    
    log_success "Zsh 설정 완료"
}

# 환경 검증
verify_environment() {
    log_info "환경 설정 검증 중..."
    
    # Node.js 버전 확인
    if command -v node &> /dev/null; then
        local node_version=$(node --version 2>/dev/null)
        if [ -n "$node_version" ]; then
            log_success "Node.js $node_version 설치 확인"
        else
            log_error "Node.js 명령어는 있지만 버전을 가져올 수 없습니다."
        fi
    else
        log_error "Node.js가 설치되지 않았습니다."
    fi
    
    # Python 버전 확인
    if command -v python3 &> /dev/null; then
        log_success "Python $(python3 --version) 설치 확인"
    else
        log_error "Python이 설치되지 않았습니다."
    fi
    
    # Claude CLI 확인
    if command -v claude &> /dev/null; then
        log_success "Claude CLI 설치 확인: $(claude --version)"
        
        # MCP 서버 목록 확인
        if claude mcp list &>/dev/null; then
            log_success "MCP 서버 목록:"
            claude mcp list
        else
            log_info "MCP 서버가 아직 설치되지 않았습니다."
        fi
    else
        log_warning "Claude CLI를 찾을 수 없습니다."
    fi
    
    # Claude Squad 확인
    if command -v claude-squad &> /dev/null; then
        log_success "Claude Squad 설치 확인: $(claude-squad --version 2>/dev/null || echo 'version check failed')"
        if command -v cs &> /dev/null; then
            log_success "cs 별칭 확인됨"
        else
            log_info "cs 별칭이 설정되지 않았습니다."
        fi
    else
        log_warning "Claude Squad를 찾을 수 없습니다."
    fi
    
    # SuperClaude Framework 확인
    if command -v uv &> /dev/null; then
        log_success "uv 패키지 관리자 확인됨: $(uv --version 2>/dev/null || echo 'version check failed')"
    else
        log_warning "uv 패키지 관리자를 찾을 수 없습니다."
    fi
    
    # SuperClaude 설치 확인 (python import 테스트)
    if python3 -c "import SuperClaude; print('SuperClaude Framework 설치 확인됨')" 2>/dev/null; then
        log_success "SuperClaude Framework 설치 확인됨"
        
        # SuperClaude 버전 확인 시도
        local sc_version=$(python3 -c "import SuperClaude; print(SuperClaude.__version__)" 2>/dev/null || echo "version unknown")
        log_info "SuperClaude Framework 버전: $sc_version"
    else
        log_info "SuperClaude Framework가 아직 설치되지 않았습니다."
    fi
    
    # Claude 설정 디렉토리 확인
    if [ -d ~/.claude ]; then
        log_success "Claude 설정 디렉토리 확인: ~/.claude"
        
        if [ -f ~/.claude/.claude.json ]; then
            log_success "Claude 설정 파일 확인: ~/.claude/.claude.json"
        else
            log_info "Claude 설정 파일이 아직 생성되지 않았습니다."
        fi
    else
        log_info "Claude 설정 디렉토리가 아직 생성되지 않았습니다."
    fi
}

# Claude Squad 설치
install_claude_squad() {
    log_info "Claude Squad 설치 중..."
    
    # 필수 도구 확인
    if ! command -v tmux &> /dev/null; then
        log_error "tmux가 설치되지 않았습니다."
        return 1
    fi
    
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI(gh)가 설치되지 않았습니다."
        return 1
    fi
    
    log_success "필수 도구 확인 완료: tmux, gh"
    
    # Claude Squad 설치 (공식 설치 스크립트 사용)
    log_info "Claude Squad 다운로드 및 설치 중..."
    if curl -fsSL https://raw.githubusercontent.com/smtg-ai/claude-squad/main/install.sh | bash; then
        log_success "Claude Squad 설치 완료"
        
        # cs 별칭 확인
        if command -v claude-squad &> /dev/null; then
            log_success "Claude Squad 실행 파일 확인: $(which claude-squad)"
            
            # cs 별칭 생성 (없는 경우)
            if ! command -v cs &> /dev/null; then
                # .zshrc에 별칭 추가
                echo "alias cs='claude-squad'" >> ~/.zshrc
                log_success "cs 별칭 추가 (터미널 재시작 후 사용 가능)"
            else
                log_success "cs 별칭 확인됨"
            fi
        else
            log_warning "Claude Squad 설치는 완료되었지만 실행 파일을 찾을 수 없습니다."
            log_info "터미널을 재시작하거나 PATH를 새로고침하세요."
        fi
    else
        log_error "Claude Squad 설치 실패"
        log_info "수동 설치: curl -fsSL https://raw.githubusercontent.com/smtg-ai/claude-squad/main/install.sh | bash"
        return 1
    fi
}

# SuperClaude Framework 설치
install_superclaude() {
    log_info "SuperClaude Framework 설치 중..."
    
    # Python3 확인 (DevContainer 내부에서는 정상 작동)
    if ! command -v python3 &> /dev/null; then
        log_error "Python3가 설치되지 않았습니다."
        return 1
    fi
    
    log_success "Python3 확인 완료: $(python3 --version 2>&1 || echo 'version check failed')"
    
    # SuperClaude가 이미 설치되어 있는지 확인
    if python3 -c "import SuperClaude" 2>/dev/null; then
        log_success "SuperClaude Framework가 이미 설치되어 있습니다"
        return 0
    fi
    
    # pip으로 SuperClaude 설치 (가장 안정적인 방법)
    log_info "pip으로 SuperClaude Framework 설치 중..."
    
    # PATH에 user site-packages 추가
    export PATH="$HOME/.local/bin:$PATH"
    
    # pip 업그레이드
    python3 -m pip install --user --upgrade pip >/dev/null 2>&1
    
    # SuperClaude 설치
    if python3 -m pip install --user SuperClaude; then
        log_success "SuperClaude Framework 설치 완료"
        
        # 설치 확인
        if python3 -c "import SuperClaude" 2>/dev/null; then
            log_success "SuperClaude Framework import 확인 완료"
            
            # SuperClaude 초기화 시도 (실패해도 괜찮음)
            log_info "SuperClaude Framework 초기화 시도 중..."
            if python3 -m SuperClaude install --minimal 2>/dev/null; then
                log_success "SuperClaude Framework 초기화 완료"
            else
                log_info "초기화는 건너뛰고 기본 설치만 완료했습니다"
                log_info "수동 초기화: python3 -m SuperClaude install"
            fi
        else
            log_error "SuperClaude Framework 설치 후 import 실패"
            return 1
        fi
    else
        log_error "SuperClaude Framework 설치 실패"
        
        # uv가 있다면 uv로 시도
        if command -v uv &> /dev/null; then
            log_info "uv로 대체 설치 시도 중..."
            
            # 임시 디렉토리에서 uv 설치 시도
            local temp_dir=$(mktemp -d)
            cd "$temp_dir"
            
            if uv init superclaude-temp --python 3.11 >/dev/null 2>&1; then
                cd superclaude-temp
                if uv add SuperClaude >/dev/null 2>&1; then
                    log_success "uv로 SuperClaude Framework 설치 완료"
                    
                    # 전역 설치를 위해 pip으로 다시 설치
                    if uv run pip install --user SuperClaude >/dev/null 2>&1; then
                        log_success "전역 설치 완료"
                    fi
                fi
            fi
            
            cd /workspace
            rm -rf "$temp_dir"
        fi
        
        # 최종 확인
        if ! python3 -c "import SuperClaude" 2>/dev/null; then
            log_warning "SuperClaude Framework 자동 설치 실패"
            log_info "수동 설치: python3 -m pip install --user SuperClaude"
            return 1
        fi
    fi
    
    return 0
}

# 메인 실행 함수
main() {
    log_info "Claude Code 개발환경 설정 시작"
    log_info "작업 디렉토리: $(pwd)"
    log_info "사용자: $(whoami)"
    
    # 각 설정 단계 실행
    setup_python_env
    setup_git_config
    setup_claude_config
    install_claude_code
    install_claude_squad
    install_superclaude
    
    # MCP 서버 설치는 별도 스크립트(setup-mcp-servers.sh)에서 자동 실행됩니다
    
    setup_zsh_config
    start_services
    verify_environment
    
    log_success "🎉 Claude Code 개발환경 설정 완료!"
    log_info ""
    
    # Claude CLI 인증 상태에 따른 메시지 표시
    local mcp_check_output
    if command -v claude &> /dev/null && mcp_check_output=$(timeout 10 claude mcp list 2>&1); then
        log_success "✅ Claude CLI 인증 완료 - 바로 사용 가능합니다!"
        log_info ""
        log_info "다음 단계:"
        log_info "  1. 터미널 재시작: exec zsh"
        log_info "  2. Claude CLI 사용: claude --help"
        log_info "  3. MCP 서버 확인: claude mcp list (자동 설치됨)"
        log_info "  4. 서비스 상태 확인: docker-compose ps"
        log_info "  5. Grafana 대시보드: http://localhost:3010"
        log_info ""
        log_info "🚀 Claude CLI가 모든 MCP 서버와 함께 준비되었습니다!"
        
        # Claude Squad 사용법 추가
        if command -v claude-squad &> /dev/null || command -v cs &> /dev/null; then
            log_info "🤖 Claude Squad 사용법:"
            log_info "  cs --help           # Claude Squad 도움말"
            log_info "  cs new project      # 새 프로젝트 생성"
            log_info "  cs chat             # Claude Squad 대화"
        fi
        
        # SuperClaude Framework 사용법 추가
        if python3 -c "import SuperClaude" 2>/dev/null; then
            log_info "🚀 SuperClaude Framework 사용법:"
            log_info "  python3 -m SuperClaude --help    # SuperClaude 도움말"
            log_info "  python3 -m SuperClaude install   # 추가 구성요소 설치"
        fi
    else
        log_info "🔐 Claude CLI 수동 인증이 필요합니다!"
        log_info ""
        log_info "📋 간단한 2단계 설정:"
        log_info ""
        log_info "  1️⃣  Claude CLI 인증:"
        log_info "     claude"
        log_info "     → 대화형 터미널이 시작되면서 브라우저로 인증 진행"
        log_info ""
        log_info "  2️⃣  MCP 서버 자동 등록:"
        log_info "     bash .devcontainer/setup-mcp-servers.sh"
        log_info "     → 모든 MCP 서버가 자동으로 등록됩니다"
        log_info ""
        log_info "💡 또는 개별 등록:"
        log_info "   claude mcp add @modelcontextprotocol/server-sequential-thinking"
        log_info "   claude mcp add @upstash/context7-mcp"
        log_info "   claude mcp add @21st-dev/magic"
        log_info "   claude mcp add @playwright/mcp"
        log_info ""
        log_info "🚀 설정 완료 후:"
        log_info "  claude --help                    # Claude CLI 도움말"
        log_info "  claude mcp list                  # MCP 서버 목록"
        log_info "  cs --help                        # Claude Squad 도움말"
        log_info "  python3 -m SuperClaude --help    # SuperClaude Framework"
        log_info "  docker-compose ps                # 서비스 상태"
        log_info "  http://localhost:3010            # Grafana 대시보드"
        log_info ""
        log_info "⚠️  인증과 MCP 등록 모두 완료해야 정상 작동합니다"
    fi
    
    log_info ""
    log_info "문제가 발생하면 다음 명령어로 로그를 확인하세요:"
    log_info "  docker-compose logs -f"
}

# 스크립트 실행
main "$@"