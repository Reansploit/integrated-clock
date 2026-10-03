/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Headroom above the 100 MB video cap: a file exactly at the cap plus its
      // multipart envelope must still reach the action, so the app-level check
      // can reject it with a readable notice instead of Next failing the
      // request with no feedback at all.
      bodySizeLimit: '120mb',
    },
  },
};

export default nextConfig;
