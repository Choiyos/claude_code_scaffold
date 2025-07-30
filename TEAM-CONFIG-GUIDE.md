# 팀 Claude/MCP 설정 관리 가이드

## 📋 개요

이 가이드는 팀원들이 Claude Code와 MCP 서버 설정을 Git을 통해 체계적으로 관리하는 방법을 설명합니다.

## 🎯 핵심 개념

### 설정 동기화 흐름
```
개인 설정 변경 → Git으로 팀에 제안 → 검토 후 승인 → 자동으로 팀 전체에 동기화
```

### 설정 파일 구조
```
team-config/
├── claude-config.json     # Claude Code 기본 설정
└── mcp-servers.json       # MCP 서버 목록 및 설정
```

## 🚀 기본 사용법

### 1. 팀 설정을 내 환경으로 동기화 (Pull)
```bash
# 최신 팀 설정을 내 개인 환경으로 가져오기
bash scripts/sync-team-config.sh pull
```

**언제 사용하나요?**
- 다른 팀원이 MCP 서버를 추가했을 때
- Claude 설정이 업데이트되었을 때
- 새로 합류하거나 환경을 초기화할 때

### 2. 내 설정을 팀에 제안 (Push)
```bash
# 내가 변경한 설정을 팀에 제안하기
bash scripts/sync-team-config.sh push
```

**언제 사용하나요?**
- 유용한 MCP 서버를 발견했을 때
- Claude 설정을 개선했을 때
- 새로운 개발 도구를 팀과 공유하고 싶을 때

### 3. 설정 상태 확인
```bash
# 현재 설정 상태와 변경 이력 확인
bash scripts/sync-team-config.sh status
```

### 4. 설정 파일 검증
```bash
# JSON 문법 및 필수 필드 검증
bash scripts/sync-team-config.sh validate
```

## 📝 실제 사용 시나리오

### 시나리오 1: 새로운 MCP 서버 추가하기

**상황**: 새로운 MCP 서버 `@awesome/new-mcp-server`를 발견했고 팀과 공유하고 싶음

1. **개인 환경에서 테스트**
   ```bash
   # MCP 서버 설치
   npm install -g @awesome/new-mcp-server
   
   # ~/.claude/mcp-servers.json에서 수동으로 추가하여 테스트
   ```

2. **팀에 제안**
   ```bash
   bash scripts/sync-team-config.sh push
   ```

3. **커밋 메시지 입력**
   ```
   새로운 MCP 서버 추가: @awesome/new-mcp-server
   
   - 기능: 코드 리팩터링 자동화
   - 테스트 완료: 3일간 개인 환경에서 안정성 확인
   - 추천 이유: 코드 품질 향상에 도움
   ```

4. **Pull Request 생성**
   - GitHub에서 자동 생성된 브랜치로 PR 생성
   - 팀 리더 또는 동료의 검토 요청

5. **승인 후 자동 동기화**
   - PR이 승인되면 모든 팀원에게 자동으로 알림
   - 각자 `sync pull` 명령어로 업데이트

### 시나리오 2: 팀 설정 업데이트 받기

**상황**: Slack에서 "MCP 서버 설정이 업데이트되었으니 동기화하세요" 알림을 받음

1. **최신 변경사항 확인**
   ```bash
   git pull origin main
   bash scripts/sync-team-config.sh status
   ```

2. **설정 동기화**
   ```bash
   bash scripts/sync-team-config.sh pull
   ```

3. **새로운 MCP 서버 설치 (필요한 경우)**
   ```bash
   # 새로 추가된 서버들 자동 설치
   npm install -g $(jq -r '.mcpServers | to_entries[] | .value.args[0]' ~/.claude/mcp-servers.json)
   ```

4. **Claude Code 재시작**
   ```bash
   # DevContainer 환경에서는 터미널 재시작
   exec zsh
   ```

### 시나리오 3: 설정 충돌 해결

**상황**: 같은 시간에 여러 팀원이 다른 설정을 변경하여 충돌 발생

1. **충돌 감지**
   ```bash
   git pull origin main
   # 충돌 메시지 확인
   ```

2. **충돌 해결 도구 사용**
   ```bash
   bash scripts/sync-team-config.sh resolve
   ```

3. **수동 편집 (필요한 경우)**
   ```bash
   # VS Code에서 충돌 파일 편집
   code team-config/mcp-servers.json
   ```

4. **해결 완료 확인**
   ```bash
   bash scripts/sync-team-config.sh validate
   ```

## 🔧 고급 기능

### 자동 알림 시스템

프로젝트에 설치된 Git Hooks가 다음 기능을 제공합니다:

- **pre-commit**: 설정 파일 커밋 전 자동 검증
- **post-merge**: 팀 설정 변경 시 자동 알림

### 설정 백업

모든 설정 변경 시 자동으로 백업이 생성됩니다:
```bash
# 백업 위치
ls /workspace/.config-backups/
```

### 설정 버전 관리

```bash
# 설정 변경 이력 확인
git log --oneline --grep="config:"

# 특정 시점으로 롤백
git checkout <commit-hash> -- team-config/
bash scripts/sync-team-config.sh validate
```

## 📋 설정 파일 형식

### claude-config.json
```json
{
  "allowedTools": [],
  "hasTrustDialogAccepted": true,
  "hasCompletedProjectOnboarding": true,
  "theme": "dark",
  "model": "sonnet"
}
```

### mcp-servers.json
```json
{
  "mcpServers": {
    "sequential": {
      "command": "node",
      "args": ["@modelcontextprotocol/server-sequential-thinking"],
      "description": "Multi-step reasoning and systematic analysis"
    },
    "context7": {
      "command": "node", 
      "args": ["@upstash/context7-mcp"],
      "description": "Latest documentation and library information"
    }
  }
}
```

## 🚨 주의사항

### 보안 고려사항
- 민감한 정보 (API 키, 토큰 등)는 설정 파일에 포함하지 마세요
- 개인 정보는 개인 환경에만 보관하세요

### 호환성 확인
- 새로운 MCP 서버 추가 시 모든 플랫폼(Windows, macOS, Linux)에서 호환성 확인
- Node.js 버전 의존성 체크

### 변경사항 테스트
- 개인 환경에서 충분히 테스트 후 팀에 제안
- 중요한 변경사항은 점진적으로 적용

## 🛠️ 문제 해결

### 동기화 실패
```bash
# Git 상태 정리
git status
git stash  # 필요한 경우

# 강제 동기화
git fetch origin
git reset --hard origin/main
bash scripts/sync-team-config.sh pull
```

### MCP 서버 설치 실패
```bash
# npm 캐시 정리
npm cache clean --force

# 개별 서버 수동 설치
npm install -g @specific/mcp-server
```

### 설정 파일 오류
```bash
# JSON 문법 검증
jq empty team-config/claude-config.json
jq empty team-config/mcp-servers.json

# 설정 파일 복구
git checkout HEAD -- team-config/
```

## 📞 도움 요청

문제가 발생하면:
1. 먼저 `bash scripts/sync-team-config.sh status`로 상태 확인
2. 에러 메시지와 함께 팀 채널에 문의
3. 필요시 `git log --oneline -10`으로 최근 변경 이력 공유

---

**마지막 업데이트**: 2024-01-30  
**관련 파일**: `scripts/sync-team-config.sh`, `.githooks/`, `team-config/`