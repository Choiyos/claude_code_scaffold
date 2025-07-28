'use client';

import { Bell, Menu, Search, User, Settings, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/lib/websocket-context';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ onMenuClick, sidebarCollapsed }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { connectionStatus, lastActivity } = useWebSocket();

  const notifications = [
    {
      id: '1',
      title: 'Environment Sync Complete',
      description: 'Development environment successfully synchronized',
      time: '2 min ago',
      type: 'success',
    },
    {
      id: '2',
      title: 'MCP Server Warning',
      description: 'Context7 server showing high latency',
      time: '5 min ago',
      type: 'warning',
    },
    {
      id: '3',
      title: 'Team Member Joined',
      description: 'Alice Johnson joined the development team',
      time: '1 hour ago',
      type: 'info',
    },
  ];

  const unreadCount = notifications.filter(n => n.type !== 'info').length;

  return (
    <header className="flex h-16 items-center border-b bg-card px-6">
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="sm"
        className="mr-4 lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Search */}
      <div className="flex flex-1 items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search environments, configs, logs..."
            className="pl-9 pr-4"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              connectionStatus === 'connected' ? 'bg-success-500' : 'bg-error-500'
            )}
          />
          <span className="hidden sm:inline">
            {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
                >
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {unreadCount} new
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} className="flex flex-col items-start p-4">
                  <div className="flex w-full items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="text-xs text-muted-foreground">{notification.description}</p>
                    </div>
                    <div
                      className={cn(
                        'ml-2 h-2 w-2 rounded-full',
                        notification.type === 'success' && 'bg-success-500',
                        notification.type === 'warning' && 'bg-warning-500',
                        notification.type === 'info' && 'bg-claude-500'
                      )}
                    />
                  </div>
                  <span className="mt-1 text-xs text-muted-foreground">{notification.time}</span>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center text-sm">
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatars/01.png" alt="User" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">John Doe</p>
                <p className="text-xs leading-none text-muted-foreground">
                  john.doe@company.com
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}