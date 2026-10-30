"use client";

// 辦公室主畫面（登入後的 /office）。
//   整個畫面就是立體辦公室，縮放到看得到整間公司（手機橫放時連頁首都藏起來，全螢幕顯示）
//   左上角兩個按鈕：
//     對話紀錄 → 跟首席秘書、總經理的完整對話（寬螢幕點秘書或總經理也會打開，放在右側）
//     工作進度 → 總目標清單、等你決定的事；點一項交辦就打開「交辦事項視窗」
//   交辦事項視窗（像會議室視窗一樣浮在辦公室上）：等你決定的事、部門分工、成果與審閱、進度紀錄；
//     參與這項交辦的人，腳下會出現黃色光圈
//   頁首的「回報問題」：使用時遇到問題，把狀況傳給後台
// 總目標還在進行時，每 3 秒自動向伺服器取得最新進度（面板關著也會繼續更新、自動接續執行）。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { ReportButton } from "@/components/report-button";
import { DecisionCard, type PendingDecision } from "./floor/decision-card";
import { OfficeFloor, type Dialog } from "./floor/office-floor";
import { authClient } from "@/lib/auth-client";
import { agentProfile } from "@/lib/agent-profile";
import { agentLabel, departmentName, GENERAL_MANAGER, type BossGender, type OfficeStyle } from "@/lib/company";
import type { OrgSettings } from "@/lib/organization";
import type { SessionUser } from "@/lib/auth";

// ── API 回傳資料的型別（JSON 格式，日期是字串、id 也是字串）──
type Mission = {
  _id: string;
  title: string;
  goal: string;
  status: string;
  progress: number;
  plan: string;
  finalReport?: { content?: string };
  lockedUntil?: string | null;
  createdAt: string;
};
type Task = {
  _id: string;
  parentTask: string | null;
  level: "department" | "staff";
  department: string;
  assignee: string;
  title: string;
  instructions: string;
  acceptanceCriteria: string[];
  status: string;
  progress: number;
  latestResult: string | null;
  revisionCount: number;
};
type Result = {
  _id: string;
  task: string;
  attempt: number;
  content: string;
  review?: { verdict?: string; comments?: string; issues?: string[] };
};
type Activity = { _id: string; actor: string; type: string; message: string; createdAt: string };
type Detail = { mission: Mission; tasks: Task[]; results: Result[]; activities: Activity[] };
type ChatMessage = { role: "me" | "assistant"; text: string };

