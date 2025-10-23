import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
  typescript: {
    // 启用更严格的类型检查
    ignoreBuildErrors: false,
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_URL || 'http://backend:8000/api/:path*',
      },
    ];
  },

  // Next.js 16 性能优化
  poweredByHeader: false, // 移除 X-Powered-By header

  // 压缩配置
  compress: true,

  // 图片优化配置
  images: {
    // 启用更新的图片优化
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
