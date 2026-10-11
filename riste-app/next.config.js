/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  experimental: {
    // Prisma + bullmq are server-only; keep them external to the bundle.
    serverComponentsExternalPackages: ["@prisma/client", "bullmq", "ioredis", "nodemailer"],
  },
};

module.exports = nextConfig;
