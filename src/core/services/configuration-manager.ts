/**
 * Configuration Manager Implementation
 * Manages hierarchical configuration layers with intelligent merging
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  IConfigurationManager,
  ConfigLayer,
  ConfigSource,
  LayerConfig,
  MergedConfig,
  ConfigQuery,
  Configuration,
  ValidationResult,
  ConfigConflict,
  Resolution,
  ConflictStrategy,
  ConfigMetadata,
  LayerPermissions
} from '../../interfaces/IConfigurationManager';
import { GitClient } from '../infrastructure/git-client';
import { SecretManager } from '../security/secret-manager';
import { CacheManager } from '../performance/cache-manager';
import { Logger } from '../utils/logger';
import { deepMerge, deepDiff } from '../utils/object-utils';

export class ConfigurationManager extends EventEmitter implements IConfigurationManager {
  private layers: Map<ConfigLayer, LayerConfig> = new Map();
  private gitClient: GitClient;
  private secretManager: SecretManager;
  private cache: CacheManager;
  private logger: Logger;
  private configPath: string;

  constructor(configPath: string = './config') {
    super();
    this.configPath = configPath;
    this.gitClient = new GitClient();
    this.secretManager = new SecretManager();
    this.cache = new CacheManager();
    this.logger = new Logger('ConfigurationManager');
  }

  async loadLayer(layer: ConfigLayer, source: ConfigSource): Promise<LayerConfig> {
    const cacheKey = `config:${layer}:${JSON.stringify(source)}`;
    
    // Check cache first
    const cached = await this.cache.get<LayerConfig>(cacheKey);
    if (cached) {
      this.logger.debug(`Loaded ${layer} configuration from cache`);
      return cached;
    }

    this.logger.info(`Loading ${layer} configuration from ${source.type}`);

    try {
      let data: any;
      
      switch (source.type) {
        case 'git':
          data = await this.loadFromGit(source);
          break;
        case 'file':
          data = await this.loadFromFile(source);
          break;
        case 'http':
          data = await this.loadFromHttp(source);
          break;
        case 'environment':
          data = await this.loadFromEnvironment(source);
          break;
        default:
          throw new Error(`Unknown source type: ${source.type}`);
      }

      // Create layer configuration
      const layerConfig: LayerConfig = {
        layer,
        priority: this.getLayerPriority(layer),
        source,
        data,
        metadata: {
          version: data.version || '1.0.0',
          lastModified: new Date(),
          checksum: this.calculateChecksum(data),
          author: data.author || 'system'
        },
        permissions: this.getDefaultPermissions(layer)
      };

      // Cache the configuration
      await this.cache.set(cacheKey, layerConfig, 300000); // 5 minutes
      
      // Store in memory
      this.layers.set(layer, layerConfig);
      
      this.emit('layer:loaded', { layer, source });
      return layerConfig;

    } catch (error) {
      this.logger.error(`Failed to load ${layer} configuration`, error);
      throw error;
    }
  }

  async mergeConfigurations(layers: LayerConfig[]): Promise<MergedConfig> {
    this.logger.info('Merging configurations', { 
      layers: layers.map(l => ({ layer: l.layer, priority: l.priority })) 
    });

    // Sort by priority (lower number = higher priority)
    const sortedLayers = layers.sort((a, b) => a.priority - b.priority);

    let merged = {};
    const conflicts: ConfigConflict[] = [];
    const sources: ConfigSource[] = [];

    for (const layer of sortedLayers) {
      const { mergedData, layerConflicts } = await this.mergeLayer(merged, layer);
      merged = mergedData;
      conflicts.push(...layerConflicts);
      sources.push(layer.source);
    }

    // Resolve conflicts
    if (conflicts.length > 0) {
      const resolutions = await this.resolveConflicts(conflicts);
      merged = this.applyResolutions(merged, resolutions);
    }

    // Inject secrets
    merged = await this.secretManager.injectSecrets(merged);

    const result: MergedConfig = {
      config: merged,
      sources,
      conflicts: conflicts.length,
      timestamp: new Date(),
      checksum: this.calculateChecksum(merged)
    };

    this.emit('configuration:merged', result);
    return result;
  }

  async getConfiguration(query: ConfigQuery): Promise<Configuration> {
    const layers: LayerConfig[] = [];

    // Always include base layer
    const baseLayer = await this.loadLayer(ConfigLayer.BASE, {
      type: 'git',
      path: 'base/',
      repository: this.gitClient.getDefaultRepo()
    });
    layers.push(baseLayer);

    // Include team layer if specified
    if (query.team) {
      const teamLayer = await this.loadLayer(ConfigLayer.TEAM, {
        type: 'git',
        path: `teams/${query.team}/`,
        repository: this.gitClient.getDefaultRepo()
      });
      layers.push(teamLayer);
    }

    // Include project layer if specified
    if (query.project) {
      const projectLayer = await this.loadLayer(ConfigLayer.PROJECT, {
        type: 'git',
        path: `projects/${query.project}/`,
        repository: this.gitClient.getDefaultRepo()
      });
      layers.push(projectLayer);
    }

    // Include user layer if not explicitly excluded
    if (query.includeInherited !== false) {
      try {
        const userLayer = await this.loadLayer(ConfigLayer.USER, {
          type: 'file',
          path: path.join(process.env.HOME || '', '.claude', 'user-config.json')
        });
        layers.push(userLayer);
      } catch (error) {
        // User layer is optional
        this.logger.debug('No user configuration found', error);
      }
    }

    // Merge all layers
    const merged = await this.mergeConfigurations(layers);

    // Build final configuration
    const configuration: Configuration = {
      version: merged.config.version || '1.0.0',
      metadata: {
        created: new Date(),
        modified: new Date(),
        author: 'system',
        checksum: merged.checksum,
        tags: query.environment ? [query.environment] : []
      },
      layers: {
        base: baseLayer.data,
        team: layers.find(l => l.layer === ConfigLayer.TEAM)?.data,
        project: layers.find(l => l.layer === ConfigLayer.PROJECT)?.data,
        user: layers.find(l => l.layer === ConfigLayer.USER)?.data
      },
      computed: merged.config
    };

    return configuration;
  }

  async updateConfiguration(
    layer: ConfigLayer, 
    path: string, 
    value: any
  ): Promise<void> {
    const layerConfig = this.layers.get(layer);
    if (!layerConfig) {
      throw new Error(`Layer ${layer} not loaded`);
    }

    // Check permissions
    if (!this.hasWritePermission(layer)) {
      throw new Error(`No write permission for layer ${layer}`);
    }

    this.logger.info(`Updating ${layer} configuration at ${path}`, { value });

    try {
      // Update the configuration
      const updated = this.setValueAtPath(layerConfig.data, path, value);
      layerConfig.data = updated;
      layerConfig.metadata.lastModified = new Date();
      layerConfig.metadata.checksum = this.calculateChecksum(updated);

      // Persist changes
      await this.persistLayer(layer, layerConfig);

      // Clear cache
      await this.cache.delete(`config:${layer}:*`);

      this.emit('configuration:updated', { layer, path, value });

    } catch (error) {
      this.logger.error(`Failed to update configuration`, error);
      throw error;
    }
  }

  async deleteConfiguration(layer: ConfigLayer, path: string): Promise<void> {
    const layerConfig = this.layers.get(layer);
    if (!layerConfig) {
      throw new Error(`Layer ${layer} not loaded`);
    }

    // Check permissions
    if (!this.hasWritePermission(layer)) {
      throw new Error(`No write permission for layer ${layer}`);
    }

    this.logger.info(`Deleting ${layer} configuration at ${path}`);

    try {
      // Delete the configuration
      const updated = this.deleteValueAtPath(layerConfig.data, path);
      layerConfig.data = updated;
      layerConfig.metadata.lastModified = new Date();
      layerConfig.metadata.checksum = this.calculateChecksum(updated);

      // Persist changes
      await this.persistLayer(layer, layerConfig);

      // Clear cache
      await this.cache.delete(`config:${layer}:*`);

      this.emit('configuration:deleted', { layer, path });

    } catch (error) {
      this.logger.error(`Failed to delete configuration`, error);
      throw error;
    }
  }

  async validateConfiguration(config: Configuration): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate version
    if (!config.version || !this.isValidVersion(config.version)) {
      errors.push('Invalid or missing version');
    }

    // Validate metadata
    if (!config.metadata || !config.metadata.checksum) {
      errors.push('Invalid or missing metadata');
    }

    // Validate MCP servers
    if (config.computed?.mcp?.servers) {
      for (const server of config.computed.mcp.servers) {
        if (!server.name || !server.type) {
          errors.push(`Invalid MCP server configuration: ${JSON.stringify(server)}`);
        }
      }
    }

    // Validate Node.js version
    if (config.computed?.environment?.nodeVersion) {
      const nodeVersion = config.computed.environment.nodeVersion;
      if (!this.isValidNodeVersion(nodeVersion)) {
        errors.push(`Invalid Node.js version: ${nodeVersion}`);
      }
    }

    // Validate security settings
    if (config.computed?.security) {
      if (!config.computed.security.secretsProvider) {
        errors.push('Security secrets provider not configured');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async resolveConflicts(conflicts: ConfigConflict[]): Promise<Resolution[]> {
    const resolutions: Resolution[] = [];

    for (const conflict of conflicts) {
      const resolution = await this.resolveConflict(conflict);
      resolutions.push(resolution);
    }

    return resolutions;
  }

  async exportConfiguration(format: 'json' | 'yaml'): Promise<string> {
    const config = await this.getConfiguration({
      includeInherited: true,
      resolveSecrets: false
    });

    switch (format) {
      case 'json':
        return JSON.stringify(config, null, 2);
      case 'yaml':
        // Use a YAML library in production
        return this.convertToYaml(config);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  async importConfiguration(data: string, format: 'json' | 'yaml'): Promise<void> {
    let config: any;

    switch (format) {
      case 'json':
        config = JSON.parse(data);
        break;
      case 'yaml':
        // Use a YAML library in production
        config = this.parseYaml(data);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Validate imported configuration
    const validation = await this.validateConfiguration(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Import each layer
    if (config.layers.base) {
      await this.importLayer(ConfigLayer.BASE, config.layers.base);
    }
    if (config.layers.team) {
      await this.importLayer(ConfigLayer.TEAM, config.layers.team);
    }
    if (config.layers.project) {
      await this.importLayer(ConfigLayer.PROJECT, config.layers.project);
    }

    this.emit('configuration:imported', { format });
  }

  async analyzeDrift(query: { team?: string; project?: string }): Promise<any> {
    const currentConfig = await this.getConfiguration(query);
    const remoteConfig = await this.fetchRemoteConfiguration(query);

    const differences = deepDiff(currentConfig.computed, remoteConfig.computed);
    const driftPercentage = this.calculateDriftPercentage(differences);

    return {
      percentage: driftPercentage,
      differences,
      severity: this.calculateDriftSeverity(driftPercentage),
      canAutoRemediate: driftPercentage < 10,
      recommendations: this.generateDriftRecommendations(differences)
    };
  }

  // Private helper methods

  private getLayerPriority(layer: ConfigLayer): number {
    const priorities = {
      [ConfigLayer.BASE]: 1,
      [ConfigLayer.TEAM]: 2,
      [ConfigLayer.PROJECT]: 3,
      [ConfigLayer.USER]: 4
    };
    return priorities[layer] || 99;
  }

  private getDefaultPermissions(layer: ConfigLayer): LayerPermissions {
    return {
      read: ['*'],
      write: layer === ConfigLayer.USER ? ['owner'] : ['admin'],
      delete: layer === ConfigLayer.USER ? ['owner'] : ['admin']
    };
  }

  private async loadFromGit(source: ConfigSource): Promise<any> {
    const content = await this.gitClient.fetchFile(
      source.repository || this.gitClient.getDefaultRepo(),
      source.path,
      source.branch || 'main'
    );
    return JSON.parse(content);
  }

  private async loadFromFile(source: ConfigSource): Promise<any> {
    const content = await fs.readFile(source.path, 'utf-8');
    return JSON.parse(content);
  }

  private async loadFromHttp(source: ConfigSource): Promise<any> {
    const response = await fetch(source.url!, {
      headers: source.headers || {}
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return response.json();
  }

  private async loadFromEnvironment(source: ConfigSource): Promise<any> {
    const config: any = {};
    const prefix = source.prefix || 'CLAUDE_';
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const configKey = key.substring(prefix.length).toLowerCase().replace(/_/g, '.');
        this.setValueAtPath(config, configKey, value);
      }
    }
    
    return config;
  }

  private async mergeLayer(
    base: any, 
    layer: LayerConfig
  ): Promise<{ mergedData: any; layerConflicts: ConfigConflict[] }> {
    const conflicts: ConfigConflict[] = [];
    
    const mergedData = deepMerge(base, layer.data, {
      arrayStrategy: 'union',
      conflictHandler: (path: string, value1: any, value2: any) => {
        conflicts.push({
          path,
          layer1: ConfigLayer.BASE, // Simplified for example
          value1,
          layer2: layer.layer,
          value2
        });
        return value2; // Higher priority wins by default
      }
    });

    return { mergedData, layerConflicts: conflicts };
  }

  private async resolveConflict(conflict: ConfigConflict): Promise<Resolution> {
    // Apply conflict resolution strategy
    const strategy = conflict.strategy || this.getDefaultStrategy(conflict);
    
    let resolvedValue: any;
    let reasoning: string;

    switch (strategy) {
      case 'higher-priority':
        resolvedValue = conflict.value2;
        reasoning = `Higher priority layer (${conflict.layer2}) wins`;
        break;
        
      case 'merge':
        if (typeof conflict.value1 === 'object' && typeof conflict.value2 === 'object') {
          resolvedValue = { ...conflict.value1, ...conflict.value2 };
          reasoning = 'Merged object values';
        } else {
          resolvedValue = conflict.value2;
          reasoning = 'Cannot merge non-objects, using higher priority';
        }
        break;
        
      case 'array-union':
        if (Array.isArray(conflict.value1) && Array.isArray(conflict.value2)) {
          resolvedValue = [...new Set([...conflict.value1, ...conflict.value2])];
          reasoning = 'Union of arrays';
        } else {
          resolvedValue = conflict.value2;
          reasoning = 'Not arrays, using higher priority';
        }
        break;
        
      default:
        resolvedValue = conflict.value2;
        reasoning = 'Default strategy: higher priority wins';
    }

    return {
      path: conflict.path,
      resolvedValue,
      strategy,
      reasoning
    };
  }

  private getDefaultStrategy(conflict: ConfigConflict): ConflictStrategy {
    // Intelligent strategy selection based on path and values
    if (conflict.path.includes('servers') && Array.isArray(conflict.value1)) {
      return 'array-union';
    }
    
    if (typeof conflict.value1 === 'object' && typeof conflict.value2 === 'object') {
      return 'merge';
    }
    
    return 'higher-priority';
  }

  private applyResolutions(config: any, resolutions: Resolution[]): any {
    let resolved = { ...config };
    
    for (const resolution of resolutions) {
      resolved = this.setValueAtPath(resolved, resolution.path, resolution.resolvedValue);
    }
    
    return resolved;
  }

  private setValueAtPath(obj: any, path: string, value: any): any {
    const parts = path.split('.');
    const result = { ...obj };
    let current = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = value;
    return result;
  }

  private deleteValueAtPath(obj: any, path: string): any {
    const parts = path.split('.');
    const result = { ...obj };
    let current = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        return result; // Path doesn't exist
      }
      current = current[parts[i]];
    }
    
    delete current[parts[parts.length - 1]];
    return result;
  }

  private calculateChecksum(data: any): string {
    // Simple checksum implementation - use crypto in production
    return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 16);
  }

  private async persistLayer(layer: ConfigLayer, config: LayerConfig): Promise<void> {
    switch (config.source.type) {
      case 'git':
        await this.gitClient.commitFile(
          config.source.repository || this.gitClient.getDefaultRepo(),
          config.source.path,
          JSON.stringify(config.data, null, 2),
          `Update ${layer} configuration`
        );
        break;
        
      case 'file':
        await fs.writeFile(
          config.source.path,
          JSON.stringify(config.data, null, 2)
        );
        break;
        
      default:
        throw new Error(`Cannot persist to source type: ${config.source.type}`);
    }
  }

  private hasWritePermission(layer: ConfigLayer): boolean {
    // Simplified permission check - implement proper RBAC in production
    return layer !== ConfigLayer.BASE || process.env.CLAUDE_ENV_ADMIN === 'true';
  }

  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
  }

  private isValidNodeVersion(version: string): boolean {
    const major = parseInt(version.split('.')[0]);
    return major >= 18 && major <= 22;
  }

  private async fetchRemoteConfiguration(query: any): Promise<any> {
    // Fetch from Git repository
    const remoteLayers: LayerConfig[] = [];
    
    // Fetch base
    remoteLayers.push(await this.loadLayer(ConfigLayer.BASE, {
      type: 'git',
      path: 'base/',
      repository: this.gitClient.getDefaultRepo(),
      branch: 'main'
    }));
    
    // Fetch team if specified
    if (query.team) {
      remoteLayers.push(await this.loadLayer(ConfigLayer.TEAM, {
        type: 'git',
        path: `teams/${query.team}/`,
        repository: this.gitClient.getDefaultRepo(),
        branch: 'main'
      }));
    }
    
    const merged = await this.mergeConfigurations(remoteLayers);
    return { computed: merged.config };
  }

  private calculateDriftPercentage(differences: any[]): number {
    // Simplified drift calculation
    return Math.min(differences.length * 5, 100);
  }

  private calculateDriftSeverity(percentage: number): string {
    if (percentage < 5) return 'low';
    if (percentage < 15) return 'medium';
    if (percentage < 30) return 'high';
    return 'critical';
  }

  private generateDriftRecommendations(differences: any[]): string[] {
    const recommendations: string[] = [];
    
    if (differences.length > 0) {
      recommendations.push('Synchronize with remote configuration');
    }
    
    if (differences.some(d => d.path.includes('security'))) {
      recommendations.push('Review security configuration changes');
    }
    
    if (differences.some(d => d.path.includes('mcp.servers'))) {
      recommendations.push('Verify MCP server configurations');
    }
    
    return recommendations;
  }

  private convertToYaml(obj: any): string {
    // Simplified YAML conversion - use a proper library in production
    return JSON.stringify(obj, null, 2)
      .replace(/^{/, '')
      .replace(/}$/, '')
      .replace(/"/g, '')
      .replace(/,$/gm, '');
  }

  private parseYaml(yaml: string): any {
    // Simplified YAML parsing - use a proper library in production
    throw new Error('YAML parsing not implemented');
  }

  private async importLayer(layer: ConfigLayer, data: any): Promise<void> {
    const source: ConfigSource = {
      type: 'file',
      path: path.join(this.configPath, `${layer}.json`)
    };
    
    const layerConfig: LayerConfig = {
      layer,
      priority: this.getLayerPriority(layer),
      source,
      data,
      metadata: {
        version: data.version || '1.0.0',
        lastModified: new Date(),
        checksum: this.calculateChecksum(data),
        author: 'import'
      },
      permissions: this.getDefaultPermissions(layer)
    };
    
    this.layers.set(layer, layerConfig);
    await this.persistLayer(layer, layerConfig);
  }
}