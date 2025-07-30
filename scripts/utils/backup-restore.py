#!/usr/bin/env python3
"""
Backup and Restore Utility for Claude Environment
Comprehensive backup, restore, and disaster recovery functionality
"""

import os
import sys
import json
import shutil
import tarfile
import gzip
import hashlib
import time
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import logging

# Rich imports for beautiful output
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskID
    from rich.prompt import Confirm
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def rprint(*args, **kwargs):
        print(*args, **kwargs)

console = Console() if RICH_AVAILABLE else None

@dataclass
class BackupMetadata:
    backup_id: str
    timestamp: datetime
    environment: str
    description: str
    backup_type: str  # full, incremental, configuration_only
    size_bytes: int
    checksum: str
    files_count: int
    created_by: str
    version: str = "2.0.0"
    
    def to_dict(self) -> Dict:
        return asdict(self)

@dataclass 
class RestoreResult:
    success: bool
    message: str
    files_restored: int = 0
    errors: List[str] = None
    duration: float = 0.0
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []

class BackupRestoreManager:
    """Comprehensive backup and restore manager for Claude Environment"""
    
    def __init__(self, config_dir: str = None, backup_dir: str = None):
        self.config_dir = Path(config_dir or Path.home() / ".claude")
        self.backup_dir = Path(backup_dir or self.config_dir / "backups")
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger = self._setup_logging()
        self.user = os.getenv("USER", "unknown")
        
        # Backup patterns
        self.include_patterns = [
            "**/*.yml",
            "**/*.yaml", 
            "**/*.json",
            "**/*.toml",
            "**/*.env",
            "**/config/**",
            "**/environments/**",
            "**/teams/**"
        ]
        
        self.exclude_patterns = [
            "**/logs/**",
            "**/cache/**",
            "**/tmp/**",
            "**/__pycache__/**",
            "**/*.pyc",
            "**/*.log",
            "**/node_modules/**"
        ]
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        log_dir = self.config_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        
        logger = logging.getLogger('backup_restore')
        logger.setLevel(logging.INFO)
        
        # File handler
        file_handler = logging.FileHandler(log_dir / "backup-restore.log")
        file_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        logger.addHandler(file_handler)
        
        return logger
    
    def create_backup(self, environment: str = "all", description: str = "manual", 
                     backup_type: str = "full", compress: bool = True) -> str:
        """Create a comprehensive backup"""
        start_time = time.time()
        backup_id = self._generate_backup_id(environment, backup_type)
        backup_path = self.backup_dir / backup_id
        
        self.logger.info(f"Starting backup: {backup_id}")
        
        try:
            if RICH_AVAILABLE and console:
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                    console=console
                ) as progress:
                    # Phase 1: Initialize
                    init_task = progress.add_task("[cyan]Initializing backup...", total=100)
                    backup_path.mkdir(parents=True, exist_ok=True)
                    progress.update(init_task, completed=100)
                    
                    # Phase 2: Collect files
                    collect_task = progress.add_task("[cyan]Collecting files...", total=100)
                    files_to_backup = self._collect_files_for_backup(environment, backup_type)
                    progress.update(collect_task, completed=100)
                    
                    # Phase 3: Create backup
                    backup_task = progress.add_task("[cyan]Creating backup archive...", total=len(files_to_backup))
                    
                    archive_path = backup_path / f"{backup_id}.tar.gz"
                    files_count = self._create_backup_archive(
                        files_to_backup, archive_path, compress, progress, backup_task
                    )
                    
                    # Phase 4: Create metadata
                    metadata_task = progress.add_task("[cyan]Creating metadata...", total=100)
                    checksum = self._calculate_checksum(archive_path)
                    size_bytes = archive_path.stat().st_size
                    
                    metadata = BackupMetadata(
                        backup_id=backup_id,
                        timestamp=datetime.now(),
                        environment=environment,
                        description=description,
                        backup_type=backup_type,
                        size_bytes=size_bytes,
                        checksum=checksum,
                        files_count=files_count,
                        created_by=self.user
                    )
                    
                    self._save_metadata(backup_path, metadata)
                    progress.update(metadata_task, completed=100)
            
            else:
                # Non-rich fallback
                print(f"Creating backup: {backup_id}")
                backup_path.mkdir(parents=True, exist_ok=True)
                
                print("Collecting files...")
                files_to_backup = self._collect_files_for_backup(environment, backup_type)
                
                print("Creating backup archive...")
                archive_path = backup_path / f"{backup_id}.tar.gz"
                files_count = self._create_backup_archive(files_to_backup, archive_path, compress)
                
                print("Creating metadata...")
                checksum = self._calculate_checksum(archive_path)
                size_bytes = archive_path.stat().st_size
                
                metadata = BackupMetadata(
                    backup_id=backup_id,
                    timestamp=datetime.now(),
                    environment=environment,
                    description=description,
                    backup_type=backup_type,
                    size_bytes=size_bytes,
                    checksum=checksum,
                    files_count=files_count,
                    created_by=self.user
                )
                
                self._save_metadata(backup_path, metadata)
            
            duration = time.time() - start_time
            self.logger.info(f"Backup completed successfully: {backup_id} ({duration:.2f}s)")
            
            if RICH_AVAILABLE and console:
                success_panel = Panel(
                    f"✅ Backup ID: {backup_id}\n"
                    f"📁 Path: {backup_path}\n"
                    f"📦 Size: {self._format_size(size_bytes)}\n"
                    f"📄 Files: {files_count}\n"
                    f"⏱️  Duration: {duration:.2f}s\n"
                    f"🔍 Checksum: {checksum[:16]}...",
                    title="🚀 Backup Complete",
                    border_style="green"
                )
                console.print(success_panel)
            else:
                print(f"✅ Backup completed successfully: {backup_id}")
                print(f"   Path: {backup_path}")
                print(f"   Size: {self._format_size(size_bytes)}")
                print(f"   Files: {files_count}")
            
            return backup_id
            
        except Exception as e:
            self.logger.error(f"Backup failed: {e}")
            if backup_path.exists():
                shutil.rmtree(backup_path)
            raise
    
    def _generate_backup_id(self, environment: str, backup_type: str) -> str:
        """Generate unique backup ID"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{environment}_{backup_type}_{timestamp}"
    
    def _collect_files_for_backup(self, environment: str, backup_type: str) -> List[Path]:
        """Collect files for backup based on type and environment"""
        files_to_backup = []
        
        if backup_type == "configuration_only":
            # Only configuration files
            config_files = [
                self.config_dir / "config.yml",
                self.config_dir / "mcp.json"
            ]
            
            for config_file in config_files:
                if config_file.exists():
                    files_to_backup.append(config_file)
            
            # Environment-specific configs
            if environment != "all":
                env_dir = self.config_dir / "environments" / environment
                if env_dir.exists():
                    files_to_backup.extend(env_dir.rglob("*.yml"))
                    files_to_backup.extend(env_dir.rglob("*.yaml"))
                    files_to_backup.extend(env_dir.rglob("*.json"))
            else:
                envs_dir = self.config_dir / "environments"
                if envs_dir.exists():
                    files_to_backup.extend(envs_dir.rglob("*.yml"))
                    files_to_backup.extend(envs_dir.rglob("*.yaml"))
                    files_to_backup.extend(envs_dir.rglob("*.json"))
        
        else:
            # Full or incremental backup
            base_dirs = [self.config_dir]
            
            for base_dir in base_dirs:
                if base_dir.exists():
                    for pattern in self.include_patterns:
                        files_to_backup.extend(base_dir.glob(pattern))
            
            # Filter out excluded patterns
            filtered_files = []
            for file_path in files_to_backup:
                include_file = True
                for exclude_pattern in self.exclude_patterns:
                    if file_path.match(exclude_pattern):
                        include_file = False
                        break
                
                if include_file and file_path.is_file():
                    filtered_files.append(file_path)
            
            files_to_backup = filtered_files
        
        return list(set(files_to_backup))  # Remove duplicates
    
    def _create_backup_archive(self, files: List[Path], archive_path: Path, 
                             compress: bool = True, progress: Progress = None, 
                             task_id: TaskID = None) -> int:
        """Create backup archive from file list"""
        mode = "w:gz" if compress else "w"
        files_count = 0
        
        with tarfile.open(archive_path, mode) as tar:
            for i, file_path in enumerate(files):
                try:
                    # Calculate relative path from config dir
                    if file_path.is_relative_to(self.config_dir):
                        arcname = file_path.relative_to(self.config_dir)
                    else:
                        arcname = file_path.name
                    
                    tar.add(file_path, arcname=str(arcname))
                    files_count += 1
                    
                    if progress and task_id:
                        progress.update(task_id, advance=1, 
                                      description=f"[cyan]Archiving: {file_path.name[:30]}...")
                
                except Exception as e:
                    self.logger.warning(f"Failed to add file to archive: {file_path}: {e}")
        
        return files_count
    
    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA256 checksum of file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()
    
    def _save_metadata(self, backup_path: Path, metadata: BackupMetadata):
        """Save backup metadata"""
        metadata_file = backup_path / "metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata.to_dict(), f, indent=2, default=str)
        
        # Also save human-readable info
        info_file = backup_path / "backup-info.txt"
        with open(info_file, 'w') as f:
            f.write(f"Claude Environment Backup\n")
            f.write(f"========================\n\n")
            f.write(f"Backup ID: {metadata.backup_id}\n")
            f.write(f"Created: {metadata.timestamp}\n")
            f.write(f"Environment: {metadata.environment}\n")
            f.write(f"Type: {metadata.backup_type}\n")
            f.write(f"Description: {metadata.description}\n")
            f.write(f"Files: {metadata.files_count}\n")
            f.write(f"Size: {self._format_size(metadata.size_bytes)}\n")
            f.write(f"Checksum: {metadata.checksum}\n")
            f.write(f"Created by: {metadata.created_by}\n")
            f.write(f"Version: {metadata.version}\n")
    
    def list_backups(self, environment: str = None) -> List[BackupMetadata]:
        """List available backups"""
        backups = []
        
        for backup_dir in self.backup_dir.iterdir():
            if backup_dir.is_dir():
                metadata_file = backup_dir / "metadata.json"
                if metadata_file.exists():
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata_dict = json.load(f)
                        
                        # Convert timestamp string back to datetime
                        if isinstance(metadata_dict.get('timestamp'), str):
                            metadata_dict['timestamp'] = datetime.fromisoformat(
                                metadata_dict['timestamp'].replace('Z', '+00:00')
                            )
                        
                        metadata = BackupMetadata(**metadata_dict)
                        
                        if environment is None or metadata.environment == environment:
                            backups.append(metadata)
                    
                    except Exception as e:
                        self.logger.warning(f"Failed to read backup metadata: {backup_dir}: {e}")
        
        return sorted(backups, key=lambda x: x.timestamp, reverse=True)
    
    def restore_backup(self, backup_id: str, target_dir: Path = None, 
                      verify_checksum: bool = True, force: bool = False) -> RestoreResult:
        """Restore from backup"""
        start_time = time.time()
        
        backup_path = self.backup_dir / backup_id
        if not backup_path.exists():
            return RestoreResult(
                success=False,
                message=f"Backup not found: {backup_id}"
            )
        
        # Load metadata
        metadata_file = backup_path / "metadata.json"
        if not metadata_file.exists():
            return RestoreResult(
                success=False,
                message=f"Backup metadata not found: {backup_id}"
            )
        
        try:
            with open(metadata_file, 'r') as f:
                metadata_dict = json.load(f)
            
            if isinstance(metadata_dict.get('timestamp'), str):
                metadata_dict['timestamp'] = datetime.fromisoformat(
                    metadata_dict['timestamp'].replace('Z', '+00:00')
                )
            
            metadata = BackupMetadata(**metadata_dict)
        
        except Exception as e:
            return RestoreResult(
                success=False,
                message=f"Failed to read backup metadata: {e}"
            )
        
        archive_path = backup_path / f"{backup_id}.tar.gz"
        if not archive_path.exists():
            return RestoreResult(
                success=False,
                message=f"Backup archive not found: {archive_path}"
            )
        
        # Verify checksum if requested
        if verify_checksum:
            current_checksum = self._calculate_checksum(archive_path)
            if current_checksum != metadata.checksum:
                return RestoreResult(
                    success=False,
                    message=f"Backup checksum verification failed. Archive may be corrupted."
                )
        
        # Confirm restore if not forced
        if not force:
            target_path = target_dir or self.config_dir
            if RICH_AVAILABLE and console:
                confirmed = Confirm.ask(
                    f"Restore backup '{backup_id}' to '{target_path}'?\n"
                    f"This will overwrite existing files.", 
                    default=False
                )
            else:
                response = input(
                    f"Restore backup '{backup_id}' to '{target_path}'?\n"
                    f"This will overwrite existing files. (y/N): "
                ).strip().lower()
                confirmed = response in ['y', 'yes']
            
            if not confirmed:
                return RestoreResult(
                    success=False,
                    message="Restore cancelled by user"
                )
        
        # Perform restore
        try:
            target_path = target_dir or self.config_dir
            files_restored = 0
            errors = []
            
            if RICH_AVAILABLE and console:
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                    console=console
                ) as progress:
                    restore_task = progress.add_task(
                        f"[cyan]Restoring backup {backup_id}...", 
                        total=metadata.files_count
                    )
                    
                    with tarfile.open(archive_path, "r:gz") as tar:
                        for member in tar.getmembers():
                            try:
                                tar.extract(member, target_path)
                                files_restored += 1
                                progress.update(restore_task, advance=1, 
                                              description=f"[cyan]Restoring: {member.name[:30]}...")
                            except Exception as e:
                                errors.append(f"Failed to restore {member.name}: {e}")
                                self.logger.warning(f"Failed to restore {member.name}: {e}")
            
            else:
                print(f"Restoring backup: {backup_id}")
                with tarfile.open(archive_path, "r:gz") as tar:
                    for member in tar.getmembers():
                        try:
                            tar.extract(member, target_path)
                            files_restored += 1
                        except Exception as e:
                            errors.append(f"Failed to restore {member.name}: {e}")
                            self.logger.warning(f"Failed to restore {member.name}: {e}")
            
            duration = time.time() - start_time
            
            if errors:
                self.logger.warning(f"Restore completed with {len(errors)} errors")
            else:
                self.logger.info(f"Restore completed successfully: {files_restored} files restored")
            
            # Show results
            if RICH_AVAILABLE and console:
                status = "warning" if errors else "success"
                result_panel = Panel(
                    f"{'⚠️' if errors else '✅'} Files Restored: {files_restored}\n"
                    f"⏱️  Duration: {duration:.2f}s\n"
                    f"{'🚨 Errors: ' + str(len(errors)) if errors else '✨ No errors'}\n"
                    f"📁 Target: {target_path}",
                    title="🔄 Restore Complete",
                    border_style="yellow" if errors else "green"
                )
                console.print(result_panel)
                
                if errors and len(errors) <= 10:
                    error_panel = Panel(
                        "\n".join(errors[:10]),
                        title="❌ Errors",
                        border_style="red"
                    )
                    console.print(error_panel)
            else:
                print(f"✅ Restore completed: {files_restored} files restored")
                if errors:
                    print(f"⚠️  {len(errors)} errors occurred")
                    for error in errors[:5]:  # Show first 5 errors
                        print(f"   - {error}")
            
            return RestoreResult(
                success=True,
                message=f"Restored {files_restored} files" + (f" with {len(errors)} errors" if errors else ""),
                files_restored=files_restored,
                errors=errors,
                duration=duration
            )
        
        except Exception as e:
            self.logger.error(f"Restore failed: {e}")
            return RestoreResult(
                success=False,
                message=f"Restore failed: {e}",
                duration=time.time() - start_time
            )
    
    def cleanup_old_backups(self, retention_days: int = 30, keep_minimum: int = 5) -> int:
        """Clean up old backups based on retention policy"""
        backups = self.list_backups()
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        
        # Find backups to delete
        backups_to_delete = []
        for backup in backups[keep_minimum:]:  # Always keep minimum number
            if backup.timestamp < cutoff_date:
                backups_to_delete.append(backup)
        
        deleted_count = 0
        for backup in backups_to_delete:
            backup_path = self.backup_dir / backup.backup_id
            try:
                shutil.rmtree(backup_path)
                deleted_count += 1
                self.logger.info(f"Deleted old backup: {backup.backup_id}")
            except Exception as e:
                self.logger.error(f"Failed to delete backup {backup.backup_id}: {e}")
        
        return deleted_count
    
    def verify_backup(self, backup_id: str) -> Tuple[bool, str]:
        """Verify backup integrity"""
        backup_path = self.backup_dir / backup_id
        if not backup_path.exists():
            return False, f"Backup not found: {backup_id}"
        
        # Load metadata
        metadata_file = backup_path / "metadata.json"
        if not metadata_file.exists():
            return False, f"Backup metadata not found"
        
        try:
            with open(metadata_file, 'r') as f:
                metadata_dict = json.load(f)
            
            metadata = BackupMetadata(**metadata_dict)
        except Exception as e:
            return False, f"Failed to read metadata: {e}"
        
        # Check archive exists
        archive_path = backup_path / f"{backup_id}.tar.gz"
        if not archive_path.exists():
            return False, f"Archive file not found"
        
        # Verify checksum
        current_checksum = self._calculate_checksum(archive_path)
        if current_checksum != metadata.checksum:
            return False, f"Checksum mismatch: expected {metadata.checksum}, got {current_checksum}"
        
        # Verify archive can be opened
        try:
            with tarfile.open(archive_path, "r:gz") as tar:
                # Just check if we can list the contents
                members = tar.getmembers()
                if len(members) != metadata.files_count:
                    return False, f"File count mismatch: expected {metadata.files_count}, got {len(members)}"
        except Exception as e:
            return False, f"Archive corrupted: {e}"
        
        return True, "Backup verification successful"
    
    def _format_size(self, bytes_size: int) -> str:
        """Format file size in human readable format"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_size < 1024.0:
                return f"{bytes_size:.1f} {unit}"
            bytes_size /= 1024.0
        return f"{bytes_size:.1f} TB"

