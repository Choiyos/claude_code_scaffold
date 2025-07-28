'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  Server,
  GitBranch,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// Mock data for demonstration
const syncHistoryData = [
  { name: '00:00', syncs: 12, errors: 0 },
  { name: '04:00', syncs: 8, errors: 1 },
  { name: '08:00', syncs: 24, errors: 0 },
  { name: '12:00', syncs: 35, errors: 2 },
  { name: '16:00', syncs: 28, errors: 1 },
  { name: '20:00', syncs: 18, errors: 0 },
];

const environmentUsageData = [
  { name: 'Development', value: 45, color: '#8884d8' },
  { name: 'Staging', value: 25, color: '#82ca9d' },
  { name: 'Production', value: 30, color: '#ffc658' },
];

export function DashboardOverview() {
  const { data: overviewData, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return {
        totalEnvironments: 12,
        activeEnvironments: 10,
        lastSync: new Date().toISOString(),
        syncSuccess: 98.5,
        uptime: 99.8,
        avgResponseTime: 145,
        totalSyncs: 1247,
        todaySyncs: 23,
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
          <CardDescription>Loading system metrics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = overviewData!;

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Environments</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalEnvironments}</div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center text-success-600">
                <TrendingUp className="mr-1 h-3 w-3" />
                +2 from last month
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Environments</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeEnvironments}</div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center">
                <CheckCircle className="mr-1 h-3 w-3 text-success-500" />
                All systems operational
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sync Success Rate</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.syncSuccess}%</div>
            <Progress value={data.syncSuccess} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgResponseTime}ms</div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center text-success-600">
                <TrendingDown className="mr-1 h-3 w-3" />
                -12ms from yesterday
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sync Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Sync Activity (24h)</CardTitle>
            <CardDescription>
              Successful syncs and errors over the last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={syncHistoryData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  className="text-muted-foreground" 
                  fontSize={12}
                />
                <YAxis className="text-muted-foreground" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="syncs"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Successful Syncs"
                />
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  name="Errors"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Environment Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Environment Usage</CardTitle>
            <CardDescription>
              Distribution of development activities across environments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={environmentUsageData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  className="text-muted-foreground" 
                  fontSize={12}
                />
                <YAxis className="text-muted-foreground" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>
            Current status of all system components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-success-100 p-2">
                  <CheckCircle className="h-4 w-4 text-success-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">MCP Servers</p>
                  <p className="text-xs text-muted-foreground">All 4 servers online</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-success-100 text-success-700">
                Healthy
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-warning-100 p-2">
                  <AlertTriangle className="h-4 w-4 text-warning-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Sync Service</p>
                  <p className="text-xs text-muted-foreground">Minor latency detected</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-warning-100 text-warning-700">
                Warning
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-claude-100 p-2">
                  <Clock className="h-4 w-4 text-claude-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Last Backup</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-claude-100 text-claude-700">
                Scheduled
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}