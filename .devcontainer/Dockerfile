# Multi-stage Dockerfile for Claude Code + SuperClaude + MCP Development Environment
# Base image with Ubuntu 22.04 LTS for stability and compatibility
FROM ubuntu:22.04 as base

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    SHELL=/bin/zsh \
    TERM=xterm-256color \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Create vscode user with sudo privileges
RUN groupadd --gid 1000 vscode \
    && useradd --uid 1000 --gid vscode --shell /bin/zsh --create-home vscode \
    && apt-get update \
    && apt-get install -y sudo \
    && echo vscode ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/vscode \
    && chmod 0440 /etc/sudoers.d/vscode

# Install system dependencies and essential tools
RUN apt-get update && apt-get install -y \
    # Basic system tools
    curl \
    wget \
    unzip \
    zip \
    tar \
    gzip \
    bzip2 \
    xz-utils \
    ca-certificates \
    gnupg2 \
    software-properties-common \
    apt-transport-https \
    lsb-release \
    # Development tools
    build-essential \
    cmake \
    make \
    gcc \
    g++ \
    gdb \
    valgrind \
    pkg-config \
    autoconf \
    automake \
    libtool \
    # Version control
    git \
    git-lfs \
    # Text editors and utilities
    vim \
    nano \
    tree \
    htop \
    jq \
    yq \
    # Network tools
    net-tools \
    iputils-ping \
    telnet \
    netcat \
    openssh-client \
    # Shell and terminal
    zsh \
    tmux \
    screen \
    # Locales
    locales \
    # Python dependencies
    python3-dev \
    python3-pip \
    python3-venv \
    python3-setuptools \
    python3-wheel \
    # Node.js dependencies
    libnode-dev \
    # Database clients
    postgresql-client \
    redis-tools \
    # SSL/TLS tools
    openssl \
    # Process management
    supervisor \
    # Monitoring tools
    procps \
    psmisc \
    lsof \
    strace \
    # Compression tools
    p7zip-full \
    && rm -rf /var/lib/apt/lists/*

# Configure locales
RUN locale-gen en_US.UTF-8

# Stage 2: Development tools installation
FROM base as dev-tools

# Install Docker CLI (for Docker-in-Docker)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Install kubectl
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    && rm kubectl

# Install Helm
RUN curl https://baltocdn.com/helm/signing.asc | gpg --dearmor | tee /usr/share/keyrings/helm.gpg > /dev/null \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | tee /etc/apt/sources.list.d/helm-stable-debian.list \
    && apt-get update \
    && apt-get install -y helm \
    && rm -rf /var/lib/apt/lists/*

# Install Terraform
RUN wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | tee /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update \
    && apt-get install -y terraform \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install additional development tools
RUN apt-get update && apt-get install -y \
    # Performance monitoring
    iotop \
    iftop \
    nmon \
    sysstat \
    # Security tools
    gnupg \
    pass \
    # JSON/YAML tools
    jq \
    yq \
    # HTTP tools
    httpie \
    # Cloud tools (will be configured per user)
    && rm -rf /var/lib/apt/lists/*

# Stage 3: Language runtime setup
FROM dev-tools as language-setup

# Install Node.js 20 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install global Node.js tools
RUN npm install -g \
    # Package managers
    yarn \
    pnpm \
    # Development tools
    nodemon \
    concurrently \
    cross-env \
    # Linting and formatting
    eslint \
    prettier \
    # TypeScript
    typescript \
    ts-node \
    @types/node \
    # Build tools
    webpack \
    vite \
    # Testing
    jest \
    mocha \
    # Documentation
    typedoc \
    # Utilities
    rimraf \
    dotenv-cli \
    # Claude-specific tools (when available)
    @anthropic-ai/claude-code || true

# Install Python 3.11 and pip tools
RUN add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y \
        python3.11 \
        python3.11-dev \
        python3.11-venv \
        python3.11-distutils \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python development tools
RUN python3 -m pip install --upgrade pip setuptools wheel \
    && pip install \
    # Development tools
    black \
    isort \
    flake8 \
    mypy \
    pylint \
    bandit \
    # Testing
    pytest \
    pytest-cov \
    pytest-mock \
    # Documentation
    sphinx \
    # Web frameworks
    fastapi \
    flask \
    django \
    # Data tools
    pandas \
    numpy \
    # HTTP clients
    requests \
    httpx \
    # Environment management
    python-dotenv \
    # Database
    psycopg2-binary \
    redis \
    sqlalchemy \
    # Async tools
    asyncio \
    aiohttp \
    # Utilities
    click \
    rich \
    typer

# Stage 4: Shell and terminal setup
FROM language-setup as shell-setup

# Switch to vscode user for shell configuration
USER vscode
WORKDIR /home/vscode

# Install Oh My Zsh
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Install Zsh plugins
RUN git clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions \
    && git clone https://github.com/zsh-users/zsh-syntax-highlighting ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting \
    && git clone https://github.com/zsh-users/zsh-completions ~/.oh-my-zsh/custom/plugins/zsh-completions

# Install Powerlevel10k theme
RUN git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/.oh-my-zsh/custom/themes/powerlevel10k

# Install additional useful tools for development
USER root
RUN curl -sS https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash \
    && curl -sS https://raw.githubusercontent.com/sharkdp/fd/master/install.sh | bash \
    && curl -LO https://github.com/BurntSushi/ripgrep/releases/latest/download/ripgrep_13.0.0_amd64.deb \
    && dpkg -i ripgrep_13.0.0_amd64.deb \
    && rm ripgrep_13.0.0_amd64.deb \
    && curl -LO https://github.com/sharkdp/bat/releases/latest/download/bat_0.24.0_amd64.deb \
    && dpkg -i bat_0.24.0_amd64.deb \
    && rm bat_0.24.0_amd64.deb \
    && curl -LO https://github.com/dandavison/delta/releases/latest/download/git-delta_0.16.5_amd64.deb \
    && dpkg -i git-delta_0.16.5_amd64.deb \
    && rm git-delta_0.16.5_amd64.deb

# Install fonts for terminal
RUN apt-get update && apt-get install -y \
    fonts-powerline \
    fonts-firacode \
    && wget -P /tmp https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Regular.ttf \
    && wget -P /tmp https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Bold.ttf \
    && wget -P /tmp https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Italic.ttf \
    && wget -P /tmp https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Bold%20Italic.ttf \
    && mkdir -p /usr/share/fonts/truetype/meslo \
    && cp /tmp/MesloLGS*.ttf /usr/share/fonts/truetype/meslo/ \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/* /tmp/MesloLGS*.ttf

# Stage 5: Final development environment
FROM shell-setup as final

# Switch back to root for final setup
USER root

# Create workspace directory
RUN mkdir -p /workspace \
    && chown -R vscode:vscode /workspace \
    && chmod -R 755 /workspace

# Create directories for Claude environment
RUN mkdir -p /home/vscode/.claude \
    && mkdir -p /home/vscode/.claude/environments \
    && mkdir -p /home/vscode/.claude/mcp-servers \
    && mkdir -p /home/vscode/.claude/config \
    && mkdir -p /home/vscode/.claude/logs \
    && mkdir -p /home/vscode/.claude/cache \
    && chown -R vscode:vscode /home/vscode/.claude

# Setup development environment variables and paths
RUN echo 'export PATH="/home/vscode/.local/bin:$PATH"' >> /home/vscode/.bashrc \
    && echo 'export PATH="/home/vscode/.local/bin:$PATH"' >> /home/vscode/.zshrc \
    && echo 'export PYTHONPATH="/workspace:$PYTHONPATH"' >> /home/vscode/.bashrc \
    && echo 'export PYTHONPATH="/workspace:$PYTHONPATH"' >> /home/vscode/.zshrc \
    && echo 'export NODE_PATH="/usr/lib/node_modules:$NODE_PATH"' >> /home/vscode/.bashrc \
    && echo 'export NODE_PATH="/usr/lib/node_modules:$NODE_PATH"' >> /home/vscode/.zshrc

# Configure Git with better defaults
RUN git config --system init.defaultBranch main \
    && git config --system pull.rebase false \
    && git config --system core.autocrlf input \
    && git config --system core.filemode false \
    && git config --system alias.st status \
    && git config --system alias.co checkout \
    && git config --system alias.br branch \
    && git config --system alias.ci commit \
    && git config --system alias.unstage 'reset HEAD --' \
    && git config --system alias.last 'log -1 HEAD' \
    && git config --system alias.visual '!gitk' \
    && git config --system alias.graph 'log --oneline --graph --decorate --all'

# Setup sudo without password for vscode user (for development convenience)
RUN echo 'vscode ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers.d/vscode

# Install requirements file if it exists
COPY requirements.txt* /tmp/
RUN if [ -f /tmp/requirements.txt ]; then \
        pip install -r /tmp/requirements.txt; \
    fi

# Copy package.json if it exists and install dependencies
COPY package*.json /tmp/
RUN if [ -f /tmp/package.json ]; then \
        cd /tmp && npm install; \
    fi

# Set up supervisor for process management
RUN mkdir -p /etc/supervisor/conf.d \
    && mkdir -p /var/log/supervisor

# Create entrypoint script
RUN cat > /usr/local/bin/docker-entrypoint.sh << 'EOF'
#!/bin/bash
set -e

# Initialize Claude environment if not exists
if [ ! -f /home/vscode/.claude/config/environment.json ]; then
    echo '{"version": "1.0.0", "initialized": false}' > /home/vscode/.claude/config/environment.json
    chown vscode:vscode /home/vscode/.claude/config/environment.json
fi

# Start supervisor if we have configs
if [ "$(ls -A /etc/supervisor/conf.d)" ]; then
    supervisord -n &
fi

# Execute the main command
exec "$@"
EOF
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to vscode user as default
USER vscode
WORKDIR /workspace

# Set up default shell as zsh
ENV SHELL=/bin/zsh

# Default command
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/bin/zsh", "-l"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Labels for metadata
LABEL maintainer="Claude Development Team" \
      version="1.0.0" \
      description="Claude Code + SuperClaude + MCP Development Environment" \
      org.opencontainers.image.title="Claude Dev Environment" \
      org.opencontainers.image.description="Complete development environment for Claude Code with SuperClaude and MCP integration" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Anthropic" \
      org.opencontainers.image.licenses="MIT"