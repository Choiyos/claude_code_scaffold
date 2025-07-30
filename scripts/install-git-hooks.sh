#!/bin/bash

# Git Hooks 설치 스크립트
# 팀 설정 변경 시 자동 검증 및 알림 설정

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[SETUP]${NC} $1"; }
log_success() { echo -e "${GREEN}[SETUP]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[SETUP]${NC} $1"; }

# Git hooks 디렉토리
HOOKS_SOURCE=".githooks"
HOOKS_TARGET=".git/hooks"

log_info "Git Hooks 설치 중..."

# .git 디렉토리 확인
if [ ! -d ".git" ]; then
    log_error "Git 저장소가 아닙니다. git init을 먼저 실행하세요."
    exit 1
fi

# hooks 소스 디렉토리 확인
if [ ! -d "$HOOKS_SOURCE" ]; then
    log_error "$HOOKS_SOURCE 디렉토리가 없습니다."
    exit 1
fi

# hooks 대상 디렉토리 생성
mkdir -p "$HOOKS_TARGET"

# 각 hook 파일 설치
for hook_file in "$HOOKS_SOURCE"/*; do
    if [ -f "$hook_file" ]; then
        hook_name=$(basename "$hook_file")
        target_path="$HOOKS_TARGET/$hook_name"
        
        # 기존 hook이 있으면 백업
        if [ -f "$target_path" ]; then
            cp "$target_path" "$target_path.backup.$(date +%Y%m%d_%H%M%S)"
            log_warning "기존 $hook_name hook을 백업했습니다."
        fi
        
        # hook 파일 복사 및 실행 권한 부여
        cp "$hook_file" "$target_path"
        chmod +x "$target_path"
        
        log_success "$hook_name hook 설치 완료"
    fi
done

log_success "모든 Git Hooks 설치 완료!"

echo ""
log_info "설치된 Hooks:"
echo "  - pre-commit: 팀 설정 파일 변경 전 JSON 문법 및 필수 필드 검증"
echo "  - post-merge: 팀 설정 변경 시 자동 알림 및 동기화 안내"

echo ""
log_info "이제 다음과 같은 기능이 활성화됩니다:"
echo "  ✅ 설정 파일 커밋 전 자동 검증"
echo "  ✅ 팀 설정 변경 시 자동 알림"
echo "  ✅ JSON 문법 오류 사전 방지"
echo "  ✅ MCP 서버 설정 무결성 검증"