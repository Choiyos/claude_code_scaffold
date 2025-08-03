#!/bin/bash

# Shell 설정 파일에 Claude 권한 스킵 alias 추가

echo "🔧 Shell alias 설정 중..."

# zsh 설정
if [ -f ~/.zshrc ]; then
    # 기존 claude alias 제거
    sed -i '/alias claude=/d' ~/.zshrc
    
    echo "" >> ~/.zshrc
    echo "# Claude CLI 권한 스킵 설정 및 vibetunnel 통합" >> ~/.zshrc
    echo "alias claude='vt --no-auth claude --dangerously-skip-permissions'" >> ~/.zshrc
    echo "✅ zshrc에 Claude alias 추가됨 (vibetunnel 통합)"
fi

# bash 설정
if [ -f ~/.bashrc ]; then
    # 기존 claude alias 제거
    sed -i '/alias claude=/d' ~/.bashrc
    
    echo "" >> ~/.bashrc
    echo "# Claude CLI 권한 스킵 설정 및 vibetunnel 통합" >> ~/.bashrc
    echo "alias claude='vt --no-auth claude --dangerously-skip-permissions'" >> ~/.bashrc
    echo "✅ bashrc에 Claude alias 추가됨 (vibetunnel 통합)"
fi

echo "🎉 Claude CLI alias 설정 완료!"
echo "ℹ️  이제 'claude' 명령어가 항상 'vt --no-auth claude --dangerously-skip-permissions'로 실행됩니다."