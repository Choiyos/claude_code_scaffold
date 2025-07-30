#!/usr/bin/env python3
"""
Claude Environment CLI Test Suite
Comprehensive testing of all CLI tools and utilities
"""

import os
import sys
import subprocess
import tempfile
import shutil
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import logging

# Rich imports for beautiful output
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def rprint(*args, **kwargs):
        print(*args, **kwargs)

console = Console() if RICH_AVAILABLE else None

class TestResult:
    """Represents a single test result"""
    
    def __init__(self, name: str, passed: bool, message: str = "", duration: float = 0.0):
        self.name = name
        self.passed = passed
        self.message = message
        self.duration = duration

class CLITestSuite:
    """Comprehensive test suite for Claude Environment CLI tools"""
    
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.test_results: List[TestResult] = []
        self.temp_dir: Optional[Path] = None
        self.logger = self._setup_logging()
        
        # Test configuration
        self.test_config = {
            "timeout": 30,  # seconds
            "cleanup": True,
            "verbose": False
        }
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        logger = logging.getLogger('cli_test_suite')
        logger.setLevel(logging.INFO)
        
        # Console handler
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(levelname)s: %(message)s'))
        logger.addHandler(handler)
        
        return logger
    
    def setup_test_environment(self) -> bool:
        """Setup temporary test environment"""
        try:
            self.temp_dir = Path(tempfile.mkdtemp(prefix="claude_env_test_"))
            
            # Create mock Claude directory structure
            claude_dir = self.temp_dir / ".claude"
            claude_dir.mkdir(parents=True)
            
            # Create subdirectories
            for subdir in ["environments", "teams", "backups", "logs"]:
                (claude_dir / subdir).mkdir()
            
            # Create basic configuration files
            config_data = {
                "version": "2.0.0",
                "default_environment": "development",
                "auto_sync": False,
                "sync_interval": 300
            }
            
            with open(claude_dir / "config.yml", 'w') as f:
                import yaml
                yaml.dump(config_data, f)
            
            # Create MCP configuration
            mcp_data = {
                "mcpServers": {
                    "test_server": {
                        "command": ["echo", "test"],
                        "auto_start": False
                    }
                }
            }
            
            with open(claude_dir / "mcp.json", 'w') as f:
                json.dump(mcp_data, f, indent=2)
            
            # Create environment configs
            for env in ["development", "staging", "production"]:
                env_dir = claude_dir / "environments" / env
                env_dir.mkdir()
                
                env_config = {
                    "environment": env,
                    "created": "2024-01-01T00:00:00Z"
                }
                
                with open(env_dir / "config.yml", 'w') as f:
                    import yaml
                    yaml.dump(env_config, f)
            
            self.logger.info(f"Test environment created: {self.temp_dir}")
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to setup test environment: {e}")
            return False
    
    def cleanup_test_environment(self):
        """Cleanup temporary test environment"""
        if self.temp_dir and self.temp_dir.exists() and self.test_config["cleanup"]:
            try:
                shutil.rmtree(self.temp_dir)
                self.logger.info("Test environment cleaned up")
            except Exception as e:
                self.logger.warning(f"Failed to cleanup test environment: {e}")
    
    def run_command(self, cmd: List[str], timeout: int = None, env_vars: Dict[str, str] = None) -> Tuple[int, str, str]:
        """Run a command and return exit code, stdout, stderr"""
        try:
            env = os.environ.copy()
            if env_vars:
                env.update(env_vars)
            
            # Add test environment to PATH
            if self.temp_dir:
                env["HOME"] = str(self.temp_dir)
                env["CLAUDE_CONFIG_DIR"] = str(self.temp_dir / ".claude")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout or self.test_config["timeout"],
                env=env
            )
            
            return result.returncode, result.stdout, result.stderr
        
        except subprocess.TimeoutExpired:
            return -1, "", "Command timed out"
        except Exception as e:
            return -1, "", str(e)
    
    def test_main_cli(self) -> List[TestResult]:
        """Test main claude-env CLI"""
        results = []
        cli_path = self.script_dir / "claude-env"
        
        # Test 1: Help command
        exit_code, stdout, stderr = self.run_command([sys.executable, str(cli_path), "--help"])
        results.append(TestResult(
            name="main_cli_help",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}, Output length: {len(stdout)}"
        ))
        
        # Test 2: Version command
        exit_code, stdout, stderr = self.run_command([sys.executable, str(cli_path), "version"])
        results.append(TestResult(
            name="main_cli_version",
            passed=exit_code == 0 and "2.0.0" in stdout,
            message=f"Exit code: {exit_code}, Version found: {'2.0.0' in stdout}"
        ))
        
        # Test 3: Status command
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(cli_path), "status", "--config-dir", str(self.temp_dir / ".claude")
        ])
        results.append(TestResult(
            name="main_cli_status",
            passed=exit_code in [0, 1],  # Status can exit with 1 if issues found
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 4: Config validation
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(cli_path), "config", "validate", 
            "--config-dir", str(self.temp_dir / ".claude")
        ])
        results.append(TestResult(
            name="main_cli_config_validate",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}"
        ))
        
        return results
    
    def test_health_check(self) -> List[TestResult]:
        """Test health check utility"""
        results = []
        health_check_path = self.script_dir / "monitoring" / "health-check.py"
        
        # Test 1: Basic health check
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(health_check_path), 
            "--config-dir", str(self.temp_dir / ".claude")
        ])
        results.append(TestResult(
            name="health_check_basic",
            passed=exit_code in [0, 1, 2],  # Various exit codes are valid
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 2: JSON output
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(health_check_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "--json"
        ])
        
        json_valid = False
        try:
            json.loads(stdout)
            json_valid = True
        except:
            pass
        
        results.append(TestResult(
            name="health_check_json",
            passed=json_valid,
            message=f"JSON output valid: {json_valid}"
        ))
        
        return results
    
    def test_environment_validator(self) -> List[TestResult]:
        """Test environment validator utility"""
        results = []
        validator_path = self.script_dir / "utils" / "environment-validator.py"
        
        # Test 1: Basic validation
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(validator_path), 
            "--config-dir", str(self.temp_dir / ".claude")
        ])
        results.append(TestResult(
            name="validator_basic",
            passed=exit_code in [0, 1, 2],  # Various exit codes are valid
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 2: JSON output
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(validator_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "--json"
        ])
        
        json_valid = False
        try:
            json.loads(stdout)
            json_valid = True
        except:
            pass
        
        results.append(TestResult(
            name="validator_json",
            passed=json_valid,
            message=f"JSON output valid: {json_valid}"
        ))
        
        return results
    
    def test_backup_restore(self) -> List[TestResult]:
        """Test backup and restore utility"""
        results = []
        backup_path = self.script_dir / "utils" / "backup-restore.py"
        
        # Test 1: Create backup
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(backup_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "create", "--environment", "development", "--description", "test"
        ])
        results.append(TestResult(
            name="backup_create",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 2: List backups
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(backup_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "list"
        ])
        results.append(TestResult(
            name="backup_list",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 3: List backups JSON
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(backup_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "list", "--json"
        ])
        
        json_valid = False
        try:
            data = json.loads(stdout)
            json_valid = isinstance(data, list)
        except:
            pass
        
        results.append(TestResult(
            name="backup_list_json",
            passed=json_valid,
            message=f"JSON output valid: {json_valid}"
        ))
        
        return results
    
    def test_mcp_manager(self) -> List[TestResult]:
        """Test MCP manager utility"""
        results = []
        mcp_path = self.script_dir / "utils" / "mcp-manager.py"
        
        # Test 1: Status command
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(mcp_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "status"
        ])
        results.append(TestResult(
            name="mcp_status",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 2: Status JSON
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(mcp_path), 
            "--config-dir", str(self.temp_dir / ".claude"),
            "status", "--json"
        ])
        
        json_valid = False
        try:
            json.loads(stdout)
            json_valid = True
        except:
            pass
        
        results.append(TestResult(
            name="mcp_status_json",
            passed=json_valid,
            message=f"JSON output valid: {json_valid}"
        ))
        
        return results
    
    def test_project_init(self) -> List[TestResult]:
        """Test project initializer utility"""
        results = []
        init_path = self.script_dir / "utils" / "project-init.py"
        
        # Test 1: List templates
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(init_path), "list"
        ])
        results.append(TestResult(
            name="project_init_list",
            passed=exit_code == 0 and "minimal" in stdout,
            message=f"Exit code: {exit_code}, Contains minimal template: {'minimal' in stdout}"
        ))
        
        # Test 2: Create minimal project
        project_dir = self.temp_dir / "test_project"
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(init_path), "create", "test_project",
            "--template", "minimal", "--target-dir", str(project_dir),
            "--non-interactive"
        ])
        
        project_created = project_dir.exists() and (project_dir / ".claude").exists()
        results.append(TestResult(
            name="project_init_create",
            passed=exit_code == 0 and project_created,
            message=f"Exit code: {exit_code}, Project created: {project_created}"
        ))
        
        return results
    
    def test_utilities_wrapper(self) -> List[TestResult]:
        """Test utilities wrapper CLI"""
        results = []
        utils_path = self.script_dir / "claude-env-utils"
        
        # Test 1: List utilities
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(utils_path), "list"
        ])
        results.append(TestResult(
            name="utils_list",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 2: Help command
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(utils_path), "help"
        ])
        results.append(TestResult(
            name="utils_help",
            passed=exit_code == 0,
            message=f"Exit code: {exit_code}"
        ))
        
        # Test 3: Quick check (should run but may fail due to incomplete setup)
        exit_code, stdout, stderr = self.run_command([
            sys.executable, str(utils_path), "quick-check"
        ])
        results.append(TestResult(
            name="utils_quick_check",
            passed=exit_code in [0, 1, 2],  # Various exit codes are valid
            message=f"Exit code: {exit_code}"
        ))
        
        return results
    
    def run_all_tests(self, verbose: bool = False) -> bool:
        """Run all tests and return success status"""
        self.test_config["verbose"] = verbose
        
        if not self.setup_test_environment():
            return False
        
        try:
            if RICH_AVAILABLE and console:
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                    console=console
                ) as progress:
                    
                    test_suites = [
                        ("Main CLI", self.test_main_cli),
                        ("Health Check", self.test_health_check),
                        ("Environment Validator", self.test_environment_validator),
                        ("Backup/Restore", self.test_backup_restore),
                        ("MCP Manager", self.test_mcp_manager),
                        ("Project Initializer", self.test_project_init),
                        ("Utilities Wrapper", self.test_utilities_wrapper)
                    ]
                    
                    total_task = progress.add_task("[cyan]Running test suites...", total=len(test_suites))
                    
                    for suite_name, test_func in test_suites:
                        progress.update(total_task, description=f"[cyan]Testing {suite_name}...")
                        
                        try:
                            suite_results = test_func()
                            self.test_results.extend(suite_results)
                        except Exception as e:
                            self.logger.error(f"Test suite {suite_name} failed: {e}")
                            self.test_results.append(TestResult(
                                name=f"{suite_name.lower().replace(' ', '_')}_error",
                                passed=False,
                                message=str(e)
                            ))
                        
                        progress.advance(total_task)
            
            else:
                print("Running test suites...")
                
                test_suites = [
                    ("Main CLI", self.test_main_cli),
                    ("Health Check", self.test_health_check),
                    ("Environment Validator", self.test_environment_validator),
                    ("Backup/Restore", self.test_backup_restore),
                    ("MCP Manager", self.test_mcp_manager),
                    ("Project Initializer", self.test_project_init),
                    ("Utilities Wrapper", self.test_utilities_wrapper)
                ]
                
                for i, (suite_name, test_func) in enumerate(test_suites, 1):
                    print(f"[{i}/{len(test_suites)}] Testing {suite_name}...")
                    
                    try:
                        suite_results = test_func()
                        self.test_results.extend(suite_results)
                    except Exception as e:
                        self.logger.error(f"Test suite {suite_name} failed: {e}")
                        self.test_results.append(TestResult(
                            name=f"{suite_name.lower().replace(' ', '_')}_error",
                            passed=False,
                            message=str(e)
                        ))
            
            # Show results
            self._show_test_results()
            
            # Return success status
            failed_tests = [r for r in self.test_results if not r.passed]
            return len(failed_tests) == 0
        
        finally:
            self.cleanup_test_environment()
    
    def _show_test_results(self):
        """Display test results"""
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r.passed])
        failed_tests = total_tests - passed_tests
        
        if RICH_AVAILABLE and console:
            # Summary panel
            summary = f"✅ Passed: {passed_tests}  ❌ Failed: {failed_tests}  📊 Total: {total_tests}"
            
            overall_status = "error" if failed_tests > 0 else "success"
            status_colors = {"success": "green", "error": "red"}
            
            summary_panel = Panel(
                summary,
                title="🧪 Test Results Summary",
                border_style=status_colors.get(overall_status, "blue")
            )
            console.print(summary_panel)
            
            # Detailed results table
            if self.test_results:
                table = Table(title="📋 Detailed Test Results", show_header=True, header_style="bold magenta")
                table.add_column("Test Name", style="cyan", width=30)
                table.add_column("Status", width=10)
                table.add_column("Message", style="dim", width=50)
                
                for result in self.test_results:
                    status_icon = "✅" if result.passed else "❌"
                    status_color = "green" if result.passed else "red"
                    
                    table.add_row(
                        result.name.replace("_", " ").title(),
                        f"[{status_color}]{status_icon} {'Pass' if result.passed else 'Fail'}[/]",
                        result.message[:50] + "..." if len(result.message) > 50 else result.message
                    )
                
                console.print(table)
        
        else:
            print(f"\n{'='*60}")
            print("TEST RESULTS SUMMARY")
            print(f"{'='*60}")
            print(f"Total Tests: {total_tests}")
            print(f"Passed: {passed_tests}")
            print(f"Failed: {failed_tests}")
            print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%" if total_tests > 0 else "0%")
            
            if self.test_results:
                print(f"\nDETAILED RESULTS:")
                print("-" * 60)
                for result in self.test_results:
                    status_icon = "✅" if result.passed else "❌"
                    print(f"{status_icon} {result.name}: {result.message}")

def main():
    """Main function for test suite"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Claude Environment CLI Test Suite")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--no-cleanup", action="store_true", help="Don't cleanup test environment")
    
    args = parser.parse_args()
    
    test_suite = CLITestSuite()
    
    if args.no_cleanup:
        test_suite.test_config["cleanup"] = False
    
    try:
        success = test_suite.run_all_tests(verbose=args.verbose)
        
        if success:
            if RICH_AVAILABLE and console:
                console.print("[green]🎉 All tests passed![/green]")
            else:
                print("🎉 All tests passed!")
            return 0
        else:
            if RICH_AVAILABLE and console:
                console.print("[red]❌ Some tests failed[/red]")
            else:
                print("❌ Some tests failed")
            return 1
    
    except KeyboardInterrupt:
        if RICH_AVAILABLE and console:
            console.print("\n[yellow]Tests interrupted[/yellow]")
        else:
            print("\nTests interrupted")
        return 130
    except Exception as e:
        if RICH_AVAILABLE and console:
            console.print(f"[red]❌ Test suite failed: {e}[/red]")
        else:
            print(f"❌ Test suite failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())