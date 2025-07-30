#!/bin/bash

# Git 기반 팀 설정 동기화 스크립트
# 팀원이 Claude/MCP 설정을 변경하면 자동으로 Git을 통해 동기화

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 로그 함수
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 설정 파일 경로
TEAM_CONFIG_DIR="/workspace/team-config"
USER_CLAUDE_DIR="$HOME/.claude"
BACKUP_DIR="/workspace/.config-backups"

# Git 관련 변수
GIT_BRANCH="config-updates"
COMMIT_PREFIX="config:"

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"

# 현재 사용자 설정 백업
backup_current_config() {
    log_info "현재 설정 백업 중..."
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="$BACKUP_DIR/backup_$timestamp"
    
    mkdir -p "$backup_path"
    
    if [ -f "$USER_CLAUDE_DIR/config.json" ]; then
        cp "$USER_CLAUDE_DIR/config.json" "$backup_path/claude-config.json"
    fi
    
    if [ -f "$USER_CLAUDE_DIR/mcp-servers.json" ]; then
        cp "$USER_CLAUDE_DIR/mcp-servers.json" "$backup_path/mcp-servers.json"
    fi
    
    log_success "백업 완료: $backup_path"
}

# 팀 설정에서 사용자 설정으로 동기화 (Pull)
sync_from_team() {
    log_info "팀 설정을 개인 환경으로 동기화 중..."
    
    # Git에서 최신 설정 가져오기
    git fetch origin main
    git checkout main
    git pull origin main
    
    # 팀 설정 파일이 존재하는지 확인
    if [ ! -f "$TEAM_CONFIG_DIR/claude-config.json" ]; then
        log_error "팀 Claude 설정 파일이 없습니다: $TEAM_CONFIG_DIR/claude-config.json"
        return 1
    fi
    
    if [ ! -f "$TEAM_CONFIG_DIR/mcp-servers.json" ]; then
        log_error "팀 MCP 설정 파일이 없습니다: $TEAM_CONFIG_DIR/mcp-servers.json"
        return 1
    fi
    
    # 현재 설정 백업
    backup_current_config
    
    # 팀 설정을 개인 설정으로 복사
    cp "$TEAM_CONFIG_DIR/claude-config.json" "$USER_CLAUDE_DIR/config.json"
    cp "$TEAM_CONFIG_DIR/mcp-servers.json" "$USER_CLAUDE_DIR/mcp-servers.json"
    
    # 권한 설정
    chmod 600 "$USER_CLAUDE_DIR/config.json"
    chmod 600 "$USER_CLAUDE_DIR/mcp-servers.json"
    
    log_success "팀 설정 동기화 완료"
    
    # MCP 서버 재설치 여부 확인
    log_info "MCP 서버 설정이 변경되었습니다. 재설치가 필요할 수 있습니다."
    log_info "재설치하려면: npm install -g \$(jq -r '.mcpServers | to_entries[] | .value.args[0]' ~/.claude/mcp-servers.json)"
}

# 사용자 설정을 팀 설정으로 제안 (Push)
propose_to_team() {
    log_info "개인 설정을 팀 설정으로 제안 중..."
    
    # 개인 설정 파일 확인
    if [ ! -f "$USER_CLAUDE_DIR/config.json" ] || [ ! -f "$USER_CLAUDE_DIR/mcp-servers.json" ]; then
        log_error "개인 Claude 설정 파일이 없습니다."
        return 1
    fi
    
    # Git 상태 확인
    if ! git diff --quiet; then
        log_warning "Git 워킹 디렉토리에 커밋되지 않은 변경사항이 있습니다."
        read -p "계속 진행하시겠습니까? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "취소되었습니다."
            return 1
        fi
    fi
    
    # 설정 브랜치 생성/전환
    local branch_name="${GIT_BRANCH}-$(date +%Y%m%d-%H%M%S)"
    git checkout -b "$branch_name" || git checkout "$branch_name"
    
    # 개인 설정을 팀 설정으로 복사
    cp "$USER_CLAUDE_DIR/config.json" "$TEAM_CONFIG_DIR/claude-config.json"
    cp "$USER_CLAUDE_DIR/mcp-servers.json" "$TEAM_CONFIG_DIR/mcp-servers.json"
    
    # 변경사항 확인
    if git diff --quiet "$TEAM_CONFIG_DIR/"; then
        log_info "팀 설정과 개인 설정이 동일합니다. 변경사항이 없습니다."
        git checkout main
        git branch -d "$branch_name"
        return 0
    fi
    
    # 변경사항 표시
    log_info "다음 설정 변경사항을 팀에 제안합니다:"
    git diff "$TEAM_CONFIG_DIR/"
    
    # 커밋 메시지 입력
    echo
    read -p "커밋 메시지를 입력하세요 (예: MCP 서버 추가, Claude 설정 업데이트): " commit_message
    
    if [ -z "$commit_message" ]; then
        commit_message="Claude/MCP 설정 업데이트"
    fi
    
    # 변경사항 커밋
    git add "$TEAM_CONFIG_DIR/"
    git commit -m "${COMMIT_PREFIX} ${commit_message}

자동 생성된 커밋입니다.
- 사용자: $(whoami)
- 시간: $(date)
- 브랜치: $branch_name

변경된 설정:
$(git diff --name-only HEAD~1 HEAD | grep team-config || echo '설정 파일 업데이트')"
    
    # 원격 저장소로 푸시
    git push origin "$branch_name"
    
    log_success "설정 변경사항이 '$branch_name' 브랜치로 푸시되었습니다."
    log_info "팀 리더에게 Pull Request 검토를 요청하세요."
    log_info ""
    log_info "GitHub에서 PR 생성: https://github.com/YOUR_REPO/compare/$branch_name"
    
    # main 브랜치로 돌아가기
    git checkout main
}

