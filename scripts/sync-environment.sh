#!/bin/bash
# Environment Synchronization Script
# Comprehensive environment synchronization with validation and rollback

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${PROJECT_ROOT}/config"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_DIR="${PROJECT_ROOT}/logs"
CLAUDE_DIR="${HOME}/.claude"

# Default values
ENVIRONMENT=""
TEAMS_FILTER=""
FORCE_SYNC="false"
STAGED_DEPLOYMENT="false"
BLUE_GREEN_DEPLOYMENT="false"
VALIDATION_POINTS=1
TIMEOUT=600
MAX_RETRIES=3
DRY_RUN="false"

# Logging setup
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/sync-$(date +%Y%m%d_%H%M%S).log"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "${LOG_FILE}"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Sync failed with exit code $exit_code"
        if [[ "${ROLLBACK_ON_FAILURE:-true}" == "true" && -n "${ROLLBACK_POINT:-}" ]]; then
            log_info "Attempting automatic rollback..."
            rollback_configuration "${ROLLBACK_POINT}"
        fi
    fi
    
    # Cleanup temporary files
    [[ -d "${TEMP_DIR:-}" ]] && rm -rf "${TEMP_DIR}"
    
    # Send notification
    send_sync_notification "$exit_code"
    
    exit $exit_code
}

trap cleanup EXIT INT TERM

