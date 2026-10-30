// 「呼吸感」環境：讓辦公室看起來是活的，每個主題不一樣。
//   光影：整層樓蓋一層很淡的光，亮度慢慢起伏（像呼吸）
//   走道：小機器人偶爾沿著建築外的小徑滑過（經典、園區是掃地機器人）
//   天空：未來科技 → 流星、飛天車；魔法學院 → 魔法光點、貓頭鷹、各房間漂浮的蠟燭；經典、園區 → 飛鳥、白雲
// 全部用 SVG 動畫（animate / animateMotion），不佔模擬的運算；系統設定「減少動態效果」時不畫。

import { useSyncExternalStore } from "react";
import { spriteOf } from "@/themes";
import { project, type Plan } from "./plan";

const LIGHT: Record<string, string> = { classic: "#fff1c9", campus: "#ffffff", scifi: "#7dd3fc", magic: "#ffcf70" };

const subscribe = (cb: () => void) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", cb);
  return () => media.removeEventListener("change", cb);
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Ambient({ plan }: { plan: Plan }) {
  const still = useSyncExternalStore(subscribe, reducedMotion, () => true);
  if (still) return null;
  const { config } = plan;
  const outfit = config.outfit;
  const W = plan.buildingW;
  const H = plan.buildingH;
  const P = (x: number, y: number, z = 0) => project(plan, x, y, z);
  const sky = (x: number, y: number) => P(x, y, 0); // 建築後方的天空範圍（畫面上方）
  const [left] = P(-8, H + 8);
  const [right] = P(W + 8, -8);
  const top = P(-8, -8)[1] - 60;

  return (
    <g className="pointer-events-none">
      {/* 呼吸的光：淡淡的一層，亮度慢慢起伏 */}
      <rect x={left} y={top} width={right - left} height={plan.viewH} fill={LIGHT[outfit] ?? "#ffffff"} opacity={0}>
        <animate attributeName="opacity" values="0;0.07;0" dur="9s" repeatCount="indefinite" />
      </rect>

      {/* 走道上的小機器人：沿著建築前方、右側的小徑滑過，滑完停一會兒再出發 */}
      {[
        { from: P(-0.5, H + 1.5), to: P(W + 1.5, H + 1.5), dur: 26, delay: 0 },
        { from: P(W + 1.5, H + 1.5), to: P(W + 1.5, -0.5), dur: 30, delay: 11 },
      ].map(({ from, to, dur, delay }, i) => (
        <g key={`bot-${i}`} opacity={0}>
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.03;0.42;0.45;1" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
          <animateMotion path={`M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`} keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
          {outfit === "scifi" ? <Robot /> : outfit === "magic" ? <Wisp /> : <Vacuum />}
        </g>
      ))}

      {/* 天空 */}
      {outfit === "scifi" && <SciFiSky plan={plan} sky={sky} />}
      {outfit === "magic" && <MagicSky plan={plan} sky={sky} />}
      {(outfit === "classic" || outfit === "campus") && <DaySky plan={plan} sky={sky} />}
    </g>
  );
}

type Sky = (x: number, y: number) => [number, number];

// 小機器人：圓滾滾的身體、發光的眼睛、底下一點光暈
function Robot() {
  return (
    <g>
      <ellipse cx={0} cy={0} rx={8} ry={3} fill="#7dd3fc" opacity={0.35} />
      <rect x={-6} y={-16} width={12} height={12} rx={4} fill="#e8e6f5" stroke="#8d89b8" />
      <rect x={-4} y={-13} width={8} height={4} rx={2} fill="#232541" />
      <circle cx={-2} cy={-11} r={1} fill="#7dd3fc" />
      <circle cx={2} cy={-11} r={1} fill="#7dd3fc" />
      <line x1={0} y1={-16} x2={0} y2={-20} stroke="#8d89b8" />
      <circle cx={0} cy={-21} r={1.5} fill="#f5a623" />
    </g>
  );
}

// 掃地機器人
function Vacuum() {
  return (
    <g>
      <ellipse cx={0} cy={-2} rx={9} ry={4.5} fill="#3c4043" />
      <ellipse cx={0} cy={-4} rx={8} ry={4} fill="#5f6368" />
      <circle cx={3} cy={-5} r={1.2} fill="#34a853" />
    </g>
  );
}

