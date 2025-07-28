#!/bin/bash
# Configuration Drift Detection Script
# Advanced drift detection with automated analysis and remediation recommendations

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${PROJECT_ROOT}/config"
CACHE_DIR="${PROJECT_ROOT}/.drift-cache"
LOG_DIR="${PROJECT_ROOT}/logs"
CLAUDE_DIR="${HOME}/.claude"

# Default values
ENVIRONMENT=""
BASELINE_CONFIG=""
CURRENT_CONFIG=""
DRIFT_THRESHOLD=5.0
OUTPUT_FORMAT="json"
OUTPUT_FILE=""
REPORT_ONLY="false"
DETAILED_ANALYSIS="false"
INCLUDE_PERFORMANCE="false"

# Create necessary directories
mkdir -p "${CACHE_DIR}" "${LOG_DIR}"

# Logging setup
LOG_FILE="${LOG_DIR}/drift-$(date +%Y%m%d_%H%M%S).log"

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "${LOG_FILE}"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }

# Drift detection functions
load_baseline_config() {
    local env="$1"
    local baseline_file="${CACHE_DIR}/baseline_${env}.json"
    
    log_info "Loading baseline configuration for: $env"
    
    if [[ -n "$BASELINE_CONFIG" && -f "$BASELINE_CONFIG" ]]; then
        # Use provided baseline
        cp "$BASELINE_CONFIG" "$baseline_file"
        log_info "Using provided baseline: $BASELINE_CONFIG"
    elif [[ -f "$baseline_file" ]]; then
        # Use cached baseline
        local cache_age
        cache_age=$(( $(date +%s) - $(stat -c %Y "$baseline_file") ))
        if [[ $cache_age -lt 3600 ]]; then
            log_info "Using cached baseline (age: ${cache_age}s)"
        else
            log_warn "Cached baseline is stale (age: ${cache_age}s), refreshing"
            generate_baseline_config "$env" > "$baseline_file"
        fi
    else
        # Generate new baseline
        log_info "Generating new baseline configuration"
        generate_baseline_config "$env" > "$baseline_file"
    fi
    
    if [[ ! -s "$baseline_file" ]]; then
        log_error "Baseline configuration is empty or missing"
        return 1
    fi
    
    echo "$baseline_file"
}

