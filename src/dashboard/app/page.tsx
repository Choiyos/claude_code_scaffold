'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { EnvironmentStatus } from '@/components/dashboard/environment-status';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { SystemMetrics } from '@/components/dashboard/system-metrics';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { TeamActivity } from '@/components/dashboard/team-activity';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="flex-1 space-y-6 p-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading-2">Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor and manage your Claude development environments
            </p>
          </div>
          <QuickActions />
        </div>

        {/* Main Dashboard Content */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
          {/* Overview Section */}
          <div className="lg:col-span-8">
            <DashboardOverview />
          </div>
          
          {/* Quick Stats */}
          <div className="lg:col-span-4">
            <EnvironmentStatus />
          </div>

          {/* System Metrics */}
          <div className="lg:col-span-8">
            <SystemMetrics />
          </div>

          {/* Team Activity */}
          <div className="lg:col-span-4">
            <TeamActivity />
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-12">
            <RecentActivity />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}