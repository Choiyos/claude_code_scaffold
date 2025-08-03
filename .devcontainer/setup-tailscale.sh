#!/bin/bash

echo "🔧 Tailscale 설정을 시작합니다..."

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Tailscale 데몬 시작
echo "🚀 Tailscale 데몬 시작 중..."
sudo tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock &
sleep 3

# Tailscale 인증 (auth key 사용)
if [ -n "$TAILSCALE_AUTH_KEY" ]; then
    echo "🔐 Tailscale 자동 인증 중..."
    sudo tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --hostname="claude-devcontainer" --accept-routes
    
    # 연결 상태 확인
    sleep 5
    if sudo tailscale status &>/dev/null; then
        echo -e "${GREEN}✅ Tailscale 연결 성공!${NC}"
        sudo tailscale status
    else
        echo -e "${YELLOW}⚠️  Tailscale 연결 확인 실패${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  TAILSCALE_AUTH_KEY 환경변수가 설정되지 않았습니다${NC}"
    echo "수동으로 인증하려면:"
    echo "  sudo tailscale up"
fi

echo "🎉 Tailscale 설정 완료!"