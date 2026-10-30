// 立體辦公室的「靜態場景」：花園、地板、牆壁、家具。
// 每件東西都是用多邊形（polygon）畫出來的等角方塊，沒有用任何圖片。
//
// 畫圖順序很重要：後面的東西先畫，前面的後畫，前面的才會蓋住後面的（畫家演算法）。
// 所以家具都會附上 depth（深度），最後跟人物一起依深度排序再畫。

import type { ReactNode } from "react";
import { painter, pts, shade, type Drawable } from "./paint";
import { depthOf, GARDEN, ROOM, TILE_H, TILE_W, WALL_H, type Plan, type Room } from "./plan";
import { spriteItems } from "./sprites";

// 把平面圖形貼到斜面上用的比例（牆、機台正面）
const UNIT = Math.hypot(TILE_W / 2, TILE_H / 2);
const COS = TILE_W / 2 / UNIT;
const SIN = TILE_H / 2 / UNIT;

export { shade, type Drawable };

// ── 家具 ────────────────────────────────────────────

function furniture(plan: Plan, room: Room): Drawable[] {
  const { P, Box, flat } = painter(plan);
  const t = plan.theme;
  const { ox, oy, id } = room;
  const items: Drawable[] = [];
  const add = (depthX: number, depthY: number, key: string, node: ReactNode) =>
    items.push({ depth: depthOf(depthX, depthY), key: `${id}-${key}`, node });
  // 地毯貼地，永遠在家具下面
  const rug = (x: number, y: number, w: number, d: number, color: string, key: string) =>
    items.push({ depth: -1000, key: `${id}-${key}`, node: flat(x, y, w, d, color, 0.5, 0.85) });

  const plant = (x: number, y: number, key: string, big = false) => {
    const [cx, cy] = P(x + 0.25, y + 0.25, big ? 40 : 30);
    const r = big ? 18 : 14;
    add(x + 0.25, y + 0.25, key, (
      <g>
        <Box x={x} y={y} w={0.5} d={0.5} h={14} color="#b4643c" />
        <circle cx={cx} cy={cy - 6} r={r} fill="#3f8a4a" />
        <circle cx={cx - 7} cy={cy + 2} r={r * 0.65} fill="#357a3f" />
        <circle cx={cx + 7} cy={cy} r={r * 0.65} fill="#4c9a56" />
      </g>
    ));
  };
  // 書架：along 決定沿哪個方向擺放
  const shelf = (x: number, y: number, key: string, along: "x" | "y" = "y", length = 1.2) => {
    const w = along === "x" ? length : 0.5;
    const d = along === "y" ? length : 0.5;
    add(x + w / 2, y + d / 2, key, (
      <g>
        <Box x={x} y={y} w={w} d={d} h={64} color="#8f6b4a" />
        {/* 書：一層層彩色方塊 */}
        {[10, 26, 42].map((z, i) => (
          <Box
            key={z}
            x={along === "y" ? x + 0.42 : x + 0.1}
            y={along === "y" ? y + 0.1 : y + 0.42}
            z={z}
            w={along === "y" ? 0.08 : length - 0.2}
            d={along === "y" ? length - 0.2 : 0.08}
            h={11}
            color={["#d9534f", "#f0ad4e", "#4a6fa5"][i]}
            line={false}
          />
        ))}
      </g>
    ));
  };
  const sofa = (x: number, y: number, key: string, color: string) =>
    add(x + 1.2, y + 0.45, key, (
      <g>
        <Box x={x} y={y} w={2.4} d={0.9} h={12} color={color} />
        <Box x={x} y={y} z={12} w={2.4} d={0.25} h={14} color={color} />
        <Box x={x + 0.3} y={y + 0.3} z={12} w={0.6} d={0.4} h={5} color="#f0ad4e" line={false} />
      </g>
    ));
  // 懶骨頭：扁扁的圓
  const beanBag = (x: number, y: number, key: string, color: string) => {
    const [cx, cy] = P(x, y, 6);
    add(x, y, key, (
      <g>
        <ellipse cx={cx} cy={cy + 4} rx={15} ry={8} fill={shade(color, -0.25)} />
        <ellipse cx={cx} cy={cy} rx={14} ry={9} fill={color} />
      </g>
    ));
  };
  const color = (list: string[], i: number) => list[i % list.length];

  // 辦公桌 + 螢幕 + 椅子。椅子在桌子後方（離觀看者較遠），人坐在椅子上面向你
  for (const seat of room.seats) {
    if (room.kind === "boss") {
      // 老闆的位子：高背皮椅 + 大型主管桌（3 格寬，兩台螢幕、檯燈、金色名牌）
      items.push({
        depth: depthOf(seat.x, seat.y) - 0.05,
        key: `${id}-boss-chair`,
        node: (
          <g>
            <Box x={seat.x - 0.35} y={seat.y - 0.4} w={0.7} d={0.7} h={16} color="#1f1f1f" />
            <Box x={seat.x - 0.35} y={seat.y - 0.5} z={16} w={0.7} d={0.16} h={34} color="#1f1f1f" />
          </g>
        ),
      });
      const dx = seat.x - 1.5;
      const dy = seat.y + 0.35;
      add(dx + 1.5, dy + 0.5, "boss-desk", (
        <g>
          <Box x={dx} y={dy} w={3} d={1} h={24} color="#4a2f1b" />
          <Box x={dx} y={dy} z={24} w={3} d={1} h={2} color="#c9a227" line={false} />
          <Box x={dx + 0.1} y={dy + 0.15} z={26} w={0.1} d={0.55} h={18} color="#2b2f3a" />
          <Box x={dx + 2.75} y={dy + 0.15} z={26} w={0.1} d={0.55} h={18} color="#2b2f3a" />
          <Box x={dx + 1.1} y={dy + 0.55} z={26} w={0.8} d={0.25} h={4} color="#c9a227" line={false} />
          <Box x={dx + 2.2} y={dy + 0.2} z={26} w={0.15} d={0.15} h={14} color="#f4d35e" line={false} />
        </g>
      ));
      continue;
    }
    const dx = seat.x - 1;
    const dy = seat.y + 0.35;
    items.push({
      depth: depthOf(seat.x, seat.y) - 0.05,
      key: `${id}-${seat.agent}-chair`,
      node: (
        <g>
          <Box x={seat.x - 0.3} y={seat.y - 0.35} w={0.6} d={0.6} h={14} color={seat.chair} />
          <Box x={seat.x - 0.3} y={seat.y - 0.45} z={14} w={0.6} d={0.14} h={20} color={seat.chair} />
        </g>
      ),
    });
    add(dx + 1, dy + 0.4, `${seat.agent}-desk`, (
      <g>
        <Box x={dx} y={dy} w={2} d={0.8} h={22} color={seat.boss ? t.bossDesk : t.desk} />
        {/* 螢幕放在桌子左側，才不會擋住人的臉 */}
        <Box x={dx + 0.08} y={dy + 0.15} z={22} w={0.1} d={0.5} h={16} color="#2b2f3a" />
        <Box x={dx + 0.7} y={dy + 0.4} z={22} w={0.6} d={0.2} h={1.5} color="#c9ccd3" line={false} />
        <Box x={dx + 1.6} y={dy + 0.45} z={22} w={0.15} d={0.15} h={5} color="#d9534f" line={false} />
      </g>
    ));
  }

  switch (room.kind) {
    case "boss": {
      // 最高級的房間：大地毯、沙發組、魚缸、獎盃櫃、書牆、大型盆栽
      rug(ox + 0.8, oy + 4.2, 6.4, 3.4, "#7a1f2b", "rug");
      rug(ox + 1.1, oy + 4.5, 5.8, 2.8, "#9b2c3a", "rug-inner");
      sofa(ox + 1.2, oy + 4.6, "sofa1", "#2b1b12");
      sofa(ox + 4.2, oy + 4.6, "sofa2", "#2b1b12");
      add(ox + 3.6, oy + 6.2, "coffee", <Box x={ox + 2.6} y={oy + 5.9} w={2} d={0.7} h={10} color="#c9a227" />);
      // 魚缸：玻璃方塊 + 小魚
      const [fx, fy] = P(ox + 7.1, oy + 3.6, 30);
      add(ox + 7.1, oy + 3.6, "aquarium", (
        <g>
          <Box x={ox + 6.8} y={oy + 2.6} w={0.7} d={2} h={18} color="#3a2a1f" />
          <Box x={ox + 6.8} y={oy + 2.6} z={18} w={0.7} d={2} h={26} color="#7fd0f0" />
          <circle cx={fx - 6} cy={fy} r={2.5} fill="#ff8c1a" />
          <circle cx={fx + 4} cy={fy - 7} r={2.5} fill="#ffd21a" />
        </g>
      ));
      // 獎盃櫃
      add(ox + 7.1, oy + 0.9, "trophy", (
        <g>
          <Box x={ox + 6.6} y={oy + 0.4} w={1} d={0.6} h={56} color="#4a2f1b" />
          <Box x={ox + 6.9} y={oy + 0.55} z={56} w={0.3} d={0.3} h={10} color="#f4d35e" />
        </g>
      ));
      shelf(ox + 0.1, oy + 0.4, "shelf1", "y", 1.6);
      shelf(ox + 0.1, oy + 2.2, "shelf2", "y", 1.6);
      plant(ox + 0.4, oy + 7.1, "plant1", true);
      plant(ox + 7.1, oy + 7.1, "plant2", true);
      break;
    }

    case "department":
      plant(ox + 7.2, oy + 0.4, "plant");
      shelf(ox + 0.1, oy + 5.6, "shelf");
      break;

    case "assistant":
    case "gm":
      rug(ox + 1, oy + 4.6, 5.5, 2.6, room.kind === "gm" ? "#7a5c3e" : "#4c8a6a", "rug");
      sofa(ox + 2.5, oy + 5.2, "sofa", color(t.sofas, room.kind === "gm" ? 1 : 0));
      plant(ox + 7.2, oy + 0.4, "plant");
      shelf(ox + 0.1, oy + 1.2, "shelf");
      break;

    case "break": // 休憩間：咖啡吧檯、冰箱、沙發、懶骨頭
      add(ox + 2.5, oy + 0.75, "bar", (
        <g>
          <Box x={ox + 0.4} y={oy + 0.4} w={4.2} d={0.7} h={28} color="#6d5a4b" />
          <Box x={ox + 0.7} y={oy + 0.5} z={28} w={0.6} d={0.5} h={22} color="#3a3f4a" />
          <Box x={ox + 1.6} y={oy + 0.55} z={28} w={0.2} d={0.2} h={7} color="#ffffff" line={false} />
          <Box x={ox + 2.0} y={oy + 0.55} z={28} w={0.2} d={0.2} h={7} color="#ffffff" line={false} />
        </g>
      ));
      add(ox + 6.5, oy + 0.6, "fridge", <Box x={ox + 6} y={oy + 0.2} w={0.9} d={0.8} h={48} color="#e8eef2" />);
      rug(ox + 1, oy + 3, 6, 4.5, color(t.sofas, 0), "rug");
      sofa(ox + 1.2, oy + 3.2, "sofa", color(t.sofas, 1));
      beanBag(ox + 5.4, oy + 4.6, "bean1", color(t.chairs, 2));
      beanBag(ox + 3.2, oy + 6.4, "bean2", color(t.chairs, 3));
      add(ox + 3.6, oy + 4.9, "table", <Box x={ox + 3} y={oy + 4.6} w={1.2} d={0.7} h={10} color="#3c6e64" />);
      plant(ox + 7.2, oy + 7.1, "plant", true);
      break;

    case "library": // 圖書館：一排排書架、閱讀椅、地毯
      shelf(ox + 0.1, oy + 0.6, "shelf-l", "y", 3.5);
      for (const [i, sy] of [1.2, 3.2, 5.2].entries()) shelf(ox + 2, oy + sy, `row${i}`, "x", 4.4);
      rug(ox + 1.2, oy + 6.3, 5.6, 1.4, "#b5523b", "rug");
      add(ox + 3, oy + 7, "chair1", <Box x={ox + 2.7} y={oy + 6.6} w={0.7} d={0.7} h={16} color={color(t.sofas, 0)} />);
      add(ox + 6, oy + 7, "chair2", <Box x={ox + 5.7} y={oy + 6.6} w={0.7} d={0.7} h={16} color={color(t.sofas, 1)} />);
      plant(ox + 7.2, oy + 0.4, "plant");
      break;

    case "game": // 遊戲室：乒乓球桌、手足球台、街機、電視遊戲區
      add(ox + 2.9, oy + 2.5, "pingpong", (
        <g>
          <Box x={ox + 1.6} y={oy + 1.8} w={2.6} d={1.4} h={22} color="#1f7a4d" />
          <Box x={ox + 2.85} y={oy + 1.75} z={22} w={0.06} d={1.5} h={6} color="#ffffff" line={false} />
        </g>
      ));
      add(ox + 5.6, oy + 5.4, "foosball", (
        <g>
          <Box x={ox + 4.8} y={oy + 5} w={1.6} d={0.9} h={24} color="#8b5a2b" />
          {[0.2, 0.45, 0.7].map((f) => (
            <Box key={f} x={ox + 4.6} y={oy + 5 + f * 0.9} z={22} w={2} d={0.05} h={2} color="#c9ccd3" line={false} />
          ))}
        </g>
      ));
      add(ox + 7.1, oy + 0.9, "arcade", (
        <g>
          <Box x={ox + 6.7} y={oy + 0.4} w={0.8} d={0.8} h={56} color="#ea4335" />
          <Box x={ox + 6.68} y={oy + 0.5} z={30} w={0.05} d={0.6} h={18} color="#4285f4" line={false} />
        </g>
      ));
      add(ox + 0.4, oy + 6, "tv", <Box x={ox + 0.15} y={oy + 5.2} z={20} w={0.12} d={1.6} h={30} color="#202124" />);
      beanBag(ox + 1.8, oy + 5.6, "bean1", color(t.chairs, 0));
      beanBag(ox + 2.0, oy + 6.9, "bean2", color(t.chairs, 1));
      break;

    case "courtyard": // 中庭花園：樹、花圃、長椅、石板步道
      for (const [i, [sx, sy]] of [[1.5, 1.5], [4.5, 2.5], [2.5, 5], [5.5, 6]].entries()) {
        items.push({ depth: -1000, key: `${id}-stone${i}`, node: flat(ox + sx, oy + sy, 1.2, 1.2, "#d8d2c4", 0.5) });
      }
      for (const [i, [tx, ty]] of [[1.2, 3.5], [6.5, 1.5], [6.8, 4.2], [4.2, 7]].entries()) {
        const [cx, cy] = P(ox + tx, oy + ty, 50);
        add(ox + tx, oy + ty, `tree${i}`, (
          <g>
            <Box x={ox + tx - 0.15} y={oy + ty - 0.15} w={0.3} d={0.3} h={40} color="#7a4f2c" />
            <circle cx={cx} cy={cy - 8} r={22} fill="#3f8a4a" />
            <circle cx={cx - 11} cy={cy + 4} r={15} fill="#2f7a3c" />
            <circle cx={cx + 11} cy={cy + 2} r={15} fill="#57a862" />
          </g>
        ));
      }
      add(ox + 3.8, oy + 4.2, "bench", <Box x={ox + 3} y={oy + 4} w={1.6} d={0.4} h={10} color="#a0673a" />);
      break;

    case "playground": {
      // ── 溜滑梯：右後方的塔（右側有梯子），紅色滑道一路往前溜到地面 ──
      add(ox + 6.5, oy + 1.2, "tower", (
        <g>
          <Box x={ox + 5.8} y={oy + 0.5} w={1.4} d={1.4} h={60} color="#4285f4" />
          {/* 塔頂後方與左側的欄杆 */}
          <Box x={ox + 5.8} y={oy + 0.5} z={60} w={1.4} d={0.08} h={12} color="#fbbc05" line={false} />
          <Box x={ox + 5.8} y={oy + 0.5} z={60} w={0.08} d={1.4} h={12} color="#fbbc05" line={false} />
          {/* 右側面的梯子橫桿 */}
          {Array.from({ length: 7 }, (_, i) => {
            const z = 6 + i * 8.5;
            const [a, b] = P(ox + 7.2, oy + 0.85, z);
            const [c, d] = P(ox + 7.2, oy + 1.4, z);
            return <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#ffffff" strokeWidth={2} />;
          })}
        </g>
      ));
      const slideTop = 60;
      const slideEnd = 3;
      add(ox + 6.5, oy + 4.6, "slide", (
        <g strokeLinejoin="round">
          {/* 中間的支撐柱 */}
          <Box x={ox + 6.3} y={oy + 4} w={0.4} d={0.4} h={30} color="#9aa0a6" />
          <polygon
            points={pts([P(ox + 6.1, oy + 1.9, slideTop), P(ox + 6.9, oy + 1.9, slideTop), P(ox + 6.9, oy + 6.4, slideEnd), P(ox + 6.1, oy + 6.4, slideEnd)])}
            fill="#ea4335"
            stroke={shade("#ea4335", -0.3)}
          />
          {/* 滑道兩側的護欄 */}
          {[6.1, 6.9].map((x) => {
            const [a, b] = P(ox + x, oy + 1.9, slideTop + 7);
            const [c, d] = P(ox + x, oy + 6.4, slideEnd + 7);
            return <line key={x} x1={a} y1={b} x2={c} y2={d} stroke="#fbbc05" strokeWidth={3} strokeLinecap="round" />;
          })}
        </g>
      ));

      // ── 攀岩牆：貼在左側牆面，上面有彩色岩點 ──
      const wall = pts([P(ox + 0.03, oy + 0.9, 4), P(ox + 0.03, oy + 4.1, 4), P(ox + 0.03, oy + 4.1, 62), P(ox + 0.03, oy + 0.9, 62)]);
      const holdColors = ["#ea4335", "#fbbc05", "#34a853", "#4285f4"];
      items.push({
        depth: -1000,
        key: `${id}-climbwall`,
        node: (
          <g>
            <polygon points={wall} fill="#d9cfc1" stroke="#a89a86" />
            {Array.from({ length: 18 }, (_, i) => {
              const [hx, hy] = P(ox + 0.03, oy + 1.1 + ((i * 7) % 18) * 0.16, 8 + ((i * 11) % 17) * 3.1);
              return <circle key={i} cx={hx} cy={hy} r={2.6} fill={holdColors[i % holdColors.length]} />;
            })}
          </g>
        ),
      });

      // ── 球池：底下鋪滿彩色球，前方和右側的矮牆擋住在裡面玩的人的腿 ──
      const bx = ox + 0.8;
      const by = oy + 4.8;
      const bw = 3.4;
      const bd = 2.4;
      const ballColors = ["#ea4335", "#fbbc05", "#34a853", "#4285f4", "#ffffff"];
      items.push({
        depth: -999,
        key: `${id}-pit`,
        node: (
          <g>
            <Box x={bx} y={by} w={bw} d={0.2} h={12} color="#fbbc05" />
            <Box x={bx} y={by} w={0.2} d={bd} h={12} color="#fbbc05" />
            {flat(bx, by, bw, bd, "#e8eaed", 1)}
            {Array.from({ length: 46 }, (_, i) => {
              const [cx, cy] = P(bx + 0.25 + ((i * 7) % 23) * 0.13, by + 0.25 + ((i * 5) % 17) * 0.115, 7);
              return <circle key={i} cx={cx} cy={cy} r={3.2} fill={ballColors[i % ballColors.length]} />;
            })}
          </g>
        ),
      });
      add(bx + bw / 2, by + bd + 0.3, "pit-front", <Box x={bx} y={by + bd - 0.2} w={bw} d={0.2} h={12} color="#fbbc05" />);
      add(bx + bw + 0.3, by + bd / 2, "pit-right", <Box x={bx + bw - 0.2} y={by} w={0.2} d={bd} h={12} color="#fbbc05" />);
      break;
    }

    case "wellness": {
      // ── 睡眠艙（像 Google 的 EnergyPod）：白色躺椅 + 半透明圓頂 ──
      for (const [i, px] of [0.6, 2.8].entries()) {
        const x = ox + px;
        const y = oy + 0.5;
        add(x + 0.8, y + 0.5, `pod${i}`, <Box x={x} y={y} w={1.6} d={1} h={12} color="#f1f3f4" />);
        const [cx, cy] = P(x + 0.8, y + 0.4, 12);
        // 圓頂畫在人的前面，半透明，看得到裡面睡覺的人
        add(x + 0.8, y + 0.95, `dome${i}`, (
          <path d={`M ${cx - 30} ${cy} A 30 34 0 0 1 ${cx + 30} ${cy} Z`} fill="#dfe6ee" fillOpacity={0.5} stroke="#9aa0a6" />
        ));
      }
      // 按摩椅
      add(ox + 5.85, oy + 1.05, "massage", (
        <g>
          <Box x={ox + 5.4} y={oy + 0.6} w={0.9} d={0.9} h={14} color="#3c4043" />
          <Box x={ox + 5.4} y={oy + 0.6} z={14} w={0.9} d={0.22} h={30} color="#3c4043" />
          <Box x={ox + 5.4} y={oy + 0.6} z={14} w={0.15} d={0.9} h={8} color="#5f6368" />
          <Box x={ox + 6.15} y={oy + 0.6} z={14} w={0.15} d={0.9} h={8} color="#5f6368" />
        </g>
      ));
      // 跑步機 + 站立式辦公桌（桌面在人的胸前，腿還看得到）
      for (const [i, ty] of [3.8, 6.0].entries()) {
        items.push({ depth: -999, key: `${id}-belt${i}`, node: <Box x={ox + 0.5} y={oy + ty - 0.45} w={1.8} d={0.8} h={4} color="#3c4043" /> });
        add(ox + 1.4, oy + ty + 0.55, `desk${i}`, (
          <g>
            <Box x={ox + 1.3} y={oy + ty + 0.35} w={0.15} d={0.15} h={28} color="#9aa0a6" />
            <Box x={ox + 0.9} y={oy + ty + 0.3} z={28} w={1} d={0.4} h={3} color="#ffffff" />
            <Box x={ox + 1.1} y={oy + ty + 0.35} z={31} w={0.6} d={0.25} h={1.5} color="#c9ccd3" line={false} />
          </g>
        ));
      }
      // 瑜伽墊
      rug(ox + 3.6, oy + 4.2, 1, 2.2, "#a142f4", "yoga1");
      rug(ox + 5.4, oy + 4.2, 1, 2.2, "#12b5cb", "yoga2");
      plant(ox + 7.1, oy + 7.1, "plant", true);
      plant(ox + 7.2, oy + 3.0, "plant2");
      break;
    }

    case "meeting":
      add(ox + 4, oy + 4, "table", <Box x={ox + 2} y={oy + 2.8} w={4} d={2} h={20} color={t.desk} />);
      for (const [i, tx] of [2.4, 3.6, 4.8].entries()) {
        add(ox + tx, oy + 2.4, `c${i}a`, <Box x={ox + tx} y={oy + 2.2} w={0.5} d={0.5} h={14} color={color(t.chairs, i)} />);
        add(ox + tx, oy + 5.2, `c${i}b`, <Box x={ox + tx} y={oy + 5.1} w={0.5} d={0.5} h={14} color={color(t.chairs, i + 1)} />);
      }
      plant(ox + 7.2, oy + 0.4, "plant");
      break;
  }
  return items;
}

