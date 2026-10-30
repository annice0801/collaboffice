"use client";

// 浮在立體辦公室上方的 HTML 元件：
//   RetroDialog：寶可夢風格的對話框，出現在人物頭上，可以直接輸入回覆
//   RoomPanel：點辦公區後出現的資訊面板（待辦、已完成、規劃完成進度）
// 用 HTML 而不是畫在 SVG 裡，是因為要放輸入框、要能捲動長文字。

import { useEffect, useRef, useState } from "react";

// ── 打字機效果：文字一個字一個字出現 ──
function useTypewriter(text: string, speed = 32) {
  const [shown, setShown] = useState(0);
  const [lastText, setLastText] = useState(text);
  // 換了新的文字就從頭開始打
  if (text !== lastText) {
    setLastText(text);
    setShown(0);
  }
  useEffect(() => {
    if (shown >= text.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), speed);
    return () => clearTimeout(timer);
  }, [shown, text, speed]);
  return { visible: text.slice(0, shown), done: shown >= text.length, skip: () => setShown(text.length) };
}

// ── 寶可夢風格對話框 ─────────────────────────────────
export function RetroDialog({
  x,
  y,
  docked = false,
  name,
  text,
  pending,
  onSend,
  onClose,
  onHistory,
}: {
  x: number; // 人物頭頂在畫面上的位置（像素）
  y: number;
  docked?: boolean; // 手機：不浮在人物頭上，改放在畫面底部（像寶可夢的對話框）
  name: string;
  text: string;
  pending: boolean; // 等待回覆中
  onSend?: (message: string) => void; // 沒傳的話只顯示、不能輸入（首頁展示用）
  onClose?: () => void;
  onHistory?: () => void; // 打開完整的對話紀錄
}) {
  const shownText = pending ? "……" : text;
  const { visible, done, skip } = useTypewriter(shownText);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 文字打完、可以回覆時，自動把游標放進輸入框
  useEffect(() => {
    if (done && !pending && onSend) inputRef.current?.focus({ preventScroll: true });
  }, [done, pending, onSend]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending || !onSend) return;
    onSend(message);
    setInput("");
  }

  return (
    <div
      className={docked ? "absolute inset-x-2 bottom-14 z-20" : "pointer-events-auto absolute z-20 w-[min(340px,calc(100%-24px))] -translate-x-1/2 -translate-y-full"}
      style={docked ? undefined : { left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()} // 在對話框上操作時，不要拖動樓層
      onKeyDown={(e) => e.key === "Escape" && onClose?.()}
    >
      <div className="retro-box relative px-4 pt-3 pb-3">
        {/* 名字牌：貼在對話框左上角 */}
        <span className="retro-box absolute -top-4 left-3 px-2 py-0.5 text-xs">{name}</span>
        <div className="absolute top-1 right-2 flex items-center gap-2 text-sm text-[#606060]">
          {onHistory && (
            <button type="button" onClick={onHistory} className="text-xs underline-offset-2 hover:text-black hover:underline">
              紀錄
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="hover:text-black" aria-label="關閉對話">
              ×
            </button>
          )}
        </div>
        {/* 點文字可以跳過打字動畫 */}
        <p onClick={skip} className="mt-1 max-h-[min(10rem,30dvh)] min-h-12 cursor-pointer overflow-y-auto whitespace-pre-wrap pr-3 text-[15px] leading-relaxed" aria-live="polite">
          {visible}
          {done && !pending && !onSend && <span className="retro-blink ml-1">▼</span>}
        </p>
        {onSend && (
          <form onSubmit={submit} className="mt-2 flex items-center gap-2 border-t-2 border-dashed border-[#c8c8c0] pt-2">
            <span aria-hidden="true" className={done && !pending ? "retro-blink" : "opacity-30"}>▶</span>
            <label htmlFor="retro-input" className="sr-only">回覆{name}</label>
            <input
              id="retro-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pending}
              placeholder={pending ? `${name}思考中…` : "輸入回覆，按 Enter 送出"}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#a0a098] focus-visible:outline-none"
            />
          </form>
        )}
      </div>
      {/* 對話框的小尾巴，指向說話的人（放在樓層下方時不需要） */}
      {!docked && <div className="mx-auto -mt-[2px] h-0 w-0 border-x-[9px] border-t-[11px] border-x-transparent border-t-[#303030]" />}
    </div>
  );
}

