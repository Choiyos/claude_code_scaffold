#!/bin/bash

echo "🔧 Tailscale 설정을 시작합니다..."

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Tailscale 데몬 시작
echo "🚀 Tailscale 데몬 시작 중..."

# 기존 tailscaled 프로세스 종료
sudo pkill tailscaled 2>/dev/null || true
sleep 1

# /var/run/tailscale 디렉토리 생성
sudo mkdir -p /var/run/tailscale
sudo chmod 755 /var/run/tailscale

# /var/lib/tailscale 디렉토리 생성
sudo mkdir -p /var/lib/tailscale
sudo chmod 755 /var/lib/tailscale

# tailscaled를 영구 백그라운드 프로세스로 시작
echo "🔧 tailscaled 영구 백그라운드 시작..."

# 기존 프로세스 확인 및 정리
if pgrep -f "tailscaled.*userspace-networking" > /dev/null; then
    echo "⚠️  기존 tailscaled 프로세스 종료 중..."
    sudo pkill -f "tailscaled.*userspace-networking"
    sleep 2
fi

# 사용자가 확인한 정확한 명령어로 실행
echo "🔧 사용자 확인 명령어 실행: sudo tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &"
sudo tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
TAILSCALED_PID=$!

echo "🔧 Tailscaled PID: $TAILSCALED_PID"

# 3초 대기 (사용자 확인된 시간)
echo "⏳ 3초 대기 중..."
sleep 3

# 프로세스 확인
if pgrep -f "tailscaled.*userspace-networking" > /dev/null; then
    echo "✅ Tailscaled 프로세스가 백그라운드에서 실행 중입니다."
    echo "📝 로그 확인: tail -f /var/log/tailscaled.log"
else
    echo "❌ Tailscaled 프로세스가 시작되지 않았습니다."
    echo "📝 로그 확인: cat /var/log/tailscaled.log"
    exit 1
fi

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