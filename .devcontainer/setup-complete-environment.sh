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
    echo "💡 현재 DevContainer는 마운트 대신 심볼릭 링크 방식을 사용합니다"
    
    # /host 디렉토리 생성
    sudo mkdir -p /host
    
    # 호스트 경로가 컨테이너 내부에서 접근 가능한지 확인
    # (실제로는 접근 불가능하지만, 사용자에게 명확한 안내 제공)
    echo "🔍 호스트 경로 접근성 확인 중..."
    echo "ℹ️  DevContainer는 격리된 환경이므로 호스트 경로에 직접 접근할 수 없습니다"
    echo ""
    echo "📁 권장 사용 방법:"
    echo "  1. workspace 폴더 사용:"
    echo "     cd workspace"
    echo "     git clone [your-project-url]"
    echo ""
    echo "  2. 또는 VS Code에서 'File > Open Folder'로 기존 프로젝트 열기"
    echo ""
    echo "💡 향후 업데이트:"
    echo "  - Docker 볼륨 마운트 방식으로 호스트 폴더 연결 기능 추가 예정"
    echo "  - 현재는 Git clone 방식을 권장합니다"
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