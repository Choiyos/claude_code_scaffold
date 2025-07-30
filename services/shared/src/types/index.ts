export interface Environment {
  id: string;
  name: string;
  description?: string;
  status: EnvironmentStatus;
  type: EnvironmentType;
  config: EnvironmentConfig;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  teamId?: string;
}

export interface EnvironmentConfig {
  image?: string;
  nodeVersion?: string;
  pythonVersion?: string;
  ports?: PortMapping[];
  volumes?: VolumeMapping[];
  environmentVariables?: Record<string, string>;
  mcpServers?: MCPServerConfig[];
  dockerComposeOverride?: string;
  resources?: ResourceLimits;
  healthCheck?: HealthCheckConfig;
}

export interface PortMapping {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

export interface VolumeMapping {
  host: string;
  container: string;
  mode: 'ro' | 'rw';
}

export interface ResourceLimits {
  memory?: string;
  cpu?: string;
  storage?: string;
}

export interface HealthCheckConfig {
  endpoint: string;
  interval: number;
  timeout: number;
  retries: number;
}

export enum EnvironmentStatus {
  CREATING = 'creating',
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
  UPDATING = 'updating',
  DESTROYING = 'destroying'
}

export enum EnvironmentType {
  DEVELOPMENT = 'development',
  TESTING = 'testing',
  STAGING = 'staging',
  PRODUCTION = 'production'
}

export interface MCPServerConfig {
  id: string;
  name: string;
  type: MCPServerType;
  image: string;
  config: Record<string, any>;
  status: MCPServerStatus;
  endpoints?: string[];
  healthCheckUrl?: string;
  resources?: ResourceLimits;
}

export enum MCPServerType {
  CONTEXT7 = 'context7',
  SEQUENTIAL = 'sequential',
  MAGIC = 'magic',
  PLAYWRIGHT = 'playwright',
  CUSTOM = 'custom'
}

export enum MCPServerStatus {
  INACTIVE = 'inactive',
  STARTING = 'starting',
  RUNNING = 'running',
  ERROR = 'error',
  STOPPING = 'stopping'
}

export interface Configuration {
  id: string;
  name: string;
  description?: string;
  type: string;
  data: any;
  schemaId?: string;
  version: number;
  checksum: string;
  metadata: {
    userId: string;
    teamId?: string;
    environment?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ConfigurationSchema {
  id: string;
  name: string;
  description?: string;
  version: string;
  schema: Record<string, any>;
  metadata: {
    userId: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ConfigurationBackup {
  id: string;
  configurationId: string;
  version: number;
  data: any;
  reason: string;
  createdAt: Date;
}

export interface ConfigurationDrift {
  configurationId: string;
  detectedAt: Date;
  severity: 'info' | 'warning' | 'error';
  description: string;
  currentChecksum: string;
  fileChecksum: string | null;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: ConfigurationValidationError[];
}

export interface ConfigurationValidationError {
  path: string;
  message: string;
  value?: any;
}

export interface ConfigurationValue {
  id: string;
  key: string;
  value: any;
  environmentId?: string;
  teamId?: string;
  userId?: string;
  scope: ConfigurationScope;
  encrypted: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum ConfigurationScope {
  GLOBAL = 'global',
  TEAM = 'team',
  USER = 'user',
  ENVIRONMENT = 'environment'
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

export interface ServiceHealthCheck {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  details?: Record<string, any>;
  uptime?: number;
  version?: string;
}

export interface MetricsData {
  name: string;
  value: number;
  unit?: string;
  labels?: Record<string, string>;
  timestamp: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId?: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  TEAM_LEAD = 'team_lead',
  DEVELOPER = 'developer',
  VIEWER = 'viewer'
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  webPush: boolean;
  desktop: boolean;
  environmentUpdates: boolean;
  systemAlerts: boolean;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  members: TeamMember[];
  config: TeamConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  userId: string;
  role: TeamRole;
  joinedAt: Date;
}

export enum TeamRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member'
}

export interface TeamConfig {
  defaultEnvironmentType: EnvironmentType;
  resourceLimits: ResourceLimits;
  allowedMCPServers: MCPServerType[];
  customSettings: Record<string, any>;
}

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}