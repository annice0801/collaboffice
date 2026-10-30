import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
        // 只處理專案自己的 CSS。
        // 不加這行的話，連 Next.js 自動產生的字型 CSS（next/font）也會被 Tailwind 處理，
        // 導致字型網址解析失敗，或 globals.css 修改後沒有重新編譯
        condition: { not: "foreign" },
      },
    },
  },
};

export default nextConfig;
