"use client";

// 彈珠台：右邊的發射道拉彈簧把彈珠打上去，沿著上方的圓弧滾進檯面，
// 用下方左右兩支擋板把彈珠打回去，撞糖果彈跳柱、點亮星星得分。
//
// 物理：每一幀拆成 8 個小步驟（彈珠很快時才不會穿牆），
// 牆、擋板都是「線段＋厚度」，彈跳柱、星星是圓形。座標用固定的 420 × 760，畫的時候再縮放。

import { useCallback, useEffect, useRef, useState } from "react";
import { CANDY, Card, loadBest, saveBest } from "../game-shell";
import { HoldButton } from "../hold-button";

const W = 420;
const H = 760;
const R = 9; //            彈珠半徑
const GRAVITY = 900; //    往下的加速度（檯面傾斜的感覺）
const MAX_SPEED = 1800;
const SUBSTEPS = 8;
const BALLS = 3;
const BEST_KEY = "collaboffice:pinball-best";

const LANE_X = 372; //     發射道左邊的隔板
const ARC = { x: 213, y: 210, r: 199 }; // 上方圓弧
const PLUNGER_Y = 712; //  彈簧頂端（沒拉的時候）
const LANE_BALL = { x: 392, y: PLUNGER_Y - R };

type V = { x: number; y: number };
type Seg = { a: V; b: V; e: number; kick?: number; score?: number; gate?: boolean };
type Bumper = { x: number; y: number; r: number; color: string; flash: number };
type Star = { x: number; y: number; lit: boolean };
type Flipper = { pivot: V; side: 1 | -1; len: number; angle: number; prev: number; up: boolean };
type Status = "ready" | "playing" | "paused" | "over";

const REST = 0.52; //  擋板放下的角度（往下斜）
const UP = -0.42; //   擋板打上去的角度

// 上方圓弧拆成很多小段
const arcSegs: Seg[] = Array.from({ length: 28 }, (_, i) => {
  const a0 = Math.PI + (i / 28) * Math.PI;
  const a1 = Math.PI + ((i + 1) / 28) * Math.PI;
  return {
    a: { x: ARC.x + ARC.r * Math.cos(a0), y: ARC.y + ARC.r * Math.sin(a0) },
    b: { x: ARC.x + ARC.r * Math.cos(a1), y: ARC.y + ARC.r * Math.sin(a1) },
    e: 0.5,
  };
});
const mirror = (x: number) => 386 - x; // 檯面左右對稱（中線 x = 193）
const WALLS: Seg[] = [
  ...arcSegs,
  { a: { x: 14, y: ARC.y }, b: { x: 14, y: H + 40 }, e: 0.5 }, //            左牆
  { a: { x: 412, y: ARC.y }, b: { x: 412, y: H + 40 }, e: 0.5 }, //          右牆
  { a: { x: LANE_X, y: 262 }, b: { x: LANE_X, y: H + 40 }, e: 0.4 }, //      發射道隔板
  { a: { x: 410, y: 236 }, b: { x: LANE_X, y: 264 }, e: 0.4, gate: true }, // 單向門：彈珠進場後關上，不會掉回發射道
  // 下方導板：把彈珠導向擋板
  { a: { x: 14, y: 560 }, b: { x: 118, y: 652 }, e: 0.3 },
  { a: { x: LANE_X, y: 560 }, b: { x: mirror(118), y: 652 }, e: 0.3 },
  // 彈弓（撞到會被彈開）
  { a: { x: 74, y: 500 }, b: { x: 74, y: 575 }, e: 0.9, kick: 380, score: 10 },
  { a: { x: mirror(74), y: 500 }, b: { x: mirror(74), y: 575 }, e: 0.9, kick: 380, score: 10 },
];

function newBumpers(): Bumper[] {
  return [
    { x: 128, y: 280, r: 26, color: CANDY.pink, flash: 0 },
    { x: 258, y: 280, r: 26, color: CANDY.yellow, flash: 0 },
    { x: 193, y: 372, r: 26, color: CANDY.sky, flash: 0 },
  ];
}
const newStars = (): Star[] => [
  { x: 118, y: 150, lit: false },
  { x: 193, y: 118, lit: false },
  { x: 268, y: 150, lit: false },
];
const newFlippers = (): Flipper[] => [
  { pivot: { x: 122, y: 662 }, side: 1, len: 68, angle: REST, prev: REST, up: false },
  { pivot: { x: mirror(122), y: 662 }, side: -1, len: 68, angle: REST, prev: REST, up: false },
];
// 擋板的方向（左擋板往右、右擋板往左）
const dirOf = (f: Flipper, a = f.angle): V => ({ x: f.side * Math.cos(a), y: Math.sin(a) });

