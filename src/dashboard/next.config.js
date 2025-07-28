/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true,
  },
  env: {
    CUSTOM_KEY: 'my-value',
  },
  async rewrites() {
    return [
      {
        source: '/api/claude-env/:path*',
        destination: process.env.CLAUDE_ENV_API_URL + '/:path*',
      },
    ];
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Important: return the modified config
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
}

module.exports = nextConfig;