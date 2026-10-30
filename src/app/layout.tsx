import type { Metadata } from "next";
import { DotGothic16, Geist, Geist_Mono, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 標題用的中文襯線字（思源宋體）。
// 中文字型檔很大，preload: false 代表不在頁面一開始就預先下載，
// 由瀏覽器依照頁面實際用到的字分批載入，避免拖慢首頁
const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  weight: ["500", "700"],
  preload: false,
  display: "swap",
});

// 像素字型：立體辦公室裡寶可夢風格的對話框使用（中文字型檔大，同樣不預先下載）
const pixelFont = DotGothic16({
  variable: "--font-pixel",
  weight: "400",
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "CollabOffice｜一句話交辦，整間 AI 公司為你運轉",
  description:
    "CollabOffice 是你的 AI 協作辦公室：首席秘書接收需求、總經理拆解分派，五個部門的 AI 專員分工執行、層層審閱，最後交回完整成果。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // lang="zh-Hant"：告訴瀏覽器這是繁體中文頁面（影響字型選擇與螢幕報讀）
    // data-scroll-behavior="smooth"：頁內連結平滑捲動，但切換頁面時 Next.js 會直接跳到頂端
    <html
      lang="zh-Hant"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifTC.variable} ${pixelFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
