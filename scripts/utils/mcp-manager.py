#!/usr/bin/env python3
"""
MCP Server Management Utility for Claude Environment
Comprehensive MCP server deployment, monitoring, and lifecycle management
"""

import json
import sys
import subprocess
import time
import asyncio
import signal
import socket
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
import logging
import threading
import psutil

# Rich imports for beautiful output
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
    from rich.live import Live
    from rich.status import Status
    from rich.prompt import Confirm, Prompt
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def rprint(*args, **kwargs):
        print(*args, **kwargs)

console = Console() if RICH_AVAILABLE else None

@dataclass
class MCPServerStatus:
    name: str
    status: str  # running, stopped, error, unknown
    pid: Optional[int]
    port: Optional[int]
    command: List[str]
    start_time: Optional[datetime]
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    last_health_check: Optional[datetime] = None
    error_count: int = 0
    restart_count: int = 0

@dataclass
class MCPServerConfig:
    name: str
    command: List[str]
    args: List[str] = None
    env: Dict[str, str] = None
    auto_start: bool = True
    auto_restart: bool = True
    health_check_url: Optional[str] = None
    max_restarts: int = 5
    restart_delay: int = 5

class MCPServerManager:
    """Comprehensive MCP server lifecycle manager"""
    
    def __init__(self, config_dir: str = None):
        self.config_dir = Path(config_dir or Path.home() / ".claude")
        self.runtime_dir = self.config_dir / "runtime" / "mcp"
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger = self._setup_logging()
        self.servers: Dict[str, MCPServerStatus] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
        self.monitoring_enabled = False
        self.monitor_thread = None
        
        # Load configuration
        self.config_file = self.config_dir / "mcp.json"
        self.server_configs = self._load_server_configs()
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        log_dir = self.config_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        
        logger = logging.getLogger('mcp_manager')
        logger.setLevel(logging.INFO)
        
        # File handler
        file_handler = logging.FileHandler(log_dir / "mcp-manager.log")
        file_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        logger.addHandler(file_handler)
        
        return logger
    
    def _load_server_configs(self) -> Dict[str, MCPServerConfig]:
        """Load MCP server configurations"""
        configs = {}
        
        if not self.config_file.exists():
            self.logger.warning("MCP configuration file not found")
            return configs
        
        try:
            with open(self.config_file, 'r') as f:
                mcp_config = json.load(f)
            
            servers = mcp_config.get("mcpServers", {})
            
            for server_name, server_data in servers.items():
                command = server_data.get("command", [])
                if isinstance(command, str):
                    command = [command]
                
                configs[server_name] = MCPServerConfig(
                    name=server_name,
                    command=command,
                    args=server_data.get("args", []),
                    env=server_data.get("env", {}),
                    auto_start=server_data.get("auto_start", True),
                    auto_restart=server_data.get("auto_restart", True),
                    health_check_url=server_data.get("health_check_url"),
                    max_restarts=server_data.get("max_restarts", 5),
                    restart_delay=server_data.get("restart_delay", 5)
                )
        
        except Exception as e:
            self.logger.error(f"Failed to load MCP configuration: {e}")
        
        return configs
    
    def start_server(self, server_name: str, force: bool = False) -> bool:
        """Start an MCP server"""
        if server_name not in self.server_configs:
            self.logger.error(f"Server configuration not found: {server_name}")
            return False
        
        # Check if already running
        if server_name in self.servers and self.servers[server_name].status == "running" and not force:
            self.logger.info(f"Server {server_name} is already running")
            return True
        
        config = self.server_configs[server_name]
        
        try:
            self.logger.info(f"Starting MCP server: {server_name}")
            
            # Prepare command and environment
            full_command = config.command + (config.args or [])
            env = {**os.environ, **(config.env or {})}
            
            # Create log files
            log_dir = self.config_dir / "logs" / "mcp"
            log_dir.mkdir(parents=True, exist_ok=True)
            
            stdout_log = log_dir / f"{server_name}.out.log"
            stderr_log = log_dir / f"{server_name}.err.log"
            
            # Start process
            process = subprocess.Popen(
                full_command,
                stdout=open(stdout_log, 'a'),
                stderr=open(stderr_log, 'a'),
                env=env,
                cwd=self.config_dir,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            # Store process
            self.processes[server_name] = process
            
            # Create server status
            self.servers[server_name] = MCPServerStatus(
                name=server_name,
                status="running",
                pid=process.pid,
                port=self._detect_server_port(server_name),
                command=full_command,
                start_time=datetime.now()
            )
            
            # Wait a moment to ensure it started properly
            time.sleep(1)
            
            if process.poll() is None:
                self.logger.info(f"MCP server {server_name} started successfully (PID: {process.pid})")
                self._save_server_state(server_name)
                return True
            else:
                self.logger.error(f"MCP server {server_name} failed to start")
                self.servers[server_name].status = "error"
                return False
        
        except Exception as e:
            self.logger.error(f"Failed to start MCP server {server_name}: {e}")
            if server_name in self.servers:
                self.servers[server_name].status = "error"
            return False
    
    def stop_server(self, server_name: str, force: bool = False) -> bool:
        """Stop an MCP server"""
        if server_name not in self.servers:
            self.logger.warning(f"Server {server_name} not found in managed servers")
            return True
        
        server = self.servers[server_name]
        
        if server.status != "running":
            self.logger.info(f"Server {server_name} is not running")
            return True
        
        try:
            self.logger.info(f"Stopping MCP server: {server_name}")
            
            process = self.processes.get(server_name)
            if process:
                if force:
                    # Force kill
                    if hasattr(os, 'killpg'):
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                    else:
                        process.kill()
                else:
                    # Graceful shutdown
                    if hasattr(os, 'killpg'):
                        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    else:
                        process.terminate()
                    
                    # Wait for graceful shutdown
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        self.logger.warning(f"Server {server_name} did not shutdown gracefully, force killing")
                        if hasattr(os, 'killpg'):
                            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                        else:
                            process.kill()
                
                del self.processes[server_name]
            
            # Update status
            server.status = "stopped"
            server.pid = None
            
            self.logger.info(f"MCP server {server_name} stopped successfully")
            self._save_server_state(server_name)
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to stop MCP server {server_name}: {e}")
            return False
    
    def restart_server(self, server_name: str) -> bool:
        """Restart an MCP server"""
        self.logger.info(f"Restarting MCP server: {server_name}")
        
        # Increment restart count
        if server_name in self.servers:
            self.servers[server_name].restart_count += 1
        
        # Stop and start
        if self.stop_server(server_name):
            time.sleep(2)  # Brief pause
            return self.start_server(server_name)
        
        return False
    
    def get_server_status(self, server_name: str = None) -> Dict[str, MCPServerStatus]:
        """Get status of MCP servers"""
        self._update_server_metrics()
        
        if server_name:
            return {server_name: self.servers.get(server_name)} if server_name in self.servers else {}
        
        return self.servers.copy()
    
    def _update_server_metrics(self):
        """Update server metrics (CPU, memory, etc.)"""
        for server_name, server in self.servers.items():
            if server.status == "running" and server.pid:
                try:
                    process = psutil.Process(server.pid)
                    server.cpu_percent = process.cpu_percent()
                    server.memory_mb = process.memory_info().rss / 1024 / 1024
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    server.status = "stopped"
                    server.pid = None
    
    def _detect_server_port(self, server_name: str) -> Optional[int]:
        """Try to detect the port a server is running on"""
        # This is a simplified implementation
        # In reality, you'd need server-specific logic
        return None
    
    def _save_server_state(self, server_name: str):
        """Save server state to disk"""
        state_file = self.runtime_dir / f"{server_name}.state"
        server = self.servers.get(server_name)
        
        if server:
            try:
                with open(state_file, 'w') as f:
                    state_data = {
                        "name": server.name,
                        "status": server.status,
                        "pid": server.pid,
                        "start_time": server.start_time.isoformat() if server.start_time else None,
                        "restart_count": server.restart_count,
                        "error_count": server.error_count
                    }
                    json.dump(state_data, f, indent=2)
            except Exception as e:
                self.logger.error(f"Failed to save server state for {server_name}: {e}")
    
    def _load_server_states(self):
        """Load server states from disk"""
        for state_file in self.runtime_dir.glob("*.state"):
            try:
                with open(state_file, 'r') as f:
                    state_data = json.load(f)
                
                server_name = state_data["name"]
                if server_name in self.server_configs:
                    # Check if process is still running
                    pid = state_data.get("pid")
                    status = "stopped"
                    
                    if pid:
                        try:
                            process = psutil.Process(pid)
                            if process.is_running():
                                status = "running"
                                # Re-register the process
                                self.processes[server_name] = subprocess.Popen(
                                    [], 
                                    stdout=subprocess.DEVNULL, 
                                    stderr=subprocess.DEVNULL
                                )
                                self.processes[server_name].pid = pid
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    
                    self.servers[server_name] = MCPServerStatus(
                        name=server_name,
                        status=status,
                        pid=pid if status == "running" else None,
                        port=None,
                        command=self.server_configs[server_name].command,
                        start_time=datetime.fromisoformat(state_data["start_time"]) if state_data.get("start_time") else None,
                        restart_count=state_data.get("restart_count", 0),
                        error_count=state_data.get("error_count", 0)
                    )
            
            except Exception as e:
                self.logger.error(f"Failed to load server state from {state_file}: {e}")
    
    def start_monitoring(self, interval: int = 30):
        """Start monitoring thread for servers"""
        if self.monitoring_enabled:
            return
        
        self.monitoring_enabled = True
        self.monitor_thread = threading.Thread(target=self._monitor_servers, args=(interval,))
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
        
        self.logger.info(f"Started MCP server monitoring (interval: {interval}s)")
    
    def stop_monitoring(self):
        """Stop monitoring thread"""
        self.monitoring_enabled = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        
        self.logger.info("Stopped MCP server monitoring")
    
    def _monitor_servers(self, interval: int):
        """Monitor server health and restart if needed"""
        while self.monitoring_enabled:
            try:
                for server_name, config in self.server_configs.items():
                    if not config.auto_restart:
                        continue
                    
                    server = self.servers.get(server_name)
                    if not server:
                        continue
                    
                    # Check if server should be running but isn't
                    if config.auto_start and server.status != "running":
                        if server.restart_count < config.max_restarts:
                            self.logger.info(f"Auto-restarting failed server: {server_name}")
                            time.sleep(config.restart_delay)
                            self.start_server(server_name)
                    
                    # Health check
                    elif server.status == "running":
                        if not self._health_check_server(server_name):
                            server.error_count += 1
                            if server.error_count >= 3:
                                self.logger.warning(f"Server {server_name} failed health checks, restarting")
                                self.restart_server(server_name)
                                server.error_count = 0
                        else:
                            server.error_count = 0
                            server.last_health_check = datetime.now()
                
                time.sleep(interval)
            
            except Exception as e:
                self.logger.error(f"Error in monitoring thread: {e}")
                time.sleep(interval)
    
    def _health_check_server(self, server_name: str) -> bool:
        """Perform health check on server"""
        server = self.servers.get(server_name)
        if not server or server.status != "running":
            return False
        
        # Check if process is still running
        if server.pid:
            try:
                process = psutil.Process(server.pid)
                if not process.is_running():
                    server.status = "stopped"
                    server.pid = None
                    return False
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                server.status = "stopped"
                server.pid = None
                return False
        
        # Additional health checks could go here
        # (HTTP health endpoints, file checks, etc.)
        
        return True
    
    def start_all_servers(self) -> Dict[str, bool]:
        """Start all configured servers"""
        results = {}
        
        for server_name, config in self.server_configs.items():
            if config.auto_start:
                results[server_name] = self.start_server(server_name)
        
        return results
    
    def stop_all_servers(self, force: bool = False) -> Dict[str, bool]:
        """Stop all running servers"""
        results = {}
        
        for server_name in list(self.servers.keys()):
            results[server_name] = self.stop_server(server_name, force)
        
        return results
    
    def deploy_server(self, server_name: str, server_config: Dict) -> bool:
        """Deploy a new MCP server configuration"""
        try:
            # Update configuration file
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    mcp_config = json.load(f)
            else:
                mcp_config = {"mcpServers": {}}
            
            mcp_config["mcpServers"][server_name] = server_config
            
            with open(self.config_file, 'w') as f:
                json.dump(mcp_config, f, indent=2)
            
            # Reload configurations
            self.server_configs = self._load_server_configs()
            
            self.logger.info(f"Deployed MCP server configuration: {server_name}")
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to deploy server {server_name}: {e}")
            return False

def format_server_status(servers: Dict[str, MCPServerStatus]) -> None:
    """Format and display server status"""
    if not servers:
        if RICH_AVAILABLE and console:
            console.print("[yellow]No MCP servers found[/yellow]")
        else:
            print("No MCP servers found")
        return
    
    if RICH_AVAILABLE and console:
        table = Table(title="🔧 MCP Server Status", show_header=True, header_style="bold magenta")
        table.add_column("Server", style="cyan", width=20)
        table.add_column("Status", width=12)
        table.add_column("PID", justify="right", width=8)
        table.add_column("Uptime", width=15)
        table.add_column("CPU %", justify="right", width=8)
        table.add_column("Memory", justify="right", width=10)
        table.add_column("Restarts", justify="right", width=10)
        
        for server in servers.values():
            status_colors = {
                "running": "green",
                "stopped": "red", 
                "error": "red",
                "unknown": "yellow"
            }
            
            status_icons = {
                "running": "🟢",
                "stopped": "🔴",
                "error": "❌", 
                "unknown": "🟡"
            }
            
            uptime = ""
            if server.status == "running" and server.start_time:
                delta = datetime.now() - server.start_time
                hours, remainder = divmod(delta.total_seconds(), 3600)
                minutes, _ = divmod(remainder, 60)
                uptime = f"{int(hours):02d}:{int(minutes):02d}"
            
            table.add_row(
                server.name,
                f"[{status_colors.get(server.status, 'white')}]{status_icons.get(server.status, '?')} {server.status.title()}[/]",
                str(server.pid) if server.pid else "-",
                uptime,
                f"{server.cpu_percent:.1f}" if server.cpu_percent > 0 else "-",
                f"{server.memory_mb:.1f}MB" if server.memory_mb > 0 else "-",
                str(server.restart_count)
            )
        
        console.print(table)
    else:
        print("\nMCP Server Status:")
        print("-" * 80)
        print(f"{'Server':<20} {'Status':<12} {'PID':<8} {'Uptime':<15} {'CPU %':<8} {'Memory':<10} {'Restarts'}")
        print("-" * 80)
        
        for server in servers.values():
            status_icon = {"running": "🟢", "stopped": "🔴", "error": "❌", "unknown": "🟡"}.get(server.status, "?")
            
            uptime = ""
            if server.status == "running" and server.start_time:
                delta = datetime.now() - server.start_time
                hours, remainder = divmod(delta.total_seconds(), 3600)
                minutes, _ = divmod(remainder, 60)
                uptime = f"{int(hours):02d}:{int(minutes):02d}"
            
            print(f"{server.name:<20} {status_icon} {server.status:<10} {str(server.pid) if server.pid else '-':<8} "
                  f"{uptime:<15} {server.cpu_percent:.1f}%":<8} {server.memory_mb:.1f}MB":<10} {server.restart_count}")

