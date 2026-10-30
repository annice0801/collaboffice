import Link from "next/link";
import { Logo } from "./logo";

// 網站底部：品牌說明 + 連結分組 + 版權
const GROUPS = [
  {
    title: "產品",
    links: [
      { href: "/#features", label: "服務特色" },
      { href: "/#team", label: "組織架構" },
      { href: "/#how", label: "運作流程" },
      { href: "/#faq", label: "常見問題" },
    ],
  },
  {
    title: "帳號",
    links: [
      { href: "/sign-up", label: "免費註冊" },
      { href: "/sign-in", label: "登入" },
      { href: "/office", label: "進入辦公室" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            一句話交辦，整間 AI 公司為你運轉。秘書守門、總經理拆解、各部門專員分工執行，每一份成果都經過層層審閱才交到你手上。
          </p>
        </div>
        {GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-sm font-semibold">{group.title}</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-muted">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
          © 2026 CollabOffice. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
