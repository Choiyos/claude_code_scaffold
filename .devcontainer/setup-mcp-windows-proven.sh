#!/bin/bash

echo "🚀 Windows에서 검증된 MCP 서버 설정 스크립트"

# Claude CLI 확인
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI를 찾을 수 없습니다"
    exit 1
fi

echo "✅ Claude CLI 버전: $(claude --version)"

# 기존 서버 확인
echo "🔍 현재 MCP 서버 상태:"
claude mcp list

# mcp-installer 설치
echo "📦 mcp-installer 설치 중..."
npm install -g @anaisbetts/mcp-installer

# 기존 서버 제거
echo "🧹 기존 MCP 서버 제거..."
claude mcp remove sequential 2>/dev/null || true
claude mcp remove context7 2>/dev/null || true
claude mcp remove magic 2>/dev/null || true
claude mcp remove playwright 2>/dev/null || true

# npm 패키지 설치
echo "📦 MCP 패키지 설치..."
npm install -g @modelcontextprotocol/server-sequential-thinking
npm install -g @upstash/context7-mcp
npm install -g @21st-dev/magic
npm install -g @executeautomation/playwright-mcp-server

# MCP 서버 추가 - Windows 검증된 방식 (npx -y)
echo "🔄 MCP 서버 등록 (npx -y 방식)..."
claude mcp add --scope user sequential -- npx -y @modelcontextprotocol/server-sequential-thinking
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp
claude mcp add --scope user magic -- npx -y @21st-dev/magic
claude mcp add --scope user playwright -- npx -y @executeautomation/playwright-mcp-server

echo ""
echo "🔍 설치 결과:"
claude mcp list

echo ""
echo "✅ MCP 서버 설정 완료!"
echo ""
echo "💡 검증 방법:"
echo "   1. 터미널 재시작: exec zsh"
echo "   2. MCP 상태 확인: claude mcp list"
echo "   3. 디버그 모드로 확인: echo '/mcp' | claude --debug"