generate_baseline_config() {
    local env="$1"
    
    log_info "Generating baseline configuration for: $env"
    
    python3 << 'EOF'
import json
import yaml
import os
import sys
from pathlib import Path

def load_config_file(file_path):
    """Load configuration file (JSON or YAML)"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            if file_path.suffix in ['.yml', '.yaml']:
                return yaml.safe_load(f)
            elif file_path.suffix == '.json':
                return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}", file=sys.stderr)
        return {}

def collect_baseline_config(environment):
    """Collect baseline configuration from various sources"""
    config_dir = Path(os.environ['CONFIG_DIR'])
    baseline = {
        'metadata': {
            'environment': environment,
            'generated_at': str(datetime.now().isoformat()),
            'version': '1.0'
        },
        'base_config': {},
        'environment_config': {},
        'team_configs': {},
        'mcp_servers': {},
        'security_settings': {},
        'file_permissions': {},
        'system_info': {}
    }
    
    # Load base configuration
    base_config_path = config_dir / 'base' / 'config.yml'
    if base_config_path.exists():
        baseline['base_config'] = load_config_file(base_config_path)
    
    # Load environment-specific configuration
    env_dir = config_dir / 'environments' / environment
    if env_dir.exists():
        for config_file in env_dir.glob('*.yml'):
            config_name = config_file.stem
            baseline['environment_config'][config_name] = load_config_file(config_file)
    
    # Load team configurations
    teams_dir = config_dir / 'teams'
    if teams_dir.exists():
        for team_dir in teams_dir.iterdir():
            if team_dir.is_dir():
                team_config = {}
                for config_file in team_dir.glob('*.yml'):
                    config_name = config_file.stem
                    team_config[config_name] = load_config_file(config_file)
                if team_config:
                    baseline['team_configs'][team_dir.name] = team_config
    
    # Load MCP server configurations
    mcp_config_path = config_dir / 'base' / 'mcp' / 'servers.yml'
    if mcp_config_path.exists():
        baseline['mcp_servers'] = load_config_file(mcp_config_path)
    
    # Expected file permissions
    baseline['file_permissions'] = {
        'claude_dir': '700',
        'config_files': '600',
        'script_files': '755'
    }
    
    # System requirements
    baseline['system_info'] = {
        'required_commands': ['python3', 'node', 'npm', 'git', 'curl'],
        'min_disk_space_mb': 100,
        'required_env_vars': ['HOME', 'PATH']
    }
    
    return baseline

import datetime
env = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('ENVIRONMENT', 'development')
baseline = collect_baseline_config(env)
print(json.dumps(baseline, indent=2, ensure_ascii=False))
EOF
}

capture_current_state() {
    local env="$1"
    local current_file="${CACHE_DIR}/current_${env}.json"
    
    log_info "Capturing current system state for: $env"
    
    if [[ -n "$CURRENT_CONFIG" && -f "$CURRENT_CONFIG" ]]; then
        # Use provided current state
        cp "$CURRENT_CONFIG" "$current_file"
        log_info "Using provided current state: $CURRENT_CONFIG"
    else
        # Capture current state
        generate_current_state "$env" > "$current_file"
    fi
    
    if [[ ! -s "$current_file" ]]; then
        log_error "Current state capture is empty or failed"
        return 1
    fi
    
    echo "$current_file"
}

generate_current_state() {
    local env="$1"
    
    log_info "Generating current system state for: $env"
    
    python3 << 'EOF'
import json
import yaml
import os
import sys
import subprocess
import stat
from pathlib import Path
from datetime import datetime

def get_file_permissions(file_path):
    """Get file permissions in octal format"""
    try:
        return oct(stat.S_IMODE(os.stat(file_path).st_mode))
    except:
        return None

def check_command_availability(command):
    """Check if command is available in PATH"""
    try:
        result = subprocess.run(['which', command], capture_output=True, timeout=5)
        return result.returncode == 0
    except:
        return False

def load_json_file(file_path):
    """Load JSON file safely"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}

def capture_current_state(environment):
    """Capture current system state"""
    claude_dir = Path(os.environ.get('CLAUDE_DIR', os.path.expanduser('~/.claude')))
    
    current_state = {
        'metadata': {
            'environment': environment,
            'captured_at': datetime.now().isoformat(),
            'claude_dir': str(claude_dir),
            'hostname': os.uname().nodename if hasattr(os, 'uname') else 'unknown'
        },
        'claude_config': {},
        'file_permissions': {},
        'system_info': {},
        'mcp_servers': {},
        'disk_usage': {},
        'process_info': {}
    }
    
    # Capture Claude configuration files
    if claude_dir.exists():
        current_state['file_permissions']['claude_dir'] = get_file_permissions(claude_dir)
        
        # MCP configuration
        mcp_config_path = claude_dir / 'mcp.json'
        if mcp_config_path.exists():
            current_state['claude_config']['mcp'] = load_json_file(mcp_config_path)
            current_state['file_permissions']['mcp_config'] = get_file_permissions(mcp_config_path)
        
        # Settings configuration
        settings_path = claude_dir / 'settings.json'
        if settings_path.exists():
            current_state['claude_config']['settings'] = load_json_file(settings_path)
            current_state['file_permissions']['settings'] = get_file_permissions(settings_path)
        
        # SuperClaude metadata
        metadata_path = claude_dir / '.superclaude-metadata.json'
        if metadata_path.exists():
            current_state['claude_config']['superclaude'] = load_json_file(metadata_path)
            current_state['file_permissions']['superclaude_metadata'] = get_file_permissions(metadata_path)
    
    # System information
    current_state['system_info'] = {
        'available_commands': {},
        'environment_variables': {},
        'python_version': sys.version,
        'working_directory': os.getcwd()
    }
    
    # Check required commands
    required_commands = ['python3', 'node', 'npm', 'git', 'curl', 'docker']
    for cmd in required_commands:
        current_state['system_info']['available_commands'][cmd] = check_command_availability(cmd)
    
    # Check environment variables
    important_env_vars = ['HOME', 'PATH', 'NODE_ENV', 'CLAUDE_ENV']
    for var in important_env_vars:
        current_state['system_info']['environment_variables'][var] = os.environ.get(var)
    
    # Disk usage
    try:
        statvfs = os.statvfs(claude_dir.parent if claude_dir.exists() else os.path.expanduser('~'))
        current_state['disk_usage'] = {
            'available_bytes': statvfs.f_bavail * statvfs.f_frsize,
            'total_bytes': statvfs.f_blocks * statvfs.f_frsize,
            'available_mb': (statvfs.f_bavail * statvfs.f_frsize) // (1024 * 1024)
        }
    except:
        current_state['disk_usage'] = {'error': 'Unable to determine disk usage'}
    
    # MCP server connectivity (basic check)
    mcp_config = current_state['claude_config'].get('mcp', {})
    if 'mcpServers' in mcp_config:
        for server_name, server_config in mcp_config['mcpServers'].items():
            command = server_config.get('command')
            if command:
                if isinstance(command, list):
                    cmd_check = command[0]
                else:
                    cmd_check = command
                
                current_state['mcp_servers'][server_name] = {
                    'command_available': check_command_availability(cmd_check),
                    'config': server_config
                }
    
    return current_state

env = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('ENVIRONMENT', 'development')
current_state = capture_current_state(env)
print(json.dumps(current_state, indent=2, ensure_ascii=False))
EOF
}

