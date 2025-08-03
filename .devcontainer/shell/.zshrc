# ============================================
# CLAUDE CODE DEV ENVIRONMENT - ZSH CONFIG
# ============================================

# Enable Powerlevel10k instant prompt
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Path to oh-my-zsh installation
export ZSH="$HOME/.oh-my-zsh"

# Set theme
ZSH_THEME="powerlevel10k/powerlevel10k"

# Plugins
plugins=(
  git
  docker
  docker-compose
  kubectl
  terraform
  aws
  azure
  gcloud
  npm
  node
  python
  pip
  golang
  rust
  vscode
  sudo
  command-not-found
  zsh-autosuggestions
  zsh-syntax-highlighting
  zsh-completions
  history-substring-search
  colored-man-pages
  extract
  z
  fzf
)

# Oh My Zsh settings
CASE_SENSITIVE="false"
HYPHEN_INSENSITIVE="true"
DISABLE_AUTO_UPDATE="false"
DISABLE_UPDATE_PROMPT="true"
UPDATE_ZSH_DAYS=7
DISABLE_MAGIC_FUNCTIONS="false"
DISABLE_LS_COLORS="false"
DISABLE_AUTO_TITLE="false"
ENABLE_CORRECTION="true"
COMPLETION_WAITING_DOTS="true"
DISABLE_UNTRACKED_FILES_DIRTY="false"
HIST_STAMPS="yyyy-mm-dd"

# Load Oh My Zsh
source $ZSH/oh-my-zsh.sh

# ============================================
# CLAUDE CODE SPECIFIC CONFIGURATION
# ============================================

# Claude Code environment
export CLAUDE_ENV="${CLAUDE_ENV:-development}"
export CLAUDE_HOME="/workspace"
export CLAUDE_CONFIG_DIR="$HOME/.claude"

# Development environment paths
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="/usr/local/go/bin:$PATH"
export PATH="$GOPATH/bin:$PATH"

# ============================================
# ALIASES
# ============================================

# Claude Code aliases
alias claude='vt --no-auth claude --dangerously-skip-permissions'
alias cc="claude"
alias ccs="claude && code ."

# Docker aliases
alias d="docker"
alias dc="docker-compose"
alias dps="docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
alias dclean="docker system prune -af --volumes"
alias dlogs="docker logs -f"
alias dexec="docker exec -it"

# Kubernetes aliases
alias k="kubectl"
alias kgp="kubectl get pods"
alias kgs="kubectl get services"
alias kgd="kubectl get deployments"
alias kaf="kubectl apply -f"
alias kdel="kubectl delete"
alias klog="kubectl logs -f"
alias kexec="kubectl exec -it"
alias kctx="kubectl config current-context"
alias kns="kubectl config view --minify --output 'jsonpath={..namespace}'"

# Git aliases (additional to oh-my-zsh)
alias gs="git status -sb"
alias glog="git log --oneline --graph --decorate --all"
alias gundo="git reset --soft HEAD~1"
alias gamend="git commit --amend --no-edit"
alias gcleanup="git branch --merged | grep -v '\*' | xargs -n 1 git branch -d"

# Development aliases
alias py="python"
alias pip="python -m pip"
alias venv="python -m venv"
alias activate="source .venv/bin/activate"
alias npmg="npm list -g --depth=0"
alias npms="npm start"
alias npmt="npm test"
alias npmb="npm run build"
alias npmd="npm run dev"

# System aliases
alias ll="ls -alFh"
alias la="ls -A"
alias l="ls -CF"
alias ..="cd .."
alias ...="cd ../.."
alias ....="cd ../../.."
alias ~="cd ~"
alias c="clear"
alias h="history"
alias j="jobs -l"
alias ports="netstat -tulanp"
alias update="sudo apt update && sudo apt upgrade"

# Productivity aliases
alias weather="curl wttr.in"
alias myip="curl ifconfig.me"
alias speedtest="curl -s https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python -"

