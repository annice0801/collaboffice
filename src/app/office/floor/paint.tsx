// 等角繪圖的共用工具：方塊、貼地平面、顏色明暗（scene.tsx 與 sprites.tsx 共用）

import type { ReactNode } from "react";
import { project, type Plan } from "./plan";

// behind：在建築後方或左方的戶外擺設，要畫在牆的下面（不然會蓋到牆上）
export type Drawable = { depth: number; key: string; node: ReactNode; behind?: boolean };

export const pts = (list: [number, number][]) => list.map(([a, b]) => `${a},${b}`).join(" ");

// 把顏色調亮或調暗（amount：-1 ~ 1），用來畫方塊的受光面與背光面
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) =>
    Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

// 所有繪圖函式共用的工具：綁定這張平面圖的投影
export function painter(plan: Plan) {
  const P = (x: number, y: number, z = 0) => project(plan, x, y, z);

  // 等角方塊：(x, y) 是左後角，w × d 是佔地格數，z 是離地高度，h 是方塊高度（像素）
  // 只畫看得到的三個面：頂面、左前面、右前面
  function Box({ x, y, z = 0, w, d, h, color, line = true }: { x: number; y: number; z?: number; w: number; d: number; h: number; color: string; line?: boolean }) {
    const top = z + h;
    const stroke = line ? { stroke: shade(color, -0.35), strokeWidth: 0.6 } : {};
    return (
      <g strokeLinejoin="round">
        <polygon points={pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, top), P(x, y + d, top)])} fill={shade(color, -0.12)} {...stroke} />
        <polygon points={pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, top), P(x + w, y, top)])} fill={shade(color, -0.25)} {...stroke} />
        <polygon points={pts([P(x, y, top), P(x + w, y, top), P(x + w, y + d, top), P(x, y + d, top)])} fill={color} {...stroke} />
      </g>
    );
  }

  // 貼地的平面（地毯、桌墊）
  const flat = (x: number, y: number, w: number, d: number, fill: string, z = 0.5, opacity = 1) => (
    <polygon points={pts([P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)])} fill={fill} opacity={opacity} />
  );

  return { P, Box, flat };
}