analyze_drift() {
    local baseline_file="$1"
    local current_file="$2"
    local env="$3"
    
    log_info "Analyzing configuration drift for: $env"
    
    python3 << 'EOF'
import json
import sys
import os
from datetime import datetime
from typing import Dict, List, Any, Tuple

def calculate_drift_percentage(baseline: Dict, current: Dict) -> float:
    """Calculate overall drift percentage"""
    total_keys = 0
    different_keys = 0
    
    def compare_recursive(b_dict, c_dict, path=""):
        nonlocal total_keys, different_keys
        
        if isinstance(b_dict, dict) and isinstance(c_dict, dict):
            all_keys = set(b_dict.keys()) | set(c_dict.keys())
            for key in all_keys:
                total_keys += 1
                current_path = f"{path}.{key}" if path else key
                
                if key not in b_dict or key not in c_dict:
                    different_keys += 1
                elif isinstance(b_dict[key], dict) and isinstance(c_dict[key], dict):
                    compare_recursive(b_dict[key], c_dict[key], current_path)
                elif b_dict[key] != c_dict[key]:
                    different_keys += 1
        elif b_dict != c_dict:
            total_keys += 1
            different_keys += 1
    
    compare_recursive(baseline, current)
    return (different_keys / total_keys * 100) if total_keys > 0 else 0.0

def find_drift_items(baseline: Dict, current: Dict) -> List[Dict]:
    """Find specific drift items"""
    drift_items = []
    
    def compare_section(b_section, c_section, section_name, path=""):
        if not isinstance(b_section, dict) or not isinstance(c_section, dict):
            return
        
        for key, b_value in b_section.items():
            current_path = f"{path}.{key}" if path else key
            
            if key not in c_section:
                drift_items.append({
                    'type': 'missing_key',
                    'severity': 'medium',
                    'section': section_name,
                    'path': current_path,
                    'description': f"Missing configuration key: {current_path}",
                    'expected_value': b_value,
                    'current_value': None,
                    'impact': 'Configuration may not work as expected',
                    'remediation': f"Add missing key '{current_path}' with value: {b_value}"
                })
            elif isinstance(b_value, dict) and isinstance(c_section[key], dict):
                compare_section(b_value, c_section[key], section_name, current_path)
            elif b_value != c_section[key]:
                # Determine severity based on section and key
                severity = determine_severity(section_name, key, b_value, c_section[key])
                
                drift_items.append({
                    'type': 'value_mismatch',
                    'severity': severity,
                    'section': section_name,
                    'path': current_path,
                    'description': f"Value mismatch in {current_path}",
                    'expected_value': b_value,
                    'current_value': c_section[key],
                    'impact': get_impact_description(section_name, key),
                    'remediation': f"Update '{current_path}' from '{c_section[key]}' to '{b_value}'"
                })
        
        # Check for unexpected keys in current
        for key in c_section:
            if key not in b_section:
                current_path = f"{path}.{key}" if path else key
                drift_items.append({
                    'type': 'unexpected_key',
                    'severity': 'low',
                    'section': section_name,
                    'path': current_path,
                    'description': f"Unexpected configuration key: {current_path}",
                    'expected_value': None,
                    'current_value': c_section[key],
                    'impact': 'May indicate configuration pollution',
                    'remediation': f"Review and remove '{current_path}' if not needed"
                })
    
    # Compare different configuration sections
    sections_to_compare = [
        ('base_config', 'claude_config'),
        ('mcp_servers', 'mcp_servers'),
        ('file_permissions', 'file_permissions'),
        ('system_info', 'system_info')
    ]
    
    for baseline_section, current_section in sections_to_compare:
        if baseline_section in baseline and current_section in current:
            compare_section(
                baseline[baseline_section], 
                current[current_section], 
                baseline_section
            )
    
    return drift_items

def determine_severity(section: str, key: str, expected: Any, current: Any) -> str:
    """Determine severity of drift based on section and key"""
    # Security-related changes are always high severity
    if 'security' in section.lower() or 'permission' in section.lower():
        return 'high'
    
    # MCP server configuration changes are medium-high
    if 'mcp' in section.lower():
        return 'medium'
    
    # System info changes can be informational
    if 'system' in section.lower():
        return 'low'
    
    # Default to medium
    return 'medium'

def get_impact_description(section: str, key: str) -> str:
    """Get impact description for drift"""
    impact_map = {
        'mcp_servers': 'May affect MCP server connectivity and functionality',
        'security': 'May compromise system security',
        'file_permissions': 'May affect file access and security',
        'system_info': 'May indicate system environment changes',
        'base_config': 'May affect core functionality'
    }
    
    return impact_map.get(section, 'Impact assessment required')

def categorize_drift(drift_items: List[Dict]) -> Dict:
    """Categorize drift items for reporting"""
    categories = {
        'critical': [],
        'high': [],
        'medium': [],
        'low': []
    }
    
    severity_mapping = {
        'critical': 'critical',
        'high': 'high', 
        'medium': 'medium',
        'low': 'low'
    }
    
    for item in drift_items:
        severity = item.get('severity', 'medium')
        category = severity_mapping.get(severity, 'medium')
        categories[category].append(item)
    
    return categories

def generate_recommendations(drift_items: List[Dict], drift_percentage: float) -> List[str]:
    """Generate recommendations based on drift analysis"""
    recommendations = []
    
    if drift_percentage > 50:
        recommendations.append("High drift detected - consider full environment rebuild")
    elif drift_percentage > 20:
        recommendations.append("Significant drift detected - schedule comprehensive sync")
    elif drift_percentage > 10:
        recommendations.append("Moderate drift detected - sync recommended")
    else:
        recommendations.append("Low drift detected - monitor and sync if needed")
    
    # Specific recommendations based on drift types
    drift_types = {item['type'] for item in drift_items}
    
    if 'missing_key' in drift_types:
        recommendations.append("Missing configuration keys detected - run sync to restore")
    
    if 'value_mismatch' in drift_types:
        recommendations.append("Configuration value mismatches found - verify and update")
    
    if any(item['severity'] == 'high' for item in drift_items):
        recommendations.append("High-severity drift detected - immediate attention required")
    
    # Check for security-related drift
    security_drift = [item for item in drift_items if 'security' in item.get('section', '').lower()]
    if security_drift:
        recommendations.append("Security configuration drift detected - priority remediation needed")
    
    return recommendations

def analyze_drift_patterns(drift_items: List[Dict]) -> Dict:
    """Analyze patterns in drift for insights"""
    patterns = {
        'most_affected_sections': {},
        'common_drift_types': {},
        'severity_distribution': {},
        'trending_issues': []
    }
    
    # Count drift by section
    for item in drift_items:
        section = item.get('section', 'unknown')
        patterns['most_affected_sections'][section] = patterns['most_affected_sections'].get(section, 0) + 1
    
    # Count drift by type
    for item in drift_items:
        drift_type = item.get('type', 'unknown')
        patterns['common_drift_types'][drift_type] = patterns['common_drift_types'].get(drift_type, 0) + 1
    
    # Count by severity
    for item in drift_items:
        severity = item.get('severity', 'unknown')
        patterns['severity_distribution'][severity] = patterns['severity_distribution'].get(severity, 0) + 1
    
    return patterns

def main():
    if len(sys.argv) < 4:
        print("Usage: script.py <baseline_file> <current_file> <environment>", file=sys.stderr)
        sys.exit(1)
    
    baseline_file = sys.argv[1]
    current_file = sys.argv[2]
    environment = sys.argv[3]
    
    # Load configurations
    with open(baseline_file, 'r') as f:
        baseline = json.load(f)
    
    with open(current_file, 'r') as f:
        current = json.load(f)
    
    # Perform drift analysis
    drift_percentage = calculate_drift_percentage(baseline, current)
    drift_items = find_drift_items(baseline, current)
    categorized_drift = categorize_drift(drift_items)
    recommendations = generate_recommendations(drift_items, drift_percentage)
    patterns = analyze_drift_patterns(drift_items)
    
    # Generate comprehensive report
    report = {
        'metadata': {
            'environment': environment,
            'analysis_timestamp': datetime.now().isoformat(),
            'baseline_timestamp': baseline.get('metadata', {}).get('generated_at'),
            'current_timestamp': current.get('metadata', {}).get('captured_at'),
            'analyzer_version': '2.0'
        },
        'summary': {
            'drift_detected': len(drift_items) > 0,
            'drift_percentage': round(drift_percentage, 2),
            'total_drift_items': len(drift_items),
            'critical_drift': len(categorized_drift['critical']) > 0,
            'requires_immediate_attention': drift_percentage > float(os.environ.get('DRIFT_THRESHOLD', 5.0))
        },
        'drift_items': drift_items,
        'categorized_drift': categorized_drift,
        'recommendations': recommendations,
        'patterns': patterns,
        'detailed_analysis': {
            'most_problematic_section': max(patterns['most_affected_sections'].items(), key=lambda x: x[1])[0] if patterns['most_affected_sections'] else None,
            'primary_drift_type': max(patterns['common_drift_types'].items(), key=lambda x: x[1])[0] if patterns['common_drift_types'] else None,
            'risk_assessment': 'high' if drift_percentage > 25 else 'medium' if drift_percentage > 10 else 'low'
        }
    }
    
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
EOF "$baseline_file" "$current_file" "$env"
}

