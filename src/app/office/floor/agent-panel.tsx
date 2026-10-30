"use client";

// 點辦公室裡的人物（或他桌上的名牌）後出現的「員工詳細資訊」面板。
// 內容由上到下：
//   人物、職稱、職級、部門
//   ❗ 需要你決定（這個人遇到的困難、方案、各方案的結果，可以直接下達決定）
//   ⏰ 會議提醒與會議時程（秘書）：預定的會議時間到了可以直接開會；也可以新增、取消預定會議
//   現在的狀態與位置、工作膠囊（階段 + 進度）
//   快捷按鈕：跟他對話（秘書、總經理）、查看他手上這項交辦
//   目前工作：每一項的進度、退回次數、最新審閱意見、工作說明與驗收標準
//            （秘書、總經理叫「目前交辦事項」，列的是總目標）
//   未來預計製作（秘書、總經理）：已排進流程還沒開始的事、你記下的構想（可新增、一鍵交辦、刪除）
//   背景與專長（主管）：經歷、專長、審查重點、說話風格——開會、對話、審查都依這個背景（可以編輯）
//   職責、在交辦流程中負責的步驟、組織關係（直屬主管、帶領誰、使用的 AI 模型）
//   工作統計、最近完成、最近動態
// 資料來源：員工檔案（lib/agent-profile.ts，不用查資料庫）＋ /api/office/agents/<agent>（每 5 秒更新）

import { useEffect, useState } from "react";
import { agentProfile, hasTasks } from "@/lib/agent-profile";
import {
  DEFAULT_EXECUTIVE_PERSONAS,
  EXECUTIVE_ASSISTANT,
  GENERAL_MANAGER,
  getDepartment,
  managerOf,
  managerPersonaOf,
  type Department,
  type Persona,
} from "@/lib/company";
import { Character } from "./character";
import { DecisionCard, type PendingDecision } from "./decision-card";

// 秘書管理的預定會議
export type Schedule = { id: string; title: string; at: string; departments: string[]; note: string; status: "upcoming" | "started" | "cancelled" };

export type Work = { phase: string; progress: number; title: string; mission: string };

type CurrentTask = {
  id: string;
  missionId: string;
  title: string;
  mission: string;
  instructions: string;
  acceptanceCriteria: string[];
  status: string;
  progress: number;
  revisionCount: number;
  maxRevisions: number;
  lastReview?: string | null;
};
type RecentTask = { missionId: string; title: string; mission: string; status: string; completedAt: string | null; comments: string | null };
type Stats = { total: number; open: number; approved: number; failed: number; firstPass: number | null; revisions: number | null; outputChars: number | null };
type FuturePlan = { id: string; title: string; detail: string; agent: string; createdAt: string };
export type AgentDetail = {
  current: CurrentTask[];
  plans?: FuturePlan[]; //                         你記下、之後要交辦的事（秘書、總經理）
  upcoming?: { title: string; note: string }[]; //  已排進流程、還沒開始的工作（總經理）
  persona?: Persona | null; //                     主管的背景（員工是 null）
  webSearch?: boolean; //                           部門有沒有開放網路搜尋（部門成員）
  decisions?: PendingDecision[]; //                 這個人提出、等你決定的事
  recent: RecentTask[];
  stats: Stats;
  activities: { message: string; type: string; createdAt: string }[];
};

// 工作膠囊的顏色：依階段分組
export function phaseColor(phase: string | null): string {
  if (!phase) return "#9aa0a6";
  if (/審閱|驗收/.test(phase)) return "#a142f4";
  if (/修改/.test(phase)) return "#f29900";
  if (/待開始|分派/.test(phase)) return "#12b5cb";
  if (/暫停|休息|待命/.test(phase)) return "#9aa0a6";
  if (/開會/.test(phase)) return "#1a73e8";
  return "#4285f4"; // 執行中、帶隊執行、拆解中
}

const STATUS_TEXT: Record<string, string> = {
  pending: "等待開始",
  planning: "拆解中",
  in_progress: "執行中",
  reviewing: "驗收中",
  submitted: "待審閱",
  revision: "退回修改",
  approved: "通過",
  completed: "已完成",
  failed: "未完成",
};

