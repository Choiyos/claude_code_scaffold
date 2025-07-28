'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Home,
  Server,
  Settings,
  Activity,
  Users,
  GitBranch,
  Terminal,
  FileText,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Zap,
  Shield,
  Database,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onOpenChange: (open: boolean) => void;
  onCollapsedChange: (collapsed: boolean) => void;
}

const navigationItems = [
  {
    title: 'Overview',
    items: [
      {
        title: 'Dashboard',
        href: '/',
        icon: Home,
        badge: null,
      },
      {
        title: 'Activity',
        href: '/activity',
        icon: Activity,
        badge: '3',
      },
    ],
  },
  {
    title: 'Environment',
    items: [
      {
        title: 'Environments',
        href: '/environments',
        icon: Server,
        badge: null,
      },
      {
        title: 'MCP Servers',
        href: '/mcp-servers',
        icon: Database,
        badge: 'Beta',
      },
      {
        title: 'Sync Status',
        href: '/sync',
        icon: GitBranch,
        badge: null,
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        title: 'Terminal',
        href: '/terminal',
        icon: Terminal,
        badge: null,
      },
      {
        title: 'SuperClaude',
        href: '/superclaude',
        icon: Zap,
        badge: 'Pro',
      },
      {
        title: 'Security',
        href: '/security',
        icon: Shield,
        badge: null,
      },
    ],
  },
  {
    title: 'Team',
    items: [
      {
        title: 'Members',
        href: '/team',
        icon: Users,
        badge: null,
      },
      {
        title: 'Documentation',
        href: '/docs',
        icon: FileText,
        badge: null,
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        title: 'Help',
        href: '/help',
        icon: HelpCircle,
        badge: null,
      },
      {
        title: 'Settings',
        href: '/settings',
        icon: Settings,
        badge: null,
      },
    ],
  },
];

export function Sidebar({ open, collapsed, onOpenChange, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-claude-600">
            <Rocket className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Claude Environment</span>
              <span className="text-xs text-muted-foreground">Dashboard</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-6">
          {navigationItems.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        className={cn(
                          'w-full justify-start gap-3',
                          collapsed ? 'px-2' : 'px-3',
                          isActive && 'bg-secondary/80 font-medium'
                        )}
                        size={collapsed ? 'sm' : 'default'}
                        title={collapsed ? item.title : undefined}
                      >
                        <item.icon className={cn('h-4 w-4', collapsed ? 'mx-auto' : '')} />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left">{item.title}</span>
                            {item.badge && (
                              <Badge
                                variant={item.badge === 'Pro' || item.badge === 'Beta' ? 'default' : 'secondary'}
                                className="ml-auto text-xs"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </>
                        )}
                      </Button>
                    </Link>
                  );
                })}
              </div>
              {!collapsed && <Separator className="my-4" />}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Collapse Toggle */}
      <div className="border-t p-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={cn(
          'hidden border-r bg-card transition-all duration-300 lg:flex lg:flex-col',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r bg-card transition-transform duration-300 ease-in-out lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </div>
    </>
  );
}