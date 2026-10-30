// 第一人稱辦公桌的場景（每個主題一套），畫布固定 1600 × 900，分成四層做出遠近：
//   Outside：窗外的遠景（星空與行星、城堡夜景、城市天際線、綠色園區）
//   Wall   ：牆面與窗框（窗戶的地方挖空，看得到後面的遠景）
//   Props  ：兩側的中景擺設（全像面板、書牆與漂浮蠟燭、書櫃與植物…）
//   desk   ：近景的桌面顏色（桌上的螢幕、筆記本、杯子在 desk-view.tsx 用 HTML 疊上去，才能點擊）
// 滑鼠移動（手機傾斜）時，越近的層移動越多，看起來就有深度。

import type { ReactNode } from "react";

export type DeskOutfit = "classic" | "campus" | "scifi" | "magic";

export type DeskScene = {
  name: string; //                  畫面標題
  bg: string; //                    畫布外的底色
  Outside: () => ReactNode;
  Wall: () => ReactNode;
  Props: () => ReactNode;
  desk: { top: string; edge: string; front: string; glow?: string };
  monitor: "screen" | "holo" | "parchment" | "light"; // 桌上螢幕的樣式
  ink: string; //                   畫面上文字的顏色（螢幕、筆記本）
  paper: string; //                 筆記本紙張顏色
};

// 固定的亂數（同一個 i 每次都一樣，畫面不會每次重整都不同）。
// 伺服器和瀏覽器算 sin、cos 的最後幾位小數可能不同，會造成畫面對不上（hydration mismatch），所以一律四捨五入
const round = (v: number) => Math.round(v * 1000) / 1000;
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return round(x - Math.floor(x));
};
const cos = (a: number) => round(Math.cos(a));
const sin = (a: number) => round(Math.sin(a));

// 牆面：整面牆減掉窗戶（fillRule evenodd 挖洞）
const wallWithHoles = (fill: string, holes: string) => <path d={`M -40 -40 H 1640 V 940 H -40 Z ${holes}`} fill={fill} fillRule="evenodd" />;

// ── 星際模式 ─────────────────────────────────────
const SCIFI_WINDOW = "M 320 120 H 1280 Q 1340 120 1340 180 V 520 Q 1340 580 1280 580 H 320 Q 260 580 260 520 V 180 Q 260 120 320 120 Z";

