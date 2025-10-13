import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enable React 19 features
    reactCompiler: false,
  },
  // Disable static optimization for pages with dynamic content
  // to prevent hydration issues
  trailingSlash: false,
};

export default nextConfig;