# Performance analysis functions
analyze_performance_drift() {
    local env="$1"
    
    if [[ "$INCLUDE_PERFORMANCE" != "true" ]]; then
        return 0
    fi
    
    log_info "Analyzing performance drift for: $env"
    
    python3 << 'EOF'
import json
import subprocess
import time
import os
from datetime import datetime

def measure_mcp_performance():
    """Measure MCP server performance metrics"""
    claude_dir = os.path.expanduser('~/.claude')
    mcp_config_path = os.path.join(claude_dir, 'mcp.json')
    
    if not os.path.exists(mcp_config_path):
        return {}
    
    with open(mcp_config_path, 'r') as f:
        mcp_config = json.load(f)
    
    performance_data = {}
    servers = mcp_config.get('mcpServers', {})
    
    for server_name, server_config in servers.items():
        start_time = time.time()
        
        # Basic connectivity test
        command = server_config.get('command')
        if command:
            try:
                if isinstance(command, list):
                    test_cmd = ['which', command[0]]
                else:
                    test_cmd = ['which', command]
                
                result = subprocess.run(test_cmd, capture_output=True, timeout=5)
                response_time = time.time() - start_time
                
                performance_data[server_name] = {
                    'response_time_ms': round(response_time * 1000, 2),
                    'available': result.returncode == 0,
                    'last_tested': datetime.now().isoformat()
                }
                
            except subprocess.TimeoutExpired:
                performance_data[server_name] = {
                    'response_time_ms': 5000,  # timeout
                    'available': False,
                    'error': 'timeout',
                    'last_tested': datetime.now().isoformat()
                }
            except Exception as e:
                performance_data[server_name] = {
                    'response_time_ms': None,
                    'available': False,
                    'error': str(e),
                    'last_tested': datetime.now().isoformat()
                }
    
    return performance_data

def measure_system_performance():
    """Measure system performance metrics"""
    performance_data = {
        'timestamp': datetime.now().isoformat(),
        'cpu_load': None,
        'memory_usage': None,
        'disk_io': None
    }
    
    try:
        # CPU load average (if available)
        if hasattr(os, 'getloadavg'):
            load_avg = os.getloadavg()
            performance_data['cpu_load'] = {
                '1min': load_avg[0],
                '5min': load_avg[1],
                '15min': load_avg[2]
            }
    except:
        pass
    
    return performance_data

# Generate performance report
performance_report = {
    'mcp_servers': measure_mcp_performance(),
    'system': measure_system_performance()
}

print(json.dumps(performance_report, indent=2))
EOF
}

