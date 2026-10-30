"use client";

// 第一人稱的辦公桌：像坐在自己的辦公室裡往前看。
//   遠景（窗外）→ 牆面與窗框 → 兩側擺設 → 近景桌面，移動滑鼠（手機傾斜）時越近的層動得越多，產生深度。
//   桌上：螢幕顯示公司的本週、本月、年度目標（可以打勾）；筆記本點開可以寫筆記；旁邊貼著便利貼。
// 畫布固定 1600 × 900，依視窗大小等比例縮放（桌面貼齊畫面底部）。

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DESK_SCENES, type DeskOutfit } from "./scenes";

type Period = "week" | "month" | "year";
type Goal = { id: string; title: string; due: string; done: boolean; period?: Period };
type Sticky = { id: string; text: string; color: "yellow" | "pink" | "blue" | "green" };

const STICKY_COLORS: Record<Sticky["color"], string> = { yellow: "#fff3a6", pink: "#ffd1e3", blue: "#cde8ff", green: "#d4f5d0" };
const PERIOD_NAMES: Record<Period, string> = { week: "本週", month: "本月", year: "年度" };
const W = 1600;
const H = 900;

export function DeskView({ outfit, userName, companyName }: { outfit: DeskOutfit; userName: string; companyName: string }) {
  const scene = DESK_SCENES[outfit];
  // ── 畫布縮放：蓋滿視窗；直式手機改成寬度剛好（上方用底色補滿） ──
  const [box, setBox] = useState({ scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = Math.min(Math.max(w / W, h / H), w / 1100);
      setBox({ scale, left: (w - W * scale) / 2, top: h - H * scale });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── 視差：滑鼠位置（或手機傾斜角度）→ -1 ~ 1 ──
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => setTilt({ x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 });
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      setTilt({ x: Math.max(-1, Math.min(1, e.gamma / 25)), y: Math.max(-1, Math.min(1, (e.beta - 45) / 25)) });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);
  // depth：0 最遠（幾乎不動）、1 最近（動最多）
  const layer = (depth: number) => ({
    transform: `translate(${-tilt.x * depth * 36}px, ${-tilt.y * depth * 18}px) scale(${1 + depth * 0.04})`,
    transition: "transform 0.25s ease-out",
  });

  // ── 時間（螢幕上的日期與招呼語）──
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);
  const hour = now?.getHours() ?? 9;
  const greeting = hour < 11 ? "早安" : hour < 14 ? "午安" : hour < 18 ? "下午好" : "晚安";

  // ── 公司目標（螢幕）──
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  useEffect(() => {
    fetch("/api/office/company")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setGoals(data?.goals ?? []))
      .catch(() => setGoals([]));
  }, []);
  const toggleGoal = (id: string) => {
    if (!goals) return;
    const next = goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g));
    setGoals(next);
    fetch("/api/office/company", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ goals: next }) });
  };
  const shown = (goals ?? []).filter((g) => (g.period ?? "year") === period);

  // ── 筆記本與便利貼 ──
  const [notebook, setNotebook] = useState("");
  const [stickies, setStickies] = useState<Sticky[]>([]);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    fetch("/api/desk")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setNotebook(data.notebook);
        setStickies(data.stickies);
      })
      .catch(() => {});
  }, []);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (update: { notebook?: string; stickies?: Sticky[] }, wait = 800) => {
    setSaved("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await fetch("/api/desk", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(update) });
      setSaved(res.ok ? "saved" : "idle");
    }, wait);
  };
  const editNotebook = (text: string) => {
    setNotebook(text);
    save({ notebook: text });
  };
  const [stickyText, setStickyText] = useState("");
  const [stickyColor, setStickyColor] = useState<Sticky["color"]>("yellow");
  const addSticky = (event: React.FormEvent) => {
    event.preventDefault();
    if (!stickyText.trim() || stickies.length >= 12) return;
    const next = [...stickies, { id: crypto.randomUUID(), text: stickyText.trim(), color: stickyColor }];
    setStickies(next);
    setStickyText("");
    save({ stickies: next }, 0);
  };
  const removeSticky = (id: string) => {
    const next = stickies.filter((s) => s.id !== id);
    setStickies(next);
    save({ stickies: next }, 0);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const svg = (children: React.ReactNode) => (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0 overflow-visible" aria-hidden="true">
      {children}
    </svg>
  );
  const holo = scene.monitor === "holo";
  const parchment = scene.monitor === "parchment";

  return (
    <main className="fixed inset-0 overflow-hidden select-none" style={{ background: scene.bg }}>
      <div className="absolute origin-top-left" style={{ width: W, height: H, left: box.left, top: box.top, transform: `scale(${box.scale})` }}>
        {/* 遠景：窗外（稍微模糊，像隔著玻璃） */}
        <div className="absolute inset-0" style={{ ...layer(0.15), filter: "blur(0.6px)" }}>{svg(<scene.Outside />)}</div>
        {/* 牆面與窗框 */}
        <div className="absolute inset-0" style={layer(0.35)}>{svg(<scene.Wall />)}</div>
        {/* 兩側的擺設 */}
        <div className="absolute inset-0" style={layer(0.55)}>{svg(<scene.Props />)}</div>

        {/* 近景：桌面與桌上的東西 */}
        <div className="absolute inset-0" style={layer(1)}>
          {svg(
            <g>
              {/* 桌面：越近越寬（透視） */}
              <polygon points="-120,900 1720,900 1380,640 220,640" fill={scene.desk.top} />
              <polygon points="220,640 1380,640 1392,652 208,652" fill={scene.desk.edge} />
              {scene.desk.glow && <line x1={220} y1={641} x2={1380} y2={641} stroke={scene.desk.glow} strokeWidth={3} opacity={0.8} />}
              <polygon points="-120,900 1720,900 1720,940 -120,940" fill={scene.desk.front} />
              {/* 桌燈的光 */}
              <ellipse cx={360} cy={700} rx={220} ry={60} fill={scene.desk.glow ?? "#fff1c9"} opacity={0.12} />
              <DeskProp outfit={outfit} />
              {/* 杯子與蒸氣 */}
              <g>
                <rect x={1290} y={690} width={70} height={80} rx={10} fill={outfit === "magic" ? "#8e2b2b" : outfit === "scifi" ? "#2ec4b6" : "#ffffff"} stroke="#00000033" />
                <path d="M 1360 708 q 26 0 26 22 q 0 22 -26 22" fill="none" stroke={outfit === "magic" ? "#8e2b2b" : "#cccccc"} strokeWidth={8} />
                {[0, 1, 2].map((i) => (
                  <path key={i} d={`M ${1310 + i * 14} 680 q 8 -14 0 -28 q -8 -14 0 -28`} fill="none" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" opacity={0}>
                    <animate attributeName="opacity" values="0;0.6;0" dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
                    <animateTransform attributeName="transform" type="translate" values="0 0;0 -20" dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
                  </path>
                ))}
              </g>
              {/* 名牌 */}
              <polygon points="690,840 910,840 900,800 700,800" fill={scene.desk.edge} />
              <text x={800} y={828} textAnchor="middle" fontSize={20} fontWeight={700} fill={outfit === "campus" ? "#ffffff" : "#2b1b12"}>
                {`老闆 ${userName}`}
              </text>
            </g>,
          )}

          {/* 螢幕（魔法學院是一張浮在桌上的羊皮紙）：公司目標 */}
          <section
            aria-label="公司目標"
            className="absolute flex flex-col overflow-hidden"
            style={{
              left: 470,
              top: 330,
              width: 480,
              height: 300,
              borderRadius: parchment ? 6 : 14,
              padding: 18,
              color: scene.ink,
              background: holo ? "rgba(11,13,36,0.72)" : parchment ? "#f3e2b8" : scene.monitor === "light" ? "#ffffff" : "#1f2430",
              border: holo ? "2px solid #7dd3fc" : parchment ? "3px solid #c9a26a" : "12px solid #2b2b2b",
              boxShadow: holo ? "0 0 40px rgba(125,211,252,0.45)" : "0 20px 40px rgba(0,0,0,0.35)",
              backdropFilter: holo ? "blur(2px)" : undefined,
              fontFamily: parchment ? "var(--font-noto-serif-tc), serif" : undefined,
            }}
          >
            <div className="flex items-baseline justify-between">
              <p className="text-[22px] font-bold" style={{ color: scene.monitor === "screen" ? "#ffffff" : scene.ink }}>
                {greeting}，{userName}
              </p>
              <p className="text-[15px] opacity-70" style={{ color: scene.monitor === "screen" ? "#ffffff" : scene.ink }}>
                {now?.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" })}
              </p>
            </div>
            <div className="mt-2 flex gap-1.5" role="tablist" aria-label="目標期間">
              {(["week", "month", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className="rounded-full px-3 py-0.5 text-[15px]"
                  style={{
                    background: period === p ? (holo ? "#7dd3fc" : parchment ? "#8a5a3b" : scene.monitor === "light" ? "#4285f4" : "#c9a227") : "transparent",
                    color: period === p ? (holo ? "#0b0d24" : "#ffffff") : scene.monitor === "screen" ? "#ffffff" : scene.ink,
                    border: `1px solid ${holo ? "#7dd3fc" : parchment ? "#8a5a3b" : scene.monitor === "light" ? "#4285f4" : "#c9a227"}`,
                  }}
                >
                  {PERIOD_NAMES[p]}目標
                </button>
              ))}
            </div>
            <ul className="mt-3 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1 text-[16px]" style={{ color: scene.monitor === "screen" ? "#ffffff" : scene.ink }}>
              {goals === null && <li className="opacity-60">讀取中…</li>}
              {goals !== null && shown.length === 0 && <li className="opacity-60">還沒有{PERIOD_NAMES[period]}目標，可以在辦公室點老闆辦公室新增。</li>}
              {shown.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={g.done} onChange={() => toggleGoal(g.id)} className="mt-1 size-4" />
                    <span className={g.done ? "line-through opacity-50" : ""}>
                      {g.title}
                      {g.due && <span className="ml-2 text-[13px] opacity-60">{g.due}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          {/* 螢幕腳架 */}
          {!holo && !parchment && <div className="absolute" style={{ left: 690, top: 630, width: 40, height: 40, background: "#2b2b2b" }} />}

          {/* 便利貼：貼在螢幕右邊 */}
          <div className="absolute flex flex-col gap-2" style={{ left: 965, top: 340, width: 120 }}>
            {stickies.slice(0, 4).map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpen(true)}
                className="p-2 text-left text-[13px] leading-snug shadow-md"
                style={{ background: STICKY_COLORS[s.color], transform: `rotate(${i % 2 ? 3 : -2}deg)`, color: "#3b2f2a" }}
              >
                {s.text.slice(0, 30)}
              </button>
            ))}
          </div>

          {/* 筆記本：點開可以寫 */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="打開筆記本"
            className="absolute text-left transition hover:brightness-105"
            style={{
              left: 1000,
              top: 690,
              width: 250,
              height: 150,
              transform: "perspective(600px) rotateX(48deg) rotateZ(-6deg)",
              transformOrigin: "bottom center",
              background: outfit === "magic" ? "#6b2f2f" : outfit === "scifi" ? "#2b2d42" : outfit === "campus" ? "#34a853" : "#5a3a22",
              borderRadius: 8,
              padding: 10,
              boxShadow: "0 18px 30px rgba(0,0,0,0.35)",
            }}
          >
            <span className="block h-full overflow-hidden rounded p-2 text-[15px] leading-snug whitespace-pre-wrap" style={{ background: scene.paper, color: "#3b2f2a" }}>
              {notebook.trim() ? notebook.slice(0, 80) : "📝 點我寫筆記"}
            </span>
          </button>
        </div>
      </div>

      {/* 上方：回辦公室、畫面名稱 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <Link href="/office" className="pointer-events-auto rounded-full bg-white/90 px-4 py-1.5 text-sm text-[#16150f] shadow backdrop-blur hover:bg-white">
          ← 回到辦公室
        </Link>
        <p className="rounded-full bg-black/40 px-4 py-1.5 text-sm text-white backdrop-blur">
          {scene.name}・{companyName}
        </p>
      </header>

      {/* 筆記本（展開） */}
      {open && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="我的筆記本"
            className="flex max-h-full w-[min(760px,100%)] flex-col gap-4 rounded-2xl p-5 shadow-2xl sm:flex-row"
            style={{ background: scene.paper, color: "#3b2f2a" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-[260px] flex-1 flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">📒 我的筆記</h2>
                <span className="text-xs opacity-60">{saved === "saving" ? "儲存中…" : saved === "saved" ? "✓ 已儲存" : "自動儲存"}</span>
              </div>
              <textarea
                value={notebook}
                onChange={(e) => editNotebook(e.target.value)}
                maxLength={20000}
                autoFocus
                placeholder="今天想到的點子、待辦、會議筆記…"
                className="mt-2 flex-1 resize-none rounded-lg border border-black/10 bg-white/60 p-3 text-base leading-relaxed outline-none focus:border-black/30"
                style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, rgba(0,0,0,0.06) 28px)" }}
              />
            </div>
            <div className="flex w-full flex-col sm:w-56">
              <h2 className="text-lg font-bold">便利貼</h2>
              <ul className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
                {stickies.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 rounded p-2 text-sm shadow-sm" style={{ background: STICKY_COLORS[s.color] }}>
                    <span className="flex-1 break-words">{s.text}</span>
                    <button type="button" onClick={() => removeSticky(s.id)} className="text-xs opacity-50 hover:opacity-100" aria-label={`撕掉便利貼「${s.text}」`}>
                      ✕
                    </button>
                  </li>
                ))}
                {!stickies.length && <li className="text-sm opacity-60">還沒有便利貼</li>}
              </ul>
              <form onSubmit={addSticky} className="mt-3 flex flex-col gap-2">
                <input
                  value={stickyText}
                  onChange={(e) => setStickyText(e.target.value)}
                  maxLength={200}
                  placeholder="寫一張便利貼"
                  className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-base outline-none focus:border-black/30 sm:text-sm"
                />
                <div className="flex items-center gap-1.5">
                  {(Object.keys(STICKY_COLORS) as Sticky["color"][]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setStickyColor(c)}
                      aria-label={`便利貼顏色：${c}`}
                      aria-pressed={stickyColor === c}
                      className={`size-6 rounded ${stickyColor === c ? "ring-2 ring-black/50" : ""}`}
                      style={{ background: STICKY_COLORS[c] }}
                    />
                  ))}
                  <button type="submit" disabled={!stickyText.trim() || stickies.length >= 12} className="ml-auto rounded-lg bg-[#3b2f2a] px-3 py-1 text-sm text-white disabled:opacity-40">
                    貼上
                  </button>
                </div>
              </form>
              <button type="button" onClick={() => setOpen(false)} className="mt-auto pt-4 text-sm opacity-70 hover:opacity-100">
                收起筆記本
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// 桌上左邊的主題小物：全像投影、水晶球、黃銅檯燈、彩色檯燈
function DeskProp({ outfit }: { outfit: DeskOutfit }) {
  if (outfit === "scifi")
    return (
      <g>
        <ellipse cx={330} cy={720} rx={60} ry={16} fill="#3d3f66" />
        <path d="M 290 715 L 330 600 L 370 715 Z" fill="#7dd3fc" opacity={0.15} />
        <g>
          <animateTransform attributeName="transform" type="rotate" values="0 330 600;360 330 600" dur="10s" repeatCount="indefinite" />
          <circle cx={330} cy={600} r={34} fill="none" stroke="#7dd3fc" strokeWidth={2} />
          <ellipse cx={330} cy={600} rx={34} ry={12} fill="none" stroke="#7dd3fc" strokeWidth={2} />
        </g>
      </g>
    );
  if (outfit === "magic")
    return (
      <g>
        <rect x={300} y={700} width={60} height={20} rx={4} fill="#d4a24c" />
        <circle cx={330} cy={660} r={46} fill="#a5b4fc" opacity={0.55} />
        <circle cx={330} cy={660} r={46} fill="none" stroke="#e0e7ff" strokeWidth={2} />
        <circle cx={318} cy={645} r={10} fill="#ffffff" opacity={0.6} />
        <circle cx={340} cy={668} r={14} fill="#c084fc" opacity={0.5}>
          <animate attributeName="r" values="10;18;10" dur="3s" repeatCount="indefinite" />
        </circle>
        {/* 羽毛筆與墨水瓶 */}
        <rect x={420} y={730} width={30} height={34} rx={6} fill="#1f2937" />
        <path d="M 440 732 Q 470 650 520 610 Q 480 660 446 734 Z" fill="#f8f1dc" />
      </g>
    );
  return (
    <g>
      <ellipse cx={330} cy={740} rx={50} ry={12} fill={outfit === "campus" ? "#ea4335" : "#8a6a2a"} />
      <rect x={326} y={600} width={8} height={140} fill={outfit === "campus" ? "#ea4335" : "#c9a227"} />
      <path d="M 280 610 L 380 610 L 360 560 L 300 560 Z" fill={outfit === "campus" ? "#fbbc05" : "#2f5d50"} />
      <ellipse cx={330} cy={640} rx={80} ry={30} fill="#fff1c9" opacity={0.25} />
    </g>
  );
}
