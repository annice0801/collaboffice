"use client";

// 組建團隊問卷。
// 步驟 1：回答問題（身分、想交辦的領域、最花時間的事、團隊規模、辦公室風格、你的人物）
// 步驟 2：AI 依回答設計部門 → 預覽，可以移除不需要的部門、或重新產生
// 步驟 3：確認建立 → 進入辦公室

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { quizLabels, recommendTheme, THEME_QUIZ } from "@/lib/theme-quiz";
import { BOSS_GENDER_LABELS, BOSS_GENDERS, DEFAULT_DEPARTMENTS, OFFICE_STYLES, type BossGender, type Department, type OfficeStyle } from "@/lib/company";

type Existing = { companyName: string; officeStyle: OfficeStyle; bossGender: BossGender; departments: Department[] } | null;

const IDENTITIES = ["上班族", "自由工作者／接案", "創業者／公司負責人", "學生", "家庭主理人", "退休族"];
const AREAS = [
  "投資理財與市場資訊",
  "社群經營與行銷內容",
  "社區或組織事務",
  "求職與個人品牌",
  "產品開發與創業",
  "行政文書與資料整理",
  "學習與研究",
  "家庭與育兒",
  "影音與設計",
  "客戶服務與業務",
];
const SIZES = [
  { id: "small", name: "精簡", hint: "3 個部門" },
  { id: "medium", name: "標準", hint: "4～5 個部門" },
  { id: "large", name: "完整", hint: "6～8 個部門" },
] as const;

const chip = (active: boolean) =>
  `rounded-full border px-4 py-2 text-sm transition ${active ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink/40"}`;