// 花園裡的樹、花圃、長椅、噴水池
function gardenItems(plan: Plan): Drawable[] {
  const { P, Box } = painter(plan);
  const W = plan.buildingW;
  const H = plan.buildingH;
  const items: Drawable[] = [];

  // 池塘周圍留空，不種樹（避免樹長在水裡或擋住池塘）
  const nearPond = (x: number, y: number) => {
    const { pond } = plan.outdoor;
    return ((x - pond.x) / (pond.rx + 2)) ** 2 + ((y - pond.y) / (pond.ry + 2)) ** 2 < 1;
  };
  const tree = (x: number, y: number, key: string, tone: number) => {
    if (nearPond(x, y)) return;
    const [cx, cy] = P(x, y, 50);
    const greens = tone % 2 === 0 ? ["#3f8a4a", "#2f7a3c", "#57a862"] : ["#4f9a3a", "#3e8a2c", "#69b850"];
    items.push({
      depth: depthOf(x, y),
      behind: x < -0.5 || y < -0.5,
      key: `tree-${key}`,
      node: (
        <g>
          <Box x={x - 0.15} y={y - 0.15} w={0.3} d={0.3} h={40} color="#7a4f2c" />
          <circle cx={cx} cy={cy - 8} r={24} fill={greens[0]} />
          <circle cx={cx - 12} cy={cy + 4} r={16} fill={greens[1]} />
          <circle cx={cx + 12} cy={cy + 2} r={16} fill={greens[2]} />
        </g>
      ),
    });
  };
  const flowers = (x: number, y: number, key: string) => {
    const colors = ["#ea4335", "#fbbc05", "#ffffff", "#e86fa4"];
    items.push({
      depth: depthOf(x, y),
      key: `flowers-${key}`,
      node: (
        <g>
          <Box x={x} y={y} w={1.6} d={0.6} h={6} color="#8b5a2b" />
          {Array.from({ length: 7 }, (_, i) => {
            const [fx, fy] = P(x + 0.2 + (i % 4) * 0.4, y + 0.15 + Math.floor(i / 4) * 0.3, 9);
            return <circle key={i} cx={fx} cy={fy} r={3} fill={colors[i % colors.length]} />;
          })}
        </g>
      ),
    });
  };
  const bench = (x: number, y: number, key: string) =>
    items.push({ depth: depthOf(x + 0.8, y + 0.2), key: `bench-${key}`, node: <Box x={x} y={y} w={1.6} d={0.4} h={10} color="#a0673a" /> });

  // 後方與左側：兩排樹林（在建築後面）
  for (let i = -GARDEN + 2; i <= W + 4; i += 4) {
    tree(i + 1, -2, `back-${i}`, i);
    tree(i + 3, -GARDEN + 1.5, `back2-${i}`, i + 1);
  }
  for (let j = -GARDEN + 4; j <= H + 4; j += 4) {
    tree(-2, j + 1, `left-${j}`, j + 1);
    tree(-GARDEN + 1.5, j + 3, `left2-${j}`, j);
  }
  // 右側與前方：靠建築的花圃，草地外緣一排樹
  for (let j = 1; j < H; j += 6) flowers(W + 2.2, j + 2.6, `r${j}`);
  for (let i = 1; i < W; i += 6) flowers(i + 2.6, H + 2.2, `f${i}`);
  for (let j = -2; j <= H + GARDEN - 2; j += 4) tree(W + GARDEN - 1.2, j, `right-${j}`, j);
  for (let i = -2; i <= W + GARDEN - 4; i += 4) tree(i, H + GARDEN - 1.2, `front-${i}`, i + 1);
  // 右側草地中間再點綴幾棵
  for (const [i, t] of [0.3, 0.88].entries()) tree(W + 6, H * t, `right-mid-${i}`, i);

  // ── 戶外吊床：兩根柱子中間掛著彩色吊床 ──
  const { hammocks, picnics } = plan.outdoor;
  hammocks.forEach((h, i) => {
    const sag = (t: number) => 24 - 15 * Math.sin(Math.PI * t); // 中間往下垂
    const edge = (dy: number) => Array.from({ length: 11 }, (_, k) => P(h.x + 0.1 + 1.8 * (k / 10), h.y + dy, sag(k / 10)));
    const fabric = [...edge(0.15), ...edge(0.55).reverse()];
    const colors = ["#ea4335", "#fbbc05", "#34a853", "#4285f4"];
    items.push({
      depth: depthOf(h.x + 1, h.y + 0.3),
      key: `hammock-${i}`,
      node: (
        <g>
          <Box x={h.x} y={h.y + 0.25} w={0.2} d={0.2} h={34} color="#8b5a2b" />
          <Box x={h.x + 1.8} y={h.y + 0.25} w={0.2} d={0.2} h={34} color="#8b5a2b" />
          <polygon points={pts(fabric)} fill={colors[i % colors.length]} stroke={shade(colors[i % colors.length], -0.3)} strokeWidth={0.8} />
        </g>
      ),
    });
  });

  // ── 戶外野餐桌 + 遮陽傘（可以帶筆電來工作）──
  picnics.forEach((t, i) => {
    const [cx, cy] = P(t.x + 0.7, t.y + 0.4, 50);
    const canopy = ["#ea4335", "#4285f4", "#34a853"][i % 3];
    items.push({
      depth: depthOf(t.x + 0.7, t.y + 0.5),
      key: `picnic-${i}`,
      node: (
        <g>
          <Box x={t.x} y={t.y - 0.5} w={1.4} d={0.3} h={9} color="#a0673a" />
          <Box x={t.x} y={t.y} w={1.4} d={0.8} h={16} color="#b97a45" />
          <Box x={t.x + 0.65} y={t.y + 0.35} w={0.1} d={0.1} h={50} color="#dadce0" line={false} />
          <ellipse cx={cx} cy={cy} rx={34} ry={14} fill={canopy} stroke={shade(canopy, -0.3)} />
          <ellipse cx={cx} cy={cy - 3} rx={18} ry={7} fill={shade(canopy, 0.25)} />
        </g>
      ),
    });
    // 前排長凳：坐在這裡的人畫在凳子後面一點
    items.push({ depth: depthOf(t.x + 0.7, t.y + 1.15), key: `picnic-bench-${i}`, node: <Box x={t.x} y={t.y + 1.0} w={1.4} d={0.3} h={9} color="#a0673a" /> });
  });

  items.push(...pondItems(plan, { rim: "#c9b99a", water: "#7fc8ef", inner: "#9fd8f5" }, true));
  bench(W + 2.2, H * 0.32, "r");
  bench(W * 0.32, H + 2.2, "f");

  // Google 風格的彩色腳踏車（停在前方花園）
  const bikeColors = ["#ea4335", "#fbbc05", "#34a853", "#4285f4"];
  bikeColors.forEach((c, i) => {
    const x = W * 0.55 + i * 0.7;
    const y = H + 3.1;
    const [ax, ay] = P(x, y, 6);
    const [bx, by] = P(x + 0.9, y, 6);
    items.push({
      depth: depthOf(x + 0.45, y),
      key: `bike-${i}`,
      node: (
        <g fill="none" strokeWidth={2}>
          <circle cx={ax} cy={ay} r={6} stroke="#3c4043" />
          <circle cx={bx} cy={by} r={6} stroke="#3c4043" />
          <polyline points={`${ax},${ay} ${(ax + bx) / 2},${ay - 9} ${bx},${by} ${(ax + bx) / 2 + 2},${by - 2} ${ax},${ay}`} stroke={c} strokeWidth={2.5} />
          <line x1={bx - 1} y1={by - 14} x2={bx} y2={by} stroke={c} strokeWidth={2.5} />
          <line x1={bx - 4} y1={by - 14} x2={bx + 3} y2={by - 15} stroke="#3c4043" />
        </g>
      ),
    });
  });

  // 右前角的噴水池
  const [fx, fy] = P(W + 2.6, H + 2.6, 4);
  items.push({
    depth: depthOf(W + 2.6, H + 2.6),
    key: "fountain",
    node: (
      <g>
        <ellipse cx={fx} cy={fy + 4} rx={40} ry={20} fill="#9aa4ad" />
        <ellipse cx={fx} cy={fy} rx={36} ry={17} fill="#7fc8ef" />
        <rect x={fx - 3} y={fy - 26} width={6} height={26} fill="#c7ced6" />
        <ellipse cx={fx} cy={fy - 26} rx={10} ry={5} fill="#aee1fb" />
      </g>
    ),
  });
  return items;
}

