import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Claude Environment Dashboard',
  description: 'Unified development environment management for Claude Code + SuperClaude + MCP',
  keywords: ['Claude', 'AI', 'Development', 'Environment', 'Dashboard', 'MCP'],
  authors: [{ name: 'Claude Environment Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <div className="relative flex min-h-screen flex-col">
              <div className="flex-1">{children}</div>
            </div>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  border: '1px solid hsl(var(--border))',
                },
                success: {
                  iconTheme: {
                    primary: 'hsl(var(--success-500))',
                    secondary: 'hsl(var(--success-50))',
                  },
                },
                error: {
                  iconTheme: {
                    primary: 'hsl(var(--error-500))',
                    secondary: 'hsl(var(--error-50))',
                  },
                },
              }}
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}