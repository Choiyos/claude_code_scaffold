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
    
    # Node.js 18.20.8 버전이 설치되어 있는지 확인
    if ! command -v node &> /dev/null; then
        log_error "Node.js가 설치되지 않았습니다. DevContainer features에서 설치될 예정입니다."
        return 1
    fi
    
    # Claude Code CLI 설치 시도 (정확한 패키지명 시도)
    local claude_packages=(
        "@anthropic-ai/claude-code@1.0.63"
        "@anthropic/claude-code"
        "claude-code"
    )
    
    local installed=false
    for package in "${claude_packages[@]}"; do
        log_info "시도 중: $package"
        if npm install -g "$package" 2>/dev/null; then
            log_success "Claude Code CLI 설치 완료: $package"
            installed=true
            break
        fi
    done
    
    if [ "$installed" = false ]; then
        log_warning "Claude Code CLI 공식 패키지를 찾을 수 없습니다."
        log_info "수동으로 Claude Code를 설치해야 할 수 있습니다."
    fi
    
    # PATH 환경변수에 npm global bin 추가
    local npm_global_bin=$(npm config get prefix)/bin
    if [[ ":$PATH:" != *":$npm_global_bin:"* ]]; then
        export PATH="$npm_global_bin:$PATH"
        echo "export PATH=\"$npm_global_bin:\$PATH\"" >> ~/.zshrc
        echo "export PATH=\"$npm_global_bin:\$PATH\"" >> ~/.bashrc
        log_info "NPM global bin을 PATH에 추가했습니다: $npm_global_bin"
    fi
    
    # Claude Code 설치 확인
    if command -v claude-code &> /dev/null; then
        log_success "Claude Code CLI 설치 확인됨"
        claude-code --version 2>/dev/null || echo "Claude Code CLI 실행 가능"
    else
        log_warning "Claude Code CLI가 PATH에서 찾을 수 없습니다."
        log_info "가능한 위치들:"
        find /usr/local -name "*claude*" 2>/dev/null || true
        find ~/.npm-global -name "*claude*" 2>/dev/null || true
    fi
}

# MCP 서버 설치
install_mcp_servers() {
    log_info "MCP 서버들 설치 중..."
    
    # MCP 서버들 설치 (전역 설치)
    local servers=(
        "@modelcontextprotocol/server-sequential-thinking"  
        "@upstash/context7-mcp"
        "@21st-dev/magic"
        "@playwright/mcp"
    )
    
    for server in "${servers[@]}"; do
        log_info "설치 중: $server"
        if npm install -g "$server"; then
            log_success "$server 설치 완료"
            
            # 설치된 패키지 경로 확인
            local package_path=$(npm list -g "$server" --depth=0 2>/dev/null | grep "$server" || true)
            if [ -n "$package_path" ]; then
                log_info "설치 위치: $package_path"
            fi
        else
            log_warning "$server 설치 실패 - 수동 설치가 필요할 수 있습니다."
        fi
    done
    
    # 설치 검증
    log_info "설치된 MCP 서버 검증 중..."
    for server in "${servers[@]}"; do
        if npx "$server" --help &>/dev/null || npx "$server" --version &>/dev/null; then
            log_success "$server: npx로 실행 가능"
        else
            log_warning "$server: npx로 실행할 수 없음. 수동 확인 필요"
        fi
    done
    
    # npm 글로벌 패키지 목록 표시
    log_info "설치된 모든 글로벌 패키지:"
    npm list -g --depth=0 | grep -E "(sequential|context7|magic|playwright)" || echo "  MCP 관련 패키지 없음"
}

# Claude Code 환경 설정 (Volume Mount 방식)
setup_claude_config() {
    log_info "Claude Code 환경 설정 중 (Volume Mount 방식)..."
    
    # Volume Mount로 이미 ~/.claude가 config/claude와 연결되어 있음
    if [ -d ~/.claude ]; then
        log_success "Claude 설정 디렉토리가 Volume Mount로 연결되어 있습니다: ~/.claude"
        
        # 연결된 파일들 확인
        if [ -f ~/.claude/config.json ]; then
            log_success "Claude 기본 설정 파일 확인: ~/.claude/config.json"
        fi
        
        if [ -f ~/.claude/mcp.json ]; then
            log_success "MCP 서버 설정 파일 확인: ~/.claude/mcp.json"
        fi
        
        # 설정 파일 권한 조정
        chmod 600 ~/.claude/config.json 2>/dev/null || true
        chmod 600 ~/.claude/mcp.json 2>/dev/null || true
        
        log_info "Volume Mount 설정으로 팀 설정이 실시간 동기화됩니다."
        log_info "컨테이너에서 ~/.claude/ 파일 수정 시 자동으로 Git 변경점으로 잡힙니다."
    else
        log_error "Volume Mount 설정에 문제가 있습니다. ~/.claude 디렉토리를 찾을 수 없습니다."
        return 1
    fi
}

# Python 환경 설정
setup_python_env() {
    log_info "Python 개발환경 설정 중..."
    
    # Python 3.11이 설치되어 있는지 확인
    if ! command -v python3 &> /dev/null; then
        log_error "Python3가 설치되지 않았습니다. DevContainer features에서 설치될 예정입니다."
        return 1
    fi
    
    # 기본 Python 패키지 설치
    python3 -m pip install --user --upgrade pip setuptools wheel
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
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH="/workspace:$PYTHONPATH"

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

# Claude Code 관련 설정
if command -v claude-code &> /dev/null; then
    # Claude Code 자동완성 (사용 가능한 경우)
    # eval "$(claude-code completion zsh)"
    echo "🤖 Claude Code CLI 사용 가능"
fi

EOF
    
    log_success "Zsh 설정 완료"
}

# 환경 검증
verify_environment() {
    log_info "환경 설정 검증 중..."
    
    # Node.js 버전 확인
    if command -v node &> /dev/null; then
        log_success "Node.js $(node --version) 설치 확인"
    else
        log_error "Node.js가 설치되지 않았습니다."
    fi
    
    # Python 버전 확인
    if command -v python3 &> /dev/null; then
        log_success "Python $(python3 --version) 설치 확인"
    else
        log_error "Python이 설치되지 않았습니다."
    fi
    
    # Claude Code CLI 확인
    if command -v claude-code &> /dev/null; then
        log_success "Claude Code CLI 설치 확인"
    else
        log_warning "Claude Code CLI를 찾을 수 없습니다."
    fi
    
    # 설정 파일 확인
    if [ -f ~/.claude/config.json ]; then
        log_success "Claude 설정 파일 확인"
    else
        log_warning "Claude 설정 파일이 없습니다."
    fi
    
    if [ -f ~/.claude/mcp-servers.json ]; then
        log_success "MCP 서버 설정 파일 확인"
    else
        log_warning "MCP 서버 설정 파일이 없습니다."
    fi
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
    install_mcp_servers
    setup_zsh_config
    start_services
    verify_environment
    
    log_success "🎉 Claude Code 개발환경 설정 완료!"
    log_info ""
    log_info "다음 단계:"
    log_info "  1. 터미널 재시작: exec zsh"
    log_info "  2. Claude Code 사용: claude-code --help"
    log_info "  3. 서비스 상태 확인: docker-compose ps"
    log_info "  4. Grafana 대시보드: http://localhost:3010"
    log_info ""
    log_info "문제가 발생하면 다음 명령어로 로그를 확인하세요:"
    log_info "  docker-compose logs -f"
}

# 스크립트 실행
main "$@"