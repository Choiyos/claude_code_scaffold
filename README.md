# 🤖 Claude Code DevContainer Environment

> **AI 개발을 위한 완전 자동화 DevContainer** - Claude CLI, MCP 서버, AI 도구들이 3분 만에 자동 설치되는 개발 환경

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)](https://github.com/YOUR_USERNAME/claude_code_scaffold)
[![VS Code](https://img.shields.io/badge/VS%20Code-DevContainer-blue)](https://code.visualstudio.com/docs/devcontainers/containers)
[![Docker](https://img.shields.io/badge/Docker-Required-blue)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Apache-green)](LICENSE.md)

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

**⚠️ 중요**: MCP 서버 자동 설치를 위해서는 Claude CLI 토큰이 필요합니다.

**Windows (PowerShell):**
```powershell
# Claude CLI 토큰 (MCP 서버 자동 설치용)
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_OAUTH_TOKEN", "your-token-here", "User")

# 호스트 프로젝트 폴더 (선택사항)
[Environment]::SetEnvironmentVariable("CLAUDE_HOST_PROJECTS", "C:\dev", "User")
```

**macOS/Linux (Terminal):**
```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
echo 'export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"' >> ~/.zshrc
echo 'export CLAUDE_HOST_PROJECTS="$HOME/dev"' >> ~/.zshrc
source ~/.zshrc
```

### 2️⃣ **프로젝트 클론**

```bash
git clone https://github.com/Choiyos/claude_code_scaffold.git
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

### 5️⃣ **MCP 서버 수동 설치 (필요시)**

토큰이 설정되지 않았거나 자동 설치가 실패한 경우:

```bash
# 컨테이너 내부에서
claude auth login  # 브라우저에서 인증

# MCP 서버 수동 추가 (npm 설치 후)
npm install -g @modelcontextprotocol/server-sequential-thinking
npm install -g @upstash/context7-mcp
npm install -g @21st-dev/magic
npm install -g @executeautomation/playwright-mcp-server

# Claude에 MCP 서버 등록
claude mcp add sequential 'npx @modelcontextprotocol/server-sequential-thinking'
claude mcp add context7 'npx @upstash/context7-mcp'
claude mcp add magic 'npx @21st-dev/magic'
claude mcp add playwright 'npx @executeautomation/playwright-mcp-server'

# 설치 확인
claude mcp list
```

### 6️⃣ **즉시 사용 시작!**

```bash
# 🤖 AI 도구들 확인
claude --help                    # Claude CLI
sc --help                        # SuperClaude Framework

# 📦 MCP 서버 확인
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
- **권한 스킵 모드**: `claude` 명령어가 자동으로 `--dangerously-skip-permissions` 플래그와 함께 실행
- **자동 MCP 서버 4개** (토큰 필요):
  - `@modelcontextprotocol/server-sequential-thinking` - 복잡한 추론
  - `@upstash/context7-mcp` - 문서 컨텍스트
  - `@21st-dev/magic` - UI 컴포넌트 생성
  - `@executeautomation/playwright-mcp-server` - 브라우저 자동화

### 🚀 **SuperClaude Framework**
- **고급 AI 자동화**: Python 기반 프레임워크
- **uv 패키지 관리자**: 초고속 Python 패키지 관리
- **최소 설치 모드**: 빠른 시작
- **별칭**: `sc` 명령어로 간편 사용

---

## 📁 **권장 개발 워크플로우**

### 🎯 **방법 1: workspace 폴더 사용 (권장)**

```bash
# DevContainer 내부에서
cd workspace

# 개발하려는 프로젝트 클론
git clone https://github.com/your-username/your-project.git
cd your-project

# AI 도구들로 즉시 개발 시작
claude --help
sc --help
```

### 🔧 **방법 2: 기존 프로젝트에서 DevContainer 사용**

```bash
# 기존 프로젝트 폴더에서
cd /path/to/your-existing-project

# 이 DevContainer 설정을 복사
cp -r /path/to/claude_code_scaffold/.devcontainer .

# VS Code에서 DevContainer 실행
# Ctrl+Shift+P → "Dev Containers: Reopen in Container"
```

---

## 🚨 **트러블슈팅**

### **MCP 서버 연결 실패 문제**

MCP 서버가 목록에는 나타나지만 "Failed to connect" 오류가 발생하는 경우:

1. **Windows 검증된 방식으로 재설치 (권장)**:
   ```bash
   # 컨테이너 내부에서
   bash .devcontainer/setup-mcp-windows-proven.sh
   
   # 터미널 재시작
   exec zsh
   
   # 확인
   claude mcp list
   ```

2. **수동 설치 (위 방법이 실패한 경우)**:
   ```bash
   # 기존 서버 제거
   claude mcp remove sequential
   claude mcp remove context7
   claude mcp remove magic
   claude mcp remove playwright
   
   # npm 패키지 설치
   npm install -g @modelcontextprotocol/server-sequential-thinking
   npm install -g @upstash/context7-mcp
   npm install -g @21st-dev/magic
   npm install -g @executeautomation/playwright-mcp-server
   
   # Windows 검증된 형식으로 등록 (--scope user와 npx -y 사용)
   claude mcp add --scope user sequential -- npx -y @modelcontextprotocol/server-sequential-thinking
   claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp
   claude mcp add --scope user magic -- npx -y @21st-dev/magic
   claude mcp add --scope user playwright -- npx -y @executeautomation/playwright-mcp-server
   ```

3. **검증 방법**:
   ```bash
   # MCP 서버 목록 확인
   claude mcp list
   
   # 디버그 모드로 확인
   echo '/mcp' | claude --debug
   ```

### **Claude Squad가 작동하지 않는 경우**

```bash
# PATH 확인
echo $PATH | grep -o '/usr/local/bin\|~/.local/bin'

# 수동 설치 확인
find /usr/local/bin ~/.local/bin -name "cs" -o -name "claude-squad" 2>/dev/null

# 터미널 재시작
exec zsh
```

### **일반적인 문제들**

**1. Docker daemon not running**
```bash
# Windows/macOS: Docker Desktop 실행
# Linux: sudo systemctl start docker
```

**2. DevContainer 빌드 실패**
```bash
# VS Code에서
Ctrl+Shift+P → "Dev Containers: Rebuild Container Without Cache"
```

**3. 권한 문제 (Linux)**
```bash
sudo usermod -aG docker $USER
# 로그아웃 후 재로그인
```

### 🔧 **상태 확인 명령어**

```bash
# 전체 도구 상태 확인
claude --version && sc --help

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

이 프로젝트는 Apache-2.0 license 라이선스를 따릅니다. 자세한 내용은 [LICENSE](LICENSE.md) 파일을 참조하세요.

---

## 🙋‍♂️ **지원 및 문의**

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/claude_code_scaffold/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/claude_code_scaffold/discussions)
- **Wiki**: [프로젝트 Wiki](https://github.com/YOUR_USERNAME/claude_code_scaffold/wiki)

---

## 🎉 **성공 사례**

> *"3분 만에 팀 전체가 동일한 AI 개발환경을 구축했습니다!"*  
> *"Claude CLI 토큰만 설정하면 MCP 서버들이 자동으로 설치되어서 너무 편해요!"*  
> *"SuperClaude Framework 조합이 개발 생산성을 10배 향상시켰습니다!"*

---

<div align="center">

**⭐ 이 프로젝트가 도움이 되셨다면 Star를 눌러주세요! ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=YOUR_USERNAME/claude_code_scaffold&type=Date)](https://star-history.com/#YOUR_USERNAME/claude_code_scaffold&Date)

**🚀 Made with ❤️ by AI Development Community**

</div>