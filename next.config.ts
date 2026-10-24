import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: '/studio', destination: '/studio/index.html' }];
  },
};

export default nextConfig;
