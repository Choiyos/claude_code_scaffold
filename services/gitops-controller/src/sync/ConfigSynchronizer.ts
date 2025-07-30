import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { createHash } from 'crypto';
import { Logger } from '../utils/Logger';

export interface ConfigSynchronizerConfig {
  autoSync: boolean;
  syncInterval: number;
  maxRetries: number;
  configPaths: string[];
  backupPath: string;
  conflictResolution: 'local' | 'remote' | 'merge' | 'manual';
}

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
  timestamp: number;
}

export interface SyncConflict {
  path: string;
  local: any;
  remote: any;
  resolution?: 'local' | 'remote' | 'merge' | 'manual';
  timestamp: number;
}

export interface SyncStatus {
  isRunning: boolean;
  autoSyncEnabled: boolean;
  lastSyncTime: number;
  nextSyncTime: number;
  pendingChanges: number;
  unresolvedConflicts: number;
  syncHistory: SyncOperation[];
}

export class ConfigSynchronizer extends EventEmitter {
  private config: ConfigSynchronizerConfig;
  private logger: Logger;
  private isRunning: boolean = false;
  private syncTimer?: NodeJS.Timeout;
  private pendingOperations: Map<string, SyncOperation> = new Map();
  private syncHistory: SyncOperation[] = [];
  private lastSyncTime: number = 0;
  private configStates: Map<string, any> = new Map();

  constructor(config: Partial<ConfigSynchronizerConfig>) {
    super();
    
    this.config = {
      autoSync: true,
      syncInterval: 300000, // 5 minutes
      maxRetries: 3,
      configPaths: [
        '/workspace/config',
        '/workspace/.claude',
        '/workspace/.devcontainer'
      ],
      backupPath: '/workspace/.backup',
      conflictResolution: 'manual',
      ...config
    };
    
    this.logger = new Logger('ConfigSynchronizer');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Config synchronizer is already running');
      return;
    }

    this.logger.info('Starting config synchronizer', {
      autoSync: this.config.autoSync,
      interval: this.config.syncInterval,
      paths: this.config.configPaths
    });

    this.isRunning = true;
    
    // Load current configuration states
    await this.loadConfigurationStates();
    
    // Start auto-sync if enabled
    if (this.config.autoSync) {
      this.scheduleNextSync();
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping config synchronizer');
    
    this.isRunning = false;
    
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    
    // Wait for pending operations to complete
    await this.waitForPendingOperations();
    
    this.pendingOperations.clear();
    this.configStates.clear();
  }

  async triggerSync(type: 'pull' | 'push' | 'merge' = 'pull'): Promise<SyncOperation> {
    const operationId = this.generateOperationId();
    
    const operation: SyncOperation = {
      id: operationId,
      type,
      status: 'pending',
      startTime: Date.now(),
      changes: [],
      conflicts: []
    };

    this.pendingOperations.set(operationId, operation);
    this.emit('sync-started', operation);

    try {
      operation.status = 'running';
      
      switch (type) {
        case 'pull':
          await this.performPull(operation);
          break;
        case 'push':
          await this.performPush(operation);
          break;
        case 'merge':
          await this.performMerge(operation);
          break;
      }

      operation.status = 'completed';
      operation.endTime = Date.now();
      this.lastSyncTime = operation.endTime;

      this.logger.info('Sync operation completed', {
        operationId,
        type,
        duration: operation.endTime - operation.startTime,
        changes: operation.changes.length,
        conflicts: operation.conflicts.length
      });

      this.emit('sync-completed', operation);

    } catch (error) {
      operation.status = 'failed';
      operation.endTime = Date.now();
      operation.error = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Sync operation failed', {
        operationId,
        type,
        error: operation.error
      });

