import { WebSocketServer, WebSocket } from 'ws';
import { createLogger } from '@shared/utils/logger';
import { WebSocketMessage } from '@shared/types';
import { EnvironmentController } from './EnvironmentController';

const logger = createLogger('environment-controller:websocket');

interface AuthenticatedWebSocket extends WebSocket {
  isAuthenticated?: boolean;
  userId?: string;
  teamId?: string;
  subscriptions?: Set<string>;
}

export class WebSocketHandler {
  private clients = new Map<string, AuthenticatedWebSocket>();
  private subscriptions = new Map<string, Set<string>>();

  constructor(
    private wss: WebSocketServer,
    private environmentController: EnvironmentController
  ) {
    this.setupWebSocketServer();
    this.setupEnvironmentEventListeners();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    logger.info('WebSocket server initialized');
  }

  private handleConnection(ws: AuthenticatedWebSocket): void {
    const clientId = this.generateClientId();
    ws.subscriptions = new Set();
    
    logger.info('New WebSocket connection', { clientId });

    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(ws, clientId, message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', { clientId, error });
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { clientId, error });
      this.handleDisconnection(clientId);
    });

    this.clients.set(clientId, ws);
  }

  private async handleMessage(
    ws: AuthenticatedWebSocket,
    clientId: string,
    message: WebSocketMessage
  ): Promise<void> {
    logger.debug('Received WebSocket message', {
      clientId,
      type: message.type,
      correlationId: message.correlationId
    });

    try {
      switch (message.type) {
        case 'authenticate':
          await this.handleAuthentication(ws, clientId, message);
          break;
        
        case 'subscribe':
          await this.handleSubscription(ws, clientId, message);
          break;
        
        case 'unsubscribe':
          await this.handleUnsubscription(ws, clientId, message);
          break;
        
        case 'environment.status':
          await this.handleEnvironmentStatusRequest(ws, clientId, message);
          break;
        
        case 'environment.logs':
          await this.handleEnvironmentLogsRequest(ws, clientId, message);
          break;
        
        default:
          logger.warn('Unknown message type', { clientId, type: message.type });
          this.sendError(ws, 'Unknown message type', message.correlationId);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', {
        clientId,
        type: message.type,
        error
      });
      this.sendError(ws, 'Internal server error', message.correlationId);
    }
  }

  private async handleAuthentication(
    ws: AuthenticatedWebSocket,
    clientId: string,
    message: WebSocketMessage
  ): Promise<void> {
    const { token } = message.payload;
    
    if (!token) {
      this.sendError(ws, 'Authentication token required', message.correlationId);
      return;
    }

    try {
      // TODO: Validate JWT token (similar to HTTP auth middleware)
      // For now, we'll accept any token for development
      const userId = 'user-1'; // Extract from token
      const teamId = 'team-1'; // Extract from token
      
      ws.isAuthenticated = true;
      ws.userId = userId;
      ws.teamId = teamId;
      
      this.sendMessage(ws, {
        type: 'authentication.success',
        payload: { authenticated: true },
        timestamp: new Date(),
        correlationId: message.correlationId
      });
      
      logger.info('WebSocket client authenticated', { clientId, userId, teamId });
    } catch (error) {
      logger.warn('WebSocket authentication failed', { clientId, error });
      this.sendError(ws, 'Authentication failed', message.correlationId);
    }
  }

  private async handleSubscription(
    ws: AuthenticatedWebSocket,
    clientId: string,
    message: WebSocketMessage
  ): Promise<void> {
    if (!ws.isAuthenticated) {
      this.sendError(ws, 'Authentication required', message.correlationId);
      return;
    }

    const { channel } = message.payload;
    
    if (!channel) {
      this.sendError(ws, 'Channel name required', message.correlationId);
      return;
    }

    ws.subscriptions!.add(channel);
    
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(clientId);
    
    this.sendMessage(ws, {
      type: 'subscription.success',
      payload: { channel, subscribed: true },
      timestamp: new Date(),
      correlationId: message.correlationId
    });
    
    logger.debug('Client subscribed to channel', { clientId, channel });
  }

  private async handleUnsubscription(
    ws: AuthenticatedWebSocket,
    clientId: string,
    message: WebSocketMessage
  ): Promise<void> {
    const { channel } = message.payload;
    
    if (!channel) {
      this.sendError(ws, 'Channel name required', message.correlationId);
      return;
    }

    ws.subscriptions!.delete(channel);
    
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel)!.delete(clientId);
      
      // Clean up empty channel subscriptions
      if (this.subscriptions.get(channel)!.size === 0) {
        this.subscriptions.delete(channel);
      }
    }
    
    this.sendMessage(ws, {
      type: 'unsubscription.success',
      payload: { channel, unsubscribed: true },
      timestamp: new Date(),
      correlationId: message.correlationId
    });
    
    logger.debug('Client unsubscribed from channel', { clientId, channel });
  }

  private async handleEnvironmentStatusRequest(
    ws: AuthenticatedWebSocket,
    clientId: string,
    message: WebSocketMessage
  ): Promise<void> {
    if (!ws.isAuthenticated) {
      this.sendError(ws, 'Authentication required', message.correlationId);
      return;
    }

    const { environmentId } = message.payload;
    
    try {
      const status = await this.environmentController.getEnvironmentStatus(environmentId);
      
      this.sendMessage(ws, {
        type: 'environment.status.response',
        payload: { environmentId, status },
        timestamp: new Date(),
        correlationId: message.correlationId
      });
    } catch (error) {
      logger.error('Failed to get environment status', { clientId, environmentId, error });
      this.sendError(ws, 'Failed to get environment status', message.correlationId);
    }
  }

  private async handleEnvironmentLogsRequest(
    ws: AuthenticatedWebSocket,
    clientId: string,
    message: WebSocketMessage
  ): Promise<void> {
    if (!ws.isAuthenticated) {
      this.sendError(ws, 'Authentication required', message.correlationId);
      return;
    }

    const { environmentId, since, follow } = message.payload;
    
    try {
      const logs = await this.environmentController.getEnvironmentLogs(environmentId, {
        since,
        follow: false // For WebSocket, we handle streaming differently
      });
      
      this.sendMessage(ws, {
        type: 'environment.logs.response',
        payload: { environmentId, logs },
        timestamp: new Date(),
        correlationId: message.correlationId
      });

      // If follow is requested, subscribe to log updates
      if (follow) {
        const logChannel = `environment.${environmentId}.logs`;
        ws.subscriptions!.add(logChannel);
        
        if (!this.subscriptions.has(logChannel)) {
          this.subscriptions.set(logChannel, new Set());
        }
        this.subscriptions.get(logChannel)!.add(clientId);
      }
    } catch (error) {
      logger.error('Failed to get environment logs', { clientId, environmentId, error });
      this.sendError(ws, 'Failed to get environment logs', message.correlationId);
    }
  }

  private handleDisconnection(clientId: string): void {
    const ws = this.clients.get(clientId);
    
    if (ws && ws.subscriptions) {
      // Remove from all subscriptions
      ws.subscriptions.forEach(channel => {
        if (this.subscriptions.has(channel)) {
          this.subscriptions.get(channel)!.delete(clientId);
          
          // Clean up empty channels
          if (this.subscriptions.get(channel)!.size === 0) {
            this.subscriptions.delete(channel);
          }
        }
      });
    }
    
    this.clients.delete(clientId);
    
    logger.info('WebSocket client disconnected', { clientId });
  }

  private setupEnvironmentEventListeners(): void {
    // Listen to environment controller events and broadcast to subscribers
    this.environmentController.on('environment.status.changed', (data) => {
      this.broadcastToChannel(`environment.${data.environmentId}.status`, {
        type: 'environment.status.changed',
        payload: data,
        timestamp: new Date()
      });
    });

    this.environmentController.on('environment.logs.new', (data) => {
      this.broadcastToChannel(`environment.${data.environmentId}.logs`, {
        type: 'environment.logs.new',
        payload: data,
        timestamp: new Date()
      });
    });

    this.environmentController.on('environment.created', (data) => {
      this.broadcastToChannel('environments', {
        type: 'environment.created',
        payload: data,
        timestamp: new Date()
      });
    });

    this.environmentController.on('environment.deleted', (data) => {
      this.broadcastToChannel('environments', {
        type: 'environment.deleted',
        payload: data,
        timestamp: new Date()
      });
    });
  }

  private broadcastToChannel(channel: string, message: WebSocketMessage): void {
    const subscribers = this.subscriptions.get(channel);
    
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    subscribers.forEach(clientId => {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
      }
    });

    logger.debug('Broadcasted message to channel', {
      channel,
      subscriberCount: subscribers.size,
      messageType: message.type
    });
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string, correlationId?: string): void {
    this.sendMessage(ws, {
      type: 'error',
      payload: { error },
      timestamp: new Date(),
      correlationId
    });
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      activeChannels: this.subscriptions.size,
      totalSubscriptions: Array.from(this.subscriptions.values())
        .reduce((total, subscribers) => total + subscribers.size, 0)
    };
  }
}