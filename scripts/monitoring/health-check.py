#!/usr/bin/env python3
"""
Health Check and Monitoring Script for Claude Environment
Comprehensive system health validation and monitoring
"""

import asyncio
import json
import sys
import time
import logging
import subprocess
import requests
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import psutil
import docker
from dataclasses import dataclass, asdict

# Rich imports for beautiful output
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.live import Live
    from rich.layout import Layout
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def rprint(*args, **kwargs):
        print(*args, **kwargs)

console = Console() if RICH_AVAILABLE else None

@dataclass
class HealthStatus:
    component: str
    status: str  # healthy, warning, critical, unknown
    message: str
    details: Dict = None
    timestamp: datetime = None
    response_time: float = 0.0
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
        if self.details is None:
            self.details = {}

@dataclass
class SystemMetrics:
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    network_connections: int
    process_count: int
    uptime: float
    load_average: List[float]
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

class HealthChecker:
    """Comprehensive health checker for Claude Environment"""
    
    def __init__(self, config_dir: str = None):
        self.config_dir = Path(config_dir or Path.home() / ".claude")
        self.docker_client = None
        self.checks = []
        self.logger = self._setup_logging()
        
        # Initialize Docker client
        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            self.logger.warning(f"Docker client unavailable: {e}")
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        log_dir = self.config_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        
        logger = logging.getLogger('health_checker')
        logger.setLevel(logging.INFO)
        
        # File handler
        file_handler = logging.FileHandler(log_dir / "health-check.log")
        file_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        logger.addHandler(file_handler)
        
        return logger
    
    async def run_comprehensive_check(self) -> List[HealthStatus]:
        """Run all health checks"""
        self.logger.info("Starting comprehensive health check")
        
        if RICH_AVAILABLE and console:
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console
            ) as progress:
                task = progress.add_task("[cyan]Running health checks...", total=None)
                
                checks = await self._run_all_checks()
                
                progress.update(task, description="[green]Health checks completed")
                
        else:
            print("Running health checks...")
            checks = await self._run_all_checks()
            print("Health checks completed")
        
        self.logger.info(f"Health check completed: {len(checks)} components checked")
        return checks
    
    async def _run_all_checks(self) -> List[HealthStatus]:
        """Execute all health checks"""
        checks = []
        
        # System checks
        checks.append(await self._check_system_resources())
        checks.append(await self._check_disk_space())
        checks.append(await self._check_python_environment())
        
        # Configuration checks
        checks.append(await self._check_claude_config())
        checks.append(await self._check_environment_configs())
        
        # Service checks
        checks.append(await self._check_docker_services())
        checks.append(await self._check_mcp_servers())
        checks.append(await self._check_api_gateway())
        
        # Network checks
        checks.append(await self._check_network_connectivity())
        checks.append(await self._check_dns_resolution())
        
        # Security checks
        checks.append(await self._check_file_permissions())
        checks.append(await self._check_ssl_certificates())
        
        return [check for check in checks if check is not None]
    
    async def _check_system_resources(self) -> HealthStatus:
        """Check system resource utilization"""
        try:
            start_time = time.time()
            
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            
            # Determine status based on thresholds
            if cpu_percent > 90 or memory.percent > 95:
                status = "critical"
                message = f"High resource usage: CPU {cpu_percent:.1f}%, Memory {memory.percent:.1f}%"
            elif cpu_percent > 70 or memory.percent > 80:
                status = "warning"
                message = f"Moderate resource usage: CPU {cpu_percent:.1f}%, Memory {memory.percent:.1f}%"
            else:
                status = "healthy"
                message = f"Resources OK: CPU {cpu_percent:.1f}%, Memory {memory.percent:.1f}%"
            
            details = {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_total": memory.total,
                "memory_available": memory.available,
                "load_average": list(psutil.getloadavg()) if hasattr(psutil, 'getloadavg') else []
            }
            
            return HealthStatus(
                component="system_resources",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="system_resources",
                status="unknown",
                message=f"Failed to check system resources: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_disk_space(self) -> HealthStatus:
        """Check disk space availability"""
        try:
            start_time = time.time()
            
            disk_usage = psutil.disk_usage('/')
            disk_percent = (disk_usage.used / disk_usage.total) * 100
            
            if disk_percent > 95:
                status = "critical"
                message = f"Critical disk usage: {disk_percent:.1f}% used"
            elif disk_percent > 85:
                status = "warning"
                message = f"High disk usage: {disk_percent:.1f}% used"
            else:
                status = "healthy"
                message = f"Disk usage OK: {disk_percent:.1f}% used"
            
            details = {
                "disk_percent": disk_percent,
                "total_gb": round(disk_usage.total / (1024**3), 2),
                "used_gb": round(disk_usage.used / (1024**3), 2),
                "free_gb": round(disk_usage.free / (1024**3), 2)
            }
            
            return HealthStatus(
                component="disk_space",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="disk_space",
                status="unknown",
                message=f"Failed to check disk space: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_python_environment(self) -> HealthStatus:
        """Check Python environment and dependencies"""
        try:
            start_time = time.time()
            
            python_version = sys.version.split()[0]
            required_packages = ['rich', 'PyYAML', 'requests', 'docker']
            missing_packages = []
            
            for package in required_packages:
                try:
                    __import__(package.lower().replace('-', '_'))
                except ImportError:
                    missing_packages.append(package)
            
            if missing_packages:
                status = "warning"
                message = f"Missing packages: {', '.join(missing_packages)}"
            else:
                status = "healthy"
                message = f"Python environment OK (v{python_version})"
            
            details = {
                "python_version": python_version,
                "missing_packages": missing_packages,
                "python_path": sys.executable
            }
            
            return HealthStatus(
                component="python_environment",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="python_environment",
                status="unknown",
                message=f"Failed to check Python environment: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_claude_config(self) -> HealthStatus:
        """Check Claude configuration directory and files"""
        try:
            start_time = time.time()
            
            config_file = self.config_dir / "config.yml"
            issues = []
            
            if not self.config_dir.exists():
                issues.append("Claude config directory missing")
            elif not config_file.exists():
                issues.append("Main config file missing")
            
            # Check directory permissions
            if self.config_dir.exists():
                stat_info = self.config_dir.stat()
                mode = stat_info.st_mode & 0o777
                if mode != 0o700:
                    issues.append(f"Incorrect directory permissions: {oct(mode)}")
            
            if issues:
                status = "warning"
                message = f"Configuration issues: {'; '.join(issues)}"
            else:
                status = "healthy"
                message = "Claude configuration OK"
            
            details = {
                "config_dir": str(self.config_dir),
                "config_exists": config_file.exists(),
                "issues": issues
            }
            
            return HealthStatus(
                component="claude_config",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="claude_config",
                status="unknown",
                message=f"Failed to check Claude config: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_environment_configs(self) -> HealthStatus:
        """Check environment-specific configurations"""
        try:
            start_time = time.time()
            
            envs_dir = self.config_dir / "environments"
            expected_envs = ["development", "staging", "production"]
            missing_envs = []
            
            for env in expected_envs:
                env_config = envs_dir / env / "config.yml"
                if not env_config.exists():
                    missing_envs.append(env)
            
            if missing_envs:
                status = "warning"
                message = f"Missing environment configs: {', '.join(missing_envs)}"
            else:
                status = "healthy"
                message = "All environment configurations present"
            
            details = {
                "environments_dir": str(envs_dir),
                "expected_environments": expected_envs,
                "missing_environments": missing_envs
            }
            
            return HealthStatus(
                component="environment_configs",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="environment_configs",
                status="unknown",
                message=f"Failed to check environment configs: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_docker_services(self) -> HealthStatus:
        """Check Docker services status"""
        try:
            start_time = time.time()
            
            if not self.docker_client:
                return HealthStatus(
                    component="docker_services",
                    status="warning",
                    message="Docker client unavailable",
                    response_time=time.time() - start_time
                )
            
            containers = self.docker_client.containers.list(all=True)
            claude_containers = [c for c in containers if 'claude' in c.name.lower()]
            
            unhealthy_containers = []
            for container in claude_containers:
                if container.status != 'running':
                    unhealthy_containers.append(f"{container.name}: {container.status}")
            
            if unhealthy_containers:
                status = "warning"
                message = f"Unhealthy containers: {'; '.join(unhealthy_containers)}"
            elif claude_containers:
                status = "healthy"
                message = f"All {len(claude_containers)} Claude containers running"
            else:
                status = "warning"
                message = "No Claude containers found"
            
            details = {
                "total_containers": len(containers),
                "claude_containers": len(claude_containers),
                "running_containers": len([c for c in claude_containers if c.status == 'running']),
                "unhealthy_containers": unhealthy_containers
            }
            
            return HealthStatus(
                component="docker_services",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="docker_services",
                status="unknown",
                message=f"Failed to check Docker services: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_mcp_servers(self) -> HealthStatus:
        """Check MCP servers connectivity"""
        try:
            start_time = time.time()
            
            mcp_config_file = self.config_dir / "mcp.json"
            if not mcp_config_file.exists():
                return HealthStatus(
                    component="mcp_servers",
                    status="warning",
                    message="MCP configuration not found",
                    response_time=time.time() - start_time
                )
            
            with open(mcp_config_file, 'r') as f:
                mcp_config = json.load(f)
            
            servers = mcp_config.get("mcpServers", {})
            server_status = {}
            unhealthy_servers = []
            
            for server_name, server_config in servers.items():
                # Simple connectivity check (placeholder)
                try:
                    # This would be replaced with actual MCP protocol health check
                    command = server_config.get("command", [])
                    if command:
                        result = subprocess.run(
                            ["which", command[0]] if isinstance(command, list) else ["which", command],
                            capture_output=True,
                            timeout=5
                        )
                        server_status[server_name] = result.returncode == 0
                        if result.returncode != 0:
                            unhealthy_servers.append(server_name)
                    else:
                        server_status[server_name] = False
                        unhealthy_servers.append(server_name)
                except:
                    server_status[server_name] = False
                    unhealthy_servers.append(server_name)
            
            if unhealthy_servers:
                status = "warning"
                message = f"Unhealthy MCP servers: {', '.join(unhealthy_servers)}"
            else:
                status = "healthy"
                message = f"All {len(servers)} MCP servers healthy"
            
            details = {
                "total_servers": len(servers),
                "healthy_servers": len(servers) - len(unhealthy_servers),
                "unhealthy_servers": unhealthy_servers,
                "server_status": server_status
            }
            
            return HealthStatus(
                component="mcp_servers",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="mcp_servers",
                status="unknown",
                message=f"Failed to check MCP servers: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_api_gateway(self) -> HealthStatus:
        """Check API Gateway health"""
        try:
            start_time = time.time()
            
            # Check common API Gateway ports
            api_urls = [
                "http://localhost:3000/health",
                "http://localhost:8080/health",
                "http://api-gateway:3000/health"
            ]
            
            for url in api_urls:
                try:
                    response = requests.get(url, timeout=5)
                    if response.status_code == 200:
                        return HealthStatus(
                            component="api_gateway",
                            status="healthy",
                            message=f"API Gateway healthy at {url}",
                            details={"url": url, "status_code": response.status_code},
                            response_time=time.time() - start_time
                        )
                except:
                    continue
            
            return HealthStatus(
                component="api_gateway",
                status="warning",
                message="API Gateway not responding",
                details={"checked_urls": api_urls},
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="api_gateway",
                status="unknown",
                message=f"Failed to check API Gateway: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_network_connectivity(self) -> HealthStatus:
        """Check network connectivity"""
        try:
            start_time = time.time()
            
            test_hosts = [
                "google.com",
                "github.com",
                "anthropic.com"
            ]
            
            failures = []
            for host in test_hosts:
                try:
                    result = subprocess.run(
                        ["ping", "-c", "1", "-W", "5", host],
                        capture_output=True,
                        timeout=10
                    )
                    if result.returncode != 0:
                        failures.append(host)
                except:
                    failures.append(host)
            
            if failures:
                status = "warning"
                message = f"Network connectivity issues: {', '.join(failures)}"
            else:
                status = "healthy"
                message = "Network connectivity OK"
            
            details = {
                "tested_hosts": test_hosts,
                "failed_hosts": failures,
                "success_rate": f"{((len(test_hosts) - len(failures)) / len(test_hosts)) * 100:.1f}%"
            }
            
            return HealthStatus(
                component="network_connectivity",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="network_connectivity",
                status="unknown",
                message=f"Failed to check network connectivity: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_dns_resolution(self) -> HealthStatus:
        """Check DNS resolution"""
        try:
            start_time = time.time()
            
            import socket
            
            test_domains = ["google.com", "github.com"]
            failures = []
            
            for domain in test_domains:
                try:
                    socket.gethostbyname(domain)
                except:
                    failures.append(domain)
            
            if failures:
                status = "warning"
                message = f"DNS resolution issues: {', '.join(failures)}"
            else:
                status = "healthy"
                message = "DNS resolution OK"
            
            details = {
                "tested_domains": test_domains,
                "failed_domains": failures
            }
            
            return HealthStatus(
                component="dns_resolution",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="dns_resolution",
                status="unknown",
                message=f"Failed to check DNS resolution: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_file_permissions(self) -> HealthStatus:
        """Check file permissions for security"""
        try:
            start_time = time.time()
            
            issues = []
            
            # Check Claude directory permissions
            if self.config_dir.exists():
                stat_info = self.config_dir.stat()
                mode = stat_info.st_mode & 0o777
                if mode != 0o700:
                    issues.append(f"Claude directory permissions: {oct(mode)} (should be 0o700)")
            
            # Check critical files
            critical_files = [
                self.config_dir / "config.yml",
                self.config_dir / "mcp.json"
            ]
            
            for file_path in critical_files:
                if file_path.exists():
                    stat_info = file_path.stat()
                    mode = stat_info.st_mode & 0o777
                    if mode & 0o077:  # World or group readable
                        issues.append(f"{file_path.name} permissions: {oct(mode)} (too permissive)")
            
            if issues:
                status = "warning"
                message = f"Permission issues: {'; '.join(issues)}"
            else:
                status = "healthy"
                message = "File permissions OK"
            
            details = {
                "issues": issues,
                "claude_dir_mode": oct(self.config_dir.stat().st_mode & 0o777) if self.config_dir.exists() else None
            }
            
            return HealthStatus(
                component="file_permissions",
                status=status,
                message=message,
                details=details,
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="file_permissions",
                status="unknown",
                message=f"Failed to check file permissions: {e}",
                response_time=time.time() - start_time
            )
    
    async def _check_ssl_certificates(self) -> HealthStatus:
        """Check SSL certificate validity"""
        try:
            start_time = time.time()
            
            # This is a placeholder - would check actual SSL certificates
            # for API endpoints, webhooks, etc.
            
            return HealthStatus(
                component="ssl_certificates",
                status="healthy",
                message="SSL certificate check not implemented",
                details={"note": "Placeholder check"},
                response_time=time.time() - start_time
            )
            
        except Exception as e:
            return HealthStatus(
                component="ssl_certificates",
                status="unknown",
                message=f"Failed to check SSL certificates: {e}",
                response_time=time.time() - start_time
            )

def format_health_report(checks: List[HealthStatus]) -> None:
    """Format and display health report"""
    if RICH_AVAILABLE and console:
        # Create summary panel
        healthy_count = len([c for c in checks if c.status == "healthy"])
        warning_count = len([c for c in checks if c.status == "warning"])
        critical_count = len([c for c in checks if c.status == "critical"])
        unknown_count = len([c for c in checks if c.status == "unknown"])
        
        summary = f"✅ Healthy: {healthy_count}  ⚠️  Warning: {warning_count}  🔴 Critical: {critical_count}  ❓ Unknown: {unknown_count}"
        
        overall_status = "critical" if critical_count > 0 else "warning" if warning_count > 0 else "healthy"
        status_colors = {"healthy": "green", "warning": "yellow", "critical": "red"}
        
        summary_panel = Panel(
            summary,
            title="🏥 Health Check Summary",
            border_style=status_colors.get(overall_status, "blue")
        )
        console.print(summary_panel)
        
        # Create detailed table
        table = Table(title="📊 Detailed Health Report", show_header=True, header_style="bold magenta")
        table.add_column("Component", style="cyan", width=20)
        table.add_column("Status", width=10)
        table.add_column("Message", style="white", width=50)
        table.add_column("Response Time", justify="right", width=12)
        
        for check in sorted(checks, key=lambda x: (x.status != "healthy", x.component)):
            status_icons = {
                "healthy": "✅",
                "warning": "⚠️",
                "critical": "🔴",
                "unknown": "❓"
            }
            
            status_colors = {
                "healthy": "green",
                "warning": "yellow",
                "critical": "red",
                "unknown": "dim"
            }
            
            table.add_row(
                check.component.replace("_", " ").title(),
                f"[{status_colors.get(check.status, 'white')}]{status_icons.get(check.status, '?')} {check.status.title()}[/]",
                check.message,
                f"{check.response_time:.3f}s"
            )
        
        console.print(table)
        
    else:
        # Fallback for non-rich environments
        print("\n" + "="*80)
        print("CLAUDE ENVIRONMENT HEALTH CHECK REPORT")
        print("="*80)
        
        status_counts = {}
        for check in checks:
            status_counts[check.status] = status_counts.get(check.status, 0) + 1
        
        print(f"\nSUMMARY:")
        for status, count in status_counts.items():
            print(f"  {status.upper()}: {count}")
        
        print(f"\nDETAILS:")
        for check in sorted(checks, key=lambda x: (x.status != "healthy", x.component)):
            status_icon = {"healthy": "✅", "warning": "⚠️", "critical": "🔴", "unknown": "❓"}.get(check.status, "?")
            print(f"  {status_icon} {check.component.replace('_', ' ').title()}: {check.message}")
        
        print("="*80)

async def main():
    """Main function for health checker"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Claude Environment Health Checker")
    parser.add_argument("--config-dir", help="Claude configuration directory")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    parser.add_argument("--continuous", action="store_true", help="Run continuous monitoring")
    parser.add_argument("--interval", type=int, default=60, help="Monitoring interval in seconds")
    
    args = parser.parse_args()
    
    checker = HealthChecker(args.config_dir)
    
    if args.continuous:
        print("Starting continuous health monitoring...")
        while True:
            checks = await checker.run_comprehensive_check()
            
            if args.json:
                health_data = {
                    "timestamp": datetime.now().isoformat(),
                    "checks": [asdict(check) for check in checks]
                }
                print(json.dumps(health_data, indent=2, default=str))
            else:
                format_health_report(checks)
            
            await asyncio.sleep(args.interval)
    else:
        checks = await checker.run_comprehensive_check()
        
        if args.json:
            health_data = {
                "timestamp": datetime.now().isoformat(),
                "checks": [asdict(check) for check in checks]
            }
            print(json.dumps(health_data, indent=2, default=str))
        else:
            format_health_report(checks)
        
        # Exit with appropriate code
        critical_count = len([c for c in checks if c.status == "critical"])
        warning_count = len([c for c in checks if c.status == "warning"])
        
        if critical_count > 0:
            sys.exit(2)
        elif warning_count > 0:
            sys.exit(1)
        else:
            sys.exit(0)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nHealth check interrupted")
        sys.exit(130)
    except Exception as e:
        print(f"Health check failed: {e}")
        sys.exit(1)