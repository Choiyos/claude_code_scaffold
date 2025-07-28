# Claude Code + SuperClaude + MCP 시스템 구현 가이드

## 🚀 빠른 시작 (Quick Start)

### 1. 환경 준비
```bash
# 필수 도구 설치 확인
docker --version          # 20.10.0+
docker-compose --version  # 2.0.0+
node --version            # 18.0.0+
python --version          # 3.9.0+
git --version             # 2.30.0+

# 프로젝트 클론
git clone https://github.com/your-org/claude-dev-env
cd claude-dev-env
```

### 2. 원클릭 설정
```bash
# 자동 설정 스크립트 실행
./scripts/quick-setup.sh

# 또는 Docker Compose로 전체 스택 시작
docker-compose up -d
```

### 3. 개발환경 접속
```bash
# VS Code DevContainer로 열기
code .

# CLI 도구 설치 및 테스트
pip install -e ./scripts/claude-env
claude-env status
```

## 📁 프로젝트 구조

```
claude-dev-env/
├── .devcontainer/              # DevContainer 설정
│   ├── devcontainer.json      # VS Code DevContainer 구성
│   ├── Dockerfile             # 개발환경 이미지
│   ├── docker-compose.yml     # 개발 서비스
│   └── scripts/               # 설정 스크립트
├── services/                   # 마이크로서비스
│   ├── api-gateway/           # API 게이트웨이
│   ├── environment-controller/ # 환경 컨트롤러
│   ├── mcp-orchestrator/      # MCP 서버 오케스트레이터
│   └── configuration-manager/ # 설정 관리자
├── src/                       # 프론트엔드 소스
│   ├── dashboard/             # 웹 대시보드
│   ├── vscode-extension/      # VS Code 확장
│   └── onboarding/            # 온보딩 시스템
├── scripts/                   # 관리 도구
│   ├── claude-env             # CLI 도구
│   ├── setup/                 # 설정 스크립트
│   └── monitoring/            # 모니터링 도구
├── config/                    # 설정 파일
│   ├── environments/          # 환경별 설정
│   ├── teams/                # 팀별 설정
│   └── schemas/              # 설정 스키마
└── k8s/                      # Kubernetes 매니페스트
    ├── development/
    ├── staging/
    └── production/
```

## 🔧 단계별 구현 가이드

### Phase 1: 핵심 인프라 구축 (1-2주)

#### 1.1 DevContainer 환경 설정
```json
// .devcontainer/devcontainer.json
{
  "name": "Claude Development Environment",
  "dockerComposeFile": "docker-compose.yml",
  "service": "devcontainer",
  "workspaceFolder": "/workspace",
  "features": {
    "ghcr.io/devcontainers/features/node:1": "20",
    "ghcr.io/devcontainers/features/python:1": "3.11",
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/kubectl-helm-minikube:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-vscode.vscode-typescript-next",
        "bradlc.vscode-tailwindcss",
        "ms-python.python",
        "ms-vscode.claude-code"
      ],
      "settings": {
        "terminal.integrated.shell.linux": "/bin/zsh",
        "editor.formatOnSave": true,
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": true
        }
      }
    }
  },
  "postCreateCommand": "bash .devcontainer/scripts/post-create.sh",
  "postStartCommand": "bash .devcontainer/scripts/post-start.sh",
  "remoteUser": "vscode"
}
```

#### 1.2 기본 서비스 구성
```yaml
# .devcontainer/docker-compose.yml
version: '3.8'
services:
  devcontainer:
    build: 
      context: .
      dockerfile: Dockerfile
    volumes:
      - ../:/workspace:cached
      - ~/.claude:/home/vscode/.claude
      - /var/run/docker.sock:/var/run/docker.sock
    command: sleep infinity
    networks:
      - claude-dev-network
    environment:
      - NODE_ENV=development
      - PYTHONPATH=/workspace

  # 데이터베이스 서비스
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: claude_env
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - claude-dev-network

  # 캐시 서비스
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - claude-dev-network

  # 모니터링 서비스
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - claude-dev-network

volumes:
  postgres-data:
  redis-data:

networks:
  claude-dev-network:
    driver: bridge
```

