#!/bin/bash

# Claude CLI MCP 서버 자동 등록 스크립트
# 인증 완료 후 실행하여 MCP 서버들을 Claude CLI에 등록

# 스크립트 안전성 설정 제거 (환경변수 충돌 방지)

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
    
    # 인증 상태 확인 (MCP 명령어로 간접 확인)
    log_info "🔐 Claude CLI 인증 상태 확인 중..."
    
    local mcp_output
    if mcp_output=$(timeout 10 claude mcp list 2>&1); then
        # MCP 명령어가 성공하면 인증됨
        log_success "✅ Claude CLI 인증 확인됨 (MCP 명령어 실행 가능)"
        log_info "MCP 상태: $mcp_output"
        return 0
    else
        local exit_code=$?
        # 타임아웃이나 인증 오류로 추정
        if [ $exit_code -eq 124 ]; then
            log_warning "⚠️  MCP 명령어 실행 시간 초과 - 인증 상태 불확실"
            log_info "계속 진행하지만 인증이 필요할 수 있습니다."
            return 0
        else
            log_error "❌ Claude CLI가 인증되지 않았을 가능성이 높습니다."
            log_info "MCP 명령어 오류: $mcp_output"
            log_info ""
            log_info "📋 인증 방법:"
            log_info "  1. 터미널에서 claude 명령어 실행"
            log_info "  2. 대화형 세션이 시작되면서 브라우저 인증 진행"
            log_info "  3. 또는 구독자인 경우: claude setup-token"
            log_info ""
            log_info "인증 후 이 스크립트를 다시 실행하세요."
            return 1
        fi
    fi
}

