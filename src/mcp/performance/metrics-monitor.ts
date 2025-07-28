/**
 * Metrics Monitoring and Performance Analytics for MCP Servers
 * Real-time monitoring, alerting, and performance optimization
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';

export interface MetricData {
  name: string;
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  unit?: string;
  description?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne';
  threshold: number;
  duration: number; // seconds
  labels?: Record<string, string>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  enabled: boolean;
  notifications: {
    webhook?: string;
    email?: string[];
    slack?: string;
  };
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: AlertRule['severity'];
  message: string;
  labels: Record<string, string>;
  firedAt: Date;
  resolvedAt?: Date;
  status: 'firing' | 'resolved';
}

export interface PerformanceProfile {
  serverId: string;
  serverType: string;
  timeWindow: {
    start: Date;
    end: Date;
  };
  metrics: {
    throughput: {
      requestsPerSecond: number;
      averageResponseTime: number;
      percentiles: {
        p50: number;
        p95: number;
        p99: number;
      };
    };
    resources: {
      cpuUsage: number;
      memoryUsage: number;
      networkIO: { inbound: number; outbound: number };
    };
    errors: {
      errorRate: number;
      errorsByType: Record<string, number>;
      timeouts: number;
    };
    connections: {
      active: number;
      idle: number;
      total: number;
    };
  };
  recommendations: Array<{
    type: 'scaling' | 'configuration' | 'optimization';
    priority: 'low' | 'medium' | 'high';
    description: string;
    impact: string;
    implementation: string;
  }>;
}

export class MetricsMonitor extends EventEmitter {
  private metrics: Map<string, MetricData[]> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private aggregators: Map<string, MetricAggregator> = new Map();
  private collectors: Map<string, MetricCollector> = new Map();
  private logger: Logger;
  private metricsInterval?: NodeJS.Timeout;
  private alertCheckInterval?: NodeJS.Timeout;
  private retentionInterval?: NodeJS.Timeout;

  constructor(private config: {
    retentionPeriod: number; // seconds
    aggregationIntervals: number[]; // seconds
    alertCheckInterval: number; // seconds
    metricsCollectionInterval: number; // seconds
    storage: {
      type: 'memory' | 'redis' | 'timeseries';
      config: Record<string, any>;
    };
  }) {
    super();
    this.logger = new Logger('MetricsMonitor');
    
    this.initializeAggregators();
    this.startMetricsCollection();
    this.startAlertChecking();
    this.startRetentionCleanup();
  }

  /**
   * Record a metric data point
   */
  recordMetric(metric: Omit<MetricData, 'timestamp'>): void {
    const metricData: MetricData = {
      ...metric,
      timestamp: new Date()
    };

    const key = this.generateMetricKey(metric.name, metric.labels);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metricSeries = this.metrics.get(key)!;
    metricSeries.push(metricData);

    // Update aggregators
    this.updateAggregators(metricData);

    this.emit('metric:recorded', metricData);
  }

  /**
   * Add an alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.logger.info(`Added alert rule: ${rule.name} (${rule.id})`);
    this.emit('alert_rule:added', rule);
  }

  /**
   * Remove an alert rule
   */
  removeAlertRule(ruleId: string): void {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      this.alertRules.delete(ruleId);
      
      // Resolve any active alerts for this rule
      for (const [alertId, alert] of this.activeAlerts.entries()) {
        if (alert.ruleId === ruleId) {
          this.resolveAlert(alertId);
        }
      }
      
      this.logger.info(`Removed alert rule: ${rule.name} (${ruleId})`);
      this.emit('alert_rule:removed', rule);
    }
  }

  /**
   * Get current metric value
   */
  getCurrentMetricValue(
    metricName: string,
    labels?: Record<string, string>
  ): number | null {
    const key = this.generateMetricKey(metricName, labels || {});
    const metricSeries = this.metrics.get(key);
    
    if (!metricSeries || metricSeries.length === 0) {
      return null;
    }

    return metricSeries[metricSeries.length - 1].value;
  }

  /**
   * Query metrics with time range and aggregation
   */
  queryMetrics(query: {
    metric: string;
    labels?: Record<string, string>;
    start?: Date;
    end?: Date;
    aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
    interval?: number; // seconds
  }): Array<{ timestamp: Date; value: number }> {
    const key = this.generateMetricKey(query.metric, query.labels || {});
    const metricSeries = this.metrics.get(key) || [];

    let filteredMetrics = metricSeries;

    // Apply time filtering
    if (query.start || query.end) {
      filteredMetrics = metricSeries.filter(metric => {
        const timestamp = metric.timestamp.getTime();
        const start = query.start?.getTime() || 0;
        const end = query.end?.getTime() || Date.now();
        return timestamp >= start && timestamp <= end;
      });
    }

    // Apply aggregation if interval is specified
    if (query.interval && query.aggregation) {
      return this.aggregateMetrics(filteredMetrics, query.interval, query.aggregation);
    }

    return filteredMetrics.map(m => ({
      timestamp: m.timestamp,
      value: m.value
    }));
  }

  /**
   * Get performance profile for a server
   */
  async getPerformanceProfile(
    serverId: string,
    timeWindow: { start: Date; end: Date }
  ): Promise<PerformanceProfile> {
    const serverMetrics = this.queryServerMetrics(serverId, timeWindow);
    
    const profile: PerformanceProfile = {
      serverId,
      serverType: this.getServerType(serverId),
      timeWindow,
      metrics: {
        throughput: this.calculateThroughputMetrics(serverMetrics),
        resources: this.calculateResourceMetrics(serverMetrics),
        errors: this.calculateErrorMetrics(serverMetrics),
        connections: this.calculateConnectionMetrics(serverMetrics)
      },
      recommendations: this.generateRecommendations(serverMetrics)
    };

    this.emit('performance_profile:generated', profile);
    return profile;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(severity?: AlertRule['severity']): Alert[] {
    let alerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'firing');

    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }

    return alerts.sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime());
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalMetrics: number;
    metricsPerType: Record<string, number>;
    activeAlerts: number;
    alertsBySevertiy: Record<string, number>;
    topMetricsByVolume: Array<{ metric: string; count: number }>;
  } {
    const metricsPerType: Record<string, number> = {};
    const metricVolume: Record<string, number> = {};

    for (const [key, series] of this.metrics.entries()) {
      const metric = series[0];
      metricsPerType[metric.type] = (metricsPerType[metric.type] || 0) + 1;
      metricVolume[metric.name] = (metricVolume[metric.name] || 0) + series.length;
    }

    const alertsBySevertiy: Record<string, number> = {};
    for (const alert of this.activeAlerts.values()) {
      if (alert.status === 'firing') {
        alertsBySevertiy[alert.severity] = (alertsBySevertiy[alert.severity] || 0) + 1;
      }
    }

    const topMetricsByVolume = Object.entries(metricVolume)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([metric, count]) => ({ metric, count }));

    return {
      totalMetrics: this.metrics.size,
      metricsPerType,
      activeAlerts: this.getActiveAlerts().length,
      alertsBySevertiy,
      topMetricsByVolume
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    let output = '';
    const metricsByName = new Map<string, MetricData[]>();

    // Group metrics by name
    for (const series of this.metrics.values()) {
      for (const metric of series) {
        if (!metricsByName.has(metric.name)) {
          metricsByName.set(metric.name, []);
        }
        metricsByName.get(metric.name)!.push(metric);
      }
    }

    // Generate Prometheus format
    for (const [name, metrics] of metricsByName.entries()) {
      const firstMetric = metrics[0];
      
      if (firstMetric.description) {
        output += `# HELP ${name} ${firstMetric.description}\n`;
      }
      output += `# TYPE ${name} ${firstMetric.type}\n`;

      for (const metric of metrics) {
        const labels = Object.entries(metric.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        
        const labelString = labels ? `{${labels}}` : '';
        output += `${name}${labelString} ${metric.value} ${metric.timestamp.getTime()}\n`;
      }
    }

    return output;
  }

  /**
   * Clear all metrics and alerts
   */
  async clear(): Promise<void> {
    this.metrics.clear();
    this.activeAlerts.clear();
    
    for (const aggregator of this.aggregators.values()) {
      aggregator.clear();
    }

    this.logger.info('Cleared all metrics and alerts');
    this.emit('metrics:cleared');
  }

  /**
   * Shutdown the monitor
   */
  async shutdown(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    if (this.retentionInterval) {
      clearInterval(this.retentionInterval);
    }

    await this.clear();
    this.logger.info('Metrics monitor shutdown complete');
    this.emit('monitor:shutdown');
  }

  // Private methods

  private initializeAggregators(): void {
    for (const interval of this.config.aggregationIntervals) {
      const aggregator = new MetricAggregator(interval);
      this.aggregators.set(`${interval}s`, aggregator);
    }
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsCollectionInterval * 1000);
  }

  private startAlertChecking(): void {
    this.alertCheckInterval = setInterval(() => {
      this.checkAlertRules();
    }, this.config.alertCheckInterval * 1000);
  }

  private startRetentionCleanup(): void {
    this.retentionInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // Run every hour
  }

  private updateAggregators(metric: MetricData): void {
    for (const aggregator of this.aggregators.values()) {
      aggregator.addMetric(metric);
    }
  }

  private generateMetricKey(name: string, labels: Record<string, string>): string {
    const labelString = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    
    return labelString ? `${name}{${labelString}}` : name;
  }

  private collectSystemMetrics(): void {
    // Collect system-level metrics
    this.recordMetric({
      name: 'mcp_monitor_metrics_total',
      value: this.metrics.size,
      labels: {},
      type: 'gauge',
      description: 'Total number of metrics being monitored'
    });

    this.recordMetric({
      name: 'mcp_monitor_alerts_active',
      value: this.getActiveAlerts().length,
      labels: {},
      type: 'gauge',
      description: 'Number of active alerts'
    });

    // Memory usage
    const memUsage = process.memoryUsage();
    this.recordMetric({
      name: 'mcp_monitor_memory_usage_bytes',
      value: memUsage.heapUsed,
      labels: { type: 'heap' },
      type: 'gauge',
      unit: 'bytes'
    });
  }

  private checkAlertRules(): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) {
        continue;
      }

      try {
        this.evaluateAlertRule(rule);
      } catch (error) {
        this.logger.error(`Failed to evaluate alert rule ${rule.id}:`, error);
      }
    }
  }

  private evaluateAlertRule(rule: AlertRule): void {
    const currentValue = this.getCurrentMetricValue(rule.metric, rule.labels);
    
    if (currentValue === null) {
      return;
    }

    const conditionMet = this.evaluateCondition(
      currentValue,
      rule.condition,
      rule.threshold
    );

    const existingAlert = Array.from(this.activeAlerts.values())
      .find(alert => alert.ruleId === rule.id && alert.status === 'firing');

    if (conditionMet && !existingAlert) {
      // Fire new alert
      this.fireAlert(rule, currentValue);
    } else if (!conditionMet && existingAlert) {
      // Resolve existing alert
      this.resolveAlert(existingAlert.id);
    }
  }

  private evaluateCondition(
    value: number,
    condition: AlertRule['condition'],
    threshold: number
  ): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return false;
    }
  }

  private fireAlert(rule: AlertRule, currentValue: number): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      severity: rule.severity,
      message: `${rule.description} (current: ${currentValue}, threshold: ${rule.threshold})`,
      labels: rule.labels || {},
      firedAt: new Date(),
      status: 'firing'
    };

    this.activeAlerts.set(alert.id, alert);
    
    this.logger.warn(`Alert fired: ${alert.ruleName}`, {
      alertId: alert.id,
      metric: alert.metric,
      currentValue,
      threshold: rule.threshold
    });

    this.emit('alert:fired', alert);
    this.sendAlertNotification(alert, rule);
  }

  private resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return;
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();

    this.logger.info(`Alert resolved: ${alert.ruleName}`, {
      alertId: alert.id,
      duration: alert.resolvedAt.getTime() - alert.firedAt.getTime()
    });

    this.emit('alert:resolved', alert);
    
    // Remove from active alerts after a delay
    setTimeout(() => {
      this.activeAlerts.delete(alertId);
    }, 300000); // Keep resolved alerts for 5 minutes
  }

  private async sendAlertNotification(alert: Alert, rule: AlertRule): Promise<void> {
    try {
      if (rule.notifications.webhook) {
        await this.sendWebhookNotification(rule.notifications.webhook, alert);
      }

      if (rule.notifications.email && rule.notifications.email.length > 0) {
        await this.sendEmailNotification(rule.notifications.email, alert);
      }

      if (rule.notifications.slack) {
        await this.sendSlackNotification(rule.notifications.slack, alert);
      }

    } catch (error) {
      this.logger.error('Failed to send alert notification:', error);
    }
  }

  private async sendWebhookNotification(webhook: string, alert: Alert): Promise<void> {
    // Implementation would send HTTP POST to webhook
    this.logger.debug(`Sending webhook notification to ${webhook}`);
  }

  private async sendEmailNotification(emails: string[], alert: Alert): Promise<void> {
    // Implementation would send email notifications
    this.logger.debug(`Sending email notifications to ${emails.join(', ')}`);
  }

  private async sendSlackNotification(channel: string, alert: Alert): Promise<void> {
    // Implementation would send Slack notifications
    this.logger.debug(`Sending Slack notification to ${channel}`);
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (this.config.retentionPeriod * 1000);
    let totalRemoved = 0;

    for (const [key, series] of this.metrics.entries()) {
      const initialLength = series.length;
      
      // Remove old metrics
      const filteredSeries = series.filter(
        metric => metric.timestamp.getTime() > cutoffTime
      );
      
      if (filteredSeries.length === 0) {
        this.metrics.delete(key);
      } else if (filteredSeries.length < initialLength) {
        this.metrics.set(key, filteredSeries);
      }
      
      totalRemoved += initialLength - filteredSeries.length;
    }

    if (totalRemoved > 0) {
      this.logger.debug(`Cleaned up ${totalRemoved} old metric data points`);
    }
  }

  private aggregateMetrics(
    metrics: MetricData[],
    intervalSeconds: number,
    aggregation: string
  ): Array<{ timestamp: Date; value: number }> {
    const intervalMs = intervalSeconds * 1000;
    const buckets = new Map<number, MetricData[]>();

    // Group metrics into time buckets
    for (const metric of metrics) {
      const bucketTime = Math.floor(metric.timestamp.getTime() / intervalMs) * intervalMs;
      
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime)!.push(metric);
    }

    // Aggregate each bucket
    const result: Array<{ timestamp: Date; value: number }> = [];
    
    for (const [bucketTime, bucketMetrics] of buckets.entries()) {
      const values = bucketMetrics.map(m => m.value);
      let aggregatedValue: number;

      switch (aggregation) {
        case 'avg':
          aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'sum':
          aggregatedValue = values.reduce((a, b) => a + b, 0);
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
        default:
          aggregatedValue = values[values.length - 1]; // last value
      }

      result.push({
        timestamp: new Date(bucketTime),
        value: aggregatedValue
      });
    }

    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private queryServerMetrics(
    serverId: string,
    timeWindow: { start: Date; end: Date }
  ): Map<string, MetricData[]> {
    const serverMetrics = new Map<string, MetricData[]>();

    for (const [key, series] of this.metrics.entries()) {
      // Check if metrics belong to this server
      const hasServerLabel = series.some(metric => 
        metric.labels.serverId === serverId || 
        metric.labels.server === serverId
      );

      if (!hasServerLabel) {
        continue;
      }

      // Filter by time window
      const filteredSeries = series.filter(metric => {
        const timestamp = metric.timestamp.getTime();
        return timestamp >= timeWindow.start.getTime() && 
               timestamp <= timeWindow.end.getTime();
      });

      if (filteredSeries.length > 0) {
        serverMetrics.set(key, filteredSeries);
      }
    }

    return serverMetrics;
  }

  private getServerType(serverId: string): string {
    // Implementation would determine server type from metrics or registry
    return 'unknown';
  }

  private calculateThroughputMetrics(metrics: Map<string, MetricData[]>): any {
    // Implementation would calculate throughput metrics
    return {
      requestsPerSecond: 0,
      averageResponseTime: 0,
      percentiles: { p50: 0, p95: 0, p99: 0 }
    };
  }

  private calculateResourceMetrics(metrics: Map<string, MetricData[]>): any {
    // Implementation would calculate resource metrics
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      networkIO: { inbound: 0, outbound: 0 }
    };
  }

  private calculateErrorMetrics(metrics: Map<string, MetricData[]>): any {
    // Implementation would calculate error metrics
    return {
      errorRate: 0,
      errorsByType: {},
      timeouts: 0
    };
  }

  private calculateConnectionMetrics(metrics: Map<string, MetricData[]>): any {
    // Implementation would calculate connection metrics
    return {
      active: 0,
      idle: 0,
      total: 0
    };
  }

  private generateRecommendations(metrics: Map<string, MetricData[]>): any[] {
    // Implementation would generate optimization recommendations
    return [];
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}