#### 1.3 초기 설정 스크립트
```bash
#!/bin/bash
# .devcontainer/scripts/post-create.sh

echo "🚀 Claude Development Environment 초기화 중..."

# Zsh 및 Oh My Zsh 설치
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
git clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting

# Powerlevel10k 테마 설치
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/.oh-my-zsh/custom/themes/powerlevel10k

# Node.js 종속성 설치
cd /workspace
npm install -g @anthropic-ai/claude-code yarn pnpm

# Python 종속성 설치
pip install -r requirements.txt

# Claude 환경 CLI 설치
pip install -e ./scripts/claude-env

# Git 설정
git config --global init.defaultBranch main
git config --global pull.rebase false

# 개발 데이터베이스 초기화
./scripts/init-database.sh

echo "✅ 초기화 완료! 'claude-env status'로 상태를 확인하세요."
```

### Phase 2: 서비스 구현 (2-3주)

#### 2.1 API 게이트웨이 구현
```typescript
// services/api-gateway/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// 보안 및 성능 미들웨어
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // 요청 제한
  message: 'Too many requests from this IP'
});
app.use(limiter);

// 프록시 설정
app.use('/api/environments', createProxyMiddleware({
  target: 'http://environment-controller:3001',
  changeOrigin: true,
  pathRewrite: { '^/api/environments': '' }
}));

app.use('/api/mcp', createProxyMiddleware({
  target: 'http://mcp-orchestrator:3002',
  changeOrigin: true,
  pathRewrite: { '^/api/mcp': '' }
}));

app.use('/api/config', createProxyMiddleware({
  target: 'http://configuration-manager:3003',
  changeOrigin: true,
  pathRewrite: { '^/api/config': '' }
}));

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});
```

#### 2.2 환경 컨트롤러 구현
```typescript
// services/environment-controller/src/environment-controller.ts
import Docker from 'dockerode';
import { EventEmitter } from 'events';

export class EnvironmentController extends EventEmitter {
  private docker: Docker;
  private environments: Map<string, EnvironmentInstance> = new Map();

  constructor() {
    super();
    this.docker = new Docker();
  }

  async createEnvironment(config: EnvironmentConfig): Promise<string> {
    const environmentId = this.generateId();
    
    try {
      // Docker Compose 파일 생성
      const composeFile = this.generateComposeFile(config);
      await this.writeComposeFile(environmentId, composeFile);
      
      // 환경 시작
      await this.startEnvironment(environmentId);
      
      // 환경 등록
      const instance = new EnvironmentInstance(environmentId, config);
      this.environments.set(environmentId, instance);
      
      this.emit('environment-created', { environmentId, config });
      return environmentId;
      
    } catch (error) {
      this.emit('environment-error', { environmentId, error });
      throw error;
    }
  }

  async updateEnvironment(environmentId: string, config: EnvironmentConfig): Promise<void> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new Error(`Environment ${environmentId} not found`);
    }

    try {
      // 블루-그린 배포 전략
      const tempEnvironmentId = `${environmentId}-temp`;
      await this.createEnvironment({ ...config, id: tempEnvironmentId });
      
      // 헬스체크
      await this.waitForHealthy(tempEnvironmentId);
      
      // 트래픽 전환
      await this.switchTraffic(environmentId, tempEnvironmentId);
      
      // 이전 환경 정리
      await this.destroyEnvironment(environmentId);
      await this.renameEnvironment(tempEnvironmentId, environmentId);
      
      this.emit('environment-updated', { environmentId, config });
      
    } catch (error) {
      this.emit('environment-error', { environmentId, error });
      throw error;
    }
  }

  private generateComposeFile(config: EnvironmentConfig): string {
    return `
version: '3.8'
services:
  devcontainer:
    image: ${config.image || 'claude-env/devcontainer:latest'}
    volumes:
      - workspace:/workspace
      - ${config.homeDir}:/home/vscode/.claude
    environment:
      - NODE_VERSION=${config.nodeVersion || '20'}
      - PYTHON_VERSION=${config.pythonVersion || '3.11'}
    networks:
      - claude-network
      
  ${config.mcpServers?.map(server => `
  mcp-${server.name}:
    image: ${server.image}
    environment:
      - MCP_CONFIG=${JSON.stringify(server.config)}
    networks:
      - claude-network
  `).join('') || ''}

volumes:
  workspace:

networks:
  claude-network:
    driver: bridge
    `;
  }
}
```

