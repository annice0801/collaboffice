"use client";

// 點辦公室裡的老闆（你自己）後出現的「公司總覽」面板。
// 內容由上到下：
//   公司願景（可以編輯）
//   年度目標（可以新增、打勾完成、刪除）
//   營運數字：總目標、完成、進行中、成員、平均完成天數…
//   工作趨勢：近 8 週每週完成的任務數（長條圖，滑過顯示數字）
//   未來走勢：照目前速度，待辦多久做完；每個進行中的總目標預估幾天後完成
//   各部門負載：每個部門手上還有幾項待辦
//   未來預計製作：秘書、總經理那邊記下的待辦構想
// 資料來源：GET /api/office/company（每 10 秒更新）；編輯願景、目標用 PATCH 存回去。

import { useEffect, useState } from "react";
import { BOSS_GENDER_LABELS, BOSS_GENDERS, type BossGender } from "@/lib/company";

type Period = "year" | "month" | "week";
type Goal = { id: string; title: string; due: string; done: boolean; period?: Period };
const PERIODS: { id: Period; name: string; placeholder: string }[] = [
  { id: "year", name: "年度目標", placeholder: "例如：IG 追蹤數成長到 1 萬" },
  { id: "month", name: "本月目標", placeholder: "例如：本月產出 12 篇貼文" },
  { id: "week", name: "本週目標", placeholder: "例如：這週整理 3 則市場快訊" },
];
type Plan = { id: string; title: string; detail: string; agent: string; createdAt: string };
export type CompanyData = {
  companyName: string;
  vision: string;
  goals: Goal[];
  plans: Plan[];
  stats: {
    missions: number;
    completed: number;
    open: number;
    failed: number;
    members: number;
    departments: number;
    openTasks: number;
    approvedTasks: number;
    avgDays: number | null;
  };
  weekly: { start: string; done: number }[];
  projection: { perWeek: number; openTasks: number; weeksToClear: number | null };
  forecasts: { id: string; title: string; status: string; progress: number; etaDays: number | null }[];
  departments: { id: string; name: string; open: number; done: number }[];
};

