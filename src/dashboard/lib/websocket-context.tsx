'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface WebSocketContextType {
  socket: Socket | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  lastActivity: Date | null;
  emit: (event: string, data: any) => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);
    setConnectionStatus('connecting');

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setLastActivity(new Date());
      toast.success('Connected to Claude Environment');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        // Server disconnected, need to reconnect manually
        newSocket.connect();
      }
      toast.error('Connection lost');
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionStatus('disconnected');
      toast.error('Failed to connect to server');
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('WebSocket reconnected after', attemptNumber, 'attempts');
      setConnectionStatus('connected');
      setLastActivity(new Date());
      toast.success('Reconnected to server');
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection error:', error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      toast.error('Unable to reconnect to server');
    });

    // Environment-specific event handlers
    newSocket.on('sync:started', (data) => {
      console.log('Sync started:', data);
      setLastActivity(new Date());
      toast.loading(`Sync started for ${data.environment}`, {
        id: `sync-${data.environment}`,
      });
    });

    newSocket.on('sync:completed', (data) => {
      console.log('Sync completed:', data);
      setLastActivity(new Date());
      if (data.status === 'success') {
        toast.success(`Sync completed for ${data.environment}`, {
          id: `sync-${data.environment}`,
        });
      } else {
        toast.error(`Sync failed for ${data.environment}`, {
          id: `sync-${data.environment}`,
        });
      }
    });

    newSocket.on('sync:progress', (data) => {
      console.log('Sync progress:', data);
      setLastActivity(new Date());
      // Could show progress in toast or notification
    });

    newSocket.on('environment:status-changed', (data) => {
      console.log('Environment status changed:', data);
      setLastActivity(new Date());
      
      const statusMessages = {
        online: `Environment ${data.environment} is now online`,
        offline: `Environment ${data.environment} is now offline`,
        error: `Environment ${data.environment} encountered an error`,
        maintenance: `Environment ${data.environment} is under maintenance`,
      };
      
      const message = statusMessages[data.status as keyof typeof statusMessages] || 
                     `Environment ${data.environment} status: ${data.status}`;
      
      if (data.status === 'online') {
        toast.success(message);
      } else if (data.status === 'error') {
        toast.error(message);
      } else {
        toast(message);
      }
    });

    newSocket.on('mcp:server-status', (data) => {
      console.log('MCP server status:', data);
      setLastActivity(new Date());
      
      if (data.status === 'offline') {
        toast.error(`MCP server ${data.server} is offline`);
      } else if (data.status === 'online') {
        toast.success(`MCP server ${data.server} is back online`);
      }
    });

    newSocket.on('notification', (data) => {
      console.log('Notification:', data);
      setLastActivity(new Date());
      
      switch (data.type) {
        case 'info':
          toast(data.message);
          break;
        case 'success':
          toast.success(data.message);
          break;
        case 'warning':
          toast(data.message, { icon: '⚠️' });
          break;
        case 'error':
          toast.error(data.message);
          break;
        default:
          toast(data.message);
      }
    });

    // Cleanup on unmount
    return () => {
      newSocket.removeAllListeners();
      newSocket.disconnect();
    };
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socket && connectionStatus === 'connected') {
      socket.emit(event, data);
      setLastActivity(new Date());
    } else {
      console.warn('Cannot emit event: socket not connected');
      toast.error('Cannot send request: not connected to server');
    }
  }, [socket, connectionStatus]);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (socket) {
      socket.on(event, callback);
      return () => {
        socket.off(event, callback);
      };
    }
    return () => {};
  }, [socket]);

  const contextValue: WebSocketContextType = {
    socket,
    connectionStatus,
    lastActivity,
    emit,
    subscribe,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}