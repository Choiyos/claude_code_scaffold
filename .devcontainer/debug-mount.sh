#!/bin/bash

echo "🔍 DevContainer 마운트 디버깅 스크립트"
echo "=========================================="

echo ""
echo "📋 환경변수 정보:"
echo "  CLAUDE_HOST_PROJECTS: '$CLAUDE_HOST_PROJECTS'"
echo "  ANTHROPIC_API_KEY: '$(if [[ -n "$ANTHROPIC_API_KEY" ]]; then echo "설정됨 (${#ANTHROPIC_API_KEY} 글자)"; else echo "미설정"; fi)'"
echo "  CLAUDE_CODE_OAUTH_TOKEN: '$(if [[ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]]; then echo "설정됨 (${#CLAUDE_CODE_OAUTH_TOKEN} 글자)"; else echo "미설정"; fi)'"

echo ""
echo "📁 파일시스템 상태:"
echo "  현재 위치: $(pwd)"
echo "  사용자: $(whoami)"
echo "  홈 디렉토리: $HOME"

echo ""
echo "🔗 마운트 포인트 확인:"
if [[ -L "/host/projects" ]]; then
    echo "  /host/projects: 심볼릭 링크 존재"
    echo "  링크 대상: $(readlink /host/projects)"
    echo "  링크 상태: $(ls -la /host/projects 2>&1 || echo "접근 불가")"
    
    if [[ -d "/host/projects" ]]; then
        echo "  디렉토리 접근: 가능"
        echo "  내용 개수: $(ls /host/projects 2>/dev/null | wc -l) 개 항목"
        echo "  상위 3개 항목: $(ls /host/projects 2>/dev/null | head -3 | tr '\n' ' ')"
    else
        echo "  디렉토리 접근: 불가능"
    fi
elif [[ -d "/host/projects" ]]; then
    echo "  /host/projects: 일반 디렉토리 존재"
    echo "  내용: $(ls -la /host/projects 2>&1 || echo "접근 불가")"
else
    echo "  /host/projects: 존재하지 않음"
fi

echo ""
echo "🐳 Docker 마운트 정보:"
echo "  마운트된 파일시스템:"
mount | grep -E "(workspace|host|claude)" || echo "  관련 마운트 없음"

echo ""
echo "📦 Docker 컨테이너 정보:"
if command -v docker &> /dev/null; then
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  Docker 명령어 사용 불가"
else
    echo "  Docker CLI 없음 (정상 - DevContainer 내부)"
fi

echo ""
echo "🔧 권한 정보:"
echo "  /host 디렉토리 권한: $(ls -ld /host 2>/dev/null || echo "존재하지 않음")"
echo "  현재 사용자 그룹: $(groups)"

echo "=========================================="
echo "✅ 디버깅 정보 수집 완료"