# 설정 충돌 해결
resolve_conflicts() {
    log_info "설정 충돌 해결 도구"
    
    # 충돌 파일 확인
    local conflicts=$(git diff --name-only --diff-filter=U 2>/dev/null | grep team-config || true)
    
    if [ -z "$conflicts" ]; then
        log_info "현재 충돌이 없습니다."
        return 0
    fi
    
    log_warning "다음 설정 파일에서 충돌이 발생했습니다:"
    echo "$conflicts"
    
    for file in $conflicts; do
        log_info "충돌 해결 중: $file"
        
        # 충돌 마커 확인
        if grep -q "<<<<<<< HEAD" "$file"; then
            log_info "수동 편집이 필요합니다: $file"
            log_info "다음 명령어로 편집하세요: code $file"
            
            read -p "편집을 완료했으면 Enter를 누르세요..."
            
            # 충돌 마커가 여전히 있는지 확인
            if grep -q "<<<<<<< HEAD" "$file"; then
                log_error "아직 충돌 마커가 남아있습니다. 다시 편집해주세요."
                return 1
            fi
            
            git add "$file"
            log_success "$file 충돌 해결 완료"
        fi
    done
    
    git commit -m "${COMMIT_PREFIX} 설정 충돌 해결"
    log_success "모든 충돌이 해결되었습니다."
}

# 설정 검증
validate_config() {
    log_info "설정 파일 검증 중..."
    
    # JSON 문법 검증
    for config_file in "$TEAM_CONFIG_DIR/claude-config.json" "$TEAM_CONFIG_DIR/mcp-servers.json"; do
        if [ -f "$config_file" ]; then
            if ! jq empty "$config_file" 2>/dev/null; then
                log_error "JSON 문법 오류: $config_file"
                return 1
            else
                log_success "JSON 문법 검증 통과: $(basename $config_file)"
            fi
        fi
    done
    
    # MCP 서버 설정 검증
    if [ -f "$TEAM_CONFIG_DIR/mcp-servers.json" ]; then
        local servers=$(jq -r '.mcpServers | keys[]' "$TEAM_CONFIG_DIR/mcp-servers.json" 2>/dev/null || echo "")
        if [ -n "$servers" ]; then
            log_info "설정된 MCP 서버들:"
            echo "$servers" | while read server; do
                local command=$(jq -r ".mcpServers.\"$server\".command" "$TEAM_CONFIG_DIR/mcp-servers.json")
                local args=$(jq -r ".mcpServers.\"$server\".args[]" "$TEAM_CONFIG_DIR/mcp-servers.json" | tr '\n' ' ')
                echo "  - $server: $command $args"
            done
        fi
    fi
    
    log_success "설정 검증 완료"
}

# 사용법 표시
show_usage() {
    echo "사용법: $0 [명령어]"
    echo ""
    echo "명령어:"
    echo "  pull     팀 설정을 개인 환경으로 동기화"
    echo "  push     개인 설정을 팀에 제안 (PR 생성)"
    echo "  resolve  설정 충돌 해결"
    echo "  validate 설정 파일 검증"
    echo "  status   현재 설정 상태 확인"
    echo ""
    echo "예시:"
    echo "  $0 pull          # 팀 설정으로 개인 환경 업데이트"
    echo "  $0 push          # 개인 설정 변경사항을 팀에 제안"
    echo "  $0 validate      # 설정 파일 문법 검증"
}

# 설정 상태 확인
show_status() {
    log_info "현재 설정 상태"
    
    echo ""
    echo "=== Git 상태 ==="
    git status --porcelain "$TEAM_CONFIG_DIR/" || true
    
    echo ""
    echo "=== 팀 설정 파일 ==="
    ls -la "$TEAM_CONFIG_DIR/" 2>/dev/null || echo "팀 설정 디렉토리가 없습니다."
    
    echo ""
    echo "=== 개인 설정 파일 ==="
    ls -la "$USER_CLAUDE_DIR"/{config.json,mcp-servers.json} 2>/dev/null || echo "개인 설정 파일이 없습니다."
    
    echo ""
    echo "=== 최근 설정 변경 이력 ==="
    git log --oneline -n 5 --grep="$COMMIT_PREFIX" || true
}

# 메인 실행부
main() {
    case "${1:-}" in
        "pull")
            sync_from_team
            ;;
        "push")
            propose_to_team
            ;;
        "resolve")
            resolve_conflicts
            ;;
        "validate")
            validate_config
            ;;
        "status")
            show_status
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"