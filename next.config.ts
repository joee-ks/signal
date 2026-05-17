import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every response. CSP is intentionally
 * not set here — Next.js's hydration scripts plus Tailwind v4's inline
 * styles make a tight CSP hard to maintain without breaking the app, and
 * a permissive CSP gives a false sense of security. Worth revisiting once
 * the app is stable enough to invest in nonce-based script-src.
 *
 * HSTS is set by Vercel at the edge in production, so we don't duplicate.
 */
const securityHeaders = [
  // Block being framed by other sites — defends against clickjacking.
  // (`X-Frame-Options: DENY` is the legacy header; `Content-Security-Policy:
  //  frame-ancestors 'none'` is the modern equivalent that supersedes it.
  //  Setting both maximizes browser coverage.)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Prevent MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs to cross-origin requests (e.g. external image hosts).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser APIs we don't use; reduces fingerprint surface and
  // prevents accidental access if a dependency tried.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
