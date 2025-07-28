/**
 * HTTP Protocol Implementation for MCP Server Communication
 * RESTful API integration with retry logic, caching, and performance optimization
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/metrics-collector';
import { CircuitBreaker } from '../../utils/circuit-breaker';

// HTTP Request/Response schemas
const HTTPRequestSchema = z.object({
  id: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  endpoint: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  timeout: z.number().optional().default(30000),
  retries: z.number().optional().default(3),
  metadata: z.record(z.any()).optional()
});

const HTTPResponseSchema = z.object({
  id: z.string(),
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string()),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  }).optional(),
  metadata: z.object({
    responseTime: z.number(),
    timestamp: z.date(),
    retryCount: z.number(),
    fromCache: z.boolean().optional()
  })
});

export type HTTPRequest = z.infer<typeof HTTPRequestSchema>;
export type HTTPResponse = z.infer<typeof HTTPResponseSchema>;

export interface HTTPClientConfig {
  baseURL: string;
  timeout: number;
  retryPolicy: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableStatusCodes: number[];
  };
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringPeriod: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    cacheableStatusCodes: number[];
    cacheableMethods: string[];
  };
  authentication: {
    type: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2';
    credentials: {
      token?: string;
      username?: string;
      password?: string;
      apiKey?: string;
      headerName?: string;
    };
  };
  security: {
    tlsEnabled: boolean;
    verifySSL: boolean;
    clientCert?: string;
    clientKey?: string;
    allowedOrigins: string[];
  };
  rateLimiting: {
    enabled: boolean;
    maxRequestsPerSecond: number;
    burstLimit: number;
  };
  compression: {
    enabled: boolean;
    algorithms: string[];
    threshold: number;
  };
  keepAlive: {
    enabled: boolean;
    maxSockets: number;
    maxFreeSockets: number;
    timeout: number;
  };
}

export interface CacheEntry {
  key: string;
  response: HTTPResponse;
  timestamp: number;
  ttl: number;
  etag?: string;
  lastModified?: string;
}

export class HTTPProtocol extends EventEmitter {
  private config: HTTPClientConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private logger: Logger;
  private metrics: MetricsCollector;
  private httpAgent?: any;

  constructor(config: HTTPClientConfig) {
    super();
    this.config = config;
    this.logger = new Logger('HTTPProtocol');
    this.metrics = new MetricsCollector();
    
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: config.circuitBreaker.failureThreshold,
      recoveryTimeout: config.circuitBreaker.recoveryTimeout,
      monitoringPeriod: config.circuitBreaker.monitoringPeriod
    });

    this.rateLimiter = new RateLimiter(
      config.rateLimiting.maxRequestsPerSecond,
      config.rateLimiting.burstLimit
    );

    this.setupHttpAgent();
    this.setupCacheCleanup();
  }

  /**
   * Execute HTTP request with retry logic and caching
   */
  async request(requestData: Omit<HTTPRequest, 'id'>): Promise<HTTPResponse> {
    const request: HTTPRequest = {
      ...requestData,
      id: this.generateRequestId()
    };

    // Validate request
    const validationResult = HTTPRequestSchema.safeParse(request);
    if (!validationResult.success) {
      throw new Error(`Invalid request: ${validationResult.error.message}`);
    }

    // Check rate limiting
    if (this.config.rateLimiting.enabled && !this.rateLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded');
    }

    // Check cache for GET requests
    if (request.method === 'GET' && this.config.cache.enabled) {
      const cachedResponse = this.getCachedResponse(request);
      if (cachedResponse) {
        this.metrics.recordCacheHit();
        return cachedResponse;
      }
    }

    return this.circuitBreaker.execute(async () => {
      return await this.executeRequestWithRetry(request);
    });
  }

  /**
   * Execute GET request
   */
  async get(
    endpoint: string,
    options?: {
      headers?: Record<string, string>;
      timeout?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<HTTPResponse> {
    return this.request({
      method: 'GET',
      endpoint,
      headers: options?.headers,
      timeout: options?.timeout,
      metadata: options?.metadata
    });
  }

  /**
   * Execute POST request
   */
  async post(
    endpoint: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeout?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<HTTPResponse> {
    return this.request({
      method: 'POST',
      endpoint,
      body,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      timeout: options?.timeout,
      metadata: options?.metadata
    });
  }

  /**
   * Execute PUT request
   */
  async put(
    endpoint: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeout?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<HTTPResponse> {
    return this.request({
      method: 'PUT',
      endpoint,
      body,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      timeout: options?.timeout,
      metadata: options?.metadata
    });
  }

  /**
   * Execute DELETE request
   */
  async delete(
    endpoint: string,
    options?: {
      headers?: Record<string, string>;
      timeout?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<HTTPResponse> {
    return this.request({
      method: 'DELETE',
      endpoint,
      headers: options?.headers,
      timeout: options?.timeout,
      metadata: options?.metadata
    });
  }

  /**
   * Execute PATCH request
   */
  async patch(
    endpoint: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeout?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<HTTPResponse> {
    return this.request({
      method: 'PATCH',
      endpoint,
      body,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      timeout: options?.timeout,
      metadata: options?.metadata
    });
  }

  /**
   * Execute batch requests in parallel
   */
  async batch(requests: Array<Omit<HTTPRequest, 'id'>>): Promise<HTTPResponse[]> {
    const promises = requests.map(request => 
      this.request(request).catch(error => ({
        id: this.generateRequestId(),
        status: 0,
        statusText: 'Request Failed',
        headers: {},
        error: {
          code: 'REQUEST_FAILED',
          message: error.message
        },
        metadata: {
          responseTime: 0,
          timestamp: new Date(),
          retryCount: 0
        }
      } as HTTPResponse))
    );

    return Promise.all(promises);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    entries: Array<{
      key: string;
      timestamp: number;
      ttl: number;
      size: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      timestamp: entry.timestamp,
      ttl: entry.ttl,
      size: JSON.stringify(entry.response).length
    }));

    return {
      size: this.cache.size,
      hitRate: this.metrics.getCacheHitRate(),
      entries
    };
  }

  /**
   * Get client statistics
   */
  getStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    cacheHitRate: number;
    circuitBreakerState: string;
    rateLimiterStats: {
      tokensRemaining: number;
      requestsPerSecond: number;
    };
  } {
    return {
      totalRequests: this.metrics.getTotalRequests(),
      successfulRequests: this.metrics.getSuccessfulRequests(),
      failedRequests: this.metrics.getFailedRequests(),
      averageResponseTime: this.metrics.getAverageResponseTime(),
      cacheHitRate: this.metrics.getCacheHitRate(),
      circuitBreakerState: this.circuitBreaker.getState(),
      rateLimiterStats: this.rateLimiter.getStats()
    };
  }

  // Private methods

  private async executeRequestWithRetry(request: HTTPRequest): Promise<HTTPResponse> {
    let lastError: Error | null = null;
    const maxRetries = request.retries || this.config.retryPolicy.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeHttpRequest(request, attempt);
        
        // Cache successful GET responses
        if (request.method === 'GET' && 
            this.config.cache.enabled && 
            this.config.cache.cacheableStatusCodes.includes(response.status)) {
          this.cacheResponse(request, response);
        }

        return response;

      } catch (error) {
        lastError = error;
        
        // Don't retry if status code is not retryable
        if (error.status && 
            !this.config.retryPolicy.retryableStatusCodes.includes(error.status)) {
          break;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(attempt);
        this.logger.debug(`Request ${request.id} failed, retrying in ${delay}ms (attempt ${attempt + 1})`);
        
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Request failed');
  }

  private async executeHttpRequest(request: HTTPRequest, retryCount: number): Promise<HTTPResponse> {
    const startTime = Date.now();
    const url = this.buildURL(request.endpoint);
    
    try {
      const headers = this.buildHeaders(request.headers);
      const options: any = {
        method: request.method,
        headers,
        timeout: request.timeout,
        agent: this.httpAgent
      };

      if (request.body) {
        if (typeof request.body === 'object') {
          options.body = JSON.stringify(request.body);
          headers['Content-Type'] = 'application/json';
        } else {
          options.body = request.body;
        }
      }

      const response = await fetch(url, options);
      const responseTime = Date.now() - startTime;

      let data: any;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (contentType.includes('text/')) {
        data = await response.text();
      } else {
        data = await response.arrayBuffer();
      }

      const httpResponse: HTTPResponse = {
        id: request.id,
        status: response.status,
        statusText: response.statusText,
        headers: this.extractHeaders(response.headers),
        data,
        metadata: {
          responseTime,
          timestamp: new Date(),
          retryCount
        }
      };

      // Record metrics
      this.metrics.recordRequest(response.status, responseTime);

      // Check if response indicates an error
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).status = response.status;
        (error as any).response = httpResponse;
        throw error;
      }

      this.emit('response', httpResponse);
      return httpResponse;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.metrics.recordRequest(error.status || 0, responseTime, true);
      
      this.logger.error(`HTTP request failed:`, {
        url,
        method: request.method,
        error: error.message,
        retryCount
      });

      this.emit('error', { request, error, retryCount });
      throw error;
    }
  }

  private buildURL(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }

    const baseURL = this.config.baseURL.endsWith('/') 
      ? this.config.baseURL.slice(0, -1) 
      : this.config.baseURL;
    
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    return `${baseURL}${path}`;
  }

  private buildHeaders(requestHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'claude-env-http-client/1.0',
      'Accept': 'application/json',
      ...requestHeaders
    };

    // Add authentication headers
    switch (this.config.authentication.type) {
      case 'bearer':
        if (this.config.authentication.credentials.token) {
          headers['Authorization'] = `Bearer ${this.config.authentication.credentials.token}`;
        }
        break;
        
      case 'basic':
        if (this.config.authentication.credentials.username && 
            this.config.authentication.credentials.password) {
          const credentials = Buffer.from(
            `${this.config.authentication.credentials.username}:${this.config.authentication.credentials.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;
        
      case 'apikey':
        if (this.config.authentication.credentials.apiKey && 
            this.config.authentication.credentials.headerName) {
          headers[this.config.authentication.credentials.headerName] = 
            this.config.authentication.credentials.apiKey;
        }
        break;
    }

    // Add compression headers
    if (this.config.compression.enabled) {
      headers['Accept-Encoding'] = this.config.compression.algorithms.join(', ');
    }

    return headers;
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  private generateRequestId(): string {
    return `http_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.config.retryPolicy.initialDelay * 
      Math.pow(this.config.retryPolicy.backoffMultiplier, attempt),
      this.config.retryPolicy.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCachedResponse(request: HTTPRequest): HTTPResponse | null {
    const cacheKey = this.generateCacheKey(request);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    // Clone response and mark as from cache
    const cachedResponse = { ...entry.response };
    cachedResponse.metadata = {
      ...cachedResponse.metadata,
      fromCache: true
    };

    return cachedResponse;
  }

  private cacheResponse(request: HTTPRequest, response: HTTPResponse): void {
    if (this.cache.size >= this.config.cache.maxSize) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      const toRemove = Math.floor(this.config.cache.maxSize * 0.1);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }

    const cacheKey = this.generateCacheKey(request);
    const entry: CacheEntry = {
      key: cacheKey,
      response,
      timestamp: Date.now(),
      ttl: this.config.cache.ttl,
      etag: response.headers['etag'],
      lastModified: response.headers['last-modified']
    };

    this.cache.set(cacheKey, entry);
  }

  private generateCacheKey(request: HTTPRequest): string {
    const url = this.buildURL(request.endpoint);
    const headerKeys = Object.keys(request.headers || {}).sort();
    const headerString = headerKeys.map(key => `${key}:${request.headers![key]}`).join('|');
    
    return `${request.method}:${url}:${headerString}`;
  }

  private setupHttpAgent(): void {
    if (this.config.keepAlive.enabled) {
      const { Agent } = require('http');
      const { Agent: HttpsAgent } = require('https');
      
      const agentOptions = {
        keepAlive: true,
        maxSockets: this.config.keepAlive.maxSockets,
        maxFreeSockets: this.config.keepAlive.maxFreeSockets,
        timeout: this.config.keepAlive.timeout
      };

      // For HTTPS requests
      if (this.config.security.tlsEnabled) {
        this.httpAgent = new HttpsAgent({
          ...agentOptions,
          rejectUnauthorized: this.config.security.verifySSL,
          cert: this.config.security.clientCert,
          key: this.config.security.clientKey
        });
      } else {
        this.httpAgent = new Agent(agentOptions);
      }
    }
  }

  private setupCacheCleanup(): void {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => this.cache.delete(key));

      if (expiredKeys.length > 0) {
        this.logger.debug(`Cleaned up ${expiredKeys.length} expired cache entries`);
      }
    }, 5 * 60 * 1000);
  }
}

