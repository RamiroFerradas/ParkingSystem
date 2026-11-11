import type { NextConfig } from "next";

// Next.js 16 — Cache Components enabled.
// Data reads outside <Suspense> that hit request-time sources will fail the
// build; use 'use cache' for cacheable reads and Suspense for dynamic ones.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
