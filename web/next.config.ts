import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