/**
 * Rate Limiter for HTTP requests
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

  getStats(): { tokensRemaining: number; requestsPerSecond: number } {
    return {
      tokensRemaining: this.tokens,
      requestsPerSecond: this.maxRequestsPerSecond
    };
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
 * HTTP Connection Pool for managing multiple HTTP clients
 */
export class HTTPConnectionPool {
  private clients: Map<string, HTTPProtocol> = new Map();
  private clientConfigs: Map<string, HTTPClientConfig> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('HTTPConnectionPool');
  }

  /**
   * Add an HTTP client to the pool
   */
  addClient(name: string, config: HTTPClientConfig): void {
    if (this.clients.has(name)) {
      throw new Error(`HTTP client ${name} already exists`);
    }

    const client = new HTTPProtocol(config);
    this.clients.set(name, client);
    this.clientConfigs.set(name, config);

    this.logger.info(`Added HTTP client: ${name}`);
  }

  /**
   * Get an HTTP client from the pool
   */
  getClient(name: string): HTTPProtocol | undefined {
    return this.clients.get(name);
  }

  /**
   * Remove an HTTP client from the pool
   */
  removeClient(name: string): void {
    this.clients.delete(name);
    this.clientConfigs.delete(name);
    this.logger.info(`Removed HTTP client: ${name}`);
  }

  /**
   * Get all client names
   */
  getClientNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get statistics for all clients
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, client] of this.clients) {
      stats[name] = client.getStats();
    }
    
    return stats;
  }
}