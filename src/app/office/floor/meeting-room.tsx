"use client";

// 會議室視窗（點樓層正中間的會議室打開）。
//   1. 選擇列席：總經理一定在；各部門經理可以勾選。被勾選的人會走進會議室
//      （秘書不列席，她負責會議時程：預定的時間到了會到會議室提醒你）
//   2. 你提出想法 → 列席的主管依各自的背景發言（立場、意見、和公司目標的關係、建議）
//   3. 總經理做結論：共識與分歧、行動項目、建議怎麼修訂公司目標
//   4. 討論完可以：勾選要採用的目標修訂一鍵套用、手動修訂公司目標、把結論交辦給總經理執行
// 同一場會議可以一直接續討論（每一輪都會附上前面的發言）。
// 每一輪都會存進資料庫：「過往紀錄」分頁可以回頭看、刪除，或接續某一場舊會議。

import { useEffect, useRef, useState } from "react";
import { ReportButton } from "@/components/report-button";
import { departmentName, EXECUTIVE_ASSISTANT, GENERAL_MANAGER, managerOf, type Department } from "@/lib/company";

type Stance = "support" | "conditional" | "concern";
type Opinion = { agent: string; department: string; stance: Stance; opinion: string; alignment: string; suggestions: string[] };
type GoalChange = { type: "add" | "update" | "complete" | "remove"; goalId: string; title: string; due: string; reason: string };
type Summary = { conclusion: string; actions: { department: string; action: string }[]; goalChanges: GoalChange[]; visionChange: string };
type Entry =
  | { kind: "idea"; text: string }
  | { kind: "opinion"; opinion: Opinion }
  | { kind: "summary"; summary: Summary; round: number; applied: boolean; dispatched: boolean; missionId: string | null }
  | { kind: "error"; text: string };
type Round = { idea: string; opinions: Opinion[]; summary?: Summary; applied: boolean; dispatched: boolean; missionId: string | null; createdAt: string };
type MeetingDetail = { id: string; title: string; attendees: Attendees; createdAt: string; rounds: Round[] };
type MeetingItem = { id: string; title: string; rounds: number; applied: boolean; updatedAt: string };

// 存檔的每一輪 → 畫面上的紀錄
const toEntries = (rounds: Round[]): Entry[] =>
  rounds.flatMap((r, i): Entry[] => [
    { kind: "idea", text: r.idea },
    ...r.opinions.map((o): Entry => ({ kind: "opinion", opinion: o })),
    ...(r.summary ? [{ kind: "summary" as const, summary: r.summary, round: i, applied: r.applied, dispatched: r.dispatched, missionId: r.missionId }] : []),
  ]);
const dateText = (iso: string) => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
type Goal = { id: string; title: string; due: string; done: boolean; period?: "year" | "month" | "week" };

export type Attendees = { departments: string[]; assistant: boolean };

