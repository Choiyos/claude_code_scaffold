#!/bin/bash

# DevContainer 시작 시 자동으로 실행되는 백그라운드 서비스들

echo "🚀 필수 백그라운드 서비스들을 시작합니다..."

# Tailscale 데몬 시작
if command -v tailscaled &> /dev/null; then
    echo "🔍 tailscaled 명령어 확인됨"
    
    # 기존 프로세스 확인
    if pgrep -f "tailscaled.*userspace-networking" > /dev/null; then
        echo "✅ Tailscale 데몬이 이미 실행 중입니다"
        echo "📊 프로세스 정보:"
        ps aux | grep tailscaled | grep -v grep
    else
        echo "🔧 Tailscale 데몬 시작 중..."
        
        # 디렉토리 생성
        sudo mkdir -p /var/lib/tailscale /var/run/tailscale
        echo "📁 디렉토리 생성 완료"
        
        # setsid를 사용해서 완전히 독립적인 프로세스로 실행
        echo "🚀 실행 명령어: setsid sudo tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &"
        setsid sudo tailscaled --tun=userspace-networking --socks5-server=localhost:1055 --state=/var/lib/tailscale/tailscaled.state >/tmp/tailscaled.log 2>&1 &
        echo "🔧 Tailscaled를 독립 세션으로 시작했습니다"
        
        # 3초 대기
        echo "⏳ 3초 대기 중..."
        sleep 3
        
        # 프로세스 확인
        if pgrep -f "tailscaled.*userspace-networking" > /dev/null; then
            echo "✅ Tailscaled 프로세스 시작 성공"
            echo "📊 프로세스 정보:"
            ps aux | grep tailscaled | grep -v grep
            
            # 웹 로그인으로 연결 (더 간단하고 안정적)
            echo "🔐 Tailscale 웹 로그인 연결을 시작합니다..."
            echo "📋 다음 명령어를 실행해서 웹 브라우저에서 Google 로그인하세요:"
            echo "   sudo tailscale up --hostname=claude-devcontainer --accept-routes"
            echo ""
            echo "🚀 자동 실행 중..."
            sudo tailscale up --hostname="claude-devcontainer" --accept-routes
        else
            echo "❌ Tailscaled 프로세스 시작 실패"
            echo "📝 디버깅 정보:"
            echo "  - PID $TAILSCALED_PID 상태: $(ps -p $TAILSCALED_PID || echo '프로세스 없음')"
            echo "  - tailscaled 프로세스: $(pgrep tailscaled || echo '없음')"
        fi
    fi
else
    echo "❌ tailscaled 명령어를 찾을 수 없습니다"
fi

# VibeTunnel 서버 시작
if command -v vibetunnel &> /dev/null; then
    if ! pgrep -f "vibetunnel.*--no-auth" > /dev/null; then
        echo "🔧 VibeTunnel 서버 시작 중..."
        mkdir -p /home/developer/.vibetunnel
        nohup vibetunnel --no-auth --bind 0.0.0.0 --port 4020 > /home/developer/.vibetunnel/server.log 2>&1 &
        sleep 2
        
        if curl -s http://localhost:4020 > /dev/null 2>&1; then
            echo "✅ VibeTunnel 서버 시작 완료: http://localhost:4020"
            
            # Tailscale IP가 있으면 표시
            if command -v tailscale &> /dev/null; then
                TAILSCALE_IP=$(sudo tailscale ip -4 2>/dev/null || echo "")
                if [ -n "$TAILSCALE_IP" ]; then
                    echo "📡 Tailscale 접속: http://$TAILSCALE_IP:4020"
                fi
            fi
        else
            echo "⚠️  VibeTunnel 서버 시작 실패"
        fi
    else
        echo "✅ VibeTunnel 서버가 이미 실행 중입니다"
    fi
fi

echo "🎉 백그라운드 서비스 시작 완료!"