#### 2.3 MCP 오케스트레이터 구현
```typescript
// services/mcp-orchestrator/src/orchestrator.ts
export class MCPOrchestrator {
  private servers: Map<string, MCPServerInstance> = new Map();
  private loadBalancer: LoadBalancer;
  private healthMonitor: HealthMonitor;

  constructor() {
    this.loadBalancer = new LoadBalancer();
    this.healthMonitor = new HealthMonitor();
  }

  async deployServer(config: MCPServerConfig): Promise<void> {
    const server = new MCPServerInstance(config);
    
    try {
      await server.deploy();
      await server.waitForReady();
      
      this.servers.set(config.id, server);
      this.loadBalancer.addServer(server);
      this.healthMonitor.monitor(server);
      
      console.log(`✅ MCP Server ${config.id} deployed successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to deploy MCP Server ${config.id}:`, error);
      throw error;
    }
  }

  async routeRequest(request: MCPRequest): Promise<MCPResponse> {
    const server = this.loadBalancer.selectServer(request);
    
    if (!server) {
      throw new Error('No healthy MCP servers available');
    }

    try {
      const response = await server.handleRequest(request);
      this.updateMetrics(server, response);
      return response;
      
    } catch (error) {
      await this.handleServerError(server, error);
      throw error;
    }
  }

  private async handleServerError(server: MCPServerInstance, error: Error): Promise<void> {
    server.recordError(error);
    
    if (server.errorCount > 3) {
      console.warn(`🚨 Server ${server.id} marked as unhealthy due to errors`);
      server.markUnhealthy();
      
      // 자동 복구 시도
      setTimeout(() => {
        this.attemptServerRecovery(server);
      }, 30000);
    }
  }
}
```

### Phase 3: 프론트엔드 구현 (1-2주)

#### 3.1 웹 대시보드 구현
```typescript
// src/dashboard/pages/dashboard.tsx
import React, { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { EnvironmentGrid } from '@/components/EnvironmentGrid';
import { SystemHealth } from '@/components/SystemHealth';
import { ActivityFeed } from '@/components/ActivityFeed';

export default function Dashboard() {
  const [environments, setEnvironments] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const { socket, isConnected } = useWebSocket('ws://localhost:4000/ws');

  useEffect(() => {
    if (socket) {
      socket.on('environment-update', (data) => {
        setEnvironments(prev => 
          prev.map(env => env.id === data.id ? data : env)
        );
      });

      socket.on('system-health', (data) => {
        setSystemHealth(data);
      });
    }
  }, [socket]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Claude Development Environment
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            팀 개발환경 상태 및 관리 대시보드
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <EnvironmentGrid environments={environments} />
          </div>
          <div>
            <SystemHealth data={systemHealth} isConnected={isConnected} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ActivityFeed />
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full text-left p-3 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 transition-colors">
                🚀 새 환경 생성
              </button>
              <button className="w-full text-left p-3 rounded-md bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 transition-colors">
                🔄 전체 환경 동기화
              </button>
              <button className="w-full text-left p-3 rounded-md bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 transition-colors">
                📊 성능 보고서 생성
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### 3.2 VS Code 확장 구현
```typescript
// src/vscode-extension/src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentProvider } from './providers/EnvironmentProvider';
import { MCPServerProvider } from './providers/MCPServerProvider';
import { ConfigurationValidator } from './validators/ConfigurationValidator';

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Environment Extension 활성화');

  // Tree View 제공자 등록
  const environmentProvider = new EnvironmentProvider();
  const mcpServerProvider = new MCPServerProvider();

  vscode.window.registerTreeDataProvider('claude-environments', environmentProvider);
  vscode.window.registerTreeDataProvider('claude-mcp-servers', mcpServerProvider);

  // 명령어 등록
  const commands = [
    vscode.commands.registerCommand('claude-env.refresh', () => {
      environmentProvider.refresh();
      mcpServerProvider.refresh();
    }),

    vscode.commands.registerCommand('claude-env.createEnvironment', async () => {
      const name = await vscode.window.showInputBox({
        prompt: '새 환경 이름을 입력하세요',
        placeHolder: 'my-environment'
      });

      if (name) {
        await environmentProvider.createEnvironment(name);
        vscode.window.showInformationMessage(`환경 '${name}' 생성 완료`);
      }
    }),

    vscode.commands.registerCommand('claude-env.syncEnvironment', async (item) => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "환경 동기화 중...",
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0 });
        await environmentProvider.syncEnvironment(item.id);
        progress.report({ increment: 100 });
      });

      vscode.window.showInformationMessage('환경 동기화 완료');
    }),

    vscode.commands.registerCommand('claude-env.deployMCPServer', async () => {
      const serverType = await vscode.window.showQuickPick([
        'context7',
        'sequential', 
        'magic',
        'custom'
      ], {
        placeHolder: 'MCP 서버 유형을 선택하세요'
      });

      if (serverType) {
        await mcpServerProvider.deployServer(serverType);
        vscode.window.showInformationMessage(`${serverType} 서버 배포 완료`);
      }
    })
  ];

  // 설정 파일 유효성 검사
  const validator = new ConfigurationValidator();
  const configWatcher = vscode.workspace.createFileSystemWatcher('**/.claude/**/*.{json,yaml,yml}');
  
  configWatcher.onDidChange(async (uri) => {
    const diagnostics = await validator.validateFile(uri);
    if (diagnostics.length > 0) {
      vscode.window.showWarningMessage(`설정 파일에 문제가 있습니다: ${uri.fsPath}`);
    }
  });

  // 상태바 아이템
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = "$(cloud) Claude Env";
  statusBarItem.tooltip = "Claude Environment Status";
  statusBarItem.command = 'claude-env.showStatus';
  statusBarItem.show();

  context.subscriptions.push(...commands, configWatcher, statusBarItem);
}

