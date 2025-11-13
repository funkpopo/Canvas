/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产环境优化
  reactStrictMode: true,

  // 压缩配置
  compress: true,

  // 性能优化
  swcMinify: true,

  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1年缓存
  },

  // 实验性功能
  experimental: {
    // 启用React编译器（需要React 19）
    reactCompiler: true,
    // 部分预渲染
    ppr: 'incremental',
    // 优化字体加载
    optimizePackageImports: ['lucide-react', 'recharts'],
  },

  // Webpack优化
  webpack: (config, { isServer }) => {
    // 生产环境优化
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // 第三方库单独打包
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20
            },
            // UI组件库单独打包
            ui: {
              name: 'ui',
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react)[\\/]/,
              priority: 30,
            },
            // 图表库单独打包
            charts: {
              name: 'charts',
              test: /[\\/]node_modules[\\/](recharts)[\\/]/,
              priority: 30,
            },
            // 公共代码
            common: {
              minChunks: 2,
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    return config;
  },

  // 环境变量
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
  },

  // 输出配置
  output: 'standalone', // 用于Docker部署

  // HTTP头配置
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
        ],
      },
      // 静态资源缓存
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
