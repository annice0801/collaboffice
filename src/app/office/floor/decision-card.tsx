"use client";

// 「需要你決定」卡片：遇到的困難、可選的方案與各方案的結果，選一個下達決定。
// 點頭上有 ❗ 的人、或打開交辦事項視窗時都會看到。

import { useState } from "react";

export type DecisionOption = { id: string; label: string; outcome: string; needsNote: boolean };
export type PendingDecision = {
  id: string;
  missionId: string;
  kind: string;
  blocking: boolean;
  title: string;
  situation: string;
  options: DecisionOption[];
};

export function DecisionCard({ decision, onDecided }: { decision: PendingDecision; onDecided: () => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const picked = decision.options.find((o) => o.id === choice);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!choice) return;
    setState("sending");
    setError(null);
    const res = await fetch(`/api/decisions/${decision.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice, note }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "送出失敗");
      setState("idle");
      return;
    }
    setState("done");
    onDecided();
  }

  if (state === "done") {
    return <p className="rounded-xl bg-accent-soft p-3 text-xs text-accent">✓ 已下達決定：{picked?.label}。團隊會依你的決定接著處理。</p>;
  }

  return (
    <form onSubmit={submit} className="rounded-xl border-2 border-amber-400/70 bg-amber-50 p-3 dark:bg-amber-950/30">
      <p className="flex items-start gap-1.5 font-medium">
        <span aria-hidden="true">❗</span>
        <span>{decision.title}</span>
      </p>
      {decision.blocking && <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">這部分工作暫停中，等你決定後才會繼續</p>}
      <p className="mt-2 text-xs font-semibold text-muted">遇到的困難</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed">{decision.situation}</p>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-muted">可以怎麼處理</legend>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {decision.options.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-xs transition ${choice === o.id ? "border-ink bg-surface" : "border-line bg-surface/60 hover:border-ink/40"}`}
            >
              <input type="radio" name={`decision-${decision.id}`} value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="mt-0.5" />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-muted">→ {o.outcome}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {picked && (
        <label className="mt-2 flex flex-col gap-1 text-xs">
          <span className="font-medium">{picked.needsNote ? (picked.id === "provide" ? "請提供資料" : "補充說明（給接手的人參考）") : "補充說明（選填）"}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={picked.needsNote ? 3 : 2}
            maxLength={4000}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm"
            placeholder={picked.id === "provide" ? "貼上你有的資料，例如數字、來源網址、文件內容" : "例如：語氣改得更口語，數據請註明來源"}
          />
        </label>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={!choice || state === "sending" || (picked?.id === "provide" && !note.trim())}
        className="mt-3 w-full rounded-lg bg-ink py-1.5 text-xs font-medium text-paper disabled:opacity-40"
      >
        {state === "sending" ? "送出中…" : "下達決定"}
      </button>
    </form>
  );
}
