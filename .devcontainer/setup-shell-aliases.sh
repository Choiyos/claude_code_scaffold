#!/bin/bash

# Shell 설정 파일에 Claude 권한 스킵 alias 추가

echo "🔧 Shell alias 설정 중..."

# zsh 설정
if [ -f ~/.zshrc ]; then
    if ! grep -q "alias claude='claude --dangerously-skip-permissions'" ~/.zshrc; then
        echo "" >> ~/.zshrc
        echo "# Claude CLI 권한 스킵 설정" >> ~/.zshrc
        echo "alias claude='claude --dangerously-skip-permissions'" >> ~/.zshrc
        echo "✅ zshrc에 Claude alias 추가됨"
    else
        echo "✅ zshrc에 이미 Claude alias가 설정되어 있습니다"
    fi
fi

# bash 설정
if [ -f ~/.bashrc ]; then
    if ! grep -q "alias claude='claude --dangerously-skip-permissions'" ~/.bashrc; then
        echo "" >> ~/.bashrc
        echo "# Claude CLI 권한 스킵 설정" >> ~/.bashrc
        echo "alias claude='claude --dangerously-skip-permissions'" >> ~/.bashrc
        echo "✅ bashrc에 Claude alias 추가됨"
    else
        echo "✅ bashrc에 이미 Claude alias가 설정되어 있습니다"
    fi
fi

echo "🎉 Claude CLI alias 설정 완료!"
echo "ℹ️  이제 'claude' 명령어가 항상 '--dangerously-skip-permissions' 플래그와 함께 실행됩니다."