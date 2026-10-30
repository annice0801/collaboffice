import Link from "next/link";

// 品牌標誌：三個方塊組成的「組織圖」——上方一個（你），下方兩個（團隊）
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="11" y="3" width="10" height="10" rx="3" className="fill-accent" />
      <path d="M16 13v4M8 21v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" className="stroke-accent" strokeWidth="2" fill="none" />
      <rect x="3" y="21" width="10" height="8" rx="3" className="fill-ink" />
      <rect x="19" y="21" width="10" height="8" rx="3" className="fill-gold" />
    </svg>
  );
}

// 標誌 + 文字，點了回到首頁
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="CollabOffice 首頁">
      <LogoMark />
      <span className="text-lg">CollabOffice</span>
    </Link>
  );
}