# Validation functions
validate_environment() {
    local env="$1"
    
    log_info "Validating environment: $env"
    
    # Check if environment configuration exists
    if [[ ! -d "${CONFIG_DIR}/environments/${env}" ]]; then
        log_error "Environment configuration not found: $env"
        return 1
    fi
    
    # Check required configuration files
    local required_files=(
        "${CONFIG_DIR}/environments/${env}/config.yml"
        "${CONFIG_DIR}/environments/${env}/teams.yml"
        "${CONFIG_DIR}/environments/${env}/mcp-servers.yml"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Required configuration file not found: $file"
            return 1
        fi
    done
    
    # Validate YAML syntax
    for yaml_file in "${CONFIG_DIR}/environments/${env}"/*.yml; do
        if ! python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>/dev/null; then
            log_error "Invalid YAML syntax in: $yaml_file"
            return 1
        fi
    done
    
    log_info "Environment validation passed: $env"
    return 0
}

validate_sync_preconditions() {
    local env="$1"
    
    log_info "Validating sync preconditions for: $env"
    
    # Check system prerequisites
    local required_commands=("python3" "node" "npm" "git" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_error "Required command not found: $cmd"
            return 1
        fi
    done
    
    # Check Claude directory permissions
    if [[ -d "${CLAUDE_DIR}" ]]; then
        if [[ ! -w "${CLAUDE_DIR}" ]]; then
            log_error "Claude directory is not writable: ${CLAUDE_DIR}"
            return 1
        fi
    else
        log_info "Creating Claude directory: ${CLAUDE_DIR}"
        mkdir -p "${CLAUDE_DIR}"
        chmod 700 "${CLAUDE_DIR}"
    fi
    
    # Check disk space (minimum 100MB)
    local available_space
    available_space=$(df "${CLAUDE_DIR}" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 102400 ]]; then
        log_error "Insufficient disk space. Available: ${available_space}KB, Required: 100MB"
        return 1
    fi
    
    # Check network connectivity
    if ! curl -s --max-time 10 "https://api.github.com" >/dev/null; then
        log_warn "GitHub API not accessible - some features may be limited"
    fi
    
    log_info "Sync preconditions validated successfully"
    return 0
}

# Backup functions
create_backup() {
    local env="$1"
    local backup_type="${2:-pre-sync}"
    
    log_info "Creating backup for environment: $env (type: $backup_type)"
    
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_name="${env}_${backup_type}_${timestamp}"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    mkdir -p "${backup_path}"
    
    # Backup Claude configuration
    if [[ -d "${CLAUDE_DIR}" ]]; then
        log_info "Backing up Claude directory..."
        cp -r "${CLAUDE_DIR}" "${backup_path}/claude_config"
    fi
    
    # Backup environment-specific configuration
    local env_config_dir="${CONFIG_DIR}/environments/${env}"
    if [[ -d "$env_config_dir" ]]; then
        log_info "Backing up environment configuration..."
        cp -r "$env_config_dir" "${backup_path}/env_config"
    fi
    
    # Create backup metadata
    cat > "${backup_path}/metadata.json" << EOF
{
    "timestamp": "${timestamp}",
    "environment": "${env}",
    "backup_type": "${backup_type}",
    "claude_dir": "${CLAUDE_DIR}",
    "config_dir": "${CONFIG_DIR}",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    # Verify backup integrity
    if verify_backup "${backup_path}"; then
        log_info "Backup created successfully: ${backup_path}"
        echo "${backup_path}"
        return 0
    else
        log_error "Backup verification failed: ${backup_path}"
        return 1
    fi
}

verify_backup() {
    local backup_path="$1"
    
    log_info "Verifying backup: $backup_path"
    
    # Check metadata file
    if [[ ! -f "${backup_path}/metadata.json" ]]; then
        log_error "Backup metadata not found"
        return 1
    fi
    
    # Validate metadata JSON
    if ! python3 -c "import json; json.load(open('${backup_path}/metadata.json'))" 2>/dev/null; then
        log_error "Invalid backup metadata JSON"
        return 1
    fi
    
    # Check for essential backup contents
    if [[ -d "${backup_path}/claude_config" ]]; then
        log_info "Claude configuration backup verified"
    fi
    
    if [[ -d "${backup_path}/env_config" ]]; then
        log_info "Environment configuration backup verified"
    fi
    
    log_info "Backup verification completed successfully"
    return 0
}

# Synchronization functions
sync_base_configuration() {
    local env="$1"
    
    log_info "Synchronizing base configuration for: $env"
    
    local env_config="${CONFIG_DIR}/environments/${env}/config.yml"
    local temp_config="${TEMP_DIR}/merged_config.yml"
    
    # Merge base configuration with environment-specific overrides
    python3 << EOF
import yaml
import sys
import os

# Load base configuration
with open('${CONFIG_DIR}/base/config.yml', 'r') as f:
    base_config = yaml.safe_load(f)

# Load environment-specific configuration
with open('${env_config}', 'r') as f:
    env_config = yaml.safe_load(f)

# Merge configurations (env overrides base)
def merge_configs(base, override):
    if isinstance(override, dict) and isinstance(base, dict):
        for key, value in override.items():
            if key in base and isinstance(base[key], dict):
                base[key] = merge_configs(base[key], value)
            else:
                base[key] = value
    else:
        base = override
    return base

merged_config = merge_configs(base_config, env_config)

# Write merged configuration
with open('${temp_config}', 'w') as f:
    yaml.dump(merged_config, f, default_flow_style=False, indent=2)

print("Configuration merged successfully")
EOF
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to merge base configuration"
        return 1
    fi
    
    log_info "Base configuration synchronized"
    return 0
}

sync_mcp_servers() {
    local env="$1"
    
    log_info "Synchronizing MCP servers for: $env"
    
    local mcp_config="${CONFIG_DIR}/environments/${env}/mcp-servers.yml"
    local claude_mcp_config="${CLAUDE_DIR}/mcp.json"
    
    if [[ ! -f "$mcp_config" ]]; then
        log_warn "MCP server configuration not found: $mcp_config"
        return 0
    fi
    
    # Convert YAML to JSON and merge with existing MCP configuration
    python3 << EOF
import yaml
import json
import os

# Load MCP server configuration
with open('${mcp_config}', 'r') as f:
    mcp_servers = yaml.safe_load(f)

# Load existing MCP configuration if it exists
existing_config = {}
if os.path.exists('${claude_mcp_config}'):
    with open('${claude_mcp_config}', 'r') as f:
        existing_config = json.load(f)

# Merge MCP server configurations
if 'mcpServers' not in existing_config:
    existing_config['mcpServers'] = {}

# Update server configurations
for server_name, server_config in mcp_servers.get('servers', {}).items():
    existing_config['mcpServers'][server_name] = server_config

# Write updated configuration
with open('${claude_mcp_config}', 'w') as f:
    json.dump(existing_config, f, indent=2)

print(f"Synchronized {len(mcp_servers.get('servers', {}))} MCP servers")
EOF
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to synchronize MCP servers"
        return 1
    fi
    
    # Test MCP server connectivity
    test_mcp_connectivity "$env"
    
    log_info "MCP servers synchronized successfully"
    return 0
}

sync_team_configurations() {
    local env="$1"
    
    log_info "Synchronizing team configurations for: $env"
    
    local teams_config="${CONFIG_DIR}/environments/${env}/teams.yml"
    
    if [[ ! -f "$teams_config" ]]; then
        log_warn "Team configuration not found: $teams_config"
        return 0
    fi
    
    # Apply team-specific configurations
    if [[ -n "$TEAMS_FILTER" ]]; then
        log_info "Applying team filter: $TEAMS_FILTER"
        # Filter teams based on provided list
        python3 << EOF
import yaml

with open('${teams_config}', 'r') as f:
    teams_config = yaml.safe_load(f)

team_filter = '${TEAMS_FILTER}'.split(',')
filtered_teams = {team: config for team, config in teams_config.get('teams', {}).items() 
                 if team in team_filter}

print(f"Filtered to {len(filtered_teams)} teams: {', '.join(filtered_teams.keys())}")
EOF
    fi
    
    # Apply team-specific settings
    python3 << EOF
import yaml
import json
import os

# Load team configuration
with open('${teams_config}', 'r') as f:
    teams_config = yaml.safe_load(f)

# Apply team-specific MCP server settings
claude_mcp_config = '${CLAUDE_DIR}/mcp.json'
if os.path.exists(claude_mcp_config):
    with open(claude_mcp_config, 'r') as f:
        mcp_config = json.load(f)
    
    # Apply team-specific server configurations
    for team_name, team_config in teams_config.get('teams', {}).items():
        if 'mcp_servers' in team_config:
            for server_name, server_config in team_config['mcp_servers'].items():
                if server_name in mcp_config.get('mcpServers', {}):
                    mcp_config['mcpServers'][server_name].update(server_config)
    
    # Write updated configuration
    with open(claude_mcp_config, 'w') as f:
        json.dump(mcp_config, f, indent=2)

print("Team configurations applied successfully")
EOF
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to synchronize team configurations"
        return 1
    fi
    
    log_info "Team configurations synchronized successfully"
    return 0
}

sync_security_settings() {
    local env="$1"
    
    log_info "Synchronizing security settings for: $env"
    
    local security_config="${CONFIG_DIR}/environments/${env}/security.yml"
    local claude_settings="${CLAUDE_DIR}/settings.json"
    
    if [[ ! -f "$security_config" ]]; then
        log_warn "Security configuration not found: $security_config"
        return 0
    fi
    
    # Apply security settings
    python3 << EOF
import yaml
import json
import os

# Load security configuration
with open('${security_config}', 'r') as f:
    security_config = yaml.safe_load(f)

# Load or create Claude settings
claude_settings = {}
if os.path.exists('${claude_settings}'):
    with open('${claude_settings}', 'r') as f:
        claude_settings = json.load(f)

# Apply security settings
security_settings = security_config.get('security', {})
if 'permissions' in security_settings:
    claude_settings['permissions'] = security_settings['permissions']

if 'model_settings' in security_settings:
    claude_settings.update(security_settings['model_settings'])

# Write updated settings
with open('${claude_settings}', 'w') as f:
    json.dump(claude_settings, f, indent=2)

print("Security settings applied successfully")
EOF
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to synchronize security settings"
        return 1
    fi
    
    # Set appropriate file permissions
    chmod 600 "${claude_settings}"
    
    log_info "Security settings synchronized successfully"
    return 0
}

# Testing functions
test_mcp_connectivity() {
    local env="$1"
    
    log_info "Testing MCP server connectivity for: $env"
    
    local claude_mcp_config="${CLAUDE_DIR}/mcp.json"
    
    if [[ ! -f "$claude_mcp_config" ]]; then
        log_warn "MCP configuration not found: $claude_mcp_config"
        return 0
    fi
    
    # Test each MCP server
    python3 << EOF
import json
import subprocess
import sys
import time
import os

with open('${claude_mcp_config}', 'r') as f:
    mcp_config = json.load(f)

servers = mcp_config.get('mcpServers', {})
failed_servers = []

for server_name, server_config in servers.items():
    print(f"Testing MCP server: {server_name}")
    
    command = server_config.get('command')
    if not command:
        print(f"  Warning: No command specified for {server_name}")
        continue
    
    try:
        # Test if command exists
        if isinstance(command, list):
            test_cmd = ['which', command[0]]
        else:
            test_cmd = ['which', command]
        
        result = subprocess.run(test_cmd, capture_output=True, timeout=5)
        
        if result.returncode == 0:
            print(f"  ✓ {server_name}: Command accessible")
        else:
            print(f"  ✗ {server_name}: Command not found")
            failed_servers.append(server_name)
    
    except subprocess.TimeoutExpired:
        print(f"  ✗ {server_name}: Connection timeout")
        failed_servers.append(server_name)
    except Exception as e:
        print(f"  ✗ {server_name}: Test failed - {e}")
        failed_servers.append(server_name)

if failed_servers:
    print(f"Failed servers: {', '.join(failed_servers)}")
    sys.exit(1)
else:
    print("All MCP servers passed connectivity tests")
    sys.exit(0)
EOF
    
    local test_result=$?
    if [[ $test_result -ne 0 ]]; then
        log_warn "Some MCP servers failed connectivity tests"
        if [[ "$FORCE_SYNC" != "true" ]]; then
            log_error "Use --force to proceed with failed MCP servers"
            return 1
        fi
    fi
    
    log_info "MCP connectivity tests completed"
    return 0
}

validate_sync_result() {
    local env="$1"
    
    log_info "Validating sync results for: $env"
    
    # Run comprehensive validation
    local validation_errors=0
    
    # Check configuration file integrity
    local config_files=(
        "${CLAUDE_DIR}/mcp.json"
        "${CLAUDE_DIR}/settings.json"
    )
    
    for config_file in "${config_files[@]}"; do
        if [[ -f "$config_file" ]]; then
            if ! python3 -c "import json; json.load(open('$config_file'))" 2>/dev/null; then
                log_error "Invalid JSON in: $config_file"
                ((validation_errors++))
            else
                log_info "✓ Valid JSON: $config_file"
            fi
        fi
    done
    
    # Test MCP server functionality
    if ! test_mcp_connectivity "$env"; then
        log_warn "MCP connectivity validation failed"
        ((validation_errors++))
    fi
    
    # Check file permissions
    if [[ -f "${CLAUDE_DIR}/settings.json" ]]; then
        local perms
        perms=$(stat -c "%a" "${CLAUDE_DIR}/settings.json")
        if [[ "$perms" != "600" ]]; then
            log_warn "Incorrect permissions on settings.json: $perms (expected: 600)"
            chmod 600 "${CLAUDE_DIR}/settings.json"
        fi
    fi
    
    if [[ $validation_errors -gt 0 ]]; then
        log_error "Sync validation failed with $validation_errors errors"
        return 1
    fi
    
    log_info "Sync validation completed successfully"
    return 0
}

# Deployment strategies
staged_deployment() {
    local env="$1"
    
    log_info "Executing staged deployment for: $env"
    
    # Stage 1: Base configuration
    log_info "Stage 1: Synchronizing base configuration"
    sync_base_configuration "$env" || return 1
    
    # Validation checkpoint 1
    if [[ $VALIDATION_POINTS -ge 1 ]]; then
        log_info "Validation checkpoint 1"
        validate_sync_result "$env" || return 1
    fi
    
    # Stage 2: MCP servers
    log_info "Stage 2: Synchronizing MCP servers"
    sync_mcp_servers "$env" || return 1
    
    # Validation checkpoint 2
    if [[ $VALIDATION_POINTS -ge 2 ]]; then
        log_info "Validation checkpoint 2"
        test_mcp_connectivity "$env" || return 1
    fi
    
    # Stage 3: Team configurations
    log_info "Stage 3: Synchronizing team configurations"
    sync_team_configurations "$env" || return 1
    
    # Validation checkpoint 3
    if [[ $VALIDATION_POINTS -ge 3 ]]; then
        log_info "Validation checkpoint 3"
        validate_sync_result "$env" || return 1
    fi
    
    # Stage 4: Security settings
    log_info "Stage 4: Synchronizing security settings"
    sync_security_settings "$env" || return 1
    
    log_info "Staged deployment completed successfully"
    return 0
}

blue_green_deployment() {
    local env="$1"
    
    log_info "Executing blue-green deployment for: $env"
    
    # Create green environment (new configuration)
    local green_dir="${TEMP_DIR}/green_environment"
    mkdir -p "$green_dir"
    
    # Backup current environment (blue)
    local blue_backup
    blue_backup=$(create_backup "$env" "blue-environment")
    
    # Deploy to green environment
    log_info "Deploying to green environment"
    CLAUDE_DIR="$green_dir" staged_deployment "$env" || return 1
    
    # Validate green environment
    log_info "Validating green environment"
    CLAUDE_DIR="$green_dir" validate_sync_result "$env" || return 1
    
    # Switch to green environment
    log_info "Switching to green environment"
    if [[ -d "${CLAUDE_DIR}" ]]; then
        mv "${CLAUDE_DIR}" "${CLAUDE_DIR}.blue.$(date +%s)"
    fi
    mv "$green_dir" "${CLAUDE_DIR}"
    
    # Final validation
    log_info "Final validation of active environment"
    validate_sync_result "$env" || {
        log_error "Green environment validation failed, rolling back"
        # Restore blue environment
        rm -rf "${CLAUDE_DIR}"
        mv "${CLAUDE_DIR}.blue."* "${CLAUDE_DIR}" 2>/dev/null || true
        return 1
    }
    
    log_info "Blue-green deployment completed successfully"
    return 0
}

# Rollback functions
rollback_configuration() {
    local rollback_point="$1"
    
    log_info "Rolling back configuration to: $rollback_point"
    
    if [[ ! -d "$rollback_point" ]]; then
        log_error "Rollback point not found: $rollback_point"
        return 1
    fi
    
    # Verify rollback point
    if ! verify_backup "$rollback_point"; then
        log_error "Rollback point verification failed"
        return 1
    fi
    
    # Create backup of current state before rollback
    local pre_rollback_backup
    pre_rollback_backup=$(create_backup "current" "pre-rollback")
    
    # Restore configuration from rollback point
    if [[ -d "${rollback_point}/claude_config" ]]; then
        log_info "Restoring Claude configuration"
        rm -rf "${CLAUDE_DIR}"
        cp -r "${rollback_point}/claude_config" "${CLAUDE_DIR}"
    fi
    
    # Validate rollback
    if validate_sync_result "rollback"; then
        log_info "Configuration rollback completed successfully"
        return 0
    else
        log_error "Rollback validation failed"
        return 1
    fi
}

# Notification functions
send_sync_notification() {
    local exit_code="$1"
    
    if [[ $exit_code -eq 0 ]]; then
        log_info "Sending success notification"
        local status="success"
        local message="Environment synchronization completed successfully"
    else
        log_error "Sending failure notification"
        local status="failure"
        local message="Environment synchronization failed"
    fi
    
    # Send webhook notification if configured
    if [[ -n "${SYNC_WEBHOOK_URL:-}" ]]; then
        curl -X POST "${SYNC_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{
                \"status\": \"$status\",
                \"message\": \"$message\",
                \"environment\": \"$ENVIRONMENT\",
                \"timestamp\": \"$(date -Iseconds)\",
                \"log_file\": \"$LOG_FILE\"
            }" || log_warn "Failed to send webhook notification"
    fi
    
    # Send Slack notification if configured
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local emoji="✅"
        [[ $exit_code -ne 0 ]] && emoji="❌"
        
        curl -X POST "${SLACK_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{
                \"text\": \"$emoji Environment Sync: $message\",
                \"attachments\": [{
                    \"color\": \"$([ $exit_code -eq 0 ] && echo 'good' || echo 'danger')\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Status\", \"value\": \"$status\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date)\", \"short\": false}
                    ]
                }]
            }" || log_warn "Failed to send Slack notification"
    fi
}

# Main synchronization function
main() {
    log_info "Starting environment synchronization"
    log_info "Parameters: Environment=$ENVIRONMENT, Teams=$TEAMS_FILTER, Force=$FORCE_SYNC"
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    export TEMP_DIR
    
    # Validate inputs
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Environment parameter is required"
        return 1
    fi
    
    # Validate environment
    if ! validate_environment "$ENVIRONMENT"; then
        log_error "Environment validation failed"
        return 1
    fi
    
    # Validate sync preconditions
    if ! validate_sync_preconditions "$ENVIRONMENT"; then
        log_error "Sync precondition validation failed"
        return 1
    fi
    
    # Create backup before sync
    local rollback_point
    rollback_point=$(create_backup "$ENVIRONMENT" "pre-sync")
    export ROLLBACK_POINT="$rollback_point"
    
    # Execute appropriate deployment strategy
    if [[ "$BLUE_GREEN_DEPLOYMENT" == "true" ]]; then
        blue_green_deployment "$ENVIRONMENT"
    elif [[ "$STAGED_DEPLOYMENT" == "true" ]]; then
        staged_deployment "$ENVIRONMENT"
    else
        # Standard deployment
        log_info "Executing standard deployment"
        sync_base_configuration "$ENVIRONMENT" && \
        sync_mcp_servers "$ENVIRONMENT" && \
        sync_team_configurations "$ENVIRONMENT" && \
        sync_security_settings "$ENVIRONMENT"
    fi
    
    local sync_result=$?
    
    # Final validation
    if [[ $sync_result -eq 0 ]]; then
        if validate_sync_result "$ENVIRONMENT"; then
            log_info "Environment synchronization completed successfully"
            return 0
        else
            log_error "Post-sync validation failed"
            return 1
        fi
    else
        log_error "Synchronization failed"
        return 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --teams)
            TEAMS_FILTER="$2"
            shift 2
            ;;
        --force)
            FORCE_SYNC="true"
            shift
            ;;
        --staged-deployment)
            STAGED_DEPLOYMENT="true"
            shift
            ;;
        --blue-green-deployment)
            BLUE_GREEN_DEPLOYMENT="true"
            shift
            ;;
        --validation-points)
            VALIDATION_POINTS="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --max-retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --environment ENV          Target environment (required)"
            echo "  --teams TEAMS             Comma-separated list of teams"
            echo "  --force                   Force sync ignoring warnings"
            echo "  --staged-deployment       Use staged deployment strategy"
            echo "  --blue-green-deployment   Use blue-green deployment strategy"
            echo "  --validation-points N     Number of validation checkpoints"
            echo "  --timeout SECONDS         Operation timeout"
            echo "  --max-retries N           Maximum retry attempts"
            echo "  --dry-run                 Show what would be done"
            echo "  --help                    Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Execute main function
if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY RUN: Would synchronize environment $ENVIRONMENT"
    log_info "Configuration validation and deployment planning would be executed"
    exit 0
else
    main
fi