// ── 狀態的中文名稱與顏色 ──
const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "等待中", className: "bg-ink/5 text-muted" },
  planning: { label: "拆解中", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  in_progress: { label: "執行中", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  reviewing: { label: "驗收中", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  submitted: { label: "待審閱", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  revision: { label: "退回修改", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "通過", className: "bg-accent-soft text-accent" },
  completed: { label: "已完成", className: "bg-accent-soft text-accent" },
  failed: { label: "失敗", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  cancelled: { label: "已取消", className: "bg-ink/5 text-muted" },
};
const FINISHED = ["completed", "failed", "cancelled"];

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, className: STATUS.pending.className };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

const card = "rounded-2xl border border-line bg-surface p-5";

// 總目標還沒結束、沒有流程在處理、最後一筆紀錄也不是錯誤 → 應該自動接續執行
function shouldResume({ mission, activities }: Detail): boolean {
  const running = Boolean(mission.lockedUntil && new Date(mission.lockedUntil) > new Date());
  const lastIsError = activities.at(-1)?.type === "error";
  return !FINISHED.includes(mission.status) && !running && !lastIsError;
}

// 向伺服器取資料的小工具：失敗回傳 null；登入已失效（401）回傳 "unauthorized"
async function fetchJson<T>(url: string): Promise<T | null | "unauthorized"> {
  const res = await fetch(url);
  if (res.status === 401) return "unauthorized";
  return res.ok ? res.json() : null;
}

export function Office({ user, org }: { user: SessionUser; org: OrgSettings }) {
  const { departments } = org;
  // 辦公室風格：切換後立刻生效，同時存回資料庫
  const [officeStyle, setOfficeStyle] = useState<OfficeStyle>(org.officeStyle);
  // 你的人物（性別）：改了立刻生效，同時存回資料庫
  const [bossGender, setBossGender] = useState<BossGender>(org.bossGender);
  const changeBossGender = (gender: BossGender) => {
    setBossGender(gender);
    fetch("/api/organization", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bossGender: gender }) });
  };
  const changeStyle = (style: OfficeStyle) => {
    setOfficeStyle(style);
    fetch("/api/organization", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ officeStyle: style }),
    });
  };
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  // 還沒手動選的話，預設顯示最新的總目標
  const currentId = selectedId ?? missions[0]?._id ?? null;

  // 重新讀取總目標清單（送出新目標、或按下繼續執行後呼叫）
  // 登入失效時（例如在別的分頁登出了）導回登入頁
  const reloadMissions = useCallback(() => {
    fetchJson<{ missions: Mission[] }>("/api/missions").then((data) => {
      if (data === "unauthorized") router.push("/sign-in");
      else if (data) setMissions(data.missions);
    });
  }, [router]);

  // 第一次打開頁面：載入清單
  useEffect(() => {
    reloadMissions();
  }, [reloadMissions]);

  // 跟秘書、總經理的對話；交辦了新工作就重新整理清單並選中它
  const chat = useChat(departments, (missionId) => {
    reloadMissions();
    setSelectedId(missionId);
  });

  // 選中的總目標改變時載入詳細資料；還在進行中就每 3 秒更新一次
  const active = detail?.mission._id === currentId ? !FINISHED.includes(detail.mission.status) : true;
  useEffect(() => {
    if (!currentId) return;
    // cancelled：換選別的總目標後，舊的請求晚回來也不會蓋掉新的畫面
    let cancelled = false;
    const refresh = () => {
      fetchJson<Detail>(`/api/missions/${currentId}`).then((data) => {
        if (!data || data === "unauthorized" || cancelled) return;
        setDetail(data);
        // 自動接續：每次執行最多跑約 4 分鐘就會暫停。
        // 畫面開著時，發現暫停了就自動再啟動；但上一步是錯誤的話不自動重試，等你手動按「繼續執行」
        if (shouldResume(data)) fetch(`/api/missions/${currentId}/run`, { method: "POST" });
      });
      reloadMissions();
    };
    refresh();
    const timer = active ? setInterval(refresh, 3000) : undefined;
    // 換選別的總目標或離開頁面時，停止計時器
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentId, active, reloadMissions]);

  const reloadDetail = () => {
    if (!currentId) return;
    fetchJson<Detail>(`/api/missions/${currentId}`).then((data) => {
      if (data && data !== "unauthorized") setDetail(data);
    });
  };

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  // 目前打開的面板：對話紀錄、工作進度（null：都沒打開）
  const [panel, setPanel] = useState<"chat" | "missions" | null>(null);
  // 交辦事項視窗：打開時顯示目前選中的總目標（currentId）
  const [missionOpen, setMissionOpen] = useState(false);
  const openMission = (missionId: string) => {
    setSelectedId(missionId);
    setMissionOpen(true);
    setPanel(null);
  };
  const shownDetail = missionOpen && detail && detail.mission._id === currentId ? detail : null;
  // 參與這項交辦的人：總經理 + 所有被分派任務的人
  const involved = shownDetail ? [GENERAL_MANAGER, ...new Set(shownDetail.tasks.map((t) => t.assignee))] : [];
  const toggle = (name: "chat" | "missions") => setPanel((p) => (p === name ? null : name));
  // 按 Esc 關閉面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const activeMissions = missions.filter((m) => !FINISHED.includes(m.status)).length;

  // 點樓層上的秘書或總經理：頭上出現對話框；寬螢幕同時在右側打開對話紀錄
  const talk = (agent: string) => {
    chat.openDialog(agent);
    if (window.matchMedia("(min-width: 1024px)").matches) setPanel("chat");
  };

  const pill = "flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition hover:bg-surface";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {/* 頁首：手機橫放時藏起來，讓辦公室全螢幕 */}
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-paper/80 px-4 py-2.5 backdrop-blur-md sm:px-6 [@media(orientation:landscape)_and_(max-height:540px)]:hidden">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{org.companyName}・{user.name}</span>
          <ReportButton where="辦公室頁面" label="回報問題" className="rounded-lg px-2 py-1 text-muted transition hover:bg-ink/5 hover:text-ink" />
          <Link href="/onboarding" className="rounded-lg px-2 py-1 text-muted transition hover:bg-ink/5 hover:text-ink">
            重新設計部門
          </Link>
          <button onClick={signOut} className="rounded-lg border border-line px-3 py-1 transition hover:bg-ink/5">
            登出
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 立體辦公室：填滿剩下的空間 */}
        <main aria-label="辦公室樓層" className="relative min-w-0 flex-1">
          <OfficeFloor
            fill
            departments={departments}
            style={officeStyle}
            onStyleChange={changeStyle}
            bossGender={bossGender}
            onBossGenderChange={changeBossGender}
            userName={user.name}
            dialog={chat.dialog}
            onTalk={talk}
            onSend={(message) => chat.dialog && chat.send(chat.dialog.agent, message)}
            onCloseDialog={chat.closeDialog}
            onHistory={() => setPanel("chat")}
            onDispatch={(agent, message) => chat.send(agent, message)}
            onOpenMission={openMission}
            highlight={involved}
            actions={
              <>
                <button type="button" onClick={() => toggle("chat")} aria-expanded={panel === "chat"} className={pill}>
                  💬 對話紀錄{chat.pending && <span className="size-1.5 animate-pulse rounded-full bg-accent" />}
                </button>
                <button type="button" onClick={() => toggle("missions")} aria-expanded={panel === "missions"} className={pill}>
                  📋 工作進度{activeMissions > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">{activeMissions}</span>}
                </button>
              </>
            }
          />
          {/* 手機直放時樓層很小，提示可以橫放（橫放時辦公室會全螢幕） */}
          <p className="pointer-events-none absolute inset-x-0 bottom-16 hidden text-center text-xs text-muted [@media(orientation:portrait)_and_(max-width:640px)]:block">
            📱 把手機橫放，辦公室會變成全螢幕
          </p>

          {/* 交辦事項視窗 */}
          {missionOpen && (
            <aside
              aria-label="交辦事項"
              className="absolute inset-x-2 bottom-14 z-30 flex max-h-[75%] flex-col overflow-hidden rounded-2xl border border-line bg-surface/97 text-sm shadow-xl backdrop-blur sm:inset-x-auto sm:top-14 sm:right-3 sm:bottom-16 sm:max-h-none sm:w-[480px]"
            >
              <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">📋 交辦事項</p>
                  <h3 className="truncate font-semibold">{shownDetail?.mission.title ?? "讀取中…"}</h3>
                </div>
                {shownDetail && (
                  <ReportButton
                    where={`交辦事項：${shownDetail.mission.title}`}
                    context={{ missionId: shownDetail.mission._id, status: shownDetail.mission.status, lastError: shownDetail.activities.findLast((a) => a.type === "error")?.message }}
                  />
                )}
                <button type="button" onClick={() => setMissionOpen(false)} className="rounded-full px-2 text-lg text-muted hover:bg-ink/5" aria-label="關閉交辦事項">
                  ×
                </button>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-paper/60 p-3">
                {shownDetail && (
                  <>
                    <MissionDecisions missionId={shownDetail.mission._id} refreshKey={shownDetail.activities.length} departments={departments} onDecided={reloadDetail} />
                    <MissionDetail detail={shownDetail} departments={departments} onRun={reloadDetail} />
                  </>
                )}
              </div>
            </aside>
          )}
        </main>

        {/* 對話紀錄：寬螢幕放在右側（辦公室跟著縮小）；手機蓋滿整個畫面 */}
        <aside
          aria-label="對話紀錄"
          className={`${panel === "chat" ? "flex" : "hidden"} fixed inset-0 z-40 flex-col bg-paper lg:static lg:z-auto lg:w-[400px] lg:shrink-0 lg:border-l lg:border-line`}
        >
          <PanelHeader title="對話紀錄" onClose={() => setPanel(null)} />
          <ChatLog chat={chat} departments={departments} />
        </aside>
      </div>

      {/* 工作進度：從右側滑出 */}
      <div className={`${panel === "missions" ? "" : "hidden"} fixed inset-0 z-40`}>
        <div className="absolute inset-0 bg-black/30" onClick={() => setPanel(null)} aria-hidden="true" />
        <aside aria-label="工作進度" className="absolute inset-y-0 right-0 flex w-full flex-col bg-paper shadow-2xl sm:w-[680px]">
          <PanelHeader title="工作進度" onClose={() => setPanel(null)} />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <section className={card}>
              <h3 className="mb-1 font-semibold">我的總目標</h3>
              <p className="mb-3 text-xs text-muted">點一項交辦，會在辦公室裡打開它的視窗，參與的人腳下會出現光圈。</p>
              {missions.length === 0 ? (
                <p className="text-sm text-muted">還沒有總目標。點辦公室裡的秘書或總經理，說說你想完成什麼吧！</p>
              ) : (
                <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                  {missions.map((m) => (
                    <li key={m._id}>
                      <button
                        onClick={() => openMission(m._id)}
                        aria-current={m._id === currentId}
                        className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-left text-sm transition ${m._id === currentId ? "border-accent bg-accent-soft/40" : "border-line hover:border-ink/30"}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-medium">{m.title}</span>
                          <StatusBadge status={m.status} />
                        </span>
                        <ProgressBar value={m.progress} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <PendingDecisions open={panel === "missions"} departments={departments} onOpen={openMission} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// 這項交辦裡等你決定的事（還沒決定的放上面；已經決定的列在下面當紀錄）
type DecisionItem = PendingDecision & { agent: string; status: string; choice: string | null; note: string; mission: string };

function MissionDecisions({ missionId, refreshKey, departments, onDecided }: { missionId: string; refreshKey: number; departments: OrgSettings["departments"]; onDecided: () => void }) {
  const [list, setList] = useState<DecisionItem[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    fetch(`/api/decisions?mission=${missionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setList(data.decisions))
      .catch(() => {});
  }, [missionId, refreshKey, version]);
  const open = list.filter((d) => d.status === "open");
  const decided = list.filter((d) => d.status === "decided");
  if (!list.length) return null;
  return (
    <section className="flex flex-col gap-2">
      {open.map((d) => (
        <div key={d.id}>
          <p className="mb-1 text-xs text-muted">{agentLabel(d.agent, departments)} 需要你決定</p>
          <DecisionCard
            decision={d}
            onDecided={() => {
              setVersion((v) => v + 1);
              onDecided();
            }}
          />
        </div>
      ))}
      {decided.length > 0 && (
        <details className="rounded-xl bg-surface p-3 text-xs">
          <summary className="cursor-pointer text-muted">你做過的決定（{decided.length}）</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {decided.map((d) => (
              <li key={d.id}>
                {d.title}：<span className="font-medium">{d.options.find((o) => o.id === d.choice)?.label}</span>
                {d.note && <span className="text-muted">（{d.note.slice(0, 60)}）</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// 工作進度面板最上面：所有等你決定的事
function PendingDecisions({ open, departments, onOpen }: { open: boolean; departments: OrgSettings["departments"]; onOpen: (missionId: string) => void }) {
  const [list, setList] = useState<DecisionItem[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/decisions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setList(data.decisions))
      .catch(() => {});
  }, [open]);
  if (!list.length) return null;
  return (
    <section className={`${card} border-amber-400/60`}>
      <h3 className="mb-3 font-semibold">❗ 等你決定（{list.length}）</h3>
      <ul className="flex flex-col gap-2">
        {list.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onOpen(d.missionId)} className="w-full rounded-xl border border-line p-3 text-left text-sm hover:border-ink/30">
              <span className="font-medium">{d.title}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {agentLabel(d.agent, departments)}・{d.mission}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 面板的標題列
function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
      <h2 className="font-serif text-lg font-bold">{title}</h2>
      <button type="button" onClick={onClose} className="rounded-full px-2.5 py-1 text-lg leading-none text-muted hover:bg-ink/5 hover:text-ink" aria-label={`關閉${title}`}>
        ×
      </button>
    </header>
  );
}

// ── 跟公司成員對話 ──────────────────────────────────
// 首席秘書、總經理隨時可以找；其他成員點他的辦公桌，他會走回座位跟你聊。
// 每個人的對話紀錄分開保存。對話有兩個入口，共用同一份紀錄（useChat）：
//   1. 樓層上的寶可夢風格對話框，直接在框裡回覆
//   2.「對話紀錄」面板 → 看完整對話、也可以從這裡輸入（每位聊過的人一個分頁）
// 每次送出都會附上跟這個人最近的對話，對方能依你的回答接續詢問或處理。
const CHAT_PEOPLE: Record<string, { greeting: string; placeholder: string }> = {
  executive_assistant: { greeting: "老闆好，我是首席秘書。生活、健康和行程交給我；工作上的事我會整理好轉交總經理。", placeholder: "例如：提醒我每兩小時喝水" },
  general_manager: { greeting: "老闆好，我是總經理。要交辦的工作直接告訴我，也可以問我目前各項工作的進度。", placeholder: "例如：幫我規劃下個月的 IG 貼文" },
};
const FIXED_PEOPLE = Object.keys(CHAT_PEOPLE);

function useChat(departments: OrgSettings["departments"], onMission: (missionId: string) => void) {
  const nameOf = (agent: string) => agentLabel(agent, departments);
  const greetingOf = (agent: string) =>
    CHAT_PEOPLE[agent]?.greeting ?? `老闆好，我是${nameOf(agent)}。想了解我手上的工作、或聽聽我的建議嗎？新工作請交給總經理分派喔。`;
  const [person, setPerson] = useState<string>("executive_assistant");
  const [histories, setHistories] = useState<Record<string, ChatMessage[]>>(() =>
    Object.fromEntries(FIXED_PEOPLE.map((p) => [p, [{ role: "assistant", text: CHAT_PEOPLE[p].greeting }]])),
  );
  const [pending, setPending] = useState<string | null>(null);
  // 樓層上打開對話框的是誰（null：沒有打開）
  const [dialogWith, setDialogWith] = useState<string | null>(null);

  // 第一次跟某人說話：先放一句他的開場招呼
  const ensure = (who: string) =>
    setHistories((h) => (h[who] ? h : { ...h, [who]: [{ role: "assistant", text: greetingOf(who) }] }));
  const add = (who: string, message: ChatMessage) =>
    setHistories((h) => ({ ...h, [who]: [...(h[who] ?? [{ role: "assistant", text: greetingOf(who) }]), message] }));

  async function send(to: string, text: string) {
    if (!text.trim() || pending) return;
    // 前文：去掉開場招呼，只送最近的對話
    const history = (histories[to] ?? [])
      .slice(1)
      .slice(-12)
      .map((m) => ({ role: m.role === "me" ? "user" : "assistant", content: m.text }));
    add(to, { role: "me", text });
    setPending(to);
    setDialogWith(to);
    setPerson(to);

    let reply: string;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: to, message: text, history }),
      });
      const data = await res.json();
      reply = res.ok ? data.reply : data.error;
      if (data.missionId) onMission(data.missionId);
    } catch {
      reply = "連線失敗，請稍後再試";
    }
    add(to, { role: "assistant", text: reply });
    setPending(null);
  }

  // 樓層上要顯示的對話框：這個人最新的一句話
  const dialog: Dialog = dialogWith
    ? {
        agent: dialogWith,
        text: (histories[dialogWith] ?? []).findLast((m) => m.role === "assistant")?.text ?? greetingOf(dialogWith),
        pending: pending === dialogWith,
      }
    : null;

  return {
    person,
    setPerson,
    histories,
    pending,
    send,
    dialog,
    nameOf,
    placeholderOf: (agent: string) => CHAT_PEOPLE[agent]?.placeholder ?? "問問他的工作進度或建議…",
    openDialog: (agent: string) => {
      ensure(agent);
      setDialogWith(agent);
      setPerson(agent);
    },
    closeDialog: () => setDialogWith(null),
  };
}

type Chat = ReturnType<typeof useChat>;

function ChatLog({ chat, departments }: { chat: Chat; departments: OrgSettings["departments"] }) {
  const { person, setPerson, histories, pending, nameOf } = chat;
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const messages = histories[person] ?? [];
  // 分頁：秘書、總經理固定在前面，其他聊過的人依序排在後面
  const people = [...FIXED_PEOPLE, ...Object.keys(histories).filter((p) => !FIXED_PEOPLE.includes(p))];
  // 分頁上只寫職稱（例如「文案撰寫員」），完整名稱在對話框上
  const shortName = (agent: string) => (agent === "executive_assistant" ? "首席秘書" : (agentProfile(agent, departments)?.title ?? nameOf(agent)));

  // 有新訊息時，把對話紀錄捲到最下面（只捲這一塊，不會帶動整個頁面）
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [histories, person, pending]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    chat.send(person, input.trim());
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <p className="mb-3 text-xs text-muted">在辦公室裡點秘書或總經理，或點任何人的辦公桌，就能在他們頭上直接對話。</p>
      {/* 分頁：選擇要看跟誰的對話 */}
      <div role="tablist" aria-label="選擇對話對象" className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-paper p-1">
        {people.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={person === p}
            onClick={() => setPerson(p)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${person === p ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {shortName(p)}
            {pending === p && " …"}
          </button>
        ))}
      </div>
      <div ref={listRef} role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <p
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "me" ? "self-end bg-ink text-paper" : "self-start bg-paper"}`}
          >
            {m.text}
          </p>
        ))}
        {pending === person && <p className="self-start text-sm text-muted">{shortName(person)}思考中…</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="assistant-input" className="sr-only">
          傳訊息給{shortName(person)}
        </label>
        <input
          id="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={chat.placeholderOf(person)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-base outline-none focus:border-accent"
        />
        <button type="submit" disabled={Boolean(pending) || !input.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40">
          送出
        </button>
      </form>
    </div>
  );
}

// ── 總目標詳細進度 ──────────────────────────────────
function MissionDetail({ detail, departments, onRun }: { detail: Detail; departments: OrgSettings["departments"]; onRun: () => void }) {
  const { mission, tasks, results, activities } = detail;
  const [runError, setRunError] = useState<string | null>(null);

  // lockedUntil 還沒到 → 有流程正在處理
  const running = Boolean(mission.lockedUntil && new Date(mission.lockedUntil) > new Date());
  const finished = FINISHED.includes(mission.status);
  const resultOf = (task: Task) => results.find((r) => r._id === task.latestResult);
  const departmentTasks = tasks.filter((t) => t.level === "department");

  async function resume() {
    setRunError(null);
    const res = await fetch(`/api/missions/${mission._id}/run`, { method: "POST" });
    if (!res.ok) setRunError((await res.json()).error);
    onRun();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-2xl font-bold">{mission.title}</h2>
          <StatusBadge status={mission.status} />
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{mission.goal}</p>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar value={mission.progress} />
          <span className="w-10 shrink-0 text-right text-sm tabular-nums">{mission.progress}%</span>
        </div>
        {!finished && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            {running ? (
              <span className="text-blue-700 dark:text-blue-300">● 團隊正在處理中…</span>
            ) : (
              <>
                <span className="text-muted">已暫停（出錯或伺服器重啟時會停下來）</span>
                <button onClick={resume} className="rounded-lg border border-line px-3 py-1 transition hover:bg-ink/5">
                  繼續執行
                </button>
              </>
            )}
            {runError && <span className="text-red-600 dark:text-red-400">{runError}</span>}
            {(runError || activities.at(-1)?.type === "error") && (
              <ReportButton where={`交辦事項：${mission.title}`} label="回報這個錯誤" context={{ missionId: mission._id, error: runError ?? activities.at(-1)?.message }} />
            )}
          </div>
        )}
      </section>

      {mission.finalReport?.content && (
        <section className={`${card} border-accent/40`}>
          <h3 className="mb-2 font-semibold">總經理總結報告</h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{mission.finalReport.content}</div>
        </section>
      )}

      {mission.plan && (
        <section className={card}>
          <h3 className="mb-2 font-semibold">總經理的規劃</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{mission.plan}</p>
        </section>
      )}

      {departmentTasks.map((task) => (
        <section key={task._id} className={card}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">{departmentName(departments, task.department)}</p>
              <h3 className="font-semibold">{task.title}</h3>
            </div>
            <StatusBadge status={task.status} />
          </div>
          <div className="mt-2">
            <ProgressBar value={task.progress} />
          </div>
          <TaskBody task={task} result={resultOf(task)} resultLabel="部門報告" />

          {/* 員工子任務 */}
          <ul className="mt-3 flex flex-col gap-2">
            {tasks
              .filter((s) => s.parentTask === task._id)
              .map((sub) => (
                <li key={sub._id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-xs text-muted">{agentLabel(sub.assignee, departments)}</p>
                      <p className="font-medium">{sub.title}</p>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                  <TaskBody task={sub} result={resultOf(sub)} resultLabel="成果" />
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section className={card}>
        <details>
          <summary className="cursor-pointer font-semibold">進度紀錄（{activities.length}）</summary>
          <ol className="mt-3 flex flex-col gap-1 text-sm">
            {activities.map((a) => (
              <li key={a._id} className={`flex gap-3 ${a.type === "error" ? "text-red-600 dark:text-red-400" : ""}`}>
                <time className="shrink-0 tabular-nums text-muted">
                  {new Date(a.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span className="shrink-0 text-muted">{agentLabel(a.actor, departments)}</span>
                <span className="min-w-0">{a.message}</span>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </div>
  );
}

// 任務的說明、驗收標準、最新成果與審閱意見（點開才顯示，避免畫面太長）
function TaskBody({ task, result, resultLabel }: { task: Task; result?: Result; resultLabel: string }) {
  return (
    <div className="mt-2 flex flex-col gap-1 text-sm">
      <details>
        <summary className="cursor-pointer text-muted">工作說明與驗收標準</summary>
        <p className="mt-2 whitespace-pre-wrap">{task.instructions}</p>
        {task.acceptanceCriteria.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-muted">
            {task.acceptanceCriteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
      </details>
      {result && (
        <details>
          <summary className="cursor-pointer text-muted">
            {resultLabel}（第 {result.attempt} 版{task.revisionCount > 0 ? `，退回 ${task.revisionCount} 次` : ""}）
          </summary>
          {result.review?.comments && (
            <div className="mt-2 rounded-lg bg-accent-soft p-2">
              <p>
                <span className="font-medium">審閱意見：</span>
                {result.review.comments}
              </p>
              {result.review.issues && result.review.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {result.review.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-2 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-paper p-3 leading-relaxed">
            {result.content}
          </div>
        </details>
      )}
    </div>
  );
}
