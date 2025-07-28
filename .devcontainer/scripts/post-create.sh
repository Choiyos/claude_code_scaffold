#!/bin/bash
# Post-create script for Claude Code + SuperClaude + MCP Development Environment
# This script runs once after the container is created and sets up the development environment

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Start initialization
log_info "🚀 Initializing Claude Code + SuperClaude + MCP Development Environment..."

# Update system packages
log_info "📦 Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# Install additional development tools that might be missing
log_info "🛠️ Installing additional development tools..."
sudo apt-get install -y -qq \
    fish \
    starship \
    exa \
    duf \
    ncdu \
    hyperfine \
    glow \
    fzf \
    zoxide \
    || log_warning "Some tools might not be available"

# Setup Zsh as default shell
log_info "🐚 Configuring Zsh shell..."
if [ "$SHELL" != "/bin/zsh" ]; then
    sudo chsh -s /bin/zsh vscode
    log_success "Zsh set as default shell"
fi

# Install Oh My Zsh if not already installed
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    log_info "📡 Installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    log_success "Oh My Zsh installed"
else
    log_info "Oh My Zsh already installed, updating..."
    cd ~/.oh-my-zsh && git pull
fi

# Install Zsh plugins
log_info "🔌 Installing Zsh plugins..."

# Autosuggestions
if [ ! -d "$HOME/.oh-my-zsh/custom/plugins/zsh-autosuggestions" ]; then
    git clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions
    log_success "zsh-autosuggestions installed"
fi

# Syntax highlighting
if [ ! -d "$HOME/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" ]; then
    git clone https://github.com/zsh-users/zsh-syntax-highlighting ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
    log_success "zsh-syntax-highlighting installed"
fi

# Completions
if [ ! -d "$HOME/.oh-my-zsh/custom/plugins/zsh-completions" ]; then
    git clone https://github.com/zsh-users/zsh-completions ~/.oh-my-zsh/custom/plugins/zsh-completions
    log_success "zsh-completions installed"
fi

# Fast Syntax Highlighting (alternative to zsh-syntax-highlighting)
if [ ! -d "$HOME/.oh-my-zsh/custom/plugins/fast-syntax-highlighting" ]; then
    git clone https://github.com/zdharma-continuum/fast-syntax-highlighting.git ~/.oh-my-zsh/custom/plugins/fast-syntax-highlighting
    log_success "fast-syntax-highlighting installed"
fi

# Install Powerlevel10k theme
log_info "🎨 Installing Powerlevel10k theme..."
if [ ! -d "$HOME/.oh-my-zsh/custom/themes/powerlevel10k" ]; then
    git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/.oh-my-zsh/custom/themes/powerlevel10k
    log_success "Powerlevel10k theme installed"
fi

# Configure .zshrc
log_info "⚙️ Configuring .zshrc..."
cat > ~/.zshrc << 'EOF'
# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Oh My Zsh configuration
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"

# Plugins
plugins=(
    git
    docker
    docker-compose
    kubectl
    terraform
    aws
    node
    npm
    yarn
    python
    pip
    django
    redis-cli
    postgres
    zsh-autosuggestions
    zsh-syntax-highlighting
    zsh-completions
    fast-syntax-highlighting
    colored-man-pages
    command-not-found
    extract
    z
    fzf
    history-substring-search
)

source $ZSH/oh-my-zsh.sh

# User configuration
export LANG=en_US.UTF-8
export EDITOR='code'
export TERM='xterm-256color'

# Path configuration
export PATH="$HOME/.local/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
export PYTHONPATH="/workspace:$PYTHONPATH"
export NODE_PATH="/usr/lib/node_modules:$NODE_PATH"

# Claude environment configuration
export CLAUDE_ENV_MODE="development"
export CLAUDE_CONFIG_DIR="$HOME/.claude"

# Development aliases
alias ll='exa -la --git --time-style=long-iso'
alias la='exa -la'
alias l='exa -l'
alias tree='exa --tree'
alias cat='bat'
alias find='fd'
alias grep='rg'
alias ps='procs'
alias top='btm'
alias du='duf'
alias ncdu='ncdu --color dark -rr -x --exclude .git --exclude node_modules'

# Git aliases (additional to Oh My Zsh git plugin)
alias gst='git status'
alias gco='git checkout'
alias gaa='git add --all'
alias gcmsg='git commit -m'
alias gp='git push'
alias gl='git pull'
alias glog='git log --oneline --graph --decorate'

# Docker aliases
alias dc='docker-compose'
alias dcup='docker-compose up -d'
alias dcdown='docker-compose down'
alias dcbuild='docker-compose build'
alias dclogs='docker-compose logs -f'
alias dcps='docker-compose ps'

# Python aliases
alias py='python'
alias pip='python -m pip'
alias venv='python -m venv'
alias activate='source venv/bin/activate'

# Node.js aliases
alias ni='npm install'
alias ns='npm start'
alias nt='npm test'
alias nb='npm run build'
alias nrd='npm run dev'

# Claude environment aliases
alias claude-status='claude-env status'
alias claude-sync='claude-env sync'
alias claude-logs='claude-env logs --follow'

# Development functions
function mkcd() {
    mkdir -p "$1" && cd "$1"
}

function extract_and_remove() {
    extract "$1" && rm "$1"
}

function server() {
    local port="${1:-8000}"
    python -m http.server "$port"
}

function weather() {
    curl -s "wttr.in/${1:-}"
}

# Initialize zoxide (better cd)
if command -v zoxide &> /dev/null; then
    eval "$(zoxide init zsh)"
fi

# Initialize starship prompt (alternative to powerlevel10k)
# if command -v starship &> /dev/null; then
#     eval "$(starship init zsh)"
# fi

# FZF configuration
if command -v fzf &> /dev/null; then
    export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
    export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
    export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
    
    # FZF color scheme
    export FZF_DEFAULT_OPTS='
        --color=fg:#d0d0d0,bg:#121212,hl:#5f87af
        --color=fg+:#d0d0d0,bg+:#262626,hl+:#5fd7ff
        --color=info:#afaf87,prompt:#d7005f,pointer:#af5fff
        --color=marker:#87ff00,spinner:#af5fff,header:#87afaf
    '
fi

# History configuration
export HISTSIZE=10000
export SAVEHIST=10000
export HISTFILE=~/.zsh_history
setopt HIST_VERIFY
setopt SHARE_HISTORY
setopt APPEND_HISTORY
setopt EXTENDED_HISTORY
setopt HIST_REDUCE_BLANKS
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_SPACE

# Auto-completion configuration
autoload -U compinit && compinit
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(@s.:.)LS_COLORS}"
zstyle ':completion:*' menu select

# Load custom configuration if exists
if [ -f ~/.zshrc.local ]; then
    source ~/.zshrc.local
fi

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
EOF

log_success ".zshrc configured"

# Create initial Powerlevel10k configuration
log_info "🎨 Creating Powerlevel10k configuration..."
cat > ~/.p10k.zsh << 'EOF'
# Generated by Powerlevel10k configuration wizard.
# Instantly override this config with the output of 'p10k configure'.

# Temporarily change options.
'builtin' 'local' '-a' 'p10k_config_opts'
[[ ! -o 'aliases'         ]] || p10k_config_opts+=('aliases')
[[ ! -o 'sh_glob'         ]] || p10k_config_opts+=('sh_glob')
[[ ! -o 'no_brace_expand' ]] || p10k_config_opts+=('no_brace_expand')
'builtin' 'setopt' 'no_aliases' 'no_sh_glob' 'brace_expand'

