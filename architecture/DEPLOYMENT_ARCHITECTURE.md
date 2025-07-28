# Deployment Architecture: Claude Code + SuperClaude + MCP

## Overview

The deployment architecture supports multiple deployment scenarios from single-developer setups to enterprise-scale team deployments. The architecture emphasizes containerization, scalability, and zero-downtime deployments.

## Deployment Scenarios

### 1. Local Development (Single Developer)

For individual developers working on personal projects.

```yaml
# docker-compose.local.yml
version: '3.8'

services:
  claude-env:
    image: ghcr.io/claude-env/devcontainer:latest
    container_name: claude-env-local
    volumes:
      - ./workspaces:/workspaces:cached
      - ~/.claude:/home/vscode/.claude:cached
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - CLAUDE_ENV_MODE=local
      - NODE_ENV=development
    ports:
      - "3000-3010:3000-3010" # MCP server ports
    networks:
      - claude-local

  mcp-bundle:
    image: ghcr.io/claude-env/mcp-bundle:latest
    container_name: mcp-servers-local
    environment:
      - MCP_SERVERS=context7,sequential,magic,playwright
    networks:
      - claude-local

networks:
  claude-local:
    driver: bridge
```

**Deployment Steps:**
```bash
# Clone repository
git clone https://github.com/org/claude-env
cd claude-env

# Start local environment
docker-compose -f docker-compose.local.yml up -d

# Initialize environment
docker exec claude-env-local claude-env init --mode=local

# Open in VS Code
code . --folder-uri="vscode-remote://dev-container+claude-env-local/workspaces"
```

### 2. Team Development (Small Teams)

For teams of 2-20 developers sharing configurations.

```yaml
# docker-compose.team.yml
version: '3.8'

services:
  claude-controller:
    image: ghcr.io/claude-env/controller:latest
    container_name: claude-controller
    environment:
      - CLAUDE_ENV_MODE=team
      - CONFIG_REPO=${CONFIG_REPO_URL}
      - TEAM_NAME=${TEAM_NAME}
    volumes:
      - controller-data:/data
    ports:
      - "8080:8080" # API port
      - "8081:8081" # WebSocket port
    networks:
      - claude-team

  config-sync:
    image: ghcr.io/claude-env/config-sync:latest
    container_name: config-sync
    environment:
      - SYNC_INTERVAL=300
      - GIT_REPO=${CONFIG_REPO_URL}
      - GIT_BRANCH=main
    volumes:
      - sync-data:/data
    networks:
      - claude-team

  mcp-context7:
    image: ghcr.io/claude-env/mcp-context7:latest
    container_name: mcp-context7
    deploy:
      replicas: 2
    environment:
      - MCP_PORT=3001
    networks:
      - claude-team

  mcp-sequential:
    image: ghcr.io/claude-env/mcp-sequential:latest
    container_name: mcp-sequential
    deploy:
      replicas: 2
    environment:
      - MCP_PORT=3002
    networks:
      - claude-team

  mcp-magic:
    image: ghcr.io/claude-env/mcp-magic:latest
    container_name: mcp-magic
    deploy:
      replicas: 2
    environment:
      - MCP_PORT=3003
    networks:
      - claude-team

  mcp-playwright:
    image: ghcr.io/claude-env/mcp-playwright:latest
    container_name: mcp-playwright
    environment:
      - MCP_PORT=3004
      - DISPLAY=:99
    networks:
      - claude-team

  redis:
    image: redis:7-alpine
    container_name: claude-redis
    volumes:
      - redis-data:/data
    networks:
      - claude-team

  postgres:
    image: postgres:15-alpine
    container_name: claude-postgres
    environment:
      - POSTGRES_DB=claude_env
      - POSTGRES_USER=claude
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - claude-team

volumes:
  controller-data:
  sync-data:
  redis-data:
  postgres-data:

networks:
  claude-team:
    driver: overlay
    attachable: true
```

**Deployment with Docker Swarm:**
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.team.yml claude-team

