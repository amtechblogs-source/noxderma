const isStaticExport = process.env.STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isStaticExport ? { output: "export", trailingSlash: true } : {}),
  reactStrictMode: false,
  experimental: {
    // Keep visited & prefetched App Router pages warm in client memory for instant 0ms navigation
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    ...(isStaticExport ? { unoptimized: true } : {}),
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
