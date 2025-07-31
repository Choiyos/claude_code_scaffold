#!/bin/bash

# 조건부 마운트 처리 스크립트
# Windows/macOS/Linux에서 환경변수가 설정된 경우에만 마운트 시도

echo "🔍 조건부 마운트 검사 중..."

# 환경변수 확인
if [[ -n "$CLAUDE_HOST_PROJECTS" ]]; then
    echo "✅ CLAUDE_HOST_PROJECTS 환경변수 감지: $CLAUDE_HOST_PROJECTS"
    
    # 마운트 대상이 이미 존재하는지 확인
    if [[ -d "/host/projects" ]]; then
        echo "✅ /host/projects가 이미 마운트되어 있습니다"
        ls -la /host/projects 2>/dev/null | head -5
    else
        echo "⚠️  /host/projects가 마운트되지 않았습니다"
        echo "💡 DevContainer를 재빌드하거나 수동으로 마운트하세요"
    fi
else
    echo "ℹ️  CLAUDE_HOST_PROJECTS 환경변수가 설정되지 않았습니다"
    echo "   호스트 프로젝트 마운트를 건너뜁니다"
fi

# workspace 폴더 확인
if [[ -d "/workspace" ]]; then
    echo ""
    echo "📁 workspace 폴더 사용 가능:"
    echo "   cd /workspace"
    echo "   git clone <your-project>"
fi