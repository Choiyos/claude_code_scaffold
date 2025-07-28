/**
 * Request Batching and Optimization Engine
 * Batches requests, implements caching strategies, and optimizes MCP server communication
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import { MetricsCollector } from '../../monitoring/metrics-collector';

export interface BatchRequest {
  id: string;
  method: string;
  params: any;
  serverType: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchTimeout: number;
  maxWaitTime: number;
  priorityLevels: {
    critical: { maxWaitTime: number; batchSize: number };
    high: { maxWaitTime: number; batchSize: number };
    normal: { maxWaitTime: number; batchSize: number };
    low: { maxWaitTime: number; batchSize: number };
  };
  deduplication: {
    enabled: boolean;
    keyGenerator: (request: BatchRequest) => string;
    ttl: number;
  };
  compression: {
    enabled: boolean;
    threshold: number;
    algorithm: 'gzip' | 'brotli' | 'deflate';
  };
  retry: {
    maxAttempts: number;
    backoffMultiplier: number;
    initialDelay: number;
    maxDelay: number;
  };
}

export interface CacheEntry {
  key: string;
  value: any;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  size: number;
  metadata?: Record<string, any>;
}

export interface CacheConfig {
  maxSize: number; // in bytes
  maxEntries: number;
  defaultTtl: number;
  evictionPolicy: 'lru' | 'lfu' | 'ttl' | 'size';
  compression: {
    enabled: boolean;
    threshold: number;
  };
  persistence: {
    enabled: boolean;
    interval: number;
    path: string;
  };
  warmup: {
    enabled: boolean;
    preload: Array<{
      key: string;
      method: string;
      params: any;
    }>;
  };
}

export class RequestBatchingEngine extends EventEmitter {
  private batches: Map<string, BatchRequest[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private deduplicationCache: Map<string, Promise<any>> = new Map();
  private cache: ResponseCache;
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor(
    private config: BatchConfig,
    cacheConfig: CacheConfig
  ) {
    super();
    this.logger = new Logger('RequestBatchingEngine');
    this.metrics = new MetricsCollector();
    this.cache = new ResponseCache(cacheConfig);

    this.setupCleanupInterval();
  }

  /**
   * Add a request to the batching queue
   */
  async addRequest(
    method: string,
    params: any,
    serverType: string,
    options?: {
      priority?: 'low' | 'normal' | 'high' | 'critical';
      timeout?: number;
      cacheKey?: string;
      cacheTtl?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<any> {
    const priority = options?.priority || 'normal';
    const timeout = options?.timeout || 30000;

    // Check cache first
    if (options?.cacheKey) {
      const cached = await this.cache.get(options.cacheKey);
      if (cached) {
        this.metrics.recordCacheHit(serverType, method);
        return cached;
      }
    }

    // Check deduplication
    if (this.config.deduplication.enabled) {
      const dedupKey = this.config.deduplication.keyGenerator({
        method,
        params,
        serverType
      } as BatchRequest);

      const existingRequest = this.deduplicationCache.get(dedupKey);
      if (existingRequest) {
        this.metrics.recordDeduplication(serverType, method);
        return existingRequest;
      }
    }

    // Create new request
    return new Promise((resolve, reject) => {
      const request: BatchRequest = {
        id: this.generateRequestId(),
        method,
        params,
        serverType,
        priority,
        timeout,
        metadata: options?.metadata,
        createdAt: new Date(),
        resolve: (result) => {
          // Cache result if cache key provided
          if (options?.cacheKey) {
            this.cache.set(
              options.cacheKey,
              result,
              options?.cacheTtl || this.cache.defaultTtl
            ).catch(error => {
              this.logger.warn('Failed to cache result:', error);
            });
          }
          resolve(result);
        },
        reject
      };

      // Add to deduplication cache
      if (this.config.deduplication.enabled) {
        const dedupKey = this.config.deduplication.keyGenerator(request);
        const promise = new Promise((dedupResolve, dedupReject) => {
          request.resolve = dedupResolve;
          request.reject = dedupReject;
        });
        this.deduplicationCache.set(dedupKey, promise);

        // Clean up deduplication cache
        setTimeout(() => {
          this.deduplicationCache.delete(dedupKey);
        }, this.config.deduplication.ttl);
      }

      this.addToBatch(request);
    });
  }

  /**
   * Flush all pending batches immediately
   */
  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const [batchKey, requests] of this.batches.entries()) {
      if (requests.length > 0) {
        flushPromises.push(this.processBatch(batchKey, requests));
      }
    }

    await Promise.all(flushPromises);
  }

  /**
   * Get batching statistics
   */
  getStats(): {
    pendingBatches: number;
    totalRequests: number;
    batchesByServerType: Record<string, number>;
    averageBatchSize: number;
    cacheStats: any;
    deduplicationHits: number;
  } {
    const totalRequests = Array.from(this.batches.values())
      .reduce((sum, batch) => sum + batch.length, 0);

    const batchesByServerType: Record<string, number> = {};
    for (const requests of this.batches.values()) {
      for (const request of requests) {
        batchesByServerType[request.serverType] = 
          (batchesByServerType[request.serverType] || 0) + 1;
      }
    }

    const averageBatchSize = this.batches.size > 0 ? 
      totalRequests / this.batches.size : 0;

    return {
      pendingBatches: this.batches.size,
      totalRequests,
      batchesByServerType,
      averageBatchSize,
      cacheStats: this.cache.getStats(),
      deduplicationHits: this.metrics.getDeduplicationHits()
    };
  }

  /**
   * Clear all caches and pending requests
   */
  async clear(): Promise<void> {
    // Cancel all pending batches
    for (const [batchKey, requests] of this.batches.entries()) {
      for (const request of requests) {
        request.reject(new Error('Batch cleared'));
      }
    }

    // Clear timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }

    this.batches.clear();
    this.batchTimers.clear();
    this.deduplicationCache.clear();
    
    await this.cache.clear();
  }

  // Private methods

  private addToBatch(request: BatchRequest): void {
    const batchKey = this.generateBatchKey(request);
    
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }

    const batch = this.batches.get(batchKey)!;
    batch.push(request);

    // Sort batch by priority
    batch.sort((a, b) => this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority));

    // Check if batch should be processed immediately
    const priorityConfig = this.config.priorityLevels[request.priority];
    const shouldFlushImmediately = 
      batch.length >= priorityConfig.batchSize ||
      batch.length >= this.config.maxBatchSize ||
      request.priority === 'critical';

    if (shouldFlushImmediately) {
      this.processBatch(batchKey, batch);
      return;
    }

    // Set or reset batch timer
    this.setBatchTimer(batchKey, request.priority);
  }

  private setBatchTimer(batchKey: string, priority: BatchRequest['priority']): void {
    // Clear existing timer
    const existingTimer = this.batchTimers.get(batchKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const priorityConfig = this.config.priorityLevels[priority];
    const waitTime = Math.min(priorityConfig.maxWaitTime, this.config.maxWaitTime);

    const timer = setTimeout(() => {
      const batch = this.batches.get(batchKey);
      if (batch && batch.length > 0) {
        this.processBatch(batchKey, batch);
      }
    }, waitTime);

    this.batchTimers.set(batchKey, timer);
  }

  private async processBatch(batchKey: string, requests: BatchRequest[]): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    this.logger.debug(`Processing batch: ${batchKey} with ${requests.length} requests`);

    // Clear batch from tracking
    this.batches.delete(batchKey);
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    try {
      // Group requests by method for better batching
      const methodGroups = this.groupRequestsByMethod(requests);
      
      for (const [method, methodRequests] of methodGroups.entries()) {
        await this.executeBatchForMethod(method, methodRequests);
      }

      this.metrics.recordBatchProcessed(batchKey, requests.length);
      this.emit('batch:processed', { batchKey, requestCount: requests.length });

    } catch (error) {
      this.logger.error(`Batch processing failed: ${batchKey}`, error);
      
      // Reject all requests in the batch
      for (const request of requests) {
        request.reject(error);
      }

      this.metrics.recordBatchError(batchKey, requests.length);
      this.emit('batch:error', { batchKey, error, requestCount: requests.length });
    }
  }

  private groupRequestsByMethod(requests: BatchRequest[]): Map<string, BatchRequest[]> {
    const groups = new Map<string, BatchRequest[]>();
    
    for (const request of requests) {
      const key = `${request.serverType}:${request.method}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    }
    
    return groups;
  }

  private async executeBatchForMethod(
    methodKey: string,
    requests: BatchRequest[]
  ): Promise<void> {
    const [serverType, method] = methodKey.split(':');
    
    try {
      // Prepare batch request payload
      const batchPayload = {
        method: 'batch',
        params: {
          requests: requests.map(req => ({
            id: req.id,
            method: req.method,
            params: req.params
          }))
        }
      };

      // Compress payload if needed
      let payload = batchPayload;
      if (this.config.compression.enabled) {
        const payloadSize = JSON.stringify(payload).length;
        if (payloadSize > this.config.compression.threshold) {
          payload = await this.compressPayload(payload);
        }
      }

      // Execute batch with retry logic
      const response = await this.executeWithRetry(serverType, payload);
      
      // Process response and resolve individual requests
      this.processeBatchResponse(requests, response);

    } catch (error) {
      this.logger.error(`Method batch execution failed: ${methodKey}`, error);
      
      // Try individual execution as fallback
      await this.fallbackToIndividualExecution(requests);
    }
  }

  private async executeWithRetry(
    serverType: string,
    payload: any,
    attempt: number = 1
  ): Promise<any> {
    try {
      // This would be replaced with actual server communication
      return await this.mockServerExecution(serverType, payload);
      
    } catch (error) {
      if (attempt >= this.config.retry.maxAttempts) {
        throw error;
      }

      const delay = Math.min(
        this.config.retry.initialDelay * Math.pow(this.config.retry.backoffMultiplier, attempt - 1),
        this.config.retry.maxDelay
      );

      this.logger.debug(`Retrying batch execution, attempt ${attempt + 1} in ${delay}ms`);
      
      await this.sleep(delay);
      return this.executeWithRetry(serverType, payload, attempt + 1);
    }
  }

  private processeBatchResponse(requests: BatchRequest[], response: any): void {
    if (response.results && Array.isArray(response.results)) {
      // Process individual results
      for (let i = 0; i < requests.length && i < response.results.length; i++) {
        const request = requests[i];
        const result = response.results[i];
        
        if (result.error) {
          request.reject(new Error(result.error.message || 'Request failed'));
        } else {
          request.resolve(result.data);
        }
      }
    } else if (response.error) {
      // Batch-level error
      for (const request of requests) {
        request.reject(new Error(response.error.message || 'Batch execution failed'));
      }
    } else {
      // Unexpected response format
      for (const request of requests) {
        request.reject(new Error('Invalid batch response format'));
      }
    }
  }

  private async fallbackToIndividualExecution(requests: BatchRequest[]): Promise<void> {
    this.logger.info(`Falling back to individual execution for ${requests.length} requests`);
    
    const execPromises = requests.map(async (request) => {
      try {
        const result = await this.mockServerExecution(request.serverType, {
          method: request.method,
          params: request.params
        });
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    });

    await Promise.allSettled(execPromises);
  }

  private async compressPayload(payload: any): Promise<any> {
    // Implementation would use actual compression
    return payload;
  }

  private async mockServerExecution(serverType: string, payload: any): Promise<any> {
    // Mock server execution - replace with actual implementation
    await this.sleep(Math.random() * 100 + 50);
    
    if (payload.method === 'batch') {
      return {
        results: payload.params.requests.map((req: any) => ({
          id: req.id,
          data: { message: `Processed ${req.method}` }
        }))
      };
    } else {
      return { message: `Processed ${payload.method}` };
    }
  }

  private generateBatchKey(request: BatchRequest): string {
    // Group by server type and priority for optimal batching
    return `${request.serverType}:${request.priority}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private getPriorityValue(priority: BatchRequest['priority']): number {
    const values = { critical: 4, high: 3, normal: 2, low: 1 };
    return values[priority] || 2;
  }

  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000); // Cleanup every minute
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();
    
    for (const [batchKey, requests] of this.batches.entries()) {
      const expiredRequests = requests.filter(req => 
        now - req.createdAt.getTime() > req.timeout
      );
      
      for (const expiredRequest of expiredRequests) {
        expiredRequest.reject(new Error('Request timeout'));
        const index = requests.indexOf(expiredRequest);
        if (index > -1) {
          requests.splice(index, 1);
        }
      }
      
      if (requests.length === 0) {
        this.batches.delete(batchKey);
        const timer = this.batchTimers.get(batchKey);
        if (timer) {
          clearTimeout(timer);
          this.batchTimers.delete(batchKey);
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Response Cache Implementation
 */
class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private sizeTracker = 0;
  public defaultTtl: number;
  private logger: Logger;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private config: CacheConfig) {
    this.logger = new Logger('ResponseCache');
    this.defaultTtl = config.defaultTtl;
    this.startCleanupInterval();
  }

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt.getTime()) {
      this.cache.delete(key);
      this.sizeTracker -= entry.size;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const expiresAt = new Date(Date.now() + (ttl || this.defaultTtl));
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized, 'utf8');

    // Check if we need to evict entries
    while (this.shouldEvict(size)) {
      this.evictEntry();
    }

    const entry: CacheEntry = {
      key,
      value,
      createdAt: new Date(),
      expiresAt,
      accessCount: 1,
      lastAccessed: new Date(),
      size
    };

    // Remove existing entry if present
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.sizeTracker -= existingEntry.size;
    }

    this.cache.set(key, entry);
    this.sizeTracker += size;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.sizeTracker = 0;
  }

  getStats(): {
    entries: number;
    size: number;
    hitRate: number;
    averageAccessCount: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);

    return {
      entries: this.cache.size,
      size: this.sizeTracker,
      hitRate: 0, // Would be calculated from metrics
      averageAccessCount: entries.length > 0 ? totalAccess / entries.length : 0
    };
  }

  private shouldEvict(newEntrySize: number): boolean {
    return (
      this.cache.size >= this.config.maxEntries ||
      this.sizeTracker + newEntrySize > this.config.maxSize
    );
  }

  private evictEntry(): void {
    if (this.cache.size === 0) {
      return;
    }

    let entryToEvict: [string, CacheEntry] | null = null;

    switch (this.config.evictionPolicy) {
      case 'lru':
        entryToEvict = this.findLRUEntry();
        break;
      case 'lfu':
        entryToEvict = this.findLFUEntry();
        break;
      case 'ttl':
        entryToEvict = this.findShortestTTLEntry();
        break;
      case 'size':
        entryToEvict = this.findLargestEntry();
        break;
    }

    if (entryToEvict) {
      const [key, entry] = entryToEvict;
      this.cache.delete(key);
      this.sizeTracker -= entry.size;
    }
  }

  private findLRUEntry(): [string, CacheEntry] | null {
    let oldest: [string, CacheEntry] | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest[1].lastAccessed) {
        oldest = [key, entry];
      }
    }
    
    return oldest;
  }

  private findLFUEntry(): [string, CacheEntry] | null {
    let leastUsed: [string, CacheEntry] | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!leastUsed || entry.accessCount < leastUsed[1].accessCount) {
        leastUsed = [key, entry];
      }
    }
    
    return leastUsed;
  }

  private findShortestTTLEntry(): [string, CacheEntry] | null {
    let shortest: [string, CacheEntry] | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!shortest || entry.expiresAt < shortest[1].expiresAt) {
        shortest = [key, entry];
      }
    }
    
    return shortest;
  }

  private findLargestEntry(): [string, CacheEntry] | null {
    let largest: [string, CacheEntry] | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!largest || entry.size > largest[1].size) {
        largest = [key, entry];
      }
    }
    
    return largest;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Cleanup every minute
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt.getTime()) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const entry = this.cache.get(key);
      if (entry) {
        this.cache.delete(key);
        this.sizeTracker -= entry.size;
      }
    }

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }
}