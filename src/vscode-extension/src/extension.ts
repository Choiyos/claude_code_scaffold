import * as vscode from 'vscode';
import { EnvironmentManager } from './environment-manager';
import { StatusBarManager } from './status-bar-manager';
import { WebSocketClient } from './websocket-client';
import { ConfigurationProvider } from './configuration-provider';
import { TreeDataProviders } from './tree-data-providers';
import { CommandManager } from './command-manager';
import { DiagnosticsManager } from './diagnostics-manager';
import { SnippetProvider } from './snippet-provider';
import { DebugManager } from './debug-manager';

let environmentManager: EnvironmentManager;
let statusBarManager: StatusBarManager;
let webSocketClient: WebSocketClient;
let configurationProvider: ConfigurationProvider;
let treeDataProviders: TreeDataProviders;
let commandManager: CommandManager;
let diagnosticsManager: DiagnosticsManager;
let snippetProvider: SnippetProvider;
let debugManager: DebugManager;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Claude Environment Extension is now active!');

  // Initialize core managers
  environmentManager = new EnvironmentManager(context);
  statusBarManager = new StatusBarManager();
  webSocketClient = new WebSocketClient();
  configurationProvider = new ConfigurationProvider();
  treeDataProviders = new TreeDataProviders(environmentManager);
  commandManager = new CommandManager(environmentManager, webSocketClient);
  diagnosticsManager = new DiagnosticsManager();
  snippetProvider = new SnippetProvider();
  debugManager = new DebugManager();

  // Set context for conditional UI elements
  await vscode.commands.executeCommand('setContext', 'claude-env.isInitialized', await environmentManager.isInitialized());

  // Register all providers and managers
  await registerProviders(context);
  await registerCommands(context);
  await registerEventHandlers(context);

  // Initialize environment if found
  if (await environmentManager.isInitialized()) {
    await initializeEnvironment();
  }

  // Show welcome message for first-time users
  const config = vscode.workspace.getConfiguration('claude-env');
  const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
  
  if (!hasShownWelcome) {
    await showWelcomeMessage(context);
  }

  console.log('Claude Environment Extension activated successfully');
}

async function registerProviders(context: vscode.ExtensionContext) {
  // Register tree data providers
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claude-env.environments', treeDataProviders.environmentsProvider),
    vscode.window.registerTreeDataProvider('claude-env.mcpServers', treeDataProviders.mcpServersProvider),
    vscode.window.registerTreeDataProvider('claude-env.activity', treeDataProviders.activityProvider),
    vscode.window.registerTreeDataProvider('claude-env.help', treeDataProviders.helpProvider)
  );

  // Register configuration provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('claude-config', configurationProvider)
  );

  // Register snippet provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { scheme: 'file', language: 'json', pattern: '**/*.claude.json' },
        { scheme: 'file', language: 'yaml', pattern: '**/*.claude.{yml,yaml}' },
        { scheme: 'file', language: 'json', pattern: '**/mcp.json' }
      ],
      snippetProvider,
      '.', '\"', '\'', ':', ' '
    )
  );

  // Register debug configuration provider
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('claude-env', debugManager)
  );
}

async function registerCommands(context: vscode.ExtensionContext) {
  const commands = [
    vscode.commands.registerCommand('claude-env.init', () => commandManager.initializeEnvironment()),
    vscode.commands.registerCommand('claude-env.sync', () => commandManager.syncEnvironment()),
    vscode.commands.registerCommand('claude-env.status', () => commandManager.showStatus()),
    vscode.commands.registerCommand('claude-env.openDashboard', () => commandManager.openDashboard()),
    vscode.commands.registerCommand('claude-env.showQuickPick', () => commandManager.showQuickPick()),
    vscode.commands.registerCommand('claude-env.toggleMcpServer', (serverName: string) => commandManager.toggleMcpServer(serverName)),
    vscode.commands.registerCommand('claude-env.viewLogs', () => commandManager.viewLogs()),
    vscode.commands.registerCommand('claude-env.createConfig', (uri: vscode.Uri) => commandManager.createConfig(uri)),
    vscode.commands.registerCommand('claude-env.validateConfig', () => commandManager.validateConfig()),
    
    // Tree view commands
    vscode.commands.registerCommand('claude-env.environments.refresh', () => treeDataProviders.environmentsProvider.refresh()),
    vscode.commands.registerCommand('claude-env.mcpServers.refresh', () => treeDataProviders.mcpServersProvider.refresh()),
    vscode.commands.registerCommand('claude-env.activity.refresh', () => treeDataProviders.activityProvider.refresh()),
    
    // Environment-specific commands
    vscode.commands.registerCommand('claude-env.environment.activate', (environment: string) => environmentManager.activateEnvironment(environment)),
    vscode.commands.registerCommand('claude-env.environment.edit', (environment: string) => commandManager.editEnvironment(environment)),
    vscode.commands.registerCommand('claude-env.environment.duplicate', (environment: string) => commandManager.duplicateEnvironment(environment)),
    vscode.commands.registerCommand('claude-env.environment.delete', (environment: string) => commandManager.deleteEnvironment(environment)),
    
    // MCP Server commands
    vscode.commands.registerCommand('claude-env.mcpServer.start', (serverName: string) => commandManager.startMcpServer(serverName)),
    vscode.commands.registerCommand('claude-env.mcpServer.stop', (serverName: string) => commandManager.stopMcpServer(serverName)),
    vscode.commands.registerCommand('claude-env.mcpServer.restart', (serverName: string) => commandManager.restartMcpServer(serverName)),
    vscode.commands.registerCommand('claude-env.mcpServer.viewLogs', (serverName: string) => commandManager.viewMcpServerLogs(serverName)),
    vscode.commands.registerCommand('claude-env.mcpServer.editConfig', (serverName: string) => commandManager.editMcpServerConfig(serverName)),
  ];

  context.subscriptions.push(...commands);
}

