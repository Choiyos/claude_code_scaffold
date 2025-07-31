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
    if [[ -d "$CLAUDE_HOST_PROJECTS" ]]; then
        echo "✅ 호스트 경로가 존재합니다: $CLAUDE_HOST_PROJECTS"
        
        # /host 디렉토리 생성
        echo "📁 /host 디렉토리 생성 중..."
        sudo mkdir -p /host
        
        # 심볼릭 링크 생성
        echo "🔗 심볼릭 링크 생성 중: /host/projects → $CLAUDE_HOST_PROJECTS"
        sudo ln -sf "$CLAUDE_HOST_PROJECTS" /host/projects
        sudo chown -h developer:developer /host/projects
        
        echo "✅ 호스트 프로젝트 폴더 연결됨: /host/projects → $CLAUDE_HOST_PROJECTS"
        if [[ "$(ls -A "$CLAUDE_HOST_PROJECTS" 2>/dev/null)" ]]; then
            echo "📁 연결된 내용: $(ls "$CLAUDE_HOST_PROJECTS" | head -3 | tr '\n' ' ')..."
        else
            echo "📁 연결된 폴더가 비어있습니다"
        fi
    else
        echo "❌ 환경변수 경로가 존재하지 않습니다: $CLAUDE_HOST_PROJECTS"
        echo "🔍 경로 상세 정보:"
        echo "  - 설정된 경로: '$CLAUDE_HOST_PROJECTS'"
        echo "  - 경로 길이: ${#CLAUDE_HOST_PROJECTS}"
        echo "  - ls 결과: $(ls -la "$CLAUDE_HOST_PROJECTS" 2>&1 || echo "경로 접근 불가")"
        echo ""
        echo "💡 해결 방법:"
        echo "  1. 호스트에서 폴더 생성: mkdir -p '$CLAUDE_HOST_PROJECTS'"
        echo "  2. 경로 확인: echo \$CLAUDE_HOST_PROJECTS"
        echo "  3. DevContainer 재빌드"
    fi
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