export function deactivate() {
  console.log('Claude Environment Extension 비활성화');
}
```

### Phase 4: 배포 및 모니터링 (1주)

#### 4.1 Kubernetes 배포 구성
```yaml
# k8s/production/api-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-env-api-gateway
  namespace: claude-system
  labels:
    app: api-gateway
    component: claude-env
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: claude-env/api-gateway:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-service
  namespace: claude-system
spec:
  selector:
    app: api-gateway
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-env-ingress
  namespace: claude-system
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - claude-env.company.com
    secretName: claude-env-tls
  rules:
  - host: claude-env.company.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway-service
            port:
              number: 80
```

#### 4.2 모니터링 설정
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'claude-env-api'
    static_configs:
      - targets: ['api-gateway:3000']
    metrics_path: /metrics
    scrape_interval: 10s

  - job_name: 'claude-env-orchestrator'
    static_configs:
      - targets: ['mcp-orchestrator:3002']
    metrics_path: /metrics
    scrape_interval: 10s

  - job_name: 'claude-env-controller'
    static_configs:
      - targets: ['environment-controller:3001']
    metrics_path: /metrics
    scrape_interval: 10s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

## 🧪 테스트 전략

### 단위 테스트
```typescript
// services/api-gateway/tests/app.test.ts
import request from 'supertest';
import { app } from '../src/app';

describe('API Gateway', () => {
  test('Health check endpoint', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy'
    });
  });

  test('Rate limiting', async () => {
    // 1000번 요청 후 429 에러 확인
    for (let i = 0; i < 1001; i++) {
      const response = await request(app).get('/health');
      if (i < 1000) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
      }
    }
  });
});
```

### 통합 테스트
```bash
#!/bin/bash
# tests/integration/test-full-workflow.sh

echo "🧪 Full Workflow Integration Test"

# 1. 환경 생성 테스트
echo "1. Testing environment creation..."
ENVIRONMENT_ID=$(claude-env create-environment --name "test-env" --template "nodejs")
if [ $? -eq 0 ]; then
    echo "✅ Environment creation successful: $ENVIRONMENT_ID"
else
    echo "❌ Environment creation failed"
    exit 1
fi

# 2. MCP 서버 배포 테스트
echo "2. Testing MCP server deployment..."
claude-env deploy-mcp-server --type "context7" --environment "$ENVIRONMENT_ID"
if [ $? -eq 0 ]; then
    echo "✅ MCP server deployment successful"
else
    echo "❌ MCP server deployment failed"
    exit 1
fi

# 3. 설정 동기화 테스트
echo "3. Testing configuration sync..."
claude-env sync --environment "$ENVIRONMENT_ID"
if [ $? -eq 0 ]; then
    echo "✅ Configuration sync successful"
else
    echo "❌ Configuration sync failed"
    exit 1
fi

