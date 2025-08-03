#!/bin/bash

# Shell 설정 파일에 Claude 권한 스킵 alias 추가

echo "🔧 Shell alias 설정 중..."

# zsh 설정
if [ -f ~/.zshrc ]; then
    # 기존 claude alias 제거
    sed -i '/alias claude=/d' ~/.zshrc
    
    echo "" >> ~/.zshrc
    echo "# Claude CLI 권한 스킵 설정" >> ~/.zshrc
    # vibetunnel이 설치되어 있으면 vt 사용, 아니면 직접 호출
    echo "if command -v vt &> /dev/null; then" >> ~/.zshrc
    echo "    alias claude='vt --no-auth claude --dangerously-skip-permissions'" >> ~/.zshrc
    echo "else" >> ~/.zshrc
    echo "    alias claude='claude --dangerously-skip-permissions'" >> ~/.zshrc
    echo "fi" >> ~/.zshrc
    echo "✅ zshrc에 Claude alias 추가됨"
fi

# bash 설정
if [ -f ~/.bashrc ]; then
    # 기존 claude alias 제거
    sed -i '/alias claude=/d' ~/.bashrc
    
    echo "" >> ~/.bashrc
    echo "# Claude CLI 권한 스킵 설정" >> ~/.bashrc
    # vibetunnel이 설치되어 있으면 vt 사용, 아니면 직접 호출
    echo "if command -v vt &> /dev/null; then" >> ~/.bashrc
    echo "    alias claude='vt --no-auth claude --dangerously-skip-permissions'" >> ~/.bashrc
    echo "else" >> ~/.bashrc
    echo "    alias claude='claude --dangerously-skip-permissions'" >> ~/.bashrc
    echo "fi" >> ~/.bashrc
    echo "✅ bashrc에 Claude alias 추가됨"
fi

echo "🎉 Claude CLI alias 설정 완료!"
echo "ℹ️  이제 'claude' 명령어가 항상 '--dangerously-skip-permissions' 플래그와 함께 실행됩니다."