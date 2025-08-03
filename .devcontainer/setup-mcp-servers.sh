#!/bin/bash

echo "🔧 Claude CLI MCP 서버 설정을 확인합니다..."

# Claude CLI 상태 확인
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI를 찾을 수 없습니다"
    exit 1
fi

echo "ℹ️  Claude CLI 버전: $(claude --version)"

# 현재 설치된 MCP 서버 확인
echo ""
echo "🔍 현재 MCP 서버 상태 확인 중..."

# claude mcp list 결과를 변수에 저장 (OAuth 메시지 필터링)
CURRENT_SERVERS=$(claude mcp list 2>&1 | grep -v "OAuth\|sign in" || true)

if [[ -n "$CURRENT_SERVERS" ]] && [[ ! "$CURRENT_SERVERS" =~ "No MCP servers" ]]; then
    echo "✅ MCP 서버가 이미 설정되어 있습니다!"
    echo ""
    echo "$CURRENT_SERVERS"
    echo ""
    echo "🎉 MCP 서버가 정상적으로 작동 중입니다!"
    exit 0
fi

# MCP 서버가 없는 경우에만 추가 시도
echo "ℹ️  MCP 서버가 설정되지 않았습니다. 추가를 시도합니다..."

# MCP 서버 추가 함수
add_mcp_server() {
    local server_name="$1"
    local package_name="$2"
    
    echo ""
    echo "📦 추가 중: $server_name"
    
    # npm으로 전역 설치
    echo "   1단계: npm 전역 설치..."
    npm install -g "$package_name" 2>/dev/null
    
    # 설치된 경로 찾기
    local npm_root=$(npm root -g)
    local bin_path="${npm_root}/$package_name/bin/index.js"
    
    # 다양한 실행 파일 위치 시도
    local possible_paths=(
        "${npm_root}/$package_name/dist/index.js"
        "${npm_root}/$package_name/index.js"
        "${npm_root}/$package_name/bin/index.js"
        "${npm_root}/$package_name/src/index.js"
    )
    
    # MCP 서버 추가 - claude mcp add 사용
    echo "   2단계: MCP 서버 등록..."
    
    # npx로 직접 실행
    if claude mcp add "$server_name" "npx $package_name" 2>&1 | grep -v "OAuth\|sign in"; then
        echo "   ✅ $server_name 추가 성공!"
        return 0
    fi
    
    # node로 직접 실행 시도
    for path in "${possible_paths[@]}"; do
        if [[ -f "$path" ]]; then
            if claude mcp add "$server_name" "node $path" 2>&1 | grep -v "OAuth\|sign in"; then
                echo "   ✅ $server_name 추가 성공! (경로: $path)"
                return 0
            fi
        fi
    done
    
    echo "   ⚠️  $server_name 추가 실패"
    return 1
}

# MCP 서버 목록
declare -a servers=(
    "sequential|@modelcontextprotocol/server-sequential-thinking"
    "context7|@upstash/context7-mcp"
    "magic|@21st-dev/magic"
    "playwright-automation|@executeautomation/playwright-mcp-server"
)

