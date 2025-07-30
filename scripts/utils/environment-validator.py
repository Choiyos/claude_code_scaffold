#!/usr/bin/env python3
"""
Environment Validator for Claude Environment
Validates configuration files, dependencies, and environment setup
"""

import json
import sys
import yaml
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import logging

# Rich imports for beautiful output
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.syntax import Syntax
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def rprint(*args, **kwargs):
        print(*args, **kwargs)

console = Console() if RICH_AVAILABLE else None

@dataclass
class ValidationResult:
    component: str
    status: str  # valid, warning, error
    message: str
    line_number: Optional[int] = None
    column: Optional[int] = None
    suggestion: Optional[str] = None
    severity: str = "medium"  # low, medium, high, critical

class EnvironmentValidator:
    """Comprehensive environment configuration validator"""
    
    def __init__(self, config_dir: str = None):
        self.config_dir = Path(config_dir or Path.home() / ".claude")
        self.results = []
        self.logger = self._setup_logging()
        
        # Configuration schemas
        self.schemas = {
            "main_config": self._get_main_config_schema(),
            "environment_config": self._get_environment_config_schema(),
            "mcp_config": self._get_mcp_config_schema(),
            "team_config": self._get_team_config_schema()
        }
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        logger = logging.getLogger('environment_validator')
        logger.setLevel(logging.INFO)
        return logger
    
    def _get_main_config_schema(self) -> Dict:
        """Get schema for main configuration file"""
        return {
            "type": "object",
            "required": ["version", "default_environment"],
            "properties": {
                "version": {
                    "type": "string",
                    "pattern": r"^\d+\.\d+\.\d+$"
                },
                "default_environment": {
                    "type": "string",
                    "enum": ["development", "staging", "production"]
                },
                "auto_sync": {"type": "boolean"},
                "sync_interval": {"type": "integer", "minimum": 30},
                "backup_retention": {"type": "integer", "minimum": 1},
                "logging": {
                    "type": "object",
                    "properties": {
                        "level": {"enum": ["DEBUG", "INFO", "WARNING", "ERROR"]},
                        "file": {"type": "string"},
                        "max_size": {"type": "string"},
                        "max_files": {"type": "integer"}
                    }
                },
                "ui": {
                    "type": "object",
                    "properties": {
                        "color": {"type": "boolean"},
                        "progress_bars": {"type": "boolean"},
                        "interactive": {"type": "boolean"}
                    }
                },
                "integrations": {
                    "type": "object",
                    "properties": {
                        "mcp_servers": {
                            "type": "object",
                            "properties": {
                                "auto_discovery": {"type": "boolean"},
                                "health_check_interval": {"type": "integer"}
                            }
                        }
                    }
                }
            }
        }
    
    def _get_environment_config_schema(self) -> Dict:
        """Get schema for environment configuration files"""
        return {
            "type": "object",
            "required": ["environment"],
            "properties": {
                "environment": {
                    "type": "string",
                    "enum": ["development", "staging", "production"]
                },
                "created": {"type": "string"},
                "mcp_servers": {
                    "type": "object",
                    "patternProperties": {
                        ".*": {
                            "type": "object",
                            "properties": {
                                "enabled": {"type": "boolean"},
                                "auto_start": {"type": "boolean"},
                                "config": {"type": "object"}
                            }
                        }
                    }
                },
                "tools": {
                    "type": "object",
                    "properties": {
                        "node_version": {"type": "string"},
                        "python_version": {"type": "string"},
                        "docker_compose": {"type": "boolean"}
                    }
                },
                "security": {
                    "type": "object",
                    "properties": {
                        "strict_mode": {"type": "boolean"},
                        "auto_updates": {"type": "boolean"}
                    }
                }
            }
        }
    
    def _get_mcp_config_schema(self) -> Dict:
        """Get schema for MCP configuration"""
        return {
            "type": "object",
            "properties": {
                "mcpServers": {
                    "type": "object",
                    "patternProperties": {
                        ".*": {
                            "type": "object",
                            "required": ["command"],
                            "properties": {
                                "command": {
                                    "oneOf": [
                                        {"type": "string"},
                                        {"type": "array", "items": {"type": "string"}}
                                    ]
                                },
                                "args": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                },
                                "env": {"type": "object"},
                                "disabled": {"type": "boolean"}
                            }
                        }
                    }
                }
            }
        }
    
    def _get_team_config_schema(self) -> Dict:
        """Get schema for team configuration"""
        return {
            "type": "object",
            "required": ["team_name"],
            "properties": {
                "team_name": {"type": "string"},
                "members": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "permissions": {
                    "type": "object",
                    "properties": {
                        "environments": {
                            "type": "array",
                            "items": {"enum": ["development", "staging", "production"]}
                        },
                        "admin_users": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    }
                },
                "defaults": {"type": "object"}
            }
        }
    
    def validate_all(self) -> List[ValidationResult]:
        """Run all validation checks"""
        self.results = []
        
        # Structure validation
        self._validate_directory_structure()
        
        # Configuration file validation
        self._validate_main_config()
        self._validate_environment_configs()
        self._validate_mcp_config()
        self._validate_team_configs()
        
        # Dependency validation
        self._validate_dependencies()
        
        # Security validation
        self._validate_security_settings()
        
        # Integration validation
        self._validate_integrations()
        
        return self.results
    
    def _validate_directory_structure(self):
        """Validate expected directory structure"""
        expected_dirs = [
            "environments",
            "teams", 
            "backups",
            "logs"
        ]
        
        for dir_name in expected_dirs:
            dir_path = self.config_dir / dir_name
            if not dir_path.exists():
                self.results.append(ValidationResult(
                    component="directory_structure",
                    status="warning",
                    message=f"Missing directory: {dir_name}",
                    suggestion=f"Create directory: mkdir -p {dir_path}",
                    severity="medium"
                ))
            elif not dir_path.is_dir():
                self.results.append(ValidationResult(
                    component="directory_structure",
                    status="error",
                    message=f"Expected directory but found file: {dir_name}",
                    suggestion=f"Remove file and create directory: rm {dir_path} && mkdir -p {dir_path}",
                    severity="high"
                ))
    
    def _validate_main_config(self):
        """Validate main configuration file"""
        config_file = self.config_dir / "config.yml"
        
        if not config_file.exists():
            self.results.append(ValidationResult(
                component="main_config",
                status="error",
                message="Main configuration file missing",
                suggestion="Run 'claude-env config init' to create default configuration",
                severity="critical"
            ))
            return
        
        try:
            with open(config_file, 'r') as f:
                config = yaml.safe_load(f)
            
            self._validate_against_schema(config, "main_config", "main_config")
            
            # Additional semantic validation
            self._validate_main_config_semantics(config)
            
        except yaml.YAMLError as e:
            self.results.append(ValidationResult(
                component="main_config",
                status="error",
                message=f"YAML syntax error: {e}",
                line_number=getattr(e, 'problem_mark', {}).get('line'),
                column=getattr(e, 'problem_mark', {}).get('column'),
                suggestion="Fix YAML syntax errors",
                severity="high"
            ))
        except Exception as e:
            self.results.append(ValidationResult(
                component="main_config",
                status="error",
                message=f"Failed to read configuration: {e}",
                severity="high"
            ))
    
    def _validate_main_config_semantics(self, config: Dict):
        """Validate semantic rules for main configuration"""
        # Check version format
        version = config.get("version", "")
        if not re.match(r'^\d+\.\d+\.\d+$', version):
            self.results.append(ValidationResult(
                component="main_config",
                status="warning",
                message=f"Invalid version format: {version}",
                suggestion="Use semantic versioning (e.g., '2.0.0')",
                severity="low"
            ))
        
        # Check sync interval
        sync_interval = config.get("sync_interval", 0)
        if sync_interval < 30:
            self.results.append(ValidationResult(
                component="main_config",
                status="warning",
                message=f"Sync interval too low: {sync_interval}s",
                suggestion="Use at least 30 seconds to avoid excessive API calls",
                severity="medium"
            ))
        
        # Check backup retention
        backup_retention = config.get("backup_retention", 0)
        if backup_retention < 1:
            self.results.append(ValidationResult(
                component="main_config",
                status="warning",
                message="Backup retention not set",
                suggestion="Set backup_retention to at least 7 days",
                severity="medium"
            ))
    
    def _validate_environment_configs(self):
        """Validate environment configuration files"""
        envs_dir = self.config_dir / "environments"
        expected_envs = ["development", "staging", "production"]
        
        for env in expected_envs:
            env_dir = envs_dir / env
            config_file = env_dir / "config.yml"
            
            if not env_dir.exists():
                self.results.append(ValidationResult(
                    component=f"environment_config_{env}",
                    status="warning",
                    message=f"Environment directory missing: {env}",
                    suggestion=f"Create environment: claude-env environment create {env}",
                    severity="medium"
                ))
                continue
            
            if not config_file.exists():
                self.results.append(ValidationResult(
                    component=f"environment_config_{env}",
                    status="error",
                    message=f"Environment configuration missing: {env}",
                    suggestion=f"Create configuration: claude-env environment init {env}",
                    severity="high"
                ))
                continue
            
            try:
                with open(config_file, 'r') as f:
                    config = yaml.safe_load(f)
                
                self._validate_against_schema(config, "environment_config", f"environment_config_{env}")
                
                # Validate environment-specific semantics
                self._validate_environment_semantics(env, config)
                
            except yaml.YAMLError as e:
                self.results.append(ValidationResult(
                    component=f"environment_config_{env}",
                    status="error",
                    message=f"YAML syntax error in {env}: {e}",
                    line_number=getattr(e, 'problem_mark', {}).get('line'),
                    column=getattr(e, 'problem_mark', {}).get('column'),
                    severity="high"
                ))
            except Exception as e:
                self.results.append(ValidationResult(
                    component=f"environment_config_{env}",
                    status="error",
                    message=f"Failed to read {env} configuration: {e}",
                    severity="high"
                ))
    
    def _validate_environment_semantics(self, env_name: str, config: Dict):
        """Validate semantic rules for environment configuration"""
        # Check environment name consistency
        config_env = config.get("environment", "")
        if config_env != env_name:
            self.results.append(ValidationResult(
                component=f"environment_config_{env_name}",
                status="error",
                message=f"Environment name mismatch: config says '{config_env}', expected '{env_name}'",
                suggestion=f"Update environment field to '{env_name}'",
                severity="high"
            ))
        
        # Validate production-specific settings
        if env_name == "production":
            security = config.get("security", {})
            if not security.get("strict_mode", False):
                self.results.append(ValidationResult(
                    component=f"environment_config_{env_name}",
                    status="warning",
                    message="Production environment should have strict_mode enabled",
                    suggestion="Set security.strict_mode: true",
                    severity="medium"
                ))
            
            if security.get("auto_updates", True):
                self.results.append(ValidationResult(
                    component=f"environment_config_{env_name}",
                    status="warning",
                    message="Production environment should not have auto_updates enabled",
                    suggestion="Set security.auto_updates: false",
                    severity="medium"
                ))
        
        # Validate development-specific settings
        if env_name == "development":
            mcp_servers = config.get("mcp_servers", {})
            magic_server = mcp_servers.get("magic", {})
            if not magic_server.get("enabled", False):
                self.results.append(ValidationResult(
                    component=f"environment_config_{env_name}",
                    status="warning",
                    message="Development environment should have magic server enabled",
                    suggestion="Set mcp_servers.magic.enabled: true",
                    severity="low"
                ))
    
    def _validate_mcp_config(self):
        """Validate MCP configuration file"""
        mcp_file = self.config_dir / "mcp.json"
        
        if not mcp_file.exists():
            self.results.append(ValidationResult(
                component="mcp_config",
                status="warning",
                message="MCP configuration file missing",
                suggestion="Create MCP configuration with 'claude-env mcp init'",
                severity="medium"
            ))
            return
        
        try:
            with open(mcp_file, 'r') as f:
                config = json.load(f)
            
            self._validate_against_schema(config, "mcp_config", "mcp_config")
            
            # Validate MCP servers
            self._validate_mcp_servers(config)
            
        except json.JSONDecodeError as e:
            self.results.append(ValidationResult(
                component="mcp_config",
                status="error",
                message=f"JSON syntax error: {e}",
                line_number=e.lineno,
                column=e.colno,
                suggestion="Fix JSON syntax errors",
                severity="high"
            ))
        except Exception as e:
            self.results.append(ValidationResult(
                component="mcp_config",
                status="error",
                message=f"Failed to read MCP configuration: {e}",
                severity="high"
            ))
    
    def _validate_mcp_servers(self, config: Dict):
        """Validate MCP server configurations"""
        servers = config.get("mcpServers", {})
        
        if not servers:
            self.results.append(ValidationResult(
                component="mcp_config",
                status="warning",
                message="No MCP servers configured",
                suggestion="Configure at least one MCP server",
                severity="medium"
            ))
            return
        
        # Check for common server types
        common_servers = ["context7", "sequential", "magic"]
        for server_name in common_servers:
            if server_name not in servers:
                self.results.append(ValidationResult(
                    component="mcp_config",
                    status="warning",
                    message=f"Common MCP server not configured: {server_name}",
                    suggestion=f"Consider adding {server_name} server for enhanced functionality",
                    severity="low"
                ))
        
        # Validate each server configuration
        for server_name, server_config in servers.items():
            self._validate_single_mcp_server(server_name, server_config)
    
    def _validate_single_mcp_server(self, server_name: str, server_config: Dict):
        """Validate single MCP server configuration"""
        if "command" not in server_config:
            self.results.append(ValidationResult(
                component="mcp_config",
                status="error",
                message=f"MCP server '{server_name}' missing required 'command' field",
                suggestion=f"Add command field for {server_name}",
                severity="high"
            ))
            return
        
        command = server_config["command"]
        if isinstance(command, list) and len(command) == 0:
            self.results.append(ValidationResult(
                component="mcp_config",
                status="error",
                message=f"MCP server '{server_name}' has empty command array",
                suggestion=f"Provide valid command for {server_name}",
                severity="high"
            ))
        elif isinstance(command, str) and not command.strip():
            self.results.append(ValidationResult(
                component="mcp_config",
                status="error",
                message=f"MCP server '{server_name}' has empty command string",
                suggestion=f"Provide valid command for {server_name}",
                severity="high"
            ))
    
    def _validate_team_configs(self):
        """Validate team configuration files"""
        teams_dir = self.config_dir / "teams"
        
        if not teams_dir.exists():
            return  # Team configs are optional
        
        for team_dir in teams_dir.iterdir():
            if team_dir.is_dir():
                config_file = team_dir / "config.yml"
                if config_file.exists():
                    try:
                        with open(config_file, 'r') as f:
                            config = yaml.safe_load(f)
                        
                        self._validate_against_schema(config, "team_config", f"team_config_{team_dir.name}")
                        
                    except yaml.YAMLError as e:
                        self.results.append(ValidationResult(
                            component=f"team_config_{team_dir.name}",
                            status="error",
                            message=f"YAML syntax error in team {team_dir.name}: {e}",
                            line_number=getattr(e, 'problem_mark', {}).get('line'),
                            column=getattr(e, 'problem_mark', {}).get('column'),
                            severity="medium"
                        ))
                    except Exception as e:
                        self.results.append(ValidationResult(
                            component=f"team_config_{team_dir.name}",
                            status="error",
                            message=f"Failed to read team {team_dir.name} configuration: {e}",
                            severity="medium"
                        ))
    
    def _validate_dependencies(self):
        """Validate system dependencies"""
        import subprocess
        import importlib
        
        # Check Python packages
        required_packages = [
            "rich", "PyYAML", "requests", "docker", "psutil"
        ]
        
        missing_packages = []
        for package in required_packages:
            try:
                importlib.import_module(package.lower().replace('-', '_'))
            except ImportError:
                missing_packages.append(package)
        
        if missing_packages:
            self.results.append(ValidationResult(
                component="dependencies",
                status="error",
                message=f"Missing Python packages: {', '.join(missing_packages)}",
                suggestion=f"Install packages: pip install {' '.join(missing_packages)}",
                severity="high"
            ))
        
        # Check system commands
        required_commands = ["docker", "git"]
        missing_commands = []
        
        for cmd in required_commands:
            try:
                subprocess.run(["which", cmd], capture_output=True, check=True)
            except subprocess.CalledProcessError:
                missing_commands.append(cmd)
        
        if missing_commands:
            self.results.append(ValidationResult(
                component="dependencies",
                status="warning",
                message=f"Missing system commands: {', '.join(missing_commands)}",
                suggestion=f"Install missing commands: {', '.join(missing_commands)}",
                severity="medium"
            ))
    
    def _validate_security_settings(self):
        """Validate security-related settings"""
        # Check file permissions
        if self.config_dir.exists():
            stat_info = self.config_dir.stat()
            mode = stat_info.st_mode & 0o777
            if mode != 0o700:
                self.results.append(ValidationResult(
                    component="security",
                    status="warning",
                    message=f"Claude directory has permissive permissions: {oct(mode)}",
                    suggestion=f"Fix permissions: chmod 700 {self.config_dir}",
                    severity="medium"
                ))
        
        # Check for sensitive files with wrong permissions
        sensitive_files = ["config.yml", "mcp.json"]
        for filename in sensitive_files:
            file_path = self.config_dir / filename
            if file_path.exists():
                stat_info = file_path.stat()
                mode = stat_info.st_mode & 0o777
                if mode & 0o077:  # World or group readable
                    self.results.append(ValidationResult(
                        component="security",
                        status="warning",
                        message=f"Sensitive file {filename} has permissive permissions: {oct(mode)}",
                        suggestion=f"Fix permissions: chmod 600 {file_path}",
                        severity="medium"
                    ))
    
    def _validate_integrations(self):
        """Validate integration settings"""
        # Check Docker integration
        try:
            import docker
            client = docker.from_env()
            client.ping()
        except Exception as e:
            self.results.append(ValidationResult(
                component="integrations",
                status="warning",
                message=f"Docker integration not available: {e}",
                suggestion="Ensure Docker is installed and running",
                severity="medium"
            ))
    
    def _validate_against_schema(self, data: Any, schema_name: str, component: str):
        """Validate data against JSON schema (simplified validation)"""
        schema = self.schemas.get(schema_name, {})
        
        # This is a simplified schema validation
        # In a real implementation, you'd use jsonschema library
        if "required" in schema:
            for required_field in schema["required"]:
                if required_field not in data:
                    self.results.append(ValidationResult(
                        component=component,
                        status="error",
                        message=f"Missing required field: {required_field}",
                        suggestion=f"Add required field: {required_field}",
                        severity="high"
                    ))

