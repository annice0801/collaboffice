// 圖片主題（星際模式、魔法學院…）的家具與戶外景觀。
// 家具是 3D 模型事先算好的等角圖片（public/themes/<主題>/），擺放位置全部來自主題設定（plan.props）；
// 這裡只負責把圖片放到正確的位置、排好前後順序。

import { spriteOf } from "@/themes";
import { painter, type Drawable } from "./paint";
import { depthOf, GARDEN, project, type PlacedProp, type Plan } from "./plan";
import { pondItems } from "./scene";

const Z_PX = 29.39; // 模型高 1 單位在畫面上幾像素（俯角 30°）

export function spriteItems(plan: Plan): Drawable[] {
  const { config } = plan;
  const items: Drawable[] = plan.props.flatMap((prop, i) => propItems(plan, prop, i));
  const outdoor = config.outdoor;
  if (outdoor) {
    items.push(...pondItems(plan, outdoor.pond, false));
    items.push(...treeItems(plan, outdoor.trees));
  }
  return items;
}

// 一件家具：圖片（可能疊好幾層，例如塔身＋屋頂）或程式畫的特效
function propItems(plan: Plan, p: PlacedProp, i: number): Drawable[] {
  const key = `prop-${i}`;
  if (p.shape) return [shapeItem(plan, p, key)];
  const sprite = spriteOf(plan.config, p.s);
  if (!sprite) return [];
  const base = plan.config.sprites ?? "";
  // at 是佔地中心；圖片的擺放點是模型原點，兩者差一個位移
  const ox = p.x - (sprite.box.minX + sprite.box.maxX) / 2;
  const oy = p.y - (sprite.box.minY + sprite.box.maxY) / 2;
  const layers = [{ s: sprite, z: p.z ?? 0 }];
  let z = (p.z ?? 0) + sprite.box.height * Z_PX;
  for (const name of p.stack ?? []) {
    const s = spriteOf(plan.config, name);
    if (!s) continue;
    layers.push({ s, z });
    z += s.box.height * Z_PX;
  }
  const node = (
    <g>
      {layers.map(({ s, z: lz }, k) => {
        const [sx, sy] = project(plan, ox, oy, lz);
        return <image key={k} href={base + s.file} x={sx - s.ax} y={sy - s.ay} width={s.w} height={s.h} />;
      })}
    </g>
  );
  const behind = p.room === "garden" && (p.x + (sprite.box.maxX - sprite.box.minX) / 2 < 0 || p.y + (sprite.box.maxY - sprite.box.minY) / 2 < 0);
  return [{ depth: p.flat ? -1000 + i * 0.001 : depthOf(p.x, p.y) + (p.bias ?? 0), key, node, behind }];
}

