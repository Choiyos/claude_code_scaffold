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

# vibetunnel 설치
echo ""
echo "🌐 vibetunnel 설치 중..."
install_vibetunnel() {
    echo "[INFO] vibetunnel 설치 중..."
    echo "[INFO] npm으로 vibetunnel 설치 중..."
    
    # Node.js 버전 확인
    NODE_VERSION=$(node --version | sed 's/v//')
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    
    if [[ $MAJOR_VERSION -lt 20 ]]; then
        echo "[WARNING] vibetunnel은 Node.js 20+가 필요하지만 현재 버전은 $NODE_VERSION입니다"
        echo "[INFO] Node.js 20 설치를 시도합니다..."
        
        # Node.js 20 설치 시도
        if command -v curl &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
            # 새 버전 확인
            NEW_NODE_VERSION=$(node --version | sed 's/v//')
            NEW_MAJOR_VERSION=$(echo $NEW_NODE_VERSION | cut -d. -f1)
            if [[ $NEW_MAJOR_VERSION -ge 20 ]]; then
                echo "[SUCCESS] Node.js $NEW_NODE_VERSION 설치 완료!"
            else
                echo "[WARNING] Node.js 업그레이드 실패, 강제 설치를 시도합니다..."
            fi
        else
            echo "[INFO] curl을 찾을 수 없어 강제 설치를 시도합니다..."
        fi
    fi
    
    # 방법 1: npm에서 직접 설치 시도 (npmjs.com에서)
    if npm install -g vibetunnel --engine-strict=false 2>/dev/null; then
        echo "[SUCCESS] vibetunnel npm 패키지 설치 성공!"
        return 0
    fi
    
    
    echo "[INFO] npm 패키지 설치 실패, GitHub에서 빌드 설치를 시도합니다..."
    
    # 방법 2: GitHub에서 클론 후 web 디렉토리에서 빌드
    TEMP_DIR="/tmp/vibetunnel-build"
    rm -rf "$TEMP_DIR"
    
    echo "[INFO] GitHub 저장소에서 클론 시도..."
    if git clone --depth 1 https://github.com/amantus-ai/vibetunnel.git "$TEMP_DIR"; then
        echo "[INFO] vibetunnel 저장소 클론 성공"
        
        if [[ -d "$TEMP_DIR/web" ]]; then
            cd "$TEMP_DIR/web"
            
            # package.json 확인
            if [[ -f "package.json" ]]; then
                echo "[INFO] web/package.json 발견, 빌드 시작..."
                
                # 의존성 설치 (강제 모드, 로그 출력)
                echo "[INFO] 의존성 설치 중... (시간이 걸릴 수 있습니다)"
                if npm install --engine-strict=false; then
                    echo "[INFO] 의존성 설치 완료"
                    
                    # 빌드 (로그 출력)
                    echo "[INFO] npm 패키지 빌드 중..."
                    if npm run build:npm; then
                        echo "[INFO] 빌드 완료"
                        
                        # 전역 설치
                        echo "[INFO] 전역 설치 중..."
                        if npm pack && npm install -g vibetunnel-*.tgz; then
                            echo "[SUCCESS] vibetunnel 전역 설치 성공!"
                            cd - > /dev/null
                            rm -rf "$TEMP_DIR"
                            return 0
                        elif npm link; then
                            echo "[SUCCESS] vibetunnel 심볼릭 링크 설치 성공!"
                            cd - > /dev/null
                            rm -rf "$TEMP_DIR"
                            return 0
                        fi
                    else
                        echo "[WARNING] npm 빌드 실패, 일반 빌드 시도..."
                        if npm run build; then
                            echo "[INFO] 일반 빌드 완료, 전역 설치 시도..."
                            if npm link; then
                                echo "[SUCCESS] vibetunnel 심볼릭 링크 설치 성공!"
                                cd - > /dev/null
                                rm -rf "$TEMP_DIR"
                                return 0
                            fi
                        fi
                    fi
                else
                    echo "[ERROR] 의존성 설치 실패"
                fi
            else
                echo "[ERROR] web/package.json을 찾을 수 없습니다"
            fi
            
            cd - > /dev/null
        else
            echo "[ERROR] web 디렉토리를 찾을 수 없습니다"
        fi
        
        rm -rf "$TEMP_DIR"
    else
        echo "[ERROR] 저장소 클론 실패"
    fi
    
    echo "[ERROR] vibetunnel 설치 실패"
    echo "[INFO] 수동 설치: npm install -g https://github.com/amantus-ai/vibetunnel.git"
    return 1
}

# vibetunnel 설치 실행
if install_vibetunnel; then
    echo "✅ vibetunnel 설치 완료"
    # 설치 확인
    if command -v vibetunnel &> /dev/null; then
        echo "🎉 vibetunnel 명령어 사용 가능: $(vibetunnel --version 2>/dev/null || echo 'installed')"
    fi
    if command -v vt &> /dev/null; then
        echo "🎉 vt 명령어 사용 가능"
    fi
else
    echo "⚠️  vibetunnel 설치 실패, 계속 진행합니다"
fi

echo ""
echo "🎉 MCP 서버 설정 과정이 완료되었습니다!"