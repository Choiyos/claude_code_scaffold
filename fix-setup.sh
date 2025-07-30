#!/bin/bash

# 맥북 DevContainer 환경에서 발생한 설정 문제들을 수동으로 해결하는 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[FIX]${NC} $1"; }
log_success() { echo -e "${GREEN}[FIX]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[FIX]${NC} $1"; }
log_error() { echo -e "${RED}[FIX]${NC} $1"; }

echo "🔧 DevContainer 설정 문제 해결 중..."

# 1. 현재 작업 디렉토리 확인
log_info "현재 작업 디렉토리: $(pwd)"
log_info "사용자: $(whoami)"

# 2. Claude 설정 파일 생성
log_info "Claude 설정 파일 생성 중..."
mkdir -p ~/.claude

# Claude 기본 설정
cat > ~/.claude/config.json << 'EOF'
{
  "allowedTools": [],
  "hasTrustDialogAccepted": true,
  "hasCompletedProjectOnboarding": true,
  "theme": "dark",
  "model": "sonnet"
}
EOF

# MCP 서버 설정
cat > ~/.claude/mcp-servers.json << 'EOF'
{
  "mcpServers": {
    "sequential": {
      "command": "node",
      "args": ["@modelcontextprotocol/server-sequential-thinking"],
      "description": "Multi-step reasoning and systematic analysis"
    },
    "context7": {
      "command": "node", 
      "args": ["@upstash/context7-mcp"],
      "description": "Latest documentation and library information"
    },
    "magic": {
      "command": "node",
      "args": ["@21st-dev/magic"],
      "description": "UI component generation"
    },
    "playwright": {
      "command": "node",
      "args": ["@playwright/mcp"],
      "description": "Browser automation and testing"
    }
  }
}
EOF

chmod 600 ~/.claude/config.json
chmod 600 ~/.claude/mcp-servers.json

log_success "Claude 설정 파일 생성 완료"

# 3. NPM PATH 설정
log_info "NPM PATH 설정 중..."
local npm_global_bin=$(npm config get prefix 2>/dev/null || echo "/usr/local")/bin

if [[ ":$PATH:" != *":$npm_global_bin:"* ]]; then
    export PATH="$npm_global_bin:$PATH"
    
    # zshrc에 추가
    if ! grep -q "npm.*PATH" ~/.zshrc 2>/dev/null; then
        echo "export PATH=\"$npm_global_bin:\$PATH\"" >> ~/.zshrc
    fi
    
    # bashrc에 추가
    if ! grep -q "npm.*PATH" ~/.bashrc 2>/dev/null; then
        echo "export PATH=\"$npm_global_bin:\$PATH\"" >> ~/.bashrc
    fi
    
    log_success "NPM PATH 설정 완료: $npm_global_bin"
else
    log_info "NPM PATH가 이미 설정되어 있습니다."
fi

# 4. Claude Code CLI 수동 확인
log_info "Claude Code CLI 확인 중..."

# 다양한 위치에서 Claude Code 찾기
claude_locations=(
    "$(which claude-code 2>/dev/null || true)"
    "/usr/local/bin/claude-code"
    "$npm_global_bin/claude-code"
    "$(npm root -g)/.bin/claude-code"
)

found_claude=false
for location in "${claude_locations[@]}"; do
    if [ -n "$location" ] && [ -f "$location" ]; then
        log_success "Claude Code CLI 발견: $location"
        # 실행 권한 확인
        if [ -x "$location" ]; then
            log_success "실행 권한 확인됨"
            # 심볼릭 링크 생성 (PATH에 확실히 포함시키기 위해)
            if [ "$location" != "/usr/local/bin/claude-code" ]; then
                sudo ln -sf "$location" /usr/local/bin/claude-code 2>/dev/null || true
            fi
            found_claude=true
            break
        fi
    fi
done

if [ "$found_claude" = false ]; then
    log_warning "Claude Code CLI를 찾을 수 없습니다."
    log_info "수동 설치가 필요할 수 있습니다."
    
    # 설치된 npm 패키지 확인
    log_info "설치된 관련 패키지들:"
    npm list -g 2>/dev/null | grep -i claude || echo "Claude 관련 패키지 없음"
    npm list -g 2>/dev/null | grep -i anthropic || echo "Anthropic 관련 패키지 없음"
fi

# 5. Docker Compose 경로 확인 및 서비스 시작
log_info "Docker Compose 확인 중..."

possible_dirs=(
    "/workspaces/claude_code_scaffold"
    "/workspace"
    "$(pwd)"
)

docker_compose_found=false
for dir in "${possible_dirs[@]}"; do
    if [ -f "$dir/docker-compose.yml" ]; then
        log_success "Docker Compose 파일 발견: $dir/docker-compose.yml"
        cd "$dir"
        docker_compose_found=true
        
        # 서비스 시작 시도
        log_info "인프라 서비스 시작 중..."
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d postgres redis prometheus grafana
        elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
            docker compose up -d postgres redis prometheus grafana
        else
            log_warning "Docker Compose를 찾을 수 없습니다."
        fi
        
        if [ $? -eq 0 ]; then
            log_success "인프라 서비스 시작 완료"
        else
            log_warning "서비스 시작에 실패했을 수 있습니다."
        fi
        break
    fi
done

if [ "$docker_compose_found" = false ]; then
    log_warning "docker-compose.yml 파일을 찾을 수 없습니다."
fi

# 6. 환경 검증
log_info "환경 검증 중..."

echo ""
log_info "=== 설정 상태 확인 ==="

# Node.js
if command -v node &> /dev/null; then
    log_success "Node.js: $(node --version)"
else
    log_error "Node.js를 찾을 수 없습니다."
fi

# Python
if command -v python3 &> /dev/null; then
    log_success "Python: $(python3 --version)"
else
    log_error "Python을 찾을 수 없습니다."
fi

# Claude Code CLI
if command -v claude-code &> /dev/null; then
    log_success "Claude Code CLI: 설치됨"
    claude-code --version 2>/dev/null || echo "버전 확인 실패"
else
    log_warning "Claude Code CLI: PATH에서 찾을 수 없음"
fi

# Claude 설정 파일
if [ -f ~/.claude/config.json ]; then
    log_success "Claude 설정 파일: ~/.claude/config.json"
else
    log_error "Claude 설정 파일이 없습니다."
fi

# MCP 설정 파일
if [ -f ~/.claude/mcp-servers.json ]; then
    log_success "MCP 설정 파일: ~/.claude/mcp-servers.json"
    log_info "설정된 MCP 서버 수: $(jq '.mcpServers | length' ~/.claude/mcp-servers.json 2>/dev/null || echo '확인 불가')"
else
    log_error "MCP 설정 파일이 없습니다."
fi

# MCP 서버 패키지
log_info "설치된 MCP 서버들:"
npm list -g --depth=0 2>/dev/null | grep -E "(sequential|context7|magic|playwright)" || echo "  확인된 MCP 서버 없음"

echo ""
log_success "🎉 설정 문제 해결 완료!"

echo ""
log_info "다음 단계:"
log_info "  1. 터미널 재시작: exec zsh"
log_info "  2. Claude Code 테스트: claude-code --help"
log_info "  3. 설정 확인: cat ~/.claude/config.json"
log_info "  4. 서비스 상태: docker-compose ps (해당 디렉토리에서)"

echo ""
log_info "문제가 계속 발생하면:"
log_info "  - NPM global 경로: npm config get prefix"
log_info "  - PATH 확인: echo \$PATH"
log_info "  - Claude Code 수동 설치: npm install -g <claude-package-name>"