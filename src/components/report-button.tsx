"use client";

// 「回報問題」按鈕：使用時遇到問題，把出問題的部分傳給後台（存在 reports 資料表，之後由後台管理處理）。
// where：在哪裡遇到（例如「交辦事項：下個月 IG 貼文」）
// context：自動附上的資料（錯誤訊息、相關 id），使用者會看到附了哪些東西

import { useEffect, useRef, useState } from "react";

export function ReportButton({
  where,
  context = {},
  label = "回報問題",
  className = "",
}: {
  where: string;
  context?: Record<string, unknown>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 用原生 <dialog>：自動處理 Esc 關閉、焦點鎖在視窗裡
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        where,
        message,
        context: { ...context, url: window.location.pathname, userAgent: navigator.userAgent, time: new Date().toISOString() },
      }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "送出失敗，請稍後再試");
      setState("idle");
      return;
    }
    setState("sent");
    setMessage("");
  }

  const close = () => {
    setOpen(false);
    setState("idle");
    setError(null);
  };
  const attached = Object.entries(context).filter(([, v]) => v !== undefined && v !== null && v !== "");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "text-xs text-muted underline-offset-2 hover:text-ink hover:underline"}>
        {label}
      </button>
      <dialog
        ref={dialogRef}
        onClose={close}
        onPointerDown={(e) => e.stopPropagation()}
        className="m-auto w-[min(440px,calc(100%-32px))] rounded-2xl border border-line bg-surface p-0 text-sm text-ink shadow-2xl backdrop:bg-black/30"
      >
        {state === "sent" ? (
          <div className="p-5">
            <p className="font-semibold">已送出，謝謝你的回報</p>
            <p className="mt-1 text-muted">我們會盡快查看並處理。</p>
            <button type="button" onClick={close} className="mt-4 w-full rounded-lg bg-ink py-2 font-medium text-paper">
              關閉
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">回報問題</h2>
                <p className="mt-0.5 text-xs text-muted">位置：{where}</p>
              </div>
              <button type="button" onClick={close} className="rounded-full px-2 text-lg text-muted hover:bg-ink/5" aria-label="關閉">
                ×
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">遇到什麼問題？</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={4000}
                autoFocus
                placeholder="例如：按了繼續執行沒有反應、結果內容不對、畫面跑版…"
                className="rounded-lg border border-line bg-paper px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
              />
            </label>
            {attached.length > 0 && (
              <details className="rounded-lg bg-paper p-2 text-xs text-muted">
                <summary className="cursor-pointer">會一起附上的資料（{attached.length} 項）</summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {attached.map(([k, v]) => (
                    <li key={k} className="break-all">
                      {k}：{String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 200)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={!message.trim() || state === "sending"} className="rounded-lg bg-ink py-2 font-medium text-paper disabled:opacity-40">
              {state === "sending" ? "送出中…" : "送出回報"}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