// 池塘（每個主題都有，顏色不同）：ducks＝荷葉、蘆葦、鴨子（經典、園區才有）
export function pondItems(plan: Plan, colors: { rim: string; water: string; inner: string }, ducks: boolean): Drawable[] {
  const { P } = painter(plan);
  const { pond } = plan.outdoor;
  const items: Drawable[] = [];
  // ── 池塘：水面、荷葉、鴨子、蘆葦 ──
  const ring = (rx: number, ry: number) =>
    pts(Array.from({ length: 28 }, (_, k) => P(pond.x + rx * Math.cos((k / 28) * 2 * Math.PI), pond.y + ry * Math.sin((k / 28) * 2 * Math.PI), 0.4)));
  items.push({
    depth: -999,
    key: "pond",
    node: (
      <g>
        <polygon points={ring(pond.rx + 0.35, pond.ry + 0.35)} fill={colors.rim} />
        <polygon points={ring(pond.rx, pond.ry)} fill={colors.water} />
        <polygon points={ring(pond.rx * 0.6, pond.ry * 0.6)} fill={colors.inner} opacity={0.6} />
        {ducks && [[-1.6, -0.4], [1.2, 0.6], [0.4, -0.9], [-0.6, 0.8]].map(([dx, dy], k) => {
          const [lx, ly] = P(pond.x + dx, pond.y + dy, 1);
          return <ellipse key={k} cx={lx} cy={ly} rx={7} ry={3.5} fill="#4c9a56" />;
        })}
        {ducks && [[2.1, -0.5], [-2.3, 0.3]].map(([dx, dy], k) => {
          const [rx, ry] = P(pond.x + dx, pond.y + dy, 0);
          return <path key={k} d={`M ${rx} ${ry} l -3 -14 M ${rx + 3} ${ry} l 1 -16 M ${rx + 6} ${ry} l 4 -12`} stroke="#5d8a3a" strokeWidth={2} />;
        })}
      </g>
    ),
  });
  // 鴨子（畫在水面上面）
  if (ducks) [[-0.4, 0.1], [0.5, 0.4]].forEach(([dx, dy], k) => {
    const [dx2, dy2] = P(pond.x + dx, pond.y + dy, 3);
    items.push({
      depth: depthOf(pond.x + dx, pond.y + dy),
      key: `duck-${k}`,
      node: (
        <g>
          <ellipse cx={dx2} cy={dy2} rx={6} ry={3.5} fill="#ffffff" />
          <circle cx={dx2 + 4} cy={dy2 - 4} r={2.6} fill="#ffffff" />
          <path d={`M ${dx2 + 6} ${dy2 - 4} l 3 1 l -3 1 z`} fill="#f29900" />
        </g>
      ),
    });
  });
  return items;
}

