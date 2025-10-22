import type { NextConfig } from "next";

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

export default nextConfig;
