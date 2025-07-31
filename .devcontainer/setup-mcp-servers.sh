#!/bin/bash

# Claude CLI MCP 서버 자동 등록 스크립트
# 인증 완료 후 실행하여 MCP 서버들을 Claude CLI에 등록

# 스크립트 안전성 설정 (선택적)
set -u  # 미정의 변수 사용 시 오류

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
    log_info "🔍 Claude CLI 상태 확인 중..."
    
    # Claude CLI 존재 확인
    if ! command -v claude &> /dev/null; then
        log_error "Claude CLI를 찾을 수 없습니다."
        log_info "PATH: $PATH"
        log_info "which claude: $(which claude 2>/dev/null || echo 'not found')"
        return 1
    fi
    
    log_success "✅ Claude CLI 실행 파일 확인됨: $(which claude)"
    log_info "📋 Claude CLI 버전: $(claude --version 2>/dev/null || echo 'version check failed')"
    
    # 인증 상태 확인 (상세 로그)
    log_info "🔐 Claude CLI 인증 상태 확인 중..."
    
    local auth_output
    if auth_output=$(claude auth status 2>&1); then
        log_success "✅ Claude CLI 인증 확인됨"
        log_info "인증 상태: $auth_output"
        return 0
    else
        log_error "❌ Claude CLI가 인증되지 않았습니다."
        log_info "인증 오류 메시지: $auth_output"
        log_info "먼저 다음 명령어로 인증하세요: claude auth login"
        return 1
    fi
}

# MCP 서버 등록
add_mcp_servers() {
    log_info "🔧 MCP 서버 등록 시작..."
    
    local servers=(
        "@modelcontextprotocol/server-sequential-thinking"  
        "@upstash/context7-mcp"
        "@21st-dev/magic"
        "@playwright/mcp"
    )
    
    local success_count=0
    local total_count=${#servers[@]}
    
    log_info "📦 등록할 MCP 서버 목록 ($total_count개):"
    for server in "${servers[@]}"; do
        log_info "  - $server"
    done
    log_info ""
    
    # 기존 MCP 서버 목록 확인
    log_info "📋 기존 MCP 서버 목록 확인 중..."
    local existing_mcps
    if existing_mcps=$(claude mcp list 2>&1); then
        log_info "기존 MCP 목록:"
        echo "$existing_mcps" | while IFS= read -r line; do
            log_info "  $line"
        done
    else
        log_info "기존 MCP 목록 조회 실패: $existing_mcps"
    fi
    log_info ""
    
    for i in "${!servers[@]}"; do
        local server="${servers[$i]}"
        local current=$((i + 1))
        
        log_info "[$current/$total_count] 🔄 MCP 서버 등록 중: $server"
        log_info "실행 명령어: claude mcp add \"$server\""
        
        # 명령어 실행 및 상세 로그
        local output
        local exit_code
        
        log_info "⏳ 명령어 실행 중... (최대 30초 대기)"
        if output=$(timeout 30 claude mcp add "$server" 2>&1); then
            exit_code=0
        else
            exit_code=$?
        fi
        
        if [ $exit_code -eq 0 ]; then
            log_success "✅ [$current/$total_count] $server 등록 완료"
            log_info "출력: $output"
            ((success_count++))
        elif [ $exit_code -eq 124 ]; then
            log_error "⏰ [$current/$total_count] $server 등록 타임아웃 (30초)"
            log_info "출력: $output"
        else
            log_warning "⚠️  [$current/$total_count] $server 등록 실패 (exit code: $exit_code)"
            log_info "오류 출력: $output"
            log_info "💡 수동으로 등록하려면: claude mcp add \"$server\""
        fi
        
        log_info ""
    done
    
    log_info "📊 MCP 서버 등록 결과: $success_count/$total_count 성공"
    return 0
}

# 등록된 MCP 서버 확인
verify_mcp_servers() {
    log_info "📋 최종 MCP 서버 목록 확인 중..."
    
    local list_output
    local exit_code
    
    if list_output=$(claude mcp list 2>&1); then
        exit_code=0
    else
        exit_code=$?
    fi
    
    if [ $exit_code -eq 0 ]; then
        log_success "✅ MCP 서버 목록 조회 완료"
        log_info "📋 등록된 MCP 서버들:"
        echo "$list_output" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                log_info "  📌 $line"
            fi
        done
    else
        log_warning "⚠️  MCP 서버 목록을 가져올 수 없습니다 (exit code: $exit_code)"
        log_info "오류 출력: $list_output"
        log_info "💡 Claude CLI 상태를 다시 확인해보세요: claude auth status"
    fi
}

# 메인 실행
main() {
    log_success "🚀 Claude CLI MCP 서버 등록 스크립트 시작"
    log_info "📅 실행 시간: $(date)"
    log_info "👤 사용자: $(whoami)"
    log_info "📂 작업 디렉토리: $(pwd)"
    log_info "🖥️  운영체제: $(uname -a)"
    log_info ""
    
    # 환경 변수 확인
    log_info "🔧 환경 변수 확인:"
    log_info "  PATH: ${PATH:-[미설정]}"
    log_info "  HOME: ${HOME:-[미설정]}"
    
    # ANTHROPIC_API_KEY 안전한 확인
    local api_key_status="[미설정]"
    if [ "${ANTHROPIC_API_KEY:-}" ]; then
        api_key_status="[설정됨]"
    fi
    log_info "  ANTHROPIC_API_KEY: $api_key_status"
    log_info ""
    
    # 인증 상태 확인
    log_info "🔍 1단계: Claude CLI 인증 상태 확인"
    if ! check_claude_auth; then
        log_error "❌ 인증 확인 실패. 스크립트를 종료합니다."
        exit 1
    fi
    log_info ""
    
    # MCP 서버 등록
    log_info "🔧 2단계: MCP 서버 등록"
    add_mcp_servers
    log_info ""
    
    # 등록 결과 확인
    log_info "📋 3단계: 등록 결과 확인"
    verify_mcp_servers
    log_info ""
    
    log_success "🎉 MCP 서버 등록 프로세스 완료!"
    log_info ""
    log_info "🚀 이제 Claude CLI에서 다음 명령어들을 사용할 수 있습니다:"
    log_info "  claude mcp list          # MCP 서버 목록 확인"
    log_info "  claude --help            # Claude CLI 도움말"
    log_info "  claude 'your question'   # Claude와 대화"
    log_info ""
    log_info "📊 실행 완료: $(date)"
}

# 스크립트 실행
main "$@"