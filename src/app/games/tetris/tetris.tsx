"use client";

// 俄羅斯方塊：10 × 20 的盤面，七種糖果色方塊（每塊都有小眼睛，落地後會瞇眼睡覺）。
// 遊戲狀態放在 ref 裡，每一幀直接畫到 canvas；分數、下一個方塊這些顯示用的資料才放 state。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CANDY, Card, loadBest, saveBest } from "../game-shell";
import { HoldButton } from "../hold-button";

const COLS = 10;
const ROWS = 20;
const CELL = 30; // 一格幾像素（canvas 內部座標）
const BEST_KEY = "collaboffice:tetris-best";

type Kind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
const KINDS: Kind[] = ["I", "O", "T", "S", "Z", "J", "L"];
const SHAPES: Record<Kind, number[][]> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORS: Record<Kind, string> = {
  I: CANDY.sky,
  O: CANDY.yellow,
  T: CANDY.lilac,
  S: CANDY.green,
  Z: CANDY.coral,
  J: CANDY.blue,
  L: CANDY.orange,
};
const LINE_SCORE = [0, 100, 300, 500, 800];
const CHEERS = ["", "", "雙消！", "三消！好厲害！", "四消！太神啦！"];

type Board = (Kind | null)[][];
type Piece = { kind: Kind; m: number[][]; x: number; y: number };
type Status = "ready" | "playing" | "paused" | "over";
type Game = {
  board: Board;
  piece: Piece | null;
  queue: Kind[];
  score: number;
  lines: number;
  level: number;
  status: Status;
  acc: number; //                                      距離下一次自動往下掉累積了多久（毫秒）
  clearing: { rows: number[]; until: number } | null; // 正在消除的列（閃一下再消）
};
type Hud = { score: number; lines: number; level: number; next: Kind; status: Status; best: number; cheer: string };

const noop = () => () => {};
const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array<Kind | null>(COLS).fill(null));
// 7 個一包隨機發牌，不會連續很久都等不到長條
const bag = (): Kind[] => [...KINDS].sort(() => Math.random() - 0.5);
const rotate = (m: number[][]) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
const speedOf = (level: number) => Math.max(90, 800 - (level - 1) * 70);

function fits(board: Board, m: number[][], x: number, y: number): boolean {
  return m.every((row, j) =>
    row.every((v, i) => {
      if (!v) return true;
      const bx = x + i;
      const by = y + j;
      return bx >= 0 && bx < COLS && by < ROWS && (by < 0 || !board[by][bx]);
    }),
  );
}

// 開局前的空盤面（不洗牌：頁面會在 build 時預先產生，那時不能用亂數；按「開始」才發牌）
function newGame(): Game {
  return { board: emptyBoard(), piece: null, queue: [], score: 0, lines: 0, level: 1, status: "ready", acc: 0, clearing: null };
}

