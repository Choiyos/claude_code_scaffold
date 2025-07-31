# 🤖 Claude Code DevContainer Environment

> **AI 개발을 위한 완전 자동화 DevContainer** - Claude CLI, MCP 서버, AI 도구들이 3분 만에 자동 설치되는 개발 환경

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)](https://github.com/YOUR_USERNAME/claude_code_scaffold)
[![VS Code](https://img.shields.io/badge/VS%20Code-DevContainer-blue)](https://code.visualstudio.com/docs/devcontainers/containers)
[![Docker](https://img.shields.io/badge/Docker-Required-blue)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌟 **핵심 특징**

- **🎯 3분 설정**: Git clone → VS Code 열기 → 자동 설치 완료
- **🤖 AI 도구 완비**: Claude CLI + 5개 MCP 서버 + Claude Squad + SuperClaude Framework
- **⚡ 완전 자동화**: 모든 설치 및 설정이 자동으로 처리
- **🌍 크로스 플랫폼**: Windows, macOS, Linux 동일한 경험
- **🔗 호스트 연동**: 기존 프로젝트와 바로 연동 가능
- **📊 개발 도구**: PostgreSQL, Redis, Grafana 모니터링 포함

---

## 📋 **사전 요구사항**

### 필수 소프트웨어

| 소프트웨어 | Windows | macOS | Linux |
|------------|---------|-------|-------|
| **VS Code** | [다운로드](https://code.visualstudio.com/) | [다운로드](https://code.visualstudio.com/) | [다운로드](https://code.visualstudio.com/) |
| **Docker Desktop** | [다운로드](https://www.docker.com/products/docker-desktop) | [다운로드](https://www.docker.com/products/docker-desktop) | `sudo apt install docker.io` |
| **Dev Containers 확장** | VS Code에서 설치 | VS Code에서 설치 | VS Code에서 설치 |

### VS Code 확장 설치
1. VS Code 실행
2. `Ctrl+Shift+X` (macOS: `Cmd+Shift+X`)
3. "Dev Containers" 검색 및 설치

---

## 🚀 **빠른 시작 가이드**

### 1️⃣ **환경변수 설정 (선택사항)**

Claude CLI 토큰과 호스트 폴더 경로를 설정하면 완전 자동화가 가능합니다:

**Windows (PowerShell):**
```powershell
# Claude CLI 토큰 (자동 로그인)
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_OAUTH_TOKEN", "your-token-here", "User")

# 호스트 프로젝트 폴더 (선택사항)
[Environment]::SetEnvironmentVariable("CLAUDE_HOST_PROJECTS", "C:\dev", "User")
```

**macOS/Linux (Terminal):**
```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
echo 'export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"' >> ~/.zshrc
echo 'export CLAUDE_HOST_PROJECTS="/Users/yosebchoi/Documents/git"' >> ~/.zshrc
source ~/.zshrc
```

### 2️⃣ **프로젝트 클론**

```bash
git clone https://github.com/YOUR_USERNAME/claude_code_scaffold.git
cd claude_code_scaffold
```

### 3️⃣ **DevContainer 실행**

**방법 1: VS Code GUI**
1. VS Code에서 폴더 열기
2. 우하단 팝업에서 **"Reopen in Container"** 클릭

**방법 2: 명령 팔레트**
1. `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)
2. **"Dev Containers: Reopen in Container"** 선택

### 4️⃣ **자동 설정 완료 대기**
- 첫 실행: **3-5분** (Docker 이미지 빌드 + 도구 설치)
- 이후 실행: **30초** (캐시된 환경 사용)

### 5️⃣ **즉시 사용 시작!**

```bash
# 🤖 AI 도구들 확인
claude --help                    # Claude CLI
cs --help                        # Claude Squad
sc --help                        # SuperClaude Framework

# 📦 MCP 서버 확인 (자동 설치됨)
claude mcp list

# 🖥️ 서비스 상태 확인
docker-compose ps

# 📊 모니터링 대시보드 접속
# http://localhost:3010 (admin/admin)
```

---

## 🛠️ **통합된 AI 개발 도구**

### 🎯 **Claude CLI + MCP Servers**
- **Claude Code CLI**: 최신 버전 자동 설치
- **자동 MCP 서버 5개**:
  - `@modelcontextprotocol/server-sequential-thinking` - 복잡한 추론
  - `@upstash/context7-mcp` - 문서 컨텍스트
  - `@21st-dev/magic` - UI 컴포넌트 생성
  - `@executeautomation/playwright-mcp-server` - 브라우저 자동화
  - `@playwright/mcp` - 공식 Playwright 지원

### 🤝 **Claude Squad**
- **AI 협업 도구**: 팀 프로젝트 관리
- **tmux 통합**: 멀티 세션 관리
- **GitHub CLI**: Git 워크플로우 자동화
- **별칭**: `cs` 명령어로 간편 사용

### 🚀 **SuperClaude Framework**
- **고급 AI 자동화**: Python 기반 프레임워크
- **uv 패키지 관리자**: 초고속 Python 패키지 관리
- **최소 설치 모드**: 빠른 시작
- **별칭**: `sc` 명령어로 간편 사용

---

## 📁 **프로젝트 개발 방법**

### 🎯 **방법 1: 환경변수로 호스트 폴더 연결 (권장)**

환경변수를 설정하면 **Git 변경점 없이** 호스트 폴더를 자동으로 연결할 수 있습니다:

```bash
# 환경변수 설정 후 DevContainer 빌드
# → 자동으로 /host/projects에 연결됨

# DevContainer 내부에서
cd /host/projects              # 호스트 폴더에 직접 접근
cd your-existing-project       # 기존 프로젝트로 이동

# AI 도구들로 즉시 개발 시작
claude --help
cs new session
sc --help
```

**장점**:
- ✅ **Git 안전**: 개인 설정이 버전 관리에 포함되지 않음
- ✅ **자동 연결**: DevContainer 빌드시 자동으로 마운트
- ✅ **기존 프로젝트**: 호스트의 기존 프로젝트를 그대로 사용

### 🔧 **방법 2: workspace 폴더 사용**

별도 설정 없이 간단하게 사용하는 방법:

```bash
# DevContainer 내부에서
cd workspace

# 개발하려는 프로젝트 클론
git clone https://github.com/your-username/your-project.git
cd your-project

# AI 도구들로 즉시 개발 시작
claude --help
cs new session
sc --help
```

### 🔧 **방법 3: 로컬 설정 파일 (고급)**

기존 호스트 폴더를 DevContainer에 직접 연결하는 방법입니다. **개인용 설정 파일**을 사용해서 Git 변경점 없이 설정할 수 있습니다.

#### **📝 설정 방법**

**1단계: 로컬 설정 파일 생성**
```bash
# 호스트 컴퓨터에서 (DevContainer 외부)
cd claude_code_scaffold
cp .devcontainer/devcontainer.local.example.json .devcontainer/devcontainer.local.json
```

**2단계: 개인 경로 설정**
```json
// .devcontainer/devcontainer.local.json 파일 편집
{
  "name": "Claude Code Development Environment (Local)",
  "mounts": [
    "source=/Users/yosebchoi/dev,target=/host/projects,type=bind,consistency=cached",
    "source=/Users/yosebchoi/Documents,target=/host/Documents,type=bind,consistency=cached",
    "source=/Users/yosebchoi/Downloads,target=/host/Downloads,type=bind,consistency=cached"
  ]
}
```

**3단계: DevContainer 빌드**
```bash
# VS Code에서
# Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

#### **💡 설정 팁**
- ✅ **Git 안전**: `.devcontainer/*.local.json` 파일은 Git에서 자동 제외
- ✅ **경로 확인**: 실제 존재하는 폴더 경로만 사용하세요
- ✅ **절대 경로**: `/Users/username/folder` 형태의 전체 경로 사용

### 🚀 **사용 방법**

설정 후 DevContainer에서:

```bash
# 마운트된 폴더 확인
ls /host/               # projects, Documents, Downloads

# 기존 프로젝트로 이동
cd /host/projects/my-existing-project

# AI 도구들로 개발 시작
claude --help
cs new session
sc --help
```

### 🚨 **트러블슈팅**

#### **환경변수 설정이 적용되지 않을 때**
```bash
# 1. 환경변수 설정 확인 (호스트에서)
echo $CLAUDE_HOST_PROJECTS     # 환경변수 값 확인

# 2. 환경변수 재설정
export CLAUDE_HOST_PROJECTS="/Users/yosebchoi/Documents/git"
echo 'export CLAUDE_HOST_PROJECTS="/Users/yosebchoi/Documents/git"' >> ~/.zshrc

# 3. DevContainer 완전 재빌드 (필수!)
# Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

#### **"No such file or directory" 오류**
```bash
# 원인: 환경변수 경로가 존재하지 않음
# 해결: 폴더 생성 후 재빌드

# 폴더 존재 확인 및 생성 (호스트에서)
ls -la /Users/yosebchoi/Documents/git     # 확인
mkdir -p /Users/yosebchoi/Documents/git   # 생성

# DevContainer 재빌드
# Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

#### **DevContainer 빌드 실패**
```bash
# 1. JSON 문법 확인
cat .devcontainer/devcontainer.local.json | python -m json.tool

# 2. 경로에 특수문자나 공백 확인
# 잘못된 예: /Users/홍길동/dev (한글 경로)
# 올바른 예: /Users/user/dev

# 3. DevContainer 완전 재빌드
# Ctrl+Shift+P → "Dev Containers: Rebuild Container Without Cache"
```

#### **VS Code 연결 실패**
```bash
# 1. Docker Desktop 실행 상태 확인
docker --version

# 2. 로컬 설정 파일 제거 후 재시도
rm .devcontainer/devcontainer.local.json
# 기본 DevContainer로 먼저 테스트
```

---

## 💻 **플랫폼별 특화 가이드**

### 🪟 **Windows 사용자**

**필수 설정:**
- **Docker Desktop** 실행 상태 유지
- **WSL2** 활성화 (Docker Desktop이 자동 설정)

**권장 폴더 구조:**
```
C:\dev\                    # 개발 프로젝트 폴더
├── project1\
├── project2\
└── claude_code_scaffold\  # 이 프로젝트
```

**접근 방법:**
```bash
# DevContainer 내에서
cd /host/dev/project1      # C:\dev\project1에 접근
```

### 🍎 **macOS 사용자**

**필수 설정:**
- **Docker Desktop** 설치 및 실행
- **Rosetta 2** (Apple Silicon 맥에서 필요시)

**권장 폴더 구조:**
```
~/dev/                     # 개발 프로젝트 폴더
├── project1/
├── project2/
└── claude_code_scaffold/  # 이 프로젝트
```

**접근 방법:**
```bash
# DevContainer 내에서
cd /host/dev/project1      # ~/dev/project1에 접근
```

### 🐧 **Linux 사용자**

**Docker 설치:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker $USER
# 로그아웃 후 재로그인 필요
```

**권장 폴더 구조:**
```
~/dev/                     # 개발 프로젝트 폴더
├── project1/
├── project2/
└── claude_code_scaffold/  # 이 프로젝트
```

---

## ⚙️ **고급 설정**

### 🔧 **devcontainer.json 커스터마이징**

추가 폴더 마운트:
```json
{
  "mounts": [
    "source=/your/custom/path,target=/host/custom,type=bind,consistency=cached"
  ]
}
```

### 🎨 **개발 도구 추가**

`setup-claude-environment.sh`에 원하는 도구 추가:
```bash
# 예: Go 언어 설치
install_golang() {
    log_info "Go 설치 중..."
    wget -c https://golang.org/dl/go1.21.0.linux-amd64.tar.gz
    sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.zshrc
}
```

---

## 🔍 **트러블슈팅**

### ❌ **일반적인 문제들**

**1. Docker 데몬이 실행되지 않음**
```bash
# Windows/macOS: Docker Desktop 실행
# Linux: sudo systemctl start docker
```

**2. DevContainer 빌드 실패**
```bash
# VS Code에서
Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

**3. 권한 문제 (Linux)**
```bash
sudo usermod -aG docker $USER
# 로그아웃 후 재로그인
```

### 🔧 **상태 확인 명령어**

```bash
# 전체 도구 상태 확인
claude --version && cs --help && sc --help

# MCP 서버 상태
claude mcp list

# 서비스 상태
docker-compose ps

# 로그 확인
docker-compose logs -f
```

---

## 📊 **내장 서비스**

### 접속 정보:
- **📈 Grafana 대시보드**: http://localhost:3010 (admin/admin)
- **📊 Prometheus**: http://localhost:9090
- **🗄️ PostgreSQL**: localhost:5432
- **🔄 Redis**: localhost:6379

### 모니터링:
- **시스템 메트릭**: CPU, 메모리, 디스크 사용량
- **서비스 상태**: Docker 컨테이너 모니터링
- **개발 메트릭**: 빌드 시간, 테스트 결과

---

## 🤝 **기여하기**

1. **Fork** 이 리포지토리
2. **Feature 브랜치** 생성 (`git checkout -b feature/amazing-feature`)
3. **변경사항 커밋** (`git commit -m 'Add some amazing feature'`)
4. **브랜치에 Push** (`git push origin feature/amazing-feature`)
5. **Pull Request** 생성

---

## 📜 **라이선스**

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 🙋‍♂️ **지원 및 문의**

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/claude_code_scaffold/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/claude_code_scaffold/discussions)
- **Wiki**: [프로젝트 Wiki](https://github.com/YOUR_USERNAME/claude_code_scaffold/wiki)

---

## 🎉 **성공 사례**

> *"3분 만에 팀 전체가 동일한 AI 개발환경을 구축했습니다!"*  
> *"기존 프로젝트를 그대로 사용하면서 최신 AI 도구들을 바로 적용할 수 있어서 너무 좋아요!"*  
> *"Claude CLI + Claude Squad + SuperClaude Framework 조합이 개발 생산성을 10배 향상시켰습니다!"*

---

<div align="center">

**⭐ 이 프로젝트가 도움이 되셨다면 Star를 눌러주세요! ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=YOUR_USERNAME/claude_code_scaffold&type=Date)](https://star-history.com/#YOUR_USERNAME/claude_code_scaffold&Date)

**🚀 Made with ❤️ by AI Development Community**

</div>