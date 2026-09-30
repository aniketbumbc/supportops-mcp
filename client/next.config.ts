import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dev-only "N" indicator: keep it away from the sidebar's user block (bottom-left).
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