def format_validation_report(results: List[ValidationResult]) -> None:
    """Format and display validation report"""
    if RICH_AVAILABLE and console:
        # Summary
        error_count = len([r for r in results if r.status == "error"])
        warning_count = len([r for r in results if r.status == "warning"])
        valid_count = len([r for r in results if r.status == "valid"])
        
        summary = f"✅ Valid: {valid_count}  ⚠️  Warnings: {warning_count}  ❌ Errors: {error_count}"
        
        overall_status = "error" if error_count > 0 else "warning" if warning_count > 0 else "valid"
        status_colors = {"valid": "green", "warning": "yellow", "error": "red"}
        
        summary_panel = Panel(
            summary,
            title="🔍 Validation Summary",
            border_style=status_colors.get(overall_status, "blue")
        )
        console.print(summary_panel)
        
        # Detailed results
        if results:
            table = Table(title="📋 Validation Results", show_header=True, header_style="bold magenta")
            table.add_column("Component", style="cyan", width=25)
            table.add_column("Status", width=10)
            table.add_column("Message", style="white", width=50)
            table.add_column("Suggestion", style="dim", width=40)
            
            for result in sorted(results, key=lambda x: (x.status != "error", x.status != "warning", x.component)):
                status_icons = {"valid": "✅", "warning": "⚠️", "error": "❌"}
                status_colors = {"valid": "green", "warning": "yellow", "error": "red"}
                
                table.add_row(
                    result.component.replace("_", " ").title(),
                    f"[{status_colors.get(result.status, 'white')}]{status_icons.get(result.status, '?')} {result.status.title()}[/]",
                    result.message,
                    result.suggestion or ""
                )
            
            console.print(table)
    else:
        # Fallback for non-rich environments
        print("\n" + "="*100)
        print("CLAUDE ENVIRONMENT VALIDATION REPORT")
        print("="*100)
        
        status_counts = {"valid": 0, "warning": 0, "error": 0}
        for result in results:
            status_counts[result.status] = status_counts.get(result.status, 0) + 1
        
        print(f"\nSUMMARY:")
        print(f"  VALID: {status_counts['valid']}")
        print(f"  WARNINGS: {status_counts['warning']}")
        print(f"  ERRORS: {status_counts['error']}")
        
        if results:
            print(f"\nDETAILS:")
            for result in sorted(results, key=lambda x: (x.status != "error", x.status != "warning", x.component)):
                status_icon = {"valid": "✅", "warning": "⚠️", "error": "❌"}.get(result.status, "?")
                print(f"  {status_icon} {result.component}: {result.message}")
                if result.suggestion:
                    print(f"      Suggestion: {result.suggestion}")
        
        print("="*100)