// ── 辦公區資訊面板 ───────────────────────────────────
export type RoomTask = { title: string; mission: string; status: string; progress: number };
export type RoomInfo = { todo: RoomTask[]; done: RoomTask[]; progress: number };
export type MissionItem = { title: string; status: string; progress: number };

const STATUS_TEXT: Record<string, string> = {
  pending: "等待開始",
  planning: "拆解中",
  in_progress: "進行中",
  submitted: "待驗收",
  revision: "修改中",
  approved: "已完成",
  completed: "已完成",
  failed: "未完成",
};

function Bar({ value, color = "#4285f4" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-sm border border-[#303030] bg-white">
      <div className="h-full" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export function RoomPanel({
  title,
  subtitle,
  info,
  missions,
  people,
  onClose,
}: {
  title: string;
  subtitle?: string;
  info?: RoomInfo; //          部門的待辦與已完成
  missions?: MissionItem[]; // 交辦清單（老闆、總經理、會議室白板）
  people?: string[]; //        目前在這個空間的人（休憩空間用）
  onClose: () => void;
}) {
  return (
    <aside
      className="retro-box absolute inset-x-3 bottom-14 z-10 max-h-[70%] overflow-y-auto p-4 sm:inset-x-auto sm:top-14 sm:right-3 sm:bottom-auto sm:w-80"
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`${title}資訊`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-[#606060]">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="-mt-1 px-1 text-[#606060] hover:text-black" aria-label="關閉">
          ×
        </button>
      </div>

      {info && (
        <>
          <div className="mt-3">
            <p className="flex justify-between text-sm">
              <span>規劃完成進度</span>
              <span>{info.progress}%</span>
            </p>
            <div className="mt-1">
              <Bar value={info.progress} color="#34a853" />
            </div>
          </div>
          <Section label={`待辦（${info.todo.length}）`} empty="目前沒有待辦事項">
            {info.todo.map((t, i) => (
              <li key={i}>
                <p className="text-sm">▸ {t.title}</p>
                <p className="mt-0.5 text-[11px] text-[#606060]">{t.mission}・{STATUS_TEXT[t.status] ?? t.status}</p>
                <div className="mt-1">
                  <Bar value={t.progress} />
                </div>
              </li>
            ))}
          </Section>
          <Section label={`已完成（${info.done.length}）`} empty="還沒有完成的事項">
            {info.done.map((t, i) => (
              <li key={i} className="text-sm">
                {t.status === "failed" ? "✕" : "✓"} {t.title}
                <span className="block text-[11px] text-[#606060]">{t.mission}</span>
              </li>
            ))}
          </Section>
        </>
      )}

      {missions && (
        <Section label="交辦進度" empty="目前沒有交辦事項">
          {missions.map((m, i) => (
            <li key={i}>
              <p className="flex justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">▸ {m.title}</span>
                <span className="shrink-0">{m.progress}%</span>
              </p>
              <p className="text-[11px] text-[#606060]">{STATUS_TEXT[m.status] ?? m.status}</p>
              <div className="mt-1">
                <Bar value={m.progress} color={m.status === "completed" ? "#34a853" : m.status === "failed" ? "#ea4335" : "#4285f4"} />
              </div>
            </li>
          ))}
        </Section>
      )}

      {people && (
        <Section label="現在在這裡的人" empty="目前沒有人">
          {people.map((p) => (
            <li key={p} className="text-sm">▸ {p}</li>
          ))}
        </Section>
      )}
    </aside>
  );
}

function Section({ label, empty, children }: { label: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-4">
      <h4 className="border-b-2 border-dashed border-[#c8c8c0] pb-1 text-sm">{label}</h4>
      {children.length ? <ul className="mt-2 flex flex-col gap-2.5">{children}</ul> : <p className="mt-2 text-xs text-[#808080]">{empty}</p>}
    </section>
  );
}