async function registerEventHandlers(context: vscode.ExtensionContext) {
  // File system watcher for configuration changes
  const configWatcher = vscode.workspace.createFileSystemWatcher('**/{.claude-env,mcp.json,*.claude.{json,yml,yaml}}');
  
  configWatcher.onDidChange(async (uri) => {
    await handleConfigurationChange(uri);
  });
  
  configWatcher.onDidCreate(async (uri) => {
    await handleConfigurationChange(uri);
  });
  
  configWatcher.onDidDelete(async (uri) => {
    await handleConfigurationChange(uri);
  });

  context.subscriptions.push(configWatcher);

  // Workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      for (const folder of event.added) {
        await environmentManager.discoverEnvironment(folder.uri);
      }
    })
  );

  // Document changes for validation
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (isClaudeConfigFile(event.document.uri)) {
        await diagnosticsManager.validateDocument(event.document);
      }
    })
  );

  // Document open/close for diagnostics
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (isClaudeConfigFile(document.uri)) {
        await diagnosticsManager.validateDocument(document);
      }
    }),
    
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isClaudeConfigFile(document.uri)) {
        diagnosticsManager.clearDiagnostics(document.uri);
      }
    })
  );

  // Configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('claude-env')) {
        await handleExtensionConfigurationChange();
      }
    })
  );
}

async function initializeEnvironment() {
  try {
    // Connect to WebSocket for real-time updates
    await webSocketClient.connect();
    
    // Update UI
    await statusBarManager.updateStatus('connected');
    await updateTreeViews();
    
    // Start auto-sync if enabled
    const config = vscode.workspace.getConfiguration('claude-env');
    if (config.get('autoSync', true)) {
      await environmentManager.startAutoSync();
    }
    
  } catch (error) {
    console.error('Failed to initialize environment:', error);
    await statusBarManager.updateStatus('error');
    vscode.window.showErrorMessage(`Failed to initialize Claude Environment: ${error}`);
  }
}

async function handleConfigurationChange(uri: vscode.Uri) {
  try {
    console.log('Configuration changed:', uri.fsPath);
    
    // Validate the changed file
    const document = await vscode.workspace.openTextDocument(uri);
    await diagnosticsManager.validateDocument(document);
    
    // Update environment manager
    await environmentManager.reloadConfiguration();
    
    // Update UI
    await updateTreeViews();
    
    // Auto-sync if enabled
    const config = vscode.workspace.getConfiguration('claude-env');
    if (config.get('autoSync', true)) {
      await environmentManager.syncEnvironment();
    }
    
    // Notify WebSocket clients
    webSocketClient.emit('config:changed', {
      file: uri.fsPath,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error handling configuration change:', error);
    vscode.window.showErrorMessage(`Configuration error: ${error}`);
  }
}

async function handleExtensionConfigurationChange() {
  const config = vscode.workspace.getConfiguration('claude-env');
  
  // Update status bar visibility
  if (config.get('showStatusBar', true)) {
    statusBarManager.show();
  } else {
    statusBarManager.hide();
  }
  
  // Update auto-sync
  if (config.get('autoSync', true)) {
    await environmentManager.startAutoSync();
  } else {
    await environmentManager.stopAutoSync();
  }
  
  // Update WebSocket connection
  const dashboardUrl = config.get('dashboardUrl', 'http://localhost:3000');
  webSocketClient.updateEndpoint(dashboardUrl);
}

async function updateTreeViews() {
  treeDataProviders.environmentsProvider.refresh();
  treeDataProviders.mcpServersProvider.refresh();
  treeDataProviders.activityProvider.refresh();
}

function isClaudeConfigFile(uri: vscode.Uri): boolean {
  const fileName = uri.fsPath.toLowerCase();
  return fileName.includes('.claude.json') || 
         fileName.includes('.claude.yml') || 
         fileName.includes('.claude.yaml') || 
         fileName.includes('mcp.json') ||
         fileName.includes('claude-env.yml') ||
         fileName.includes('claude-env.yaml');
}

async function showWelcomeMessage(context: vscode.ExtensionContext) {
  const action = await vscode.window.showInformationMessage(
    'Welcome to Claude Environment Extension! 🚀',
    'Initialize Environment',
    'Open Documentation',
    'Don\\'t Show Again'
  );

  switch (action) {
    case 'Initialize Environment':
      await vscode.commands.executeCommand('claude-env.init');
      break;
    case 'Open Documentation':
      await vscode.env.openExternal(vscode.Uri.parse('https://docs.claude-env.dev'));
      break;
    case 'Don\\'t Show Again':
      await context.globalState.update('hasShownWelcome', true);
      break;
  }
}

export function deactivate() {
  console.log('Claude Environment Extension is being deactivated');
  
  // Cleanup resources
  if (webSocketClient) {
    webSocketClient.disconnect();
  }
  
  if (environmentManager) {
    environmentManager.dispose();
  }
  
  if (statusBarManager) {
    statusBarManager.dispose();
  }
  
  if (diagnosticsManager) {
    diagnosticsManager.dispose();
  }
  
  console.log('Claude Environment Extension deactivated');
}