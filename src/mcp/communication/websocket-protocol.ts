/**
 * WebSocket Protocol Implementation for MCP Server Communication
 * Handles message serialization, validation, and error handling
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { z } from 'zod';
import { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/metrics-collector';

// Message schemas for validation
const MCPMessageSchema = z.object({
  id: z.string(),
  type: z.enum(['request', 'response', 'notification', 'error']),
  method: z.string().optional(),
  params: z.any().optional(),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional(),
  timestamp: z.number(),
  version: z.string().default('1.0')
});

const MCPRequestSchema = z.object({
  id: z.string(),
  type: z.literal('request'),
  method: z.string(),
  params: z.any().optional(),
  timestamp: z.number(),
  timeout: z.number().optional().default(30000),
  metadata: z.record(z.any()).optional()
});

const MCPResponseSchema = z.object({
  id: z.string(),
  type: z.literal('response'),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional(),
  timestamp: z.number(),
  metadata: z.record(z.any()).optional()
});

export type MCPMessage = z.infer<typeof MCPMessageSchema>;
export type MCPRequest = z.infer<typeof MCPRequestSchema>;
export type MCPResponse = z.infer<typeof MCPResponseSchema>;

export interface WebSocketConnectionConfig {
  endpoint: string;
  reconnection: {
    enabled: boolean;
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  heartbeat: {
    enabled: boolean;
    interval: number;
    timeout: number;
  };
  compression: {
    enabled: boolean;
    threshold: number; // bytes
  };
  security: {
    tlsEnabled: boolean;
    verifySSL: boolean;
    clientCert?: string;
    clientKey?: string;
  };
  messageQueue: {
    maxSize: number;
    flushInterval: number;
  };
  rateLimiting: {
    enabled: boolean;
    maxRequestsPerSecond: number;
    burstLimit: number;
  };
}

export interface PendingRequest {
  id: string;
  resolve: (response: MCPResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
  retryCount: number;
}

export class WebSocketProtocol extends EventEmitter {
  private ws?: WebSocket;
  private config: WebSocketConnectionConfig;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private messageQueue: MCPMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;
  private flushInterval?: NodeJS.Timeout;
  private rateLimiter: RateLimiter;
  private logger: Logger;
  private metrics: MetricsCollector;
  private isClosing = false;
  private lastPingTime = 0;
  private latency = 0;

  constructor(config: WebSocketConnectionConfig) {
    super();
    this.config = config;
    this.logger = new Logger('WebSocketProtocol');
    this.metrics = new MetricsCollector();
    this.rateLimiter = new RateLimiter(
      config.rateLimiting.maxRequestsPerSecond,
      config.rateLimiting.burstLimit
    );

    this.setupMessageQueue();
  }

  /**
   * Connect to WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const wsOptions: any = {};

        if (this.config.security.tlsEnabled) {
          wsOptions.rejectUnauthorized = this.config.security.verifySSL;
          if (this.config.security.clientCert && this.config.security.clientKey) {
            wsOptions.cert = this.config.security.clientCert;
            wsOptions.key = this.config.security.clientKey;
          }
        }

        this.ws = new WebSocket(this.config.endpoint, wsOptions);

        this.ws.on('open', () => {
          this.logger.info(`Connected to ${this.config.endpoint}`);
          this.reconnectAttempts = 0;
          this.setupHeartbeat();
          this.flushMessageQueue();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this.logger.warn(`Connection closed: ${code} - ${reason}`);
          this.cleanup();
          this.emit('disconnected', { code, reason });
          
          if (!this.isClosing && this.config.reconnection.enabled) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('pong', () => {
          this.latency = Date.now() - this.lastPingTime;
          this.metrics.recordLatency(this.latency);
          this.clearHeartbeatTimeout();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a request and wait for response
   */
  async sendRequest(
    method: string,
    params?: any,
    options?: {
      timeout?: number;
      retries?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<MCPResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket connection not available');
    }

    // Check rate limiting
    if (this.config.rateLimiting.enabled && !this.rateLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded');
    }

    const request: MCPRequest = {
      id: this.generateRequestId(),
      type: 'request',
      method,
      params,
      timestamp: Date.now(),
      timeout: options?.timeout || this.config.messageQueue.flushInterval,
      metadata: options?.metadata
    };

    // Validate request
    const validationResult = MCPRequestSchema.safeParse(request);
    if (!validationResult.success) {
      throw new Error(`Invalid request: ${validationResult.error.message}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout: ${request.id}`));
      }, request.timeout!);

      this.pendingRequests.set(request.id, {
        id: request.id,
        resolve,
        reject,
        timeout,
        timestamp: Date.now(),
        retryCount: 0
      });

      this.sendMessage(request);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  async sendNotification(method: string, params?: any): Promise<void> {
    const notification: MCPMessage = {
      id: this.generateRequestId(),
      type: 'notification',
      method,
      params,
      timestamp: Date.now(),
      version: '1.0'
    };

    this.sendMessage(notification);
  }

  /**
   * Send a response to a request
   */
  async sendResponse(
    requestId: string,
    result?: any,
    error?: { code: number; message: string; data?: any }
  ): Promise<void> {
    const response: MCPResponse = {
      id: requestId,
      type: 'response',
      result,
      error,
      timestamp: Date.now()
    };

    // Validate response
    const validationResult = MCPResponseSchema.safeParse(response);
    if (!validationResult.success) {
      throw new Error(`Invalid response: ${validationResult.error.message}`);
    }

    this.sendMessage(response);
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    this.isClosing = true;
    
    // Clear all timers
    this.cleanup();

    // Reject all pending requests
    for (const [id, pendingRequest] of this.pendingRequests) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.reject(new Error('Connection closing'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close(1000, 'Client closing');
    }

    this.emit('closed');
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connected: boolean;
    latency: number;
    pendingRequests: number;
    queuedMessages: number;
    reconnectAttempts: number;
    messagesSent: number;
    messagesReceived: number;
    bytesTransferred: number;
  } {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN || false,
      latency: this.latency,
      pendingRequests: this.pendingRequests.size,
      queuedMessages: this.messageQueue.length,
      reconnectAttempts: this.reconnectAttempts,
      messagesSent: this.metrics.getMessagesSent(),
      messagesReceived: this.metrics.getMessagesReceived(),
      bytesTransferred: this.metrics.getBytesTransferred()
    };
  }

  // Private methods

  private sendMessage(message: MCPMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message for later delivery
      if (this.messageQueue.length < this.config.messageQueue.maxSize) {
        this.messageQueue.push(message);
      } else {
        this.logger.warn('Message queue full, dropping message');
      }
      return;
    }

    try {
      const serialized = this.serializeMessage(message);
      this.ws.send(serialized);
      this.metrics.recordMessageSent(serialized.length);
      
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      this.emit('error', error);
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = this.deserializeMessage(data);
      this.metrics.recordMessageReceived(data.toString().length);

      // Validate message structure
      const validationResult = MCPMessageSchema.safeParse(message);
      if (!validationResult.success) {
        this.logger.error('Invalid message received:', validationResult.error);
        return;
      }

      switch (message.type) {
        case 'response':
          this.handleResponse(message as MCPResponse);
          break;
        case 'request':
          this.handleRequest(message as MCPRequest);
          break;
        case 'notification':
          this.handleNotification(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        default:
          this.logger.warn('Unknown message type:', message.type);
      }

    } catch (error) {
      this.logger.error('Failed to handle message:', error);
      this.emit('error', error);
    }
  }

  private handleResponse(response: MCPResponse): void {
    const pendingRequest = this.pendingRequests.get(response.id);
    if (!pendingRequest) {
      this.logger.warn(`Received response for unknown request: ${response.id}`);
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      const error = new Error(response.error.message);
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      pendingRequest.reject(error);
    } else {
      pendingRequest.resolve(response);
    }
  }

  private handleRequest(request: MCPRequest): void {
    this.emit('request', request);
  }

  private handleNotification(notification: MCPMessage): void {
    this.emit('notification', notification);
  }

  private handleError(error: MCPMessage): void {
    this.logger.error('Received error message:', error);
    this.emit('error', new Error(error.error?.message || 'Unknown error'));
  }

  private serializeMessage(message: MCPMessage): string | Buffer {
    const serialized = JSON.stringify(message);
    
    if (this.config.compression.enabled && 
        serialized.length > this.config.compression.threshold) {
      // Compression would be implemented here
      return serialized;
    }
    
    return serialized;
  }

  private deserializeMessage(data: WebSocket.Data): MCPMessage {
    const text = data.toString();
    
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Failed to parse message: ${error.message}`);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private setupHeartbeat(): void {
    if (!this.config.heartbeat.enabled) {
      return;
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.ws.ping();
        
        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          this.logger.warn('Heartbeat timeout, closing connection');
          this.ws?.terminate();
        }, this.config.heartbeat.timeout);
      }
    }, this.config.heartbeat.interval);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }
  }

  private setupMessageQueue(): void {
    this.flushInterval = setInterval(() => {
      this.flushMessageQueue();
    }, this.config.messageQueue.flushInterval);
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0 || 
        !this.ws || 
        this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const messages = this.messageQueue.splice(0);
    for (const message of messages) {
      this.sendMessage(message);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnection.maxAttempts) {
      this.logger.error('Max reconnection attempts reached');
      this.emit('reconnectFailed');
      return;
    }

    const delay = Math.min(
      this.config.reconnection.initialDelay * 
      Math.pow(this.config.reconnection.backoffMultiplier, this.reconnectAttempts),
      this.config.reconnection.maxDelay
    );

    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
  }
}

/**
 * Rate Limiter for WebSocket requests
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxRequestsPerSecond: number,
    private burstLimit: number
  ) {
    this.tokens = burstLimit;
    this.lastRefill = Date.now();
  }

  tryAcquire(): boolean {
    this.refillTokens();
    
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    
    return false;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timePassed * this.maxRequestsPerSecond);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.burstLimit, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

/**
 * WebSocket Connection Pool for managing multiple connections
 */
export class WebSocketConnectionPool {
  private connections: Map<string, WebSocketProtocol> = new Map();
  private connectionConfigs: Map<string, WebSocketConnectionConfig> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('WebSocketConnectionPool');
  }

  /**
   * Add a connection to the pool
   */
  async addConnection(
    name: string,
    config: WebSocketConnectionConfig
  ): Promise<void> {
    if (this.connections.has(name)) {
      throw new Error(`Connection ${name} already exists`);
    }

    const connection = new WebSocketProtocol(config);
    await connection.connect();

    this.connections.set(name, connection);
    this.connectionConfigs.set(name, config);

    this.logger.info(`Added connection: ${name}`);
  }

  /**
   * Get a connection from the pool
   */
  getConnection(name: string): WebSocketProtocol | undefined {
    return this.connections.get(name);
  }

  /**
   * Remove a connection from the pool
   */
  async removeConnection(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (connection) {
      await connection.close();
      this.connections.delete(name);
      this.connectionConfigs.delete(name);
      this.logger.info(`Removed connection: ${name}`);
    }
  }

  /**
   * Get all connection names
   */
  getConnectionNames(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection statistics for all connections
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, connection] of this.connections) {
      stats[name] = connection.getStats();
    }
    
    return stats;
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.connections.values())
      .map(connection => connection.close());
    
    await Promise.all(closePromises);
    
    this.connections.clear();
    this.connectionConfigs.clear();
    
    this.logger.info('All connections closed');
  }
}