def main():
    """Main function for MCP server manager"""
    import argparse
    import os
    
    parser = argparse.ArgumentParser(description="Claude Environment MCP Server Manager")
    parser.add_argument("--config-dir", help="Claude configuration directory")
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Start server command
    start_parser = subparsers.add_parser('start', help='Start MCP server(s)')
    start_parser.add_argument('server', nargs='?', help='Server name (or "all")')
    start_parser.add_argument('--force', action='store_true', help='Force restart if already running')
    
    # Stop server command
    stop_parser = subparsers.add_parser('stop', help='Stop MCP server(s)')
    stop_parser.add_argument('server', nargs='?', help='Server name (or "all")')
    stop_parser.add_argument('--force', action='store_true', help='Force kill servers')
    
    # Restart server command
    restart_parser = subparsers.add_parser('restart', help='Restart MCP server(s)')
    restart_parser.add_argument('server', nargs='?', help='Server name (or "all")')
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Show server status')
    status_parser.add_argument('server', nargs='?', help='Specific server name')
    status_parser.add_argument('--json', action='store_true', help='Output in JSON format')
    status_parser.add_argument('--watch', action='store_true', help='Watch mode (continuous updates)')
    
    # Deploy server command
    deploy_parser = subparsers.add_parser('deploy', help='Deploy new server configuration')
    deploy_parser.add_argument('server_name', help='Server name')
    deploy_parser.add_argument('--config', help='Server configuration JSON file')
    deploy_parser.add_argument('--command', nargs='+', help='Server command')
    
    # Monitor command
    monitor_parser = subparsers.add_parser('monitor', help='Start monitoring mode')
    monitor_parser.add_argument('--interval', type=int, default=30, help='Monitoring interval in seconds')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    manager = MCPServerManager(args.config_dir)
    manager._load_server_states()
    
    try:
        if args.command == 'start':
            if not args.server or args.server == 'all':
                results = manager.start_all_servers()
                success_count = sum(1 for r in results.values() if r)
                if RICH_AVAILABLE and console:
                    console.print(f"[green]Started {success_count}/{len(results)} servers[/green]")
                else:
                    print(f"Started {success_count}/{len(results)} servers")
            else:
                if manager.start_server(args.server, args.force):
                    if RICH_AVAILABLE and console:
                        console.print(f"[green]✅ Server {args.server} started[/green]")
                    else:
                        print(f"✅ Server {args.server} started")
                    return 0
                else:
                    if RICH_AVAILABLE and console:
                        console.print(f"[red]❌ Failed to start server {args.server}[/red]")
                    else:
                        print(f"❌ Failed to start server {args.server}")
                    return 1
        
        elif args.command == 'stop':
            if not args.server or args.server == 'all':
                results = manager.stop_all_servers(args.force)
                success_count = sum(1 for r in results.values() if r)
                if RICH_AVAILABLE and console:
                    console.print(f"[yellow]Stopped {success_count}/{len(results)} servers[/yellow]")
                else:
                    print(f"Stopped {success_count}/{len(results)} servers")
            else:
                if manager.stop_server(args.server, args.force):
                    if RICH_AVAILABLE and console:
                        console.print(f"[yellow]🛑 Server {args.server} stopped[/yellow]")
                    else:
                        print(f"🛑 Server {args.server} stopped")
                    return 0
                else:
                    if RICH_AVAILABLE and console:
                        console.print(f"[red]❌ Failed to stop server {args.server}[/red]")
                    else:
                        print(f"❌ Failed to stop server {args.server}")
                    return 1
        
        elif args.command == 'restart':
            if not args.server or args.server == 'all':
                # Restart all servers
                stop_results = manager.stop_all_servers()
                time.sleep(2)
                start_results = manager.start_all_servers()
                success_count = sum(1 for r in start_results.values() if r)
                if RICH_AVAILABLE and console:
                    console.print(f"[blue]Restarted {success_count}/{len(start_results)} servers[/blue]")
                else:
                    print(f"Restarted {success_count}/{len(start_results)} servers")
            else:
                if manager.restart_server(args.server):
                    if RICH_AVAILABLE and console:
                        console.print(f"[blue]🔄 Server {args.server} restarted[/blue]")
                    else:
                        print(f"🔄 Server {args.server} restarted")
                    return 0
                else:
                    if RICH_AVAILABLE and console:
                        console.print(f"[red]❌ Failed to restart server {args.server}[/red]")
                    else:
                        print(f"❌ Failed to restart server {args.server}")
                    return 1
        
        elif args.command == 'status':
            if args.watch:
                # Watch mode
                try:
                    while True:
                        if RICH_AVAILABLE and console:
                            console.clear()
                        servers = manager.get_server_status(args.server)
                        format_server_status(servers)
                        time.sleep(2)
                except KeyboardInterrupt:
                    return 0
            else:
                servers = manager.get_server_status(args.server)
                
                if args.json:
                    server_data = {}
                    for name, server in servers.items():
                        server_data[name] = {
                            "status": server.status,
                            "pid": server.pid,
                            "start_time": server.start_time.isoformat() if server.start_time else None,
                            "cpu_percent": server.cpu_percent,
                            "memory_mb": server.memory_mb,
                            "restart_count": server.restart_count,
                            "error_count": server.error_count
                        }
                    print(json.dumps(server_data, indent=2))
                else:
                    format_server_status(servers)
        
        elif args.command == 'deploy':
            if args.config:
                # Load from file
                with open(args.config, 'r') as f:
                    server_config = json.load(f)
            elif args.command:
                # Create from command line
                server_config = {
                    "command": args.command,
                    "auto_start": True,
                    "auto_restart": True
                }
            else:
                if RICH_AVAILABLE and console:
                    console.print("[red]❌ Either --config or --command is required[/red]")
                else:
                    print("❌ Either --config or --command is required")
                return 1
            
            if manager.deploy_server(args.server_name, server_config):
                if RICH_AVAILABLE and console:
                    console.print(f"[green]✅ Server {args.server_name} deployed[/green]")
                else:
                    print(f"✅ Server {args.server_name} deployed")
                return 0
            else:
                if RICH_AVAILABLE and console:
                    console.print(f"[red]❌ Failed to deploy server {args.server_name}[/red]")
                else:
                    print(f"❌ Failed to deploy server {args.server_name}")
                return 1
        
        elif args.command == 'monitor':
            if RICH_AVAILABLE and console:
                console.print(f"[blue]🔍 Starting MCP server monitoring (interval: {args.interval}s)[/blue]")
                console.print("[dim]Press Ctrl+C to stop[/dim]")
            else:
                print(f"🔍 Starting MCP server monitoring (interval: {args.interval}s)")
                print("Press Ctrl+C to stop")
            
            manager.start_monitoring(args.interval)
            
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                manager.stop_monitoring()
                if RICH_AVAILABLE and console:
                    console.print("[yellow]🛑 Monitoring stopped[/yellow]")
                else:
                    print("🛑 Monitoring stopped")
                return 0
        
        else:
            print(f"Unknown command: {args.command}")
            return 1
    
    except KeyboardInterrupt:
        if RICH_AVAILABLE and console:
            console.print("\n[yellow]Operation cancelled[/yellow]")
        else:
            print("\nOperation cancelled")
        return 130
    except Exception as e:
        if RICH_AVAILABLE and console:
            console.print(f"[red]❌ Operation failed: {e}[/red]")
        else:
            print(f"❌ Operation failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())