// 遊戲室的機台（每個主題都有）
function arcadeItems(plan: Plan): Drawable[] {
  const { P, Box, flat } = painter(plan);
  const items: Drawable[] = [];
  const add = (x: number, y: number, key: string, node: ReactNode) => items.push({ depth: depthOf(x, y), key: `arcade-${key}`, node });
  // 可以玩的機台：俄羅斯方塊（薄荷綠機台）、彈珠台（薰衣草紫）
  for (const arcade of plan.arcades) {
    const { x, y, w, d, h } = arcade;
    if (arcade.game === "tetris") {
      // 俄羅斯方塊機台：背貼左牆，螢幕朝右前方（x + w 那一面）
      const onSide = (fy: number, z: number) => {
        const [sx, sy] = P(x + w, fy, z);
        return `matrix(${COS} ${-SIN} 0 1 ${sx} ${sy})`;
      };
      add(x + w / 2, y + d / 2, "tetris", (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color="#7dd3c0" />
          {/* 頂部招牌 */}
          <Box x={x - 0.03} y={y - 0.03} z={h} w={w + 0.06} d={d + 0.06} h={5} color="#ff8fb8" />
          {/* 操作台 */}
          <Box x={x + w} y={y} z={24} w={0.25} d={d} h={4} color="#ffd166" />
          <g transform={onSide(y + d - 0.08, h - 5)}>
            <rect width={UNIT * (d - 0.16)} height={9} rx={2} fill="#ff8fb8" />
            <text x={(UNIT * (d - 0.16)) / 2} y={7} textAnchor="middle" fontSize={6.5} fontWeight={800} fill="#ffffff">方塊</text>
          </g>
          <g transform={onSide(y + d - 0.1, h - 16)}>
            <rect width={UNIT * (d - 0.2)} height={20} rx={2} fill="#1e2a4a" />
            {[
              [3, 3, "#ff6b6b"], [6, 3, "#ff6b6b"], [6, 6, "#ff6b6b"],
              [9, 12, "#4cc9f0"], [12, 12, "#4cc9f0"], [15, 12, "#4cc9f0"], [3, 15, "#ffd166"], [6, 15, "#ffd166"], [9, 15, "#06d6a0"], [12, 15, "#06d6a0"], [15, 15, "#b388ff"],
            ].map(([bx, by, c], i) => (
              <rect key={i} x={bx as number} y={by as number} width={2.6} height={2.6} fill={c as string} />
            ))}
          </g>
          {/* 搖桿與按鈕 */}
          {(() => {
            const [jx, jy] = P(x + w + 0.12, y + d - 0.3, 28);
            const [bx, by] = P(x + w + 0.12, y + 0.3, 28);
            return (
              <>
                <line x1={jx} y1={jy} x2={jx} y2={jy - 5} stroke="#3c4043" strokeWidth={1.4} />
                <circle cx={jx} cy={jy - 6} r={2} fill="#ff6b6b" />
                <circle cx={bx} cy={by - 1} r={1.6} fill="#4cc9f0" />
                <circle cx={bx + 4} cy={by - 3} r={1.6} fill="#06d6a0" />
              </>
            );
          })()}
        </g>
      ));
    } else {
      // 彈珠台：長邊沿著 x（靠左牆），背板在左端貼著牆，玩的人站在右端
      const box = 0.28;
      add(x + w / 2, y + d / 2, "pinball", (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color="#b9a5f5" />
          {/* 檯面：深藍底、彩色碰撞柱 */}
          {flat(x + box + 0.04, y + 0.06, w - box - 0.1, d - 0.12, "#1e2a4a", h + 0.5)}
          {[
            [0.7, 0.25, "#ff8fb8"], [0.6, 0.58, "#ffd166"], [0.95, 0.42, "#4cc9f0"],
          ].map(([fx, fy, c], i) => {
            const [cx, cy] = P(x + (fx as number), y + (fy as number), h + 2);
            return <circle key={i} cx={cx} cy={cy} r={2.6} fill={c as string} stroke="#ffffff" strokeWidth={0.6} />;
          })}
          {(() => {
            const [ax, ay] = P(x + w - 0.15, y + 0.2, h + 1);
            const [bx, by] = P(x + w - 0.15, y + 0.6, h + 1);
            return (
              <>
                <line x1={ax} y1={ay} x2={ax - 4} y2={ay + 3} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
                <line x1={bx} y1={by} x2={bx - 1} y2={by - 4} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
              </>
            );
          })()}
          <Box x={x} y={y} z={h} w={box} d={d} h={32} color="#9b87f5" />
          {/* 背板正面（朝右前方）的螢幕 */}
          <g transform={`matrix(${COS} ${-SIN} 0 1 ${P(x + box, y + d - 0.06, h + 29)[0]} ${P(x + box, y + d - 0.06, h + 29)[1]})`}>
            <rect width={UNIT * (d - 0.12)} height={24} rx={2} fill="#fff4b8" />
            <polygon points="10,4 12,9 17,9 13,12 15,17 10,14 5,17 7,12 3,9 8,9" fill="#ff8fb8" />
            <text x={UNIT * (d - 0.12) - 3} y={14} textAnchor="end" fontSize={5.5} fontWeight={800} fill="#7c3aed">彈珠</text>
          </g>
        </g>
      ));
    }
  }
  return items;
}

