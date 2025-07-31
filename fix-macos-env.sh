#!/bin/bash

echo "🍎 macOS DevContainer 환경변수 문제 해결 스크립트"
echo "================================================"
echo ""
echo "📋 현재 환경변수 상태:"
echo "  CLAUDE_HOST_PROJECTS: '$CLAUDE_HOST_PROJECTS'"
echo ""

if [[ -n "$CLAUDE_HOST_PROJECTS" ]]; then
    echo "✅ 터미널에서는 환경변수가 설정되어 있습니다"
    echo ""
    echo "🔧 GUI 앱(VS Code)에서도 사용할 수 있도록 ~/.zshenv에 추가합니다:"
    
    # ~/.zshenv 파일에 추가 (GUI 앱도 로드함)
    if ! grep -q "CLAUDE_HOST_PROJECTS" ~/.zshenv 2>/dev/null; then
        echo "export CLAUDE_HOST_PROJECTS=\"$CLAUDE_HOST_PROJECTS\"" >> ~/.zshenv
        echo "✅ ~/.zshenv에 추가 완료"
    else
        echo "ℹ️  이미 ~/.zshenv에 존재합니다"
    fi
    
    echo ""
    echo "📝 다음 단계:"
    echo "  1. VS Code 완전 종료 (Cmd+Q)"
    echo "  2. VS Code 재시작"
    echo "  3. DevContainer 재빌드"
    echo ""
    echo "🔍 또는 확실한 방법:"
    echo "  터미널에서 'code .' 명령으로 VS Code 실행"
else
    echo "❌ 환경변수가 설정되지 않았습니다"
    echo ""
    echo "📝 설정 방법:"
    echo "  echo 'export CLAUDE_HOST_PROJECTS=\"\$HOME/Documents/git\"' >> ~/.zshrc"
    echo "  echo 'export CLAUDE_HOST_PROJECTS=\"\$HOME/Documents/git\"' >> ~/.zshenv"
    echo "  source ~/.zshrc"
fi

echo "================================================"