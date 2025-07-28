# API Design: Claude Code + SuperClaude + MCP

## API Overview

The Claude Environment API provides RESTful endpoints and WebSocket connections for managing development environments, configurations, and MCP server interactions.

### Base URLs

- **Development**: `http://localhost:8080/api/v1`
- **Staging**: `https://staging-api.claude-env.company.com/api/v1`
- **Production**: `https://api.claude-env.company.com/api/v1`

### Authentication

All API requests require authentication using JWT tokens:

```http
Authorization: Bearer <jwt-token>
```

## REST API Endpoints

### Environment Management

#### Create Environment

```http
POST /environments

Request:
{
  "name": "frontend-dev",
  "team": "frontend",
  "project": "web-app",
  "config": {
    "nodeVersion": "20.11.0",
    "mcpServers": [
      {
        "name": "context7",
        "type": "context7",
        "version": "latest"
      },
      {
        "name": "sequential",
        "type": "sequential",
        "version": "latest"
      }
    ],
    "features": ["git", "docker", "typescript"],
    "resources": {
      "memory": "4Gi",
      "cpu": 2
    }
  }
}

Response:
{
  "id": "env_abc123",
  "name": "frontend-dev",
  "status": "initializing",
  "createdAt": "2024-01-15T10:00:00Z",
  "endpoints": {
    "devcontainer": "ws://localhost:3000",
    "api": "http://localhost:8080"
  }
}
```

#### Get Environment Status

```http
GET /environments/{environmentId}

Response:
{
  "id": "env_abc123",
  "name": "frontend-dev",
  "status": "running",
  "health": {
    "score": 95,
    "checks": [
      {
        "component": "devcontainer",
        "status": "healthy",
        "lastCheck": "2024-01-15T10:05:00Z"
      },
      {
        "component": "mcp-context7",
        "status": "healthy",
        "responseTime": 45
      }
    ]
  },
  "configuration": {
    "drift": 2.5,
    "lastSync": "2024-01-15T10:00:00Z",
    "version": "1.2.3"
  },
  "resources": {
    "cpu": {
      "used": 0.8,
      "limit": 2
    },
    "memory": {
      "used": "2.1Gi",
      "limit": "4Gi"
    }
  }
}
```

#### Update Environment

```http
PATCH /environments/{environmentId}

Request:
{
  "config": {
    "nodeVersion": "21.0.0",
    "features": ["git", "docker", "typescript", "eslint"]
  }
}

Response:
{
  "id": "env_abc123",
  "status": "updating",
  "changes": [
    {
      "field": "nodeVersion",
      "from": "20.11.0",
      "to": "21.0.0"
    },
    {
      "field": "features",
      "added": ["eslint"]
    }
  ],
  "estimatedDuration": 120
}
```

#### Delete Environment

```http
DELETE /environments/{environmentId}

Response:
{
  "id": "env_abc123",
  "status": "terminating",
  "message": "Environment will be deleted in 60 seconds"
}
```

### Configuration Management

#### Get Configuration

```http
GET /config?team=frontend&project=web-app&environment=development

Response:
{
  "version": "1.2.3",
  "layers": {
    "base": {
      "version": "1.0.0",
      "source": "git:base/"
    },
    "team": {
      "version": "1.1.0",
      "source": "git:teams/frontend/"
    },
    "project": {
      "version": "1.2.0",
      "source": "git:projects/web-app/"
    }
  },
  "computed": {
    "mcp": {
      "servers": [
        {
          "name": "context7",
          "type": "context7",
          "endpoint": "http://mcp-context7:3001",
          "version": "2.1.0"
        }
      ]
    },
    "environment": {
      "nodeVersion": "20.11.0",
      "npmRegistry": "https://registry.npmjs.org",
      "variables": {
        "NODE_ENV": "development",
        "API_URL": "https://api.example.com"
      }
    },
    "security": {
      "allowedDomains": ["*.example.com"],
      "secretsProvider": "vault",
      "mfaRequired": true
    }
  }
}
```

#### Update Configuration

```http
PUT /config/{layer}

Request:
{
  "path": "mcp.servers",
  "value": [
    {
      "name": "context7",
      "type": "context7",
      "version": "2.2.0"
    },
    {
      "name": "magic",
      "type": "magic",
      "version": "1.0.0"
    }
  ]
}

Response:
{
  "layer": "team",
  "path": "mcp.servers",
  "status": "updated",
  "version": "1.1.1",
  "timestamp": "2024-01-15T10:10:00Z"
}
```

#### Validate Configuration