() {
  emulate -L zsh -o extended_glob

  # Unset all configuration options. This allows you to apply configuration changes without
  # restarting zsh. Edit ~/.p10k.zsh and type `source ~/.p10k.zsh`.
  unset -m '(POWERLEVEL9K_*|DEFAULT_USER)~POWERLEVEL9K_GITSTATUS_DIR'

  # The list of segments shown on the left. Fill it with the most important segments.
  typeset -g POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(
    os_icon                 # os identifier
    dir                     # current directory
    vcs                     # git status
    # prompt_char           # prompt symbol
  )

  # The list of segments shown on the right. Fill it with less important segments.
  # Right prompt on the last prompt line (where you start typing commands) gets
  # automatically hidden when the input line reaches it. Right prompt above the
  # last prompt line gets hidden if it would overlap with left prompt.
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(
    status                  # exit code of the last command
    command_execution_time  # duration of the last command
    background_jobs         # presence of background jobs
    direnv                  # direnv status (https://direnv.net/)
    asdf                    # asdf version manager (https://github.com/asdf-vm/asdf)
    virtualenv              # python virtual environment (https://docs.python.org/3/library/venv.html)
    anaconda                # conda environment (https://conda.io/)
    pyenv                   # python environment (https://github.com/pyenv/pyenv)
    goenv                   # go environment (https://github.com/syndbg/goenv)
    nodenv                  # node.js version from nodenv (https://github.com/nodenv/nodenv)
    nvm                     # node.js version from nvm (https://github.com/nvm-sh/nvm)
    nodeenv                 # node.js environment (https://github.com/ekalinin/nodeenv)
    # node_version          # node.js version
    # go_version            # go version (https://golang.org)
    # rust_version          # rustc version (https://www.rust-lang.org)
    # dotnet_version        # .NET version (https://dotnet.microsoft.com)
    # php_version           # php version (https://www.php.net/)
    # laravel_version       # laravel php framework version (https://laravel.com/)
    # java_version          # java version (https://www.java.com/)
    # package               # name@version from package.json (https://docs.npmjs.com/files/package.json)
    rbenv                   # ruby version from rbenv (https://github.com/rbenv/rbenv)
    rvm                     # ruby version from rvm (https://rvm.io)
    fvm                     # flutter version management (https://github.com/leoafarias/fvm)
    luaenv                  # lua version from luaenv (https://github.com/cehoffman/luaenv)
    jenv                    # java version from jenv (https://github.com/jenv/jenv)
    plenv                   # perl version from plenv (https://github.com/tokuhirom/plenv)
    phpenv                  # php version from phpenv (https://github.com/phpenv/phpenv)
    scalaenv                # scala version from scalaenv (https://github.com/scalaenv/scalaenv)
    haskell_stack           # haskell version from stack (https://haskellstack.org/)
    kubecontext             # current kubernetes context (https://kubernetes.io/)
    terraform               # terraform workspace (https://www.terraform.io)
    aws                     # aws profile (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html)
    aws_eb_env              # aws elastic beanstalk environment (https://aws.amazon.com/elasticbeanstalk/)
    azure                   # azure account name (https://docs.microsoft.com/en-us/cli/azure)
    gcloud                  # google cloud cli account and project (https://cloud.google.com/)
    google_app_cred         # google application credentials (https://cloud.google.com/docs/authentication/production)
    context                 # user@hostname
    nordvpn                 # nordvpn connection status, linux only (https://nordvpn.com/)
    ranger                  # ranger shell (https://github.com/ranger/ranger)
    nnn                     # nnn shell (https://github.com/jarun/nnn)
    vim_shell               # vim shell indicator (:sh)
    midnight_commander      # midnight commander shell (https://midnight-commander.org/)
    nix_shell               # nix shell (https://nixos.org/nixos/nix-pills/developing-with-nix-shell.html)
    # vi_mode               # vi mode (you don't need this if you've enabled prompt_char)
    # vpn_ip                # virtual private network indicator
    # load                  # CPU load
    # disk_usage            # disk usage
    # ram                   # free RAM
    # swap                  # used swap
    todo                    # todo items (https://github.com/todotxt/todo.txt-cli)
    timewarrior             # timewarrior tracking status (https://timewarrior.net/)
    taskwarrior             # taskwarrior task count (https://taskwarrior.org/)
    time                    # current time
    # ip                    # ip address and bandwidth usage for a specified network interface
    # public_ip             # public IP address
    # proxy                 # system-wide http/https/ftp proxy
    # battery               # internal battery
    # wifi                  # wifi speed
    # example               # example user-defined segment (see prompt_example function below)
  )

  # Defines character set used by powerlevel10k. It's best to let `p10k configure` set it for you.
  typeset -g POWERLEVEL9K_MODE=nerdfont-complete
  # typeset -g POWERLEVEL9K_MODE=compatible      # ASCII

  # When set to `moderate`, some icons will have an extra space after them. This is meant to avoid
  # icon overlap when using non-monospace fonts. When set to `none`, spaces are not added.
  typeset -g POWERLEVEL9K_ICON_PADDING=moderate

  # Basic style options that define the overall look of your prompt. You probably don't want to
  # change them.
  typeset -g POWERLEVEL9K_BACKGROUND=                            # transparent background
  typeset -g POWERLEVEL9K_{LEFT,RIGHT}_{LEFT,RIGHT}_WHITESPACE=  # no surrounding whitespace
  typeset -g POWERLEVEL9K_{LEFT,RIGHT}_SUBSEGMENT_SEPARATOR=' '  # separate segments with a space
  typeset -g POWERLEVEL9K_{LEFT,RIGHT}_SEGMENT_SEPARATOR=        # no end-of-line symbol

  # Add an empty line before each prompt.
  typeset -g POWERLEVEL9K_PROMPT_ADD_NEWLINE=true

  # Connect left and right prompts with the specified string. This option can be used to color
  # the prompt independently from the terminal background color. It's also useful if you want
  # to apply a constant background color (e.g., gray) to the whole prompt.
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR='─'
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_BACKGROUND=242
  # typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_GAP_CHAR='─'
  # typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_GAP_BACKGROUND=242

  # The color of the filler between left and right prompt on the first prompt line.
  # You'll probably want to set POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_BACKGROUND and
  # POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_GAP_BACKGROUND to the same value.
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_FOREGROUND=242
  # typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_GAP_FOREGROUND=242

  # Start prompt with `╭─`. You can change it to any string or set it to empty string.
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_PREFIX='╭─'
  # typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_PREFIX='├─'
  # typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_PREFIX='╰─'

  # End prompt with `─╮`. You can change it to any string or set it to empty string.
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_SUFFIX='─╮'
  # typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_SUFFIX='─┤'
  # typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_SUFFIX='─╯'

  # Ruler, a.k.a. the horizontal line before each prompt. If you set it to true, you'll
  # probably want to set POWERLEVEL9K_PROMPT_ADD_NEWLINE=false above and
  # POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR='' below.
  typeset -g POWERLEVEL9K_SHOW_RULER=false
  typeset -g POWERLEVEL9K_RULER_CHAR='─'        # reasonable alternative: '·'
  typeset -g POWERLEVEL9K_RULER_FOREGROUND=242

  # Filler between left and right prompt on the first prompt line. You can set it to ' ', '·' or
  # '─'. The last two make prompt look like a table, though styling is limited.
  #
  #   ╭─────┬─────────────────────────────────────────────────────────────────────┬────╮
  #   │ ~/w │ master !1 ?2                                                        │ 10s │
  #   ╰─────┴─────────────────────────────────────────────────────────────────────┴────╯
  #
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR=' '
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR='·'
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR='─'

  # The color of the filler. You'll probably want to match the color of POWERLEVEL9K_MULTILINE
  # ornaments defined above.
  # typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_FOREGROUND=242

  # Start prompt with the specified string. This option can be used to apply a constant
  # background color to the left prompt regardless of which segments are present.
  # typeset -g POWERLEVEL9K_LEFT_PROMPT_FIRST_SEGMENT_START_SYMBOL='▓▒░'

  # End prompt with the specified string. This option can be used to apply a constant
  # background color to the left prompt regardless of which segments are present.
  # typeset -g POWERLEVEL9K_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL='░▒▓'

  # OS identifier color.
  typeset -g POWERLEVEL9K_OS_ICON_FOREGROUND=232
  typeset -g POWERLEVEL9K_OS_ICON_BACKGROUND=7

  ################################[ prompt_char: prompt symbol ]################################
  # Green prompt symbol if the last command succeeded.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OK_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=76
  # Red prompt symbol if the last command failed.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_ERROR_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=196
  # Default prompt symbol.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIINS_CONTENT_EXPANSION='❯'
  # Prompt symbol in command vi mode.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VICMD_CONTENT_EXPANSION='❮'
  # Prompt symbol in visual vi mode.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIVIS_CONTENT_EXPANSION='Ⅴ'
  # Prompt symbol in overwrite vi mode.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIOWR_CONTENT_EXPANSION='▶'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OVERWRITE_STATE=true
  # No line terminator if prompt_char is the last segment.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL=''
  # No line introducer if prompt_char is the first segment.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_FIRST_SEGMENT_START_SYMBOL=''
  # No surrounding whitespace.
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_{LEFT,RIGHT}_WHITESPACE=

  ##################################[ dir: current directory ]##################################
  # Default current directory color.
  typeset -g POWERLEVEL9K_DIR_FOREGROUND=31
  # If directory is too long, shorten some of its segments to the shortest possible unique
  # prefix. The shortened directory can be tab-completed to the original.
  typeset -g POWERLEVEL9K_SHORTEN_STRATEGY=truncate_to_unique
  typeset -g POWERLEVEL9K_SHORTEN_DELIMITER=
  # Replace removed segment suffixes with this symbol.
  typeset -g POWERLEVEL9K_SHORTEN_DIR_LENGTH=1
  # Color of the shortened directory segments.
  typeset -g POWERLEVEL9K_DIR_SHORTENED_FOREGROUND=103
  # Color of the anchor directory segments. Anchor segments are never shortened. The first
  # segment is always an anchor.
  typeset -g POWERLEVEL9K_DIR_ANCHOR_FOREGROUND=39
  # Display anchor directory segments in bold.
  typeset -g POWERLEVEL9K_DIR_ANCHOR_BOLD=true
  # Don't shorten directories that contain any of these files. They are anchors.
  local anchor_files=(
    .bzr
    .citc
    .git
    .hg
    .node-version
    .python-version
    .go-version
    .ruby-version
    .lua-version
    .java-version
    .perl-version
    .php-version
    .tool-versions
    .shorten_folder_marker
    .svn
    .terraform
    CVS
    Cargo.toml
    composer.json
    go.mod
    package.json
    stack.yaml
  )
  typeset -g POWERLEVEL9K_SHORTEN_FOLDER_MARKER="(${(j:|:)anchor_files})"
  # If set to "first" ("last"), remove everything before the first (last) subdirectory that contains
  # any of the anchor files. If set to "false", don't shorten directories that contain anchor files.
  typeset -g POWERLEVEL9K_DIR_TRUNCATE_BEFORE_MARKER=last
  # Don't shorten this many last directory segments. They are anchors.
  typeset -g POWERLEVEL9K_SHORTEN_DIR_LENGTH=1
  # Shorten directory if it's longer than this even if there is space for it. The value can
  # be either absolute (e.g., '80') or a percentage of terminal width (e.g, '50%'). If empty,
  # directory will be shortened only when prompt doesn't fit or when other parameters demand it
  # (see POWERLEVEL9K_DIR_MIN_COMMAND_COLUMNS and POWERLEVEL9K_DIR_MIN_RIGHT_COLUMNS below).
  # If set to `0`, directory will always be shortened to its minimum length.
  typeset -g POWERLEVEL9K_DIR_MAX_LENGTH=80
  # When `dir` segment is on the last prompt line, try to shorten it enough to leave at least this
  # many columns for typing commands.
  typeset -g POWERLEVEL9K_DIR_MIN_COMMAND_COLUMNS=40
  # When `dir` segment is on the last prompt line, try to shorten it enough to leave at least
  # COLUMNS - this many columns on the right of the prompt for the right prompt. If this results
  # in a shorter truncated directory than would be otherwise, the right prompt gets hidden.
  typeset -g POWERLEVEL9K_DIR_MIN_RIGHT_COLUMNS=1
  # If set to true, embed a hyperlink into the directory. Useful for quickly
  # opening a directory in file manager by clicking the link. Can also be handy when the
  # directory is shortened, as it allows you to see the full directory that was used in
  # shortening. The downside is that a hyperlink can look different from a plain string in some
  # terminal emulators and it can occupy more space.
  typeset -g POWERLEVEL9K_DIR_HYPERLINK=false

  # Enable special formatting for non-writable and non-existent directories. See POWERLEVEL9K_LOCK_ICON
  # and POWERLEVEL9K_DIR_CLASSES below.
  typeset -g POWERLEVEL9K_DIR_SHOW_WRITABLE=v3

  #####################################[ vcs: git status ]####################################
  # Branch icon. Set this parameter to '\uF126 ' for the popular Powerline branch icon.
  typeset -g POWERLEVEL9K_VCS_BRANCH_ICON='\uF126 '

  # Untracked files icon. It's really a question mark, your font isn't broken.
  # Change the value of this parameter to show a different icon.
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_ICON='?'

  # Formatter for Git status.
  #
  # Example output: master ⇣42⇡42 *42 merge ~42 +42 !42 ?42.
  #
  # You can edit the function to customize how Git status looks.
  #
  # VCS_STATUS_* parameters are set by gitstatus plugin. See reference:
  # https://github.com/romkatv/gitstatus/blob/master/gitstatus.plugin.zsh.
  function my_git_formatter() {
    emulate -L zsh

    if [[ -n $P9K_CONTENT ]]; then
      # If P9K_CONTENT is not empty, use it. It's either "loading" or from vcs_info (not from
      # gitstatus plugin). VCS_STATUS_* parameters are not available in this case.
      typeset -g my_git_format=$P9K_CONTENT
      return
    fi

    if (( $1 )); then
      # Styling for up-to-date Git status.
      local       meta='%f'     # default foreground
      local      clean='%76F'   # green foreground
      local   modified='%178F'  # yellow foreground
      local  untracked='%39F'   # blue foreground
      local conflicted='%196F'  # red foreground
    else
      # Styling for incomplete and stale Git status.
      local       meta='%244F'  # grey foreground
      local      clean='%244F'  # grey foreground
      local   modified='%244F'  # grey foreground
      local  untracked='%244F'  # grey foreground
      local conflicted='%244F'  # grey foreground
    fi

    local res
    local where  # branch or tag
    if [[ -n $VCS_STATUS_LOCAL_BRANCH ]]; then
      res+="${clean}${(g::)POWERLEVEL9K_VCS_BRANCH_ICON}"
      where=${(V)VCS_STATUS_LOCAL_BRANCH}
    elif [[ -n $VCS_STATUS_TAG ]]; then
      res+="${meta}#"
      where=${(V)VCS_STATUS_TAG}
    fi

    # If local branch name or tag is at most 32 characters long, show it in full.
    # Otherwise show the first 12 … the last 12.
    # Tip: To always show local branch name in full regardless of length, delete the next line.
    (( $#where > 32 )) && where[13,-13]="…"  # <-- this line

    res+="${clean}${where//\%/%%}"             # escape %

    # Show tracking branch name if it differs from local branch.
    if [[ -n ${VCS_STATUS_REMOTE_BRANCH:#$VCS_STATUS_LOCAL_BRANCH} ]]; then
      res+="${meta}:${clean}${(V)VCS_STATUS_REMOTE_BRANCH//\%/%%}"  # escape %
    fi

    # Show remote name if it differs from "origin".
    if [[ -n ${VCS_STATUS_REMOTE_NAME:#origin} ]]; then
      res+="${meta}@${clean}${(V)VCS_STATUS_REMOTE_NAME//\%/%%}"  # escape %
    fi

    # ⇣42 if behind the remote.
    (( VCS_STATUS_COMMITS_BEHIND )) && res+=" ${clean}⇣${VCS_STATUS_COMMITS_BEHIND}"
    # ⇡42 if ahead of the remote; no leading space if also behind the remote: ⇣42⇡42.
    (( VCS_STATUS_COMMITS_AHEAD && !VCS_STATUS_COMMITS_BEHIND )) && res+=" "
    (( VCS_STATUS_COMMITS_AHEAD  )) && res+="${clean}⇡${VCS_STATUS_COMMITS_AHEAD}"
    # ⇠42 if behind the push remote.
    (( VCS_STATUS_PUSH_COMMITS_BEHIND )) && res+=" ${clean}⇠${VCS_STATUS_PUSH_COMMITS_BEHIND}"
    (( VCS_STATUS_PUSH_COMMITS_AHEAD && !VCS_STATUS_PUSH_COMMITS_BEHIND )) && res+=" "
    # ⇢42 if ahead of the push remote; no leading space if also behind: ⇠42⇢42.
    (( VCS_STATUS_PUSH_COMMITS_AHEAD  )) && res+="${clean}⇢${VCS_STATUS_PUSH_COMMITS_AHEAD}"
    # *42 if have stashes.
    (( VCS_STATUS_STASHES        )) && res+=" ${clean}*${VCS_STATUS_STASHES}"
    # 'merge' if the repo is in an unusual state.
    [[ -n $VCS_STATUS_ACTION     ]] && res+=" ${conflicted}${VCS_STATUS_ACTION}"
    # ~42 if have merge conflicts.
    (( VCS_STATUS_NUM_CONFLICTED )) && res+=" ${conflicted}~${VCS_STATUS_NUM_CONFLICTED}"
    # +42 if have staged changes.
    (( VCS_STATUS_NUM_STAGED     )) && res+=" ${modified}+${VCS_STATUS_NUM_STAGED}"
    # !42 if have unstaged changes.
    (( VCS_STATUS_NUM_UNSTAGED   )) && res+=" ${modified}!${VCS_STATUS_NUM_UNSTAGED}"
    # ?42 if have untracked files. It's really a question mark, your font isn't broken.
    # See POWERLEVEL9K_VCS_UNTRACKED_ICON above if you want to use a different icon.
    # Remove the next line if you don't want to see untracked files at all.
    (( VCS_STATUS_NUM_UNTRACKED  )) && res+=" ${untracked}${(g::)POWERLEVEL9K_VCS_UNTRACKED_ICON}${VCS_STATUS_NUM_UNTRACKED}"
    # "─" if the number of unstaged files is unknown. This can happen due to
    # POWERLEVEL9K_VCS_MAX_INDEX_SIZE_DIRTY (see below) being set to a non-negative number lower
    # than the number of files in the Git index, or due to bash.showDirtyState being set to false
    # in the repository config. The number of staged and untracked files may also be unknown
    # in this case.
    (( VCS_STATUS_HAS_UNSTAGED == -1 )) && res+=" ${modified}─"

    typeset -g my_git_format=$res
  }
  
  functions -M my_git_formatter 2>/dev/null

  # Don't count the number of unstaged, untracked and conflicted files in Git repositories with
  # more than this many files in the index. Negative value means infinity.
  #
  # If you are working in Git repositories with tens of millions of files and seeing performance
  # sagging, try setting POWERLEVEL9K_VCS_MAX_INDEX_SIZE_DIRTY to a number lower than the output
  # of `git ls-files | wc -l`. Don't set it too low or you'll lose useful information. A good
  # balance between performance and functionality is 4000.
  #
  # Tip: You can see how many files you have in your Git repository with `git ls-files | wc -l`.
  typeset -g POWERLEVEL9K_VCS_MAX_INDEX_SIZE_DIRTY=-1

  # Don't show Git status in prompt for repositories whose workdir matches this pattern.
  # For example, if set to '~', the Git repository at '~/work/project' won't be shown.
  # To see the list of active repositories, type `git status --porcelain`.
  typeset -g POWERLEVEL9K_VCS_DISABLED_WORKDIR_PATTERN='~'

  # Disable the default Git status formatting.
  typeset -g POWERLEVEL9K_VCS_DISABLE_GITSTATUS_FORMATTING=true
  # Install our own Git status formatter.
  typeset -g POWERLEVEL9K_VCS_CONTENT_EXPANSION='${$((my_git_formatter(1)))+${my_git_format}}'
  typeset -g POWERLEVEL9K_VCS_LOADING_CONTENT_EXPANSION='${$((my_git_formatter(0)))+${my_git_format}}'
  # Enable counters for staged, unstaged, etc.
  typeset -g POWERLEVEL9K_VCS_{STAGED,UNSTAGED,UNTRACKED,CONFLICTED,COMMITS_AHEAD,COMMITS_BEHIND}_MAX_NUM=-1

  # Icon color.
  typeset -g POWERLEVEL9K_VCS_VISUAL_IDENTIFIER_COLOR=76
  typeset -g POWERLEVEL9K_VCS_LOADING_VISUAL_IDENTIFIER_COLOR=244
  # Custom icon.
  # typeset -g POWERLEVEL9K_VCS_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # Custom prefix.
  # typeset -g POWERLEVEL9K_VCS_PREFIX='%fon '

  # Show status of repositories of these types. You can add svn, hg or bzr if you are
  # using them. If you do, your prompt may become slow even when your current directory
  # isn't in an svn, hg or bzr repository.
  typeset -g POWERLEVEL9K_VCS_BACKENDS=(git)

  # These settings are used for repositories other than Git or when gitstatusd fails and
  # Powerlevel10k has to fall back to using vcs_info.
  typeset -g POWERLEVEL9K_VCS_CLEAN_FOREGROUND=76
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_FOREGROUND=76
  typeset -g POWERLEVEL9K_VCS_MODIFIED_FOREGROUND=178

  ##########################[ status: exit code of the last command ]#########################
  # Enable OK_PIPE, ERROR_PIPE and ERROR_SIGNAL status states to allow us to enable, disable and
  # style them independently from the regular OK and ERROR state.
  typeset -g POWERLEVEL9K_STATUS_EXTENDED_STATES=true

  # Status on success. No content, just an icon. No need to show it if prompt_char is enabled as
  # it will signify success by turning green.
  typeset -g POWERLEVEL9K_STATUS_OK=false
  typeset -g POWERLEVEL9K_STATUS_OK_FOREGROUND=70
  typeset -g POWERLEVEL9K_STATUS_OK_VISUAL_IDENTIFIER_EXPANSION='✓'

  # Status when some part of a pipe command fails but the overall exit status is zero. It may look
  # like this: 1|0.
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE=true
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE_FOREGROUND=70
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE_VISUAL_IDENTIFIER_EXPANSION='✓'

  # Status when it's just an error code (e.g., '1'). No need to show it if prompt_char is enabled as
  # it will signify error by turning red.
  typeset -g POWERLEVEL9K_STATUS_ERROR=false
  typeset -g POWERLEVEL9K_STATUS_ERROR_FOREGROUND=160
  typeset -g POWERLEVEL9K_STATUS_ERROR_VISUAL_IDENTIFIER_EXPANSION='✗'

  # Status when the command was terminated by a signal.
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL=true
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_FOREGROUND=160
  # Use terse signal names: "INT" instead of "SIGINT(2)".
  typeset -g POWERLEVEL9K_STATUS_VERBOSE_SIGNAME=false
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_VISUAL_IDENTIFIER_EXPANSION='✗'

  # Status when some part of a pipe command fails and the overall exit status is also non-zero.
  # It may look like this: 1|0.
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE=true
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_FOREGROUND=160
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_VISUAL_IDENTIFIER_EXPANSION='✗'

  ###################[ command_execution_time: duration of the last command ]###################
  # Execution time color.
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FOREGROUND=248
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_BACKGROUND=
  # Show duration of the last command if takes at least this many seconds.
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_THRESHOLD=3
  # Show this many fractional digits. Zero means round to seconds.
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_PRECISION=0
  # Duration format: 1d 2h 3m 4s.
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FORMAT='d h m s'
  # Custom icon.
  # typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # Custom prefix.
  # typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_PREFIX='%ftook '

  #######################[ background_jobs: presence of background jobs ]#######################
  # Background jobs color.
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_FOREGROUND=70
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_BACKGROUND=
  # Don't show the number of background jobs.
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_VERBOSE=false
  # Custom icon.
  # typeset -g POWERLEVEL9K_BACKGROUND_JOBS_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #######################[ direnv: direnv status (https://direnv.net/) ]########################
  # Direnv color.
  typeset -g POWERLEVEL9K_DIRENV_FOREGROUND=178
  typeset -g POWERLEVEL9K_DIRENV_BACKGROUND=
  # Custom icon.
  # typeset -g POWERLEVEL9K_DIRENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###############[ asdf: asdf version manager (https://github.com/asdf-vm/asdf) ]###############
  # Default asdf color. Only used to display tools for which there is no color override (see below).
  # Tip:  Override this parameter for ${TOOL} with POWERLEVEL9K_ASDF_${TOOL}_FOREGROUND.
  typeset -g POWERLEVEL9K_ASDF_FOREGROUND=66

  # There are four parameters that can be used to hide asdf tools. Each parameter describes
  # conditions under which a tool gets hidden.
  #
  #   Special values:
  #     - false: hide nothing
  #     - true: hide everything
  #
  # POWERLEVEL9K_ASDF_SOURCES: <----- param name
  # Hide tool versions that don't come from one of these sources.
  #
  # Available sources:
  #
  #   * shell       `asdf shell <tool> <version>` -- a version set the current shell
  #   * local       `asdf local <tool> <version>` -- a version set locally in the current dir
  #   * global      `asdf global <tool> <version>` -- a version set globally
  #   * legacy      Version files for non-asdf tools (`~/.nvm/.nvmrc`, `~/.rvm/.ruby-version`, etc.)
  #
  # Example: Hide tool versions that come from global and shell sources.
  #
  #   typeset -g POWERLEVEL9K_ASDF_SOURCES=(local legacy)
  #
  # Special case: If this parameter is set to `true`, it hides all tools that are not installed.
  typeset -g POWERLEVEL9K_ASDF_SOURCES=(shell local global)

  # If set to false, hide tool versions that are the same as global.
  #
  # Note: The version can come from any source, not just from `asdf global` command.
  typeset -g POWERLEVEL9K_ASDF_PROMPT_ALWAYS_SHOW=false

  # If set to false, hide tool versions that are the same as in the home directory.
  typeset -g POWERLEVEL9K_ASDF_SHOW_SYSTEM=true

  # If set to non-empty value, hide tools unless there is a file matching the specified file pattern
  # in the current directory, or its parent diretory, or its grandparent directory, and so on.
  #
  # Example: Hide nodejs version unless there is a file matching `package.json` or `*.js` pattern.
  #
  #   typeset -g POWERLEVEL9K_ASDF_NODEJS_SHOW_ON_UPGLOB='*.js|package.json'
  #
  # Example: Always show nodejs version.
  #
  #   typeset -g POWERLEVEL9K_ASDF_NODEJS_SHOW_ON_UPGLOB=

  # Ruby version from asdf.
  typeset -g POWERLEVEL9K_ASDF_RUBY_FOREGROUND=168
  # typeset -g POWERLEVEL9K_ASDF_RUBY_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_RUBY_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Python version from asdf.
  typeset -g POWERLEVEL9K_ASDF_PYTHON_FOREGROUND=37
  # typeset -g POWERLEVEL9K_ASDF_PYTHON_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_PYTHON_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Go version from asdf.
  typeset -g POWERLEVEL9K_ASDF_GOLANG_FOREGROUND=37
  # typeset -g POWERLEVEL9K_ASDF_GOLANG_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_GOLANG_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Node.js version from asdf.
  typeset -g POWERLEVEL9K_ASDF_NODEJS_FOREGROUND=70
  # typeset -g POWERLEVEL9K_ASDF_NODEJS_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_NODEJS_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Rust version from asdf.
  typeset -g POWERLEVEL9K_ASDF_RUST_FOREGROUND=37
  # typeset -g POWERLEVEL9K_ASDF_RUST_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_RUST_SHOW_ON_UPGLOB='*.foo|*.bar'

  # .NET Core version from asdf.
  typeset -g POWERLEVEL9K_ASDF_DOTNET_CORE_FOREGROUND=134
  # typeset -g POWERLEVEL9K_ASDF_DOTNET_CORE_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_DOTNET_CORE_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Flutter version from asdf.
  typeset -g POWERLEVEL9K_ASDF_FLUTTER_FOREGROUND=38
  # typeset -g POWERLEVEL9K_ASDF_FLUTTER_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_FLUTTER_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Lua version from asdf.
  typeset -g POWERLEVEL9K_ASDF_LUA_FOREGROUND=32
  # typeset -g POWERLEVEL9K_ASDF_LUA_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_LUA_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Java version from asdf.
  typeset -g POWERLEVEL9K_ASDF_JAVA_FOREGROUND=32
  # typeset -g POWERLEVEL9K_ASDF_JAVA_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_JAVA_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Erlang version from asdf.
  typeset -g POWERLEVEL9K_ASDF_ERLANG_FOREGROUND=125
  # typeset -g POWERLEVEL9K_ASDF_ERLANG_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_ERLANG_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Elixir version from asdf.
  typeset -g POWERLEVEL9K_ASDF_ELIXIR_FOREGROUND=129
  # typeset -g POWERLEVEL9K_ASDF_ELIXIR_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_ELIXIR_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Postgres version from asdf.
  typeset -g POWERLEVEL9K_ASDF_POSTGRES_FOREGROUND=31
  # typeset -g POWERLEVEL9K_ASDF_POSTGRES_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_POSTGRES_SHOW_ON_UPGLOB='*.foo|*.bar'

  # PHP version from asdf.
  typeset -g POWERLEVEL9K_ASDF_PHP_FOREGROUND=99
  # typeset -g POWERLEVEL9K_ASDF_PHP_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_PHP_SHOW_ON_UPGLOB='*.foo|*.bar'

  # Haskell version from asdf.
  typeset -g POWERLEVEL9K_ASDF_HASKELL_FOREGROUND=172
  # typeset -g POWERLEVEL9K_ASDF_HASKELL_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # typeset -g POWERLEVEL9K_ASDF_HASKELL_SHOW_ON_UPGLOB='*.foo|*.bar'

  ##########[ virtualenv: python virtual environment (https://docs.python.org/3/library/venv.html) ]##########
  # Python virtual environment color.
  typeset -g POWERLEVEL9K_VIRTUALENV_FOREGROUND=37
  # Don't show Python version next to the virtual environment name.
  typeset -g POWERLEVEL9K_VIRTUALENV_SHOW_PYTHON_VERSION=false
  # If set to "false", won't show virtualenv if pyenv is already shown.
  # If set to "if-different", won't show virtualenv if it's the same as pyenv.
  typeset -g POWERLEVEL9K_VIRTUALENV_SHOW_WITH_PYENV=false
  # Separate environment name from Python version only with a space.
  typeset -g POWERLEVEL9K_VIRTUALENV_{LEFT,RIGHT}_DELIMITER=
  # Custom icon.
  # typeset -g POWERLEVEL9K_VIRTUALENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ############[ anaconda: conda environment (https://conda.io/) ]############
  # Anaconda environment color.
  typeset -g POWERLEVEL9K_ANACONDA_FOREGROUND=37

  # Don't show Python version next to the anaconda environment name.
  typeset -g POWERLEVEL9K_ANACONDA_SHOW_PYTHON_VERSION=false
  # If set to "false", won't show anaconda if pyenv is already shown.
  # If set to "if-different", won't show anaconda if it's the same as pyenv.
  typeset -g POWERLEVEL9K_ANACONDA_SHOW_WITH_PYENV=false
  # Separate environment name from Python version only with a space.
  typeset -g POWERLEVEL9K_ANACONDA_{LEFT,RIGHT}_DELIMITER=
  # Custom icon.
  # typeset -g POWERLEVEL9K_ANACONDA_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ################[ pyenv: python environment (https://github.com/pyenv/pyenv) ]################
  # Pyenv color.
  typeset -g POWERLEVEL9K_PYENV_FOREGROUND=37
  # Hide python version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_PYENV_SOURCES=(shell local global)
  # If set to false, hide python version if it's the same as global:
  # $(pyenv version-name) == $(pyenv global).
  typeset -g POWERLEVEL9K_PYENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide python version if it's equal to "system".
  typeset -g POWERLEVEL9K_PYENV_SHOW_SYSTEM=true

  # Pyenv segment format. The following parameters are available within the expansion:
  #
  # - P9K_CONTENT                Current pyenv environment (pyenv version-name).
  # - P9K_PYENV_PYTHON_VERSION   Current python version (python --version).
  #
  # The default format has the following logic:
  #
  # 1. Display just "$P9K_CONTENT" if it's equal to "$P9K_PYENV_PYTHON_VERSION" or
  #    starts with "$P9K_PYENV_PYTHON_VERSION/".
  # 2. Otherwise display "$P9K_CONTENT $P9K_PYENV_PYTHON_VERSION".
  typeset -g POWERLEVEL9K_PYENV_CONTENT_EXPANSION='${P9K_CONTENT}${${P9K_CONTENT:#$P9K_PYENV_PYTHON_VERSION(|/*)}:+ $P9K_PYENV_PYTHON_VERSION}'
  # Custom icon.
  # typeset -g POWERLEVEL9K_PYENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ################[ goenv: go environment (https://github.com/syndbg/goenv) ]################
  # Goenv color.
  typeset -g POWERLEVEL9K_GOENV_FOREGROUND=37
  # Hide go version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_GOENV_SOURCES=(shell local global)
  # If set to false, hide go version if it's the same as global:
  # $(goenv version-name) == $(goenv global).
  typeset -g POWERLEVEL9K_GOENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide go version if it's equal to "system".
  typeset -g POWERLEVEL9K_GOENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_GOENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##########[ nodenv: node.js version from nodenv (https://github.com/nodenv/nodenv) ]##########
  # Nodenv color.
  typeset -g POWERLEVEL9K_NODENV_FOREGROUND=70
  # Hide node version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_NODENV_SOURCES=(shell local global)
  # If set to false, hide node version if it's the same as global:
  # $(nodenv version-name) == $(nodenv global).
  typeset -g POWERLEVEL9K_NODENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide node version if it's equal to "system".
  typeset -g POWERLEVEL9K_NODENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_NODENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##############[ nvm: node.js version from nvm (https://github.com/nvm-sh/nvm) ]###############
  # Nvm color.
  typeset -g POWERLEVEL9K_NVM_FOREGROUND=70
  # Custom icon.
  # typeset -g POWERLEVEL9K_NVM_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ############[ nodeenv: node.js environment (https://github.com/ekalinin/nodeenv) ]############
  # Nodeenv color.
  typeset -g POWERLEVEL9K_NODEENV_FOREGROUND=70
  # Don't show Node version next to the environment name.
  typeset -g POWERLEVEL9K_NODEENV_SHOW_NODE_VERSION=false
  # Separate environment name from Node version only with a space.
  typeset -g POWERLEVEL9K_NODEENV_{LEFT,RIGHT}_DELIMITER=
  # Custom icon.
  # typeset -g POWERLEVEL9K_NODEENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##############################[ node_version: node.js version ]###############################
  # Node version color.
  typeset -g POWERLEVEL9K_NODE_VERSION_FOREGROUND=70
  # Show node version only when in a directory tree containing package.json.
  typeset -g POWERLEVEL9K_NODE_VERSION_PROJECT_ONLY=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_NODE_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #######################[ go_version: go version (https://golang.org) ]########################
  # Go version color.
  typeset -g POWERLEVEL9K_GO_VERSION_FOREGROUND=37
  # Show go version only when in a go project subdirectory.
  typeset -g POWERLEVEL9K_GO_VERSION_PROJECT_ONLY=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_GO_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #######################[ rust_version: rustc version (https://www.rust-lang.org) ]#######################
  # Rust version color.
  typeset -g POWERLEVEL9K_RUST_VERSION_FOREGROUND=37
  # Show rust version only when in a rust project subdirectory.
  typeset -g POWERLEVEL9K_RUST_VERSION_PROJECT_ONLY=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_RUST_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###############[ dotnet_version: .NET version (https://dotnet.microsoft.com) ]################
  # .NET version color.
  typeset -g POWERLEVEL9K_DOTNET_VERSION_FOREGROUND=134
  # Show .NET version only when in a .NET project subdirectory.
  typeset -g POWERLEVEL9K_DOTNET_VERSION_PROJECT_ONLY=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_DOTNET_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #####################[ php_version: php version (https://www.php.net/) ]######################
  # PHP version color.
  typeset -g POWERLEVEL9K_PHP_VERSION_FOREGROUND=99
  # Show PHP version only when in a PHP project subdirectory.
  typeset -g POWERLEVEL9K_PHP_VERSION_PROJECT_ONLY=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_PHP_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##########[ laravel_version: laravel php framework version (https://laravel.com/) ]###########
  # Laravel version color.
  typeset -g POWERLEVEL9K_LARAVEL_VERSION_FOREGROUND=161
  # Custom icon.
  # typeset -g POWERLEVEL9K_LARAVEL_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ####################[ java_version: java version (https://www.java.com/) ]####################
  # Java version color.
  typeset -g POWERLEVEL9K_JAVA_VERSION_FOREGROUND=32
  # Show java version only when in a java project subdirectory.
  typeset -g POWERLEVEL9K_JAVA_VERSION_PROJECT_ONLY=true
  # Show brief version.
  typeset -g POWERLEVEL9K_JAVA_VERSION_FULL=false
  # Custom icon.
  # typeset -g POWERLEVEL9K_JAVA_VERSION_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###[ package: name@version from package.json (https://docs.npmjs.com/files/package.json) ]####
  # Package color.
  typeset -g POWERLEVEL9K_PACKAGE_FOREGROUND=117
  # Package format. The following parameters are available within the expansion:
  #
  # - P9K_PACKAGE_NAME     The value of `name` field in package.json.
  # - P9K_PACKAGE_VERSION  The value of `version` field in package.json.
  #
  # typeset -g POWERLEVEL9K_PACKAGE_CONTENT_EXPANSION='${P9K_PACKAGE_NAME//\%/%%}@${P9K_PACKAGE_VERSION//\%/%%}'
  # Custom icon.
  # typeset -g POWERLEVEL9K_PACKAGE_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #############[ rbenv: ruby version from rbenv (https://github.com/rbenv/rbenv) ]##############
  # Rbenv color.
  typeset -g POWERLEVEL9K_RBENV_FOREGROUND=168
  # Hide ruby version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_RBENV_SOURCES=(shell local global)
  # If set to false, hide ruby version if it's the same as global:
  # $(rbenv version-name) == $(rbenv global).
  typeset -g POWERLEVEL9K_RBENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide ruby version if it's equal to "system".
  typeset -g POWERLEVEL9K_RBENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_RBENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #######################[ rvm: ruby version from rvm (https://rvm.io) ]########################
  # Rvm color.
  typeset -g POWERLEVEL9K_RVM_FOREGROUND=168
  # Don't show @gemset at the end.
  typeset -g POWERLEVEL9K_RVM_SHOW_GEMSET=false
  # Don't show ruby- at the front.
  typeset -g POWERLEVEL9K_RVM_SHOW_PREFIX=false
  # Custom icon.
  # typeset -g POWERLEVEL9K_RVM_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###########[ fvm: flutter version management (https://github.com/leoafarias/fvm) ]############
  # Fvm color.
  typeset -g POWERLEVEL9K_FVM_FOREGROUND=38
  # Custom icon.
  # typeset -g POWERLEVEL9K_FVM_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##########[ luaenv: lua version from luaenv (https://github.com/cehoffman/luaenv) ]###########
  # Lua color.
  typeset -g POWERLEVEL9K_LUAENV_FOREGROUND=32
  # Hide lua version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_LUAENV_SOURCES=(shell local global)
  # If set to false, hide lua version if it's the same as global:
  # $(luaenv version-name) == $(luaenv global).
  typeset -g POWERLEVEL9K_LUAENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide lua version if it's equal to "system".
  typeset -g POWERLEVEL9K_LUAENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_LUAENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###############[ jenv: java version from jenv (https://github.com/jenv/jenv) ]################
  # Jenv color.
  typeset -g POWERLEVEL9K_JENV_FOREGROUND=32
  # Hide java version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_JENV_SOURCES=(shell local global)
  # If set to false, hide java version if it's the same as global:
  # $(jenv version-name) == $(jenv global).
  typeset -g POWERLEVEL9K_JENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide java version if it's equal to "system".
  typeset -g POWERLEVEL9K_JENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_JENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###########[ plenv: perl version from plenv (https://github.com/tokuhirom/plenv) ]############
  # Plenv color.
  typeset -g POWERLEVEL9K_PLENV_FOREGROUND=67
  # Hide perl version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_PLENV_SOURCES=(shell local global)
  # If set to false, hide perl version if it's the same as global:
  # $(plenv version-name) == $(plenv global).
  typeset -g POWERLEVEL9K_PLENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide perl version if it's equal to "system".
  typeset -g POWERLEVEL9K_PLENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_PLENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ############[ phpenv: php version from phpenv (https://github.com/phpenv/phpenv) ]############
  # Phpenv color.
  typeset -g POWERLEVEL9K_PHPENV_FOREGROUND=99
  # Hide php version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_PHPENV_SOURCES=(shell local global)
  # If set to false, hide php version if it's the same as global:
  # $(phpenv version-name) == $(phpenv global).
  typeset -g POWERLEVEL9K_PHPENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide php version if it's equal to "system".
  typeset -g POWERLEVEL9K_PHPENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_PHPENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #######[ scalaenv: scala version from scalaenv (https://github.com/scalaenv/scalaenv) ]#######
  # Scalaenv color.
  typeset -g POWERLEVEL9K_SCALAENV_FOREGROUND=160
  # Hide scala version if it doesn't come from one of these sources.
  typeset -g POWERLEVEL9K_SCALAENV_SOURCES=(shell local global)
  # If set to false, hide scala version if it's the same as global:
  # $(scalaenv version-name) == $(scalaenv global).
  typeset -g POWERLEVEL9K_SCALAENV_PROMPT_ALWAYS_SHOW=false
  # If set to false, hide scala version if it's equal to "system".
  typeset -g POWERLEVEL9K_SCALAENV_SHOW_SYSTEM=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_SCALAENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##########[ haskell_stack: haskell version from stack (https://haskellstack.org/) ]###########
  # Haskell color.
  typeset -g POWERLEVEL9K_HASKELL_STACK_FOREGROUND=172
  # Hide haskell version if it doesn't come from one of these sources.
  #
  #   shell:  version is set by STACK_YAML
  #   local:  version is set by stack.yaml up the directory tree
  #   global: version is set by the implicit global project (~/.stack/global-project/stack.yaml)
  typeset -g POWERLEVEL9K_HASKELL_STACK_SOURCES=(shell local)
  # If set to false, hide haskell version if it's the same as in the implicit global project.
  typeset -g POWERLEVEL9K_HASKELL_STACK_ALWAYS_SHOW=true
  # Custom icon.
  # typeset -g POWERLEVEL9K_HASKELL_STACK_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ################[ terraform: terraform workspace (https://www.terraform.io) ]#################
  # POWERLEVEL9K_TERRAFORM_SHOW_DEFAULT -- Include the "default" workspace in the prompt.
  typeset -g POWERLEVEL9K_TERRAFORM_SHOW_DEFAULT=false
  # Terraform color.
  typeset -g POWERLEVEL9K_TERRAFORM_FOREGROUND=38
  # Custom icon.
  # typeset -g POWERLEVEL9K_TERRAFORM_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #[ aws: aws profile (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html) ]#
  # Show aws only when the the command you are about to run is one of these.
  typeset -g POWERLEVEL9K_AWS_SHOW_ON_COMMAND='aws|awless|terraform|pulumi|terragrunt'

  # POWERLEVEL9K_AWS_SHOW_DEFAULT -- Include the "default" profile in the prompt.
  typeset -g POWERLEVEL9K_AWS_SHOW_DEFAULT=false
  # AWS color.
  typeset -g POWERLEVEL9K_AWS_FOREGROUND=208
  # Custom icon.
  # typeset -g POWERLEVEL9K_AWS_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #[ aws_eb_env: aws elastic beanstalk environment (https://aws.amazon.com/elasticbeanstalk/) ]#
  # AWS Elastic Beanstalk environment color.
  typeset -g POWERLEVEL9K_AWS_EB_ENV_FOREGROUND=70
  # Custom icon.
  # typeset -g POWERLEVEL9K_AWS_EB_ENV_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##########[ azure: azure account name (https://docs.microsoft.com/en-us/cli/azure) ]##########
  # Show azure only when the the command you are about to run is one of these.
  typeset -g POWERLEVEL9K_AZURE_SHOW_ON_COMMAND='az|terraform|pulumi|terragrunt'
  # Azure account name color.
  typeset -g POWERLEVEL9K_AZURE_FOREGROUND=32
  # Custom icon.
  # typeset -g POWERLEVEL9K_AZURE_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##########[ gcloud: google cloud account and project (https://cloud.google.com/) ]###########
  # Show gcloud only when the the command you are about to run is one of these.
  typeset -g POWERLEVEL9K_GCLOUD_SHOW_ON_COMMAND='gcloud|gcs|gsutil'
  # Google cloud color.
  typeset -g POWERLEVEL9K_GCLOUD_FOREGROUND=32

  # Google cloud format. Change the value of POWERLEVEL9K_GCLOUD_PARTIAL_CONTENT_EXPANSION and/or
  # POWERLEVEL9K_GCLOUD_COMPLETE_CONTENT_EXPANSION if the default is too verbose or not informative
  # enough. You can use the following parameters in the expansions. Each of them corresponds to the
  # output of `gcloud` tool.
  #
  #   Parameter                | Source
  #   -------------------------|--------------------------------------------------------------------
  #   P9K_GCLOUD_CONFIGURATION | gcloud config configurations list --format='value(name)'
  #   P9K_GCLOUD_ACCOUNT       | gcloud config get-value account
  #   P9K_GCLOUD_PROJECT_ID    | gcloud config get-value project
  #   P9K_GCLOUD_PROJECT_NAME  | gcloud projects describe $P9K_GCLOUD_PROJECT_ID --format='value(name)'
  #
  # Note: ${P9K_GCLOUD_PROJECT_NAME} expands to the project name if P9K_GCLOUD_PROJECT_ID is not
  # empty and to empty string otherwise. When P9K_GCLOUD_PROJECT_ID is empty, it means there is no
  # active project and the rest of parameters in the table above are not available. $P9K_GCLOUD_PROJECT_ID
  # is exact match for `gcloud config get-value project` output.
  #
  # Obtaining project name requires sending a request to Google servers. This can take a long time
  # and even fail. When project name is not available, P9K_GCLOUD_PROJECT_NAME will expand to
  # P9K_GCLOUD_PROJECT_ID. To disable project name lookup, set POWERLEVEL9K_GCLOUD_REFRESH_PROJECT_NAME_SECONDS
  # to 0. To accelerate the initial lookup, set POWERLEVEL9K_GCLOUD_REFRESH_PROJECT_NAME_SECONDS to a small
  # positive number; the default value is 3600 (1 hour).
  #
  # When the current configuration, account or project are not the same as in the previous prompt,
  # background project name lookup gets triggered.
  #
  #   Original prompt:     my-config my-account my-project
  #   Prompts with lookup: my-config my-account my-project-1234
  #
  # You can change the format for the time when project name is being looked up:
  #
  #   typeset -g POWERLEVEL9K_GCLOUD_PARTIAL_CONTENT_EXPANSION='${P9K_GCLOUD_PROJECT_ID//\%/%%}'
  #   typeset -g POWERLEVEL9K_GCLOUD_COMPLETE_CONTENT_EXPANSION='${P9K_GCLOUD_PROJECT_NAME//\%/%%}'
  #
  # The default format:
  #
  #   * Always show configuration name.
  #   * Show account name only if it's not the same as configuration name.
  #   * Show project name (or project id if name isn't available) if it's not empty.
  #
  typeset -g POWERLEVEL9K_GCLOUD_PARTIAL_CONTENT_EXPANSION='${P9K_GCLOUD_PROJECT_ID:+${${P9K_GCLOUD_ACCOUNT:#*@}//\%/%%}${${P9K_GCLOUD_PROJECT_ID//\%/%%}:+ }}'
  typeset -g POWERLEVEL9K_GCLOUD_COMPLETE_CONTENT_EXPANSION='${P9K_GCLOUD_PROJECT_NAME:+${${P9K_GCLOUD_ACCOUNT:#*@}//\%/%%}${${P9K_GCLOUD_PROJECT_NAME//\%/%%}:+ }}'

  # Custom icon.
  # typeset -g POWERLEVEL9K_GCLOUD_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #[ google_app_cred: google application credentials (https://cloud.google.com/docs/authentication/production) ]#
  # Show google_app_cred only when the the command you are about to run is one of these.
  typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_SHOW_ON_COMMAND='terraform|pulumi|terragrunt'
  # Google application credentials classes for the purpose of using different icons and colors with
  # different credential types.
  #
  #   POWERLEVEL9K_GOOGLE_APP_CRED_CLASSES is an array with even number of elements. The first
  #   element in each pair defines a pattern against which the current directory gets matched.
  #   More specifically, it's P9K_CONTENT prior to the application of POWERLEVEL9K_GOOGLE_APP_CRED_CONTENT_EXPANSION.
  #   If the pattern matches, the credential gets the class given by the second element in the pair.
  #
  #   For example, given these settings:
  #
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_CLASSES=(
  #         '*:*prod*'  PROD
  #         '*:*test*'  TEST
  #         '*'         DEFAULT)
  #
  #   If P9K_CONTENT is "service_account deathray-testing" then it will match the pattern '*:*prod*'
  #   and thus will have the class PROD.
  #
  #   You can define different icons and colors for different classes:
  #
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_PROD_FOREGROUND=red
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_PROD_VISUAL_IDENTIFIER_EXPANSION='⚠️'
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_TEST_FOREGROUND=green
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_TEST_VISUAL_IDENTIFIER_EXPANSION='✅'
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_DEFAULT_FOREGROUND=blue
  #     typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_DEFAULT_VISUAL_IDENTIFIER_EXPANSION='💙'
  #
  typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_CLASSES=(
      # '*:*prod*'  PROD    # These values are examples that are unlikely
      # '*:*test*'  TEST    # to match your needs. Customize them as needed.
      '*'         DEFAULT)
  typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_DEFAULT_FOREGROUND=32
  # typeset -g POWERLEVEL9K_GOOGLE_APP_CRED_DEFAULT_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##############[ kubecontext: current kubernetes context (https://kubernetes.io/) ]##############
  # Show kubecontext only when the the command you are about to run is one of these.
  typeset -g POWERLEVEL9K_KUBECONTEXT_SHOW_ON_COMMAND='kubectl|helm|kubens|kubectx|oc|istioctl|kogito|k9s|helmfile|flux|fluxctl|stern|kubeseal|skaffold|kubent|kubecolor'

  # Kubernetes context classes for the purpose of using different icons and colors with
  # different contexts.
  #
  #   POWERLEVEL9K_KUBECONTEXT_CLASSES is an array with even number of elements. The first
  #   element in each pair defines a pattern against which the current kubernetes context gets
  #   matched. More specifically, it's P9K_CONTENT prior to the application of
  #   POWERLEVEL9K_KUBECONTEXT_CONTENT_EXPANSION. If the pattern matches, the context gets the
  #   class given by the second element in the pair.
  #
  #   For example, given these settings:
  #
  #     typeset -g POWERLEVEL9K_KUBECONTEXT_CLASSES=(
  #         '*prod*'  PROD
  #         '*test*'  TEST
  #         '*'       DEFAULT)
  #
  #   If your current kubernetes context is "deathray-testing/default", it'll match "*test*"
  #   and thus will have the class TEST.
  #
  #   You can define different icons and colors for different classes:
  #
  #     typeset -g POWERLEVEL9K_KUBECONTEXT_TEST_FOREGROUND=28
  #     typeset -g POWERLEVEL9K_KUBECONTEXT_TEST_VISUAL_IDENTIFIER_EXPANSION='⭐'
  #
  typeset -g POWERLEVEL9K_KUBECONTEXT_CLASSES=(
      # '*prod*'  PROD    # These values are examples that are unlikely
      # '*test*'  TEST    # to match your needs. Customize them as needed.
      '*'       DEFAULT)
  typeset -g POWERLEVEL9K_KUBECONTEXT_DEFAULT_FOREGROUND=134
  # typeset -g POWERLEVEL9K_KUBECONTEXT_DEFAULT_VISUAL_IDENTIFIER_EXPANSION='⭐'

  # Use POWERLEVEL9K_KUBECONTEXT_CONTENT_EXPANSION to specify the content displayed by kubecontext
  # segment. Parameter expansions are very flexible and fast, too. See reference:
  # http://zsh.sourceforge.net/Doc/Release/Expansion.html#Parameter-Expansion.
  #
  # Within the expansion the following parameters are always available:
  #
  # - P9K_KUBECONTEXT_NAME     The current context's name. Corresponds to column NAME in the
  #                            output of `kubectl config get-contexts`.
  # - P9K_KUBECONTEXT_CLUSTER  The current context's cluster. Corresponds to column CLUSTER in the
  #                            output of `kubectl config get-contexts`.
  # - P9K_KUBECONTEXT_USER     The current context's user. Corresponds to column AUTHINFO in the
  #                            output of `kubectl config get-contexts`.
  # - P9K_KUBECONTEXT_NAMESPACE The current context's namespace. Corresponds to column NAMESPACE
  #                            in the output of `kubectl config get-contexts`. If there is no
  #                            namespace, the parameter is set to "default".
  #
  # If the context points to Google Kubernetes Engine (GKE) or Elastic Kubernetes Service (EKS),
  # the following extra parameters are available:
  #
  # - P9K_KUBECONTEXT_CLOUD_NAME     Either "gke" or "eks".
  # - P9K_KUBECONTEXT_CLOUD_ACCOUNT  Account/project ID.
  # - P9K_KUBECONTEXT_CLOUD_ZONE     Availability zone.
  # - P9K_KUBECONTEXT_CLOUD_CLUSTER  Cluster name.
  #
  # P9K_KUBECONTEXT_CLOUD_* parameters are derived from P9K_KUBECONTEXT_CLUSTER. For example,
  # if P9K_KUBECONTEXT_CLUSTER is "gke_my-account_us-east1-a_my-cluster-01":
  #
  #   - P9K_KUBECONTEXT_CLOUD_NAME=gke
  #   - P9K_KUBECONTEXT_CLOUD_ACCOUNT=my-account
  #   - P9K_KUBECONTEXT_CLOUD_ZONE=us-east1-a
  #   - P9K_KUBECONTEXT_CLOUD_CLUSTER=my-cluster-01
  #
  # If P9K_KUBECONTEXT_CLUSTER is "arn:aws:eks:us-east-1:123456789012:cluster/my-cluster-01":
  #
  #   - P9K_KUBECONTEXT_CLOUD_NAME=eks
  #   - P9K_KUBECONTEXT_CLOUD_ACCOUNT=123456789012
  #   - P9K_KUBECONTEXT_CLOUD_ZONE=us-east-1
  #   - P9K_KUBECONTEXT_CLOUD_CLUSTER=my-cluster-01
  typeset -g POWERLEVEL9K_KUBECONTEXT_CONTENT_EXPANSION=
  # Show P9K_KUBECONTEXT_CLOUD_CLUSTER if it's not empty and fall back to P9K_KUBECONTEXT_NAME.
  POWERLEVEL9K_KUBECONTEXT_CONTENT_EXPANSION+='${P9K_KUBECONTEXT_CLOUD_CLUSTER:-${P9K_KUBECONTEXT_NAME//\%/%%}}'
  # Append the current context's namespace if it's not "default".
  POWERLEVEL9K_KUBECONTEXT_CONTENT_EXPANSION+='${${P9K_KUBECONTEXT_NAMESPACE:#default}:+/${P9K_KUBECONTEXT_NAMESPACE//\%/%%}}'

  # Custom prefix.
  # typeset -g POWERLEVEL9K_KUBECONTEXT_PREFIX='%fon '

  #######################[ context: user@hostname ]########################
  # Context color when running with privileges.
  typeset -g POWERLEVEL9K_CONTEXT_ROOT_FOREGROUND=178
  # Context color in SSH without privileges.
  typeset -g POWERLEVEL9K_CONTEXT_{REMOTE,REMOTE_SUDO}_FOREGROUND=180
  # Default context color (no privileges, no SSH).
  typeset -g POWERLEVEL9K_CONTEXT_FOREGROUND=180

  # Context format when running with privileges: bold user@hostname.
  typeset -g POWERLEVEL9K_CONTEXT_ROOT_TEMPLATE='%B%n@%m'
  # Context format when in SSH without privileges: user@hostname.
  typeset -g POWERLEVEL9K_CONTEXT_{REMOTE,REMOTE_SUDO}_TEMPLATE='%n@%m'
  # Default context format (no privileges, no SSH): user@hostname.
  typeset -g POWERLEVEL9K_CONTEXT_TEMPLATE='%n@%m'

  # Don't show context unless running with privileges or in SSH.
  # Tip: Remove the next line to always show context.
  typeset -g POWERLEVEL9K_CONTEXT_{DEFAULT,SUDO}_{CONTENT,VISUAL_IDENTIFIER}_EXPANSION=

  # Custom icon.
  # typeset -g POWERLEVEL9K_CONTEXT_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # Custom prefix.
  # typeset -g POWERLEVEL9K_CONTEXT_PREFIX='%fwith '

  ###[ nordvpn: nordvpn connection status, linux only (https://nordvpn.com/) ]###
  # NordVPN connection indicator color.
  typeset -g POWERLEVEL9K_NORDVPN_{DISCONNECTED,CONNECTING,DISCONNECTING}_FOREGROUND=7
  typeset -g POWERLEVEL9K_NORDVPN_CONNECTED_FOREGROUND=2
  # Hide NordVPN connection indicator when not connected.
  typeset -g POWERLEVEL9K_NORDVPN_{DISCONNECTED,CONNECTING,DISCONNECTING}_CONTENT_EXPANSION=
  typeset -g POWERLEVEL9K_NORDVPN_{DISCONNECTED,CONNECTING,DISCONNECTING}_VISUAL_IDENTIFIER_EXPANSION=
  # Custom icon.
  # typeset -g POWERLEVEL9K_NORDVPN_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #################[ ranger: ranger shell (https://github.com/ranger/ranger) ]##################
  # Ranger shell color.
  typeset -g POWERLEVEL9K_RANGER_FOREGROUND=178
  # Custom icon.
  # typeset -g POWERLEVEL9K_RANGER_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ######################[ nnn: nnn shell (https://github.com/jarun/nnn) ]#######################
  # Nnn shell color.
  typeset -g POWERLEVEL9K_NNN_FOREGROUND=72
  # Custom icon.
  # typeset -g POWERLEVEL9K_NNN_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##################[ vim_shell: vim shell indicator (:sh) ]###################
  # Vim shell indicator color.
  typeset -g POWERLEVEL9K_VIM_SHELL_FOREGROUND=34
  # Custom icon.
  # typeset -g POWERLEVEL9K_VIM_SHELL_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ######[ midnight_commander: midnight commander shell (https://midnight-commander.org/) ]######
  # Midnight Commander shell color.
  typeset -g POWERLEVEL9K_MIDNIGHT_COMMANDER_FOREGROUND=178
  # Custom icon.
  # typeset -g POWERLEVEL9K_MIDNIGHT_COMMANDER_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #[ nix_shell: nix shell (https://nixos.org/nixos/nix-pills/developing-with-nix-shell.html) ]####
  # Nix shell color.
  typeset -g POWERLEVEL9K_NIX_SHELL_FOREGROUND=74

  # Tip: If you want to see just the icon without "pure" and "impure", uncomment the next line.
  # typeset -g POWERLEVEL9K_NIX_SHELL_CONTENT_EXPANSION=

  # Custom icon.
  # typeset -g POWERLEVEL9K_NIX_SHELL_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##################################[ vi_mode: vi mode ]##################################
  # Vi mode color.
  typeset -g POWERLEVEL9K_VI_COMMAND_MODE_STRING=COMMAND
  typeset -g POWERLEVEL9K_VI_INSERT_MODE_STRING=INSERT
  typeset -g POWERLEVEL9K_VI_VISUAL_MODE_STRING=VISUAL

  typeset -g POWERLEVEL9K_VI_MODE_INSERT_FOREGROUND=66
  typeset -g POWERLEVEL9K_VI_MODE_COMMAND_FOREGROUND=196
  typeset -g POWERLEVEL9K_VI_MODE_VISUAL_FOREGROUND=68

  ######################################[ ram: free RAM ]#######################################
  # RAM color.
  typeset -g POWERLEVEL9K_RAM_FOREGROUND=66
  # Custom icon.
  # typeset -g POWERLEVEL9K_RAM_VISUAL_IDENTIFIER_EXPANSION='⭐'

  #####################################[ swap: used swap ]######################################
  # Swap color.
  typeset -g POWERLEVEL9K_SWAP_FOREGROUND=96
  # Custom icon.
  # typeset -g POWERLEVEL9K_SWAP_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ######################################[ load: CPU load ]######################################
  # Show average CPU load over this many last minutes. Valid values are 1, 5 and 15.
  typeset -g POWERLEVEL9K_LOAD_WHICH=5
  # Load color when load is under 50% of CPU cores.
  typeset -g POWERLEVEL9K_LOAD_NORMAL_FOREGROUND=66
  # Load color when load is between 50% and 70% of CPU cores.
  typeset -g POWERLEVEL9K_LOAD_WARNING_FOREGROUND=178
  # Load color when load is over 70% of CPU cores.
  typeset -g POWERLEVEL9K_LOAD_CRITICAL_FOREGROUND=166
  # Custom icon.
  # typeset -g POWERLEVEL9K_LOAD_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ################[ todo: todo items (https://github.com/todotxt/todo.txt-cli) ]################
  # Todo color.
  typeset -g POWERLEVEL9K_TODO_FOREGROUND=110
  # Hide todo when the total number of tasks is zero.
  typeset -g POWERLEVEL9K_TODO_HIDE_ZERO_TOTAL=true
  # Hide todo when the number of tasks after filtering is zero.
  typeset -g POWERLEVEL9K_TODO_HIDE_ZERO_FILTERED=false

  # Todo format. The following parameters are available within the expansion:
  #
  # - P9K_TODO_TOTAL_TASK_COUNT     The total number of tasks.
  # - P9K_TODO_FILTERED_TASK_COUNT  The number of tasks after filtering.
  #
  # These variables correspond to the last line of the output of `todo.sh -p ls`:
  #
  #   TODO: 24 of 42 tasks shown
  #
  # Here 24 is P9K_TODO_FILTERED_TASK_COUNT and 42 is P9K_TODO_TOTAL_TASK_COUNT.
  #
  # typeset -g POWERLEVEL9K_TODO_CONTENT_EXPANSION='$P9K_TODO_FILTERED_TASK_COUNT'

  # Custom icon.
  # typeset -g POWERLEVEL9K_TODO_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ###########[ timewarrior: timewarrior tracking status (https://timewarrior.net/) ]############
  # Timewarrior color.
  typeset -g POWERLEVEL9K_TIMEWARRIOR_FOREGROUND=110
  # If the tracked task is longer than 24 characters, truncate and append "…".
  # Tip: To always display tasks without truncation, delete the following parameter.
  # Tip: To hide task names and display just the icon when time tracking is enabled, set the
  # value of the following parameter to "".
  typeset -g POWERLEVEL9K_TIMEWARRIOR_CONTENT_EXPANSION='${P9K_TIMEWARRIOR_DATA//\%/%%}'

  # Custom icon.
  # typeset -g POWERLEVEL9K_TIMEWARRIOR_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##############[ taskwarrior: taskwarrior task count (https://taskwarrior.org/) ]##############
  # Taskwarrior color.
  typeset -g POWERLEVEL9K_TASKWARRIOR_FOREGROUND=74

  # Taskwarrior segment format. The following parameters are available within the expansion:
  #
  # - P9K_TASKWARRIOR_PENDING_COUNT   The number of pending tasks: `task +PENDING count`.
  # - P9K_TASKWARRIOR_OVERDUE_COUNT   The number of overdue tasks: `task +OVERDUE count`.
  #
  # Zero values are represented as empty parameters.
  #
  # The default format:
  #
  #   '${P9K_TASKWARRIOR_OVERDUE_COUNT:+"!$P9K_TASKWARRIOR_OVERDUE_COUNT/"}${P9K_TASKWARRIOR_PENDING_COUNT:+"$P9K_TASKWARRIOR_PENDING_COUNT"}'
  #
  # typeset -g POWERLEVEL9K_TASKWARRIOR_CONTENT_EXPANSION='$P9K_TASKWARRIOR_PENDING_COUNT'

  # Custom icon.
  # typeset -g POWERLEVEL9K_TASKWARRIOR_VISUAL_IDENTIFIER_EXPANSION='⭐'

  ##################################[ time: current time ]##################################
  # Current time color.
  typeset -g POWERLEVEL9K_TIME_FOREGROUND=66
  # Format for the current time: 09:51:02. See `man 3 strftime`.
  typeset -g POWERLEVEL9K_TIME_FORMAT='%D{%H:%M:%S}'
  # If set to true, time will update when you hit enter. This way prompts for the past
  # commands will contain the start times of their commands as opposed to the default
  # behavior where they contain the end times of their preceding commands.
  typeset -g POWERLEVEL9K_TIME_UPDATE_ON_COMMAND=false
  # Custom icon.
  # typeset -g POWERLEVEL9K_TIME_VISUAL_IDENTIFIER_EXPANSION='⭐'
  # Custom prefix.
  # typeset -g POWERLEVEL9K_TIME_PREFIX='%fat '

  # Example of a user-defined prompt segment. Function prompt_example will be called on every
  # prompt if `example` prompt segment is added to POWERLEVEL9K_LEFT_PROMPT_ELEMENTS or
  # POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS. It displays an icon and orange text greeting the user.
  #
  # Type `p10k help segment` for documentation and a more sophisticated example.
  function prompt_example() {
    p10k segment -f 208 -i '⭐' -t 'hello, %n'
  }

  # User-defined prompt segments may optionally provide an instant_prompt function. Its job
  # is to generate the prompt segment for display in instant prompt. See
  # https://github.com/romkatv/powerlevel10k/blob/master/README.md#instant-prompt.
  #
  # Uncomment the following lines to define prompt_example_instant_prompt and then run
  # `p10k configure` to enable instant prompt. The function will be called when displaying
  # instant prompt for the past command while the new command is still being edited.
  # It should perform no I/O and must not change global state. When this function is defined,
  # `p10k configure` will call it and generate working instant prompt code that calls
  # prompt_example_instant_prompt without going through prompt_example. If this function is not
  # defined, `p10k configure` will apply heuristics and attempt to generate reasonable working
  # instant prompt code automatically.
  #
  # function prompt_example_instant_prompt() {
  #   # Since prompt_example always makes the same `p10k segment` calls, we can call it from here.
  #   # This will give us the same `%f`, `%F`, `%t`, etc. as the original except for `%w` and `%s`
  #   # which will be empty because `p10k configure` doesn't support them in instant prompt.
  #   prompt_example
  # }

  # User-defined prompt segments can be customized the same way as built-in segments.
  # typeset -g POWERLEVEL9K_EXAMPLE_FOREGROUND=208
  # typeset -g POWERLEVEL9K_EXAMPLE_VISUAL_IDENTIFIER_EXPANSION='⭐'

  # Instant prompt mode.
  #
  #   - off:      Disable instant prompt. Choose this if you've tried instant prompt and found
  #               it incompatible with your zsh configuration files.
  #   - quiet:    Enable instant prompt and don't print warnings when detecting console output
  #               during zsh initialization. Choose this if you've read and understood
  #               https://github.com/romkatv/powerlevel10k/blob/master/README.md#instant-prompt.
  #   - verbose:  Enable instant prompt and print a warning when detecting console output during
  #               zsh initialization. Choose this if you've never tried instant prompt, haven't
  #               seen the warning, or if you are unsure what this all means.
  typeset -g POWERLEVEL9K_INSTANT_PROMPT=verbose

  # Hot reload allows you to change POWERLEVEL9K options after Powerlevel10k has been initialized.
  # For example, you can type POWERLEVEL9K_BACKGROUND=red and see your prompt turn red. Hot reload
  # can slow down prompt by 1-2 milliseconds, so it's better to keep it turned off unless you
  # really need it.
  typeset -g POWERLEVEL9K_DISABLE_HOT_RELOAD=true

  # If p10k is already loaded, reload configuration.
  # This works even with POWERLEVEL9K_DISABLE_HOT_RELOAD=true.
  (( ! $+functions[p10k] )) || p10k reload
}

# Tell `p10k configure` which file it should overwrite.
typeset -g POWERLEVEL9K_CONFIG_FILE=${${(%):-%x}:a}

(( ${#p10k_config_opts} )) && setopt ${p10k_config_opts[@]}
'builtin' 'unset' 'p10k_config_opts'
EOF

log_success "Powerlevel10k configuration created"

# Install Python packages
log_info "📦 Installing Python development packages..."
pip install --user --upgrade \
    pipx \
    poetry \
    pre-commit \
    cookiecutter \
    httpx \
    rich-cli \
    typer-cli \
    || log_warning "Some Python packages might have failed to install"

# Install Node.js global packages
log_info "📦 Installing Node.js global packages..."
npm install -g \
    @vue/cli \
    @angular/cli \
    create-react-app \
    create-next-app \
    create-vite \
    serve \
    http-server \
    live-server \
    json-server \
    nodemon \
    pm2 \
    lighthouse \
    @storybook/cli \
    || log_warning "Some Node.js packages might have failed to install"

# Setup Claude environment
log_info "🧠 Setting up Claude environment..."

# Create Claude configuration directory structure
mkdir -p ~/.claude/{config,environments,mcp-servers,logs,cache,templates}

# Create initial Claude configuration
cat > ~/.claude/config/environment.json << 'EOF'
{
  "version": "1.0.0",
  "initialized": true,
  "created_at": "$timestamp",
  "environment": {
    "name": "development",
    "type": "devcontainer",
    "features": [
      "nodejs",
      "python",
      "docker",
      "kubernetes",
      "terraform"
    ]
  },
  "tools": {
    "shell": "zsh",
    "theme": "powerlevel10k",
    "editor": "vscode"
  },
  "settings": {
    "auto_sync": true,
    "telemetry": false,
    "debug_mode": false
  }
}
EOF

# Replace timestamp
sed -i "s/\$timestamp/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/g" ~/.claude/config/environment.json

log_success "Claude environment configuration created"

# Setup Git configuration enhancements
log_info "🔧 Enhancing Git configuration..."
git config --global core.editor "code --wait"
git config --global merge.tool "vscode"
git config --global mergetool.vscode.cmd 'code --wait $MERGED'
git config --global diff.tool "vscode"
git config --global difftool.vscode.cmd 'code --wait --diff $LOCAL $REMOTE'
git config --global push.autoSetupRemote true
git config --global branch.sort -committerdate
git config --global tag.sort -version:refname

log_success "Git configuration enhanced"

# Create useful development scripts
log_info "📝 Creating development utility scripts..."

# Create a quick project setup script
cat > ~/.local/bin/quick-setup << 'EOF'
#!/bin/bash
# Quick project setup script for different frameworks

set -e

FRAMEWORK=${1:-""}
PROJECT_NAME=${2:-"my-project"}

case "$FRAMEWORK" in
    "react")
        npx create-react-app "$PROJECT_NAME" --template typescript
        ;;
    "next")
        npx create-next-app@latest "$PROJECT_NAME" --typescript --tailwind --eslint --app
        ;;
    "vue")
        vue create "$PROJECT_NAME"
        ;;
    "svelte")
        npm create svelte@latest "$PROJECT_NAME"
        ;;
    "django")
        python -m pip install django
        django-admin startproject "$PROJECT_NAME"
        ;;
    "fastapi")
        mkdir "$PROJECT_NAME" && cd "$PROJECT_NAME"
        python -m venv venv
        source venv/bin/activate
        pip install fastapi uvicorn
        ;;
    *)
        echo "Usage: quick-setup <framework> [project-name]"
        echo "Supported frameworks: react, next, vue, svelte, django, fastapi"
        exit 1
        ;;
esac

echo "✅ Project '$PROJECT_NAME' created with $FRAMEWORK!"
EOF

chmod +x ~/.local/bin/quick-setup

# Create a development server manager
cat > ~/.local/bin/dev-server << 'EOF'
#!/bin/bash
# Development server manager

set -e

ACTION=${1:-"status"}
SERVICE=${2:-"all"}

case "$ACTION" in
    "start")
        echo "🚀 Starting development services..."
        if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "postgres" ]; then
            echo "Starting PostgreSQL..."
            docker-compose up -d postgres
        fi
        if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "redis" ]; then
            echo "Starting Redis..."
            docker-compose up -d redis
        fi
        if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "monitoring" ]; then
            echo "Starting monitoring stack..."
            docker-compose up -d prometheus grafana
        fi
        ;;
    "stop")
        echo "🛑 Stopping development services..."
        docker-compose down
        ;;
    "status")
        echo "📊 Development services status:"
        docker-compose ps
        ;;
    "logs")
        docker-compose logs -f ${SERVICE}
        ;;
    *)
        echo "Usage: dev-server <start|stop|status|logs> [service]"
        echo "Services: postgres, redis, monitoring, all"
        exit 1
        ;;
