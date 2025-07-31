# 🤖 Claude Code DevContainer Environment

> **AI Development Automation DevContainer** - Complete development environment with Claude CLI, MCP servers, and AI tools installed automatically in 3 minutes

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)](https://github.com/YOUR_USERNAME/claude_code_scaffold)
[![VS Code](https://img.shields.io/badge/VS%20Code-DevContainer-blue)](https://code.visualstudio.com/docs/devcontainers/containers)
[![Docker](https://img.shields.io/badge/Docker-Required-blue)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌟 **Key Features**

- **🎯 3-Minute Setup**: Git clone → Open VS Code → Auto-installation complete
- **🤖 Complete AI Tools**: Claude CLI + 5 MCP servers + Claude Squad + SuperClaude Framework
- **⚡ Full Automation**: All installation and configuration handled automatically
- **🌍 Cross-Platform**: Identical experience on Windows, macOS, Linux
- **🔗 Host Folder Integration**: Direct connection to existing projects
- **📊 Development Tools**: PostgreSQL, Redis, Grafana monitoring included

---

## 📋 **Prerequisites**

### Required Software

| Software | Windows | macOS | Linux |
|----------|---------|-------|-------|
| **VS Code** | [Download](https://code.visualstudio.com/) | [Download](https://code.visualstudio.com/) | [Download](https://code.visualstudio.com/) |
| **Docker Desktop** | [Download](https://www.docker.com/products/docker-desktop) | [Download](https://www.docker.com/products/docker-desktop) | `sudo apt install docker.io` |
| **Dev Containers Extension** | Install in VS Code | Install in VS Code | Install in VS Code |

### VS Code Extension Installation
1. Launch VS Code
2. Press `Ctrl+Shift+X` (macOS: `Cmd+Shift+X`)
3. Search and install "Dev Containers"

---

## 🚀 **Quick Start Guide**

### 1️⃣ **Environment Variables Setup (Optional)**

Setting up Claude CLI token and host folder path enables complete automation:

**Windows (PowerShell):**
```powershell
# Claude CLI token (auto-login)
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_OAUTH_TOKEN", "your-token-here", "User")

# Host project folder (optional)
[Environment]::SetEnvironmentVariable("CLAUDE_HOST_PROJECTS", "C:\dev", "User")
```

**macOS/Linux (Terminal):**
```bash
# Add to ~/.zshrc or ~/.bashrc
echo 'export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"' >> ~/.zshrc
echo 'export CLAUDE_HOST_PROJECTS="$HOME/dev"' >> ~/.zshrc
source ~/.zshrc
```

### 2️⃣ **Clone Project**

```bash
git clone https://github.com/YOUR_USERNAME/claude_code_scaffold.git
cd claude_code_scaffold
```

### 3️⃣ **Run DevContainer**

**Method 1: VS Code GUI**
1. Open folder in VS Code
2. Click **"Reopen in Container"** in bottom-right popup

**Method 2: Command Palette**
1. Press `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)
2. Select **"Dev Containers: Reopen in Container"**

### 4️⃣ **Wait for Auto Setup**
- First run: **3-5 minutes** (Docker image build + tools installation)
- Subsequent runs: **30 seconds** (cached environment)

### 5️⃣ **Start Using Immediately!**

```bash
# 🤖 Check AI tools
claude --help                    # Claude CLI
cs --help                        # Claude Squad
sc --help                        # SuperClaude Framework

# 📦 Check MCP servers (auto-installed)
claude mcp list

# 🖥️ Check services status
docker-compose ps

# 📊 Access monitoring dashboard
# http://localhost:3010 (admin/admin)
```

---

## 🛠️ **Integrated AI Development Tools**

### 🎯 **Claude CLI + MCP Servers**
- **Claude Code CLI**: Latest version auto-installation
- **5 MCP Servers Auto-Install**:
  - `@modelcontextprotocol/server-sequential-thinking` - Complex reasoning
  - `@upstash/context7-mcp` - Document context
  - `@21st-dev/magic` - UI component generation
  - `@executeautomation/playwright-mcp-server` - Browser automation
  - `@playwright/mcp` - Official Playwright support

### 🤝 **Claude Squad**
- **AI Collaboration Tool**: Team project management
- **tmux Integration**: Multi-session management
- **GitHub CLI**: Git workflow automation
- **Alias**: Simple `cs` command usage

### 🚀 **SuperClaude Framework**
- **Advanced AI Automation**: Python-based framework
- **uv Package Manager**: Ultra-fast Python package management
- **Minimal Installation Mode**: Quick start
- **Alias**: Simple `sc` command usage

---

## 📁 **Project Development Methods**

### 🎯 **Method 1: Environment Variable Host Folder Connection (Recommended)**

Setting environment variables allows **automatic host folder connection without Git changes**:

```bash
# After setting environment variables → DevContainer build
# → Automatically connects to /host/projects

# Inside DevContainer
cd /host/projects              # Direct access to host folder
cd your-existing-project       # Navigate to existing project

# Start AI development immediately
claude --help
cs new session
sc --help
```

**Advantages**:
- ✅ **Git Safe**: Personal settings not included in version control
- ✅ **Auto Connect**: Automatically mounts during DevContainer build
- ✅ **Existing Projects**: Use host's existing projects as-is

### 🔧 **Method 2: Workspace Folder Usage**

Simple method without additional setup:

```bash
# Inside DevContainer
cd workspace

# Clone development project
git clone https://github.com/your-username/your-project.git
cd your-project

# Start AI development immediately
claude --help
cs new session
sc --help
```

---

### 🚨 **Troubleshooting**

#### **Environment Variable Not Applied**
```bash
# 1. Check environment variable (on host)
echo $CLAUDE_HOST_PROJECTS     # Check variable value

# 2. Reset environment variable
export CLAUDE_HOST_PROJECTS="$HOME/dev"
echo 'export CLAUDE_HOST_PROJECTS="$HOME/dev"' >> ~/.zshrc

# 3. DevContainer complete rebuild (required!)
# Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

#### **"No such file or directory" Error**
```bash
# Cause: Environment variable path doesn't exist
# Solution: Create folder then rebuild

# Check and create folder (on host)
ls -la $HOME/dev           # Check
mkdir -p $HOME/dev         # Create

# DevContainer rebuild
# Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

#### **DevContainer Build Failure**
```bash
# 1. Check environment variable path for special characters
# Wrong: /Users/홍길동/dev (Korean path)
# Correct: /Users/user/dev

# 2. Check Docker Desktop status
docker --version

# 3. DevContainer complete rebuild
# Ctrl+Shift+P → "Dev Containers: Rebuild Container Without Cache"
```

#### **VS Code Connection Failure**
```bash
# 1. Restart Docker Desktop
# 2. Restart VS Code
# 3. Remove environment variable and test with default settings
unset CLAUDE_HOST_PROJECTS
```

---

## 💻 **Platform-Specific Guides**

### 🪟 **Windows Users**

**Required Setup:**
- **Docker Desktop** running
- **WSL2** enabled (auto-configured by Docker Desktop)

**Recommended Folder Structure:**
```
C:\dev\                    # Development projects folder
├── project1\
├── project2\
└── claude_code_scaffold\  # This project
```

**Access Method:**
```bash
# From inside DevContainer
cd /host/dev/project1      # Access C:\dev\project1
```

### 🍎 **macOS Users**

**Required Setup:**
- **Docker Desktop** installed and running
- **Rosetta 2** (for Apple Silicon Macs if needed)

**Recommended Folder Structure:**
```
~/dev/                     # Development projects folder
├── project1/
├── project2/
└── claude_code_scaffold/  # This project
```

**Access Method:**
```bash
# From inside DevContainer
cd /host/dev/project1      # Access ~/dev/project1
```

### 🐧 **Linux Users**

**Docker Installation:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker $USER
# Logout and login required
```

**Recommended Folder Structure:**
```
~/dev/                     # Development projects folder
├── project1/
├── project2/
└── claude_code_scaffold/  # This project
```

---

## ⚙️ **Advanced Configuration**

### 🔧 **devcontainer.json Customization**

Additional folder mounting:
```json
{
  "mounts": [
    "source=/your/custom/path,target=/host/custom,type=bind,consistency=cached"
  ]
}
```

### 🎨 **Adding Development Tools**

Add desired tools to `setup-claude-environment.sh`:
```bash
# Example: Go language installation
install_golang() {
    log_info "Installing Go..."
    wget -c https://golang.org/dl/go1.21.0.linux-amd64.tar.gz
    sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.zshrc
}
```

---

## 🔍 **Troubleshooting**

### ❌ **Common Issues**

**1. Docker daemon not running**
```bash
# Windows/macOS: Start Docker Desktop
# Linux: sudo systemctl start docker
```

**2. DevContainer build failure**
```bash
# In VS Code
Ctrl+Shift+P → "Dev Containers: Rebuild Container"
```

**3. Permission issues (Linux)**
```bash
sudo usermod -aG docker $USER
# Logout and login required
```

### 🔧 **Status Check Commands**

```bash
# Check all tools status
claude --version && cs --help && sc --help

# MCP servers status
claude mcp list

# Services status
docker-compose ps

# Check logs
docker-compose logs -f
```

---

## 📊 **Built-in Services**

### Access Information:
- **📈 Grafana Dashboard**: http://localhost:3010 (admin/admin)
- **📊 Prometheus**: http://localhost:9090
- **🗄️ PostgreSQL**: localhost:5432
- **🔄 Redis**: localhost:6379

### Monitoring:
- **System Metrics**: CPU, memory, disk usage
- **Service Status**: Docker container monitoring
- **Development Metrics**: Build times, test results

---

## 🤝 **Contributing**

1. **Fork** this repository
2. **Create Feature Branch** (`git checkout -b feature/amazing-feature`)
3. **Commit Changes** (`git commit -m 'Add some amazing feature'`)
4. **Push to Branch** (`git push origin feature/amazing-feature`)
5. **Create Pull Request**

---

## 📜 **License**

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.

---

## 🙋‍♂️ **Support & Contact**

- **Issues**: [GitHub Issues](https://github.com/Choiyos/claude_code_scaffold/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Choiyos/claude_code_scaffold/discussions)
- **Wiki**: [Project Wiki](https://github.com/Choiyos/claude_code_scaffold/wiki)

---

## 🎉 **Success Stories**

> *"Our entire team set up identical AI development environments in just 3 minutes!"*  
> *"Being able to use existing projects directly while applying the latest AI tools immediately is amazing!"*  
> *"The combination of Claude CLI + Claude Squad + SuperClaude Framework increased our development productivity by 10x!"*

---

<div align="center">

**⭐ If this project helped you, please give it a Star! ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=Choiyos/claude_code_scaffold&type=Date)](https://star-history.com/#Choiyos/claude_code_scaffold&Date)

**🚀 Made with ❤️ by AI Development Community**

</div>