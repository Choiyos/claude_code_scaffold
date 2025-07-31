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
    && rm -rf /var/lib/apt/lists/*

# 개발자 사용자 생성
RUN groupadd --gid 1000 developer \
    && useradd --uid 1000 --gid developer --shell /bin/zsh --create-home developer \
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# zsh 및 oh-my-zsh 설정
USER developer
WORKDIR /home/developer

RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Volta 설치 (Node.js 버전 관리)
RUN curl https://get.volta.sh | bash

# Volta 환경변수 설정
ENV VOLTA_HOME="/home/developer/.volta"
ENV PATH="$VOLTA_HOME/bin:$PATH"

# Volta로 Node.js 18.20.8 설치
RUN bash -c 'source ~/.volta/load.sh && volta install node@18.20.8 && volta install npm@latest'

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