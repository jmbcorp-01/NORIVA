import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 스튜디오는 로그인한 대표만 쓰는 동적 화면이라 Cache Components를 끄고 요청마다 렌더링해요.
  output: "standalone",
  serverExternalPackages: ["pg"],
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