// 魔法光點（像小精靈一樣飄過小徑）
function Wisp() {
  return (
    <g>
      <circle cx={0} cy={-14} r={7} fill="#fff3b0" opacity={0.3} />
      <circle cx={0} cy={-14} r={3} fill="#fff8d6" />
    </g>
  );
}

function SciFiSky({ plan, sky }: { plan: Plan; sky: Sky }) {
  const W = plan.buildingW;
  const flyers = plan.config.ambient?.flyers ?? [];
  const base = plan.config.sprites ?? "";
  return (
    <g>
      {/* 閃爍的星星 */}
      {Array.from({ length: 18 }, (_, i) => {
        const [x, y] = sky(-6 + ((i * 7) % 36), -7 - ((i * 5) % 4));
        return (
          <circle key={`star-${i}`} cx={x + ((i * 37) % 60) - 30} cy={y - 40 - ((i * 23) % 70)} r={1.2} fill="#ffffff" opacity={0.6}>
            <animate attributeName="opacity" values="0.2;0.9;0.2" dur={`${2 + (i % 4)}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        );
      })}
      {/* 流星：偶爾劃過 */}
      {[0, 1, 2].map((i) => {
        const [x, y] = sky(-4 + i * 12, -8);
        return (
          <line key={`meteor-${i}`} x1={x} y1={y - 90} x2={x - 40} y2={y - 70} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" opacity={0}>
            <animate attributeName="opacity" values="0;0.9;0;0" keyTimes="0;0.04;0.1;1" dur={`${9 + i * 4}s`} begin={`${i * 3}s`} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="translate" values={`0 0;-120 60;-120 60`} keyTimes="0;0.1;1" dur={`${9 + i * 4}s`} begin={`${i * 3}s`} repeatCount="indefinite" />
          </line>
        );
      })}
      {/* 飛天車：從左邊飛到右邊，停一下再出現 */}
      {flyers.slice(0, 3).map((name, i) => {
        const sprite = spriteOf(plan.config, name);
        if (!sprite) return null;
        const [x1, y1] = sky(-8, W * 0.2 + i * 6);
        const [x2, y2] = sky(W * 0.3 + i * 6, -8);
        return (
          <g key={`flyer-${i}`} opacity={0}>
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.45;0.5;1" dur={`${22 + i * 6}s`} begin={`${i * 7}s`} repeatCount="indefinite" />
            <animateMotion path={`M ${x1} ${y1 - 120} L ${x2} ${y2 - 140}`} keyPoints="0;1;1" keyTimes="0;0.5;1" calcMode="linear" dur={`${22 + i * 6}s`} begin={`${i * 7}s`} repeatCount="indefinite" />
            <image href={base + sprite.file} x={-sprite.w / 2} y={-sprite.h / 2} width={sprite.w} height={sprite.h} />
          </g>
        );
      })}
    </g>
  );
}

function MagicSky({ plan, sky }: { plan: Plan; sky: Sky }) {
  const W = plan.buildingW;
  const candleRooms = plan.rooms.filter((r) => plan.config.ambient?.candles?.includes(r.kind));
  return (
    <g>
      {/* 魔法光點：慢慢往上飄、一閃一閃 */}
      {Array.from({ length: 16 }, (_, i) => {
        const [x, y] = sky(-6 + ((i * 9) % 40), -6 + ((i * 7) % 10));
        return (
          <circle key={`spark-${i}`} cx={x} cy={y - 30} r={2} fill="#fff3b0" opacity={0}>
            <animate attributeName="opacity" values="0;0.9;0" dur={`${4 + (i % 3)}s`} begin={`${i * 0.7}s`} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="translate" values="0 0;6 -40" dur={`${4 + (i % 3)}s`} begin={`${i * 0.7}s`} repeatCount="indefinite" />
          </circle>
        );
      })}
      {/* 貓頭鷹飛過 */}
      {Array.from({ length: plan.config.ambient?.owls ?? 0 }, (_, i) => {
        const [x1, y1] = sky(-8, W * 0.3 + i * 5);
        const [x2, y2] = sky(W * 0.4 + i * 5, -8);
        return (
          <g key={`owl-${i}`} opacity={0}>
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.45;1" dur={`${20 + i * 5}s`} begin={`${3 + i * 6}s`} repeatCount="indefinite" />
            <animateMotion path={`M ${x1} ${y1 - 110} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 200} ${x2} ${y2 - 120}`} keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" dur={`${20 + i * 5}s`} begin={`${3 + i * 6}s`} repeatCount="indefinite" />
            <Owl />
          </g>
        );
      })}
      {/* 漂浮的蠟燭：在房間上方慢慢上下浮動 */}
      {candleRooms.flatMap((room) =>
        [[2, 2.5], [5, 2.2], [3.5, 5], [6, 5.4]].map(([dx, dy], i) => {
          const [x, y] = project(plan, room.ox + dx, room.oy + dy, 96);
          return (
            <g key={`${room.id}-candle-${i}`} transform={`translate(${x} ${y})`}>
              <g>
                <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur={`${3 + (i % 2)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
                <circle cx={0} cy={-9} r={6} fill="#ffcf70" opacity={0.25} />
                <rect x={-1.5} y={-6} width={3} height={8} fill="#f8f1dc" />
                <ellipse cx={0} cy={-8} rx={1.5} ry={2.5} fill="#ffb347" />
              </g>
            </g>
          );
        }),
      )}
    </g>
  );
}