const timeText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function AgentPanel({
  agent,
  departments,
  shirt,
  state,
  place,
  work,
  lastActiveMinutes,
  demoDetail,
  onClose,
  onTalk,
  onOpenMission,
  onDispatch,
  onDecided,
  reminder,
  onStartMeeting,
}: {
  agent: string;
  departments: Department[];
  shirt?: string;
  state: string; //          現在在做什麼（例如「工作中」「在溜滑梯」）
  place?: string; //         在哪裡（定點的說明）
  work: Work | null; //      工作膠囊
  lastActiveMinutes: number | null;
  demoDetail?: AgentDetail; // 首頁展示用的假資料（有傳就不呼叫 API）
  onClose: () => void;
  onTalk?: () => void;
  onOpenMission?: (missionId: string) => void;
  onDispatch?: (message: string) => void; // 把預計製作的事交辦給這位主管（送出對話）
  onDecided?: () => void; //                  下達決定後（樓層重新讀取狀態，❗ 消失）
  reminder?: Schedule | null; //              時間到了的預定會議（秘書的資訊卡顯示）
  onStartMeeting?: (schedule: Schedule) => void;
}) {
  const profile = agentProfile(agent, departments);
  const [fetched, setFetched] = useState<{ agent: string; detail: AgentDetail } | null>(null);
  const [version, setVersion] = useState(0); // 新增、刪除預計製作後 +1，觸發重新讀取
  const detail = demoDetail ?? (fetched?.agent === agent ? fetched.detail : null);

  // 打開時讀取工作詳情，之後每 5 秒更新
  useEffect(() => {
    if (demoDetail || !hasTasks(agent)) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/office/agents/${agent}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => !cancelled && data && setFetched({ agent, detail: data }))
        .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agent, demoDetail, version]);

  if (!profile) return null;
  const isGm = agent === GENERAL_MANAGER;
  const isExecutive = isGm || agent === EXECUTIVE_ASSISTANT;
  const color = phaseColor(work?.phase ?? null);
  const firstOpen = detail?.current[0];

  return (
    <aside
      aria-label={`${profile.title}的詳細資訊`}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute inset-x-2 bottom-14 z-30 flex max-h-[70%] flex-col overflow-hidden rounded-2xl border border-line bg-surface/97 text-sm shadow-xl backdrop-blur sm:inset-x-auto sm:top-14 sm:bottom-16 sm:left-3 sm:max-h-none sm:w-[380px]"
    >
      {/* ── 標頭：人物、職稱、部門 ── */}
      <header className="flex items-start gap-3 border-b border-line p-4">
        <svg viewBox="-18 -58 36 62" className="size-14 shrink-0 rounded-xl bg-paper" aria-hidden="true">
          <Character agent={agent} pose="stand" shirt={shirt} />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] text-paper">{profile.rank}</span>
            {profile.department && <span className="truncate text-xs text-muted">{profile.department.name}</span>}
          </p>
          <h3 className="mt-1 text-base leading-snug font-semibold">{profile.title}</h3>
          {profile.titleEn && <p className="text-xs text-muted">{profile.titleEn}</p>}
        </div>
        <button type="button" onClick={onClose} className="-mt-1 -mr-1 rounded-full px-2 text-lg text-muted hover:bg-ink/5" aria-label="關閉">
          ×
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* ── ❗ 需要你決定 ── */}
        {detail?.decisions && detail.decisions.length > 0 && (
          <section className="flex flex-col gap-2">
            {detail.decisions.map((d) => (
              <DecisionCard
                key={d.id}
                decision={d}
                onDecided={() => {
                  setVersion((v) => v + 1);
                  onDecided?.();
                }}
              />
            ))}
          </section>
        )}

        {/* ── ⏰ 會議提醒（秘書）── */}
        {agent === EXECUTIVE_ASSISTANT && reminder && <ReminderCard schedule={reminder} departments={departments} onStart={onStartMeeting} onChanged={onDecided} />}

        {/* ── 現在的狀態 ── */}
        <section>
          <p className="font-medium text-accent">{state}</p>
          {place && place !== state && <p className="mt-0.5 text-xs text-muted">📍 {place}</p>}
          {work ? (
            <div className="mt-3 rounded-xl border border-line p-3">
              <p className="flex items-center justify-between gap-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: color }}>{work.phase}</span>
                <span className="text-xs tabular-nums text-muted">{work.progress}%</span>
              </p>
              <p className="mt-2 font-medium">{work.title}</p>
              {work.mission && work.mission !== work.title && <p className="text-xs text-muted">屬於「{work.mission}」</p>}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full transition-all" style={{ width: `${work.progress}%`, background: color }} />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">手上沒有交辦中的工作</p>
          )}
          <p className="mt-2 text-xs text-muted">
            {lastActiveMinutes === null ? "還沒有工作紀錄" : lastActiveMinutes < 1 ? "剛剛還在工作" : `上次工作：${lastActiveMinutes} 分鐘前`}
          </p>
          {(onTalk || (firstOpen && onOpenMission)) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onTalk && (
                <button type="button" onClick={onTalk} className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper">
                  💬 跟{isGm ? "總經理" : "秘書"}對話
                </button>
              )}
              {firstOpen && onOpenMission && (
                <button type="button" onClick={() => onOpenMission(firstOpen.missionId)} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:bg-ink/5">
                  📋 查看這項交辦的進度
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── 目前工作 ── */}
        {hasTasks(agent) && (
          <Section title={`${isExecutive ? "目前交辦事項" : "目前工作"}${detail ? `（${detail.current.length}）` : ""}`}>
            {!detail ? (
              <p className="text-xs text-muted">讀取中…</p>
            ) : detail.current.length === 0 ? (
              <p className="text-xs text-muted">
                {isGm
                  ? "目前沒有交辦事項。點總經理直接說你想完成什麼。"
                  : isExecutive
                    ? "秘書目前沒有轉交中的工作。生活、健康、行程的事她會直接在對話裡處理。"
                    : `目前沒有待辦。有新的交辦時，${profile.reportsTo ?? "主管"}會分派給這位成員。`}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.current.map((t) => (
                  <li key={t.id} className="rounded-xl border border-line p-3">
                    <p className="flex items-start justify-between gap-2">
                      <span className="font-medium">{t.title}</span>
                      <span className="shrink-0 text-xs text-muted">{STATUS_TEXT[t.status] ?? t.status}</span>
                    </p>
                    {t.mission && <p className="text-xs text-muted">屬於「{t.mission}」</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums text-muted">{t.progress}%</span>
                    </div>
                    {t.maxRevisions > 0 && (
                      <p className={`mt-1 text-xs ${t.revisionCount ? "text-amber-700 dark:text-amber-400" : "text-muted"}`}>
                        已退回 {t.revisionCount} 次（最多 {t.maxRevisions} 次）
                      </p>
                    )}
                    {t.lastReview && (
                      <p className="mt-2 rounded-lg bg-accent-soft p-2 text-xs leading-relaxed">
                        <span className="font-medium">最新審閱意見：</span>
                        {t.lastReview}
                      </p>
                    )}
                    {isExecutive && onOpenMission && (
                      <button type="button" onClick={() => onOpenMission(t.missionId)} className="mt-2 text-xs text-accent hover:underline">
                        查看部門分工與成果 →
                      </button>
                    )}
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted">{isExecutive ? "交辦內容" : `工作說明${t.acceptanceCriteria.length ? "與驗收標準" : ""}`}</summary>
                      <p className="mt-2 whitespace-pre-wrap leading-relaxed">{t.instructions}</p>
                      {t.acceptanceCriteria.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 text-muted">
                          {t.acceptanceCriteria.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* ── 會議時程（秘書）── */}
        {agent === EXECUTIVE_ASSISTANT && <ScheduleSection departments={departments} editable={!demoDetail} onChanged={onDecided} />}

        {/* ── 未來預計製作（秘書、總經理）── */}
        {isExecutive && (
          <FuturePlans
            agent={agent}
            name={isGm ? "總經理" : "秘書"}
            upcoming={detail?.upcoming ?? []}
            plans={detail?.plans ?? []}
            editable={!demoDetail}
            onChanged={() => setVersion((v) => v + 1)}
            onDispatch={onDispatch}
          />
        )}

        {/* ── 背景與專長（主管）── */}
        {(() => {
          // 資料庫的設定優先；首頁展示沒有 API，用預設背景
          const dept = getDepartment(departments, agent.split(".")[0]);
          const fallback = isExecutive ? DEFAULT_EXECUTIVE_PERSONAS[agent] : dept && agent === managerOf(dept.id) ? managerPersonaOf(dept) : null;
          const persona = detail?.persona === undefined ? fallback : detail.persona;
          if (!persona) return null;
          return <PersonaSection agent={agent} persona={persona} editable={!demoDetail && Boolean(detail)} onSaved={() => setVersion((v) => v + 1)} />;
        })()}

        {/* ── 部門的網路搜尋開關（部門經理的資訊卡）── */}
        {(() => {
          const dept = getDepartment(departments, agent.split(".")[0]);
          if (!dept || agent !== managerOf(dept.id) || demoDetail || !detail) return null;
          return <WebSearchToggle deptId={dept.id} deptName={dept.name} initial={Boolean(detail.webSearch)} />;
        })()}

        {/* ── 職責與工作流程 ── */}
        <Section title="職責">
          {profile.department && <p className="mb-2 text-xs text-muted">部門定位：{profile.department.mission}</p>}
          <ul className="flex flex-col gap-1.5">
            {profile.duties.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">▸</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="在交辦流程中負責">
          <ol className="flex flex-col gap-1.5">
            {profile.workflow.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink/5 text-[11px] tabular-nums">{i + 1}</span>
                <span>{w}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* ── 組織關係 ── */}
        <Section title="組織">
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1.5 text-xs">
            <dt className="text-muted">直屬主管</dt>
            <dd>{profile.reportsTo ?? "—"}</dd>
            <dt className="text-muted">帶領</dt>
            <dd className="flex flex-wrap gap-1">
              {profile.manages.length ? profile.manages.map((m) => <span key={m} className="rounded-full bg-ink/5 px-2 py-0.5">{m}</span>) : "—"}
            </dd>
            <dt className="text-muted">AI 模型</dt>
            <dd>{profile.model ?? "—（你本人）"}</dd>
          </dl>
        </Section>

        {/* ── 工作統計 ── */}
        {detail && (
          <Section title="工作統計">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={isGm ? "總目標" : "接過的工作"} value={detail.stats.total} />
              <Stat label="進行中" value={detail.stats.open} />
              <Stat label={isGm ? "已完成" : "已通過"} value={detail.stats.approved} />
              {detail.stats.firstPass !== null && (
                <Stat
                  label="一次通過率"
                  value={detail.stats.approved ? `${Math.round((detail.stats.firstPass / detail.stats.approved) * 100)}%` : "—"}
                />
              )}
              {detail.stats.revisions !== null && <Stat label="被退回次數" value={detail.stats.revisions} />}
              {detail.stats.outputChars !== null && <Stat label="產出字數" value={detail.stats.outputChars.toLocaleString()} />}
            </div>
          </Section>
        )}

        {/* ── 最近完成 ── */}
        {detail && detail.recent.length > 0 && (
          <Section title="最近完成">
            <ul className="flex flex-col gap-2">
              {detail.recent.map((t, i) => (
                <li key={i} className="text-xs">
                  <p className="flex justify-between gap-2">
                    <span className="text-sm">
                      {t.status === "failed" ? "✕" : "✓"} {t.title}
                    </span>
                    <span className="shrink-0 text-muted">{timeText(t.completedAt)}</span>
                  </p>
                  {t.mission && <p className="text-muted">屬於「{t.mission}」</p>}
                  {t.comments && <p className="mt-1 line-clamp-2 text-muted">審閱：{t.comments}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── 最近動態 ── */}
        {detail && detail.activities.length > 0 && (
          <Section title="最近動態">
            <ol className="flex flex-col gap-1.5 text-xs">
              {detail.activities.map((a, i) => (
                <li key={i} className={`flex gap-2 ${a.type === "error" ? "text-red-600 dark:text-red-400" : ""}`}>
                  <time className="shrink-0 tabular-nums text-muted">{timeText(a.createdAt)}</time>
                  <span>{a.message}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>
    </aside>
  );
}

// 未來預計製作：上面是已經排進流程的事，下面是你記下的構想（可以新增、一鍵交辦、刪除）
function FuturePlans({
  agent, name, upcoming, plans, editable, onChanged, onDispatch,
}: {
  agent: string;
  name: string;
  upcoming: { title: string; note: string }[];
  plans: FuturePlan[];
  editable: boolean;
  onChanged: () => void;
  onDispatch?: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/office/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, detail, agent }),
    });
    if (!res.ok) return setError((await res.json()).error ?? "新增失敗");
    setTitle("");
    setDetail("");
    onChanged();
  }

  async function remove(id: string) {
    await fetch(`/api/office/plans/${id}`, { method: "DELETE" });
    onChanged();
  }

  // 一鍵交辦：把構想當成一則訊息送給這位主管，送出後從清單移除
  async function dispatch(plan: FuturePlan) {
    onDispatch?.(`請幫我處理：${plan.title}${plan.detail ? `\n${plan.detail}` : ""}`);
    await remove(plan.id);
  }

  return (
    <Section title={`未來預計製作（${upcoming.length + plans.length}）`}>
      {upcoming.length > 0 && (
        <>
          <p className="mb-1.5 text-xs text-muted">已排進流程，等待開始</p>
          <ul className="mb-3 flex flex-col gap-1.5">
            {upcoming.map((u, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted">◷</span>
                <span className="min-w-0">
                  {u.title}
                  <span className="block text-xs text-muted">{u.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {plans.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded-xl bg-paper p-2.5">
              <p className="font-medium">{p.title}</p>
              {p.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{p.detail}</p>}
              <p className="mt-2 flex items-center gap-3 text-xs">
                <span className="text-muted">{timeText(p.createdAt)} 記下</span>
                {editable && onDispatch && (
                  <button type="button" onClick={() => dispatch(p)} className="ml-auto rounded-full bg-ink px-2.5 py-1 font-medium text-paper">
                    立即交辦
                  </button>
                )}
                {editable && (
                  <button type="button" onClick={() => remove(p.id)} className={`text-muted hover:text-red-600 ${onDispatch ? "" : "ml-auto"}`}>
                    刪除
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        upcoming.length === 0 && <p className="text-xs text-muted">還沒有記下的構想。想到之後要做的事，可以先記在這裡，時機到了一鍵交辦給{name}。</p>
      )}
      {editable && (
        <form onSubmit={add} className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-line p-2.5">
          <label htmlFor={`plan-title-${agent}`} className="text-xs font-medium">記下之後要請{name}做的事</label>
          <input
            id={`plan-title-${agent}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder={agent === GENERAL_MANAGER ? "例如：年底做一份年度成果簡報" : "例如：下個月開始提醒我每週運動三次"}
            className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          <label htmlFor={`plan-detail-${agent}`} className="sr-only">補充說明</label>
          <textarea
            id={`plan-detail-${agent}`}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="補充說明（選填）：對象、時間、想要的成果…"
            className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={!title.trim()} className="self-end rounded-lg bg-ink px-3 py-1 text-xs font-medium text-paper disabled:opacity-40">
            加入預計製作
          </button>
        </form>
      )}
    </Section>
  );
}

// 時間到了的預定會議：秘書走到會議室提醒你
function ReminderCard({ schedule, departments, onStart, onChanged }: { schedule: Schedule; departments: Department[]; onStart?: (s: Schedule) => void; onChanged?: () => void }) {
  const patch = async (body: object) => {
    await fetch(`/api/office/schedules/${schedule.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    onChanged?.();
  };
  const names = schedule.departments.map((id) => departments.find((d) => d.id === id)?.name ?? id);
  return (
    <section className="rounded-xl border-2 border-blue-400/70 bg-blue-50 p-3 dark:bg-blue-950/30">
      <p className="font-medium">⏰ 會議時間到了</p>
      <p className="mt-1">{schedule.title}</p>
      <p className="mt-0.5 text-xs text-muted">
        {timeText(schedule.at)}・{names.length ? `列席：${names.join("、")}` : "全部門列席"}
      </p>
      {schedule.note && <p className="mt-1 text-xs">{schedule.note}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {onStart && (
          <button type="button" onClick={() => onStart(schedule)} className="rounded-full bg-ink px-3 py-1.5 font-medium text-paper">
            到會議室開會
          </button>
        )}
        <button type="button" onClick={() => patch({ at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })} className="rounded-full border border-line px-3 py-1.5 hover:bg-ink/5">
          延後 10 分鐘
        </button>
        <button type="button" onClick={() => patch({ status: "cancelled" })} className="rounded-full border border-line px-3 py-1.5 text-muted hover:text-red-600">
          取消這場會議
        </button>
      </div>
    </section>
  );
}

// 會議時程（秘書管理）：預定的會議清單、新增預定會議。時間到了秘書會到會議室提醒（頭上出現 ⏰）
function ScheduleSection({ departments, editable, onChanged }: { departments: Department[]; editable: boolean; onChanged?: () => void }) {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editable) return;
    fetch("/api/office/schedules")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSchedules(data.schedules))
      .catch(() => {});
  }, [editable, version]);

  const changed = () => {
    setVersion((v) => v + 1);
    onChanged?.();
  };
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/office/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, at: new Date(at).toISOString(), departments: picked }),
    });
    if (!res.ok) return setError((await res.json()).error ?? "新增失敗");
    setTitle("");
    setAt("");
    setPicked([]);
    changed();
  }
  const act = async (id: string, method: "PATCH" | "DELETE", body?: object) => {
    await fetch(`/api/office/schedules/${id}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    changed();
  };

  const upcoming = (schedules ?? []).filter((s) => s.status === "upcoming");
  const nameOf = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
  const field = "rounded-lg border border-line bg-paper px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm";

  return (
    <Section title={`會議時程（${upcoming.length}）`}>
      {!editable ? (
        <p className="text-xs text-muted">秘書會幫你記下預定的會議，時間到了走到會議室提醒你。</p>
      ) : schedules === null ? (
        <p className="text-xs text-muted">讀取中…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-xs text-muted">還沒有預定的會議。新增後，時間到了秘書會走到會議室提醒你，頭上出現 ⏰。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((s) => (
            <li key={s.id} className="rounded-xl bg-paper p-2.5 text-xs">
              <p className="flex justify-between gap-2">
                <span className="text-sm font-medium">{s.title}</span>
                <span className="shrink-0 tabular-nums text-muted">{timeText(s.at)}</span>
              </p>
              <p className="mt-0.5 text-muted">{s.departments.length ? `列席：${s.departments.map(nameOf).join("、")}` : "全部門列席"}</p>
              <p className="mt-1.5 flex gap-3">
                <button type="button" onClick={() => act(s.id, "PATCH", { status: "cancelled" })} className="text-muted hover:text-red-600">取消</button>
              </p>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form onSubmit={add} className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-line p-2.5 text-xs">
          <p className="font-medium">預定一場會議</p>
          <label className="sr-only" htmlFor="schedule-title">會議主題</label>
          <input id="schedule-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="會議主題，例如：Q4 行銷檢討" className={field} />
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-muted">時間</span>
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={`${field} min-w-0 flex-1`} />
          </label>
          <div>
            <p className="mb-1 text-muted">列席部門（不選就是全部）</p>
            <div className="flex flex-wrap gap-1">
              {departments.map((d) => {
                const on = picked.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))}
                    className={`rounded-full border px-2 py-0.5 ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={!title.trim() || !at} className="self-end rounded-lg bg-ink px-3 py-1 font-medium text-paper disabled:opacity-40">
            加入時程
          </button>
        </form>
      )}
    </Section>
  );
}

// 主管的背景：顯示與編輯。存檔後，開會、對話、審查工作都會用新的背景
// 開關部門的網路搜尋：開啟後員工執行任務時可以上網查最新資料（每次搜尋另外計費）
function WebSearchToggle({ deptId, deptName, initial }: { deptId: string; deptName: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function toggle() {
    setSaving(true);
    const res = await fetch(`/api/office/departments/${deptId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ webSearch: !on }) });
    if (res.ok) setOn(!on);
    setSaving(false);
  }
  return (
    <Section title="🌐 網路搜尋">
      <label className="flex items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          disabled={saving}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-ink/20"} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${on ? "left-[18px]" : "left-0.5"}`} />
        </button>
        <span className="text-xs">
          <span className="font-medium">{on ? `${deptName}可以上網查資料` : `${deptName}目前不能上網`}</span>
          <span className="mt-0.5 block text-muted">
            開啟後，員工遇到需要最新資料（新聞、價格、市場數據）的工作會自己上網搜尋，成果附上資料來源。每項子任務最多搜尋 5 次；搜尋每 1,000 次約 10 美元，另加搜尋內容的 token。
          </span>
        </span>
      </label>
    </Section>
  );
}

function PersonaSection({ agent, persona, editable, onSaved }: { agent: string; persona: Persona; editable: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<{ background: string; expertise: string; focus: string; style: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    const res = await fetch("/api/office/personas", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent,
        persona: { ...draft, expertise: draft.expertise.split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean) },
      }),
    });
    if (!res.ok) return setError((await res.json()).error ?? "儲存失敗");
    setDraft(null);
    onSaved();
  }

  const field = "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-base outline-none focus:border-accent sm:text-sm";
  return (
    <Section title="背景與專長">
      {draft === null ? (
        <>
          <p className="leading-relaxed">{persona.background}</p>
          {persona.expertise.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {persona.expertise.map((x) => (
                <span key={x} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{x}</span>
              ))}
            </p>
          )}
          {persona.focus && <p className="mt-2 text-xs"><span className="text-muted">審查與發言重點：</span>{persona.focus}</p>}
          {persona.style && <p className="mt-1 text-xs"><span className="text-muted">說話風格：</span>{persona.style}</p>}
          <p className="mt-2 text-xs text-muted">開會、對話、審查工作時，都會依這個背景的專業角度，並以公司目標為依歸。</p>
          {editable && (
            <button
              type="button"
              onClick={() => setDraft({ background: persona.background, expertise: persona.expertise.join("、"), focus: persona.focus, style: persona.style })}
              className="mt-2 text-xs text-accent hover:underline"
            >
              編輯背景
            </button>
          )}
        </>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-medium">經歷</span>
            <textarea value={draft.background} onChange={(e) => setDraft({ ...draft, background: e.target.value })} rows={3} maxLength={500} className={field} placeholder="例如：法律系畢業，10 年企業法務經驗，熟悉個資法與合約審查" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">專長（用頓號分隔）</span>
            <input value={draft.expertise} onChange={(e) => setDraft({ ...draft, expertise: e.target.value })} className={field} placeholder="法規遵循、合約審查、爭議處理" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">審查與發言時特別注意</span>
            <textarea value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} rows={2} maxLength={500} className={field} placeholder="例如：法規與合約風險、程序是否合法" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">說話風格</span>
            <input value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })} maxLength={200} className={field} placeholder="例如：嚴謹、條列重點，先講風險再給解法" />
          </label>
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1 text-muted hover:bg-ink/5">取消</button>
            <button type="submit" disabled={!draft.background.trim()} className="rounded-lg bg-ink px-3 py-1 font-medium text-paper disabled:opacity-40">儲存</button>
          </div>
        </form>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 border-b border-line pb-1 text-xs font-semibold tracking-wide text-muted">{title}</h4>
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