```http
POST /config/validate

Request:
{
  "config": {
    "mcp": {
      "servers": [
        {
          "name": "invalid-server",
          "type": "unknown"
        }
      ]
    }
  }
}

Response:
{
  "valid": false,
  "errors": [
    {
      "path": "mcp.servers[0].type",
      "message": "Invalid server type: unknown",
      "suggestion": "Valid types: context7, sequential, magic, playwright"
    }
  ]
}
```

### Synchronization

#### Trigger Sync

```http
POST /sync

Request:
{
  "target": {
    "team": "frontend",
    "project": "web-app",
    "environment": "development"
  },
  "options": {
    "force": false,
    "dryRun": false
  }
}

Response:
{
  "id": "sync_xyz789",
  "status": "in_progress",
  "preview": {
    "changes": 5,
    "conflicts": 1,
    "estimatedDuration": 30
  }
}
```

#### Get Sync Status

```http
GET /sync/{syncId}

Response:
{
  "id": "sync_xyz789",
  "status": "completed",
  "result": {
    "success": true,
    "changes": 5,
    "conflicts": 1,
    "duration": 28,
    "details": [
      {
        "path": "mcp.servers[0].version",
        "type": "update",
        "from": "2.1.0",
        "to": "2.2.0"
      }
    ]
  }
}
```

#### Detect Drift

```http
GET /drift?team=frontend&project=web-app

Response:
{
  "percentage": 15.5,
  "severity": "medium",
  "paths": [
    {
      "path": "mcp.servers[0].version",
      "localValue": "2.1.0",
      "remoteValue": "2.2.0",
      "category": "mcp"
    }
  ],
  "canAutoRemediate": true,
  "recommendations": [
    "Sync MCP server configurations",
    "Update to latest Context7 version"
  ]
}
```

### MCP Server Management

#### List MCP Servers

```http
GET /mcp/servers

Response:
{
  "servers": [
    {
      "id": "mcp_context7_1",
      "name": "context7",
      "type": "context7",
      "status": "running",
      "version": "2.2.0",
      "endpoint": "http://mcp-context7-1:3001",
      "metrics": {
        "uptime": 3600,
        "requestsHandled": 1523,
        "averageResponseTime": 45,
        "errorRate": 0.1
      }
    }
  ]
}
```

#### Execute MCP Command

```http
POST /mcp/execute

Request:
{
  "server": "context7",
  "command": "get-library-docs",
  "params": {
    "library": "react",
    "version": "18.2.0"
  }
}

Response:
{
  "server": "context7",
  "command": "get-library-docs",
  "result": {
    "documentation": "...",
    "examples": [...],
    "version": "18.2.0"
  },
  "duration": 125,
  "cached": false
}
```

### Workspace Management

#### Create Workspace

```http
POST /workspaces

Request:
{
  "name": "feature-auth",
  "type": "project",
  "git": {
    "remote": "https://github.com/company/web-app.git",
    "branch": "feature/authentication"
  }
}

Response:
{
  "id": "ws_def456",
  "name": "feature-auth",
  "path": "/workspaces/feature-auth",
  "status": "cloning",
  "size": 0
}
```

#### List Workspaces

```http
GET /workspaces

Response:
{
  "workspaces": [
    {
      "id": "ws_def456",
      "name": "feature-auth",
      "type": "project",
      "size": 125000000,
      "lastModified": "2024-01-15T10:15:00Z",
      "git": {
        "remote": "https://github.com/company/web-app.git",
        "branch": "feature/authentication",
        "status": "clean"
      }
    }
  ]
}
```

### Security

#### Get API Keys

```http
GET /security/api-keys

Response:
{
  "keys": [
    {
      "id": "key_ghi789",
      "name": "CI/CD Pipeline",
      "created": "2024-01-01T00:00:00Z",
      "lastUsed": "2024-01-15T10:00:00Z",
      "permissions": ["read:config", "write:config", "execute:mcp"]
    }
  ]
}
```

#### Rotate Secrets

```http
POST /security/rotate

Request:
{
  "targets": ["api-keys", "mcp-credentials"],
  "schedule": "immediate"
}

Response:
{
  "id": "rotation_jkl012",
  "status": "in_progress",
  "targets": ["api-keys", "mcp-credentials"],
  "estimatedCompletion": "2024-01-15T10:20:00Z"
}
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://api.claude-env.company.com/ws');

ws.on('open', () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'jwt-token'
  }));
});
```

### Real-time Events

#### Configuration Changes

```javascript
// Subscribe to configuration changes
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'config:changes',
  filters: {
    team: 'frontend',
    project: 'web-app'
  }
}));

// Receive change notifications
ws.on('message', (data) => {
  const event = JSON.parse(data);
  if (event.type === 'config:changed') {
    console.log('Configuration changed:', event.data);
    // {
    //   path: 'mcp.servers[0].version',
    //   oldValue: '2.1.0',
    //   newValue: '2.2.0',
    //   timestamp: '2024-01-15T10:15:00Z'
    // }
  }
});
```