# Scale MCP servers
docker service scale claude-team_mcp-context7=3
docker service scale claude-team_mcp-sequential=3
```

### 3. Enterprise Deployment (Large Organizations)

For organizations with 50+ developers requiring high availability and compliance.

```yaml
# kubernetes/claude-env-enterprise.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: claude-env
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-controller
  namespace: claude-env
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-controller
  template:
    metadata:
      labels:
        app: claude-controller
    spec:
      containers:
      - name: controller
        image: ghcr.io/claude-env/controller:enterprise
        ports:
        - containerPort: 8080
        - containerPort: 8081
        env:
        - name: CLAUDE_ENV_MODE
          value: "enterprise"
        - name: CONFIG_REPO
          valueFrom:
            secretKeyRef:
              name: claude-secrets
              key: config-repo
        - name: VAULT_ADDR
          value: "http://vault:8200"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: claude-controller
  namespace: claude-env
spec:
  selector:
    app: claude-controller
  ports:
  - name: api
    port: 80
    targetPort: 8080
  - name: websocket
    port: 81
    targetPort: 8081
  type: LoadBalancer
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mcp-context7
  namespace: claude-env
spec:
  serviceName: mcp-context7
  replicas: 5
  selector:
    matchLabels:
      app: mcp-context7
  template:
    metadata:
      labels:
        app: mcp-context7
    spec:
      containers:
      - name: context7
        image: ghcr.io/claude-env/mcp-context7:enterprise
        ports:
        - containerPort: 3001
        env:
        - name: MCP_SERVER_TYPE
          value: "context7"
        - name: CACHE_REDIS_URL
          value: "redis://redis-cluster:6379"
        resources:
          requests:
            memory: "1Gi"
            cpu: "1000m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        volumeMounts:
        - name: cache-volume
          mountPath: /cache
  volumeClaimTemplates:
  - metadata:
      name: cache-volume
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: "fast-ssd"
      resources:
        requests:
          storage: 10Gi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: claude-controller-hpa
  namespace: claude-env
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claude-controller
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-env-ingress
  namespace: claude-env
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/websocket-services: "claude-controller:81"
spec:
  tls:
  - hosts:
    - api.claude-env.company.com
    secretName: claude-env-tls
  rules:
  - host: api.claude-env.company.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: claude-controller
            port:
              number: 80
      - path: /ws
        pathType: Prefix
        backend:
          service:
            name: claude-controller
            port:
              number: 81
```

**Helm Chart Deployment:**
```yaml
# helm/claude-env/values.yaml
global:
  environment: production
  domain: claude-env.company.com
  
controller:
  replicas: 3
  image:
    repository: ghcr.io/claude-env/controller
    tag: enterprise
  resources:
    requests:
      memory: 512Mi
      cpu: 500m
    limits:
      memory: 1Gi
      cpu: 1000m
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPU: 70
    targetMemory: 80

mcpServers:
  context7:
    replicas: 5
    resources:
      requests:
        memory: 1Gi
        cpu: 1000m
  sequential:
    replicas: 5
    resources:
      requests:
        memory: 2Gi
        cpu: 2000m
  magic:
    replicas: 3
    resources:
      requests:
        memory: 1Gi
        cpu: 1000m
  playwright:
    replicas: 2
    resources:
      requests:
        memory: 2Gi
        cpu: 1000m

redis:
  enabled: true
  cluster:
    enabled: true
    nodes: 6
  persistence:
    enabled: true
    size: 10Gi

postgresql:
  enabled: true
  replication:
    enabled: true
    readReplicas: 2
  persistence:
    enabled: true
    size: 100Gi

monitoring:
  prometheus:
    enabled: true
  grafana:
    enabled: true
  alerts:
    enabled: true

security:
  vault:
    enabled: true
    address: https://vault.company.com
  tls:
    enabled: true
    certManager: true
```

**Deployment Commands:**
```bash
# Add Helm repository
helm repo add claude-env https://charts.claude-env.io
helm repo update

# Install with custom values
helm install claude-env claude-env/claude-env \
  --namespace claude-env \
  --create-namespace \
  --values values.yaml

