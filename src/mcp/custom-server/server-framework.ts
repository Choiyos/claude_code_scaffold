/**
 * Custom MCP Server Development Framework
 * Provides templates, development tools, and testing infrastructure for custom MCP servers
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { WebSocketProtocol } from '../communication/websocket-protocol';
import { HTTPProtocol } from '../communication/http-protocol';

export interface MCPServerTemplate {
  name: string;
  description: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
  framework: 'fastify' | 'express' | 'koa' | 'fastapi' | 'gin' | 'actix';
  protocols: ('ws' | 'http' | 'tcp')[];
  features: string[];
  dependencies: Record<string, string>;
  files: Array<{
    path: string;
    content: string;
    template: boolean;
  }>;
  configuration: {
    environment: Record<string, any>;
    ports: number[];
    volumes: string[];
    buildSteps: string[];
  };
}

export interface ServerCapability {
  name: string;
  version: string;
  description: string;
  methods: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
    returns: Record<string, any>;
    examples: Array<{
      request: any;
      response: any;
    }>;
  }>;
  events: Array<{
    name: string;
    description: string;
    payload: Record<string, any>;
  }>;
}

export interface ServerManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  keywords: string[];
  capabilities: ServerCapability[];
  protocols: {
    websocket?: {
      endpoint: string;
      port: number;
    };
    http?: {
      endpoint: string;
      port: number;
      routes: Array<{
        method: string;
        path: string;
        description: string;
      }>;
    };
    tcp?: {
      port: number;
      protocol: string;
    };
  };
  configuration: {
    environment: Record<string, {
      description: string;
      type: 'string' | 'number' | 'boolean';
      required: boolean;
      default?: any;
    }>;
    secrets: string[];
  };
  health: {
    endpoint: string;
    timeout: number;
    interval: number;
  };
  metrics: {
    endpoint: string;
    format: 'prometheus' | 'json';
  };
  resources: {
    cpu: string;
    memory: string;
    storage?: string;
  };
  scaling: {
    minInstances: number;
    maxInstances: number;
    targetCpuPercent: number;
  };
}

export class MCPServerFramework extends EventEmitter {
  private templates: Map<string, MCPServerTemplate> = new Map();
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('MCPServerFramework');
    this.initializeBuiltinTemplates();
  }

  /**
   * Create a new MCP server project from template
   */
  async createServer(
    projectName: string,
    templateName: string,
    options: {
      outputPath: string;
      customizations?: {
        name?: string;
        description?: string;
        author?: string;
        license?: string;
        protocols?: ('ws' | 'http' | 'tcp')[];
        features?: string[];
      };
    }
  ): Promise<void> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    this.logger.info(`Creating MCP server: ${projectName} from template: ${templateName}`);

    const projectPath = path.join(options.outputPath, projectName);
    
    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Apply customizations
    const customizedTemplate = this.applyCustomizations(template, options.customizations);

    // Generate files
    await this.generateProjectFiles(projectPath, customizedTemplate, projectName);

    // Generate package.json / requirements.txt / go.mod etc.
    await this.generatePackageFile(projectPath, customizedTemplate, projectName);

    // Generate server manifest
    await this.generateServerManifest(projectPath, customizedTemplate, projectName);

    // Generate Docker files
    await this.generateDockerFiles(projectPath, customizedTemplate, projectName);

    // Generate CI/CD files
    await this.generateCIFiles(projectPath, customizedTemplate, projectName);

    this.logger.info(`MCP server project created: ${projectPath}`);
    this.emit('server:created', { projectName, templateName, projectPath });
  }

  /**
   * Add a custom template
   */
  addTemplate(template: MCPServerTemplate): void {
    this.templates.set(template.name, template);
    this.logger.info(`Added template: ${template.name}`);
    this.emit('template:added', { template });
  }

  /**
   * Get available templates
   */
  getTemplates(): MCPServerTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by name
   */
  getTemplate(name: string): MCPServerTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * Validate server manifest
   */
  async validateManifest(manifestPath: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: ServerManifest = JSON.parse(manifestContent);

      // Validate required fields
      if (!manifest.name) errors.push('Missing required field: name');
      if (!manifest.version) errors.push('Missing required field: version');
      if (!manifest.description) errors.push('Missing required field: description');

      // Validate version format
      if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
        errors.push('Invalid version format, expected semver');
      }

      // Validate capabilities
      if (!manifest.capabilities || manifest.capabilities.length === 0) {
        warnings.push('No capabilities defined');
      }

      // Validate protocols
      if (!manifest.protocols || Object.keys(manifest.protocols).length === 0) {
        errors.push('At least one protocol must be defined');
      }

      // Validate health check
      if (!manifest.health?.endpoint) {
        warnings.push('No health check endpoint defined');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to parse manifest: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Test server locally
   */
  async testServer(
    projectPath: string,
    options?: {
      port?: number;
      protocol?: 'ws' | 'http';
      timeout?: number;
    }
  ): Promise<{
    success: boolean;
    results: Array<{
      test: string;
      passed: boolean;
      error?: string;
      duration: number;
    }>;
  }> {
    this.logger.info(`Testing MCP server at: ${projectPath}`);

    const results: any[] = [];
    let success = true;

    try {
      // Load server manifest
      const manifestPath = path.join(projectPath, 'mcp-server.json');
      const manifest: ServerManifest = JSON.parse(
        await fs.readFile(manifestPath, 'utf-8')
      );

      // Test 1: Health check
      const healthResult = await this.testHealthCheck(manifest, options);
      results.push(healthResult);
      if (!healthResult.passed) success = false;

      // Test 2: Protocol connectivity
      const connectivityResult = await this.testConnectivity(manifest, options);
      results.push(connectivityResult);
      if (!connectivityResult.passed) success = false;

      // Test 3: Capability methods
      const capabilityResults = await this.testCapabilities(manifest, options);
      results.push(...capabilityResults);
      if (capabilityResults.some(r => !r.passed)) success = false;

      // Test 4: Load testing
      const loadResult = await this.testLoad(manifest, options);
      results.push(loadResult);
      if (!loadResult.passed) success = false;

      return { success, results };

    } catch (error) {
      return {
        success: false,
        results: [{
          test: 'server-startup',
          passed: false,
          error: error.message,
          duration: 0
        }]
      };
    }
  }

  /**
   * Package server for distribution
   */
  async packageServer(
    projectPath: string,
    options: {
      format: 'docker' | 'npm' | 'zip';
      outputPath: string;
      version?: string;
      registry?: string;
    }
  ): Promise<string> {
    this.logger.info(`Packaging MCP server: ${projectPath}`);

    switch (options.format) {
      case 'docker':
        return this.packageAsDocker(projectPath, options);
      case 'npm':
        return this.packageAsNpm(projectPath, options);
      case 'zip':
        return this.packageAsZip(projectPath, options);
      default:
        throw new Error(`Unsupported package format: ${options.format}`);
    }
  }

  /**
   * Generate server documentation
   */
  async generateDocs(
    projectPath: string,
    options?: {
      format?: 'markdown' | 'html' | 'pdf';
      outputPath?: string;
    }
  ): Promise<string> {
    const manifestPath = path.join(projectPath, 'mcp-server.json');
    const manifest: ServerManifest = JSON.parse(
      await fs.readFile(manifestPath, 'utf-8')
    );

    const docsContent = this.generateMarkdownDocs(manifest);
    const outputPath = options?.outputPath || path.join(projectPath, 'README.md');

    await fs.writeFile(outputPath, docsContent);
    this.logger.info(`Generated documentation: ${outputPath}`);

    return outputPath;
  }

  // Private methods

  private initializeBuiltinTemplates(): void {
    // TypeScript + Fastify template
    this.templates.set('typescript-fastify', {
      name: 'typescript-fastify',
      description: 'TypeScript MCP server with Fastify framework',
      language: 'typescript',
      framework: 'fastify',
      protocols: ['ws', 'http'],
      features: ['health-check', 'metrics', 'logging', 'validation'],
      dependencies: {
        'fastify': '^4.0.0',
        'ws': '^8.0.0',
        '@types/node': '^18.0.0',
        'typescript': '^5.0.0',
        'zod': '^3.0.0'
      },
      files: [
        {
          path: 'src/server.ts',
          template: true,
          content: this.getTypeScriptServerTemplate()
        },
        {
          path: 'src/handlers/health.ts',
          template: true,
          content: this.getHealthHandlerTemplate()
        },
        {
          path: 'src/handlers/capabilities.ts',
          template: true,
          content: this.getCapabilitiesHandlerTemplate()
        },
        {
          path: 'tsconfig.json',
          template: false,
          content: JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              module: 'commonjs',
              lib: ['ES2020'],
              outDir: './dist',
              rootDir: './src',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist']
          }, null, 2)
        }
      ],
      configuration: {
        environment: {
          NODE_ENV: 'development',
          PORT: 3000,
          WS_PORT: 3001
        },
        ports: [3000, 3001],
        volumes: ['/app/logs'],
        buildSteps: ['npm install', 'npm run build']
      }
    });

    // Python + FastAPI template
    this.templates.set('python-fastapi', {
      name: 'python-fastapi',
      description: 'Python MCP server with FastAPI framework',
      language: 'python',
      framework: 'fastapi',
      protocols: ['http', 'ws'],
      features: ['health-check', 'metrics', 'logging', 'validation'],
      dependencies: {
        'fastapi': '^0.104.0',
        'uvicorn': '^0.24.0',
        'websockets': '^12.0',
        'pydantic': '^2.5.0'
      },
      files: [
        {
          path: 'src/main.py',
          template: true,
          content: this.getPythonServerTemplate()
        },
        {
          path: 'requirements.txt',
          template: false,
          content: 'fastapi>=0.104.0\nuvicorn>=0.24.0\nwebsockets>=12.0\npydantic>=2.5.0'
        }
      ],
      configuration: {
        environment: {
          PYTHONPATH: '/app/src',
          PORT: 8000
        },
        ports: [8000],
        volumes: ['/app/logs'],
        buildSteps: ['pip install -r requirements.txt']
      }
    });
  }

  private applyCustomizations(
    template: MCPServerTemplate,
    customizations?: any
  ): MCPServerTemplate {
    if (!customizations) {
      return template;
    }

    return {
      ...template,
      ...customizations,
      configuration: {
        ...template.configuration,
        ...customizations.configuration
      }
    };
  }

  private async generateProjectFiles(
    projectPath: string,
    template: MCPServerTemplate,
    projectName: string
  ): Promise<void> {
    for (const file of template.files) {
      const filePath = path.join(projectPath, file.path);
      const fileDir = path.dirname(filePath);

      // Ensure directory exists
      await fs.mkdir(fileDir, { recursive: true });

      let content = file.content;
      
      if (file.template) {
        // Apply template variables
        content = content
          .replace(/{{PROJECT_NAME}}/g, projectName)
          .replace(/{{TEMPLATE_NAME}}/g, template.name)
          .replace(/{{FRAMEWORK}}/g, template.framework);
      }

      await fs.writeFile(filePath, content);
    }
  }

  private async generatePackageFile(
    projectPath: string,
    template: MCPServerTemplate,
    projectName: string
  ): Promise<void> {
    switch (template.language) {
      case 'typescript':
      case 'javascript':
        const packageJson = {
          name: projectName,
          version: '1.0.0',
          description: `MCP server generated from ${template.name} template`,
          main: 'dist/server.js',
          scripts: {
            build: 'tsc',
            start: 'node dist/server.js',
            dev: 'ts-node src/server.ts',
            test: 'npm run build && node dist/server.js --test'
          },
          dependencies: template.dependencies,
          devDependencies: {
            '@types/node': '^18.0.0',
            'ts-node': '^10.0.0',
            'typescript': '^5.0.0'
          }
        };
        await fs.writeFile(
          path.join(projectPath, 'package.json'),
          JSON.stringify(packageJson, null, 2)
        );
        break;

      case 'python':
        const requirementsTxt = Object.entries(template.dependencies)
          .map(([pkg, version]) => `${pkg}${version}`)
          .join('\n');
        await fs.writeFile(
          path.join(projectPath, 'requirements.txt'),
          requirementsTxt
        );
        break;
    }
  }

  private async generateServerManifest(
    projectPath: string,
    template: MCPServerTemplate,
    projectName: string
  ): Promise<void> {
    const manifest: ServerManifest = {
      name: projectName,
      version: '1.0.0',
      description: `MCP server generated from ${template.name} template`,
      author: 'Generated',
      license: 'MIT',
      keywords: ['mcp', 'server', template.language, template.framework],
      capabilities: [
        {
          name: 'example',
          version: '1.0.0',
          description: 'Example capability',
          methods: [
            {
              name: 'hello',
              description: 'Returns a greeting',
              parameters: {
                name: { type: 'string', required: true }
              },
              returns: {
                message: { type: 'string' }
              },
              examples: [
                {
                  request: { name: 'World' },
                  response: { message: 'Hello, World!' }
                }
              ]
            }
          ],
          events: []
        }
      ],
      protocols: {},
      configuration: {
        environment: Object.fromEntries(
          Object.entries(template.configuration.environment).map(([key, value]) => [
            key,
            {
              description: `Environment variable for ${key}`,
              type: typeof value as any,
              required: false,
              default: value
            }
          ])
        ),
        secrets: []
      },
      health: {
        endpoint: '/health',
        timeout: 5000,
        interval: 30000
      },
      metrics: {
        endpoint: '/metrics',
        format: 'json'
      },
      resources: {
        cpu: '100m',
        memory: '128Mi'
      },
      scaling: {
        minInstances: 1,
        maxInstances: 5,
        targetCpuPercent: 70
      }
    };

    // Add protocol configurations
    if (template.protocols.includes('http')) {
      manifest.protocols.http = {
        endpoint: 'http://localhost',
        port: 3000,
        routes: [
          { method: 'GET', path: '/health', description: 'Health check' },
          { method: 'GET', path: '/metrics', description: 'Metrics endpoint' },
          { method: 'POST', path: '/execute', description: 'Execute MCP method' }
        ]
      };
    }

    if (template.protocols.includes('ws')) {
      manifest.protocols.websocket = {
        endpoint: 'ws://localhost',
        port: 3001
      };
    }

    await fs.writeFile(
      path.join(projectPath, 'mcp-server.json'),
      JSON.stringify(manifest, null, 2)
    );
  }

  private async generateDockerFiles(
    projectPath: string,
    template: MCPServerTemplate,
    projectName: string
  ): Promise<void> {
    let dockerfile = '';

    switch (template.language) {
      case 'typescript':
      case 'javascript':
        dockerfile = `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE ${template.configuration.ports.join(' ')}

CMD ["npm", "start"]
`.trim();
        break;

      case 'python':
        dockerfile = `
FROM python:3.11-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE ${template.configuration.ports.join(' ')}

CMD ["python", "src/main.py"]
`.trim();
        break;
    }

    await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfile);

    // Docker Compose
    const dockerCompose = {
      version: '3.8',
      services: {
        [projectName]: {
          build: '.',
          ports: template.configuration.ports.map(port => `${port}:${port}`),
          environment: template.configuration.environment,
          volumes: template.configuration.volumes.map(vol => `${vol}:${vol}`),
          restart: 'unless-stopped'
        }
      }
    };

    await fs.writeFile(
      path.join(projectPath, 'docker-compose.yml'),
      JSON.stringify(dockerCompose, null, 2)
    );
  }

  private async generateCIFiles(
    projectPath: string,
    template: MCPServerTemplate,
    projectName: string
  ): Promise<void> {
    // GitHub Actions workflow
    const githubWorkflow = {
      name: 'CI/CD',
      on: {
        push: { branches: ['main'] },
        pull_request: { branches: ['main'] }
      },
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          steps: [
            { uses: 'actions/checkout@v3' },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v3',
              with: { 'node-version': '18' }
            },
            {
              name: 'Install dependencies',
              run: 'npm ci'
            },
            {
              name: 'Build',
              run: 'npm run build'
            },
            {
              name: 'Test',
              run: 'npm test'
            }
          ]
        },
        deploy: {
          'runs-on': 'ubuntu-latest',
          needs: 'test',
          if: "github.ref == 'refs/heads/main'",
          steps: [
            { uses: 'actions/checkout@v3' },
            {
              name: 'Build and push Docker image',
              run: 'docker build -t ${{ github.repository }}:latest .'
            }
          ]
        }
      }
    };

    const workflowDir = path.join(projectPath, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(
      path.join(workflowDir, 'ci.yml'),
      JSON.stringify(githubWorkflow, null, 2)
    );
  }

  private async testHealthCheck(
    manifest: ServerManifest,
    options?: any
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Implementation would test health endpoint
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        test: 'health-check',
        passed: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        test: 'health-check',
        passed: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  private async testConnectivity(
    manifest: ServerManifest,
    options?: any
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Implementation would test protocol connectivity
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        test: 'connectivity',
        passed: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        test: 'connectivity',
        passed: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  private async testCapabilities(
    manifest: ServerManifest,
    options?: any
  ): Promise<any[]> {
    const results: any[] = [];
    
    for (const capability of manifest.capabilities) {
      for (const method of capability.methods) {
        const startTime = Date.now();
        
        try {
          // Implementation would test each method
          await new Promise(resolve => setTimeout(resolve, 50));
          
          results.push({
            test: `capability-${capability.name}-${method.name}`,
            passed: true,
            duration: Date.now() - startTime
          });
        } catch (error) {
          results.push({
            test: `capability-${capability.name}-${method.name}`,
            passed: false,
            error: error.message,
            duration: Date.now() - startTime
          });
        }
      }
    }
    
    return results;
  }

  private async testLoad(
    manifest: ServerManifest,
    options?: any
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Implementation would perform load testing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      return {
        test: 'load-test',
        passed: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        test: 'load-test',
        passed: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  private async packageAsDocker(
    projectPath: string,
    options: any
  ): Promise<string> {
    // Implementation would build Docker image
    const imageName = `${path.basename(projectPath)}:${options.version || 'latest'}`;
    this.logger.info(`Building Docker image: ${imageName}`);
    return imageName;
  }

  private async packageAsNpm(
    projectPath: string,
    options: any
  ): Promise<string> {
    // Implementation would run npm pack
    const tarballName = `${path.basename(projectPath)}-${options.version || '1.0.0'}.tgz`;
    this.logger.info(`Creating NPM package: ${tarballName}`);
    return path.join(options.outputPath, tarballName);
  }

  private async packageAsZip(
    projectPath: string,
    options: any
  ): Promise<string> {
    // Implementation would create ZIP file
    const zipName = `${path.basename(projectPath)}-${options.version || '1.0.0'}.zip`;
    this.logger.info(`Creating ZIP package: ${zipName}`);
    return path.join(options.outputPath, zipName);
  }

  private generateMarkdownDocs(manifest: ServerManifest): string {
    return `
# ${manifest.name}

${manifest.description}

## Version
${manifest.version}

## Author
${manifest.author}

## Capabilities

${manifest.capabilities.map(cap => `
### ${cap.name} v${cap.version}

${cap.description}

#### Methods

${cap.methods.map(method => `
##### ${method.name}

${method.description}

**Parameters:**
\`\`\`json
${JSON.stringify(method.parameters, null, 2)}
\`\`\`

**Returns:**
\`\`\`json
${JSON.stringify(method.returns, null, 2)}
\`\`\`

**Example:**
\`\`\`json
Request: ${JSON.stringify(method.examples[0]?.request || {}, null, 2)}
Response: ${JSON.stringify(method.examples[0]?.response || {}, null, 2)}
\`\`\`
`).join('\n')}
`).join('\n')}

## Configuration

### Environment Variables

${Object.entries(manifest.configuration.environment).map(([key, config]) => `
- **${key}**: ${config.description} (${config.type}${config.required ? ', required' : ', optional'})${config.default ? ` - Default: \`${config.default}\`` : ''}
`).join('')}

## Health Check

- **Endpoint**: ${manifest.health.endpoint}
- **Timeout**: ${manifest.health.timeout}ms
- **Interval**: ${manifest.health.interval}ms

## Metrics

- **Endpoint**: ${manifest.metrics.endpoint}
- **Format**: ${manifest.metrics.format}

## Resource Requirements

- **CPU**: ${manifest.resources.cpu}
- **Memory**: ${manifest.resources.memory}
${manifest.resources.storage ? `- **Storage**: ${manifest.resources.storage}` : ''}

## Scaling

- **Min Instances**: ${manifest.scaling.minInstances}
- **Max Instances**: ${manifest.scaling.maxInstances}
- **Target CPU**: ${manifest.scaling.targetCpuPercent}%
`.trim();
  }

  private getTypeScriptServerTemplate(): string {
    return `
import Fastify from 'fastify';
import { WebSocketServer } from 'ws';

const server = Fastify({ logger: true });

// Health check endpoint
server.get('/health', async (request, reply) => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Metrics endpoint
server.get('/metrics', async (request, reply) => {
  return {
    requests: 0,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
});

// MCP execute endpoint
server.post('/execute', async (request, reply) => {
  const { method, params } = request.body as any;
  
  switch (method) {
    case 'hello':
      return { message: \`Hello, \${params.name || 'World'}!\` };
    default:
      reply.code(404);
      return { error: 'Method not found' };
  }
});

// WebSocket server
const wss = new WebSocketServer({ port: process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      // Handle WebSocket messages
      ws.send(JSON.stringify({ id: data.id, result: 'processed' }));
    } catch (error) {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });
});

// Start server
const start = async () => {
  try {
    await server.listen({ port: process.env.PORT ? parseInt(process.env.PORT) : 3000, host: '0.0.0.0' });
    console.log('{{PROJECT_NAME}} MCP server started');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
`.trim();
  }

  private getHealthHandlerTemplate(): string {
    return `
export async function healthHandler(request: any, reply: any) {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  };
}
`.trim();
  }

  private getCapabilitiesHandlerTemplate(): string {
    return `
export async function capabilitiesHandler(request: any, reply: any) {
  return {
    capabilities: [
      {
        name: 'example',
        version: '1.0.0',
        methods: ['hello'],
        description: 'Example capability for {{PROJECT_NAME}}'
      }
    ]
  };
}
`.trim();
  }

  private getPythonServerTemplate(): string {
    return `
from fastapi import FastAPI, WebSocket
import uvicorn
import json
import time
import psutil
import os

app = FastAPI(title="{{PROJECT_NAME}}", version="1.0.0")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "uptime": time.time() - start_time,
        "memory": psutil.virtual_memory()._asdict()
    }

@app.get("/metrics")
async def metrics():
    return {
        "requests": 0,
        "uptime": time.time() - start_time,
        "cpu_percent": psutil.cpu_percent(),
        "memory": psutil.virtual_memory()._asdict()
    }

@app.post("/execute")
async def execute(request: dict):
    method = request.get("method")
    params = request.get("params", {})
    
    if method == "hello":
        name = params.get("name", "World")
        return {"message": f"Hello, {name}!"}
    else:
        return {"error": "Method not found"}, 404

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            # Handle WebSocket messages
            response = {"id": message.get("id"), "result": "processed"}
            await websocket.send_text(json.dumps(response))
    except Exception as e:
        print(f"WebSocket error: {e}")

start_time = time.time()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
`.trim();
  }
}