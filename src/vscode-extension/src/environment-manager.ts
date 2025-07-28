import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { glob } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface Environment {
  name: string;
  type: 'development' | 'staging' | 'production';
  status: 'active' | 'inactive' | 'error';
  path: string;
  config: any;
  mcpServers: MCPServer[];
  lastSync: Date | null;
}

export interface MCPServer {
  name: string;
  type: 'context7' | 'sequential' | 'magic' | 'playwright' | 'custom';
  status: 'running' | 'stopped' | 'error';
  endpoint: string;
  config: any;
}

export interface ActivityItem {
  id: string;
  type: 'sync' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  environment?: string;
  details?: any;
}

export class EnvironmentManager {
  private environments: Map<string, Environment> = new Map();
  private currentEnvironment: string | null = null;
  private activityHistory: ActivityItem[] = [];
  private autoSyncTimer: NodeJS.Timer | null = null;
  private outputChannel: vscode.OutputChannel;
  private statusBar: vscode.StatusBarItem;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('Claude Environment');
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = 'claude-env.showQuickPick';
    this.statusBar.show();
    
    this.discoverEnvironments();
  }

  async isInitialized(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return false;

    for (const folder of workspaceFolders) {
      const claudeEnvPath = path.join(folder.uri.fsPath, '.claude-env');
      const mcpConfigPath = path.join(folder.uri.fsPath, 'mcp.json');
      
      if (fs.existsSync(claudeEnvPath) || fs.existsSync(mcpConfigPath)) {
        return true;
      }
    }
    
    return false;
  }

  async discoverEnvironments() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    this.environments.clear();
    
    for (const folder of workspaceFolders) {
      await this.discoverEnvironment(folder.uri);
    }
    
    this.updateStatusBar();
    this.logActivity('info', `Discovered ${this.environments.size} environments`);
  }

  async discoverEnvironment(folderUri: vscode.Uri) {
    try {
      const folderPath = folderUri.fsPath;
      
      // Look for Claude environment configurations
      const configPaths = [
        path.join(folderPath, '.claude-env', 'config.yml'),
        path.join(folderPath, '.claude-env', 'config.yaml'),
        path.join(folderPath, 'claude-env.yml'),
        path.join(folderPath, 'claude-env.yaml'),
      ];

      for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
          await this.loadEnvironmentFromConfig(configPath);
        }
      }

      // Check for MCP configuration
      const mcpConfigPath = path.join(folderPath, 'mcp.json');
      if (fs.existsSync(mcpConfigPath)) {
        await this.loadMcpConfiguration(mcpConfigPath, folderPath);
      }

      // Auto-detect based on project structure
      await this.autoDetectEnvironment(folderPath);
      
    } catch (error) {
      console.error('Error discovering environment:', error);
      this.logActivity('error', `Failed to discover environment: ${error}`);
    }
  }

  async loadEnvironmentFromConfig(configPath: string) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configContent);
      
      const envName = config.name || path.basename(path.dirname(configPath));
      const environment: Environment = {
        name: envName,
        type: config.type || 'development',
        status: 'inactive',
        path: path.dirname(configPath),
        config: config,
        mcpServers: [],
        lastSync: null,
      };

      // Load MCP servers if specified
      if (config.mcpServers) {
        environment.mcpServers = await this.loadMcpServers(config.mcpServers);
      }

      this.environments.set(envName, environment);
      this.logActivity('info', `Loaded environment: ${envName}`);
      
    } catch (error) {
      console.error('Error loading environment config:', error);
      this.logActivity('error', `Failed to load environment config: ${error}`);
    }
  }

  async loadMcpConfiguration(mcpConfigPath: string, workspacePath: string) {
    try {
      const mcpContent = fs.readFileSync(mcpConfigPath, 'utf8');
      const mcpConfig = JSON.parse(mcpContent);
      
      const envName = path.basename(workspacePath);
      let environment = this.environments.get(envName);
      
      if (!environment) {
        environment = {
          name: envName,
          type: 'development',
          status: 'inactive',
          path: workspacePath,
          config: {},
          mcpServers: [],
          lastSync: null,
        };
        this.environments.set(envName, environment);
      }

      // Parse MCP servers
      if (mcpConfig.mcpServers) {
        for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
          const server: MCPServer = {
            name: serverName,
            type: this.detectMcpServerType(serverConfig),
            status: 'stopped',
            endpoint: this.extractMcpEndpoint(serverConfig),
            config: serverConfig,
          };
          environment.mcpServers.push(server);
        }
      }

      this.logActivity('info', `Loaded MCP configuration for: ${envName}`);
      
    } catch (error) {
      console.error('Error loading MCP configuration:', error);
      this.logActivity('error', `Failed to load MCP configuration: ${error}`);
    }
  }

  async autoDetectEnvironment(workspacePath: string) {
    try {
      const packageJsonPath = path.join(workspacePath, 'package.json');
      const envName = path.basename(workspacePath);
      
      if (fs.existsSync(packageJsonPath) && !this.environments.has(envName)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Check for Claude-related dependencies or scripts
        const hasClaudeRelated = (
          packageJson.dependencies && Object.keys(packageJson.dependencies).some(dep => dep.includes('claude')) ||
          packageJson.devDependencies && Object.keys(packageJson.devDependencies).some(dep => dep.includes('claude')) ||
          packageJson.scripts && Object.keys(packageJson.scripts).some(script => packageJson.scripts[script].includes('claude'))
        );

        if (hasClaudeRelated) {
          const environment: Environment = {
            name: envName,
            type: 'development',
            status: 'inactive',
            path: workspacePath,
            config: { autoDetected: true },
            mcpServers: [],
            lastSync: null,
          };
          
          this.environments.set(envName, environment);
          this.logActivity('info', `Auto-detected Claude environment: ${envName}`);
        }
      }
      
    } catch (error) {
      console.error('Error auto-detecting environment:', error);
    }
  }

  async loadMcpServers(serverConfigs: any[]): Promise<MCPServer[]> {
    const servers: MCPServer[] = [];
    
    for (const [name, config] of Object.entries(serverConfigs)) {
      const server: MCPServer = {
        name,
        type: this.detectMcpServerType(config),
        status: 'stopped',
        endpoint: this.extractMcpEndpoint(config),
        config,
      };
      servers.push(server);
    }
    
    return servers;
  }

  detectMcpServerType(config: any): MCPServer['type'] {
    if (config.command && typeof config.command === 'string') {
      if (config.command.includes('context7')) return 'context7';
      if (config.command.includes('sequential')) return 'sequential';
      if (config.command.includes('magic')) return 'magic';
      if (config.command.includes('playwright')) return 'playwright';
    }
    return 'custom';
  }

  extractMcpEndpoint(config: any): string {
    if (config.endpoint) return config.endpoint;
    if (config.command) return `local://${config.command}`;
    return 'unknown';
  }

  async syncEnvironment(environmentName?: string): Promise<boolean> {
    try {
      const envName = environmentName || this.currentEnvironment;
      if (!envName) {
        throw new Error('No environment specified or active');
      }

      const environment = this.environments.get(envName);
      if (!environment) {
        throw new Error(`Environment not found: ${envName}`);
      }

      this.logActivity('info', `Starting sync for environment: ${envName}`);
      this.outputChannel.appendLine(`Starting sync for environment: ${envName}`);

      // Execute sync command
      const syncCommand = await this.buildSyncCommand(environment);
      const { stdout, stderr } = await execAsync(syncCommand, { cwd: environment.path });

      if (stderr) {
        this.outputChannel.appendLine(`Sync warnings: ${stderr}`);
      }

      environment.lastSync = new Date();
      environment.status = 'active';
      
      this.logActivity('info', `Environment sync completed: ${envName}`);
      this.outputChannel.appendLine(`Sync completed successfully for: ${envName}`);
      
      vscode.window.showInformationMessage(`Environment '${envName}' synced successfully`);
      return true;
      
    } catch (error) {
      const errorMessage = `Sync failed: ${error}`;
      this.logActivity('error', errorMessage);
      this.outputChannel.appendLine(errorMessage);
      vscode.window.showErrorMessage(errorMessage);
      return false;
    }
  }

  async buildSyncCommand(environment: Environment): Promise<string> {
    // Check if claude-env CLI is available
    const claudeEnvPath = await this.findClaudeEnvExecutable();
    
    if (claudeEnvPath) {
      return `"${claudeEnvPath}" sync --environment ${environment.type}`;
    }
    
    // Fallback to npm/yarn scripts
    const packageJsonPath = path.join(environment.path, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.scripts && packageJson.scripts['claude:sync']) {
        return 'npm run claude:sync';
      }
    }
    
    throw new Error('Claude environment CLI not found and no sync script available');
  }

  async findClaudeEnvExecutable(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('which claude-env || where claude-env');
      return stdout.trim();
    } catch {
      // Try common paths
      const commonPaths = [
        '/usr/local/bin/claude-env',
        '/usr/bin/claude-env',
        process.env.HOME + '/.local/bin/claude-env',
        'claude-env', // In PATH
      ];
      
      for (const path of commonPaths) {
        try {
          await execAsync(`"${path}" --version`);
          return path;
        } catch {
          continue;
        }
      }
    }
    
    return null;
  }

  async activateEnvironment(environmentName: string): Promise<boolean> {
    const environment = this.environments.get(environmentName);
    if (!environment) {
      vscode.window.showErrorMessage(`Environment not found: ${environmentName}`);
      return false;
    }

    try {
      // Deactivate current environment
      if (this.currentEnvironment) {
        const currentEnv = this.environments.get(this.currentEnvironment);
        if (currentEnv) {
          currentEnv.status = 'inactive';
        }
      }

      // Activate new environment
      this.currentEnvironment = environmentName;
      environment.status = 'active';
      
      // Update context
      await vscode.commands.executeCommand('setContext', 'claude-env.currentEnvironment', environmentName);
      
      this.updateStatusBar();
      this.logActivity('info', `Activated environment: ${environmentName}`);
      
      vscode.window.showInformationMessage(`Activated environment: ${environmentName}`);
      return true;
      
    } catch (error) {
      this.logActivity('error', `Failed to activate environment: ${error}`);
      vscode.window.showErrorMessage(`Failed to activate environment: ${error}`);
      return false;
    }
  }

  async startAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }

    const config = vscode.workspace.getConfiguration('claude-env');
    const interval = config.get('syncInterval', 300) * 1000; // Convert to milliseconds

    this.autoSyncTimer = setInterval(async () => {
      if (this.currentEnvironment) {
        await this.syncEnvironment();
      }
    }, interval);

    this.logActivity('info', `Auto-sync started with ${interval / 1000}s interval`);
  }

  async stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      this.logActivity('info', 'Auto-sync stopped');
    }
  }

  async reloadConfiguration() {
    await this.discoverEnvironments();
    this.logActivity('info', 'Configuration reloaded');
  }

  getEnvironments(): Environment[] {
    return Array.from(this.environments.values());
  }

  getCurrentEnvironment(): Environment | null {
    return this.currentEnvironment ? this.environments.get(this.currentEnvironment) || null : null;
  }

  getActivityHistory(): ActivityItem[] {
    return this.activityHistory.slice().reverse(); // Most recent first
  }

  private logActivity(type: ActivityItem['type'], message: string, environment?: string, details?: any) {
    const activity: ActivityItem = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date(),
      environment,
      details,
    };

    this.activityHistory.push(activity);
    
    // Keep only last 100 items
    if (this.activityHistory.length > 100) {
      this.activityHistory.shift();
    }

    // Log to output channel
    this.outputChannel.appendLine(`[${type.toUpperCase()}] ${message}`);
    
    // Show in VS Code if it's an error
    if (type === 'error') {
      vscode.window.showErrorMessage(message);
    }
  }

  private updateStatusBar() {
    const envCount = this.environments.size;
    const currentEnv = this.getCurrentEnvironment();
    
    if (currentEnv) {
      this.statusBar.text = `$(rocket) ${currentEnv.name} (${currentEnv.status})`;
      this.statusBar.tooltip = `Claude Environment: ${currentEnv.name}\\nStatus: ${currentEnv.status}\\nType: ${currentEnv.type}`;
    } else if (envCount > 0) {
      this.statusBar.text = `$(rocket) ${envCount} environments`;
      this.statusBar.tooltip = `Claude Environment: ${envCount} environments found`;
    } else {
      this.statusBar.text = `$(rocket) No environments`;
      this.statusBar.tooltip = 'Claude Environment: No environments found';
    }
  }

  dispose() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }
    this.outputChannel.dispose();
    this.statusBar.dispose();
  }
}