function Owl() {
  return (
    <g>
      <path d="M -12 0 Q -6 -6 0 -1 Q 6 -6 12 0" fill="none" stroke="#7a5a3a" strokeWidth={3}>
        <animate attributeName="d" values="M -12 0 Q -6 -6 0 -1 Q 6 -6 12 0;M -12 -4 Q -6 2 0 -1 Q 6 2 12 -4;M -12 0 Q -6 -6 0 -1 Q 6 -6 12 0" dur="0.6s" repeatCount="indefinite" />
      </path>
      <ellipse cx={0} cy={-1} rx={4} ry={5} fill="#a07a50" />
      <circle cx={-1.5} cy={-3} r={1.2} fill="#fff3b0" />
      <circle cx={1.5} cy={-3} r={1.2} fill="#fff3b0" />
    </g>
  );
}

function DaySky({ plan, sky }: { plan: Plan; sky: Sky }) {
  const W = plan.buildingW;
  return (
    <g>
      {/* 白雲：慢慢飄過 */}
      {[0, 1].map((i) => {
        const [x, y] = sky(-4 + i * 14, -8);
        return (
          <g key={`cloud-${i}`} opacity={0.75}>
            <animateTransform attributeName="transform" type="translate" values="-60 0;80 -40;-60 0" dur={`${60 + i * 20}s`} repeatCount="indefinite" />
            <ellipse cx={x} cy={y - 90} rx={34} ry={12} fill="#ffffff" />
            <ellipse cx={x - 16} cy={y - 96} rx={18} ry={10} fill="#ffffff" />
            <ellipse cx={x + 14} cy={y - 98} rx={20} ry={12} fill="#ffffff" />
          </g>
        );
      })}
      {/* 一群飛鳥 */}
      {[0, 1, 2].map((i) => {
        const [x1, y1] = sky(-8, W * 0.3);
        const [x2, y2] = sky(W * 0.5, -8);
        return (
          <g key={`bird-${i}`} opacity={0}>
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.4;0.45;1" dur="24s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
            <animateMotion path={`M ${x1 + i * 14} ${y1 - 120 + i * 8} L ${x2 + i * 14} ${y2 - 150 + i * 8}`} keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" dur="24s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
            <path d="M -6 0 Q -3 -4 0 0 Q 3 -4 6 0" fill="none" stroke="#3c4043" strokeWidth={1.6}>
              <animate attributeName="d" values="M -6 0 Q -3 -4 0 0 Q 3 -4 6 0;M -6 -3 Q -3 1 0 0 Q 3 1 6 -3;M -6 0 Q -3 -4 0 0 Q 3 -4 6 0" dur="0.5s" repeatCount="indefinite" />
            </path>
          </g>
        );
      })}
    </g>
  );
}