const AGENT_NAMES: Record<string, string> = { executive_assistant: "秘書", general_manager: "總經理" };
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function CompanyPanel({
  userName,
  bossGender,
  onBossGenderChange,
  demoData,
  onClose,
  onOpenMission,
}: {
  userName: string;
  bossGender: BossGender;
  onBossGenderChange?: (gender: BossGender) => void; // 改你的人物（性別）
  demoData?: CompanyData; // 首頁展示用的假資料（有傳就不呼叫 API，也不能編輯）
  onClose: () => void;
  onOpenMission?: (missionId: string) => void;
}) {
  const [fetched, setFetched] = useState<CompanyData | null>(null);
  const [version, setVersion] = useState(0); // 改了資料就 +1，觸發重新讀取
  const data = demoData ?? fetched;
  const editable = !demoData;

  useEffect(() => {
    if (demoData) return;
    let cancelled = false;
    const load = () =>
      fetch("/api/office/company")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => !cancelled && json && setFetched(json))
        .catch(() => {});
    load();
    const timer = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [demoData, version]);

  // 存回願景或年度目標，先改畫面（感覺比較快），存完再重新讀取
  const save = async (update: Partial<Pick<CompanyData, "vision" | "goals">>) => {
    if (!editable || !fetched) return;
    setFetched({ ...fetched, ...update });
    await fetch("/api/office/company", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update) });
    setVersion((v) => v + 1);
  };

  return (
    <aside
      aria-label="公司總覽"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute inset-x-2 bottom-14 z-30 flex max-h-[70%] flex-col overflow-hidden rounded-2xl border border-line bg-surface/97 text-sm shadow-xl backdrop-blur sm:inset-x-auto sm:top-14 sm:bottom-16 sm:left-3 sm:max-h-none sm:w-[400px]"
    >
      <header className="flex items-start gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="rounded-full bg-[#c9a227] px-2 py-0.5 text-[10px] font-semibold text-[#2b1b12]">老闆</span>
            <span className="text-xs text-muted">{userName}</span>
          </p>
          <h3 className="mt-1 text-base font-semibold">{data?.companyName ?? "公司總覽"}</h3>
          <p className="text-xs text-muted">公司目標、營運狀況與未來走勢</p>
        </div>
        <button type="button" onClick={onClose} className="-mt-1 -mr-1 rounded-full px-2 text-lg text-muted hover:bg-ink/5" aria-label="關閉">
          ×
        </button>
      </header>

      {!data ? (
        <p className="p-4 text-xs text-muted">讀取中…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Vision vision={data.vision} editable={editable} onSave={(vision) => save({ vision })} />
          {PERIODS.map((p) => (
            <Goals key={p.id} period={p} goals={data.goals} editable={editable} onSave={(goals) => save({ goals })} />
          ))}

          {/* ── 營運數字 ── */}
          <Section title="營運數字">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="總目標" value={data.stats.missions} />
              <Stat label="已完成" value={data.stats.completed} />
              <Stat label="進行中" value={data.stats.open} />
              <Stat label="完成率" value={data.stats.missions ? `${Math.round((data.stats.completed / data.stats.missions) * 100)}%` : "—"} />
              <Stat label="平均完成" value={data.stats.avgDays === null ? "—" : `${data.stats.avgDays} 天`} />
              <Stat label="AI 成員" value={data.stats.members} />
            </div>
          </Section>

          <Section title="工作趨勢：近 8 週完成的任務">
            <WeeklyBars weekly={data.weekly} />
          </Section>

          {/* ── 未來走勢 ── */}
          <Section title="未來走勢">
            <p className="leading-relaxed">
              {data.projection.openTasks === 0
                ? "目前沒有待辦任務，團隊隨時可以接新的交辦。"
                : data.projection.weeksToClear === null
                  ? `目前有 ${data.projection.openTasks} 項待辦。近 4 週還沒有完成紀錄，等有了完成速度就能推估。`
                  : `照近 4 週的速度（每週完成約 ${data.projection.perWeek} 項），目前 ${data.projection.openTasks} 項待辦預計 ${data.projection.weeksToClear} 週內完成。`}
            </p>
            {data.forecasts.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2.5">
                {data.forecasts.map((f) => (
                  <li key={f.id}>
                    <p className="flex items-baseline justify-between gap-2">
                      {onOpenMission && f.id ? (
                        <button type="button" onClick={() => onOpenMission(f.id)} className="min-w-0 truncate text-left hover:underline">
                          {f.title}
                        </button>
                      ) : (
                        <span className="min-w-0 truncate">{f.title}</span>
                      )}
                      <span className="shrink-0 text-xs text-muted">{f.etaDays === null ? "尚未開始" : `預估 ${f.etaDays} 天後完成`}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${f.progress}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums text-muted">{f.progress}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── 各部門負載：待辦越多條越長 ── */}
          <Section title="各部門負載（待辦／已完成的任務）">
            <ul className="flex flex-col gap-2">
              {data.departments.map((d) => {
                const max = Math.max(1, ...data.departments.map((x) => x.open));
                return (
                  <li key={d.id} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                    <span className="truncate">{d.name}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(d.open / max) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-muted">
                      {d.open}／{d.done}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ── 你的人物 ── */}
          {onBossGenderChange && (
            <Section title="你在辦公室裡的人物">
              <div className="flex gap-1.5">
                {BOSS_GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={bossGender === g}
                    onClick={() => onBossGenderChange(g)}
                    className={`rounded-full border px-3 py-1 text-xs ${bossGender === g ? "border-ink bg-ink text-paper" : "border-line hover:border-ink/40"}`}
                  >
                    {BOSS_GENDER_LABELS[g]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">穿搭跟著辦公室風格：經典商務是西裝，科技園區是高領毛衣配牛仔褲。</p>
            </Section>
          )}

          {/* ── 未來預計製作 ── */}
          <Section title="未來預計製作">
            {data.plans.length === 0 ? (
              <p className="text-xs text-muted">還沒有記下的構想。點秘書或總經理的名牌，可以把之後想做的事先記下來。</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.plans.map((p) => (
                  <li key={p.id} className="rounded-xl bg-paper p-2.5">
                    <p className="flex justify-between gap-2">
                      <span className="font-medium">{p.title}</span>
                      <span className="shrink-0 text-xs text-muted">交給{AGENT_NAMES[p.agent] ?? p.agent}</span>
                    </p>
                    {p.detail && <p className="mt-1 line-clamp-2 text-xs text-muted">{p.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </aside>
  );
}

// 公司願景：一段話，點「編輯」可以修改
function Vision({ vision, editable, onSave }: { vision: string; editable: boolean; onSave: (vision: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Section
      title="公司願景"
      action={editable && draft === null ? <button type="button" onClick={() => setDraft(vision)} className="text-xs text-accent hover:underline">編輯</button> : undefined}
    >
      {draft === null ? (
        <p className={`leading-relaxed ${vision ? "" : "text-xs text-muted"}`}>{vision || "還沒寫下公司願景。寫下你希望公司成為什麼樣子，總經理規劃時可以參考。"}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft.trim());
            setDraft(null);
          }}
        >
          <label htmlFor="vision-input" className="sr-only">公司願景</label>
          <textarea
            id="vision-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={300}
            rows={3}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
            placeholder="例如：用 AI 團隊，讓一個人也能經營多個事業"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1 text-xs text-muted hover:bg-ink/5">取消</button>
            <button type="submit" className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-paper">儲存</button>
          </div>
        </form>
      )}
    </Section>
  );
}

// 公司目標（年度／本月／本週各一區）：打勾完成、新增、刪除，每次改動都整份存回去
function Goals({ period, goals: all, editable, onSave }: { period: (typeof PERIODS)[number]; goals: Goal[]; editable: boolean; onSave: (goals: Goal[]) => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const goals = all.filter((g) => (g.period ?? "year") === period.id);
  const done = goals.filter((g) => g.done).length;

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave([...all, { id: crypto.randomUUID(), title: title.trim(), due: due.trim(), done: false, period: period.id }]);
    setTitle("");
    setDue("");
  }

  return (
    <Section title={`${period.name}${goals.length ? `（完成 ${done}／${goals.length}）` : ""}`}>
      {goals.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {goals.map((g) => (
            <li key={g.id} className="group flex items-start gap-2">
              <input
                type="checkbox"
                checked={g.done}
                disabled={!editable}
                onChange={() => onSave(all.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)))}
                className="mt-0.5 size-4 accent-[var(--accent)]"
                aria-label={`${g.title}：${g.done ? "已完成" : "未完成"}`}
              />
              <span className={`min-w-0 flex-1 ${g.done ? "text-muted line-through" : ""}`}>
                {g.title}
                {g.due && <span className="ml-1.5 text-xs text-muted">{g.due}</span>}
              </span>
              {editable && (
                <button
                  type="button"
                  onClick={() => onSave(all.filter((x) => x.id !== g.id))}
                  className="text-xs text-muted opacity-60 hover:text-red-600 hover:opacity-100"
                  aria-label={`刪除目標「${g.title}」`}
                >
                  刪除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!goals.length && !editable && <p className="text-xs text-muted">還沒設定</p>}
      {editable && all.length < 36 && (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <label htmlFor={`goal-title-${period.id}`} className="sr-only">新的{period.name}</label>
          <input
            id={`goal-title-${period.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder={goals.length ? `新增${period.name}` : period.placeholder}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          <label htmlFor={`goal-due-${period.id}`} className="sr-only">預計達成時間</label>
          <input
            id={`goal-due-${period.id}`}
            value={due}
            onChange={(e) => setDue(e.target.value)}
            maxLength={20}
            placeholder="期限"
            className="w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          <button type="submit" disabled={!title.trim()} className="rounded-lg bg-ink px-3 text-xs font-medium text-paper disabled:opacity-40">
            新增
          </button>
        </form>
      )}
    </Section>
  );
}

// 近 8 週完成數的長條圖：單一系列、一個顏色；滑過（或點）長條顯示數字，最新一週直接標數字
function WeeklyBars({ weekly }: { weekly: CompanyData["weekly"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weekly.map((w) => w.done));
  const total = weekly.reduce((sum, w) => sum + w.done, 0);
  const shown = hover ?? weekly.length - 1;
  return (
    <figure>
      <figcaption className="mb-2 flex justify-between text-xs text-muted">
        <span>
          {shortDate(weekly[shown].start)} 起的一週：<span className="font-semibold text-ink">{weekly[shown].done} 項</span>
        </span>
        <span>8 週共 {total} 項</span>
      </figcaption>
      <div className="flex h-24 items-end gap-1.5 border-b border-line" role="img" aria-label={`近 8 週完成任務數：${weekly.map((w) => w.done).join("、")}`}>
        {weekly.map((w, i) => (
          <button
            key={w.start}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="flex h-full flex-1 items-end"
            aria-label={`${shortDate(w.start)} 起的一週完成 ${w.done} 項`}
          >
            <span
              className={`w-full rounded-t-[4px] bg-accent transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}
              style={{ height: `${Math.max(w.done ? 6 : 2, (w.done / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted">
        {weekly.map((w, i) => (
          <span key={w.start} className="flex-1 text-center tabular-nums">
            {i % 2 === 1 || i === weekly.length - 1 ? shortDate(w.start) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 flex items-center justify-between border-b border-line pb-1 text-xs font-semibold tracking-wide text-muted">
        {title}
        {action}
      </h4>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-paper px-1 py-2">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