// 畫一格：圓角糖果方塊 + 亮面 + 小眼睛（awake：還在掉的方塊睜眼，落地後瞇眼）
function drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, awake: boolean, size = CELL) {
  const x = cx * size;
  const y = cy * size;
  const r = size * 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, size - 3, size - 3, r);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, size - 12, size * 0.22, r * 0.6);
  ctx.fill();
  ctx.fillStyle = "#3b2f4a";
  ctx.strokeStyle = "#3b2f4a";
  ctx.lineWidth = 1.4;
  const ey = y + size * 0.55;
  if (awake) {
    ctx.beginPath();
    ctx.arc(x + size * 0.34, ey, size * 0.065, 0, Math.PI * 2);
    ctx.arc(x + size * 0.66, ey, size * 0.065, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x + size * 0.34, ey - 1, size * 0.08, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.moveTo(x + size * 0.74, ey);
    ctx.arc(x + size * 0.66, ey - 1, size * 0.08, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,143,184,0.45)";
  ctx.beginPath();
  ctx.arc(x + size * 0.2, ey + size * 0.14, size * 0.07, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, ey + size * 0.14, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

export function Tetris() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(newGame());
  // 開局前先顯示這台瀏覽器存的最高分（伺服器上沒有，顯示 0）
  const storedBest = useSyncExternalStore(noop, () => loadBest(BEST_KEY), () => 0);
  const [hud, setHud] = useState<Hud>({ score: 0, lines: 0, level: 1, next: "T", status: "ready", best: 0, cheer: "" });

  // 把遊戲狀態同步到畫面上的分數板
  const sync = useCallback((cheer?: string) => {
    const g = game.current;
    setHud((h) => {
      const best = Math.max(h.best || loadBest(BEST_KEY), g.score);
      if (best > h.best) saveBest(BEST_KEY, best);
      return { score: g.score, lines: g.lines, level: g.level, next: g.queue[0], status: g.status, best, cheer: cheer ?? h.cheer };
    });
  }, []);


  const spawn = useCallback(() => {
    const g = game.current;
    const kind = g.queue.shift()!;
    if (g.queue.length < 7) g.queue.push(...bag());
    const m = SHAPES[kind];
    const piece = { kind, m, x: Math.floor((COLS - m[0].length) / 2), y: kind === "I" ? -1 : 0 };
    if (!fits(g.board, m, piece.x, piece.y)) {
      g.piece = null;
      g.status = "over";
    } else g.piece = piece;
  }, []);

  const start = useCallback(() => {
    game.current = { ...newGame(), queue: [...bag(), ...bag()], status: "playing" };
    spawn();
    sync("");
  }, [spawn, sync]);

  // 方塊落地：寫進盤面，檢查有沒有滿的列
  const lock = useCallback(() => {
    const g = game.current;
    const p = g.piece;
    if (!p) return;
    p.m.forEach((row, j) =>
      row.forEach((v, i) => {
        if (v && p.y + j >= 0) g.board[p.y + j][p.x + i] = p.kind;
      }),
    );
    g.piece = null;
    const full = g.board.map((row, i) => (row.every(Boolean) ? i : -1)).filter((i) => i >= 0);
    if (full.length) g.clearing = { rows: full, until: performance.now() + 220 };
    else spawn();
    sync();
  }, [spawn, sync]);

  const move = useCallback(
    (dx: number, dy: number): boolean => {
      const g = game.current;
      const p = g.piece;
      if (g.status !== "playing" || !p || g.clearing) return false;
      if (!fits(g.board, p.m, p.x + dx, p.y + dy)) {
        if (dy > 0) lock();
        return false;
      }
      p.x += dx;
      p.y += dy;
      return true;
    },
    [lock],
  );

  const turn = useCallback(() => {
    const g = game.current;
    const p = g.piece;
    if (g.status !== "playing" || !p || g.clearing) return;
    const m = rotate(p.m);
    // 靠牆時往旁邊挪一下再轉
    for (const kick of [0, -1, 1, -2, 2]) {
      if (fits(g.board, m, p.x + kick, p.y)) {
        p.m = m;
        p.x += kick;
        return;
      }
    }
  }, []);

  const softDrop = useCallback(() => {
    if (move(0, 1)) {
      game.current.score += 1;
      sync();
    }
  }, [move, sync]);

  const hardDrop = useCallback(() => {
    const g = game.current;
    if (g.status !== "playing" || !g.piece || g.clearing) return;
    let cells = 0;
    while (fits(g.board, g.piece.m, g.piece.x, g.piece.y + 1)) {
      g.piece.y++;
      cells++;
    }
    g.score += cells * 2;
    lock();
  }, [lock]);

  const togglePause = useCallback(() => {
    const g = game.current;
    if (g.status === "playing") g.status = "paused";
    else if (g.status === "paused") g.status = "playing";
    sync();
  }, [sync]);

  // ── 鍵盤 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = game.current;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
      if (g.status === "ready" || g.status === "over") {
        if (e.key === "Enter" || e.key === " ") start();
        return;
      }
      if (e.key === "p" || e.key === "P" || e.key === "Escape") return togglePause();
      if (e.key === "ArrowLeft") move(-1, 0);
      else if (e.key === "ArrowRight") move(1, 0);
      else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") turn();
      else if (e.key === "ArrowDown") softDrop();
      else if (e.key === " ") hardDrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, togglePause, move, turn, softDrop, hardDrop]);

  // 切到別的分頁時自動暫停
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && game.current.status === "playing") togglePause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [togglePause]);

  // ── 每一幀：自動往下掉、消除動畫、畫面 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = COLS * CELL * dpr;
    canvas.height = ROWS * CELL * dpr;
    let last = performance.now();
    let frame = 0;

    const loop = (t: number) => {
      const g = game.current;
      const dt = Math.min(100, t - last);
      last = t;

      if (g.status === "playing") {
        if (g.clearing && t >= g.clearing.until) {
          const n = g.clearing.rows.length;
          g.board = [...Array.from({ length: n }, () => Array<Kind | null>(COLS).fill(null)), ...g.board.filter((_, i) => !g.clearing!.rows.includes(i))];
          g.lines += n;
          g.score += LINE_SCORE[n] * g.level;
          g.level = Math.floor(g.lines / 10) + 1;
          g.clearing = null;
          spawn();
          sync(CHEERS[n]);
        } else if (!g.clearing) {
          g.acc += dt;
          if (g.acc >= speedOf(g.level)) {
            g.acc = 0;
            move(0, 1);
          }
        }
      }

      // 背景：淡紫底 + 小圓點
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#f6f1ff";
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      ctx.fillStyle = "#e6dcff";
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);

      g.board.forEach((row, y) =>
        row.forEach((kind, x) => {
          if (!kind) return;
          if (g.clearing?.rows.includes(y)) {
            ctx.fillStyle = Math.floor(t / 60) % 2 ? "#ffffff" : "#fff3b0";
            ctx.beginPath();
            ctx.roundRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3, 6);
            ctx.fill();
          } else drawCell(ctx, x, y, COLORS[kind], false);
        }),
      );

      const p = g.piece;
      if (p) {
        // 預覽落點（虛線框）
        let gy = p.y;
        while (fits(g.board, p.m, p.x, gy + 1)) gy++;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = COLORS[p.kind];
        ctx.lineWidth = 2;
        p.m.forEach((row, j) =>
          row.forEach((v, i) => {
            if (!v || gy + j < 0) return;
            ctx.beginPath();
            ctx.roundRect((p.x + i) * CELL + 3, (gy + j) * CELL + 3, CELL - 6, CELL - 6, 6);
            ctx.stroke();
          }),
        );
        ctx.setLineDash([]);
        p.m.forEach((row, j) => row.forEach((v, i) => v && p.y + j >= 0 && drawCell(ctx, p.x + i, p.y + j, COLORS[p.kind], true)));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [move, spawn, sync]);

  // 下一個方塊
  useEffect(() => {
    const canvas = nextRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 22;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 4 * size * dpr;
    canvas.height = 3 * size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 4 * size, 3 * size);
    const m = SHAPES[hud.next].filter((row) => row.some(Boolean));
    const ox = (4 - m[0].length) / 2;
    const oy = (3 - m.length) / 2;
    m.forEach((row, j) => row.forEach((v, i) => v && drawCell(ctx, ox + i, oy + j, COLORS[hud.next], true, size)));
  }, [hud.next]);

  // 手機按鈕：還沒開始或結束時，按任何鍵都是開始遊戲
  const act = useCallback(
    (action: () => void) => {
      const status = game.current.status;
      if (status === "ready" || status === "over") start();
      else action();
    },
    [start],
  );

  const pad = "flex size-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-[0_4px_0_rgba(59,47,74,0.15)] ring-1 ring-black/5 active:translate-y-0.5 active:shadow-none select-none touch-none";

  return (
    <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label={`俄羅斯方塊盤面，目前 ${hud.score} 分`}
          className="block rounded-3xl shadow-[0_8px_0_rgba(59,47,74,0.1)] ring-4 ring-white"
          style={{ width: "min(300px, 62vw, calc((100dvh - 290px) / 2))", aspectRatio: "1 / 2" }}
        />
        {hud.cheer && hud.status === "playing" && (
          <p key={hud.lines} className="cheer pointer-events-none absolute inset-x-0 top-1/3 text-center text-2xl font-bold" style={{ color: CANDY.pink, textShadow: "0 2px 0 #fff" }}>
            {hud.cheer}
          </p>
        )}
        {hud.status !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/75 p-4 text-center backdrop-blur-sm">
            {hud.status === "over" && <p className="text-2xl font-bold">遊戲結束</p>}
            {hud.status === "paused" && <p className="text-2xl font-bold">休息一下</p>}
            {hud.status === "ready" && <p className="text-lg font-bold">方塊們準備好了！</p>}
            {hud.status === "over" && (
              <p className="text-sm" style={{ color: CANDY.soft }}>
                得分 {hud.score.toLocaleString()}{hud.score >= hud.best && hud.score > 0 ? "・新紀錄！🎉" : ""}
              </p>
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

      <div className="flex w-full max-w-[300px] flex-row flex-wrap gap-3 sm:w-44 sm:flex-col">
        <Card className="flex-1">
          <p className="text-xs" style={{ color: CANDY.soft }}>下一個</p>
          <canvas ref={nextRef} className="mt-1" style={{ width: 88, height: 66 }} />
        </Card>
        <Card className="flex-1">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm sm:grid-cols-1">
            <dt className="text-xs" style={{ color: CANDY.soft }}>分數</dt>
            <dd className="font-bold tabular-nums">{hud.score.toLocaleString()}</dd>
            <dt className="text-xs" style={{ color: CANDY.soft }}>消除</dt>
            <dd className="font-bold tabular-nums">{hud.lines} 行</dd>
            <dt className="text-xs" style={{ color: CANDY.soft }}>等級</dt>
            <dd className="font-bold tabular-nums">Lv.{hud.level}</dd>
            <dt className="text-xs" style={{ color: CANDY.soft }}>最高分</dt>
            <dd className="font-bold tabular-nums">{Math.max(hud.best, storedBest).toLocaleString()}</dd>
          </dl>
        </Card>
        {hud.status === "playing" && (
          <button type="button" onClick={togglePause} className="hidden rounded-full bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-black/5 sm:block">
            ⏸ 暫停
          </button>
        )}
      </div>

      {/* 手機操作按鈕 */}
      <div className="grid grid-cols-5 gap-2 sm:hidden" aria-label="操作按鈕">
        <HoldButton label="往左" className={pad} repeat onPress={() => act(() => move(-1, 0))}>◀</HoldButton>
        <HoldButton label="旋轉" className={pad} onPress={() => act(turn)}>⟳</HoldButton>
        <HoldButton label="往右" className={pad} repeat onPress={() => act(() => move(1, 0))}>▶</HoldButton>
        <HoldButton label="加速往下" className={pad} repeat onPress={() => act(softDrop)}>▼</HoldButton>
        <HoldButton label="直接落下" className={pad} onPress={() => act(hardDrop)}>⤓</HoldButton>
      </div>
    </div>
  );
}
