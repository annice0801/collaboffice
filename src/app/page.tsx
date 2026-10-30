import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ShowcaseFloor } from "@/components/showcase-floor";
import { DEFAULT_DEPARTMENTS, EXECUTIVES } from "@/lib/company";

// 首頁：服務介紹（Landing Page）
// 這頁不需要登入、內容固定，所以會在 build 時預先產生成靜態 HTML，打開非常快。
//
// 區塊順序：
//   Hero（主標語 + 註冊入口 + 產品示意畫面）
//   → 數字亮點 → 服務特色 → 組織架構 → 運作流程 → 誠實原則 → 常見問題 → 註冊呼籲

// 首頁展示的是範例組織（每位會員註冊後會依問卷組建自己的部門）
const DEPARTMENTS = DEFAULT_DEPARTMENTS;

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Stats />
        <OfficeShowcase />
        <Features />
        <Team />
        <HowItWorks />
        <Principle />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

// ── 共用小元件 ──────────────────────────────────────

// 區塊上方的小標（例如「服務特色」）
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-accent uppercase">
      <span className="h-px w-6 bg-accent" aria-hidden="true" />
      {children}
    </p>
  );
}

// 區塊大標題（襯線字）
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 font-serif text-3xl leading-tight font-bold text-balance sm:text-4xl">{children}</h2>
  );
}

function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 font-medium text-paper shadow-[0_8px_24px_-12px_rgb(0_0_0/0.5)] transition hover:-translate-y-0.5 hover:opacity-90"
    >
      {children}
      <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

// ── Hero ────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* 背景裝飾：淡淡的格線 + 光暈，增加層次感 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:56px_56px] opacity-50 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-0 h-[480px] w-[480px] rounded-full bg-accent/15 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-28">
        {/* min-w-0：允許格線欄位縮小，避免裡面不換行的文字把整頁撐寬（手機會出現橫向捲動） */}
        <div className="animate-rise min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            依你的需求組建專屬 AI 團隊
          </p>
          <h1 className="mt-6 font-serif text-4xl leading-[1.15] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {/* 手動斷行，避免「運轉」這類詞被拆到兩行 */}
            一句話交辦，
            <br />
            整間 <span className="text-accent">AI 公司</span>
            <br />
            為你運轉
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            把需求告訴首席秘書或總經理，總經理會拆解任務、分派給最適合的部門。專員執行、經理審閱、總經理驗收，最後交回一份經過層層把關的完整成果。
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryButton href="/sign-up">免費開設你的辦公室</PrimaryButton>
            <a href="#how" className="inline-flex items-center justify-center rounded-full px-6 py-3.5 font-medium transition hover:bg-ink/5">
              看看怎麼運作
            </a>
          </div>
          <p className="mt-5 text-sm text-muted">支援 Google 一鍵註冊・每位會員的資料完全獨立</p>
        </div>

        <div className="animate-rise min-w-0 [animation-delay:150ms]">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

