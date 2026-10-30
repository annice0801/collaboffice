"use client";

// 網站頂部導覽列（介紹頁使用）。
// 寬螢幕：左邊標誌、中間導覽連結、右邊登入與註冊按鈕。
// 手機：收合成「選單」按鈕，點開才顯示連結。
// "use client"：需要記住選單開或關，所以在瀏覽器執行

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./logo";

const NAV = [
  { href: "#features", label: "服務特色" },
  { href: "#team", label: "組織架構" },
  { href: "#how", label: "運作流程" },
  { href: "#faq", label: "常見問題" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    // sticky：捲動時固定在頂部；backdrop-blur：背後內容模糊，像毛玻璃
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav aria-label="主要導覽" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm text-muted">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition hover:text-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/sign-in" className="rounded-full px-4 py-2 text-sm font-medium transition hover:bg-ink/5">
            登入
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-85"
          >
            免費開設辦公室
          </Link>
        </div>

        {/* 手機版選單按鈕 */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-ink/5 md:hidden"
        >
          <span className="sr-only">{open ? "關閉選單" : "開啟選單"}</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-paper px-4 pb-6 md:hidden">
          <ul className="flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={close} className="block py-3 text-base">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Link href="/sign-up" onClick={close} className="rounded-full bg-ink px-4 py-3 text-center font-medium text-paper">
              免費開設辦公室
            </Link>
            <Link href="/sign-in" onClick={close} className="rounded-full border border-line px-4 py-3 text-center font-medium">
              登入
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
