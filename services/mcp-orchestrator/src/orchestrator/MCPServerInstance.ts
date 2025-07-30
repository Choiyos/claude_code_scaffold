import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import Docker from 'dockerode';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { MCPServerConfig, MCPRequest, MCPResponse, ServerStatus } from '../types';
import { Logger } from '../utils/Logger';

export class MCPServerInstance extends EventEmitter {
  private id: string;
  private config: MCPServerConfig;
  private logger: Logger;
  private process?: ChildProcess;
  private container?: Docker.Container;
  private docker?: Docker;
  private websocket?: WebSocket;
  private isHealthy: boolean = false;
  private errorCount: number = 0;
  private startTime: number = 0;
  private lastHealthCheck: number = 0;
  private requestCount: number = 0;
  private responseTime: number = 0;

  constructor(id: string, config: MCPServerConfig, logger: Logger) {
    super();
    this.id = id;
    this.config = config;
    this.logger = logger;
    
    if (config.deploymentType === 'docker') {
      this.docker = new Docker();
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing MCP server instance', { 
      id: this.id, 
      type: this.config.type 
    });

    try {
      switch (this.config.deploymentType) {
        case 'docker':
          await this.initializeDocker();
          break;
        case 'process':
          await this.initializeProcess();
          break;
        case 'websocket':
          await this.initializeWebSocket();
          break;
        default:
          throw new Error(`Unsupported deployment type: ${this.config.deploymentType}`);
      }

      this.startTime = Date.now();
      this.isHealthy = true;
      this.emit('initialized');

    } catch (error) {
      this.logger.error('Failed to initialize MCP server instance', { 
        id: this.id, 
        error 
      });
      throw error;
    }
  }

  private async initializeDocker(): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker not available');
    }

    const containerConfig = {
      Image: this.config.image || this.getDefaultImage(),
      name: `mcp-${this.config.type}-${this.id}`,
      Env: this.buildEnvironmentVariables(),
      ExposedPorts: {
        [`${this.config.port || 8080}/tcp`]: {}
      },
      HostConfig: {
        PortBindings: {
          [`${this.config.port || 8080}/tcp`]: [{ HostPort: '0' }]
        },
        Memory: this.config.resources?.memory || 512 * 1024 * 1024, // 512MB
        CpuShares: this.config.resources?.cpu || 512,
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      },
      Labels: {
        'mcp.orchestrator.id': this.id,
        'mcp.orchestrator.type': this.config.type,
        'mcp.orchestrator.managed': 'true'
      }
    };

    this.logger.debug('Creating Docker container', { id: this.id, config: containerConfig });

    this.container = await this.docker.createContainer(containerConfig);
    await this.container.start();

    // Wait for container to be ready
    await this.waitForContainerReady();

    this.logger.info('Docker container started successfully', { 
      id: this.id, 
      containerId: this.container.id 
    });
  }

  private async initializeProcess(): Promise<void> {
    const command = this.config.command;
    const args = this.config.args || [];

    if (!command) {
      throw new Error('Command not specified for process deployment');
    }

    this.logger.debug('Starting MCP server process', { 
      id: this.id, 
      command, 
      args 
    });

    this.process = spawn(command, args, {
      env: {
        ...process.env,
        ...this.config.environment
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle process events
    this.process.on('exit', (code, signal) => {
      this.logger.warn('MCP server process exited', { 
        id: this.id, 
        code, 
        signal 
      });
      this.isHealthy = false;
      this.emit('process-exit', { code, signal });
    });

    this.process.on('error', (error) => {
      this.logger.error('MCP server process error', { 
        id: this.id, 
        error 
      });
      this.recordError(error);
    });

    // Log output
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        this.logger.debug('MCP server stdout', { 
          id: this.id, 
          data: data.toString().trim() 
        });
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        this.logger.warn('MCP server stderr', { 
          id: this.id, 
          data: data.toString().trim() 
        });
      });
    }

    // Wait for process to be ready
    await this.waitForProcessReady();
  }

  private async initializeWebSocket(): Promise<void> {
    const url = this.config.url;
    
    if (!url) {
      throw new Error('URL not specified for WebSocket deployment');
    }

    this.logger.debug('Connecting to MCP server via WebSocket', { 
      id: this.id, 
      url 
    });

    this.websocket = new WebSocket(url);

    return new Promise((resolve, reject) => {
      if (!this.websocket) {
        return reject(new Error('WebSocket not initialized'));
      }

      this.websocket.on('open', () => {
        this.logger.info('WebSocket connection established', { id: this.id });
        resolve();
      });

      this.websocket.on('error', (error) => {
        this.logger.error('WebSocket connection error', { id: this.id, error });
        this.recordError(error);
        reject(error);
      });

      this.websocket.on('close', () => {
        this.logger.warn('WebSocket connection closed', { id: this.id });
        this.isHealthy = false;
        this.emit('websocket-close');
      });

      this.websocket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('message', message);
        } catch (error) {
          this.logger.error('Failed to parse WebSocket message', { 
            id: this.id, 
            error 
          });
        }
      });
    });
  }

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    this.logger.debug('Handling MCP request', { 
      id: this.id, 
      requestId, 
      method: request.method 
    });

    try {
      let response: MCPResponse;

      switch (this.config.deploymentType) {
        case 'docker':
        case 'process':
          response = await this.handleHttpRequest(request, requestId);
          break;
        case 'websocket':
          response = await this.handleWebSocketRequest(request, requestId);
          break;
        default:
          throw new Error(`Unsupported deployment type: ${this.config.deploymentType}`);
      }

      const duration = Date.now() - startTime;
      this.updateMetrics(duration);

      this.logger.debug('Request handled successfully', { 
        id: this.id, 
        requestId, 
        duration 
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordError(error as Error);
      this.updateMetrics(duration);

      this.logger.error('Request handling failed', { 
        id: this.id, 
        requestId, 
        error 
      });

      throw error;
    }
  }

  private async handleHttpRequest(request: MCPRequest, requestId: string): Promise<MCPResponse> {
    const url = await this.getServerUrl();
    
    const response = await fetch(`${url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async handleWebSocketRequest(request: MCPRequest, requestId: string): Promise<MCPResponse> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      const messageHandler = (data: any) => {
        if (data.id === requestId) {
          clearTimeout(timeout);
          this.websocket?.off('message', messageHandler);
          
          if (data.error) {
            reject(new Error(data.error.message));
          } else {
            resolve(data.result);
          }
        }
      };

      this.websocket!.on('message', messageHandler);
      this.websocket!.send(JSON.stringify({
        ...request,
        id: requestId
      }));
    });
  }

  async restart(): Promise<void> {
    this.logger.info('Restarting MCP server instance', { id: this.id });

    try {
      await this.shutdown();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.initialize();
      
      this.logger.info('MCP server instance restarted successfully', { id: this.id });
      
    } catch (error) {
      this.logger.error('Failed to restart MCP server instance', { 
        id: this.id, 
        error 
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP server instance', { id: this.id });

    try {
      if (this.container) {
        await this.container.stop();
        await this.container.remove();
        this.container = undefined;
      }

      if (this.process) {
        this.process.kill('SIGTERM');
        this.process = undefined;
      }

      if (this.websocket) {
        this.websocket.close();
        this.websocket = undefined;
      }

      this.isHealthy = false;
      this.emit('shutdown');

    } catch (error) {
      this.logger.error('Failed to shutdown MCP server instance', { 
        id: this.id, 
        error 
      });
      throw error;
    }
  }

  async getStatus(): Promise<ServerStatus> {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    
    return {
      id: this.id,
      type: this.config.type,
      status: this.isHealthy ? 'running' : 'unhealthy',
      healthy: this.isHealthy,
      uptime,
      lastHealthCheck: this.lastHealthCheck,
      metrics: {
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        averageResponseTime: this.responseTime
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    this.lastHealthCheck = Date.now();

    try {
      switch (this.config.deploymentType) {
        case 'docker':
          return await this.dockerHealthCheck();
        case 'process':
          return await this.processHealthCheck();
        case 'websocket':
          return await this.websocketHealthCheck();
        default:
          return false;
      }
    } catch (error) {
      this.logger.error('Health check failed', { id: this.id, error });
      return false;
    }
  }

  private async dockerHealthCheck(): Promise<boolean> {
    if (!this.container) {
      return false;
    }

    try {
      const containerInfo = await this.container.inspect();
      return containerInfo.State.Running && containerInfo.State.Health?.Status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  private async processHealthCheck(): Promise<boolean> {
    if (!this.process) {
      return false;
    }

    // Check if process is still running
    return !this.process.killed && this.process.exitCode === null;
  }

  private async websocketHealthCheck(): Promise<boolean> {
    if (!this.websocket) {
      return false;
    }

    return this.websocket.readyState === WebSocket.OPEN;
  }

  // Utility methods
  getId(): string {
    return this.id;
  }

  getType(): string {
    return this.config.type;
  }

  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  isHealthyServer(): boolean {
    return this.isHealthy;
  }

  markHealthy(): void {
    this.isHealthy = true;
  }

  markUnhealthy(): void {
    this.isHealthy = false;
  }

  recordError(error: Error): void {
    this.errorCount++;
    this.emit('error', { serverId: this.id, error });
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  resetErrorCount(): void {
    this.errorCount = 0;
  }

  private updateMetrics(responseTime: number): void {
    this.requestCount++;
    this.responseTime = (this.responseTime + responseTime) / 2; // Moving average
  }

  private getDefaultImage(): string {
    const imageMap: Record<string, string> = {
      'context7': 'mcp/context7:latest',
      'sequential': 'mcp/sequential:latest', 
      'magic': 'mcp/magic:latest',
      'filesystem': 'mcp/filesystem:latest'
    };

    return imageMap[this.config.type] || 'mcp/generic:latest';
  }

  private buildEnvironmentVariables(): string[] {
    const env = [];
    
    // Default MCP environment variables
    env.push(`MCP_SERVER_TYPE=${this.config.type}`);
    env.push(`MCP_SERVER_ID=${this.id}`);
    
    // Custom environment variables
    if (this.config.environment) {
      for (const [key, value] of Object.entries(this.config.environment)) {
        env.push(`${key}=${value}`);
      }
    }

    return env;
  }

  private async getServerUrl(): Promise<string> {
    if (this.config.url) {
      return this.config.url;
    }

    if (this.container) {
      const containerInfo = await this.container.inspect();
      const port = this.config.port || 8080;
      const hostPort = containerInfo.NetworkSettings.Ports[`${port}/tcp`]?.[0]?.HostPort;
      
      if (hostPort) {
        return `http://localhost:${hostPort}`;
      }
    }

    throw new Error('Unable to determine server URL');
  }

  private async waitForContainerReady(): Promise<void> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const containerInfo = await this.container.inspect();
        
        if (containerInfo.State.Running) {
          // Wait a bit more for the server to be ready
          await new Promise(resolve => setTimeout(resolve, 2000));
          return;
        }
      } catch (error) {
        // Container might not be ready yet
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Container failed to start within timeout period');
  }

  private async waitForProcessReady(): Promise<void> {
    if (!this.process) {
      throw new Error('Process not initialized');
    }

    // Wait for process to start up
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (this.process.killed || this.process.exitCode !== null) {
      throw new Error('Process failed to start');
    }
  }
}