// ── 牆壁與地板 ──────────────────────────────────────

function walls(plan: Plan, room: Room): ReactNode {
  if (room.kind === "courtyard") return null; // 中庭花園是露天的，沒有牆
  const { P } = painter(plan);
  const t = plan.theme;
  const { ox, oy } = room;
  const E = ox + ROOM;
  const S = oy + ROOM;
  // 把平面圖形「貼」到斜的牆上：後牆往右下斜、左牆往左下斜
  const unit = Math.hypot(TILE_W / 2, TILE_H / 2);
  const cos = TILE_W / 2 / unit;
  const sin = TILE_H / 2 / unit;
  const onBack = (x: number, z: number) => {
    const [sx, sy] = P(x, oy, z);
    return `matrix(${cos} ${sin} 0 1 ${sx} ${sy})`;
  };
  const onLeft = (y: number, z: number) => {
    const [sx, sy] = P(ox, y, z);
    return `matrix(${-cos} ${sin} 0 1 ${sx} ${sy})`;
  };
  // 名牌寬度依名稱長度調整，置中在後牆上
  const plate = room.name.length * 11 + 16;
  const style = plan.config.walls; // 圖片主題的牆面樣式：艙壁（panel）、磚牆（brick）
  const span = unit * ROOM;
  const winW = unit * 1.1;

  return (
    <g key={`${room.id}-walls`}>
      <polygon points={pts([P(ox, oy), P(E, oy), P(E, oy, WALL_H), P(ox, oy, WALL_H)])} fill={shade(t.wall, -0.04)} stroke={t.wallLine} strokeWidth={0.8} />
      <polygon points={pts([P(ox, oy), P(ox, S), P(ox, S, WALL_H), P(ox, oy, WALL_H)])} fill={shade(t.wall, -0.12)} stroke={t.wallLine} strokeWidth={0.8} />
      {/* 磚牆紋路：一塊塊交錯的磚 */}
      {style?.style === "brick" && (
        <>
          <g transform={onBack(ox, WALL_H)}>
            <rect width={span} height={WALL_H} fill={`url(#brick-${plan.config.id})`} />
          </g>
          <g transform={onLeft(oy, WALL_H)} opacity={0.85}>
            <rect width={span} height={WALL_H} fill={`url(#brick-${plan.config.id})`} />
          </g>
        </>
      )}
      {/* 艙壁：每格一道接縫，腰部一條發光色帶 */}
      {style?.style === "panel" && (
        <>
          <g transform={onBack(ox, WALL_H)}>
            {Array.from({ length: ROOM - 1 }, (_, i) => (
              <line key={i} x1={unit * (i + 1)} y1={4} x2={unit * (i + 1)} y2={WALL_H} stroke={t.wallLine} strokeWidth={1} />
            ))}
            <rect y={WALL_H - 22} width={span} height={5} fill={style.stripe} />
          </g>
          <g transform={onLeft(oy, WALL_H)}>
            {Array.from({ length: ROOM - 1 }, (_, i) => (
              <line key={i} x1={unit * (i + 1)} y1={4} x2={unit * (i + 1)} y2={WALL_H} stroke={t.wallLine} strokeWidth={1} />
            ))}
            <rect y={WALL_H - 22} width={span} height={5} fill={shade(style.stripe, -0.15)} />
          </g>
        </>
      )}
      <polyline points={pts([P(ox, S, WALL_H), P(ox, oy, WALL_H), P(E, oy, WALL_H)])} fill="none" stroke={t.wallTop} strokeWidth={style ? 4 : 3} strokeLinecap="round" />
      {[0.4, 6.5].map((wx) => (
        <g key={wx} transform={onBack(ox + wx, WALL_H - 18)}>
          {style?.window === "porthole" ? (
            // 圓角舷窗：外框 + 發光的玻璃
            <>
              <rect x={-2} y={-2} width={winW + 4} height={38} rx={14} fill={shade(t.wall, -0.3)} />
              <rect width={winW} height={34} rx={12} fill={t.window} />
              <rect x={4} y={4} width={winW * 0.35} height={10} rx={5} fill="#ffffff" opacity={0.5} />
            </>
          ) : style?.window === "arched" ? (
            // 尖拱窗：暖色的彩繪玻璃
            <>
              <path d={`M -2 36 V 14 Q -2 -4 ${winW / 2} -6 Q ${winW + 2} -4 ${winW + 2} 14 V 36 Z`} fill={shade(t.wallLine, -0.2)} />
              <path d={`M 0 34 V 14 Q 0 -2 ${winW / 2} -4 Q ${winW} -2 ${winW} 14 V 34 Z`} fill={t.window} />
              <line x1={winW / 2} y1={-4} x2={winW / 2} y2={34} stroke={shade(t.wallLine, -0.2)} strokeWidth={1.5} />
              <line x1={0} y1={16} x2={winW} y2={16} stroke={shade(t.wallLine, -0.2)} strokeWidth={1.5} />
            </>
          ) : (
            <>
              <rect width={winW} height={34} fill={t.window} stroke="#ffffff" strokeWidth={3} />
              <line x1={unit * 0.55} y1={0} x2={unit * 0.55} y2={34} stroke="#ffffff" strokeWidth={2} />
            </>
          )}
        </g>
      ))}
      <g transform={onBack(ox + ROOM / 2 - plate / unit / 2, WALL_H - 24)}>
        {/* 老闆辦公室用金色名牌 */}
        <rect width={plate} height={20} rx={4} fill={room.kind === "boss" ? "#c9a227" : t.plate} />
        <text x={plate / 2} y={14} textAnchor="middle" fontSize={11} fontWeight={700} fill={room.kind === "boss" ? "#2b1b12" : t.plateText}>
          {room.name}
        </text>
      </g>
      {!style && (
        <g transform={onLeft(oy + 3.6, WALL_H - 20)}>
          <rect width={unit * 0.9} height={30} fill="#ffffff" stroke={t.wallLine} />
          <rect x={5} y={5} width={unit * 0.9 - 10} height={12} fill={room.floor[1]} />
        </g>
      )}
    </g>
  );
}

