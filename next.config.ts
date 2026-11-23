import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Headers for every response. The page Content-Security-Policy carries a
 * per-request nonce and is set in src/proxy.ts; API responses get a locked-down
 * policy here because they never render HTML.
 */
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Remind about Next.js security advisories during dev and build (the documented default).
    agentUpgrade: "security",
  },
  // Nonce-based CSP requires per-request rendering, which is incompatible with
  // Partial Prerendering / Cache Components static shells (see the Next.js CSP guide).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
};

export default nextConfig;
