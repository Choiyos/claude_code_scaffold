#!/bin/bash

# Claude CLI MCP 서버 자동 등록 스크립트
# 인증 완료 후 실행하여 MCP 서버들을 Claude CLI에 등록

echo "🔧 Claude CLI MCP 서버 자동 등록을 시작합니다..."

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

# Claude CLI 인증 상태 확인
check_claude_auth() {
    if ! command -v claude &> /dev/null; then
        log_error "Claude CLI를 찾을 수 없습니다."
        return 1
    fi
    
    if ! claude auth status &>/dev/null; then
        log_error "Claude CLI가 인증되지 않았습니다."
        log_info "먼저 다음 명령어로 인증하세요: claude auth login"
        return 1
    fi
    
    log_success "Claude CLI 인증 확인됨"
    return 0
}

# MCP 서버 등록
add_mcp_servers() {
    local servers=(
        "@modelcontextprotocol/server-sequential-thinking"  
        "@upstash/context7-mcp"
        "@21st-dev/magic"
        "@playwright/mcp"
    )
    
    local success_count=0
    local total_count=${#servers[@]}
    
    for server in "${servers[@]}"; do
        log_info "MCP 서버 등록 중: $server"
        
        if claude mcp add "$server"; then
            log_success "$server 등록 완료"
            ((success_count++))
        else
            log_warning "$server 등록 실패"
            log_info "수동으로 등록하려면: claude mcp add $server"
        fi
    done
    
    log_info "MCP 서버 등록 완료: $success_count/$total_count"
    return 0
}

# 등록된 MCP 서버 확인
verify_mcp_servers() {
    log_info "등록된 MCP 서버 목록 확인 중..."
    
    if claude mcp list; then
        log_success "MCP 서버 목록 조회 완료"
    else
        log_warning "MCP 서버 목록을 가져올 수 없습니다."
    fi
}

# 메인 실행
main() {
    log_info "Claude CLI MCP 서버 등록 시작"
    
    # 인증 상태 확인
    if ! check_claude_auth; then
        exit 1
    fi
    
    # MCP 서버 등록
    add_mcp_servers
    
    # 등록 결과 확인
    verify_mcp_servers
    
    log_success "🎉 MCP 서버 등록 완료!"
    log_info ""
    log_info "이제 Claude CLI에서 다음 명령어들을 사용할 수 있습니다:"
    log_info "  claude mcp list          # MCP 서버 목록 확인"
    log_info "  claude --help            # Claude CLI 도움말"
    log_info "  claude 'your question'   # Claude와 대화"
}

# 스크립트 실행
main "$@"