/**
 * Metric Aggregator for time-based aggregations
 */
class MetricAggregator {
  private buckets: Map<number, MetricData[]> = new Map();

  constructor(private intervalSeconds: number) {}

  addMetric(metric: MetricData): void {
    const bucketTime = this.getBucketTime(metric.timestamp);
    
    if (!this.buckets.has(bucketTime)) {
      this.buckets.set(bucketTime, []);
    }
    
    this.buckets.get(bucketTime)!.push(metric);
  }

  getAggregatedData(
    start: Date,
    end: Date,
    aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count'
  ): Array<{ timestamp: Date; value: number }> {
    const result: Array<{ timestamp: Date; value: number }> = [];
    const startBucket = this.getBucketTime(start);
    const endBucket = this.getBucketTime(end);

    for (let bucket = startBucket; bucket <= endBucket; bucket += this.intervalSeconds * 1000) {
      const metrics = this.buckets.get(bucket);
      if (!metrics || metrics.length === 0) {
        continue;
      }

      const values = metrics.map(m => m.value);
      let aggregatedValue: number;

      switch (aggregation) {
        case 'avg':
          aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'sum':
          aggregatedValue = values.reduce((a, b) => a + b, 0);
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
      }

      result.push({
        timestamp: new Date(bucket),
        value: aggregatedValue
      });
    }

    return result;
  }

  clear(): void {
    this.buckets.clear();
  }

  private getBucketTime(timestamp: Date): number {
    const intervalMs = this.intervalSeconds * 1000;
    return Math.floor(timestamp.getTime() / intervalMs) * intervalMs;
  }
}

/**
 * Metric Collector interface for custom metric sources
 */
export abstract class MetricCollector {
  protected monitor: MetricsMonitor;

  constructor(monitor: MetricsMonitor) {
    this.monitor = monitor;
  }

  abstract collect(): Promise<void>;
  abstract getName(): string;
}