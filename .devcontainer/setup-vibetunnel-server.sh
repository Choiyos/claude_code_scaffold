#!/bin/bash

echo "🌐 VibeTunnel 서버 설정을 시작합니다..."

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 기존 vibetunnel 프로세스 종료
echo "🔄 기존 VibeTunnel 프로세스 확인 중..."
if pgrep -f "vibetunnel.*--bind" > /dev/null; then
    echo "⚠️  기존 VibeTunnel 서버를 종료합니다..."
    pkill -f "vibetunnel.*--bind"
    sleep 2
fi

# VibeTunnel 서버 시작
echo "🚀 VibeTunnel 서버를 시작합니다..."
echo "   - 포트: 4020"
echo "   - 인증: 없음 (--no-auth)"
echo "   - 바인드: 0.0.0.0 (모든 인터페이스)"

# 로그 파일 생성
mkdir -p /home/developer/.vibetunnel
LOG_FILE="/home/developer/.vibetunnel/server.log"

# 백그라운드에서 실행
nohup vibetunnel --no-auth --bind 0.0.0.0 --port 4020 > "$LOG_FILE" 2>&1 &
VIBETUNNEL_PID=$!

# 서버가 시작될 때까지 대기
echo "⏳ VibeTunnel 서버가 시작되기를 기다리는 중..."
for i in {1..10}; do
    if curl -s http://localhost:4020 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ VibeTunnel 서버가 성공적으로 시작되었습니다!${NC}"
        echo "   - PID: $VIBETUNNEL_PID"
        echo "   - 로그: $LOG_FILE"
        
        # Tailscale IP 확인
        if command -v tailscale &> /dev/null && tailscale status &> /dev/null; then
            TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
            if [ -n "$TAILSCALE_IP" ]; then
                echo -e "${GREEN}📡 Tailscale 접속 주소: http://$TAILSCALE_IP:4020/${NC}"
            fi
        fi
        
        echo -e "${GREEN}🌐 로컬 접속 주소: http://localhost:4020/${NC}"
        break
    fi
    sleep 1
done

# 시작 실패 시
if ! curl -s http://localhost:4020 > /dev/null 2>&1; then
    echo -e "${RED}❌ VibeTunnel 서버 시작 실패${NC}"
    echo "로그 확인: tail -f $LOG_FILE"
    exit 1
fi

echo "🎉 VibeTunnel 서버 설정 완료!"