// 程式畫的特效：發光圓墊（反重力墊、全像投影光）、魁地奇圈
function shapeItem(plan: Plan, p: PlacedProp, key: string): Drawable {
  const { P } = painter(plan);
  const color = p.color ?? "#7dd3fc";
  if (p.shape === "pad") {
    const [cx, cy] = P(p.x, p.y, 0.5);
    return {
      depth: -998,
      key,
      node: (
        <g className="pointer-events-none">
          <ellipse cx={cx} cy={cy} rx={26} ry={13} fill={color} opacity={0.18}>
            <animate attributeName="opacity" values="0.12;0.3;0.12" dur="3.2s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={cx} cy={cy} rx={17} ry={8.5} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />
        </g>
      ),
    };
  }
  // 魔法書畫在最上層（office-floor.tsx 的 MagicBook，可以點擊翻頁），這裡不畫
  if (p.shape === "book") return { depth: -2000, key, node: null };
  // 魔藥大鍋：黑色鑄鐵鍋＋三隻腳＋綠色魔藥，鍋邊斜插一支大湯匙
  if (p.shape === "cauldron") {
    const [cx, cy] = P(p.x, p.y, 0);
    return {
      depth: depthOf(p.x, p.y),
      key,
      node: (
        <g>
          <ellipse cx={cx} cy={cy + 2} rx={22} ry={9} fill="#000" opacity={0.18} />
          {[-14, 0, 14].map((dx) => (
            <rect key={dx} x={cx + dx - 2} y={cy - 6} width={4} height={8} fill="#2b2b33" />
          ))}
          <path d={`M ${cx - 20} ${cy - 26} Q ${cx - 22} ${cy - 2} ${cx} ${cy - 2} Q ${cx + 22} ${cy - 2} ${cx + 20} ${cy - 26} Z`} fill="#2f2f38" stroke="#16161c" />
          <ellipse cx={cx} cy={cy - 26} rx={20} ry={7} fill="#3a3a44" stroke="#16161c" />
          <ellipse cx={cx} cy={cy - 25} rx={16} ry={5} fill={color === "#7dd3fc" ? "#6fd36f" : color} />
          <line x1={cx + 6} y1={cy - 26} x2={cx + 16} y2={cy - 52} stroke="#8a5a3b" strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={cx + 16} cy={cy - 54} rx={4} ry={3} fill="#8a5a3b" />
        </g>
      ),
    };
  }
  // 停在地上的飛天掃帚（點它附近，會有閒著的人來騎）
  if (p.shape === "broom") {
    const [bx, by] = P(p.x, p.y, 0);
    return {
      depth: -997,
      key,
      node: (
        <g>
          <line x1={bx - 18} y1={by + 4} x2={bx + 10} y2={by - 4} stroke="#8a5a3b" strokeWidth={3} strokeLinecap="round" />
          <path d={`M ${bx + 8} ${by - 6} L ${bx + 22} ${by - 10} L ${bx + 24} ${by - 1} L ${bx + 10} ${by - 1} Z`} fill="#d9b26a" stroke="#a8843a" />
          <circle cx={bx - 4} cy={by} r={9} fill="#fff3b0" opacity={0.25}>
            <animate attributeName="opacity" values="0.1;0.35;0.1" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </g>
      ),
    };
  }
  // 魁地奇圈：細長的柱子頂端一個金色圓圈
  const [bx, by] = P(p.x, p.y, 0);
  return {
    depth: depthOf(p.x, p.y),
    key,
    node: (
      <g>
        <line x1={bx} y1={by} x2={bx} y2={by - 58} stroke="#8a6a3a" strokeWidth={2.5} />
        <ellipse cx={bx} cy={by - 70} rx={9} ry={13} fill="none" stroke={color} strokeWidth={3} />
      </g>
    ),
  };
}

// 戶外的樹：沿著建築四周排成樹林（池塘附近不種）
function treeItems(plan: Plan, names: string[]): Drawable[] {
  if (!names.length) return [];
  const W = plan.buildingW;
  const H = plan.buildingH;
  const { pond } = plan.outdoor;
  const spots: [number, number][] = [];
  for (let i = -GARDEN + 2; i <= W + 4; i += 4) spots.push([i + 1, -2.4], [i + 3, -GARDEN + 1.5]);
  for (let j = -GARDEN + 4; j <= H + 4; j += 4) spots.push([-2.4, j + 1], [-GARDEN + 1.5, j + 3]);
  for (let j = -2; j <= H + GARDEN - 2; j += 4) spots.push([W + GARDEN - 1.2, j]);
  for (let i = -2; i <= W + GARDEN - 4; i += 4) spots.push([i, H + GARDEN - 1.2]);
  // 避開池塘與戶外的大型擺設
  const near = ([x, y]: [number, number]) =>
    ((x - pond.x) / (pond.rx + 2)) ** 2 + ((y - pond.y) / (pond.ry + 2)) ** 2 < 1 ||
    plan.props.some((p) => p.room === "garden" && Math.hypot(p.x - x, p.y - y) < 2.4);
  return spots
    .filter((s) => !near(s))
    .flatMap(([x, y], i) => propItems(plan, { s: names[i % names.length], at: [0, 0], x, y, room: "garden" }, 10000 + i));
}
