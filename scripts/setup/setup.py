#!/usr/bin/env python3
"""
Setup script for Claude Environment CLI
Installs the CLI tool as a system-wide command
"""

from setuptools import setup, find_packages
import sys
import os

# Add the parent directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Read requirements
with open(os.path.join(os.path.dirname(__file__), 'requirements.txt'), 'r') as f:
    requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]

# Read version from CLI tool
version = "2.0.0"

setup(
    name="claude-env",
    version=version,
    description="Claude Environment Management CLI Tool",
    long_description="""
    Comprehensive configuration synchronization and management for Claude Code + SuperClaude + MCP.
    
    Features:
    - Interactive environment management
    - Configuration drift detection
    - Automated synchronization
    - Backup and restore capabilities
    - Rich UI with progress indicators
    - MCP server orchestration
    - Team configuration management
    """,
    author="Claude Code Team",
    author_email="team@claude-code.com",
    url="https://github.com/claude-code/claude-dev-env",
    packages=find_packages(),
    py_modules=['claude_env'],
    install_requires=requirements,
    entry_points={
        'console_scripts': [
            'claude-env=claude_env:main',
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Tools",
        "Topic :: System :: Systems Administration",
    ],
    python_requires=">=3.9",
    include_package_data=True,
    zip_safe=False,
)