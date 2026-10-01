/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['three'],
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
