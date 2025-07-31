#!/bin/bash

echo "=== SuperClaude 수동 설치 테스트 스크립트 ==="
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 현재 상태 확인
echo -e "${YELLOW}1. 현재 SuperClaude 설치 상태 확인:${NC}"
if python3 -c "import SuperClaude" 2>/dev/null; then
    echo -e "${GREEN}✅ SuperClaude 패키지 설치됨${NC}"
    pip show SuperClaude | grep Version
else
    echo -e "${RED}❌ SuperClaude 패키지 없음${NC}"
    echo "먼저 설치: python3 -m pip install --user SuperClaude"
    exit 1
fi

echo ""
echo -e "${YELLOW}2. ~/.claude 디렉토리 상태:${NC}"
if [ -d ~/.claude ]; then
    echo -e "${GREEN}✅ ~/.claude 디렉토리 존재${NC}"
    echo "현재 파일 수: $(find ~/.claude -type f | wc -l)"
    
    # 핵심 파일 확인
    for file in COMMANDS.md RULES.md PRINCIPLES.md FLAGS.md; do
        if [ -f ~/.claude/$file ]; then
            echo -e "  ${GREEN}✓${NC} $file"
        else
            echo -e "  ${RED}✗${NC} $file"
        fi
    done
else
    echo -e "${RED}❌ ~/.claude 디렉토리 없음${NC}"
fi

echo ""
echo -e "${YELLOW}3. SuperClaude install 실행 (Quick Installation):${NC}"
echo "입력 순서: 1 (메뉴), y (기존 설치 덮어쓰기), y (설치 진행)"
echo ""

# 방법 1: --yes 플래그와 함께
echo -e "${YELLOW}방법 1: --yes 플래그 사용${NC}"
printf "1\n" | python3 -m SuperClaude install --yes --verbose

echo ""
echo -e "${YELLOW}4. 설치 결과 확인:${NC}"
if [ -f ~/.claude/COMMANDS.md ] && [ -f ~/.claude/RULES.md ]; then
    echo -e "${GREEN}✅ SuperClaude 설치 성공!${NC}"
    echo "설치된 파일들:"
    find ~/.claude -name "*.md" -type f | sort
else
    echo -e "${RED}❌ 설치 실패${NC}"
    echo ""
    echo -e "${YELLOW}수동 설치 시도:${NC}"
    echo "다음 명령어를 실행하고 프롬프트에 응답하세요:"
    echo "python3 -m SuperClaude install"
    echo ""
    echo "응답 순서:"
    echo "1. Enter your choice (1-3): 1"
    echo "2. Continue and update existing installation? [y/N]: y"
    echo "3. Proceed with installation? [Y/n]: y"
fi

echo ""
echo -e "${YELLOW}5. Claude Code 재시작 안내:${NC}"
echo "설치가 완료되면 Claude Code를 재시작해야 /sc 명령어가 활성화됩니다."
echo "터미널에서: claude"