// 地板：一般是兩色交錯的方格；艙壁主題是金屬地板（內框＋四角鉚釘）；磚牆主題是深淺不一的石板
function floor(plan: Plan, room: Room): ReactNode {
  const { P } = painter(plan);
  const style = room.kind === "courtyard" || (room.kind === "playground" && plan.config.floor === "stone") ? undefined : plan.config.floor;
  const tiles: ReactNode[] = [];
  for (let i = 0; i < ROOM; i++) {
    for (let j = 0; j < ROOM; j++) {
      const x = room.ox + i;
      const y = room.oy + j;
      const quad = (inset: number) => pts([P(x + inset, y + inset), P(x + 1 - inset, y + inset), P(x + 1 - inset, y + 1 - inset), P(x + inset, y + 1 - inset)]);
      if (style === "stone") {
        // 每塊石板的深淺固定（依位置算），接縫是深色的灰泥
        const tone = ((i * 7 + j * 13 + room.ox) % 5) / 5;
        tiles.push(<polygon key={`${i}-${j}`} points={quad(0)} fill={shade(room.floor[0], (tone - 0.5) * 0.12)} stroke={shade(room.floor[1], -0.3)} strokeWidth={1.2} />);
      } else if (style === "panel") {
        tiles.push(
          <g key={`${i}-${j}`}>
            <polygon points={quad(0)} fill={room.floor[(i + j) % 2]} stroke={shade(room.floor[0], -0.25)} strokeWidth={0.8} />
            <polygon points={quad(0.14)} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.8} />
          </g>,
        );
      } else
        tiles.push(
          <polygon
            key={`${i}-${j}`}
            points={quad(0)}
            fill={room.floor[(i + j) % 2]}
            stroke="#ffffff"
            strokeOpacity={0.5}
            strokeWidth={0.5}
          />,
        );
    }
  }
  return <g key={`${room.id}-floor`}>{tiles}</g>;
}

