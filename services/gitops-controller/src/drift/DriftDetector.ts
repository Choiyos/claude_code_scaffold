import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as diff from 'diff';
import chokidar from 'chokidar';
import { Logger } from '../utils/Logger';

export interface DriftDetectorConfig {
  checkInterval: number;
  thresholds: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  watchPaths?: string[];
  excludePatterns?: string[];
}

export interface DriftEvent {
  id: string;
  type: 'configuration' | 'file' | 'environment' | 'service';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  path: string;
  current: any;
  expected: any;
  diff: string;
  timestamp: number;
  remediation?: {
    automatic: boolean;
    action: string;
    script?: string;
  };
}

export interface DriftStatus {
  totalDrifts: number;
  criticalDrifts: number;
  highDrifts: number;
  mediumDrifts: number;
  lowDrifts: number;
  lastCheckTime: number;
  nextCheckTime: number;
  isRunning: boolean;
}

export class DriftDetector extends EventEmitter {
  private config: DriftDetectorConfig;
  private logger: Logger;
  private isRunning: boolean = false;
  private checkTimer?: NodeJS.Timeout;
  private fileWatcher?: chokidar.FSWatcher;
  private detectedDrifts: Map<string, DriftEvent> = new Map();
  private baselineHashes: Map<string, string> = new Map();
  private lastCheckTime: number = 0;

  constructor(config: DriftDetectorConfig) {
    super();
    this.config = config;
    this.logger = new Logger('DriftDetector');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Drift detector is already running');
      return;
    }

    this.logger.info('Starting drift detector', {
      interval: this.config.checkInterval,
      watchPaths: this.config.watchPaths
    });

    this.isRunning = true;
    
    // Initialize baseline
    await this.createBaseline();
    
    // Start file watching if paths are configured
    if (this.config.watchPaths && this.config.watchPaths.length > 0) {
      this.startFileWatcher();
    }
    
    // Schedule periodic checks
    this.scheduleNextCheck();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping drift detector');
    