# Upgrade deployment
helm upgrade claude-env claude-env/claude-env \
  --namespace claude-env \
  --values values.yaml
```

## Infrastructure Components

### 1. Load Balancing

```yaml
# nginx-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: claude-env
data:
  nginx.conf: |
    upstream mcp_context7 {
        least_conn;
        server mcp-context7-0:3001;
        server mcp-context7-1:3001;
        server mcp-context7-2:3001;
        server mcp-context7-3:3001;
        server mcp-context7-4:3001;
    }
    
    upstream mcp_sequential {
        ip_hash;  # Sticky sessions for sequential processing
        server mcp-sequential-0:3002;
        server mcp-sequential-1:3002;
        server mcp-sequential-2:3002;
        server mcp-sequential-3:3002;
        server mcp-sequential-4:3002;
    }
    
    server {
        listen 80;
        
        location /mcp/context7 {
            proxy_pass http://mcp_context7;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
        
        location /mcp/sequential {
            proxy_pass http://mcp_sequential;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_connect_timeout 300s;  # Longer timeout for complex operations
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
        }
    }
```

### 2. Service Mesh (Istio)

```yaml
# istio-service-mesh.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: claude-env-routing
  namespace: claude-env
spec:
  hosts:
  - claude-controller
  http:
  - match:
    - headers:
        x-team:
          exact: frontend
    route:
    - destination:
        host: claude-controller
        subset: frontend
      weight: 100
  - route:
    - destination:
        host: claude-controller
        subset: general
      weight: 100
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: claude-controller-dr
  namespace: claude-env
spec:
  host: claude-controller
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 100
        http2MaxRequests: 100
    loadBalancer:
      consistentHash:
        httpHeaderName: "x-session-id"
  subsets:
  - name: frontend
    labels:
      team: frontend
  - name: general
    labels:
      team: general
```

### 3. Monitoring Stack

```yaml
# monitoring/prometheus-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: claude-env
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
    
    scrape_configs:
    - job_name: 'claude-controller'
      kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
          - claude-env
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: claude-controller
        action: keep
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: instance
    
    - job_name: 'mcp-servers'
      kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
          - claude-env
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: mcp-.*
        action: keep
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: mcp_type
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: instance
    
    alerting:
      alertmanagers:
      - static_configs:
        - targets:
          - alertmanager:9093
    
    rule_files:
    - '/etc/prometheus/rules/*.yml'
```

```yaml
# monitoring/grafana-dashboards.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards
  namespace: claude-env
data:
  claude-env-overview.json: |
    {
      "dashboard": {
        "title": "Claude Environment Overview",
        "panels": [
          {
            "title": "Active Environments",
            "targets": [{
              "expr": "count(claude_env_environment_status{state=\"running\"})"
            }]
          },
          {
            "title": "Sync Success Rate",
            "targets": [{
              "expr": "rate(claude_env_sync_total{status=\"success\"}[5m]) / rate(claude_env_sync_total[5m]) * 100"
            }]
          },
          {
            "title": "MCP Server Response Time",
            "targets": [{
              "expr": "histogram_quantile(0.95, claude_env_mcp_request_duration_seconds_bucket)"
            }]
          },
          {
            "title": "Configuration Drift",
            "targets": [{
              "expr": "avg(claude_env_config_drift_percentage) by (team)"
            }]
          }
        ]
      }
    }
```

### 4. Backup and Disaster Recovery

```yaml
# backup/velero-backup.yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: claude-env-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  template:
    includedNamespaces:
    - claude-env
    includedResources:
    - persistentvolumeclaims
    - persistentvolumes
    - configmaps
    - secrets
    - deployments
    - statefulsets
    - services
    storageLocation: claude-env-backups
    volumeSnapshotLocations:
    - claude-env-snapshots
    ttl: 720h0m0s  # 30 days retention
---
apiVersion: velero.io/v1
kind: BackupStorageLocation
metadata:
  name: claude-env-backups
  namespace: velero
spec:
  provider: aws
  objectStorage:
    bucket: claude-env-backups
    prefix: kubernetes
  config:
    region: us-east-1
    s3ForcePathStyle: "true"
    s3Url: https://s3.company.com
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy Claude Environment

on:
  push:
    branches: [main]
    paths:
    - 'src/**'
    - 'docker/**'
    - 'helm/**'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
        - development
        - staging
        - production

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
    - uses: actions/checkout@v3
    
    - name: Generate version
      id: version
      run: |
        VERSION=$(date +%Y%m%d%H%M%S)-${GITHUB_SHA::8}
        echo "version=$VERSION" >> $GITHUB_OUTPUT
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Login to GitHub Container Registry
      uses: docker/login-action@v2
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push controller
      uses: docker/build-push-action@v4
      with:
        context: .
        file: docker/controller/Dockerfile
        push: true
        tags: |
          ghcr.io/${{ github.repository }}/controller:${{ steps.version.outputs.version }}
          ghcr.io/${{ github.repository }}/controller:latest
        cache-from: type=registry,ref=ghcr.io/${{ github.repository }}/controller:buildcache
        cache-to: type=registry,ref=ghcr.io/${{ github.repository }}/controller:buildcache,mode=max
    
    - name: Build and push MCP servers
      run: |
        for server in context7 sequential magic playwright; do
          docker buildx build \
            --file docker/mcp-$server/Dockerfile \
            --tag ghcr.io/${{ github.repository }}/mcp-$server:${{ steps.version.outputs.version }} \
            --tag ghcr.io/${{ github.repository }}/mcp-$server:latest \
            --push \
            docker/mcp-$server
        done

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run integration tests
      run: |
        docker-compose -f docker-compose.test.yml up -d
        npm run test:integration
        docker-compose -f docker-compose.test.yml down

  deploy-staging:
    needs: [build, test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure kubectl
      uses: azure/setup-kubectl@v3
    
    - name: Set up Helm
      uses: azure/setup-helm@v3
    
    - name: Deploy to staging
      run: |
        helm upgrade --install claude-env-staging ./helm/claude-env \
          --namespace claude-env-staging \
          --create-namespace \
          --set global.environment=staging \
          --set controller.image.tag=${{ needs.build.outputs.version }} \
          --set mcpServers.context7.image.tag=${{ needs.build.outputs.version }} \
          --set mcpServers.sequential.image.tag=${{ needs.build.outputs.version }} \
          --set mcpServers.magic.image.tag=${{ needs.build.outputs.version }} \
          --set mcpServers.playwright.image.tag=${{ needs.build.outputs.version }} \
          --wait \
          --timeout 10m

  deploy-production:
    needs: [build, test, deploy-staging]
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'production'
    runs-on: ubuntu-latest
    environment: production
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure kubectl
      uses: azure/setup-kubectl@v3
    
    - name: Set up Helm
      uses: azure/setup-helm@v3
    
    - name: Deploy to production (canary)
      run: |
        helm upgrade --install claude-env-canary ./helm/claude-env \
          --namespace claude-env \
          --set global.environment=production \
          --set controller.image.tag=${{ needs.build.outputs.version }} \
          --set controller.replicas=1 \
          --set canary.enabled=true \
          --set canary.weight=10 \
          --wait \
          --timeout 10m
    
    - name: Run smoke tests
      run: |
        npm run test:smoke -- --environment=production-canary
    
    - name: Promote to production
      if: success()
      run: |
        helm upgrade claude-env ./helm/claude-env \
          --namespace claude-env \
          --reuse-values \
          --set controller.replicas=3 \
          --set canary.enabled=false \
          --wait \
          --timeout 10m
```

## Security Considerations

### 1. Network Policies

```yaml
# security/network-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: claude-controller-netpol
  namespace: claude-env
spec:
  podSelector:
    matchLabels:
      app: claude-controller
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    - podSelector:
        matchLabels:
          app: claude-env-client
    ports:
    - protocol: TCP
      port: 8080
    - protocol: TCP
      port: 8081
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: mcp-context7
    - podSelector:
        matchLabels:
          app: mcp-sequential
    - podSelector:
        matchLabels:
          app: mcp-magic
    - podSelector:
        matchLabels:
          app: mcp-playwright
    ports:
    - protocol: TCP
      port: 3001
    - protocol: TCP
      port: 3002
    - protocol: TCP
      port: 3003
    - protocol: TCP
      port: 3004
  - to:
    - namespaceSelector:
        matchLabels:
          name: vault
    ports:
    - protocol: TCP
      port: 8200
```

### 2. Pod Security Policies

```yaml
# security/pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: claude-env-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
  - ALL
  volumes:
  - 'configMap'
  - 'emptyDir'
  - 'projected'
  - 'secret'
  - 'downwardAPI'
  - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
```

### 3. Secret Management

```yaml
# security/external-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: claude-env
spec:
  provider:
    vault:
      server: "https://vault.company.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "claude-env"
          serviceAccountRef:
            name: "claude-env-sa"
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: claude-env-secrets
  namespace: claude-env
spec:
  refreshInterval: 15m
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: claude-secrets
    creationPolicy: Owner
  data:
  - secretKey: config-repo
    remoteRef:
      key: claude-env/config-repo
  - secretKey: db-password
    remoteRef:
      key: claude-env/db-password
  - secretKey: api-keys
    remoteRef:
      key: claude-env/api-keys
```

## Scaling Strategies

### Horizontal Pod Autoscaling

```yaml
# scaling/hpa-config.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-context7-hpa
  namespace: claude-env
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: StatefulSet
    name: mcp-context7
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: mcp_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
      - type: Pods
        value: 1
        periodSeconds: 60
      selectPolicy: Min
```

### Vertical Pod Autoscaling

```yaml
# scaling/vpa-config.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: claude-controller-vpa
  namespace: claude-env
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: claude-controller
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: controller
      minAllowed:
        cpu: 250m
        memory: 256Mi
      maxAllowed:
        cpu: 2
        memory: 4Gi
      controlledResources: ["cpu", "memory"]
```

## Cost Optimization

### Spot Instance Configuration

```yaml
# cost-optimization/spot-instances.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: spot-instance-config
  namespace: claude-env
data:
  config.yaml: |
    nodeGroups:
      mcp-servers:
        instanceTypes:
        - m5.large
        - m5a.large
        - m5n.large
        - m5d.large
        spotInstancePools: 4
        onDemandBaseCapacity: 2
        onDemandPercentageAboveBaseCapacity: 20
        spotAllocationStrategy: "capacity-optimized"
      
      general-workload:
        instanceTypes:
        - t3.medium
        - t3a.medium
        spotInstancePools: 2
        onDemandBaseCapacity: 1
        onDemandPercentageAboveBaseCapacity: 0
        spotAllocationStrategy: "lowest-price"
```

### Resource Quotas

```yaml
# cost-optimization/resource-quotas.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: claude-env-quota
  namespace: claude-env
spec:
  hard:
    requests.cpu: "100"
    requests.memory: "200Gi"
    requests.storage: "1Ti"
    persistentvolumeclaims: "50"
    services.loadbalancers: "5"
  scopeSelector:
    matchExpressions:
    - operator: In
      scopeName: PriorityClass
      values: ["high", "medium"]
```

## Deployment Best Practices

1. **Blue-Green Deployments**: Maintain two identical production environments
2. **Canary Releases**: Gradually roll out changes to a subset of users
3. **Feature Flags**: Control feature availability without deployments
4. **Rollback Strategy**: Automated rollback on health check failures
5. **Database Migrations**: Separate migration jobs before deployment
6. **Configuration Validation**: Pre-deployment configuration checks
7. **Smoke Tests**: Automated tests after each deployment
8. **Monitoring**: Comprehensive metrics and alerting
9. **Documentation**: Deployment runbooks and disaster recovery plans
10. **Security Scanning**: Container image scanning in CI/CD pipeline