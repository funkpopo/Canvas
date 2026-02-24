const fs = require("fs");
const path = require("path");

const defaultRuntimeConfig = {
  apiProxyTarget: "http://localhost:8000/api/:path*",
  enableBundleAnalyzer: false,
};

function loadRuntimeConfig() {
  const configPath = path.join(__dirname, "config", "settings.json");
  try {
    if (!fs.existsSync(configPath)) return defaultRuntimeConfig;

    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultRuntimeConfig,
      ...parsed,
    };
  } catch (error) {
    console.warn("[next.config] Failed to load config/settings.json, using defaults.", error);
    return defaultRuntimeConfig;
  }
}

const runtimeConfig = loadRuntimeConfig();
const analyzeEnabled = runtimeConfig.enableBundleAnalyzer === true;
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: analyzeEnabled,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产环境优化
  reactStrictMode: true,

  poweredByHeader: false, // 移除 X-Powered-By header

  // 压缩配置
  compress: true,

  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1年缓存
  },

  // 实验性功能
  experimental: {
    // 优化包导入 - tree shaking
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // 通过 frontend/config/settings.json 管理后端代理地址
        destination: runtimeConfig.apiProxyTarget,
      },
    ];
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

module.exports = analyzeEnabled ? withBundleAnalyzer(nextConfig) : nextConfig;
