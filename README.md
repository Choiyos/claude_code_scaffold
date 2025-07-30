# Claude Code DevContainer 환경

**목적**: Claude Code나 MCP가 전혀 설치되지 않은 맥북에서도 git clone + VS Code 컨테이너 열기만으로 현재 Windows 환경과 동일한 Claude Code 개발환경을 즉시 사용할 수 있는 DevContainer 기반 개발환경

## 🎯 주요 특징

- **제로 설치**: 맥북에 Claude Code/MCP 설치 불필요
- **완전 격리**: 컨테이너 내에서 모든 환경 독립 실행
- **환경 동일성**: Windows 환경과 동일한 Claude Code 설정
- **즉시 사용**: git clone 후 VS Code에서 컨테이너 열기만 하면 완료

## 🚀 사용 방법

### 1. 리포지토리 클론
```bash
git clone <this-repository>
cd claude_code_scaffold
```

### 2. VS Code에서 DevContainer 열기
1. VS Code 실행
2. 클론한 폴더 열기
3. VS Code에서 팝업 표시될 때 "Reopen in Container" 클릭
   (또는 `Ctrl+Shift+P` → "Dev Containers: Reopen in Container")

### 3. 자동 설정 완료 대기
- 컨테이너 빌드 및 Claude Code 환경 자동 설정
- 약 3-5분 소요 (최초 실행시)

### 4. 즉시 사용 가능
```bash
# Claude Code CLI 사용
claude-code --help

# 서비스 상태 확인
docker-compose ps

# Grafana 대시보드 접속
# http://localhost:3010 (admin/admin)
```

## 📦 포함된 구성요소

### Claude Code 환경
- **Claude Code CLI**: 1.0.63 버전
- **MCP 서버들**:
  - `@modelcontextprotocol/server-sequential-thinking`
  - `@upstash/context7-mcp`  
  - `@21st-dev/magic`
  - `@playwright/mcp`
- **설정 파일**: Windows 환경과 동일한 설정 자동 적용

### 개발 런타임
- **Node.js**: 18.20.8
- **Python**: 3.11
- **Shell**: Zsh + Oh My Zsh

### 인프라 서비스
- **PostgreSQL**: 5432 포트
- **Redis**: 6379 포트  
- **Prometheus**: 9090 포트 (메트릭 수집)
- **Grafana**: 3010 포트 (모니터링 대시보드)

## 🔧 환경 구성

### DevContainer 설정
- **OS**: Ubuntu 22.04 LTS
- **사용자**: developer (uid:1000, gid:1000)
- **Shell**: Zsh (기본)
- **권한**: sudo 무패스워드 사용 가능

### 자동 설정 내용
1. Claude Code CLI 설치 및 설정
2. MCP 서버들 설치
3. 팀 공통 설정 파일 적용
4. Git 기본 설정 및 별칭
5. 개발 도구 및 유틸리티 설치
6. 인프라 서비스 자동 시작

## 📁 디렉토리 구조

```
claude-dev-env/
├── .devcontainer/              # DevContainer 설정
│   ├── devcontainer.json      # VS Code 컨테이너 설정
│   ├── Dockerfile             # 컨테이너 이미지 정의
│   └── setup-claude-environment.sh  # 환경 설정 스크립트
├── team-config/               # 팀 공통 설정
│   ├── claude-config.json     # Claude Code 기본 설정
│   └── mcp-servers.json       # MCP 서버 설정
├── config/                    # 인프라 설정
│   └── prometheus.yml         # Prometheus 설정
├── docker-compose.yml         # 인프라 서비스 정의
└── README.md                  # 이 파일
```

## 🛠️ 트러블슈팅

### 컨테이너 빌드 실패시
```bash
# DevContainer 재빌드
Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

### Claude Code CLI 설치 확인
```bash
# 컨테이너 내에서 실행
claude-code --version
which claude-code
```

### MCP 서버 상태 확인
```bash
# MCP 서버 설정 파일 확인
cat ~/.claude/mcp-servers.json

# Node.js 글로벌 패키지 확인
npm list -g --depth=0
```

### 서비스 상태 확인
```bash
# 인프라 서비스 상태
docker-compose ps

# 서비스 로그 확인
docker-compose logs -f

# 서비스 재시작
docker-compose restart
```

## 🔗 서비스 접속 정보

- **Grafana 대시보드**: http://localhost:3010
  - 계정: admin / admin
- **Prometheus**: http://localhost:9090
- **PostgreSQL**: localhost:5432
  - DB: claude_environment
  - 사용자: claude_env
  - 비밀번호: dev_password_change_in_production
- **Redis**: localhost:6379

## 📝 개발 워크플로우

1. **프로젝트 시작**: VS Code에서 DevContainer 열기
2. **개발 작업**: Claude Code CLI 사용하여 개발
3. **모니터링**: Grafana 대시보드에서 메트릭 확인
4. **종료**: VS Code 닫기 (컨테이너 자동 정리)

## ⚡ 성능 최적화

- **컨테이너 이미지**: 최적화된 Ubuntu 22.04 기반
- **설정 시간**: 3-5분 (최초), 30초 (이후)
- **리소스 사용량**: 최소화된 서비스 구성
- **캐싱**: Docker 레이어 캐싱 활용

---

**마지막 업데이트**: 2024-01-30  
**호환성**: macOS, Windows, Linux (VS Code + Docker 필요)  
**라이선스**: MIT