# MCP 패키지 설치
install_mcp_packages() {
    log_info "📦 MCP 패키지 설치 중..."
    
    local packages=(
        "@modelcontextprotocol/server-sequential-thinking"
        "@upstash/context7-mcp"
        "@21st-dev/magic"
        "@executeautomation/playwright-mcp-server"
        "@playwright/mcp"
    )
    
    local install_success=0
    local total_packages=${#packages[@]}
    
    i=0
    while [ $i -lt $total_packages ]; do
        local package="${packages[$i]}"
        local current=$((i + 1))
        
        log_info "[$current/$total_packages] 📦 설치 중: $package"
        
        if npm install -g "$package" >/dev/null 2>&1; then
            log_success "✅ $package 설치 완료"
            ((install_success++))
        else
            log_warning "⚠️  $package 설치 실패 - 계속 진행"
        fi
        
        i=$((i + 1))
    done
    
    log_info "📊 패키지 설치 결과: $install_success/$total_packages 성공"
    log_info ""
}

# MCP 서버 등록 (공식 Claude Code 방식)
add_mcp_servers() {
    log_info "🔧 MCP 서버 등록 시작 (공식 방식)..."
    
    # MCP 서버 정보 배열
    local server_names=(
        "sequential-thinking"
        "context7-mcp"
        "magic"
        "playwright-mcp"
        "playwright-official"
    )
    
    local server_packages=(
        "@modelcontextprotocol/server-sequential-thinking"
        "@upstash/context7-mcp"
        "@21st-dev/magic"
        "@executeautomation/playwright-mcp-server"
        "@playwright/mcp"
    )
    
    # 환경변수 설정 (더미 값으로 초기 설정)
    local server_env_vars=(
        ""
        "UPSTASH_REDIS_REST_URL=https://dummy-url.upstash.io UPSTASH_REDIS_REST_TOKEN=dummy_token"
        "ANTHROPIC_API_KEY=dummy_key"
        ""
        ""
    )
    
    local success_count=0
    local total_count=${#server_names[@]}
    
    log_info "📦 등록할 MCP 서버 목록 ($total_count개):"
    i=0
    while [ $i -lt $total_count ]; do
        # 빈 이름 건너뛰기
        if [ -n "${server_names[$i]}" ]; then
            log_info "  - ${server_names[$i]} → ${server_commands[$i]}"
        else
            log_info "  - [빈 서버 이름 건너뜀] (인덱스: $i)"
        fi
        i=$((i + 1))
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
    
    # 서버 등록 루프 (공식 Claude Code 방식)
    i=0
    local registered=0
    while [ $i -lt $total_count ]; do
        local server_name="${server_names[$i]}"
        local package="${server_packages[$i]}"
        local env_vars="${server_env_vars[$i]}"
        
        # 빈 이름 건너뛰기
        if [ -z "$server_name" ]; then
            log_info "[건너뜀] 빈 서버 이름 (인덱스: $i)"
            i=$((i + 1))
            continue
        fi
        
        registered=$((registered + 1))
        log_info "[$registered/$total_count] 🔄 MCP 서버 등록 중: $server_name"
        
        # 공식 Claude Code MCP 등록 명령어 구성
        local claude_cmd="claude mcp add --scope user $server_name"
        
        # 환경변수가 있는 경우 추가
        if [ -n "$env_vars" ]; then
            # 환경변수를 -e 플래그로 변환
            local env_flags=""
            for env_var in $env_vars; do
                local key=$(echo "$env_var" | cut -d'=' -f1)
                local value=$(echo "$env_var" | cut -d'=' -f2-)
                env_flags="$env_flags -e $key=$value"
            done
            claude_cmd="$claude_cmd $env_flags"
        fi
        
        # npx 명령어 추가
        claude_cmd="$claude_cmd -- npx -y $package"
        
        log_info "실행 명령어: $claude_cmd"
        
        # 명령어 실행 및 상세 로그
        local output
        local exit_code
        
        log_info "⏳ 명령어 실행 중... (최대 30초 대기)"
        if output=$(timeout 30 bash -c "$claude_cmd" 2>&1); then
            exit_code=0
        else
            exit_code=$?
        fi
        
        if [ $exit_code -eq 0 ]; then
            log_success "✅ [$registered/$total_count] $server_name 등록 완료"
            log_info "출력: $output"
            ((success_count++))
        elif [ $exit_code -eq 124 ]; then
            log_error "⏰ [$registered/$total_count] $server_name 등록 타임아웃 (30초)"
            log_info "출력: $output"
        else
            log_warning "⚠️  [$registered/$total_count] $server_name 등록 실패 (exit code: $exit_code)"
            log_info "오류 출력: $output"
            log_info "💡 수동으로 등록하려면: $claude_cmd"
        fi
        
        log_info ""
        i=$((i + 1))
    done
    
    log_info "📊 MCP 서버 등록 결과: $success_count/$total_count 성공"
    
    # 설치 완료 후 사용자에게 더미 환경변수 안내
    if [ $success_count -gt 0 ]; then
        log_info ""
        log_warning "⚠️  환경변수 설정 필요:"
        log_info "  일부 MCP 서버는 실제 API 키가 필요합니다:"
        log_info "  - context7-mcp: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN"
        log_info "  - magic: ANTHROPIC_API_KEY (또는 필요한 API 키)"
        log_info ""
        log_success "✅ Playwright MCP 서버 설치 완료:"
        log_info "  - playwright-mcp: @executeautomation/playwright-mcp-server (커뮤니티 버전)"
        log_info "  - playwright-official: @playwright/mcp (Microsoft 공식 버전)"
        log_info ""
        log_info "💡 ~/.zshrc 또는 ~/.bashrc에 실제 API 키를 설정하세요."
    fi
    
    return 0
}

# MCP 서버 디버그 모드 검증 (공식 가이드 방식)
verify_mcp_servers_debug() {
    log_info "🐛 MCP 서버 디버그 모드 검증 중..."
    
    # 기본 목록 확인
    log_info "📋 등록된 MCP 서버 목록 확인..."
    local list_output
    if list_output=$(claude mcp list 2>&1); then
        log_success "✅ MCP 서버 목록 조회 성공"
        echo "$list_output" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                log_info "  📌 $line"
            fi
        done
    else
        log_warning "⚠️  MCP 서버 목록 조회 실패"
        log_info "오류: $list_output"
        return 1
    fi
    
    log_info ""
    log_info "🔍 디버그 모드 검증 안내:"
    log_info "  수동으로 다음 명령어를 실행하여 MCP 서버 상태를 확인하세요:"
    log_info "  1. echo \"/mcp\" | claude --debug"
    log_info "  2. 2분간 디버그 메시지 관찰"
    log_info "  3. 연결 실패 시 환경변수 또는 패키지 설치 확인"
    log_info ""
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
        log_info "💡 Claude CLI 인증 상태를 다시 확인해보세요:"
        log_info "  터미널에서 claude 명령어를 실행하여 인증을 완료하세요."
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
    
    # 환경 변수 확인 (안전한 방식)
    log_info "🔧 환경 변수 확인:"
    
    # PATH 확인
    if [ -n "${PATH+x}" ]; then
        log_info "  PATH: [설정됨]"
    else
        log_info "  PATH: [미설정]"
    fi
    
    # HOME 확인  
    if [ -n "${HOME+x}" ]; then
        log_info "  HOME: $HOME"
    else
        log_info "  HOME: [미설정]"
    fi
    
    # ANTHROPIC_API_KEY 확인
    if [ -n "${ANTHROPIC_API_KEY+x}" ] && [ -n "$ANTHROPIC_API_KEY" ]; then
        log_info "  ANTHROPIC_API_KEY: [설정됨]"
    else
        log_info "  ANTHROPIC_API_KEY: [미설정]"
    fi
    
    # CLAUDE_CODE_OAUTH_TOKEN 확인
    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN+x}" ] && [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
        log_info "  CLAUDE_CODE_OAUTH_TOKEN: [설정됨]"
    else
        log_info "  CLAUDE_CODE_OAUTH_TOKEN: [미설정]"
    fi
    
    log_info ""
    
    # 인증 상태 확인
    log_info "🔍 1단계: Claude CLI 인증 상태 확인"
    if ! check_claude_auth; then
        log_error "❌ 인증 확인 실패. 스크립트를 종료합니다."
        exit 1
    fi
    log_info ""
    
    # MCP 패키지 설치
    log_info "📦 2단계: MCP 패키지 설치"
    install_mcp_packages
    
    # MCP 서버 등록
    log_info "🔧 3단계: MCP 서버 등록"
    add_mcp_servers
    log_info ""
    
    # 등록 결과 확인
    log_info "📋 4단계: 등록 결과 확인"
    verify_mcp_servers_debug
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