const scifi: DeskScene = {
  name: "星際艦橋",
  bg: "#0b0d24",
  desk: { top: "#2b2d42", edge: "#7dd3fc", front: "#1d1f33", glow: "#7dd3fc" },
  monitor: "holo",
  ink: "#e0f7ff",
  paper: "#eef4ff",
  Outside: () => (
    <g>
      <defs>
        <radialGradient id="space" cx="0.6" cy="0.35" r="0.9">
          <stop offset="0" stopColor="#2a2366" />
          <stop offset="1" stopColor="#070818" />
        </radialGradient>
        <radialGradient id="planet" cx="0.35" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#ffd1a6" />
          <stop offset="0.6" stopColor="#f28c6b" />
          <stop offset="1" stopColor="#6b2f5a" />
        </radialGradient>
      </defs>
      <rect x={-40} y={-40} width={1680} height={980} fill="url(#space)" />
      {/* 星雲 */}
      <ellipse cx={500} cy={260} rx={320} ry={120} fill="#9b5de5" opacity={0.22} />
      <ellipse cx={760} cy={360} rx={260} ry={90} fill="#2ec4b6" opacity={0.18} />
      {/* 星星：一部分會閃 */}
      {Array.from({ length: 140 }, (_, i) => (
        <circle key={i} cx={rand(i) * 1600} cy={rand(i + 500) * 640} r={rand(i + 900) * 1.6 + 0.4} fill="#ffffff" opacity={0.4 + rand(i + 1300) * 0.6}>
          {i % 6 === 0 && <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2 + rand(i) * 3}s`} repeatCount="indefinite" />}
        </circle>
      ))}
      {/* 有環的行星與小衛星 */}
      <circle cx={1120} cy={300} r={130} fill="url(#planet)" />
      <ellipse cx={1120} cy={305} rx={220} ry={38} fill="none" stroke="#ffd9b8" strokeWidth={10} opacity={0.6} transform="rotate(-12 1120 305)" />
      <circle cx={880} cy={190} r={26} fill="#c9c6e0" />
      <circle cx={872} cy={184} r={6} fill="#a9a5cc" />
      {/* 遠方的太空站 */}
      <g opacity={0.8}>
        <rect x={420} y={420} width={160} height={10} fill="#8d89b8" />
        <rect x={490} y={380} width={20} height={90} fill="#8d89b8" />
        <circle cx={500} cy={425} r={22} fill="#c3c0e6" />
      </g>
      {/* 飛天車：從左飛到右 */}
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={0}>
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.45;1" dur={`${14 + i * 5}s`} begin={`${i * 4}s`} repeatCount="indefinite" />
          <animateMotion path={`M -80 ${220 + i * 110} L 1700 ${160 + i * 120}`} keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" dur={`${14 + i * 5}s`} begin={`${i * 4}s`} repeatCount="indefinite" />
          <path d="M -26 0 L 18 -6 L 30 0 L 18 6 Z" fill="#e8e6f5" />
          <rect x={-10} y={-10} width={16} height={6} rx={3} fill="#7dd3fc" />
          <ellipse cx={-30} cy={0} rx={10} ry={3} fill="#f5a623" opacity={0.8} />
        </g>
      ))}
    </g>
  ),
  Wall: () => (
    <g>
      <defs>
        <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d3f66" />
          <stop offset="0.25" stopColor="#c3c0e6" />
          <stop offset="1" stopColor="#a8a4d4" />
        </linearGradient>
      </defs>
      {wallWithHoles("url(#hull)", SCIFI_WINDOW)}
      {/* 天花板燈條 */}
      <rect x={-40} y={-40} width={1680} height={90} fill="#232541" />
      {[200, 600, 1000, 1400].map((x) => (
        <rect key={x} x={x - 120} y={38} width={240} height={8} rx={4} fill="#7dd3fc">
          <animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" />
        </rect>
      ))}
      {/* 艙壁接縫與發光色帶 */}
      {[120, 1480].map((x) => (
        <line key={x} x1={x} y1={60} x2={x} y2={900} stroke="#8d89b8" strokeWidth={3} />
      ))}
      <rect x={-40} y={610} width={1680} height={14} fill="#f5a623" />
      {/* 窗框：圓角大舷窗 + 兩根窗櫺 */}
      <path d={SCIFI_WINDOW} fill="none" stroke="#e8e6f5" strokeWidth={22} />
      <path d={SCIFI_WINDOW} fill="none" stroke="#8d89b8" strokeWidth={6} />
      {[640, 960].map((x) => (
        <rect key={x} x={x - 9} y={120} width={18} height={460} fill="#e8e6f5" />
      ))}
      <path d={SCIFI_WINDOW} fill="#7dd3fc" opacity={0.06} />
    </g>
  ),
  Props: () => (
    <g>
      {/* 左側：全像資料面板 */}
      <g>
        <rect x={40} y={230} width={170} height={300} rx={10} fill="#7dd3fc" opacity={0.18} stroke="#7dd3fc" strokeWidth={2} />
        <polyline points="60,470 90,430 120,450 150,380 190,400" fill="none" stroke="#7dd3fc" strokeWidth={3} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={60} y={260 + i * 30} width={60 + rand(i) * 70} height={10} rx={5} fill="#7dd3fc" opacity={0.6} />
        ))}
        <rect x={100} y={530} width={40} height={90} fill="#3d3f66" />
      </g>
      {/* 右側：伺服器機櫃，燈號閃爍 */}
      <g>
        <rect x={1400} y={200} width={170} height={420} rx={8} fill="#2b2d42" />
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <rect x={1418} y={220 + i * 32} width={134} height={22} rx={3} fill="#3d3f66" />
            <circle cx={1536} cy={231 + i * 32} r={4} fill={i % 3 ? "#2ec4b6" : "#f5a623"}>
              <animate attributeName="opacity" values="1;0.2;1" dur={`${0.8 + rand(i) * 1.6}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </g>
      {/* 漂浮的小機器人 */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="1250 380;1250 360;1250 380" dur="3s" repeatCount="indefinite" />
        <ellipse cx={0} cy={40} rx={22} ry={6} fill="#7dd3fc" opacity={0.3} />
        <rect x={-24} y={-20} width={48} height={40} rx={14} fill="#e8e6f5" stroke="#8d89b8" strokeWidth={2} />
        <rect x={-16} y={-10} width={32} height={14} rx={7} fill="#232541" />
        <circle cx={-7} cy={-3} r={3} fill="#7dd3fc" />
        <circle cx={7} cy={-3} r={3} fill="#7dd3fc" />
      </g>
    </g>
  ),
};

// ── 魔法學院 ─────────────────────────────────────
const ARCH = (x: number, y: number, w: number, h: number) => `M ${x} ${y + h} V ${y + w / 2} Q ${x} ${y} ${x + w / 2} ${y - w * 0.25} Q ${x + w} ${y} ${x + w} ${y + w / 2} V ${y + h} Z`;
const MAGIC_WINDOWS = [ARCH(600, 170, 400, 420), ARCH(440, 250, 120, 340), ARCH(1040, 250, 120, 340)];

const magic: DeskScene = {
  name: "校長書房",
  bg: "#120e1f",
  desk: { top: "#6b3f22", edge: "#d4a24c", front: "#4a2a16", glow: "#ffcf70" },
  monitor: "parchment",
  ink: "#3b2416",
  paper: "#f6ecd0",
  Outside: () => (
    <g>
      <defs>
        <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1238" />
          <stop offset="1" stopColor="#3b2f6b" />
        </linearGradient>
      </defs>
      <rect x={-40} y={-40} width={1680} height={980} fill="url(#night)" />
      {Array.from({ length: 90 }, (_, i) => (
        <circle key={i} cx={rand(i + 40) * 1600} cy={rand(i + 77) * 420} r={rand(i + 3) * 1.4 + 0.4} fill="#fff8d6" opacity={0.5 + rand(i) * 0.5}>
          {i % 5 === 0 && <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2 + rand(i) * 3}s`} repeatCount="indefinite" />}
        </circle>
      ))}
      <circle cx={860} cy={250} r={70} fill="#fff3c4" />
      <circle cx={880} cy={240} r={70} fill="#2a2a5a" opacity={0.15} />
      {/* 遠方的山與城堡塔樓 */}
      <path d="M -40 600 L 300 420 L 520 540 L 760 380 L 1000 520 L 1260 410 L 1640 600 Z" fill="#241c45" />
      {[[700, 330], [820, 300], [940, 340]].map(([x, y], i) => (
        <g key={i} fill="#1a1433">
          <rect x={x - 22} y={y} width={44} height={260} />
          <path d={`M ${x - 30} ${y} L ${x} ${y - 70} L ${x + 30} ${y} Z`} />
          <rect x={x - 5} y={y + 40} width={10} height={16} fill="#ffcf70" />
        </g>
      ))}
      {/* 貓頭鷹飛過 */}
      {[0, 1].map((i) => (
        <g key={i} opacity={0}>
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.45;1" dur={`${16 + i * 6}s`} begin={`${i * 5}s`} repeatCount="indefinite" />
          <animateMotion path={`M -60 ${300 + i * 60} Q 800 ${150 + i * 40} 1700 ${280 + i * 50}`} keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" dur={`${16 + i * 6}s`} begin={`${i * 5}s`} repeatCount="indefinite" />
          <path d="M -18 0 Q -9 -10 0 -2 Q 9 -10 18 0" fill="none" stroke="#c9a26a" strokeWidth={4}>
            <animate attributeName="d" values="M -18 0 Q -9 -10 0 -2 Q 9 -10 18 0;M -18 -6 Q -9 4 0 -2 Q 9 4 18 -6;M -18 0 Q -9 -10 0 -2 Q 9 -10 18 0" dur="0.6s" repeatCount="indefinite" />
          </path>
          <ellipse cx={0} cy={-1} rx={6} ry={7} fill="#a07a50" />
        </g>
      ))}
    </g>
  ),
  Wall: () => (
    <g>
      {wallWithHoles("#3b2416", MAGIC_WINDOWS.join(" "))}
      {/* 木牆板 */}
      {Array.from({ length: 17 }, (_, i) => (
        <line key={i} x1={i * 100} y1={0} x2={i * 100} y2={900} stroke="#2a180d" strokeWidth={2} opacity={0.5} />
      ))}
      {/* 圓頂天窗（彩繪玻璃） */}
      <g>
        <ellipse cx={800} cy={-10} rx={420} ry={150} fill="#2a180d" />
        <ellipse cx={800} cy={-10} rx={380} ry={128} fill="#1d3b7a" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI;
          return <line key={i} x1={800} y1={-10} x2={800 + cos(a) * 380} y2={-10 + sin(a) * 128} stroke="#d4a24c" strokeWidth={4} />;
        })}
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={800 + cos(((i + 0.5) / 12) * Math.PI) * 240} cy={-10 + sin(((i + 0.5) / 12) * Math.PI) * 80} r={16} fill={["#5b8def", "#9b5de5", "#2ec4b6"][i % 3]} opacity={0.75} />
        ))}
        <ellipse cx={800} cy={-10} rx={110} ry={40} fill="none" stroke="#d4a24c" strokeWidth={5} />
      </g>
      {/* 彩繪玻璃：窗框與彩色玻璃片（半透明，看得到外面） */}
      {MAGIC_WINDOWS.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#2a180d" strokeWidth={18} />
          <path d={d} fill="none" stroke="#d4a24c" strokeWidth={4} />
        </g>
      ))}
      <g opacity={0.32}>
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={610 + (i % 6) * 64} y={220 + Math.floor(i / 6) * 90} width={58} height={84} fill={["#5b8def", "#9b5de5", "#e9c46a", "#2ec4b6", "#d62828"][i % 5]} />
        ))}
      </g>
      {[700, 800, 900].map((x) => (
        <line key={x} x1={x} y1={130} x2={x} y2={590} stroke="#2a180d" strokeWidth={6} />
      ))}
      {[300, 400, 500].map((y) => (
        <line key={y} x1={600} y1={y} x2={1000} y2={y} stroke="#2a180d" strokeWidth={6} />
      ))}
    </g>
  ),
  Props: () => (
    <g>
      {/* 兩側從地板到天花板的書牆 */}
      {[0, 1].map((side) => {
        const x0 = side ? 1200 : 0;
        return (
          <g key={side}>
            <rect x={x0} y={60} width={400} height={760} fill="#4a2a16" />
            {Array.from({ length: 6 }, (_, row) => (
              <g key={row}>
                <rect x={x0} y={170 + row * 110} width={400} height={14} fill="#2a180d" />
                {Array.from({ length: 18 }, (_, k) => {
                  const r = rand(side * 1000 + row * 50 + k);
                  return <rect key={k} x={x0 + 14 + k * 21} y={170 + row * 110 - 60 - r * 30} width={17} height={60 + r * 30} fill={["#8e2b2b", "#1f4e8c", "#1f6b3a", "#d9a521", "#5b3a8c", "#7a4a2a"][Math.floor(r * 6)]} />;
                })}
              </g>
            ))}
          </g>
        );
      })}
      {/* 漂浮蠟燭：上下浮動、火焰閃爍 */}
      {Array.from({ length: 10 }, (_, i) => {
        const x = 200 + i * 135 + rand(i) * 40;
        const y = 150 + rand(i + 20) * 120;
        return (
          <g key={i}>
            <animateTransform attributeName="transform" type="translate" values={`0 0;0 -12;0 0`} dur={`${3 + rand(i) * 2}s`} repeatCount="indefinite" />
            <circle cx={x} cy={y - 16} r={18} fill="#ffcf70" opacity={0.2} />
            <rect x={x - 6} y={y - 6} width={12} height={36} fill="#f8f1dc" />
            <ellipse cx={x} cy={y - 12} rx={5} ry={9} fill="#ffb347">
              <animate attributeName="ry" values="9;11;8;9" dur="0.9s" repeatCount="indefinite" />
            </ellipse>
          </g>
        );
      })}
    </g>
  ),
};

// ── 經典商務 ─────────────────────────────────────
const CLASSIC_WINDOW = "M 300 100 H 1300 V 600 H 300 Z";

const classic: DeskScene = {
  name: "總裁辦公室",
  bg: "#e9dfcc",
  desk: { top: "#6b4a2e", edge: "#c9a227", front: "#4f3520" },
  monitor: "screen",
  ink: "#16150f",
  paper: "#fffaf0",
  Outside: () => (
    <g>
      <defs>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fbfe6" />
          <stop offset="0.7" stopColor="#f7d9b0" />
          <stop offset="1" stopColor="#f2b880" />
        </linearGradient>
      </defs>
      <rect x={-40} y={-40} width={1680} height={980} fill="url(#dusk)" />
      <circle cx={1050} cy={430} r={70} fill="#fff1c9" opacity={0.9} />
      {/* 白雲慢慢飄 */}
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={0.85}>
          <animateTransform attributeName="transform" type="translate" values={`-200 0;300 0;-200 0`} dur={`${70 + i * 25}s`} repeatCount="indefinite" />
          <ellipse cx={400 + i * 420} cy={180 + i * 40} rx={90} ry={26} fill="#ffffff" />
          <ellipse cx={360 + i * 420} cy={168 + i * 40} rx={50} ry={22} fill="#ffffff" />
        </g>
      ))}
      {/* 城市天際線（越遠越淡） */}
      {[0, 1].map((layer) =>
        Array.from({ length: 22 }, (_, i) => {
          const w = 50 + rand(i + layer * 99) * 60;
          const h = (layer ? 120 : 200) + rand(i + 7 + layer * 99) * (layer ? 120 : 200);
          const x = i * 75 + layer * 30;
          return (
            <g key={`${layer}-${i}`}>
              <rect x={x} y={640 - h} width={w} height={h} fill={layer ? "#9aa9bd" : "#5d6f88"} opacity={layer ? 0.6 : 1} />
              {!layer &&
                Array.from({ length: Math.floor(h / 30) }, (_, k) => (
                  <rect key={k} x={x + 8} y={650 - h + k * 30} width={w - 16} height={6} fill="#ffe7a8" opacity={rand(i * 31 + k) > 0.55 ? 0.8 : 0.15} />
                ))}
            </g>
          );
        }),
      )}
    </g>
  ),
  Wall: () => (
    <g>
      {wallWithHoles("#efe6d6", CLASSIC_WINDOW)}
      <rect x={-40} y={560} width={1680} height={380} fill="#8a6440" />
      <rect x={-40} y={556} width={1680} height={8} fill="#c9a227" />
      {/* 落地窗框 */}
      <path d={CLASSIC_WINDOW} fill="none" stroke="#3a3a3a" strokeWidth={14} />
      {[633, 966].map((x) => (
        <rect key={x} x={x - 5} y={100} width={10} height={500} fill="#3a3a3a" />
      ))}
      <rect x={300} y={345} width={1000} height={8} fill="#3a3a3a" />
      <path d={CLASSIC_WINDOW} fill="#bfe0f2" opacity={0.12} />
    </g>
  ),
  Props: () => (
    <g>
      {/* 左：書櫃 */}
      <rect x={20} y={160} width={240} height={560} fill="#6b4a2e" />
      {Array.from({ length: 5 }, (_, row) => (
        <g key={row}>
          <rect x={20} y={250 + row * 100} width={240} height={10} fill="#4f3520" />
          {Array.from({ length: 10 }, (_, k) => {
            const r = rand(row * 20 + k + 300);
            return <rect key={k} x={32 + k * 22} y={250 + row * 100 - 56 - r * 24} width={18} height={56 + r * 24} fill={["#8e2b2b", "#2f4a6b", "#c08a2e", "#3f8a5c", "#555b66"][Math.floor(r * 5)]} />;
          })}
        </g>
      ))}
      {/* 右：大盆栽 */}
      <rect x={1390} y={560} width={130} height={150} rx={10} fill="#c08a5a" />
      {Array.from({ length: 9 }, (_, i) => (
        <ellipse key={i} cx={1455 + cos(i) * 60} cy={460 + sin(i * 1.7) * 70} rx={60} ry={34} fill={i % 2 ? "#3f8a4a" : "#57a862"} transform={`rotate(${i * 40} ${1455 + cos(i) * 60} ${460 + sin(i * 1.7) * 70})`} />
      ))}
    </g>
  ),
};

// ── 科技園區 ─────────────────────────────────────
const CAMPUS_WINDOW = "M 260 110 H 1340 Q 1360 110 1360 130 V 590 H 240 V 130 Q 240 110 260 110 Z";

const campus: DeskScene = {
  name: "園區工作室",
  bg: "#e8f4fb",
  desk: { top: "#f5f5f5", edge: "#4285f4", front: "#dadce0" },
  monitor: "light",
  ink: "#202124",
  paper: "#ffffff",
  Outside: () => (
    <g>
      <rect x={-40} y={-40} width={1680} height={980} fill="#bfe6fb" />
      <circle cx={1250} cy={180} r={60} fill="#fff6c9" />
      {[0, 1].map((i) => (
        <g key={i}>
          <animateTransform attributeName="transform" type="translate" values="-150 0;250 0;-150 0" dur={`${60 + i * 30}s`} repeatCount="indefinite" />
          <ellipse cx={420 + i * 520} cy={190 + i * 30} rx={80} ry={24} fill="#ffffff" />
        </g>
      ))}
      {/* 綠色山丘與彩色建築 */}
      <path d="M -40 520 Q 300 400 700 480 T 1640 450 V 940 H -40 Z" fill="#8fd17a" />
      <path d="M -40 580 Q 500 500 1000 560 T 1640 540 V 940 H -40 Z" fill="#79c566" />
      {["#4285f4", "#ea4335", "#fbbc05", "#34a853"].map((c, i) => (
        <g key={c}>
          <rect x={380 + i * 230} y={380 - (i % 2) * 40} width={150} height={190 + (i % 2) * 40} rx={10} fill={c} />
          {Array.from({ length: 3 }, (_, k) => (
            <rect key={k} x={400 + i * 230} y={410 - (i % 2) * 40 + k * 50} width={110} height={20} rx={4} fill="#ffffff" opacity={0.7} />
          ))}
        </g>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <rect x={300 + i * 150} y={560} width={10} height={40} fill="#7a4f2c" />
          <circle cx={305 + i * 150} cy={548} r={28} fill="#3f8a4a" />
        </g>
      ))}
      {/* 熱氣球 */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;40 -30;0 0" dur="20s" repeatCount="indefinite" />
        <ellipse cx={560} cy={230} rx={34} ry={42} fill="#ea4335" />
        <path d="M 540 262 L 548 290 H 572 L 580 262" fill="#fbbc05" />
      </g>
    </g>
  ),
  Wall: () => (
    <g>
      {wallWithHoles("#ffffff", CAMPUS_WINDOW)}
      {["#4285f4", "#ea4335", "#fbbc05", "#34a853"].map((c, i) => (
        <rect key={c} x={-40 + i * 420} y={610} width={420} height={14} fill={c} />
      ))}
      <path d={CAMPUS_WINDOW} fill="none" stroke="#dadce0" strokeWidth={10} />
      {[600, 980].map((x) => (
        <rect key={x} x={x - 4} y={110} width={8} height={480} fill="#dadce0" />
      ))}
    </g>
  ),
  Props: () => (
    <g>
      {/* 吊掛植物 */}
      {[120, 1480].map((x, i) => (
        <g key={x}>
          <line x1={x} y1={0} x2={x} y2={180} stroke="#9aa0a6" strokeWidth={3} />
          <path d={`M ${x - 40} 180 H ${x + 40} L ${x + 30} 230 H ${x - 30} Z`} fill={i ? "#fbbc05" : "#ea4335"} />
          {Array.from({ length: 7 }, (_, k) => (
            <ellipse key={k} cx={x - 36 + k * 12} cy={250 + (k % 3) * 30} rx={8} ry={34} fill="#34a853" />
          ))}
        </g>
      ))}
      {/* 懶骨頭 */}
      <ellipse cx={140} cy={700} rx={140} ry={70} fill="#4285f4" />
      <ellipse cx={1460} cy={700} rx={140} ry={70} fill="#fbbc05" />
    </g>
  ),
};

export const DESK_SCENES: Record<DeskOutfit, DeskScene> = { scifi, magic, classic, campus };