// 最底層：花園草地、小徑、建築地板與牆（永遠在最後面）
export function Background({ plan, behind }: { plan: Plan; behind?: ReactNode }) {
  const { P } = painter(plan);
  const t = plan.theme;
  const W = plan.buildingW;
  const H = plan.buildingH;
  const G = GARDEN;
  const poly = (x: number, y: number, w: number, d: number) => pts([P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d)]);
  const config = plan.config;
  return (
    <g>
      {/* 磚牆紋路（磚牆主題用） */}
      {config.walls?.style === "brick" && (
        <defs>
          <pattern id={`brick-${config.id}`} width={22} height={20} patternUnits="userSpaceOnUse">
            <rect width={22} height={20} fill={t.wall} />
            <path d="M 0 0.5 H 22 M 0 10.5 H 22 M 0.5 0 V 10 M 11.5 10 V 20" stroke={t.wallLine} strokeWidth={1} />
          </pattern>
        </defs>
      )}
      {/* 草地（外圈顏色較深） */}
      <polygon points={poly(-G, -G, W + 2 * G, H + 2 * G)} fill={t.grass[1]} />
      <polygon points={poly(-G + 0.6, -G + 0.6, W + 2 * G - 1.2, H + 2 * G - 1.2)} fill={t.grass[0]} />
      {/* 金屬地板主題：戶外是停機坪，畫上淡淡的格線 */}
      {config.renderer === "sprite" && config.floor === "panel" && (
        <g stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1}>
          {Array.from({ length: Math.floor((W + 2 * G) / 2) + 1 }, (_, i) => (
            <line key={`gx${i}`} x1={P(-G + i * 2, -G)[0]} y1={P(-G + i * 2, -G)[1]} x2={P(-G + i * 2, H + G)[0]} y2={P(-G + i * 2, H + G)[1]} />
          ))}
          {Array.from({ length: Math.floor((H + 2 * G) / 2) + 1 }, (_, j) => (
            <line key={`gy${j}`} x1={P(-G, -G + j * 2)[0]} y1={P(-G, -G + j * 2)[1]} x2={P(W + G, -G + j * 2)[0]} y2={P(W + G, -G + j * 2)[1]} />
          ))}
        </g>
      )}
      {/* 建築前方與右側的小徑 */}
      <polygon points={poly(-0.5, H + 1, W + 2.5, 1)} fill={t.path} />
      <polygon points={poly(W + 1, -0.5, 1, H + 2.5)} fill={t.path} />
      {/* 建築後方、左方的戶外擺設（畫在牆的下面） */}
      {behind}
      {/* 建築地基（走廊地板） */}
      <polygon points={poly(-0.5, -0.5, W + 1, H + 1)} fill={t.corridor} stroke={shade(t.corridor, -0.15)} />
      {plan.rooms.map((room) => floor(plan, room))}
      {plan.rooms.map((room) => walls(plan, room))}
    </g>
  );
}