// 產品示意畫面：用程式碼畫出「跟秘書對話 → 任務進度」的樣子（不是截圖）
function ProductPreview() {
  const tasks = [
    { dept: "社群內容與媒體行銷部", title: "規劃下個月命理主題內容日曆", status: "通過", tone: "done", progress: 100 },
    { dept: "社群內容與媒體行銷部", title: "撰寫 12 篇 IG 貼文文案", status: "審閱中", tone: "review", progress: 72 },
    { dept: "資產與市場情報部", title: "估算廣告投放預算（三種情境）", status: "執行中", tone: "doing", progress: 40 },
  ];
  const toneClass = {
    done: "bg-accent-soft text-accent",
    review: "bg-gold/15 text-gold",
    doing: "bg-ink/5 text-muted",
  };

  return (
    <div className="relative" aria-label="產品畫面示意" role="img">
      {/* 後方疊一張卡片，營造立體感 */}
      <div aria-hidden="true" className="absolute inset-x-6 -bottom-4 top-6 rounded-3xl border border-line bg-surface/60" />

      <div className="relative rounded-3xl border border-line bg-surface p-5 shadow-[0_40px_80px_-40px_rgb(22_21_15/0.35)] sm:p-6">
        {/* 視窗標題列 */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
          </div>
          <span className="text-xs text-muted">我的辦公室</span>
        </div>

        {/* 對話 */}
        <div className="mt-5 flex flex-col gap-3 text-sm">
          <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-paper">
            幫我規劃下個月 IG 的命理主題貼文，每週三篇，順便估算廣告預算
          </p>
          <div className="flex max-w-[90%] gap-2.5 self-start">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">
              秘
            </span>
            <p className="rounded-2xl rounded-tl-md bg-paper px-4 py-2.5">
              收到！已轉交總經理，交由<strong className="font-semibold">社群行銷部</strong>與<strong className="font-semibold">市場情報部</strong>分工處理。
            </p>
          </div>
        </div>

        {/* 任務進度 */}
        <div className="mt-6 rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">總經理已分派 3 項任務</span>
            <span className="text-muted tabular-nums">整體 71%</span>
          </div>
          <ul className="mt-4 flex flex-col gap-4">
            {tasks.map((task) => (
              <li key={task.title}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted">{task.dept}</p>
                    <p className="truncate text-sm font-medium">{task.title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass[task.tone as keyof typeof toneClass]}`}>
                    {task.status}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                  <div className="animate-fill h-full rounded-full bg-accent" style={{ width: `${task.progress}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 浮動小卡：審閱紀錄 */}
      <div className="absolute -bottom-14 -left-2 hidden rounded-2xl border border-line bg-surface px-4 py-3 text-xs shadow-lg sm:block lg:-left-10">
        <p className="font-semibold">
          <span className="text-accent">✓</span> 社群行銷部經理審閱通過
        </p>
        <p className="mt-0.5 text-muted">「主題切角清楚，CTA 一致」</p>
      </div>
    </div>
  );
}

// ── 數字亮點 ────────────────────────────────────────

function Stats() {
  const stats = [
    { value: 2, label: "位核心主管直接對話" },
    { value: 3, label: "層審閱把關" },
    { value: 6, label: "種休憩空間" },
    { value: "100%", label: "進度透明可查" },
  ];
  return (
    <section aria-label="服務亮點" className="border-y border-line bg-surface">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col items-center gap-1 py-8 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}
          >
            <dt className="order-2 text-sm text-muted">{s.label}</dt>
            <dd className="order-1 font-serif text-3xl font-bold tabular-nums sm:text-4xl">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── 立體辦公室展示 ──────────────────────────────────

function OfficeShowcase() {
  return (
    <section aria-labelledby="showcase-title" className="pt-24 sm:pt-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <Eyebrow>走進你的辦公室</Eyebrow>
          </div>
          <h2 id="showcase-title" className="mt-4 font-serif text-3xl leading-tight font-bold text-balance sm:text-4xl">
            像 Google 總部一樣的辦公室，誰在忙、誰在休息，一眼就知道
          </h2>
          <p className="mt-4 text-muted">
            有工作的成員回到座位，或帶著筆電到沙發、懶骨頭、跑步機辦公桌工作；沒事的去溜滑梯、攀岩、跳球池、按摩、做瑜伽，或到花園走走；太久沒工作就趴在桌上或鑽進睡眠艙睡覺。點會議室，大家會集合開會。
          </p>
          <h3 className="mt-10 text-lg font-semibold">選擇你喜歡的辦公環境</h3>
          <p className="mt-2 text-sm text-muted">
            每個環境的家具、服裝、窗外景色都不一樣：星際模式有飛天車和巡邏機器人，魔法學院有學院長桌和漂浮蠟燭。點辦公室旁邊的標籤就能切換；註冊時的問卷也會依你的喜好推薦最適合的環境，之後隨時可以換。
          </p>
        </div>
        <div className="mt-12">
          {/* 展示模式：用模擬資料，不需要登入 */}
          <ShowcaseFloor />
        </div>
        <p className="mt-3 text-center text-xs text-muted">展示畫面使用範例部門與模擬資料；註冊後會依你的需求組建專屬部門，看到的是你自己團隊的即時狀態。</p>
      </div>
    </section>
  );
}

// ── 服務特色 ────────────────────────────────────────

// 特色卡片用的線條圖示（自己畫的 SVG，不需要外部圖庫）
const ICONS = {
  gate: <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />,
  split: <path d="M12 4v5m0 0-6 5v6m6-11 6 5v6M12 9v11" />,
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Zm-3 9 2 2 4-4" />,
  eye: <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
};

function Features() {
  const features = [
    {
      icon: ICONS.gate,
      title: "秘書與總經理，直接對話",
      body: "生活、健康與行程找首席秘書；工作可以直接交辦總經理，也能隨時問進度。需求不清楚時，他們會先問清楚再動工。",
    },
    {
      icon: ICONS.split,
      title: "總經理拆解，精準分派",
      body: "大目標拆成具體任務，附上驗收標準與先後順序，只交給真正相關的部門，不為了忙而忙。",
    },
    {
      icon: ICONS.shield,
      title: "層層審閱，品質把關",
      body: "專員交件、經理審閱、總經理驗收。不合格就退回修改，每一版內容與審閱意見都完整保留。",
    },
    {
      icon: ICONS.eye,
      title: "進度即時，一目了然",
      body: "誰在做什麼、做到哪裡、為什麼被退回，全部即時呈現。最後附上總結報告與待你決定的事項。",
    },
  ];
  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>服務特色</Eyebrow>
          <SectionTitle>像一間真正的公司那樣分工，而不只是一個聊天機器人</SectionTitle>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
          {features.map((f) => (
            <article key={f.title} className="bg-surface p-8 transition hover:bg-paper sm:p-10">
              <svg viewBox="0 0 24 24" className="h-9 w-9 rounded-xl bg-accent-soft p-1.5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {f.icon}
              </svg>
              <h3 className="mt-6 text-xl font-semibold">{f.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 組織架構 ────────────────────────────────────────

function Team() {
  const [assistant, manager] = EXECUTIVES;
  return (
    <section id="team" className="scroll-mt-20 border-y border-line bg-surface py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <Eyebrow>組織架構</Eyebrow>
          </div>
          <SectionTitle>
            依你的需求組建部門，每位成員各司其職
          </SectionTitle>
          <p className="mt-4 text-muted">註冊後回答幾個問題，AI 組織顧問會設計你專屬的部門。以下是一位會員的團隊範例：</p>
        </div>

        {/* 你 → 兩位同職級的核心主管 */}
        <div className="mx-auto mt-14 flex max-w-2xl flex-col items-center">
          <div className="rounded-full border border-line bg-paper px-6 py-2 text-sm font-semibold">你</div>
          <span aria-hidden="true" className="h-6 w-px bg-line" />
          {/* 分岔線：往左右兩位主管 */}
          <span aria-hidden="true" className="h-px w-1/2 bg-line" />
          <div className="grid w-full grid-cols-2 gap-4">
            {[assistant, manager].map((exec, i) => (
              <div key={exec.id} className="flex flex-col items-center">
                <span aria-hidden="true" className="h-6 w-px bg-line" />
                <div className={`w-full rounded-2xl border px-4 py-4 text-center ${i === 0 ? "border-accent bg-accent text-accent-ink" : "border-ink bg-ink text-paper"}`}>
                  <p className="text-xs opacity-75">{exec.nameEn}</p>
                  <p className="mt-0.5 font-semibold">{exec.name}</p>
                  <p className="mt-1 text-xs opacity-75">{i === 0 ? "生活・健康・日程" : "交辦・分派・驗收"}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted">同一職級，都可以直接對話；工作由總經理分派給各部門</p>
          <span aria-hidden="true" className="h-8 w-px bg-line" />
        </div>

        {/* 部門 */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DEPARTMENTS.map((dept) => (
            <li key={dept.id} className="flex flex-col rounded-2xl border border-line bg-paper p-5">
              <p className="text-[11px] tracking-wide text-muted">{dept.nameEn}</p>
              <h3 className="mt-1 font-semibold">{dept.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{dept.mission}</p>
              <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm">
                {dept.staff.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    {s.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── 運作流程 ────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { title: "直接說出你要什麼", body: "跟秘書或總經理說，用平常說話的方式描述需求，例如「幫我評估社區頂樓加裝太陽能板的可行性」。" },
    { title: "總經理拆解分派", body: "目標被拆成具體任務，附上驗收標準，分派給相關部門，並排好先後順序。" },
    { title: "部門分工執行", body: "部門經理把任務交給專員執行，逐份審閱，不合格就退回修改。" },
    { title: "驗收並交回成果", body: "總經理逐條對照驗收標準，最後交給你一份總結報告與待決事項。" },
  ];
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>運作流程</Eyebrow>
          <SectionTitle>從一句話到完整成果，只要四步</SectionTitle>
        </div>
        <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              {/* 寬螢幕時，步驟之間畫一條連接線 */}
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="absolute top-6 left-14 hidden h-px w-[calc(100%-3.5rem)] bg-line md:block" />
              )}
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface font-serif text-lg font-bold">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── 誠實原則 ────────────────────────────────────────

function Principle() {
  return (
    <section aria-labelledby="principle-title" className="px-4 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-3xl bg-ink px-6 py-14 text-paper sm:px-12 md:grid-cols-[1fr_1.1fr] md:items-center md:py-16">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">我們的原則</p>
          <h2 id="principle-title" className="mt-4 font-serif text-3xl leading-tight font-bold sm:text-4xl">
            寧可說「不知道」，
            <br />
            也絕不編造。
          </h2>
          <p className="mt-5 leading-relaxed opacity-75">
            每位成員都遵守同一條規則：不捏造數據、新聞、來源或法規。拿不到的資料，會清楚標示並告訴你該去哪裡取得；審閱時發現編造的內容，一律退回。
          </p>
        </div>
        <div className="rounded-2xl border border-paper/15 bg-paper/5 p-5 font-mono text-sm leading-relaxed">
          <p className="opacity-60">## 預算估算（基準情境）</p>
          <p className="mt-2">預估單次點擊成本：NT$ 8–15（假設值）</p>
          <p className="mt-3 rounded-lg bg-gold/15 px-3 py-2 text-gold">
            ⚠ 待取得資料：過往廣告的 ROAS 與名單成本
            <br />
            <span className="opacity-80">→ 請從 Meta 廣告管理員匯出近 3 個月報表</span>
          </p>
        </div>
      </div>
    </section>
  );
}

// ── 常見問題 ────────────────────────────────────────

function Faq() {
  const faqs = [
    {
      q: "我的資料會被其他人看到嗎？",
      a: "不會。每位會員都有自己獨立的辦公室，所有總目標、任務、成果與上傳的檔案都綁定在你的帳號下，其他會員無法查看或操作。",
    },
    {
      q: "需要什麼技術背景嗎？",
      a: "不需要。就像傳訊息給秘書或主管一樣，用平常說話的方式描述你想完成的事就可以了。",
    },
    {
      q: "一個任務大概要多久？",
      a: "視內容而定。簡單的文案規劃約兩到三分鐘；需要多個部門、多輪審閱的任務會更久。你可以隨時打開辦公室查看即時進度。",
    },
    {
      q: "AI 能取得即時的股價、新聞或社群數據嗎？",
      a: "目前還不行。需要即時資料的部分，成員會明確標示「待取得資料」並說明取得方式，絕不編造。串接外部資料來源是我們接下來的重點。",
    },
    {
      q: "健康提醒、行事曆和 LINE 通知可以用了嗎？",
      a: "還在建置中。目前秘書會如實告知尚未支援，串接 Google 日曆與 LINE 後就會開放。",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-[1fr_1.6fr]">
        <div>
          <Eyebrow>常見問題</Eyebrow>
          <SectionTitle>你可能想知道</SectionTitle>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            // <details>：瀏覽器內建的展開收合，不需要額外程式
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-muted transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 註冊呼籲 ────────────────────────────────────────

function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-line bg-accent-soft px-6 py-16 text-center sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <h2 className="relative font-serif text-3xl font-bold text-balance sm:text-4xl">今天就開設你的 AI 辦公室</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-muted">註冊只要一分鐘，接著把你的第一個目標交給總經理。</p>
        <div className="relative mt-8 flex justify-center">
          <PrimaryButton href="/sign-up">免費註冊</PrimaryButton>
        </div>
      </div>
    </section>
  );
}