type Game = {
  ball: V & { vx: number; vy: number };
  inPlay: boolean; //   已經離開發射道
  pull: number; //      彈簧拉了多少（0～1）
  pulling: boolean;
  bumpers: Bumper[];
  stars: Star[];
  flippers: Flipper[];
  score: number;
  balls: number;
  status: Status;
  respawnAt: number;
  popups: { x: number; y: number; text: string; until: number }[];
};

function newGame(status: Status = "ready"): Game {
  return {
    ball: { ...LANE_BALL, vx: 0, vy: 0 },
    inPlay: false,
    pull: 0,
    pulling: false,
    bumpers: newBumpers(),
    stars: newStars(),
    flippers: newFlippers(),
    score: 0,
    balls: BALLS,
    status,
    respawnAt: 0,
    popups: [],
  };
}

// 彈珠撞到一條線段（thick：線段的厚度；surface：撞擊點的表面速度，擋板揮動時用）
function hitSegment(g: Game, a: V, b: V, thick: number, e: number, surface?: (p: V) => V): V | null {
  const ball = g.ball;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((ball.x - a.x) * abx + (ball.y - a.y) * aby) / (abx * abx + aby * aby)));
  const c = { x: a.x + abx * t, y: a.y + aby * t };
  const dx = ball.x - c.x;
  const dy = ball.y - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= R + thick || dist === 0) return null;
  const n = { x: dx / dist, y: dy / dist };
  ball.x += n.x * (R + thick - dist);
  ball.y += n.y * (R + thick - dist);
  const s = surface?.(c) ?? { x: 0, y: 0 };
  const rvx = ball.vx - s.x;
  const rvy = ball.vy - s.y;
  const vn = rvx * n.x + rvy * n.y;
  if (vn < 0) {
    ball.vx = rvx - (1 + e) * vn * n.x + s.x;
    ball.vy = rvy - (1 + e) * vn * n.y + s.y;
  }
  return n;
}

function hitCircle(g: Game, cx: number, cy: number, r: number): V | null {
  const ball = g.ball;
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist >= R + r || dist === 0) return null;
  const n = { x: dx / dist, y: dy / dist };
  ball.x = cx + n.x * (R + r);
  ball.y = cy + n.y * (R + r);
  const vn = ball.vx * n.x + ball.vy * n.y;
  if (vn < 0) {
    ball.vx -= 1.6 * vn * n.x;
    ball.vy -= 1.6 * vn * n.y;
  }
  return n;
}

