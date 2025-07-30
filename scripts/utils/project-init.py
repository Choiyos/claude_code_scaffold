#!/usr/bin/env python3
"""
Project Initialization Utility for Claude Environment
Creates new projects with proper Claude environment setup
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
import logging

# Rich imports for beautiful output
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
    from rich.prompt import Prompt, Confirm, IntPrompt
    from rich.table import Table
    from rich import print as rprint
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def rprint(*args, **kwargs):
        print(*args, **kwargs)

console = Console() if RICH_AVAILABLE else None

class ProjectInitializer:
    """Initialize new projects with Claude environment setup"""
    
    def __init__(self, templates_dir: str = None):
        self.script_dir = Path(__file__).parent.parent
        self.templates_dir = Path(templates_dir or self.script_dir / "templates")
        self.logger = self._setup_logging()
        
        # Project templates
        self.templates = {
            "nodejs": {
                "name": "Node.js TypeScript Project",
                "description": "Modern Node.js project with TypeScript, Express, and Claude integration",
                "files": self._get_nodejs_template(),
                "dependencies": ["node", "npm", "docker"],
                "mcp_servers": ["context7", "sequential"]
            },
            "python": {
                "name": "Python FastAPI Project", 
                "description": "Python project with FastAPI, async support, and Claude integration",
                "files": self._get_python_template(),
                "dependencies": ["python3", "pip", "docker"],
                "mcp_servers": ["context7", "sequential", "magic"]
            },
            "react": {
                "name": "React TypeScript App",
                "description": "Modern React app with TypeScript, Tailwind CSS, and Claude integration",
                "files": self._get_react_template(),
                "dependencies": ["node", "npm", "docker"],
                "mcp_servers": ["context7", "magic"]
            },
            "nextjs": {
                "name": "Next.js Full-Stack App",
                "description": "Next.js app with TypeScript, Prisma, and Claude integration",
                "files": self._get_nextjs_template(),
                "dependencies": ["node", "npm", "docker"],
                "mcp_servers": ["context7", "sequential", "magic"]
            },
            "minimal": {
                "name": "Minimal Claude Setup",
                "description": "Basic Claude environment setup without framework specifics",
                "files": self._get_minimal_template(),
                "dependencies": ["docker"],
                "mcp_servers": ["context7"]
            }
        }
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        logger = logging.getLogger('project_init')
        logger.setLevel(logging.INFO)
        
        # Console handler
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(levelname)s: %(message)s'))
        logger.addHandler(handler)
        
        return logger
    
    def create_project(self, project_name: str, template: str, target_dir: Path = None, 
                      interactive: bool = True) -> bool:
        """Create a new project from template"""
        
        if template not in self.templates:
            self.logger.error(f"Unknown template: {template}")
            return False
        
        template_config = self.templates[template]
        project_dir = target_dir or Path.cwd() / project_name
        
        # Check if directory exists
        if project_dir.exists():
            if interactive:
                if RICH_AVAILABLE and console:
                    overwrite = Confirm.ask(f"Directory {project_dir} exists. Overwrite?", default=False)
                else:
                    response = input(f"Directory {project_dir} exists. Overwrite? (y/N): ").strip().lower()
                    overwrite = response in ['y', 'yes']
                
                if not overwrite:
                    self.logger.info("Project creation cancelled")
                    return False
                
                shutil.rmtree(project_dir)
            else:
                self.logger.error(f"Directory {project_dir} already exists")
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
                    # Phase 1: Create directory structure
                    task = progress.add_task(f"[cyan]Creating project structure...", total=100)
                    self._create_project_structure(project_dir, template_config)
                    progress.update(task, completed=100)
                    
                    # Phase 2: Generate files
                    task = progress.add_task(f"[cyan]Generating project files...", total=len(template_config["files"]))
                    self._generate_project_files(project_dir, project_name, template_config, progress, task)
                    
                    # Phase 3: Setup Claude environment
                    task = progress.add_task(f"[cyan]Setting up Claude environment...", total=100)
                    self._setup_claude_environment(project_dir, project_name, template_config)
                    progress.update(task, completed=100)
                    
                    # Phase 4: Install dependencies
                    if interactive:
                        install_deps = Confirm.ask("Install dependencies?", default=True)
                    else:
                        install_deps = True
                    
                    if install_deps:
                        task = progress.add_task(f"[cyan]Installing dependencies...", total=100)
                        self._install_dependencies(project_dir, template_config)
                        progress.update(task, completed=100)
            else:
                print(f"Creating project: {project_name}")
                print("Creating project structure...")
                self._create_project_structure(project_dir, template_config)
                
                print("Generating project files...")
                self._generate_project_files(project_dir, project_name, template_config)
                
                print("Setting up Claude environment...")
                self._setup_claude_environment(project_dir, project_name, template_config)
                
                if interactive:
                    install_deps = input("Install dependencies? (Y/n): ").strip().lower()
                    install_deps = install_deps != 'n'
                else:
                    install_deps = True
                
                if install_deps:
                    print("Installing dependencies...")
                    self._install_dependencies(project_dir, template_config)
            
            # Show completion summary
            self._show_completion_summary(project_name, project_dir, template_config)
            
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to create project: {e}")
            if project_dir.exists():
                shutil.rmtree(project_dir)
            return False
    
    def _create_project_structure(self, project_dir: Path, template_config: Dict):
        """Create the basic project directory structure"""
        project_dir.mkdir(parents=True, exist_ok=True)
        
        # Common directories
        common_dirs = [
            ".claude",
            ".claude/environments",
            ".claude/teams", 
            ".claude/backups",
            ".claude/logs",
            ".vscode",
            "docs",
            "scripts"
        ]
        
        for dir_name in common_dirs:
            (project_dir / dir_name).mkdir(parents=True, exist_ok=True)
    
    def _generate_project_files(self, project_dir: Path, project_name: str, 
                               template_config: Dict, progress=None, task_id=None):
        """Generate project files from template"""
        files = template_config["files"]
        
        for i, (file_path, content) in enumerate(files.items()):
            full_path = project_dir / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Replace template variables
            if isinstance(content, str):
                content = content.replace("{{PROJECT_NAME}}", project_name)
                content = content.replace("{{PROJECT_NAME_KEBAB}}", project_name.lower().replace("_", "-"))
                content = content.replace("{{PROJECT_NAME_SNAKE}}", project_name.lower().replace("-", "_"))
            
            if isinstance(content, str):
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)
            else:
                # Binary content
                with open(full_path, 'wb') as f:
                    f.write(content)
            
            if progress and task_id:
                progress.update(task_id, advance=1, 
                               description=f"[cyan]Generating: {file_path}")
    
    def _setup_claude_environment(self, project_dir: Path, project_name: str, template_config: Dict):
        """Setup Claude environment configuration"""
        claude_dir = project_dir / ".claude"
        
        # Main Claude configuration
        claude_config = {
            "version": "2.0.0",
            "project_name": project_name,
            "default_environment": "development",
            "auto_sync": False,
            "sync_interval": 300,
            "backup_retention": 30,
            "logging": {
                "level": "INFO",
                "file": str(claude_dir / "logs" / "claude-env.log"),
                "max_size": "10MB",
                "max_files": 5
            },
            "ui": {
                "color": True,
                "progress_bars": True,
                "interactive": True
            },
            "integrations": {
                "mcp_servers": {
                    "auto_discovery": True,
                    "health_check_interval": 60
                },
                "vscode": {
                    "auto_configure": True
                },
                "docker": {
                    "auto_detect": True
                }
            }
        }
        
        with open(claude_dir / "config.yml", 'w') as f:
            import yaml
            yaml.dump(claude_config, f, default_flow_style=False, indent=2)
        
        # MCP server configuration
        mcp_config = {
            "mcpServers": {}
        }
        
        for server_name in template_config["mcp_servers"]:
            if server_name == "context7":
                mcp_config["mcpServers"]["context7"] = {
                    "command": "node",
                    "args": ["@anthropic-ai/mcp-server-context7", "--port", "3001"],
                    "auto_start": True,
                    "auto_restart": True
                }
            elif server_name == "sequential":
                mcp_config["mcpServers"]["sequential"] = {
                    "command": "python",
                    "args": ["-m", "mcp_server_sequential", "--port", "3002"],
                    "auto_start": True,
                    "auto_restart": True
                }
            elif server_name == "magic":
                mcp_config["mcpServers"]["magic"] = {
                    "command": "node",
                    "args": ["@anthropic-ai/mcp-server-magic", "--port", "3003"],
                    "auto_start": False,
                    "auto_restart": True
                }
        
        with open(claude_dir / "mcp.json", 'w') as f:
            json.dump(mcp_config, f, indent=2)
        
        # Environment configurations
        for env in ["development", "staging", "production"]:
            env_dir = claude_dir / "environments" / env
            env_dir.mkdir(parents=True, exist_ok=True)
            
            env_config = {
                "environment": env,
                "created": datetime.now().isoformat(),
                "mcp_servers": {},
                "tools": {
                    "node_version": "20",
                    "python_version": "3.11",
                    "docker_compose": True
                },
                "security": {
                    "strict_mode": env == "production",
                    "auto_updates": env == "development"
                }
            }
            
            # Enable appropriate MCP servers for each environment
            for server_name in template_config["mcp_servers"]:
                env_config["mcp_servers"][server_name] = {
                    "enabled": True,
                    "auto_start": env == "development" or server_name != "magic"
                }
            
            with open(env_dir / "config.yml", 'w') as f:
                import yaml
                yaml.dump(env_config, f, default_flow_style=False, indent=2)
    
    def _install_dependencies(self, project_dir: Path, template_config: Dict):
        """Install project dependencies"""
        os.chdir(project_dir)
        
        # Check for package.json (Node.js)
        if (project_dir / "package.json").exists():
            subprocess.run(["npm", "install"], check=True)
        
        # Check for requirements.txt (Python)
        if (project_dir / "requirements.txt").exists():
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
        
        # Check for pyproject.toml (Python)
        if (project_dir / "pyproject.toml").exists():
            subprocess.run([sys.executable, "-m", "pip", "install", "-e", "."], check=True)
    
    def _show_completion_summary(self, project_name: str, project_dir: Path, template_config: Dict):
        """Show project creation completion summary"""
        if RICH_AVAILABLE and console:
            summary_content = f"✅ Project: {project_name}\n"
            summary_content += f"📁 Location: {project_dir}\n"
            summary_content += f"🏗️  Template: {template_config['name']}\n"
            summary_content += f"🔧 MCP Servers: {', '.join(template_config['mcp_servers'])}\n\n"
            summary_content += "🚀 Next Steps:\n"
            summary_content += f"   cd {project_dir}\n"
            summary_content += "   claude-env status\n"
            summary_content += "   code .  # Open in VS Code"
            
            panel = Panel(
                summary_content,
                title="🎉 Project Created Successfully",
                border_style="green"
            )
            console.print(panel)
        else:
            print(f"\n🎉 Project created successfully!")
            print(f"   Name: {project_name}")
            print(f"   Location: {project_dir}")
            print(f"   Template: {template_config['name']}")
            print(f"   MCP Servers: {', '.join(template_config['mcp_servers'])}")
            print(f"\n🚀 Next steps:")
            print(f"   cd {project_dir}")
            print(f"   claude-env status")
            print(f"   code .  # Open in VS Code")
    
    def list_templates(self):
        """List available project templates"""
        if RICH_AVAILABLE and console:
            table = Table(title="📋 Available Project Templates", show_header=True, header_style="bold magenta")
            table.add_column("Template", style="cyan", width=15)
            table.add_column("Name", style="white", width=25)
            table.add_column("Description", style="dim", width=50)
            table.add_column("MCP Servers", width=20)
            
            for template_id, template_config in self.templates.items():
                table.add_row(
                    template_id,
                    template_config["name"],
                    template_config["description"],
                    ", ".join(template_config["mcp_servers"])
                )
            
            console.print(table)
        else:
            print("\nAvailable Project Templates:")
            print("-" * 80)
            for template_id, template_config in self.templates.items():
                print(f"{template_id:<15} {template_config['name']}")
                print(f"{'':15} {template_config['description']}")
                print(f"{'':15} MCP Servers: {', '.join(template_config['mcp_servers'])}")
                print()
    
    def _get_nodejs_template(self) -> Dict[str, str]:
        """Get Node.js TypeScript project template files"""
        return {
            "package.json": '''{
  "name": "{{PROJECT_NAME_KEBAB}}",
  "version": "0.1.0",
  "description": "Claude-enabled Node.js TypeScript project",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "claude:sync": "claude-env sync --environment development"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@anthropic-ai/claude-code": "^1.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node-dev": "^2.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0"
  }
}''',
            "tsconfig.json": '''{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}''',
            "src/index.ts": '''import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    message: 'Hello from {{PROJECT_NAME}}!',
    claude: 'enabled',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`🚀 {{PROJECT_NAME}} server running on port ${PORT}`);
});
''',
            ".gitignore": '''node_modules/
dist/
.env
.env.local
*.log
.DS_Store
.vscode/settings.json
.claude/logs/
.claude/backups/
''',
            "README.md": '''# {{PROJECT_NAME}}

Claude-enabled Node.js TypeScript project.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup Claude environment:
   ```bash
   claude-env sync --environment development
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## Claude Integration

This project is configured with Claude environment management:

- **Configuration**: `.claude/config.yml`
- **MCP Servers**: Context7, Sequential
- **Environments**: development, staging, production

### Commands

```bash
# Check Claude environment status
claude-env status

# Sync environment configuration
claude-env sync --environment development

# Start MCP servers
claude-env mcp start all
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run lint` - Lint code
''',
            "Dockerfile": '''FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
''',
            ".dockerignore": '''node_modules
.git
.claude
*.md
Dockerfile
.dockerignore
'''
        }
    
    def _get_python_template(self) -> Dict[str, str]:
        """Get Python FastAPI project template files"""
        return {
            "pyproject.toml": '''[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "{{PROJECT_NAME_SNAKE}}"
version = "0.1.0"
description = "Claude-enabled Python FastAPI project"
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn[standard]>=0.24.0",
    "pydantic>=2.0.0",
    "python-dotenv>=1.0.0"
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0.0",
    "ruff>=0.1.0",
    "mypy>=1.6.0"
]

[tool.black]
line-length = 88
target-version = ['py311']

[tool.ruff]
line-length = 88
target-version = "py311"

[tool.mypy]
python_version = "3.11"
strict = true
''',
            "requirements.txt": '''fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.0.0
python-dotenv>=1.0.0
''',
            "src/{{PROJECT_NAME_SNAKE}}/main.py": '''from fastapi import FastAPI
from datetime import datetime
import os

app = FastAPI(
    title="{{PROJECT_NAME}}",
    description="Claude-enabled FastAPI project",
    version="0.1.0"
)

@app.get("/")
async def root():
    return {
        "message": "Hello from {{PROJECT_NAME}}!",
        "claude": "enabled",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
''',
            "src/{{PROJECT_NAME_SNAKE}}/__init__.py": '"""{{PROJECT_NAME}} - Claude-enabled Python project."""\n\n__version__ = "0.1.0"',
            ".gitignore": '''__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

.env
.env.local
*.log
.DS_Store
.vscode/settings.json
.claude/logs/
.claude/backups/

# Virtual environments
venv/
env/
ENV/
env.bak/
venv.bak/
''',
            "README.md": '''# {{PROJECT_NAME}}

Claude-enabled Python FastAPI project.

## Setup

1. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Setup Claude environment:
   ```bash
   claude-env sync --environment development
   ```

4. Start development server:
   ```bash
   uvicorn src.{{PROJECT_NAME_SNAKE}}.main:app --reload
   ```

## Claude Integration

This project is configured with Claude environment management:

- **Configuration**: `.claude/config.yml`
- **MCP Servers**: Context7, Sequential, Magic
- **Environments**: development, staging, production

### Commands

```bash
# Check Claude environment status
claude-env status

# Sync environment configuration
claude-env sync --environment development

# Start MCP servers
claude-env mcp start all
```

## Development

- Development server: `uvicorn src.{{PROJECT_NAME_SNAKE}}.main:app --reload`
- Run tests: `pytest`
- Format code: `black src/`
- Lint code: `ruff src/`
- Type check: `mypy src/`
''',
            "Dockerfile": '''FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 8000

CMD ["uvicorn", "src.{{PROJECT_NAME_SNAKE}}.main:app", "--host", "0.0.0.0", "--port", "8000"]
''',
        }
    
    def _get_react_template(self) -> Dict[str, str]:
        """Get React TypeScript project template files"""
        return {
            "package.json": '''{
  "name": "{{PROJECT_NAME_KEBAB}}",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@anthropic-ai/claude-code": "^1.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.4.0",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "eslint": "^8.45.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "claude:sync": "claude-env sync --environment development"
  }
}''',
            "src/App.tsx": '''import React from 'react';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {{PROJECT_NAME}}
        </h1>
        <p className="text-gray-600 mb-4">
          Claude-enabled React TypeScript application
        </p>
        <div className="flex items-center space-x-2">
          <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
          <span className="text-sm text-gray-500">Claude environment active</span>
        </div>
      </div>
    </div>
  );
}

export default App;
''',
            "src/main.tsx": '''import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
''',
            "src/index.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
''',
            "src/App.css": '''.App {
  text-align: center;
}
''',
            "index.html": '''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{PROJECT_NAME}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
''',
            "vite.config.ts": '''import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
})
''',
            "tailwind.config.js": '''/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
''',
            "tsconfig.json": '''{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
''',
            ".gitignore": '''# Dependencies
node_modules/

# Production builds
dist/
build/

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Editor directories and files
.vscode/settings.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Claude environment
.claude/logs/
.claude/backups/
''',
            "README.md": '''# {{PROJECT_NAME}}

Claude-enabled React TypeScript application.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup Claude environment:
   ```bash
   claude-env sync --environment development
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## Claude Integration

This project is configured with Claude environment management:

- **Configuration**: `.claude/config.yml`
- **MCP Servers**: Context7, Magic
- **Environments**: development, staging, production

### Commands

```bash
# Check Claude environment status
claude-env status

# Sync environment configuration
claude-env sync --environment development

# Start MCP servers
claude-env mcp start all
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run preview` - Preview production build
- `npm run lint` - Lint code
'''
        }
    
    def _get_nextjs_template(self) -> Dict[str, str]:
        """Get Next.js project template files"""
        return {
            "package.json": '''{
  "name": "{{PROJECT_NAME_KEBAB}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "claude:sync": "claude-env sync --environment development"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@anthropic-ai/claude-code": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "14.0.0"
  }
}''',
            "app/page.tsx": '''export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {{PROJECT_NAME}}
        </h1>
        <p className="text-gray-600 mb-6">
          Claude-enabled Next.js application with TypeScript and Tailwind CSS.
        </p>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-500">Claude environment active</span>
        </div>
      </div>
    </main>
  )
}
''',
            "app/layout.tsx": '''import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '{{PROJECT_NAME}}',
  description: 'Claude-enabled Next.js application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
''',
            "app/globals.css": '''@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
''',
            "next.config.js": '''/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig
''',
            "tailwind.config.ts": '''import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
export default config
''',
            "tsconfig.json": '''{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
''',
            ".gitignore": '''# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# Claude environment
.claude/logs/
.claude/backups/
''',
            "README.md": '''# {{PROJECT_NAME}}

Claude-enabled Next.js application with TypeScript and Tailwind CSS.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup Claude environment:
   ```bash
   claude-env sync --environment development
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Claude Integration

This project is configured with Claude environment management:

- **Configuration**: `.claude/config.yml`
- **MCP Servers**: Context7, Sequential, Magic
- **Environments**: development, staging, production

### Commands

```bash
# Check Claude environment status
claude-env status

# Sync environment configuration
claude-env sync --environment development

# Start MCP servers
claude-env mcp start all
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
'''
        }
    
    def _get_minimal_template(self) -> Dict[str, str]:
        """Get minimal Claude setup template files"""
        return {
            ".gitignore": '''.env
.env.local
*.log
.DS_Store
.claude/logs/
.claude/backups/
''',
            "README.md": '''# {{PROJECT_NAME}}

Minimal Claude environment setup.

## Setup

Setup Claude environment:
```bash
claude-env sync --environment development
```

## Claude Integration

This project is configured with basic Claude environment management:

- **Configuration**: `.claude/config.yml`
- **MCP Servers**: Context7
- **Environments**: development, staging, production

### Commands

```bash
# Check Claude environment status
claude-env status

# Sync environment configuration
claude-env sync --environment development

# Start MCP servers
claude-env mcp start all
```
'''
        }

def main():
    """Main function for project initializer"""
    import argparse
    from datetime import datetime
    
    parser = argparse.ArgumentParser(description="Claude Environment Project Initializer")
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Create project command
    create_parser = subparsers.add_parser('create', help='Create new project')
    create_parser.add_argument('project_name', help='Project name')
    create_parser.add_argument('--template', '-t', choices=['nodejs', 'python', 'react', 'nextjs', 'minimal'],
                             default='minimal', help='Project template')
    create_parser.add_argument('--target-dir', help='Target directory')
    create_parser.add_argument('--non-interactive', action='store_true', help='Non-interactive mode')
    
    # List templates command
    list_parser = subparsers.add_parser('list', help='List available templates')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    initializer = ProjectInitializer()
    
    try:
        if args.command == 'create':
            success = initializer.create_project(
                project_name=args.project_name,
                template=args.template,
                target_dir=Path(args.target_dir) if args.target_dir else None,
                interactive=not args.non_interactive
            )
            
            return 0 if success else 1
        
        elif args.command == 'list':
            initializer.list_templates()
            return 0
        
        else:
            print(f"Unknown command: {args.command}")
            return 1
    
    except KeyboardInterrupt:
        print("\nProject creation cancelled")
        return 130
    except Exception as e:
        print(f"❌ Project creation failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())