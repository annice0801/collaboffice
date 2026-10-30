// 障礙物地圖與 A* 尋路（Navigation Grid）
//
// 換主題、部門改變時，平面圖重算，這張地圖也跟著重算（buildNav）：
//   把整片地（含外圍草地）切成 0.5 格的小方塊，標出不能走的地方：
//     牆   ：每間房間的後牆與左牆（房間前方、右側是開放的，從那裡進出）
//     家具 ：主題設定裡會擋路的家具（往外多留一點空間，人不會貼著家具走）
//     池塘 ：橢圓形的水面
//   找路時：A*（八個方向，斜走時兩側都要是空的，不會切過牆角）→ 拉直路線（看得到的點直接走過去）
//
// 目的地常常就在家具上（坐沙發、躺睡眠艙）：先走到最靠近的空地，最後一步才踏上去。
// 找最近的空地時「不穿過牆」，所以不會從牆的另一邊繞過去。

import { GARDEN, ROOM, type Plan } from "./plan";

const RES = 0.5; //   一個小方塊幾格
const WALL = 1; //    牆
const THING = 2; //   家具、池塘
const PAD = 0.2; //   家具外圍多留的空間

export type Nav = {
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  grid: Uint8Array; // 0：可以走；WALL；THING
};

type Point = [number, number];

export function buildNav(plan: Plan): Nav {
  const minX = -GARDEN;
  const minY = -GARDEN;
  const cols = Math.ceil((plan.buildingW + 2 * GARDEN) / RES);
  const rows = Math.ceil((plan.buildingH + 2 * GARDEN) / RES);
  const grid = new Uint8Array(cols * rows);
  const nav: Nav = { minX, minY, cols, rows, grid };
  const center = (c: number, r: number): Point => [minX + (c + 0.5) * RES, minY + (r + 0.5) * RES];

  // 標記一個長方形範圍內的方塊（以方塊中心判斷）
  const mark = (x0: number, y0: number, x1: number, y1: number, value: number) => {
    const c0 = Math.max(0, Math.floor((x0 - minX) / RES));
    const c1 = Math.min(cols - 1, Math.floor((x1 - minX) / RES));
    const r0 = Math.max(0, Math.floor((y0 - minY) / RES));
    const r1 = Math.min(rows - 1, Math.floor((y1 - minY) / RES));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const [x, y] = center(c, r);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && grid[r * cols + c] !== WALL) grid[r * cols + c] = value;
      }
  };

  for (const o of plan.obstacles) mark(o.x - PAD, o.y - PAD, o.x + o.w + PAD, o.y + o.d + PAD, THING);
  const { pond } = plan.outdoor;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const [x, y] = center(c, r);
      if (((x - pond.x) / (pond.rx + 0.3)) ** 2 + ((y - pond.y) / (pond.ry + 0.3)) ** 2 < 1) grid[r * cols + c] = THING;
    }
  // 牆最後標（蓋過家具）：後牆 y = oy、左牆 x = ox
  for (const room of plan.rooms) {
    if (room.kind === "courtyard") continue;
    const { ox, oy } = room;
    mark(ox - 0.3, oy - 0.3, ox + ROOM, oy + 0.3, WALL);
    mark(ox - 0.3, oy - 0.3, ox + 0.3, oy + ROOM, WALL);
  }
  return nav;
}

const cellOf = (nav: Nav, x: number, y: number): [number, number] => [
  Math.min(nav.cols - 1, Math.max(0, Math.floor((x - nav.minX) / RES))),
  Math.min(nav.rows - 1, Math.max(0, Math.floor((y - nav.minY) / RES))),
];
const centerOf = (nav: Nav, c: number, r: number): Point => [nav.minX + (c + 0.5) * RES, nav.minY + (r + 0.5) * RES];
const free = (nav: Nav, c: number, r: number) => c >= 0 && r >= 0 && c < nav.cols && r < nav.rows && nav.grid[r * nav.cols + c] === 0;
const wall = (nav: Nav, c: number, r: number) => c < 0 || r < 0 || c >= nav.cols || r >= nav.rows || nav.grid[r * nav.cols + c] === WALL;

// 從某個方塊往外找最近的空地（可以穿過家具，但不穿過牆）
function nearestFree(nav: Nav, start: [number, number]): [number, number] | null {
  if (free(nav, ...start)) return start;
  const seen = new Set([start[1] * nav.cols + start[0]]);
  let frontier = [start];
  for (let step = 0; step < 24 && frontier.length; step++) {
    const next: [number, number][] = [];
    for (const [c, r] of frontier)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n: [number, number] = [c + dc, r + dr];
        const k = n[1] * nav.cols + n[0];
        if (seen.has(k) || wall(nav, ...n)) continue;
        if (free(nav, ...n)) return n;
        seen.add(k);
        next.push(n);
      }
    frontier = next;
  }
  return null;
}