def format_backup_list(backups: List[BackupMetadata]) -> None:
    """Format and display backup list"""
    if not backups:
        if RICH_AVAILABLE and console:
            console.print("[yellow]No backups found[/yellow]")
        else:
            print("No backups found")
        return
    
    if RICH_AVAILABLE and console:
        table = Table(title="📦 Available Backups", show_header=True, header_style="bold magenta")
        table.add_column("Backup ID", style="cyan", width=30)
        table.add_column("Environment", width=12)
        table.add_column("Type", width=12)
        table.add_column("Created", width=20)
        table.add_column("Size", justify="right", width=10)
        table.add_column("Files", justify="right", width=8)
        table.add_column("Description", style="dim", width=25)
        
        for backup in backups:
            table.add_row(
                backup.backup_id,
                backup.environment,
                backup.backup_type,
                backup.timestamp.strftime("%Y-%m-%d %H:%M"),
                f"{backup.size_bytes / 1024 / 1024:.1f} MB",
                str(backup.files_count),
                backup.description[:25] + "..." if len(backup.description) > 25 else backup.description
            )
        
        console.print(table)
    else:
        print("\nAvailable Backups:")
        print("-" * 100)
        print(f"{'Backup ID':<30} {'Environment':<12} {'Type':<12} {'Created':<20} {'Size':<10} {'Files':<8} {'Description'}")
        print("-" * 100)
        
        for backup in backups:
            print(f"{backup.backup_id:<30} {backup.environment:<12} {backup.backup_type:<12} "
                  f"{backup.timestamp.strftime('%Y-%m-%d %H:%M'):<20} "
                  f"{backup.size_bytes / 1024 / 1024:.1f} MB":<10} {backup.files_count:<8} "
                  f"{backup.description[:30]}")

