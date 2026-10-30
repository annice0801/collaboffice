import Link from "next/link";
import type { ReactNode } from "react";

// 遊戲室分頁的共用外框：粉彩背景、圓角卡片、像素字標題（清爽又帶點童趣）
// 遊戲本身的顏色固定用粉彩，不跟著深色模式變暗，所以這裡的文字顏色也寫死。

export const CANDY = {
  ink: "#3b2f4a", //   主要文字（深紫灰）
  soft: "#7a6e8a", //  次要文字
  pink: "#ff8fb8",
  mint: "#7dd3c0",
  yellow: "#ffd166",
  sky: "#4cc9f0",
  lilac: "#b388ff",
  coral: "#ff6b6b",
  green: "#06d6a0",
  blue: "#5c7cfa",
  orange: "#ff9f43",
};

export function GameShell({ title, emoji, children, help }: { title: string; emoji: string; children: ReactNode; help: ReactNode }) {
  return (
    <main
      className="flex min-h-dvh flex-1 flex-col items-center px-3 py-4 sm:py-6"
      style={{
        color: CANDY.ink,
        background: "radial-gradient(circle at 15% 10%, #ffe3f0 0, transparent 40%), radial-gradient(circle at 85% 90%, #d9f7ee 0, transparent 45%), #fffaf2",
      }}
    >
      <header className="flex w-full max-w-4xl items-center justify-between gap-3">
        <Link href="/office" className="rounded-full bg-white px-3 py-1.5 text-sm shadow-sm ring-1 ring-black/5 hover:bg-pink-50">
          ← 回到辦公室
        </Link>
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl" style={{ fontFamily: "var(--font-pixel), var(--font-geist-sans), sans-serif" }}>
          <span aria-hidden="true">{emoji}</span>
          {title}
        </h1>
        <span className="hidden w-[104px] sm:block" aria-hidden="true" />
      </header>
      <div className="mt-4 flex w-full max-w-4xl flex-1 flex-col items-center">{children}</div>
      <footer className="mt-4 max-w-4xl text-center text-xs" style={{ color: CANDY.soft }}>
        {help}
      </footer>
    </main>
  );
}

// 圓角白卡片（分數、下一個方塊…）
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white/90 p-3 shadow-[0_6px_0_rgba(59,47,74,0.08)] ring-1 ring-black/5 ${className}`}>{children}</div>;
}

// 最高分存在這台瀏覽器（私人視窗或封鎖網站資料時讀不到也沒關係）
export function loadBest(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
export function saveBest(key: string, score: number) {
  try {
    localStorage.setItem(key, String(score));
  } catch {
    // 存不了就算了，下次重新計算
  }
}
