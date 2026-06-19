import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  async rewrites() {
    return [
      {
        source: '/helfer',
        destination: '/?mode=helfer',
      },
      {
        source: '/helfer/:token',
        destination: '/?mode=helfer&token=:token',
      },
      {
        source: '/reservierung',
        destination: '/?mode=reservierung',
      },
      {
        source: '/reservierung/:token',
        destination: '/?mode=reservierung&token=:token',
      },
    ];
  },
};

export default nextConfig;
