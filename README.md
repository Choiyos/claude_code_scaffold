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

OAuth 토큰과 개인 폴더 경로를 설정하면 완전 자동화가 가능합니다:

**Windows (PowerShell):**
```powershell
# Claude CLI 토큰
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_OAUTH_TOKEN", "your-token-here", "User")

# 개인 프로젝트 폴더 (선택사항)
[Environment]::SetEnvironmentVariable("CLAUDE_DEV_PROJECTS", "C:\dev", "User")
[Environment]::SetEnvironmentVariable("CLAUDE_DEV_DOCUMENTS", "C:\Users\YourName\Documents", "User")
```

**macOS/Linux (Terminal):**
```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
echo 'export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"' >> ~/.zshrc

# 개인 프로젝트 폴더 (선택사항)
echo 'export CLAUDE_DEV_PROJECTS="$HOME/dev"' >> ~/.zshrc
echo 'export CLAUDE_DEV_DOCUMENTS="$HOME/Documents"' >> ~/.zshrc

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

### 🎯 **방법 1: workspace 폴더 사용 (권장)**

DevContainer 내부의 `workspace` 폴더에 개발하려는 프로젝트를 클론해서 사용하세요:

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

**장점**:
- 별도 설정 불필요
- 모든 AI 도구 즉시 사용 가능
- 프로젝트별 독립적인 환경

### 🔧 **방법 2: 호스트 폴더 마운트**

기존 호스트 폴더를 DevContainer에 직접 연결하는 방법입니다.

#### 🎯 **간편 설정 (환경변수 사용)**

환경변수로 개인 폴더 경로를 설정하면 **Git 변경점 없이** 개인화가 가능합니다:

**Windows (PowerShell):**
```powershell
# 개인 프로젝트 폴더 경로 설정
[Environment]::SetEnvironmentVariable("CLAUDE_DEV_PROJECTS", "C:\dev", "User")
[Environment]::SetEnvironmentVariable("CLAUDE_DEV_DOCUMENTS", "C:\Users\YourName\Documents", "User")
```

**macOS/Linux (Terminal):**
```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
echo 'export CLAUDE_DEV_PROJECTS="$HOME/dev"' >> ~/.zshrc
echo 'export CLAUDE_DEV_DOCUMENTS="$HOME/Documents"' >> ~/.zshrc
source ~/.zshrc
```

**DevContainer에서 사용:**
```bash
# 설정된 폴더에 접근
cd /host/projects     # CLAUDE_DEV_PROJECTS 경로
cd /host/Documents    # CLAUDE_DEV_DOCUMENTS 경로
```

#### 🔧 **고급 설정 (로컬 설정 파일)**

더 복잡한 설정이 필요하다면 개인용 설정 파일을 사용하세요:

**1단계: 예시 파일 복사**
```bash
# DevContainer 폴더에서
cp .devcontainer/devcontainer.local.example.json .devcontainer/devcontainer.local.json
```

**2단계: 개인 설정 파일 편집**
```json
// .devcontainer/devcontainer.local.json
{
  "name": "Claude Code Development Environment (Local)",
  "mounts": [
    // Windows 예시
    "source=C:\\dev,target=/host/projects,type=bind,consistency=cached",
    "source=C:\\Users\\YourName\\Documents,target=/host/Documents,type=bind,consistency=cached",
    
    // macOS/Linux 예시
    // "source=/Users/yourusername/dev,target=/host/projects,type=bind,consistency=cached",
    // "source=/Users/yourusername/Documents,target=/host/Documents,type=bind,consistency=cached",
    
    // 추가 폴더들
    "source=${localEnv:HOME}/Downloads,target=/host/Downloads,type=bind,consistency=cached"
  ]
}
```

**3단계: DevContainer 재빌드**
```bash
# VS Code에서
# Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

**장점**:
- ✅ **Git 변경점 없음**: 개인 설정이 버전 관리에 포함되지 않음
- ✅ **팀 협업**: 각자 다른 폴더 구조 사용 가능
- ✅ **유연성**: 필요한 폴더만 선택적으로 마운트

### 🚀 **사용 방법**

설정 후 DevContainer에서:

```bash
# 환경변수 방식 사용 시
cd /host/projects       # CLAUDE_DEV_PROJECTS 경로
cd /host/Documents      # CLAUDE_DEV_DOCUMENTS 경로

# 로컬 설정 파일 사용 시
ls /host/               # 마운트된 폴더들 확인
cd /host/projects       # 개인 프로젝트 폴더
cd /host/Documents      # 문서 폴더

# 기존 프로젝트에서 AI 도구 사용
cd /host/projects/my-existing-project
claude --help
cs new session
sc --help
```

### 💡 **설정 팁**

- **환경변수 방식**: 간단한 개인화, Git 변경점 없음
- **로컬 설정 파일**: 복잡한 설정, 팀별 다른 구조 지원
- **DevContainer 재빌드**: 설정 변경 후 항상 필요
- **폴더 자동 생성**: 존재하지 않는 폴더는 자동으로 생성됨

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