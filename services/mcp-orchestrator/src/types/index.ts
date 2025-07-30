import { LoadBalancer } from '../balancer/LoadBalancer';
import { HealthMonitor } from '../monitoring/HealthMonitor';
import { ConfigManager } from '../config/ConfigManager';
import { MetricsCollector } from '../metrics/MetricsCollector';
import { Logger } from '../utils/Logger';

// Core MCP Types
export interface MCPRequest {
  id?: string;
  method: string;
  params: any;
  jsonrpc?: string;
}

export interface MCPResponse {
  id?: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  jsonrpc?: string;
}

// Server Configuration
export interface MCPServerConfig {
  id?: string;
  type: string;
  deploymentType: 'docker' | 'process' | 'websocket';
  image?: string;
  command?: string;
  args?: string[];
  url?: string;
  port?: number;
  environment?: Record<string, string>;
  resources?: {
    memory?: number;
    cpu?: number;
  };
  healthCheck?: {
    enabled: boolean;
    interval: number;
    timeout: number;
    retries: number;
    path?: string;
  };
  scaling?: {
    enabled: boolean;
    minInstances: number;
    maxInstances: number;
    targetCpuUtilization: number;
    targetMemoryUtilization: number;
  };
}

// Server Status
export interface ServerStatus {
  id: string;
  type: string;
  status: 'running' | 'stopped' | 'unhealthy' | 'starting' | 'stopping';
  healthy: boolean;
  uptime: number;
  lastHealthCheck: number;
  metrics?: ServerMetrics;
}

export interface ServerMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  cpuUsage?: number;
  memoryUsage?: number;
  connectionCount?: number;
}

// Load Balancer Types
export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'resource-based' | 'weighted';
  healthCheckInterval: number;
  unhealthyThreshold: number;
  recoveryThreshold: number;
}

export interface LoadBalancerStrategy {
  name: string;
  selectServer(servers: any[], request?: MCPRequest): any | null;
}

// Health Monitor Types
export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface HealthCheckResult {
  serverId: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
  timestamp: number;
}

// Metrics Types
export interface MetricsConfig {
  collectInterval: number;
  retentionPeriod: number;
  aggregationWindow: number;
}

export interface RequestMetric {
  serverId: string;
  method: string;
  timestamp: number;
  duration: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
}

export interface SystemMetric {
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  network: {
    bytesIn: number;
    bytesOut: number;
  };
}

// Configuration Types
export interface OrchestratorConfig {
  servers: MCPServerConfig[];
  loadBalancer: LoadBalancerConfig;
  healthCheck: HealthCheckConfig;
  metrics: MetricsConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  output: 'console' | 'file' | 'both';
  file?: {
    path: string;
    maxSize: string;
    maxFiles: number;
  };
}

export interface SecurityConfig {
  authentication: {
    enabled: boolean;
    type: 'jwt' | 'api-key' | 'oauth';
    secret: string;
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    enabled: boolean;
    origins: string[];
    credentials: boolean;
  };
}

// Orchestrator Options
export interface OrchestratorOptions {
  loadBalancer: LoadBalancer;
  healthMonitor: HealthMonitor;
  configManager: ConfigManager;
  metricsCollector: MetricsCollector;
  logger: Logger;
}

// Event Types
export interface ServerEvent {
  type: 'registered' | 'unregistered' | 'health-changed' | 'error' | 'overloaded';
  serverId: string;
  timestamp: number;
  data?: any;
}

export interface RequestEvent {
  type: 'request-start' | 'request-end' | 'request-error';
  requestId: string;
  serverId: string;
  method: string;
  timestamp: number;
  duration?: number;
  error?: string;
}

// GitOps Types
export interface GitOpsConfig {
  repository: {
    url: string;
    branch: string;
    path: string;
    credentials?: {
      username: string;
      token: string;
    };
  };
  sync: {
    interval: number;
    autoSync: boolean;
    dryRun: boolean;
  };
  validation: {
    enabled: boolean;
    schemas: string[];
    customValidators: string[];
  };
}

export interface DriftEvent {
  type: 'configuration' | 'server' | 'deployment';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  current: any;
  expected: any;
  timestamp: number;
  remediation?: {
    automatic: boolean;
    action: string;
    script?: string;
  };
}

// Synchronization Types
export interface SyncOperation {
  id: string;
  type: 'pull' | 'push' | 'merge';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  changes: SyncChange[];
  conflicts: SyncConflict[];
  error?: string;
}

export interface SyncChange {
  path: string;
  type: 'create' | 'update' | 'delete';
  before?: any;
  after?: any;
}

export interface SyncConflict {
  path: string;
  local: any;
  remote: any;
  resolution?: 'local' | 'remote' | 'merge' | 'manual';
}

// API Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: number;
    requestId: string;
    version: string;
  };
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error Types
export class MCPError extends Error {
  public code: string;
  public details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.details = details;
  }
}

export class ConfigurationError extends MCPError {
  constructor(message: string, details?: any) {
    super('CONFIGURATION_ERROR', message, details);
  }
}

export class ServerError extends MCPError {
  constructor(message: string, details?: any) {
    super('SERVER_ERROR', message, details);
  }
}

export class NetworkError extends MCPError {
  constructor(message: string, details?: any) {
    super('NETWORK_ERROR', message, details);
  }
}

export class ValidationError extends MCPError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, details);
  }
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Constants
export const MCP_PROTOCOL_VERSION = '1.0.0';
export const DEFAULT_REQUEST_TIMEOUT = 30000;
export const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;
export const DEFAULT_METRICS_COLLECTION_INTERVAL = 10000;