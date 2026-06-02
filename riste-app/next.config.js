/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // Prisma + bullmq are server-only; keep them external to the bundle.
    serverComponentsExternalPackages: ["@prisma/client", "bullmq", "ioredis", "nodemailer"],
  },
};

module.exports = nextConfig;