# ============================================
# FUNCTIONS
# ============================================

# Claude Code project initialization
claude-init() {
  echo "🚀 Initializing Claude Code project..."
  npm install
  pip install -r requirements.txt
  docker-compose up -d
  echo "✅ Claude Code project initialized!"
}

# Quick Docker container shell
dsh() {
  if [ -z "$1" ]; then
    echo "Usage: dsh <container_name>"
    return 1
  fi
  docker exec -it "$1" /bin/bash || docker exec -it "$1" /bin/sh
}

# Quick Kubernetes pod shell
ksh() {
  if [ -z "$1" ]; then
    echo "Usage: ksh <pod_name> [container_name]"
    return 1
  fi
  if [ -z "$2" ]; then
    kubectl exec -it "$1" -- /bin/bash || kubectl exec -it "$1" -- /bin/sh
  else
    kubectl exec -it "$1" -c "$2" -- /bin/bash || kubectl exec -it "$1" -c "$2" -- /bin/sh
  fi
}

# Port forwarding helper
kpf() {
  if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: kpf <pod_name> <port>"
    return 1
  fi
  kubectl port-forward "$1" "$2:$2"
}

# Git branch cleanup
git-cleanup() {
  git fetch -p
  git branch -vv | grep ': gone]' | awk '{print $1}' | xargs -n 1 git branch -D
  echo "✅ Cleaned up deleted remote branches"
}

# Create a new feature branch
feature() {
  if [ -z "$1" ]; then
    echo "Usage: feature <branch_name>"
    return 1
  fi
  git checkout -b "feature/$1"
}

# Create a new bugfix branch
bugfix() {
  if [ -z "$1" ]; then
    echo "Usage: bugfix <branch_name>"
    return 1
  fi
  git checkout -b "bugfix/$1"
}

# Quick commit with message
qcommit() {
  if [ -z "$1" ]; then
    echo "Usage: qcommit <message>"
    return 1
  fi
  git add -A && git commit -m "$1"
}

# Docker compose logs with follow
dclogs() {
  if [ -z "$1" ]; then
    docker-compose logs -f
  else
    docker-compose logs -f "$1"
  fi
}

# ============================================
# ENVIRONMENT SPECIFIC SETTINGS
# ============================================

# Node.js
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Python
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1

# Go
export GOPATH="$HOME/go"
export GO111MODULE=on

# Rust
source "$HOME/.cargo/env" 2>/dev/null || true

# FZF
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"

# ============================================
# COMPLETIONS
# ============================================

# Enable kubectl completion
[[ $commands[kubectl] ]] && source <(kubectl completion zsh)

# Enable helm completion
[[ $commands[helm] ]] && source <(helm completion zsh)

# Enable docker completion
[[ $commands[docker] ]] && source <(docker completion zsh)

# Enable gh completion
[[ $commands[gh] ]] && source <(gh completion -s zsh)

# ============================================
# PROMPT CUSTOMIZATION
# ============================================

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# ============================================
# WELCOME MESSAGE
# ============================================

# Display welcome message
echo "
╔═══════════════════════════════════════════════════════════╗
║   🚀 Welcome to Claude Code Development Environment! 🚀   ║
╠═══════════════════════════════════════════════════════════╣
║   Environment: $CLAUDE_ENV                                
║   Node.js:     $(node -v 2>/dev/null || echo 'Not installed')                              
║   Python:      $(python --version 2>/dev/null | cut -d' ' -f2 || echo 'Not installed')     
║   Docker:      $(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1 || echo 'Not installed')
║                                                           
║   Quick Commands:                                         
║   • claude-init : Initialize project                      
║   • cc         : Go to Claude Code directory             
║   • dps        : Show running containers                  
║   • k          : kubectl shortcut                         
║                                                           
║   Type 'alias' to see all available shortcuts            
╚═══════════════════════════════════════════════════════════╝
"

# ============================================
# LOCAL OVERRIDES
# ============================================

# Source local configuration if exists
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local