    this.isRunning = false;
    
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = undefined;
    }
    
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
    
    this.detectedDrifts.clear();
    this.baselineHashes.clear();
  }

  async performCheck(): Promise<DriftEvent[]> {
    this.logger.info('Performing drift detection check');
    this.lastCheckTime = Date.now();
    
    const drifts: DriftEvent[] = [];
    
    try {
      // Check configuration drift
      const configDrifts = await this.checkConfigurationDrift();
      drifts.push(...configDrifts);
      
      // Check file system drift
      const fileDrifts = await this.checkFileSystemDrift();
      drifts.push(...fileDrifts);
      
      // Check environment drift
      const envDrifts = await this.checkEnvironmentDrift();
      drifts.push(...envDrifts);
      
      // Check service drift
      const serviceDrifts = await this.checkServiceDrift();
      drifts.push(...serviceDrifts);
      
      // Process detected drifts
      for (const drift of drifts) {
        this.processDrift(drift);
      }
      
      this.logger.info('Drift detection check completed', {
        totalDrifts: drifts.length,
        critical: drifts.filter(d => d.severity === 'critical').length,
        high: drifts.filter(d => d.severity === 'high').length,
        medium: drifts.filter(d => d.severity === 'medium').length,
        low: drifts.filter(d => d.severity === 'low').length
      });
      
      return drifts;
      
    } catch (error) {
      this.logger.error('Error during drift detection', { error });
      throw error;
    }
  }

  async getCurrentStatus(): Promise<DriftStatus> {
    const drifts = Array.from(this.detectedDrifts.values());
    
    return {
      totalDrifts: drifts.length,
      criticalDrifts: drifts.filter(d => d.severity === 'critical').length,
      highDrifts: drifts.filter(d => d.severity === 'high').length,
      mediumDrifts: drifts.filter(d => d.severity === 'medium').length,
      lowDrifts: drifts.filter(d => d.severity === 'low').length,
      lastCheckTime: this.lastCheckTime,
      nextCheckTime: this.lastCheckTime + this.config.checkInterval,
      isRunning: this.isRunning
    };
  }

  async getDrifts(severity?: string): Promise<DriftEvent[]> {
    const drifts = Array.from(this.detectedDrifts.values());
    
    if (severity) {
      return drifts.filter(d => d.severity === severity);
    }
    
    return drifts;
  }

  async resolveDrift(driftId: string): Promise<void> {
    const drift = this.detectedDrifts.get(driftId);
    
    if (!drift) {
      throw new Error(`Drift ${driftId} not found`);
    }

    this.logger.info('Resolving drift', { driftId, type: drift.type });
    
    try {
      if (drift.remediation?.automatic && drift.remediation.script) {
        // Execute automatic remediation
        await this.executeRemediation(drift);
      }
      
      // Remove from detected drifts
      this.detectedDrifts.delete(driftId);
      
      this.emit('drift-resolved', drift);
      
    } catch (error) {
      this.logger.error('Failed to resolve drift', { driftId, error });
      throw error;
    }
  }

  private async createBaseline(): Promise<void> {
    this.logger.info('Creating drift detection baseline');
    
    try {
      // Create baseline for configuration files
      await this.createConfigurationBaseline();
      
      // Create baseline for monitored files
      if (this.config.watchPaths) {
        await this.createFileBaseline();
      }
      
      this.logger.info('Baseline created successfully', {
        configFiles: this.baselineHashes.size
      });
      
    } catch (error) {
      this.logger.error('Failed to create baseline', { error });
      throw error;
    }
  }

  private async createConfigurationBaseline(): Promise<void> {
    const configPaths = [
      '/workspace/config',
      '/workspace/.claude',
      '/workspace/.devcontainer'
    ];
    
    for (const configPath of configPaths) {
      try {
        await this.hashDirectory(configPath);
      } catch (error) {
        // Directory might not exist, skip
        this.logger.debug('Skipping non-existent directory', { path: configPath });
      }
    }
  }

  private async createFileBaseline(): Promise<void> {
    if (!this.config.watchPaths) return;
    
    for (const watchPath of this.config.watchPaths) {
      try {
        await this.hashDirectory(watchPath);
      } catch (error) {
        this.logger.warn('Failed to create baseline for path', { path: watchPath, error });
      }
    }
  }

  private async hashDirectory(dirPath: string): Promise<void> {
    try {
      const files = await this.getFilesRecursively(dirPath);
      
      for (const file of files) {
        if (this.shouldExcludeFile(file)) {
          continue;
        }
        
        const content = await fs.readFile(file, 'utf8');
        const hash = createHash('sha256').update(content).digest('hex');
        this.baselineHashes.set(file, hash);
      }
    } catch (error) {
      // Directory might not exist
      this.logger.debug('Directory not found for hashing', { dirPath });
    }
  }

  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`;
        
        if (entry.isDirectory()) {
          const subFiles = await this.getFilesRecursively(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Handle permission errors or non-existent directories
    }
    
    return files;
  }

  private shouldExcludeFile(filePath: string): boolean {
    if (!this.config.excludePatterns) {
      return false;
    }
    
    return this.config.excludePatterns.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(filePath);
    });
  }

  private async checkConfigurationDrift(): Promise<DriftEvent[]> {
    const drifts: DriftEvent[] = [];
    
    try {
      // Check main configuration files
      const configFiles = [
        '/workspace/config/environments.yml',
        '/workspace/config/mcp-servers.yml',
        '/workspace/.devcontainer/devcontainer.json',
        '/workspace/.claude/config.json'
      ];
      
      for (const configFile of configFiles) {
        const drift = await this.checkFileDrift(configFile, 'configuration');
        if (drift) {
          drifts.push(drift);
        }
      }
      
    } catch (error) {
      this.logger.error('Error checking configuration drift', { error });
    }
    
    return drifts;
  }

  private async checkFileSystemDrift(): Promise<DriftEvent[]> {
    const drifts: DriftEvent[] = [];
    
    if (!this.config.watchPaths) {
      return drifts;
    }
    
    try {
      for (const watchPath of this.config.watchPaths) {
        const files = await this.getFilesRecursively(watchPath);
        
        for (const file of files) {
          if (this.shouldExcludeFile(file)) {
            continue;
          }
          
          const drift = await this.checkFileDrift(file, 'file');
          if (drift) {
            drifts.push(drift);
          }
        }
      }
      
    } catch (error) {
      this.logger.error('Error checking file system drift', { error });
    }
    
    return drifts;
  }

  private async checkFileDrift(filePath: string, type: string): Promise<DriftEvent | null> {
    try {
      const currentContent = await fs.readFile(filePath, 'utf8');
      const currentHash = createHash('sha256').update(currentContent).digest('hex');
      const baselineHash = this.baselineHashes.get(filePath);
      
      if (!baselineHash) {
        // New file detected
        return {
          id: `${type}-${createHash('md5').update(filePath).digest('hex')}`,
          type: type as any,
          severity: 'medium',
          description: `New file detected: ${filePath}`,
          path: filePath,
          current: currentContent,
          expected: null,
          diff: `+++ ${filePath}\n${currentContent}`,
          timestamp: Date.now(),
          remediation: {
            automatic: false,
            action: 'review-new-file'
          }
        };
      }
      
      if (currentHash !== baselineHash) {
        // File has been modified
        const expectedContent = ''; // Would load from baseline in real implementation
        const diffResult = diff.createPatch(filePath, expectedContent, currentContent);
        
        return {
          id: `${type}-${createHash('md5').update(filePath).digest('hex')}`,
          type: type as any,
          severity: this.calculateSeverity(filePath, diffResult),
          description: `File modified: ${filePath}`,
          path: filePath,
          current: currentContent,
          expected: expectedContent,
          diff: diffResult,
          timestamp: Date.now(),
          remediation: {
            automatic: this.canAutoRemediate(filePath),
            action: 'restore-from-git'
          }
        };
      }
      
    } catch (error) {
      // File might have been deleted
      if (this.baselineHashes.has(filePath)) {
        return {
          id: `${type}-${createHash('md5').update(filePath).digest('hex')}`,
          type: type as any,
          severity: 'high',
          description: `File deleted: ${filePath}`,
          path: filePath,
          current: null,
          expected: 'file-exists',
          diff: `--- ${filePath}\n(file deleted)`,
          timestamp: Date.now(),
          remediation: {
            automatic: this.canAutoRemediate(filePath),
            action: 'restore-from-git'
          }
        };
      }
    }
    
    return null;
  }

  private async checkEnvironmentDrift(): Promise<DriftEvent[]> {
    const drifts: DriftEvent[] = [];
    
    // Check environment variables drift
    // This would compare current environment with expected environment
    
    return drifts;
  }

  private async checkServiceDrift(): Promise<DriftEvent[]> {
    const drifts: DriftEvent[] = [];
    
    // Check running services vs expected services
    // This would check Docker containers, processes, etc.
    
    return drifts;
  }

  private calculateSeverity(filePath: string, diffContent: string): 'critical' | 'high' | 'medium' | 'low' {
    // Critical files
    if (filePath.includes('docker-compose') || 
        filePath.includes('devcontainer.json') ||
        filePath.includes('package.json')) {
      return 'critical';
    }
    
    // Configuration files
    if (filePath.includes('config/') || filePath.includes('.env')) {
      return 'high';
    }
    
    // Calculate change percentage
    const lines = diffContent.split('\n');
    const addedLines = lines.filter(l => l.startsWith('+')).length;
    const removedLines = lines.filter(l => l.startsWith('-')).length;
    const totalChanges = addedLines + removedLines;
    
    if (totalChanges > 50) return 'high';
    if (totalChanges > 20) return 'medium';
    return 'low';
  }

  private canAutoRemediate(filePath: string): boolean {
    // Don't auto-remediate critical files
    if (filePath.includes('docker-compose') || 
        filePath.includes('package.json')) {
      return false;
    }
    
    // Can auto-remediate configuration files
    return filePath.includes('config/') || filePath.includes('.claude/');
  }

  private processDrift(drift: DriftEvent): void {
    this.detectedDrifts.set(drift.id, drift);
    
    this.logger.warn('Drift detected', {
      id: drift.id,
      type: drift.type,
      severity: drift.severity,
      path: drift.path
    });
    
    this.emit('drift-detected', drift);
    
    // Auto-remediate if possible
    if (drift.remediation?.automatic) {
      this.scheduleAutoRemediation(drift);
    }
  }

  private scheduleAutoRemediation(drift: DriftEvent): void {
    // Schedule automatic remediation after a short delay
    setTimeout(async () => {
      try {
        await this.executeRemediation(drift);
        this.logger.info('Automatic remediation completed', { driftId: drift.id });
      } catch (error) {
        this.logger.error('Automatic remediation failed', { 
          driftId: drift.id, 
          error 
        });
      }
    }, 5000); // 5 second delay
  }

  private async executeRemediation(drift: DriftEvent): Promise<void> {
    switch (drift.remediation?.action) {
      case 'restore-from-git':
        await this.restoreFromGit(drift.path);
        break;
      default:
        throw new Error(`Unknown remediation action: ${drift.remediation?.action}`);
    }
  }

  private async restoreFromGit(filePath: string): Promise<void> {
    // This would restore the file from git
    this.logger.info('Restoring file from git', { filePath });
    // Implementation would use git commands to restore the file
  }

  private startFileWatcher(): void {
    if (!this.config.watchPaths) return;
    
    this.fileWatcher = chokidar.watch(this.config.watchPaths, {
      ignored: this.config.excludePatterns,
      persistent: true,
      ignoreInitial: true
    });
    
    this.fileWatcher.on('change', (path) => {
      this.logger.debug('File changed detected', { path });
      this.handleFileChange(path);
    });
    
    this.fileWatcher.on('add', (path) => {
      this.logger.debug('File added detected', { path });
      this.handleFileChange(path);
    });
    
    this.fileWatcher.on('unlink', (path) => {
      this.logger.debug('File deleted detected', { path });
      this.handleFileChange(path);
    });
  }

  private async handleFileChange(filePath: string): Promise<void> {
    try {
      const drift = await this.checkFileDrift(filePath, 'file');
      if (drift) {
        this.processDrift(drift);
      }
    } catch (error) {
      this.logger.error('Error handling file change', { filePath, error });
    }
  }

  private scheduleNextCheck(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.checkTimer = setTimeout(async () => {
      try {
        await this.performCheck();
      } catch (error) {
        this.logger.error('Scheduled drift check failed', { error });
      }
      
      this.scheduleNextCheck();
    }, this.config.checkInterval);
  }
}