      this.emit('sync-failed', operation);
      throw error;

    } finally {
      this.pendingOperations.delete(operationId);
      this.addToHistory(operation);
    }

    return operation;
  }

  async detectChanges(): Promise<SyncChange[]> {
    const changes: SyncChange[] = [];

    try {
      for (const configPath of this.config.configPaths) {
        const pathChanges = await this.detectPathChanges(configPath);
        changes.push(...pathChanges);
      }

      this.logger.debug('Change detection completed', {
        totalChanges: changes.length,
        creates: changes.filter(c => c.type === 'create').length,
        updates: changes.filter(c => c.type === 'update').length,
        deletes: changes.filter(c => c.type === 'delete').length
      });

    } catch (error) {
      this.logger.error('Error detecting changes', { error });
      throw error;
    }

    return changes;
  }

  async resolveConflict(
    conflictPath: string, 
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> {
    this.logger.info('Resolving conflict', { path: conflictPath, resolution });

    try {
      // Find the conflict in pending operations
      let conflict: SyncConflict | undefined;
      let operation: SyncOperation | undefined;

      for (const [_, op] of this.pendingOperations) {
        conflict = op.conflicts.find(c => c.path === conflictPath);
        if (conflict) {
          operation = op;
          break;
        }
      }

      if (!conflict || !operation) {
        throw new Error(`Conflict not found for path: ${conflictPath}`);
      }

      switch (resolution) {
        case 'local':
          await this.applyLocalChanges(conflict);
          break;
        case 'remote':
          await this.applyRemoteChanges(conflict);
          break;
        case 'merge':
          await this.performMergeResolution(conflict);
          break;
      }

      conflict.resolution = resolution;
      this.emit('conflict-resolved', { conflict, resolution });

    } catch (error) {
      this.logger.error('Failed to resolve conflict', { 
        path: conflictPath, 
        resolution, 
        error 
      });
      throw error;
    }
  }

  async getStatus(): Promise<SyncStatus> {
    const pendingChanges = await this.detectChanges();
    const unresolvedConflicts = this.getUnresolvedConflicts();

    return {
      isRunning: this.isRunning,
      autoSyncEnabled: this.config.autoSync,
      lastSyncTime: this.lastSyncTime,
      nextSyncTime: this.lastSyncTime + this.config.syncInterval,
      pendingChanges: pendingChanges.length,
      unresolvedConflicts: unresolvedConflicts.length,
      syncHistory: this.syncHistory.slice(-10) // Last 10 operations
    };
  }

  isAutoSyncEnabled(): boolean {
    return this.config.autoSync;
  }

  async enableAutoSync(): Promise<void> {
    if (this.config.autoSync) {
      return;
    }

    this.config.autoSync = true;
    this.logger.info('Auto-sync enabled');
    
    if (this.isRunning) {
      this.scheduleNextSync();
    }
  }

  async disableAutoSync(): Promise<void> {
    if (!this.config.autoSync) {
      return;
    }

    this.config.autoSync = false;
    this.logger.info('Auto-sync disabled');
    
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  private async loadConfigurationStates(): Promise<void> {
    this.logger.info('Loading configuration states');

    try {
      for (const configPath of this.config.configPaths) {
        await this.loadPathState(configPath);
      }

      this.logger.info('Configuration states loaded', {
        loadedPaths: this.configStates.size
      });

    } catch (error) {
      this.logger.error('Failed to load configuration states', { error });
      throw error;
    }
  }

  private async loadPathState(configPath: string): Promise<void> {
    try {
      const exists = await this.pathExists(configPath);
      if (!exists) {
        this.logger.debug('Configuration path does not exist', { path: configPath });
        return;
      }

      const files = await this.getFilesRecursively(configPath);
      
      for (const file of files) {
        const content = await this.readConfigFile(file);
        const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
        
        this.configStates.set(file, {
          content,
          hash,
          lastModified: (await fs.stat(file)).mtime.getTime()
        });
      }

    } catch (error) {
      this.logger.warn('Failed to load path state', { path: configPath, error });
    }
  }

  private async detectPathChanges(configPath: string): Promise<SyncChange[]> {
    const changes: SyncChange[] = [];

    try {
      const exists = await this.pathExists(configPath);
      if (!exists) {
        return changes;
      }

      const files = await this.getFilesRecursively(configPath);
      
      for (const file of files) {
        const change = await this.detectFileChange(file);
        if (change) {
          changes.push(change);
        }
      }

      // Check for deleted files
      for (const [filePath] of this.configStates) {
        if (filePath.startsWith(configPath)) {
          const exists = await this.pathExists(filePath);
          if (!exists) {
            changes.push({
              path: filePath,
              type: 'delete',
              before: this.configStates.get(filePath)?.content,
              timestamp: Date.now()
            });
          }
        }
      }

    } catch (error) {
      this.logger.error('Error detecting path changes', { path: configPath, error });
    }

    return changes;
  }

  private async detectFileChange(filePath: string): Promise<SyncChange | null> {
    try {
      const currentContent = await this.readConfigFile(filePath);
      const currentHash = createHash('sha256').update(JSON.stringify(currentContent)).digest('hex');
      
      const previousState = this.configStates.get(filePath);
      
      if (!previousState) {
        // New file
        return {
          path: filePath,
          type: 'create',
          after: currentContent,
          timestamp: Date.now()
        };
      }
      
      if (currentHash !== previousState.hash) {
        // Modified file
        return {
          path: filePath,
          type: 'update',
          before: previousState.content,
          after: currentContent,
          timestamp: Date.now()
        };
      }

    } catch (error) {
      this.logger.error('Error detecting file change', { path: filePath, error });
    }

    return null;
  }

  private async performPull(operation: SyncOperation): Promise<void> {
    this.logger.info('Performing pull operation', { operationId: operation.id });

    // This would fetch remote configuration and compare with local
    // For now, we'll simulate by detecting local changes
    const changes = await this.detectChanges();
    operation.changes = changes;

    // Apply changes
    for (const change of changes) {
      await this.applyChange(change);
    }
  }

  private async performPush(operation: SyncOperation): Promise<void> {
    this.logger.info('Performing push operation', { operationId: operation.id });

    // This would push local changes to remote
    const changes = await this.detectChanges();
    operation.changes = changes;

    // Simulate pushing to remote
    for (const change of changes) {
      this.logger.debug('Pushing change', { 
        path: change.path, 
        type: change.type 
      });
    }
  }

  private async performMerge(operation: SyncOperation): Promise<void> {
    this.logger.info('Performing merge operation', { operationId: operation.id });

    // This would merge local and remote changes
    const changes = await this.detectChanges();
    operation.changes = changes;

    // Detect conflicts
    for (const change of changes) {
      const conflict = await this.detectConflict(change);
      if (conflict) {
        operation.conflicts.push(conflict);
      }
    }

    // Apply non-conflicting changes
    const nonConflictingChanges = changes.filter(change => 
      !operation.conflicts.some(conflict => conflict.path === change.path)
    );

    for (const change of nonConflictingChanges) {
      await this.applyChange(change);
    }
  }

  private async detectConflict(change: SyncChange): Promise<SyncConflict | null> {
    // This would check if there are conflicting remote changes
    // For now, we'll simulate conflicts for certain files
    if (change.path.includes('docker-compose') && change.type === 'update') {
      return {
        path: change.path,
        local: change.after,
        remote: { ...change.after, version: '2.0' }, // Simulated remote change
        timestamp: Date.now()
      };
    }

    return null;
  }

  private async applyChange(change: SyncChange): Promise<void> {
    this.logger.debug('Applying change', { 
      path: change.path, 
      type: change.type 
    });

    try {
      switch (change.type) {
        case 'create':
        case 'update':
          if (change.after) {
            await this.writeConfigFile(change.path, change.after);
            this.updateConfigState(change.path, change.after);
          }
          break;
        case 'delete':
          await this.deleteConfigFile(change.path);
          this.configStates.delete(change.path);
          break;
      }

    } catch (error) {
      this.logger.error('Failed to apply change', { 
        path: change.path, 
        type: change.type, 
        error 
      });
      throw error;
    }
  }

  private async applyLocalChanges(conflict: SyncConflict): Promise<void> {
    // Keep local version - no action needed
    this.logger.debug('Applying local changes for conflict', { path: conflict.path });
  }

  private async applyRemoteChanges(conflict: SyncConflict): Promise<void> {
    // Apply remote version
    await this.writeConfigFile(conflict.path, conflict.remote);
    this.updateConfigState(conflict.path, conflict.remote);
  }

  private async performMergeResolution(conflict: SyncConflict): Promise<void> {
    // Perform intelligent merge
    const merged = this.mergeConfigurations(conflict.local, conflict.remote);
    await this.writeConfigFile(conflict.path, merged);
    this.updateConfigState(conflict.path, merged);
  }

  private mergeConfigurations(local: any, remote: any): any {
    // Simple merge strategy - in production, this would be more sophisticated
    if (typeof local === 'object' && typeof remote === 'object') {
      return { ...local, ...remote };
    }
    
    // Default to remote if can't merge
    return remote;
  }

  private async readConfigFile(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        return JSON.parse(content);
      } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        return yaml.parse(content);
      } else {
        return content;
      }

    } catch (error) {
      throw new Error(`Failed to read config file ${filePath}: ${error}`);
    }
  }

  private async writeConfigFile(filePath: string, content: any): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      let serialized: string;
      
      if (filePath.endsWith('.json')) {
        serialized = JSON.stringify(content, null, 2);
      } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        serialized = yaml.stringify(content);
      } else {
        serialized = typeof content === 'string' ? content : JSON.stringify(content);
      }
      
      await fs.writeFile(filePath, serialized, 'utf8');

    } catch (error) {
      throw new Error(`Failed to write config file ${filePath}: ${error}`);
    }
  }

  private async deleteConfigFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete config file ${filePath}: ${error}`);
    }
  }

  private updateConfigState(filePath: string, content: any): void {
    const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    this.configStates.set(filePath, {
      content,
      hash,
      lastModified: Date.now()
    });
  }

  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getFilesRecursively(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
    }
    
    return files;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getUnresolvedConflicts(): SyncConflict[] {
    const conflicts: SyncConflict[] = [];
    
    for (const [_, operation] of this.pendingOperations) {
      conflicts.push(...operation.conflicts.filter(c => !c.resolution));
    }
    
    return conflicts;
  }

  private generateOperationId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addToHistory(operation: SyncOperation): void {
    this.syncHistory.push(operation);
    
    // Keep only last 100 operations
    if (this.syncHistory.length > 100) {
      this.syncHistory = this.syncHistory.slice(-100);
    }
  }

  private async waitForPendingOperations(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.pendingOperations.size > 0 && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.pendingOperations.size > 0) {
      this.logger.warn('Some operations did not complete before shutdown', {
        pendingCount: this.pendingOperations.size
      });
    }
  }

  private scheduleNextSync(): void {
    if (!this.isRunning || !this.config.autoSync) {
      return;
    }
    
    this.syncTimer = setTimeout(async () => {
      try {
        await this.triggerSync('pull');
      } catch (error) {
        this.logger.error('Scheduled sync failed', { error });
      }
      
      this.scheduleNextSync();
    }, this.config.syncInterval);
  }
}