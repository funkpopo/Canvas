import type { NextConfig } from "next";
import { routing } from './i18n/routing';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  experimental: {
    // Enable React 19 features
    reactCompiler: false,
  },
  // Disable static optimization for pages with dynamic content
  // to prevent hydration issues
  trailingSlash: false,

  // API代理配置 - Docker环境
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_URL || 'http://backend:8000/api/:path*',
      },
    ];
  },
};

export default withNextIntl(nextConfig);
