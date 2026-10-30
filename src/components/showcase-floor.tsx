"use client";

// 首頁的立體辦公室展示：辦公室旁邊有一排像資料夾索引標籤的主題標籤，點一下就切換辦公環境。
// （只列出已經完成的主題）辦公室用範例部門與模擬資料，不需要登入。
import { useState } from "react";
import { OfficeFloor } from "@/app/office/floor/office-floor";
import { DEFAULT_DEPARTMENTS, OFFICE_STYLES, type OfficeStyle } from "@/lib/company";

// 每個主題標籤的顏色
const TAB_COLORS: Partial<Record<OfficeStyle, string>> = {
  classic: "#a4774f",
  campus: "#4285f4",
  scifi: "#5c5a8a",
  magic: "#9c1c22",
};

export function ShowcaseFloor() {
  const [style, setStyle] = useState<OfficeStyle>("campus");
  const themes = OFFICE_STYLES.filter((s) => s.ready);

  // 一個資料夾標籤：手機上排在辦公室上方（橫的），寬螢幕貼在辦公室右側（直的）
  const tab = (s: (typeof themes)[number]) => {
    const active = style === s.id;
    const color = TAB_COLORS[s.id] ?? "#16150f";
    return (
      <button
        key={s.id}
        type="button"
        role="tab"
        aria-selected={active}
        title={s.description}
        onClick={() => setStyle(s.id)}
        className={`relative flex shrink-0 items-center gap-1.5 border border-line px-3 py-2 text-sm font-medium shadow-sm transition
          rounded-t-xl border-b-0 lg:rounded-t-none lg:rounded-r-xl lg:border-b lg:border-l-0 lg:py-3 lg:[writing-mode:vertical-rl]
          ${active ? "bg-surface text-ink" : "bg-paper text-muted hover:text-ink lg:-translate-x-1 lg:hover:translate-x-0"}`}
      >
        {/* 標籤邊緣的主題色條：橫的在上緣、直的在右緣；選中的顏色比較深 */}
        <span
          aria-hidden="true"
          className="absolute inset-x-2 top-0 h-1 rounded-b lg:inset-x-auto lg:inset-y-2 lg:top-2 lg:right-0 lg:h-auto lg:w-1 lg:rounded-l lg:rounded-b-none"
          style={{ background: color, opacity: active ? 1 : 0.45 }}
        />
        <span aria-hidden="true" className="lg:[writing-mode:horizontal-tb]">{s.emoji}</span>
        {s.name}
      </button>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row lg:items-start">
      {/* 手機、平板：標籤在上方 */}
      <div role="tablist" aria-label="選擇辦公環境" className="flex gap-1 overflow-x-auto px-3 lg:hidden">
        {themes.map(tab)}
      </div>
      <div className="min-w-0 flex-1">
        <OfficeFloor demo departments={DEFAULT_DEPARTMENTS} style={style} />
      </div>
      {/* 寬螢幕：標籤貼在辦公室右側，像資料夾的索引標籤 */}
      <div role="tablist" aria-label="選擇辦公環境" className="hidden flex-col gap-1.5 pt-8 lg:flex">
        {themes.map(tab)}
      </div>
    </div>
  );
}