# 추가 실행
success_count=0
total_count=${#servers[@]}

echo ""
echo "📋 추가할 MCP 서버 목록:"
for server in "${servers[@]}"; do
    IFS='|' read -r name package <<< "$server"
    echo "   - $name ($package)"
done

echo ""
echo "🔄 MCP 서버 추가 진행 중..."

for server in "${servers[@]}"; do
    IFS='|' read -r name package <<< "$server"
    if add_mcp_server "$name" "$package"; then
        ((success_count++))
    fi
done

# 결과 출력
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 MCP 서버 추가 결과: $success_count/$total_count"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 최종 확인
echo ""
echo "🔍 최종 MCP 서버 상태:"
FINAL_SERVERS=$(claude mcp list 2>&1 | grep -v "OAuth\|sign in" || true)
if [[ -n "$FINAL_SERVERS" ]] && [[ ! "$FINAL_SERVERS" =~ "No MCP servers" ]]; then
    echo "$FINAL_SERVERS"
else
    echo "⚠️  MCP 서버가 추가되지 않았습니다"
    echo ""
    echo "💡 수동으로 MCP 서버를 추가하는 방법:"
    echo "   claude mcp add sequential 'npx @modelcontextprotocol/server-sequential-thinking'"
    echo "   claude mcp add context7 'npx @upstash/context7-mcp'"
    echo "   claude mcp add magic 'npx @21st-dev/magic'"
    echo "   claude mcp add playwright 'npx @executeautomation/playwright-mcp-server'"
    echo ""
    echo "📚 자세한 정보: https://github.com/modelcontextprotocol"
fi

# vibetunnel 설치 확인 및 백업 설치
echo ""
echo "🌐 vibetunnel 설치 상태 확인..."
if command -v vibetunnel &> /dev/null; then
    echo "✅ vibetunnel 명령어 사용 가능: $(vibetunnel --version 2>/dev/null || echo 'installed')"
    VT_INSTALLED=true
else
    echo "⚠️  vibetunnel 명령어를 찾을 수 없습니다"
    echo "🔄 백업 설치를 시도합니다..."
    VT_INSTALLED=false
fi

if command -v vt &> /dev/null; then
    echo "✅ vt 명령어 사용 가능"
else
    echo "⚠️  vt 명령어를 찾을 수 없습니다"
    VT_INSTALLED=false
fi

# vibetunnel이 설치되지 않은 경우 백업 설치 시도
if [[ "$VT_INSTALLED" == "false" ]]; then
    echo ""
    echo "📦 vibetunnel 백업 설치 시도 중..."
    
    # npm prefix 설정 확인
    export PATH="$HOME/.npm-global/bin:$PATH"
    
    # 방법 1: 특정 버전으로 설치 (가장 안정적)
    echo "🔄 vibetunnel@1.0.0-beta.14.1 설치 시도..."
    if npm install -g vibetunnel@1.0.0-beta.14.1 2>&1 | grep -v "authenticate-pam"; then
        echo "✅ npm으로 vibetunnel 설치 성공!"
        VT_INSTALLED=true
    else
        # 방법 2: 최신 버전 설치
        echo "🔄 최신 버전 설치 시도..."
        if npm install -g vibetunnel --engine-strict=false 2>&1 | grep -v "authenticate-pam"; then
            echo "✅ npm으로 vibetunnel 설치 성공!"
            VT_INSTALLED=true
        else
            echo "❌ npm 설치 실패"
            
            # 방법 3: GitHub에서 직접 빌드
            echo "🔄 GitHub에서 직접 빌드 시도..."
            TEMP_DIR="/tmp/vt-build"
            rm -rf "$TEMP_DIR"
            
            if git clone --depth 1 https://github.com/amantus-ai/vibetunnel.git "$TEMP_DIR" 2>/dev/null; then
                cd "$TEMP_DIR/web"
                if [[ -f "package.json" ]] && npm install --engine-strict=false 2>/dev/null && npm run build:npm 2>/dev/null && npm link 2>/dev/null; then
                    echo "✅ GitHub 빌드로 vibetunnel 설치 성공!"
                    VT_INSTALLED=true
                fi
                cd - > /dev/null
                rm -rf "$TEMP_DIR"
            fi
        fi
    fi
    
    # 최종 확인
    if [[ "$VT_INSTALLED" == "true" ]]; then
        echo "🎉 vibetunnel 백업 설치 완료!"
        if command -v vibetunnel &> /dev/null; then
            echo "✅ vibetunnel 명령어 확인: $(vibetunnel --version 2>/dev/null || echo 'installed')"
        fi
        if command -v vt &> /dev/null; then
            echo "✅ vt 명령어 확인됨"
        fi
    else
        echo "⚠️  vibetunnel 설치 실패 - 수동 설치 필요"
        echo "💡 수동 설치: npm install -g vibetunnel"
    fi
fi

echo ""
echo "🎉 MCP 서버 설정 과정이 완료되었습니다!"