# 4. 헬스체크 테스트
echo "4. Testing health check..."
HEALTH_STATUS=$(claude-env status --environment "$ENVIRONMENT_ID" --format json | jq -r '.status')
if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "✅ Health check successful"
else
    echo "❌ Health check failed: $HEALTH_STATUS"
    exit 1
fi

# 5. 정리
echo "5. Cleaning up..."
claude-env destroy-environment --id "$ENVIRONMENT_ID"
echo "✅ Integration test completed successfully"
```

### E2E 테스트
```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test('Dashboard workflow', async ({ page }) => {
  // 대시보드 접속
  await page.goto('http://localhost:3000');
  
  // 환경 목록 확인
  await expect(page.locator('[data-testid="environment-grid"]')).toBeVisible();
  
  // 새 환경 생성
  await page.click('[data-testid="create-environment-button"]');
  await page.fill('[data-testid="environment-name-input"]', 'e2e-test-env');
  await page.selectOption('[data-testid="template-select"]', 'nodejs');
  await page.click('[data-testid="create-button"]');
  
  // 성공 메시지 확인
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  
  // 환경 상태 확인
  await expect(page.locator('[data-testid="environment-status"]')).toHaveText('Running');
  
  // MCP 서버 배포
  await page.click('[data-testid="deploy-mcp-button"]');
  await page.selectOption('[data-testid="mcp-type-select"]', 'context7');
  await page.click('[data-testid="deploy-button"]');
  
  // 배포 성공 확인
  await expect(page.locator('[data-testid="mcp-status"]')).toHaveText('Active');
});
```

## 🚀 배포 가이드

### 개발 환경 배포
```bash
# Docker Compose로 로컬 개발환경 시작
docker-compose -f docker-compose.dev.yml up -d

# 초기 데이터 설정
./scripts/seed-dev-data.sh

# 개발 서버 시작
npm run dev
```

### 스테이징 환경 배포
```bash
# Kubernetes 클러스터에 배포
kubectl apply -f k8s/staging/

# 데이터베이스 마이그레이션
kubectl exec -it deployment/api-gateway -- npm run migrate

# 헬스체크
kubectl get pods -l app=claude-env
```

### 프로덕션 환경 배포
```bash
# 프로덕션 배포 (CI/CD 파이프라인)
git tag v1.0.0
git push origin v1.0.0

# 수동 배포 (필요시)
helm upgrade --install claude-env ./helm/claude-env \
  --namespace claude-system \
  --values values.prod.yaml

# 배포 확인
helm test claude-env
```

## 📊 모니터링 및 문제 해결

### 로그 확인
```bash
# 애플리케이션 로그
kubectl logs -f deployment/api-gateway -c api-gateway

# MCP 서버 로그
kubectl logs -f deployment/mcp-orchestrator -c orchestrator

# 시스템 로그
kubectl logs -f daemonset/node-exporter
```

### 메트릭 확인
```bash
# Prometheus 메트릭 쿼리
curl "http://prometheus:9090/api/v1/query?query=claude_env_requests_total"

# Grafana 대시보드 접속
open http://grafana.company.com

# 커스텀 메트릭 확인
claude-env metrics --environment production
```

### 문제 해결 가이드
```bash
# 일반적인 문제 진단
claude-env doctor

# 환경 복구
claude-env recover --environment <env-id>

# 설정 검증
claude-env validate --config-path ./config/

# 로그 수집
claude-env collect-logs --output-path ./debug-logs/
```

## 🎯 성공 기준 및 검증

### 성능 기준
- 환경 생성 시간: < 5분
- API 응답 시간: < 200ms
- 시스템 가용성: > 99.9%
- 동시 사용자: 50+ 지원

### 기능 검증 체크리스트
```bash
# 핵심 기능 검증
□ DevContainer 환경 정상 생성
□ MCP 서버 자동 배포 및 연결
□ 설정 동기화 및 드리프트 감지
□ 웹 대시보드 실시간 업데이트
□ CLI 도구 모든 명령어 정상 동작
□ VS Code 확장 설치 및 연동
□ 자동 백업 및 복구 기능
□ 모니터링 및 알림 시스템
□ 보안 및 접근 제어
□ 멀티 환경 배포 지원
```

이 구현 가이드를 따라 단계별로 진행하면 완전한 Claude Code + SuperClaude + MCP 통합 개발환경을 구축할 수 있습니다.