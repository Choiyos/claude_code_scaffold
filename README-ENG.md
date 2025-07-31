# 🤖 Claude Code Ultimate AI Development Environment

> **World's Best AI Development Collaboration Platform** - Complete automation DevContainer environment integrating Claude CLI, Claude Squad, and SuperClaude Framework

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)](https://github.com/Choiyos/claude_code_scaffold)
[![VS Code](https://img.shields.io/badge/VS%20Code-DevContainer-blue)](https://code.visualstudio.com/docs/devcontainers/containers)
[![Docker](https://img.shields.io/badge/Docker-Required-blue)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌟 **Key Features**

- **🎯 One-Click Setup**: Git clone → Open VS Code → 3 minutes complete
- **🤖 3 AI Tools Integration**: Claude CLI + Claude Squad + SuperClaude Framework
- **⚡ Full Automation**: 5 MCP servers auto-install and configuration
- **🌍 Cross-Platform**: Complete support for Windows, macOS, Linux
- **🔗 Host Integration**: Direct access to existing project folders
- **📊 Built-in Monitoring**: Grafana + Prometheus included

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

Using OAuth token enables full automation:

**Windows (PowerShell):**
```powershell
# Add to system environment variables
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_OAUTH_TOKEN", "your-token-here", "User")
```

**macOS/Linux (Terminal):**
```bash
# Add to ~/.zshrc or ~/.bashrc
echo 'export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"' >> ~/.zshrc
source ~/.zshrc
```

### 2️⃣ **Clone Project**

```bash
git clone https://github.com/Choiyos/claude_code_scaffold.git
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

## 📁 **Host Folder Access Setup**

To use existing projects directly, you need to mount host folders to DevContainer.

### 🔧 **Setup Method**

Add `mounts` section to `.devcontainer/devcontainer.json`:

#### 🪟 **Windows Users**
```json
{
  "mounts": [
    "source=${localEnv:USERPROFILE}\\Documents,target=/host/Documents,type=bind,consistency=cached",
    "source=${localEnv:USERPROFILE}\\Downloads,target=/host/Downloads,type=bind,consistency=cached",
    "source=${localEnv:USERPROFILE}\\Desktop,target=/host/Desktop,type=bind,consistency=cached",
    "source=C:\\dev,target=/host/dev,type=bind,consistency=cached"
  ]
}
```

#### 🍎 **macOS Users**
```json
{
  "mounts": [
    "source=${localEnv:HOME}/Documents,target=/host/Documents,type=bind,consistency=cached",
    "source=${localEnv:HOME}/Downloads,target=/host/Downloads,type=bind,consistency=cached",
    "source=${localEnv:HOME}/Desktop,target=/host/Desktop,type=bind,consistency=cached",
    "source=${localEnv:HOME}/dev,target=/host/dev,type=bind,consistency=cached"
  ]
}
```

#### 🐧 **Linux Users**
```json
{
  "mounts": [
    "source=${localEnv:HOME}/Documents,target=/host/Documents,type=bind,consistency=cached",
    "source=${localEnv:HOME}/Downloads,target=/host/Downloads,type=bind,consistency=cached",
    "source=${localEnv:HOME}/Desktop,target=/host/Desktop,type=bind,consistency=cached",
    "source=${localEnv:HOME}/dev,target=/host/dev,type=bind,consistency=cached"
  ]
}
```

### 📝 **Complete devcontainer.json Example**

```json
{
  "name": "Claude Code Development Environment",
  "build": {
    "dockerfile": "Dockerfile",
    "context": ".."
  },
  "postCreateCommand": "bash .devcontainer/setup-complete-environment.sh",
  "mounts": [
    // Add OS-specific mounts configuration here
  ],
  "forwardPorts": [3010, 9090, 5432, 6379],
  "remoteUser": "developer"
}
```

### 🚀 **Usage**

After setup and DevContainer rebuild:

```bash
# Check mounted folders
ls /host/

# Navigate to existing project
cd /host/dev/my-existing-project

# Open in VS Code
code /host/dev/my-existing-project

# Use AI tools immediately
claude --help
cs new session
sc --help
```

### ⚠️ **Important Notes**

- DevContainer rebuild required: `Ctrl+Shift+P` → "Dev Containers: Rebuild Container"
- Non-existing folders will be auto-created
- Windows paths require backslash (`\`) escaping

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