// 兩點之間的直線有沒有被擋住（每 0.2 格檢查一次）
function clear(nav: Nav, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!free(nav, ...cellOf(nav, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))) return false;
  }
  return true;
}

// 找路：回傳要經過的點，最後一點是目的地
export function findPath(nav: Nav, from: { x: number; y: number }, to: { x: number; y: number }): Point[] {
  const target: Point = [to.x, to.y];
  const startCell = nearestFree(nav, cellOf(nav, from.x, from.y));
  const goalCell = nearestFree(nav, cellOf(nav, to.x, to.y));
  if (!startCell || !goalCell) return [target];
  const start = centerOf(nav, ...startCell);
  const goal = centerOf(nav, ...goalCell);
  // 起點與終點本身在空地上、中間沒擋住：直接走過去
  if (clear(nav, [from.x, from.y], target)) return [target];

  // ── A* ──
  const { cols } = nav;
  const startK = startCell[1] * cols + startCell[0];
  const goalK = goalCell[1] * cols + goalCell[0];
  const g = new Float32Array(nav.cols * nav.rows).fill(Infinity);
  const came = new Int32Array(nav.cols * nav.rows).fill(-1);
  const h = (k: number) => {
    const dx = Math.abs((k % cols) - goalCell[0]);
    const dy = Math.abs(Math.floor(k / cols) - goalCell[1]);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new Heap();
  g[startK] = 0;
  heap.push(startK, h(startK));
  const closed = new Uint8Array(nav.cols * nav.rows);
  let found = false;
  while (heap.size) {
    const k = heap.pop();
    if (k === goalK) {
      found = true;
      break;
    }
    if (closed[k]) continue;
    closed[k] = 1;
    const c = k % cols;
    const r = Math.floor(k / cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!free(nav, nc, nr)) continue;
      // 斜走：兩側都要是空的，不會切過牆角或家具角
      if (dc && dr && (!free(nav, c + dc, r) || !free(nav, c, r + dr))) continue;
      const nk = nr * cols + nc;
      const cost = g[k] + (dc && dr ? Math.SQRT2 : 1);
      if (cost < g[nk]) {
        g[nk] = cost;
        came[nk] = k;
        heap.push(nk, cost + h(nk));
      }
    }
  }
  if (!found) return [goal, target];

  const cells: Point[] = [];
  for (let k = goalK; k !== -1; k = came[k]) cells.push(centerOf(nav, k % cols, Math.floor(k / cols)));
  cells.reverse();

  // ── 拉直：從目前的點，直接走到「看得到」的最遠點 ──
  const path: Point[] = [];
  let i = 0;
  let here: Point = clear(nav, [from.x, from.y], cells[0]) ? [from.x, from.y] : start;
  if (here === start) path.push(start);
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !clear(nav, here, cells[j])) j--;
    path.push(cells[j]);
    here = cells[j];
    i = j;
  }
  // 最後一步：從最近的空地踏上目的地（例如坐上沙發）
  // （如果前一個點就看得到目的地，最後那個空地點可以省略）
  const prev: Point = path.length >= 2 ? path.at(-2)! : [from.x, from.y];
  if (path.length && clear(nav, prev, target)) path.pop();
  path.push(target);
  return path;
}

// 最小堆積（A* 每次取出估計距離最短的方塊）
class Heap {
  private keys: number[] = [];
  private prios: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, prio: number) {
    const { keys, prios } = this;
    keys.push(key);
    prios.push(prio);
    let i = keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (prios[p] <= prios[i]) break;
      [keys[p], keys[i]] = [keys[i], keys[p]];
      [prios[p], prios[i]] = [prios[i], prios[p]];
      i = p;
    }
  }
  pop(): number {
    const { keys, prios } = this;
    const top = keys[0];
    const lastK = keys.pop()!;
    const lastP = prios.pop()!;
    if (keys.length) {
      keys[0] = lastK;
      prios[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && prios[l] < prios[m]) m = l;
        if (r < keys.length && prios[r] < prios[m]) m = r;
        if (m === i) break;
        [keys[m], keys[i]] = [keys[i], keys[m]];
        [prios[m], prios[i]] = [prios[i], prios[m]];
        i = m;
      }
    }
    return top;
  }
}
