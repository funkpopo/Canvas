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
};

export default withNextIntl(nextConfig);