// 所有家具與花園擺設（之後會跟坐著的人物一起依深度排序）
export function sceneItems(plan: Plan): Drawable[] {
  // 圖片主題：家具是 3D 模型算好的圖片（sprites.tsx）
  if (plan.config.renderer === "sprite") return [...spriteItems(plan), ...arcadeItems(plan)];
  return [...gardenItems(plan), ...plan.rooms.flatMap((room) => furniture(plan, room)), ...arcadeItems(plan)];
}

// ── 會議室白板：顯示目前交辦事項的進度條 ─────────────
// 掛在會議室後牆上；資料每 5 秒更新，所以不放進固定的背景裡
export type BoardItem = { title: string; status: string; progress: number };

export function Whiteboard({ plan, items }: { plan: Plan; items: BoardItem[] }) {
  const room = plan.rooms.find((r) => r.kind === "meeting");
  if (!room) return null;
  const { P } = painter(plan);
  const unit = Math.hypot(TILE_W / 2, TILE_H / 2);
  const cos = TILE_W / 2 / unit;
  const sin = TILE_H / 2 / unit;
  const [sx, sy] = P(room.ox + 1.7, room.oy, 45); // 名牌下方
  const W = unit * 4.6;
  const H = 40;
  const rows = items.slice(0, 4);
  const shortTitle = (t: string) => (t.length > 11 ? `${t.slice(0, 11)}…` : t);
  return (
    <g transform={`matrix(${cos} ${sin} 0 1 ${sx} ${sy})`} className="pointer-events-none">
      <rect x={-2} y={-2} width={W + 4} height={H + 4} rx={2} fill="#9aa0a6" />
      <rect width={W} height={H} fill="#ffffff" />
      <text x={4} y={8} fontSize={6.5} fontWeight={700} fill="#202124">交辦進度</text>
      {rows.length === 0 && (
        <text x={4} y={22} fontSize={6} fill="#5f6368">目前沒有交辦事項</text>
      )}
      {rows.map((item, i) => {
        const y = 13 + i * 7;
        const color = item.status === "completed" ? "#34a853" : item.status === "failed" ? "#ea4335" : "#4285f4";
        return (
          <g key={i}>
            <text x={4} y={y + 4} fontSize={5.2} fill="#202124">{shortTitle(item.title)}</text>
            <rect x={W * 0.52} y={y} width={W * 0.36} height={4} rx={2} fill="#e8eaed" />
            <rect x={W * 0.52} y={y} width={(W * 0.36 * item.progress) / 100} height={4} rx={2} fill={color} />
            <text x={W * 0.9} y={y + 4} fontSize={5} fill="#5f6368">{item.progress}%</text>
          </g>
        );
      })}
    </g>
  );
}