def main():
    """Main function for backup and restore utility"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Claude Environment Backup and Restore Utility")
    parser.add_argument("--config-dir", help="Claude configuration directory")
    parser.add_argument("--backup-dir", help="Backup storage directory")
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Create backup command
    create_parser = subparsers.add_parser('create', help='Create a new backup')
    create_parser.add_argument('--environment', '-e', default='all', help='Environment to backup')
    create_parser.add_argument('--description', '-d', default='manual', help='Backup description')
    create_parser.add_argument('--type', '-t', choices=['full', 'incremental', 'configuration_only'], 
                             default='full', help='Backup type')
    create_parser.add_argument('--no-compress', action='store_true', help='Disable compression')
    
    # List backups command
    list_parser = subparsers.add_parser('list', help='List available backups')
    list_parser.add_argument('--environment', '-e', help='Filter by environment')
    list_parser.add_argument('--json', action='store_true', help='Output in JSON format')
    
    # Restore backup command
    restore_parser = subparsers.add_parser('restore', help='Restore from backup')
    restore_parser.add_argument('backup_id', help='Backup ID to restore')
    restore_parser.add_argument('--target-dir', help='Target directory for restore')
    restore_parser.add_argument('--no-verify', action='store_true', help='Skip checksum verification')
    restore_parser.add_argument('--force', action='store_true', help='Force restore without confirmation')
    
    # Verify backup command
    verify_parser = subparsers.add_parser('verify', help='Verify backup integrity')
    verify_parser.add_argument('backup_id', help='Backup ID to verify')
    
    # Cleanup command
    cleanup_parser = subparsers.add_parser('cleanup', help='Clean up old backups')
    cleanup_parser.add_argument('--retention-days', type=int, default=30, help='Retention period in days')
    cleanup_parser.add_argument('--keep-minimum', type=int, default=5, help='Minimum backups to keep')
    cleanup_parser.add_argument('--dry-run', action='store_true', help='Show what would be deleted')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    manager = BackupRestoreManager(args.config_dir, args.backup_dir)
    
    try:
        if args.command == 'create':
            backup_id = manager.create_backup(
                environment=args.environment,
                description=args.description,
                backup_type=args.type,
                compress=not args.no_compress
            )
            return 0
        
        elif args.command == 'list':
            backups = manager.list_backups(args.environment)
            
            if args.json:
                backup_data = [backup.to_dict() for backup in backups]
                print(json.dumps(backup_data, indent=2, default=str))
            else:
                format_backup_list(backups)
            return 0
        
        elif args.command == 'restore':
            result = manager.restore_backup(
                backup_id=args.backup_id,
                target_dir=Path(args.target_dir) if args.target_dir else None,
                verify_checksum=not args.no_verify,
                force=args.force
            )
            
            if not result.success:
                print(f"❌ Restore failed: {result.message}")
                return 1
            
            return 0
        
        elif args.command == 'verify':
            is_valid, message = manager.verify_backup(args.backup_id)
            
            if is_valid:
                if RICH_AVAILABLE and console:
                    console.print(f"[green]✅ {message}[/green]")
                else:
                    print(f"✅ {message}")
                return 0
            else:
                if RICH_AVAILABLE and console:
                    console.print(f"[red]❌ {message}[/red]")
                else:
                    print(f"❌ {message}")
                return 1
        
        elif args.command == 'cleanup':
            if args.dry_run:
                # Show what would be deleted
                backups = manager.list_backups()
                cutoff_date = datetime.now() - timedelta(days=args.retention_days)
                
                would_delete = []
                for backup in backups[args.keep_minimum:]:
                    if backup.timestamp < cutoff_date:
                        would_delete.append(backup)
                
                if would_delete:
                    print(f"Would delete {len(would_delete)} old backups:")
                    for backup in would_delete:
                        print(f"  - {backup.backup_id} ({backup.timestamp.strftime('%Y-%m-%d %H:%M')})")
                else:
                    print("No backups would be deleted")
                return 0
            else:
                deleted_count = manager.cleanup_old_backups(args.retention_days, args.keep_minimum)
                print(f"✅ Deleted {deleted_count} old backups")
                return 0
        
        else:
            print(f"Unknown command: {args.command}")
            return 1
    
    except KeyboardInterrupt:
        print("\nOperation cancelled")
        return 130
    except Exception as e:
        print(f"❌ Operation failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())