def main():
    """Main function for environment validator"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Claude Environment Configuration Validator")
    parser.add_argument("--config-dir", help="Claude configuration directory")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    parser.add_argument("--component", help="Validate specific component only")
    parser.add_argument("--fix", action="store_true", help="Auto-fix issues where possible")
    
    args = parser.parse_args()
    
    validator = EnvironmentValidator(args.config_dir)
    results = validator.validate_all()
    
    if args.json:
        validation_data = {
            "timestamp": datetime.now().isoformat(),
            "results": [
                {
                    "component": r.component,
                    "status": r.status,
                    "message": r.message,
                    "line_number": r.line_number,
                    "column": r.column,
                    "suggestion": r.suggestion,
                    "severity": r.severity
                }
                for r in results
            ]
        }
        print(json.dumps(validation_data, indent=2))
    else:
        format_validation_report(results)
    
    # Exit with appropriate code
    error_count = len([r for r in results if r.status == "error"])
    warning_count = len([r for r in results if r.status == "warning"])
    
    if error_count > 0:
        sys.exit(2)
    elif warning_count > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    from datetime import datetime
    try:
        main()
    except KeyboardInterrupt:
        print("\nValidation interrupted")
        sys.exit(130)
    except Exception as e:
        print(f"Validation failed: {e}")
        sys.exit(1)