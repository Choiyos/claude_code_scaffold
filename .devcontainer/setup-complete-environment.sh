#!/bin/bash

# 완전 통합된 Claude Code 개발환경 설정 스크립트
# DevContainer 초기화 시 모든 설정을 한 번에 처리

echo "🚀 Claude Code 완전 통합 개발환경 설정을 시작합니다..."

# 첫 번째 단계: 기본 환경 설정
echo "🔧 1단계: 기본 환경 설정 중..."
if bash .devcontainer/setup-claude-environment.sh; then
    echo "✅ 기본 환경 설정 완료"
else
    echo "❌ 기본 환경 설정 실패"
    exit 1
fi

# PATH 새로고침 (Claude CLI가 설치된 경로 추가)
export PATH="$HOME/.npm-global/bin:$PATH"
echo "🔄 PATH 새로고침: Claude CLI 경로 추가됨"

# Claude CLI 설치 확인
if command -v claude &> /dev/null; then
    echo "✅ Claude CLI 확인됨: $(claude --version)"
    
    # 두 번째 단계: MCP 서버 설정
    echo "🔧 2단계: MCP 서버 자동 설치 중..."
    if bash .devcontainer/setup-mcp-servers.sh; then
        echo "✅ MCP 서버 설치 완료"
    else
        echo "⚠️  MCP 서버 설치에 문제가 있지만 계속 진행합니다"
    fi
else
    echo "⚠️  Claude CLI를 찾을 수 없습니다. MCP 서버 설치를 건너뜁니다."
fi

# 호스트 폴더 연결 설정
echo "🔧 마지막 단계: 호스트 폴더 연결 설정 중..."

# 환경변수 디버깅 정보
echo "🔍 환경변수 디버깅:"
echo "  CLAUDE_HOST_PROJECTS=$CLAUDE_HOST_PROJECTS"
echo "  USER=$USER"
echo "  HOME=$HOME"
echo "  PWD=$PWD"

if [[ -n "$CLAUDE_HOST_PROJECTS" ]]; then
    echo "✅ CLAUDE_HOST_PROJECTS 환경변수가 설정되어 있습니다: $CLAUDE_HOST_PROJECTS"
    echo "💡 현재는 workspace 폴더 사용을 권장합니다"
    echo ""
    echo "📁 권장 워크플로우:"
    echo "  1. workspace 폴더에서 작업:"
    echo "     cd workspace"
    echo "     git clone https://github.com/your-username/your-project.git"
    echo "     cd your-project"
    echo ""
    echo "  2. 기존 프로젝트가 있다면:"
    echo "     - VS Code에서 'File > Open Folder'로 해당 프로젝트 열기"
    echo "     - 해당 프로젝트 폴더에서 DevContainer 실행"
    echo ""
    echo "💡 이 방식의 장점:"
    echo "  - 마운트 에러 없음"
    echo "  - 모든 플랫폼에서 동일한 경험"
    echo "  - Git 기반 협업에 최적화"
else
    echo "❌ CLAUDE_HOST_PROJECTS 환경변수가 설정되지 않았습니다"
    echo "🔍 현재 환경변수 상태:"
    echo "  - 모든 환경변수 확인: $(env | grep CLAUDE || echo "CLAUDE 관련 환경변수 없음")"
    echo ""
    echo "📝 호스트 폴더를 연결하려면:"
    echo "   1. 호스트에서 환경변수 설정:"
    echo "      export CLAUDE_HOST_PROJECTS=\"\$HOME/dev\""
    echo "      echo 'export CLAUDE_HOST_PROJECTS=\"\$HOME/dev\"' >> ~/.zshrc"
    echo ""
    echo "   2. DevContainer 재빌드:"
    echo "      Ctrl+Shift+P → 'Dev Containers: Rebuild Container'"
    echo ""
    echo "💡 지금은 workspace 폴더를 사용하세요: cd workspace"
fi

# 디버깅 스크립트 실행
echo ""
echo "🔍 마운트 상태 디버깅 정보:"
if [[ -f ".devcontainer/debug-mount.sh" ]]; then
    bash .devcontainer/debug-mount.sh
else
    echo "⚠️  디버깅 스크립트를 찾을 수 없습니다"
fi

echo ""
echo "🎉 Claude Code 완전 통합 환경 설정 완료!"
echo ""
echo "🚀 사용 가능한 기능:"
echo "  - Claude CLI: claude --help"
echo "  - MCP 서버: claude mcp list"
echo "  - 인프라 서비스: docker-compose ps"
echo "  - Grafana: http://localhost:3010"
if [[ -L "/host/projects" ]]; then
    echo "  - 호스트 프로젝트: cd /host/projects"
fi
echo "  - 워크스페이스: cd workspace"
echo ""

# Claude Squad PATH 문제 해결 (Windows DevContainer)
echo "🔧 Claude Squad PATH 설정 확인 중..."
if ! command -v cs &> /dev/null; then
    echo "⚠️  Claude Squad 'cs' 명령어를 찾을 수 없습니다"
    echo "🔍 Claude Squad 설치 위치 검색 중..."
    
    # 가능한 위치들 검색
    POSSIBLE_LOCATIONS=(
        "/usr/local/bin/cs"
        "/usr/local/bin/claude-squad"
        "/home/developer/.local/bin/cs"
        "/home/developer/.local/bin/claude-squad"
        "/opt/cs"
        "/opt/claude-squad"
    )
    
    for location in "${POSSIBLE_LOCATIONS[@]}"; do
        if [[ -f "$location" ]]; then
            echo "✅ Claude Squad 발견: $location"
            # 심볼릭 링크 생성
            sudo ln -sf "$location" /usr/local/bin/cs 2>/dev/null || true
            echo "🔗 /usr/local/bin/cs 심볼릭 링크 생성"
            break
        fi
    done
    
    # 다시 확인
    if command -v cs &> /dev/null; then
        echo "✅ Claude Squad 'cs' 명령어 사용 가능!"
    else
        echo "⚠️  Claude Squad PATH 문제가 지속됩니다"
        echo "💡 수동 해결 방법:"
        echo "   exec zsh  # 터미널 재시작"
        echo "   cs --help # 다시 시도"
    fi
else
    echo "✅ Claude Squad 'cs' 명령어 정상 작동"
fi