esac
EOF

chmod +x ~/.local/bin/dev-server

log_success "Development utility scripts created"

# Create welcome message
log_info "📋 Creating welcome message..."
cat > ~/.claude/welcome.txt << 'EOF'
🎉 Welcome to Claude Code + SuperClaude + MCP Development Environment!

🚀 Quick Start:
  - Use 'claude-env status' to check system status
  - Use 'dev-server start' to start development services
  - Use 'quick-setup react my-app' to create new projects

🛠️  Available Tools:
  - Node.js 20 with npm, yarn, pnpm
  - Python 3.11 with pip, poetry
  - Docker & Docker Compose
  - Kubernetes tools (kubectl, helm)
  - Terraform for infrastructure
  - Git with enhanced configuration
  - Zsh with Oh My Zsh & Powerlevel10k

🔗 Services:
  - PostgreSQL: localhost:5432
  - Redis: localhost:6379
  - Prometheus: http://localhost:9090
  - Grafana: http://localhost:3001

💡 Tips:
  - Type 'p10k configure' to customize your prompt
  - Use 'code .' to open VS Code
  - Check ~/.zshrc for aliases and functions
  - Documentation: https://docs.claude.ai

Happy coding! 🎯
EOF

log_success "Welcome message created"

# Final setup steps
log_info "🏁 Completing final setup steps..."

# Ensure proper permissions
chown -R vscode:vscode ~/.claude ~/.local ~/.cache ~/.config ~/.oh-my-zsh 2>/dev/null || true
chmod -R 755 ~/.local/bin 2>/dev/null || true

# Update locate database if available
if command -v updatedb &> /dev/null; then
    sudo updatedb 2>/dev/null || true
fi

# Clear any cache that might interfere
hash -r
rehash 2>/dev/null || true

log_success "🎉 Claude Code + SuperClaude + MCP Development Environment initialized successfully!"
log_info "📋 Run 'cat ~/.claude/welcome.txt' to see the welcome message"
log_info "🔄 Please restart your terminal or run 'exec zsh' to apply all changes"

# Show environment status
echo ""
echo "🔍 Environment Status:"
echo "  - Node.js: $(node --version 2>/dev/null || echo 'Not found')"
echo "  - Python: $(python --version 2>/dev/null || echo 'Not found')"
echo "  - Docker: $(docker --version 2>/dev/null || echo 'Not found')"
echo "  - Git: $(git --version 2>/dev/null || echo 'Not found')"
echo "  - Zsh: $(zsh --version 2>/dev/null || echo 'Not found')"
echo ""

exit 0