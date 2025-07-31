#!/bin/bash

echo "=== 환경변수 테스트 ==="
echo "PATH: ${PATH:-[미설정]}"
echo "HOME: ${HOME:-[미설정]}"

echo "=== ANTHROPIC_API_KEY 테스트 ==="
if [ "${ANTHROPIC_API_KEY:-}" ]; then
    echo "ANTHROPIC_API_KEY: [설정됨]"
else
    echo "ANTHROPIC_API_KEY: [미설정]"
fi

echo "=== Claude CLI 테스트 ==="
if command -v claude &> /dev/null; then
    echo "Claude CLI 위치: $(which claude)"
    echo "Claude CLI 버전: $(claude --version 2>/dev/null || echo '버전 확인 실패')"
else
    echo "Claude CLI를 찾을 수 없습니다"
fi

echo "=== 테스트 완료 ==="