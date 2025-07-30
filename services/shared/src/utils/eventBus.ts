import { EventEmitter } from 'events';
import { createLogger } from './logger';

const logger = createLogger('event-bus');

export interface EventPayload {
  type: string;
  source: string;
  timestamp: Date;
  correlationId?: string;
  data: any;
}

export interface EventSubscription {
  id: string;
  pattern: string;
  callback: (event: EventPayload) => void | Promise<void>;
  options: EventSubscriptionOptions;
}

export interface EventSubscriptionOptions {
  once?: boolean;
  async?: boolean;
  timeout?: number;
  retries?: number;
}

export class EventBus extends EventEmitter {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventHistory: EventPayload[] = [];
  private maxHistorySize: number = 1000;

  constructor(maxHistorySize?: number) {
    super();
    this.maxHistorySize = maxHistorySize || 1000;
    this.setMaxListeners(0); // Remove listener limit warning
  }

  subscribe(
    pattern: string,
    callback: (event: EventPayload) => void | Promise<void>,
    options: EventSubscriptionOptions = {}
  ): string {
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      pattern,
      callback,
      options: {
        once: false,
        async: true,
        timeout: 5000,
        retries: 0,
        ...options
      }
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Set up event listener
    const eventHandler = async (event: EventPayload) => {
      if (this.matchesPattern(event.type, pattern)) {
        await this.handleEvent(subscription, event);
        
        if (subscription.options.once) {
          this.unsubscribe(subscriptionId);
        }
      }
    };

    this.on('event', eventHandler);

    logger.debug(`Event subscription created`, {
      subscriptionId,
      pattern,
      options
    });

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
      this.removeAllListeners(subscription.pattern);
      
      logger.debug(`Event subscription removed`, { subscriptionId });
      return true;
    }
    return false;
  }

  async publish(
    type: string,
    data: any,
    source: string,
    correlationId?: string
  ): Promise<void> {
    const event: EventPayload = {
      type,
      source,
      timestamp: new Date(),
      correlationId,
      data
    };

    // Add to history
    this.addToHistory(event);

    logger.debug(`Event published`, {
      type,
      source,
      correlationId,
      dataKeys: Object.keys(data || {})
    });

    // Emit the event
    this.emit('event', event);

    // Also emit with specific type for direct listeners
    this.emit(type, event);
  }

  publishSync(
    type: string,
    data: any,
    source: string,
    correlationId?: string
  ): void {
    const event: EventPayload = {
      type,
      source,
      timestamp: new Date(),
      correlationId,
      data
    };

    // Add to history
    this.addToHistory(event);

    logger.debug(`Event published synchronously`, {
      type,
      source,
      correlationId
    });

    // Emit the event synchronously
    this.emit('event', event);
    this.emit(type, event);
  }

  getEventHistory(filter?: {
    type?: string;
    source?: string;
    since?: Date;
    limit?: number;
  }): EventPayload[] {
    let events = [...this.eventHistory];

    if (filter) {
      if (filter.type) {
        events = events.filter(event => 
          this.matchesPattern(event.type, filter.type!)
        );
      }

      if (filter.source) {
        events = events.filter(event => event.source === filter.source);
      }

      if (filter.since) {
        events = events.filter(event => event.timestamp >= filter.since!);
      }

      if (filter.limit) {
        events = events.slice(-filter.limit);
      }
    }

    return events;
  }

  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  getActiveSubscriptions(pattern?: string): EventSubscription[] {
    const subscriptions = Array.from(this.subscriptions.values());
    
    if (pattern) {
      return subscriptions.filter(sub => 
        this.matchesPattern(sub.pattern, pattern)
      );
    }

    return subscriptions;
  }

  clearHistory(): void {
    this.eventHistory = [];
    logger.debug('Event history cleared');
  }

  getStats(): any {
    return {
      subscriptions: this.subscriptions.size,
      historySize: this.eventHistory.length,
      maxHistorySize: this.maxHistorySize,
      listenerCount: this.listenerCount('event'),
      eventTypes: [...new Set(this.eventHistory.map(e => e.type))],
      sources: [...new Set(this.eventHistory.map(e => e.source))]
    };
  }

  private async handleEvent(
    subscription: EventSubscription,
    event: EventPayload
  ): Promise<void> {
    try {
      if (subscription.options.async) {
        // Handle asynchronously with timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Event handler timeout: ${subscription.options.timeout}ms`));
          }, subscription.options.timeout);
        });

        const handlerPromise = Promise.resolve(subscription.callback(event));
        
        await Promise.race([handlerPromise, timeoutPromise]);
      } else {
        // Handle synchronously
        await subscription.callback(event);
      }

      logger.debug(`Event handled successfully`, {
        subscriptionId: subscription.id,
        eventType: event.type,
        source: event.source
      });

    } catch (error) {
      logger.error(`Event handler failed`, {
        subscriptionId: subscription.id,
        eventType: event.type,
        source: event.source,
        error: error instanceof Error ? error.message : error
      });

      // Emit error event
      this.emit('handler-error', {
        subscription,
        event,
        error
      });

      // Retry logic
      if (subscription.options.retries && subscription.options.retries > 0) {
        logger.debug(`Retrying event handler`, {
          subscriptionId: subscription.id,
          retriesLeft: subscription.options.retries
        });

        subscription.options.retries--;
        setTimeout(() => {
          this.handleEvent(subscription, event);
        }, 1000); // 1 second delay before retry
      }
    }
  }

  private matchesPattern(eventType: string, pattern: string): boolean {
    // Support basic wildcard patterns
    if (pattern === '*') {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*') + '$'
      );
      return regex.test(eventType);
    }

    return eventType === pattern;
  }

  private addToHistory(event: EventPayload): void {
    this.eventHistory.push(event);
    
    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  shutdown(): void {
    this.removeAllListeners();
    this.subscriptions.clear();
    this.eventHistory = [];
    logger.info('Event bus shutdown completed');
  }
}

// Global event bus instance
let globalEventBus: EventBus | null = null;

export const getEventBus = (): EventBus => {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
};

export const createEventBus = (maxHistorySize?: number): EventBus => {
  return new EventBus(maxHistorySize);
};