# Output formatting functions
format_output() {
    local report_file="$1"
    local format="$2"
    
    case "$format" in
        "json")
            cat "$report_file"
            ;;
        "yaml")
            python3 -c "import json, yaml; print(yaml.dump(json.load(open('$report_file')), default_flow_style=False))"
            ;;
        "summary")
            python3 << EOF
import json

with open('$report_file', 'r') as f:
    report = json.load(f)

summary = report.get('summary', {})
print(f"🔍 Drift Detection Summary")
print(f"Environment: {report.get('metadata', {}).get('environment', 'unknown')}")
print(f"Drift Detected: {'Yes' if summary.get('drift_detected') else 'No'}")
print(f"Drift Percentage: {summary.get('drift_percentage', 0):.1f}%")
print(f"Total Issues: {summary.get('total_drift_items', 0)}")
print(f"Critical Issues: {len(report.get('categorized_drift', {}).get('critical', []))}")
print(f"Risk Level: {report.get('detailed_analysis', {}).get('risk_assessment', 'unknown').upper()}")

if report.get('recommendations'):
    print(f"\n📋 Recommendations:")
    for i, rec in enumerate(report['recommendations'][:3], 1):
        print(f"  {i}. {rec}")

if summary.get('drift_detected'):
    drift_items = report.get('drift_items', [])
    if drift_items:
        print(f"\n🔧 Top Issues:")
        for i, item in enumerate(drift_items[:5], 1):
            severity_icon = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(item.get('severity'), '⚪')
            print(f"  {i}. {severity_icon} {item.get('description', 'Unknown issue')}")