// 立場：圖示 + 文字 + 顏色，不只靠顏色分辨
const STANCE: Record<Stance, { label: string; className: string }> = {
  support: { label: "👍 支持", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  conditional: { label: "🤝 有條件支持", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  concern: { label: "⚠️ 有疑慮", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};
export const STANCE_SHORT: Record<Stance, string> = { support: "支持", conditional: "有條件支持", concern: "有疑慮" };
const CHANGE_LABEL: Record<GoalChange["type"], string> = { add: "新增", update: "修改", complete: "標記達成", remove: "移除" };

// 首頁展示用的會議內容
const DEMO_ENTRIES: Entry[] = [
  { kind: "idea", text: "我想在明年推出一個線上命理課程，搭配 IG 內容導流。" },
  {
    kind: "opinion",
    opinion: { agent: "media.manager", department: "media", stance: "support", opinion: "IG 已經累積命理主題的受眾，課程可以成為內容的變現出口。我們可以先用免費短影音測試需求。", alignment: "直接支持「IG 追蹤數成長到 1 萬」，也帶來新的營收目標。", suggestions: ["先做 3 支課程預告 Reels 測試互動率", "規劃課程上線前 4 週的內容日曆"] },
  },
  {
    kind: "opinion",
    opinion: { agent: "intel.manager", department: "intel", stance: "conditional", opinion: "需要先確認線上課程的市場價格帶與競品，避免定價失準。", alignment: "需要新增一個營收相關的年度目標來衡量成效。", suggestions: ["整理 5 個競品課程的價格與內容"] },
  },
  {
    kind: "summary",
    round: 0,
    applied: false,
    dispatched: false,
    missionId: null,
    summary: { conclusion: "各部門支持推出線上命理課程，但建議先做市場驗證再投入製作。社群部負責導流測試，情報部負責定價研究。", actions: [{ department: "media", action: "製作 3 支課程預告 Reels" }, { department: "intel", action: "競品價格調查" }], goalChanges: [{ type: "add", goalId: "", title: "線上命理課程上線並售出 50 份", due: "2027 Q2", reason: "把新事業方向納入年度目標" }], visionChange: "" },
  },
];

export function MeetingRoom({
  departments,
  attendees,
  onAttendees,
  topic = "",
  demo = false,
  onEnd,
  onSpeech,
  onPending,
  onOpenCompany,
  onOpenMission,
}: {
  departments: Department[];
  attendees: Attendees;
  onAttendees: (attendees: Attendees) => void;
  topic?: string; // 從預定會議開始時的主題（先填進輸入框）
  demo?: boolean;
  onEnd: () => void; //                                   散會
  onSpeech: (speech: Record<string, string>) => void; //  樓層上每位與會者頭上的發言提示
  onPending: (pending: boolean) => void; //              等待發言中（樓層上顯示思考中）
  onOpenCompany: () => void; //                          手動修訂公司目標
  onOpenMission?: (missionId: string) => void; //       交辦後打開交辦事項視窗
}) {
  const [entries, setEntries] = useState<Entry[]>(demo ? DEMO_ENTRIES : []);
  const [meetingId, setMeetingId] = useState<string | null>(null); // 這場會議存檔後的 id（接續討論用）
  const [tab, setTab] = useState<"current" | "history">("current");
  const [history, setHistory] = useState<MeetingItem[] | null>(null);
  const [viewing, setViewing] = useState<MeetingDetail | null>(null); // 正在看的舊會議
  const [idea, setIdea] = useState(topic);
  const [pending, setPending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [company, setCompany] = useState<{ vision: string; goals: Goal[] } | null>(null);
  const [companyVersion, setCompanyVersion] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nameOf = (dept: string) => departmentName(departments, dept);
  // 發言者名稱：秘書，或「某某部經理」
  const speakerOf = (o: Opinion) => (o.agent === EXECUTIVE_ASSISTANT ? "首席秘書" : `${nameOf(o.department)}經理`);

  // 打開「過往紀錄」分頁時讀取清單
  const loadHistory = () =>
    fetch("/api/meetings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setHistory(data.meetings))
      .catch(() => {});
  const openTab = (next: "current" | "history") => {
    setTab(next);
    setViewing(null);
    if (next === "history" && !demo) loadHistory();
  };
  const viewMeeting = (id: string) =>
    fetch(`/api/meetings/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setViewing(data));
  // 接續舊會議：把紀錄載入「本次會議」，同樣的人列席
  const resume = (meeting: MeetingDetail) => {
    setEntries(toEntries(meeting.rounds));
    setMeetingId(meeting.id);
    onAttendees(meeting.attendees);
    setTab("current");
    setViewing(null);
  };
  const remove = async (id: string) => {
    await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (id === meetingId) setMeetingId(null);
    setViewing(null);
    loadHistory();
  };

  // 讀取公司願景與年度目標（討論時參考；套用修訂後重新讀取）
  useEffect(() => {
    if (demo) return;
    fetch("/api/office/company")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setCompany({ vision: data.vision, goals: data.goals }))
      .catch(() => {});
  }, [demo, companyVersion]);

  // 有新發言就捲到最下面
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries, pending]);

  async function propose(event: React.FormEvent) {
    event.preventDefault();
    const text = idea.trim();
    if (!text || pending || demo) return;
    setEntries((list) => [...list, { kind: "idea", text }]);
    setIdea("");
    setPending(true);
    onPending(true);
    try {
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // 前面的發言由伺服器從存檔讀取（帶 meetingId 就是接續同一場）
        body: JSON.stringify({ meetingId, idea: text, attendees: attendees.departments, assistant: attendees.assistant }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "會議進行失敗");
      const opinions: Opinion[] = data.opinions;
      setMeetingId(data.meetingId);
      setEntries((list) => [
        ...list,
        ...opinions.map((o): Entry => ({ kind: "opinion", opinion: o })),
        { kind: "summary", summary: data.summary, round: data.round, applied: false, dispatched: false, missionId: null },
      ]);
      // 樓層上：每位經理頭上顯示自己的立場，總經理顯示「做結論」
      onSpeech({ ...Object.fromEntries(opinions.map((o) => [o.agent, STANCE_SHORT[o.stance]])), [GENERAL_MANAGER]: "結論如下" });
    } catch (error) {
      setEntries((list) => [...list, { kind: "error", text: error instanceof Error ? error.message : "會議進行失敗" }]);
    } finally {
      setPending(false);
      onPending(false);
    }
  }

  const toggleDepartment = (id: string) =>
    onAttendees({
      ...attendees,
      departments: attendees.departments.includes(id) ? attendees.departments.filter((d) => d !== id) : [...attendees.departments, id],
    });

  // 會議紀錄（本次會議、過往紀錄共用）；readOnly：過往紀錄只能看，不能套用或交辦
  const renderEntries = (list: Entry[], readOnly: boolean, id: string | null = meetingId) =>
    list.map((entry, i) => {
      if (entry.kind === "idea")
        return (
          <div key={i} className="self-end max-w-[85%] rounded-2xl bg-ink px-3 py-2 text-paper">
            <p className="mb-0.5 text-[10px] opacity-70">你提出</p>
            <p className="whitespace-pre-wrap">{entry.text}</p>
          </div>
        );
      if (entry.kind === "error")
        return (
          <p key={i} className="flex flex-wrap items-center gap-2 text-xs text-red-600 dark:text-red-400">
            ⚠ {entry.text}
            <ReportButton where="會議室" label="回報" context={{ error: entry.text, meetingId: id }} />
          </p>
        );
      if (entry.kind === "opinion") {
        const o = entry.opinion;
        return (
          <article key={i} className="rounded-xl border border-line p-3">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{speakerOf(o)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STANCE[o.stance].className}`}>{STANCE[o.stance].label}</span>
            </p>
            <p className="mt-1.5 leading-relaxed">{o.opinion}</p>
            {o.alignment && <p className="mt-1.5 text-xs text-muted">🎯 {o.alignment}</p>}
            {o.suggestions.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4 text-xs">
                {o.suggestions.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            )}
          </article>
        );
      }
      return (
        <SummaryCard
          key={`${id}-${i}`}
          summary={entry.summary}
          goals={company?.goals ?? []}
          vision={company?.vision ?? ""}
          nameOf={nameOf}
          demo={demo || readOnly}
          initialState={entry.dispatched ? "dispatched" : entry.applied ? "applied" : "idle"}
          // 套用、交辦後記在這場會議的紀錄裡
          onMark={(flags) => id && fetch(`/api/meetings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ round: entry.round, ...flags }) })}
          onApplied={() => setCompanyVersion((v) => v + 1)}
          onOpenCompany={onOpenCompany}
          missionId={entry.missionId}
          // 交辦：直接用結論建立總目標，再打開交辦事項視窗
          onDispatch={
            onOpenMission && id
              ? async () => {
                  const res = await fetch(`/api/meetings/${id}/dispatch`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ round: entry.round }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error ?? "交辦失敗，請稍後再試");
                  return data.missionId as string;
                }
              : undefined
          }
          onOpenMission={onOpenMission}
        />
      );
    });

  return (
    <aside
      aria-label="會議室"
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute inset-x-2 bottom-14 z-30 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/97 text-sm shadow-xl backdrop-blur sm:inset-x-auto sm:top-14 sm:right-3 sm:w-[440px] ${collapsed ? "" : "max-h-[75%] sm:bottom-16 sm:max-h-none"}`}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">📋 會議室</h3>
          <p className="text-xs text-muted">
            會議中・列席 {attendees.departments.length + 1} 位主管
          </p>
        </div>
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="rounded-full px-2.5 py-1 text-xs text-muted hover:bg-ink/5" aria-expanded={!collapsed}>
          {collapsed ? "展開" : "收起"}
        </button>
        <button type="button" onClick={onEnd} className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">
          散會
        </button>
      </header>

      {!collapsed && !demo && (
        <div role="tablist" aria-label="會議室分頁" className="flex gap-1 border-b border-line px-3 py-2">
          {(["current", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => openTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${tab === t ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {t === "current" ? "本次會議" : "過往紀錄"}
            </button>
          ))}
        </div>
      )}

      {!collapsed && tab === "history" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {viewing ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button type="button" onClick={() => setViewing(null)} className="text-xs text-accent hover:underline">← 回到清單</button>
                  <h4 className="mt-1 font-semibold">{viewing.title}</h4>
                  <p className="text-xs text-muted">{dateText(viewing.createdAt)}・{viewing.rounds.length} 輪討論</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => resume(viewing)} className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">接續這場會議</button>
                  <button type="button" onClick={() => remove(viewing.id)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-red-600">刪除</button>
                </div>
              </div>
              {renderEntries(toEntries(viewing.rounds), true, viewing.id)}
            </>
          ) : history === null ? (
            <p className="text-xs text-muted">讀取中…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted">還沒有會議紀錄。在「本次會議」提出想法後，每一輪討論都會自動存在這裡。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => viewMeeting(m.id)} className="w-full rounded-xl border border-line p-3 text-left hover:border-ink/30">
                    <p className="font-medium">{m.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {dateText(m.updatedAt)}・{m.rounds} 輪討論{m.applied ? "・已修訂公司目標" : ""}
                      {m.id === meetingId ? "・本次會議" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!collapsed && tab === "current" && (
        <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {/* ── 列席人員 ── */}
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-muted">列席人員（勾選的主管會走進會議室）</legend>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-ink px-2.5 py-1 text-xs text-paper">總經理（主持）</span>
                {departments.map((d) => (
                  <Chip key={d.id} checked={attendees.departments.includes(d.id)} onChange={() => toggleDepartment(d.id)} label={`${d.name}經理`} />
                ))}
              </div>
            </fieldset>

            {/* ── 公司目標（討論的參考）── */}
            {!demo && (
              <details className="rounded-xl bg-paper p-3 text-xs">
                <summary className="cursor-pointer font-semibold">公司願景與年度目標（大家發言會參考）</summary>
                <p className="mt-2">願景：{company?.vision || "還沒設定"}</p>
                {company?.goals.length ? (
                  <ul className="mt-1 list-disc pl-4">
                    {company.goals.map((g) => (
                      <li key={g.id} className={g.done ? "text-muted line-through" : ""}>
                        {g.title}
                        {g.due && `（${g.due}）`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted">還沒設定年度目標，總經理會在結論裡建議。</p>
                )}
                <button type="button" onClick={onOpenCompany} className="mt-2 text-accent hover:underline">手動修訂公司目標 →</button>
              </details>
            )}

            {entries.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-muted">
                在下面說出你的想法，例如新事業、新產品、要不要投入某個方向。列席的部門經理會從各自的專業提出意見，總經理做結論，並建議怎麼調整公司目標。
              </p>
            )}

            {/* ── 會議紀錄 ── */}
            {renderEntries(entries, false)}
            {pending && <p className="text-xs text-muted">各部門經理正在發言，總經理整理結論中…（約 20 到 60 秒）</p>}
          </div>

          {/* ── 提出想法 ── */}
          <form onSubmit={propose} className="flex flex-col gap-2 border-t border-line p-3">
            <label htmlFor="meeting-idea" className="sr-only">提出你的想法</label>
            <textarea
              id="meeting-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                // Enter 送出、Shift+Enter 換行（輸入法選字中不送出）
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) propose(e);
              }}
              rows={2}
              maxLength={2000}
              disabled={demo || pending}
              placeholder={demo ? "註冊後就能召開真正的會議" : entries.length ? "接續討論，或提出新的想法…" : "提出你的想法…（Enter 送出，Shift+Enter 換行）"}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60 sm:text-sm"
            />
            <button
              type="submit"
              disabled={demo || pending || !idea.trim() || attendees.departments.length === 0}
              className="self-end rounded-lg bg-ink px-4 py-1.5 text-xs font-medium text-paper disabled:opacity-40"
            >
              {attendees.departments.length === 0 ? "請先勾選列席部門" : pending ? "討論中…" : "提出討論"}
            </button>
          </form>
        </>
      )}
    </aside>
  );
}

function Chip({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition ${checked ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      {checked ? "✓ " : ""}
      {label}
    </label>
  );
}

// 總經理的會議結論：行動項目、建議的目標修訂（勾選後一鍵套用）、交辦給總經理
function SummaryCard({
  summary, goals, vision, nameOf, demo, initialState, onMark, onApplied, onOpenCompany, missionId: savedMissionId, onDispatch, onOpenMission,
}: {
  summary: Summary;
  initialState: "idle" | "applied" | "dispatched";
  onMark: (flags: { applied?: boolean; dispatched?: boolean }) => void;
  goals: Goal[];
  vision: string;
  nameOf: (dept: string) => string;
  demo: boolean;
  onApplied: () => void;
  onOpenCompany: () => void;
  missionId: string | null; //                      這一輪交辦後建立的總目標
  onDispatch?: () => Promise<string>; //             交辦，回傳新的總目標 id
  onOpenMission?: (missionId: string) => void;
}) {
  const changes = summary.goalChanges;
  const [picked, setPicked] = useState<boolean[]>(() => changes.map(() => true));
  const [pickVision, setPickVision] = useState(Boolean(summary.visionChange));
  const [state, setState] = useState<"idle" | "saving" | "applied" | "dispatched">(initialState);
  const hasRevision = changes.length > 0 || Boolean(summary.visionChange);
  const [missionId, setMissionId] = useState(savedMissionId);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  async function apply() {
    setState("saving");
    // 從目前的目標開始，依勾選的建議逐條修改
    let next = [...goals];
    changes.forEach((c, i) => {
      if (!picked[i]) return;
      if (c.type === "add") next.push({ id: crypto.randomUUID(), title: c.title, due: c.due, done: false, period: "year" });
      if (c.type === "update") next = next.map((g) => (g.id === c.goalId ? { ...g, title: c.title, due: c.due || g.due } : g));
      if (c.type === "complete") next = next.map((g) => (g.id === c.goalId ? { ...g, done: true } : g));
      if (c.type === "remove") next = next.filter((g) => g.id !== c.goalId);
    });
    await fetch("/api/office/company", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goals: next.slice(0, 36), ...(pickVision && summary.visionChange ? { vision: summary.visionChange } : {}) }),
    });
    setState("applied");
    onMark({ applied: true });
    onApplied();
  }

  async function dispatch() {
    if (!onDispatch) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      const id = await onDispatch();
      setMissionId(id);
      onOpenMission?.(id);
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : "交辦失敗，請稍後再試");
    }
    setDispatching(false);
  }

  return (
    <article className="rounded-xl border-2 border-accent/40 bg-accent-soft/30 p-3">
      <p className="font-medium">總經理・會議結論</p>
      <p className="mt-1.5 leading-relaxed">{summary.conclusion}</p>

      {summary.actions.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold text-muted">行動項目</p>
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {summary.actions.map((a, i) => (
              <li key={i}>
                <span className="font-medium">{nameOf(a.department)}</span>：{a.action}
              </li>
            ))}
          </ul>
        </>
      )}

      {hasRevision && (
        <div className="mt-3 rounded-lg bg-surface p-2.5">
          <p className="text-xs font-semibold">建議修訂公司目標</p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-xs">
            {summary.visionChange && (
              <li>
                <label className="flex gap-2">
                  <input type="checkbox" checked={pickVision} disabled={demo || state !== "idle"} onChange={() => setPickVision((v) => !v)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">修改願景</span>：{summary.visionChange}
                    {vision && <span className="block text-muted">原本：{vision}</span>}
                  </span>
                </label>
              </li>
            )}
            {changes.map((c, i) => {
              const original = goals.find((g) => g.id === c.goalId);
              return (
                <li key={i}>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={picked[i]}
                      disabled={demo || state !== "idle"}
                      onChange={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{CHANGE_LABEL[c.type]}</span>：{c.title}
                      {c.due && `（${c.due}）`}
                      {original && c.type === "update" && <span className="block text-muted">原本：{original.title}</span>}
                      <span className="block text-muted">{c.reason}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 已交辦：過往紀錄裡也可以打開交辦事項視窗 */}
      {missionId && onOpenMission && (
        <button
          type="button"
          onClick={() => onOpenMission(missionId)}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-accent/40 bg-surface px-3 py-2 text-left text-xs hover:bg-accent-soft"
        >
          <span>
            <span className="font-medium">📋 已交辦總經理</span>
            <span className="block text-muted">查看交辦事項的分工與進度</span>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}
      {dispatchError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{dispatchError}</p>}

      {!demo && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasRevision && (
            <button
              type="button"
              onClick={apply}
              disabled={state !== "idle" || (!picked.some(Boolean) && !pickVision)}
              className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-40"
            >
              {state === "saving" ? "更新中…" : state === "applied" ? "✓ 已更新公司目標" : "套用勾選的修訂"}
            </button>
          )}
          <button type="button" onClick={onOpenCompany} className="rounded-full border border-line px-3 py-1.5 text-xs hover:bg-ink/5">
            手動修訂公司目標
          </button>
          {onDispatch && !missionId && summary.actions.length > 0 && (
            <button type="button" onClick={dispatch} disabled={dispatching || state === "dispatched"} className="rounded-full border border-line px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-40">
              {dispatching ? "交辦中…" : state === "dispatched" ? "✓ 已交辦總經理" : "把結論交辦給總經理"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

// 與會者的 Agent 身分：老闆、總經理、（秘書）、勾選的部門經理
export function attendeeAgents(attendees: Attendees, user: string): string[] {
  return [user, GENERAL_MANAGER, ...(attendees.assistant ? [EXECUTIVE_ASSISTANT] : []), ...attendees.departments.map(managerOf)];
}