export function Pinball() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(newGame());
  const [hud, setHud] = useState({ score: 0, balls: BALLS, status: "ready" as Status, best: 0 });

  const sync = useCallback(() => {
    const g = game.current;
    setHud((h) => {
      // 第一次同步時讀出這台瀏覽器的最高分（畫面每 0.2 秒同步一次）
      const best = Math.max(h.best || loadBest(BEST_KEY), g.score);
      if (best > h.best) saveBest(BEST_KEY, best);
      return { score: g.score, balls: g.balls, status: g.status, best };
    });
  }, []);

  const start = useCallback(() => {
    game.current = newGame("playing");
    sync();
  }, [sync]);
  const togglePause = useCallback(() => {
    const g = game.current;
    if (g.status === "playing") g.status = "paused";
    else if (g.status === "paused") g.status = "playing";
    sync();
  }, [sync]);

  // 操作：擋板、彈簧
  const flip = useCallback((side: 1 | -1, up: boolean) => {
    const f = game.current.flippers.find((x) => x.side === side);
    if (f) f.up = up;
  }, []);
  const plunger = useCallback(
    (down: boolean) => {
      const g = game.current;
      if (g.status === "ready" || g.status === "over") {
        if (down) start();
        return;
      }
      if (down) {
        g.pulling = true;
        return;
      }
      // 放開：彈珠還在彈簧上就打出去，拉越多打越遠
      if (g.pulling && !g.inPlay && g.ball.x > LANE_X && g.ball.y > PLUNGER_Y - 40) {
        g.ball.vy = -(650 + g.pull * 1150);
      }
      g.pulling = false;
      g.pull = 0;
    },
    [start],
  );

  // ── 鍵盤 ──
  useEffect(() => {
    const LEFT = ["ArrowLeft", "z", "Z", "a", "A"];
    const RIGHT = ["ArrowRight", "m", "M", "/", "d", "D"];
    const PLUNGE = [" ", "ArrowDown", "Enter"];
    const onDown = (e: KeyboardEvent) => {
      if ([...LEFT, ...RIGHT, ...PLUNGE, "ArrowUp"].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      if (e.key === "p" || e.key === "P" || e.key === "Escape") return togglePause();
      if (LEFT.includes(e.key)) flip(1, true);
      if (RIGHT.includes(e.key)) flip(-1, true);
      if (PLUNGE.includes(e.key)) plunger(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (LEFT.includes(e.key)) flip(1, false);
      if (RIGHT.includes(e.key)) flip(-1, false);
      if (PLUNGE.includes(e.key)) plunger(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [flip, plunger, togglePause]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && game.current.status === "playing") togglePause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [togglePause]);

  // ── 物理 + 畫面 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    let last = performance.now();
    let frame = 0;
    const popup = (g: Game, x: number, y: number, text: string, now: number) => g.popups.push({ x, y, text, until: now + 900 });

    const physics = (g: Game, dt: number, now: number) => {
      g.pull = g.pulling ? Math.min(1, g.pull + dt * 1.2) : g.pull;
      for (let s = 0; s < SUBSTEPS; s++) {
        const h = dt / SUBSTEPS;
        // 擋板轉動
        for (const f of g.flippers) {
          f.prev = f.angle;
          const target = f.up ? UP : REST;
          const speed = f.up ? 22 : 11;
          f.angle += Math.max(-speed * h, Math.min(speed * h, target - f.angle));
        }
        const ball = g.ball;
        // 還在彈簧上：跟著彈簧往下拉
        const onPlunger = !g.inPlay && ball.x > LANE_X && ball.y >= PLUNGER_Y - R - 2 && ball.vy >= 0;
        if (onPlunger) {
          ball.y = PLUNGER_Y - R + g.pull * 36;
          ball.vy = 0;
          ball.vx = 0;
          continue;
        }
        ball.vy += GRAVITY * h;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > MAX_SPEED) {
          ball.vx *= MAX_SPEED / speed;
          ball.vy *= MAX_SPEED / speed;
        }
        ball.x += ball.vx * h;
        ball.y += ball.vy * h;
        if (!g.inPlay && ball.x < LANE_X - R) g.inPlay = true;

        for (const w of WALLS) {
          if (w.gate && !g.inPlay) continue;
          const n = hitSegment(g, w.a, w.b, 3, w.e);
          if (n && w.kick) {
            ball.vx += n.x * w.kick;
            ball.vy += n.y * w.kick;
            g.score += w.score ?? 0;
          }
        }
        // 彈簧頂端（發射道底部）
        if (!g.inPlay && ball.x > LANE_X && ball.y > PLUNGER_Y - R && ball.vy > 0) {
          ball.y = PLUNGER_Y - R;
          ball.vy = 0;
        }
        for (const b of g.bumpers) {
          const n = hitCircle(g, b.x, b.y, b.r);
          if (n) {
            ball.vx += n.x * 420;
            ball.vy += n.y * 420;
            if (now > b.flash) {
              g.score += 100;
              popup(g, b.x, b.y - b.r - 6, "+100", now);
            }
            b.flash = now + 160;
          }
        }
        for (const star of g.stars) {
          if (hitCircle(g, star.x, star.y, 11) && !star.lit) {
            star.lit = true;
            g.score += 250;
            popup(g, star.x, star.y - 18, "+250", now);
            if (g.stars.every((x) => x.lit)) {
              g.score += 2000;
              popup(g, 193, 200, "星星全亮！+2000", now);
              setTimeout(() => g.stars.forEach((x) => (x.lit = false)), 1200);
            }
          }
        }
        for (const f of g.flippers) {
          const tip = { x: f.pivot.x + dirOf(f).x * f.len, y: f.pivot.y + dirOf(f).y * f.len };
          const omega = (f.angle - f.prev) / h;
          // 擋板上每一點的速度＝離支點的距離 × 轉速（方向垂直於擋板）
          hitSegment(g, f.pivot, tip, 7, 0.35, (p) => {
            const dist = Math.hypot(p.x - f.pivot.x, p.y - f.pivot.y);
            const d = { x: -f.side * Math.sin(f.angle), y: Math.cos(f.angle) };
            return { x: d.x * dist * omega, y: d.y * dist * omega };
          });
        }
      }

      // 掉到擋板下面：這顆彈珠結束
      if (g.ball.y > H + 30 && !g.respawnAt) {
        g.balls -= 1;
        if (g.balls <= 0) g.status = "over";
        else {
          g.respawnAt = now + 900;
          popup(g, 193, 600, "加油！再一顆", now);
        }
        sync();
      }
      if (g.respawnAt && now >= g.respawnAt) {
        g.respawnAt = 0;
        g.inPlay = false;
        g.ball = { ...LANE_BALL, vx: 0, vy: 0 };
      }
    };

    const draw = (g: Game, now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 檯面：淡紫到薄荷綠的漸層 + 小圓點
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#f1e8ff");
      bg.addColorStop(1, "#e2faf2");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(179,136,255,0.13)";
      for (let y = 20; y < H; y += 28) for (let x = 20 + ((y / 28) % 2) * 14; x < W; x += 28) ctx.fillRect(x, y, 3, 3);

      // 上方的彩虹
      ["#ffb3c8", "#ffe29a", "#b8f0d8", "#bfe3ff"].forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(193, 250, 150 - i * 10, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      });
      ctx.fillStyle = "rgba(59,47,74,0.18)";
      ctx.font = "bold 22px var(--font-pixel), sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("COLLAB", 193, 470);

      // 牆
      ctx.lineCap = "round";
      for (const w of WALLS) {
        if (w.gate && !g.inPlay) continue;
        ctx.strokeStyle = w.kick ? CANDY.coral : "#b388ff";
        ctx.lineWidth = w.kick ? 9 : 7;
        ctx.beginPath();
        ctx.moveTo(w.a.x, w.a.y);
        ctx.lineTo(w.b.x, w.b.y);
        ctx.stroke();
      }
      // 發射道的箭頭
      ctx.fillStyle = "rgba(255,143,184,0.55)";
      for (let i = 0; i < 4; i++) {
        const y = 600 - i * 70;
        ctx.beginPath();
        ctx.moveTo(392, y - 12);
        ctx.lineTo(384, y);
        ctx.lineTo(400, y);
        ctx.fill();
      }

      // 彈簧
      const top = PLUNGER_Y + g.pull * 36;
      ctx.strokeStyle = "#9aa0a6";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) ctx.lineTo(392 + (i % 2 ? 8 : -8), top + 6 + ((H - top - 6) * i) / 8);
      ctx.stroke();
      ctx.fillStyle = CANDY.pink;
      ctx.beginPath();
      ctx.roundRect(378, top, 28, 9, 4);
      ctx.fill();

      // 星星
      for (const s of g.stars) {
        ctx.fillStyle = s.lit ? CANDY.yellow : "rgba(255,255,255,0.8)";
        ctx.strokeStyle = s.lit ? "#e0a800" : "#c9b8f5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const d = i % 2 ? 6 : 14;
          ctx.lineTo(s.x + d * Math.cos(a), s.y + d * Math.sin(a));
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 糖果彈跳柱（有笑臉，被撞到時變大發光）
      for (const b of g.bumpers) {
        const hit = now < b.flash;
        const r = b.r + (hit ? 4 : 0);
        if (hit) {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.arc(b.x, b.y, r + 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(b.x, b.y, r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.ellipse(b.x - r * 0.35, b.y - r * 0.4, r * 0.35, r * 0.2, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3b2f4a";
        ctx.strokeStyle = "#3b2f4a";
        ctx.lineWidth = 2;
        if (hit) {
          // 被撞到：眼睛變成 > <
          ctx.beginPath();
          ctx.moveTo(b.x - 11, b.y - 6);
          ctx.lineTo(b.x - 6, b.y - 3);
          ctx.lineTo(b.x - 11, b.y);
          ctx.moveTo(b.x + 11, b.y - 6);
          ctx.lineTo(b.x + 6, b.y - 3);
          ctx.lineTo(b.x + 11, b.y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(b.x - 8, b.y - 3, 2.6, 0, Math.PI * 2);
          ctx.arc(b.x + 8, b.y - 3, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(b.x, b.y + 3, 6, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }

      // 擋板
      for (const f of g.flippers) {
        const d = dirOf(f);
        ctx.strokeStyle = "#e0a800";
        ctx.lineWidth = 17;
        ctx.beginPath();
        ctx.moveTo(f.pivot.x, f.pivot.y);
        ctx.lineTo(f.pivot.x + d.x * f.len, f.pivot.y + d.y * f.len);
        ctx.stroke();
        ctx.strokeStyle = CANDY.yellow;
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(f.pivot.x, f.pivot.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 彈珠
      const { x, y } = g.ball;
      if (y < H + R) {
        const shine = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, R);
        shine.addColorStop(0, "#ffffff");
        shine.addColorStop(1, "#b9c3d6");
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8d97ad";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 得分泡泡
      g.popups = g.popups.filter((p) => p.until > now);
      ctx.font = "bold 15px var(--font-geist-sans), sans-serif";
      for (const p of g.popups) {
        const life = (p.until - now) / 900;
        ctx.globalAlpha = Math.min(1, life * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(p.text, p.x + 1, p.y - (1 - life) * 24 + 1);
        ctx.fillStyle = "#d6336c";
        ctx.fillText(p.text, p.x, p.y - (1 - life) * 24);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      const g = game.current;
      const dt = Math.min(1 / 30, (t - last) / 1000);
      last = t;
      if (g.status === "playing") physics(g, dt, t);
      draw(g, t);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    // 分數每 0.2 秒同步一次就好
    const timer = setInterval(sync, 200);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [sync]);

  // 觸控：點畫面左半邊是左擋板、右半邊是右擋板（可以同時按）
  const touches = useRef(new Map<number, 1 | -1>());
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (game.current.status !== "playing") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? 1 : -1;
    touches.current.set(e.pointerId, side);
    flip(side, true);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const side = touches.current.get(e.pointerId);
    touches.current.delete(e.pointerId);
    if (side && ![...touches.current.values()].includes(side)) flip(side, false);
  };

  const button = "select-none touch-none rounded-2xl bg-white px-4 py-3 text-sm font-bold shadow-[0_4px_0_rgba(59,47,74,0.15)] ring-1 ring-black/5 active:translate-y-0.5 active:shadow-none";
  return (
    <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label={`彈珠台，目前 ${hud.score} 分，剩 ${hud.balls} 顆彈珠`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block touch-none rounded-[2rem] shadow-[0_8px_0_rgba(59,47,74,0.1)] ring-4 ring-white"
          style={{ height: "min(760px, calc(100dvh - 250px))", aspectRatio: `${W} / ${H}`, maxWidth: "92vw" }}
        />
        {hud.status !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[2rem] bg-white/70 p-4 text-center backdrop-blur-sm">
            {hud.status === "ready" && <p className="text-lg font-bold">彈珠準備好了！</p>}
            {hud.status === "paused" && <p className="text-2xl font-bold">休息一下</p>}
            {hud.status === "over" && (
              <>
                <p className="text-2xl font-bold">遊戲結束</p>
                <p className="text-sm" style={{ color: CANDY.soft }}>
                  得分 {hud.score.toLocaleString()}{hud.score >= hud.best && hud.score > 0 ? "・新紀錄！🎉" : ""}
                </p>
              </>
            )}
            <button
              type="button"
              onClick={hud.status === "paused" ? togglePause : start}
              className="rounded-full px-6 py-2.5 font-bold text-white shadow-[0_4px_0_#e0679a] active:translate-y-0.5 active:shadow-none"
              style={{ background: CANDY.pink }}
            >
              {hud.status === "paused" ? "繼續玩" : hud.status === "over" ? "再玩一次" : "開始遊戲"}
            </button>
          </div>
        )}
      </div>

      <div className="flex w-full max-w-[420px] flex-col gap-3 sm:w-48">
        <Card>
          <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-1">
            <div>
              <dt className="text-xs" style={{ color: CANDY.soft }}>分數</dt>
              <dd className="font-bold tabular-nums">{hud.score.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: CANDY.soft }}>彈珠</dt>
              <dd className="tracking-widest" aria-label={`剩 ${hud.balls} 顆`}>
                {Array.from({ length: BALLS }, (_, i) => (i < hud.balls ? "●" : "○")).join("")}
              </dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: CANDY.soft }}>最高分</dt>
              <dd className="font-bold tabular-nums">{hud.best.toLocaleString()}</dd>
            </div>
          </dl>
        </Card>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
          <HoldButton className={button} onPress={() => flip(1, true)} onRelease={() => flip(1, false)}>◀ 左擋板</HoldButton>
          <HoldButton className={button} style={{ background: CANDY.pink, color: "#fff" }} onPress={() => plunger(true)} onRelease={() => plunger(false)}>
            🚀 發射
          </HoldButton>
          <HoldButton className={button} onPress={() => flip(-1, true)} onRelease={() => flip(-1, false)}>右擋板 ▶</HoldButton>
        </div>
        {hud.status === "playing" && (
          <button type="button" onClick={togglePause} className="hidden rounded-full bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-black/5 sm:block">
            ⏸ 暫停
          </button>
        )}
      </div>
    </div>
  );
}