EOF
            ;;
        "html")
            generate_html_report "$report_file"
            ;;
        *)
            log_error "Unknown output format: $format"
            return 1
            ;;
    esac
}

generate_html_report() {
    local report_file="$1"
    local html_file="${report_file%.json}.html"
    
    python3 << EOF
import json
from datetime import datetime

with open('$report_file', 'r') as f:
    report = json.load(f)

html_content = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration Drift Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 6px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; margin-top: 5px; }
        .severity-high { color: #dc3545; }
        .severity-medium { color: #ffc107; }
        .severity-low { color: #28a745; }
        .drift-item { margin: 10px 0; padding: 15px; border-left: 4px solid #ddd; background: #f8f9fa; }
        .drift-item.high { border-left-color: #dc3545; }
        .drift-item.medium { border-left-color: #ffc107; }
        .drift-item.low { border-left-color: #28a745; }
        .recommendations { background: #e7f3ff; padding: 20px; border-radius: 6px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Configuration Drift Report</h1>
            <p><strong>Environment:</strong> {environment}</p>
            <p><strong>Generated:</strong> {timestamp}</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <div class="metric-value {drift_color}">{drift_percentage}%</div>
                <div class="metric-label">Drift Percentage</div>
            </div>
            <div class="metric">
                <div class="metric-value">{total_items}</div>
                <div class="metric-label">Total Issues</div>
            </div>
            <div class="metric">
                <div class="metric-value severity-high">{critical_count}</div>
                <div class="metric-label">Critical Issues</div>
            </div>
            <div class="metric">
                <div class="metric-value">{risk_level}</div>
                <div class="metric-label">Risk Level</div>
            </div>
        </div>
        
        {recommendations_html}
        
        <h2>📊 Drift Analysis</h2>
        {drift_items_html}
        
        <h2>📈 Patterns & Insights</h2>
        {patterns_html}
        
    </div>
</body>
</html>'''

# Extract data
metadata = report.get('metadata', {})
summary = report.get('summary', {})
drift_items = report.get('drift_items', [])
recommendations = report.get('recommendations', [])
patterns = report.get('patterns', {})

# Format data
environment = metadata.get('environment', 'Unknown')
timestamp = metadata.get('analysis_timestamp', 'Unknown')
drift_percentage = summary.get('drift_percentage', 0)
total_items = summary.get('total_drift_items', 0)
critical_count = len(report.get('categorized_drift', {}).get('critical', []))
risk_level = report.get('detailed_analysis', {}).get('risk_assessment', 'unknown').upper()

drift_color = 'severity-high' if drift_percentage > 10 else 'severity-medium' if drift_percentage > 5 else 'severity-low'

# Recommendations HTML
recommendations_html = ""
if recommendations:
    recommendations_html = '''
    <div class="recommendations">
        <h3>💡 Recommendations</h3>
        <ul>
    '''
    for rec in recommendations:
        recommendations_html += f"<li>{rec}</li>"
    recommendations_html += "</ul></div>"

# Drift items HTML
drift_items_html = ""
for item in drift_items[:20]:  # Show top 20 items
    severity = item.get('severity', 'low')
    drift_items_html += f'''
    <div class="drift-item {severity}">
        <h4>{item.get('description', 'Unknown issue')}</h4>
        <p><strong>Section:</strong> {item.get('section', 'Unknown')}</p>
        <p><strong>Severity:</strong> {severity.upper()}</p>
        <p><strong>Impact:</strong> {item.get('impact', 'Unknown')}</p>
        <p><strong>Remediation:</strong> {item.get('remediation', 'Manual review required')}</p>
    </div>
    '''

# Patterns HTML
patterns_html = "<table>"
patterns_html += "<tr><th>Category</th><th>Count</th></tr>"
for section, count in patterns.get('most_affected_sections', {}).items():
    patterns_html += f"<tr><td>{section}</td><td>{count}</td></tr>"
patterns_html += "</table>"

# Generate final HTML
final_html = html_content.format(
    environment=environment,
    timestamp=timestamp,
    drift_percentage=drift_percentage,
    total_items=total_items,
    critical_count=critical_count,
    risk_level=risk_level,
    drift_color=drift_color,
    recommendations_html=recommendations_html,
    drift_items_html=drift_items_html,
    patterns_html=patterns_html
)

with open('$html_file', 'w') as f:
    f.write(final_html)

print(f"HTML report generated: $html_file")
EOF
}

# Main function
main() {
    log_info "Starting drift detection analysis"
    
    # Validate inputs
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Environment parameter is required"
        return 1
    fi
    
    # Load baseline configuration
    local baseline_file
    baseline_file=$(load_baseline_config "$ENVIRONMENT")
    if [[ $? -ne 0 ]]; then
        log_error "Failed to load baseline configuration"
        return 1
    fi
    
    # Capture current state
    local current_file
    current_file=$(capture_current_state "$ENVIRONMENT")
    if [[ $? -ne 0 ]]; then
        log_error "Failed to capture current state"
        return 1
    fi
    
    # Analyze drift
    local report_file="${CACHE_DIR}/drift_report_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).json"
    if ! analyze_drift "$baseline_file" "$current_file" "$ENVIRONMENT" > "$report_file"; then
        log_error "Drift analysis failed"
        return 1
    fi
    
    # Include performance analysis if requested
    if [[ "$INCLUDE_PERFORMANCE" == "true" ]]; then
        local perf_file="${CACHE_DIR}/performance_${ENVIRONMENT}.json"
        analyze_performance_drift "$ENVIRONMENT" > "$perf_file"
        
        # Merge performance data into main report
        python3 << EOF
import json

with open('$report_file', 'r') as f:
    report = json.load(f)

try:
    with open('$perf_file', 'r') as f:
        perf_data = json.load(f)
    report['performance_analysis'] = perf_data
except:
    report['performance_analysis'] = {'error': 'Performance analysis failed'}

with open('$report_file', 'w') as f:
    json.dump(report, f, indent=2)
EOF
    fi
    
    # Output results
    if [[ -n "$OUTPUT_FILE" ]]; then
        cp "$report_file" "$OUTPUT_FILE"
        log_info "Report saved to: $OUTPUT_FILE"
    fi
    
    # Format and display output
    format_output "$report_file" "$OUTPUT_FORMAT"
    
    # Determine exit code based on drift
    local drift_detected
    drift_detected=$(python3 -c "import json; print(json.load(open('$report_file'))['summary']['drift_detected'])" 2>/dev/null)
    
    if [[ "$drift_detected" == "True" ]]; then
        local drift_percentage
        drift_percentage=$(python3 -c "import json; print(json.load(open('$report_file'))['summary']['drift_percentage'])" 2>/dev/null)
        
        if (( $(echo "$drift_percentage > $DRIFT_THRESHOLD" | bc -l) )); then
            log_warn "Drift threshold exceeded: ${drift_percentage}% > ${DRIFT_THRESHOLD}%"
            return 1
        else
            log_info "Drift detected but within threshold: ${drift_percentage}% <= ${DRIFT_THRESHOLD}%"
            return 0
        fi
    else
        log_info "No configuration drift detected"
        return 0
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --baseline)
            BASELINE_CONFIG="$2"
            shift 2
            ;;
        --current)
            CURRENT_CONFIG="$2"
            shift 2
            ;;
        --threshold)
            DRIFT_THRESHOLD="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        --report-only)
            REPORT_ONLY="true"
            shift
            ;;
        --detailed)
            DETAILED_ANALYSIS="true"
            shift
            ;;
        --include-performance)
            INCLUDE_PERFORMANCE="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --environment ENV       Target environment (required)"
            echo "  --baseline FILE         Baseline configuration file"
            echo "  --current FILE          Current configuration file"
            echo "  --threshold PERCENT     Drift threshold percentage (default: 5.0)"
            echo "  --output FILE           Output file path"
            echo "  --format FORMAT         Output format (json|yaml|summary|html)"
            echo "  --report-only           Generate report without taking action"
            echo "  --detailed              Include detailed analysis"
            echo "  --include-performance   Include performance metrics"
            echo "  --help                  Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Execute main function
main