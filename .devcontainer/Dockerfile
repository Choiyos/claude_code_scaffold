# 간단하고 효율적인 Claude Code 개발환경
FROM ubuntu:22.04

# 패키지 관리자 업데이트 및 기본 도구 설치
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    ca-certificates \
    gnupg \
    sudo \
    zsh \
    vim \
    nano \
    unzip \
    zip \
    tmux \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI 설치
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# 개발자 사용자 생성
RUN groupadd --gid 1000 developer \
    && useradd --uid 1000 --gid developer --shell /bin/zsh --create-home developer \
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# zsh 및 oh-my-zsh 설정
USER developer
WORKDIR /home/developer

RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# 사용자를 root로 변경하여 시스템 설정 계속
USER root

# Node.js 18.x 설치 (직접 설치 방식)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# 다시 developer 사용자로 변경
USER developer

# Volta 설치 (선택사항, Node.js 이미 설치됨)
RUN curl https://get.volta.sh | bash || true

# Volta 환경변수 설정
ENV VOLTA_HOME="/home/developer/.volta"
ENV PATH="$VOLTA_HOME/bin:$PATH"

# uv (Python 패키지 관리자) 설치
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# uv PATH 설정
ENV PATH="/home/developer/.cargo/bin:$PATH"

# 사용자를 root로 변경하여 시스템 설정 계속
USER root

# 작업 디렉토리를 /workspace로 설정
WORKDIR /workspace

# workspace 디렉토리 권한 설정
RUN chown -R developer:developer /workspace

# 개발자 사용자로 기본 설정
USER developer
WORKDIR /workspace

# 컨테이너 시작시 zsh 사용
CMD ["/bin/zsh"]