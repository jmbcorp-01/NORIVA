import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// 보안 헤더: 틀 안에 넣기 금지, 허락한 곳의 스크립트만, HTTPS 고정.
// Next가 페이지에 넣는 인라인 스크립트 때문에 script-src에 'unsafe-inline'이 필요해요.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // 스튜디오는 로그인한 대표만 쓰는 동적 화면이라 Cache Components를 끄고 요청마다 렌더링해요.
  output: "standalone",
  serverExternalPackages: ["pg"],
  // 화풍 참고 캡처를 서버 액션으로 올려요 (한 번에 최대 8장)
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