export function Onboarding({ userName, existing }: { userName: string; existing: Existing }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(existing?.companyName ?? `${userName} 的 AI 公司`);
  const [identity, setIdentity] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [otherArea, setOtherArea] = useState("");
  const [timeSinks, setTimeSinks] = useState("");
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("medium");
  const [officeStyle, setOfficeStyle] = useState<OfficeStyle>(existing?.officeStyle ?? "classic");
  // 喜好題的回答 → 推薦的主題；自己點過主題（picked）之後就不再自動換
  const [quiz, setQuiz] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState(Boolean(existing));
  const recommended = recommendTheme(quiz);
  const answerQuiz = (question: string, option: string) => {
    const next = { ...quiz, [question]: option };
    setQuiz(next);
    const { best } = recommendTheme(next);
    if (!picked && best) setOfficeStyle(best);
  };
  const pickStyle = (id: OfficeStyle) => {
    setOfficeStyle(id);
    setPicked(true);
  };
  // AI 組織顧問推薦的主題（設計部門時一起回傳）
  const [aiTheme, setAiTheme] = useState<{ theme: OfficeStyle; reason: string } | null>(null);
  const [bossGender, setBossGender] = useState<BossGender>(existing?.bossGender ?? "neutral");

  const [proposal, setProposal] = useState<Department[] | null>(null);
  const [pending, setPending] = useState<"design" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // AI 暫時不能用（例如用量到上限）：錯誤訊息旁邊提供「先用範例部門建立」
  const [canFallback, setCanFallback] = useState(false);

  const toggleArea = (area: string) =>
    setAreas((list) => (list.includes(area) ? list.filter((a) => a !== area) : [...list, area]));
  const allAreas = [...areas, ...otherArea.split(/[,，、]/).map((a) => a.trim()).filter(Boolean)];
  const answers = { companyName, identity, areas: allAreas, timeSinks, size, vibe: quizLabels(quiz) };

  // 請 AI 依回答設計部門
  async function design(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    setCanFallback(false);
    if (!identity) return setError("請選擇你的身分");
    if (!allAreas.length) return setError("請至少選一個想交給團隊的領域");
    setPending("design");
    try {
      const res = await fetch("/api/organization/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(answers),
      });
      const data = await res.json();
      if (!res.ok) {
        setCanFallback(Boolean(data.fallback));
        throw new Error(data.error);
      }
      setProposal(data.departments);
      if (data.theme) setAiTheme({ theme: data.theme, reason: data.themeReason ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "設計失敗，請再試一次");
    } finally {
      setPending(null);
    }
  }

  // 確認建立（或更新）組織
  async function save(departments: Department[]) {
    setError(null);
    setPending("save");
    try {
      const res = await fetch("/api/organization", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organization: { companyName, officeStyle, bossGender, departments }, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // 只跳轉、不再 router.refresh()：refresh 會重新讀取「目前這頁」（還是問卷），
      // 有時候會蓋掉前往辦公室的跳轉，畫面就停在「建立中…」。辦公室頁每次都會重新讀取組織，不需要 refresh
      router.push("/office");
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗，請再試一次");
      setPending(null);
    }
  }

  return (
    <main className="flex-1 bg-paper px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <LogoMark />
          CollabOffice
        </Link>

        {!proposal ? (
          <form onSubmit={design} className="mt-10 flex flex-col gap-10">
            <header>
              <p className="text-sm text-accent">{existing ? "重新設計你的團隊" : "歡迎加入"}</p>
              <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">先認識一下你，我們幫你組建團隊</h1>
              <p className="mt-3 text-muted">回答幾個問題，AI 組織顧問會設計最適合你的部門與成員。建立前你都可以先看過、調整。</p>
              {existing && (
                <p className="mt-3 rounded-xl bg-gold/15 px-4 py-3 text-sm">
                  你目前已有 {existing.departments.length} 個部門。重新設計並確認後，會取代現有的部門設定；已完成的任務紀錄會保留。
                </p>
              )}
            </header>

            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">1. 公司名稱</legend>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={50}
                className="mt-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-base outline-none focus:border-accent"
              />
            </fieldset>

            <fieldset>
              <legend className="font-semibold">2. 你的身分是？</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {IDENTITIES.map((item) => (
                  <button key={item} type="button" onClick={() => setIdentity(item)} aria-pressed={identity === item} className={chip(identity === item)}>
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-semibold">3. 想把哪些事交給 AI 團隊？（可複選）</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {AREAS.map((area) => (
                  <button key={area} type="button" onClick={() => toggleArea(area)} aria-pressed={areas.includes(area)} className={chip(areas.includes(area))}>
                    {area}
                  </button>
                ))}
              </div>
              <input
                value={otherArea}
                onChange={(e) => setOtherArea(e.target.value)}
                placeholder="其他領域（用逗號分隔），例如：命理諮詢、裝潢設計"
                className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-base outline-none focus:border-accent"
              />
            </fieldset>

            <fieldset>
              <legend className="font-semibold">4. 目前最花時間、最想交出去的事是什麼？</legend>
              <textarea
                value={timeSinks}
                onChange={(e) => setTimeSinks(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="例如：每天早上要看很多財經新聞；每週要想 IG 貼文；管委會開完會要整理會議記錄…"
                className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
              />
            </fieldset>

            <fieldset>
              <legend className="font-semibold">5. 團隊規模</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {SIZES.map((s) => (
                  <button key={s.id} type="button" onClick={() => setSize(s.id)} aria-pressed={size === s.id} className={`rounded-2xl border p-4 text-left transition ${size === s.id ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink/40"}`}>
                    <span className="block font-semibold">{s.name}</span>
                    <span className="text-sm opacity-75">{s.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {THEME_QUIZ.map((q, qi) => (
              <fieldset key={q.id}>
                <legend className="font-semibold">
                  {6 + qi}. {q.title}
                </legend>
                <p className="mt-1 text-sm text-muted">用來挑選最適合你的辦公室主題（不會花 AI 費用）。</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {q.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => answerQuiz(q.id, o.id)}
                      aria-pressed={quiz[q.id] === o.id}
                      className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center text-sm transition ${quiz[q.id] === o.id ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink/40"}`}
                    >
                      <span className="text-3xl" aria-hidden="true">{o.emoji}</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}

            <fieldset>
              <legend className="font-semibold">8. 你的辦公室主題（之後也可以在辦公室裡切換）</legend>
              {recommended.top && (
                <p className="mt-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
                  ✨ 依你的喜好，最適合的工作場域是「{OFFICE_STYLES.find((s) => s.id === recommended.top)?.emoji} {OFFICE_STYLES.find((s) => s.id === recommended.top)?.name}」
                  {recommended.top !== recommended.best && `（即將推出，先幫你選了最接近的「${OFFICE_STYLES.find((s) => s.id === recommended.best)?.name}」）`}
                </p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {OFFICE_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!s.ready}
                    onClick={() => pickStyle(s.id)}
                    aria-pressed={officeStyle === s.id}
                    className={`relative rounded-2xl border bg-surface p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${officeStyle === s.id ? "border-ink ring-2 ring-ink" : "border-line hover:border-ink/40"}`}
                  >
                    {recommended.top === s.id && <span className="absolute top-2 right-2 rounded-full bg-accent px-2 py-0.5 text-[10px] text-white">最適合你</span>}
                    <span className="block text-2xl" aria-hidden="true">{s.emoji}</span>
                    <span className="mt-1 block font-semibold">
                      {s.name}
                      {!s.ready && <span className="ml-1.5 rounded-full bg-ink/10 px-1.5 text-[10px] font-normal">即將推出</span>}
                    </span>
                    <span className="text-sm text-muted">{s.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-semibold">9. 你在辦公室裡的人物</legend>
              <p className="mt-1 text-sm text-muted">穿搭會跟著辦公室風格變化：經典商務是西裝，科技園區是高領毛衣配牛仔褲。之後也可以在辦公室裡修改。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {BOSS_GENDERS.map((g) => (
                  <button key={g} type="button" onClick={() => setBossGender(g)} aria-pressed={bossGender === g} className={chip(bossGender === g)}>
                    {BOSS_GENDER_LABELS[g]}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <div role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <p>{error}</p>
                {canFallback && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-ink">
                    <span className="text-muted">也可以先用範例部門建立辦公室，你選的主題和人物都會套用；等 AI 恢復後，再到辦公室右上角「重新設計部門」。</span>
                    <button type="button" onClick={() => save(DEFAULT_DEPARTMENTS)} disabled={Boolean(pending)} className="rounded-full bg-ink px-4 py-1.5 text-paper disabled:opacity-50">
                      {pending === "save" ? "建立中…" : "先用範例部門建立 →"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => save(DEFAULT_DEPARTMENTS)} disabled={Boolean(pending)} className="text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50">
                跳過問卷，直接套用範例部門
              </button>
              <button type="submit" disabled={Boolean(pending)} className="rounded-full bg-ink px-6 py-3 font-medium text-paper transition hover:opacity-90 disabled:opacity-50">
                {pending === "design" ? "AI 正在設計你的團隊…（約 30 秒）" : "幫我設計團隊 →"}
              </button>
            </div>
          </form>
        ) : (
          <section className="mt-10">
            <p className="text-sm text-accent">AI 組織顧問的提案</p>
            <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">這是為你設計的團隊</h1>
            {aiTheme && aiTheme.theme !== officeStyle && OFFICE_STYLES.find((s) => s.id === aiTheme.theme)?.ready && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm">
                <span className="flex-1">
                  AI 組織顧問建議的辦公室主題：{OFFICE_STYLES.find((s) => s.id === aiTheme.theme)?.emoji} {OFFICE_STYLES.find((s) => s.id === aiTheme.theme)?.name}
                  {aiTheme.reason && <span className="block text-muted">{aiTheme.reason}</span>}
                </span>
                <button type="button" onClick={() => pickStyle(aiTheme.theme)} className="rounded-full bg-ink px-4 py-1.5 text-paper">
                  改用這個主題
                </button>
              </div>
            )}
            <p className="mt-3 text-muted">
              共 {proposal.length} 個部門、{proposal.reduce((n, d) => n + d.staff.length, 0)} 位員工，另外還有首席秘書與總經理。不需要的部門可以先移除。
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {proposal.map((dept) => (
                <li key={dept.id} className="relative rounded-2xl border border-line bg-surface p-5">
                  {proposal.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setProposal(proposal.filter((d) => d.id !== dept.id))}
                      className="absolute top-3 right-3 rounded-full px-2 text-muted hover:bg-ink/5"
                      aria-label={`移除${dept.name}`}
                    >
                      ×
                    </button>
                  )}
                  <p className="text-xs text-muted">{dept.nameEn}</p>
                  <h2 className="mt-1 pr-6 font-semibold">{dept.name}</h2>
                  <p className="mt-2 text-sm text-muted">{dept.mission}</p>
                  <ul className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-sm">
                    {dept.staff.map((s) => (
                      <li key={s.id}>
                        <p className="font-medium">{s.name}</p>
                        <p className="mt-0.5 text-muted">{s.duties.join("；")}</p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            {error && <p role="alert" className="mt-6 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

            <div className="mt-8 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-4 text-sm">
                <button type="button" onClick={() => setProposal(null)} disabled={Boolean(pending)} className="text-muted underline underline-offset-4 hover:text-ink">
                  ← 修改回答
                </button>
                <button type="button" onClick={() => design()} disabled={Boolean(pending)} className="text-muted underline underline-offset-4 hover:text-ink">
                  {pending === "design" ? "重新設計中…" : "重新產生"}
                </button>
              </div>
              <button type="button" onClick={() => save(proposal)} disabled={Boolean(pending)} className="rounded-full bg-ink px-6 py-3 font-medium text-paper transition hover:opacity-90 disabled:opacity-50">
                {pending === "save" ? "建立中…" : "確認建立，進入辦公室 →"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