#### Sync Events

```javascript
// Subscribe to sync events
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'sync:events',
  filters: {
    team: 'frontend'
  }
}));

// Receive sync notifications
ws.on('message', (data) => {
  const event = JSON.parse(data);
  switch (event.type) {
    case 'sync:started':
      console.log('Sync started:', event.data.target);
      break;
    case 'sync:progress':
      console.log('Sync progress:', event.data.percentage);
      break;
    case 'sync:completed':
      console.log('Sync completed:', event.data.result);
      break;
    case 'sync:failed':
      console.error('Sync failed:', event.data.error);
      break;
  }
});
```

#### Environment Status

```javascript
// Subscribe to environment status
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'environment:status',
  filters: {
    environmentId: 'env_abc123'
  }
}));

// Receive status updates
ws.on('message', (data) => {
  const event = JSON.parse(data);
  if (event.type === 'environment:health') {
    console.log('Health update:', event.data);
    // {
    //   environmentId: 'env_abc123',
    //   health: {
    //     score: 95,
    //     components: [...]
    //   }
    // }
  }
});
```

## GraphQL API (Alternative)

For complex queries, a GraphQL endpoint is available:

```graphql
# Get environment with nested configuration
query GetEnvironment($id: ID!) {
  environment(id: $id) {
    id
    name
    status
    health {
      score
      checks {
        component
        status
        lastCheck
      }
    }
    configuration {
      version
      layers {
        base {
          version
          source
        }
        team {
          version
          source
        }
      }
      computed {
        mcp {
          servers {
            name
            type
            version
            endpoint
            status
          }
        }
      }
    }
    workspaces {
      id
      name
      size
      git {
        remote
        branch
        status
      }
    }
  }
}

# Subscribe to real-time changes
subscription ConfigChanges($team: String!, $project: String) {
  configurationChanged(team: $team, project: $project) {
    path
    oldValue
    newValue
    timestamp
    author
  }
}
```

## Error Handling

All API errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid configuration",
    "details": [
      {
        "field": "nodeVersion",
        "message": "Version 25.0.0 is not supported"
      }
    ],
    "requestId": "req_mno345",
    "timestamp": "2024-01-15T10:20:00Z"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request data |
| CONFLICT | 409 | Resource conflict (e.g., name already exists) |
| RATE_LIMITED | 429 | Too many requests |
| SERVER_ERROR | 500 | Internal server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

## Rate Limiting

API rate limits are enforced per user:

- **Standard tier**: 1000 requests/hour
- **Premium tier**: 10000 requests/hour
- **Enterprise tier**: Unlimited

Rate limit headers:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1642248000
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { ClaudeEnvClient } from '@claude-env/sdk';

const client = new ClaudeEnvClient({
  apiKey: process.env.CLAUDE_ENV_API_KEY,
  baseUrl: 'https://api.claude-env.company.com'
});

// Create environment
const env = await client.environments.create({
  name: 'my-dev-env',
  team: 'frontend',
  config: {
    nodeVersion: '20.11.0',
    mcpServers: ['context7', 'sequential']
  }
});

// Subscribe to changes
client.on('config:changed', (event) => {
  console.log('Configuration updated:', event);
});

// Execute MCP command
const result = await client.mcp.execute({
  server: 'context7',
  command: 'get-library-docs',
  params: { library: 'react' }
});
```

### Python

```python
from claude_env import ClaudeEnvClient

client = ClaudeEnvClient(
    api_key=os.environ['CLAUDE_ENV_API_KEY'],
    base_url='https://api.claude-env.company.com'
)

# Create environment
env = client.environments.create(
    name='my-dev-env',
    team='frontend',
    config={
        'nodeVersion': '20.11.0',
        'mcpServers': ['context7', 'sequential']
    }
)

# Sync configuration
sync_result = client.sync.trigger(
    team='frontend',
    project='web-app',
    environment='development'
)

# Detect drift
drift = client.drift.detect(
    team='frontend',
    project='web-app'
)

if drift.percentage > 10:
    client.drift.remediate(drift, strategy='auto')
```

### CLI

```bash
# Create environment
claude-env create --name my-dev-env --team frontend

# Get status
claude-env status env_abc123

# Sync configuration
claude-env sync --team frontend --project web-app

# Execute MCP command
claude-env mcp execute context7 get-library-docs --param library=react

# Watch for changes
claude-env watch --team frontend
```