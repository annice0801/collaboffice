// 立體辦公室的「座標系統」「平面配置」與「風格配色」。
//
// 等角投影（Isometric）：把地板的格子轉 45 度、再壓扁一半，看起來就像從斜上方俯視。
// 世界座標用「格」當單位：x 往右下、y 往左下、z 是高度（像素）。
//
// 每位會員的部門數量不同，所以平面圖是依部門清單「算出來」的（buildPlan）：
//   房間依序排成三欄：老闆辦公室、秘書室、總經理室、休憩間、各部門…、圖書館、遊戲室、
//   遊樂區（溜滑梯、球池、攀岩牆）、紓壓室（睡眠艙、按摩椅、跑步機辦公桌）；
//   會議室固定放在整棟樓的正中間（大家從四面八方走過去距離差不多）；
//   最後一排的空格是中庭花園
//   整棟建築外面圍一大圈草地：吊床、戶外野餐桌（可以帶筆電來工作）、池塘、樹林
//
// 配色、家具、房間名稱、可以去的地方都來自主題設定（src/themes/<主題>.json），這裡只負責「照設定擺」。
// 擺好之後算出障礙物地圖（nav.ts），人物用 A* 找路，不會穿過牆或家具。

import { EXECUTIVES, managerOf, staffAgentId, USER, type Department, type OfficeStyle } from "@/lib/company";
import { getTheme, spriteOf, SVG_LAYOUT, type Palette, type PropDef, type ThemeConfig } from "@/themes";
import type { Pose } from "./character";
import { buildNav, findPath, type Nav } from "./nav";

export const TILE_W = 48; // 一格地板在螢幕上的寬
export const TILE_H = 24; // 一格地板在螢幕上的高（寬的一半 → 標準等角比例）
export const WALL_H = 72; // 牆的高度（像素）
export const ROOM = 8; //   每間房間 8×8 格
export const PITCH = 10; // 房間間距（8 格房間 + 2 格走廊）
const COLS = 3; //          每排三間
export const GARDEN = 8; // 建築外圍草地的寬度（格）：前方與右側有吊床、野餐桌、池塘
const HEADROOM = 110; //    上方留給對話氣泡的空間
const PAD = 24;

// 世界座標的「前後深度」：數字越大越靠近觀看者，要越晚畫（才會蓋在前面）
export const depthOf = (x: number, y: number) => x + y;

// 配色（來自主題設定）
export type Theme = Palette;

// ── 房間 ────────────────────────────────────────────

export type RoomKind = "boss" | "assistant" | "gm" | "department" | "break" | "library" | "game" | "playground" | "wellness" | "meeting" | "courtyard";
export type Seat = { agent: string; x: number; y: number; boss: boolean; chair: string };
export type Room = {
  id: string;
  name: string;
  kind: RoomKind;
  ox: number; // 房間左上角（世界座標）
  oy: number;
  floor: [string, string];
  seats: Seat[];
  spots: [number, number][]; // 可以走過去站著的位置
  door: [number, number]; //    房間右前方的走廊路口（進出房間都經過這裡）
};

// 走路路線上的一個點。z 是離地高度（像素），pose 是走這一段時的姿勢（例如爬梯子、溜滑梯），
// speed 是速度倍率（溜滑梯很快、爬梯子很慢）
export type Waypoint = { x: number; y: number; z?: number; pose?: Pose; speed?: number };

// 「定點」：人物會走過去停下來的位置，例如辦公桌、沙發、睡眠艙、溜滑梯
export type Rest = {
  key?: string; //       有 key 的定點一次只能一個人用（沙發座位、睡眠艙…）
  room: string;
  x: number;
  y: number;
  z?: number;
  pose: Pose; //         到了之後的姿勢
  bias?: number; //      畫圖深度的微調：坐在沙發上的人要畫在沙發前面
  label?: string; //     在做什麼（資訊卡顯示）
  via?: Waypoint[]; //   最後一段特別的路線（例如：爬上滑梯塔 → 溜下來）
  exit?: Waypoint[]; //  離開時要先走的路（例如：從攀岩牆爬下來）
  visit?: string; //     去找這個人聊天（老闆走到空閒的主管旁邊）
};

// 遊戲室裡可以玩的機台：點了之後老闆走過去玩，再打開遊戲分頁（/games/<game>）
export type GameId = "tetris" | "pinball";
export const GAMES: Record<GameId, { name: string; emoji: string }> = {
  tetris: { name: "俄羅斯方塊", emoji: "🧱" },
  pinball: { name: "彈珠台", emoji: "🎯" },
};
export type Arcade = {
  game: GameId;
  x: number; // 機台佔地（左後角、寬、深、高），點擊範圍也用這個
  y: number;
  w: number;
  d: number;
  h: number;
  spot: Rest; // 站在機台前玩的位置（背對我們）
};
// 兩台機台都靠左牆：正面朝 +x（右前方），玩的人站在機台右邊

// 擺在地圖上的一件家具（絕對座標，at 是佔地中心）
export type PlacedProp = PropDef & { x: number; y: number; room: string };
// 障礙物：x, y 是左後角，w × d 是佔地（格）
export type Box = { x: number; y: number; w: number; d: number };

export type Plan = {
  theme: Theme;
  config: ThemeConfig; // 主題設定（家具圖片、牆面與地板樣式、戶外景觀、服裝…）
  props: PlacedProp[]; //  圖片主題的家具（SVG 主題是空的，家具由 scene.tsx 畫）
  obstacles: Box[]; //     擋路的家具
  nav: Nav; //             障礙物地圖（尋路用）
  rooms: Room[];
  seats: (Seat & { room: Room })[];
  hangouts: Rest[]; //    閒著時可以去的地方
  workSpots: Rest[]; //   辦公桌以外，也可以帶筆電去工作的地方
  napSpots: Rest[]; //    睡眠艙
  arcades: Arcade[]; //   遊戲室的機台（俄羅斯方塊、彈珠台）
  // 休憩間的咖啡機：點了會冒蒸氣、做好一杯，閒著的人走過來拿（x, y, z 是咖啡機頂端；spot 是拿咖啡站的位置）
  coffee: { room: string; x: number; y: number; z: number; spot: Rest } | null;
  // 魔法學院：會議桌上漂浮的魔法書、醫護翼的魔藥大鍋（站在 spot 攪拌、喝魔藥）
  book: { x: number; y: number; z: number } | null;
  cauldron: { room: string; x: number; y: number; spot: Rest } | null;
  // 戶外設施的位置（scene.tsx 依這裡畫出來）
  outdoor: {
    hammocks: { x: number; y: number }[]; // 吊床左邊柱子的位置，往右延伸 2 格
    picnics: { x: number; y: number }[]; //  野餐桌左後角
    pond: { x: number; y: number; rx: number; ry: number }; // 池塘中心與半徑（格）
  };
  meetingSpots: Rest[]; // 開會的位置：[0] 老闆主持、[1] 總經理、其他人依序坐滿椅子再圍著站
  shirts: Record<string, string>; // 部門代號 → 襯衫顏色
  buildingW: number; // 建築的寬（x 方向格數）
  buildingH: number; // 建築的深（y 方向格數）
  viewW: number;
  viewH: number;
  originX: number;
  originY: number;
};

// 世界座標 → 螢幕座標
export function project(plan: Plan, x: number, y: number, z = 0): [number, number] {
  return [(x - y) * (TILE_W / 2) + plan.originX, (x + y) * (TILE_H / 2) + plan.originY - z];
}

// 房間裡一般可站的位置：前方走道與中間走道
function walkSpots(ox: number, oy: number): [number, number][] {
  return [
    [ox + 1.5, oy + 7.3],
    [ox + 3.5, oy + 7.4],
    [ox + 5.5, oy + 7.2],
    [ox + 7.2, oy + 6.5],
    [ox + 3.0, oy + 3.5],
    [ox + 7.3, oy + 3.0],
  ];
}

export function buildPlan(departments: Department[], style: OfficeStyle): Plan {
  const config = getTheme(style);
  const theme = config.palette;
  const named = (kind: Room["kind"], name: string) => config.roomNames?.[kind] ?? name;
  const longTable = config.seats?.layout === "longTable";
  const [assistant, manager] = EXECUTIVES;
  const chairOf = (i: number) => theme.chairs[i % theme.chairs.length];

  // 依序排列的房間（還沒決定位置）
  type Draft = Omit<Room, "ox" | "oy" | "seats" | "spots" | "door"> & { agents?: string[] };
  const drafts: Draft[] = [
    // 老闆辦公室：你自己的位子，整層樓最高級的房間
    { id: "boss", name: named("boss", "老闆辦公室"), kind: "boss", floor: theme.rooms.boss, agents: [USER] },
    { id: "assistant", name: named("assistant", "秘書室"), kind: "assistant", floor: theme.rooms.assistant, agents: [assistant.id] },
    { id: "gm", name: named("gm", "總經理室"), kind: "gm", floor: theme.rooms.gm, agents: [manager.id] },
    { id: "break", name: named("break", "休憩間"), kind: "break", floor: theme.rooms.break },
    ...departments.map(
      (dept, i): Draft => ({
        id: `dept-${dept.id}`,
        name: dept.name,
        kind: "department",
        floor: theme.departments[i % theme.departments.length].floor,
        agents: [managerOf(dept.id), ...dept.staff.map((s) => staffAgentId(dept.id, s.id))],
      }),
    ),
    { id: "library", name: named("library", "圖書館"), kind: "library", floor: theme.rooms.library },
    { id: "game", name: named("game", "遊戲室"), kind: "game", floor: theme.rooms.game },
    { id: "playground", name: named("playground", "遊樂區"), kind: "playground", floor: theme.rooms.playground },
    { id: "wellness", name: named("wellness", "紓壓室"), kind: "wellness", floor: theme.rooms.wellness },
  ];

  // 會議室插在正中間那一格（中間那一排的中間那欄）
  const rowCount = Math.ceil((drafts.length + 1) / COLS);
  const center = Math.floor(rowCount / 2) * COLS + Math.floor(COLS / 2);
  drafts.splice(Math.min(center, drafts.length), 0, { id: "meeting", name: named("meeting", "會議室"), kind: "meeting", floor: theme.rooms.meeting });

  // 最後一排沒排滿的空格，做成沒有牆的「中庭花園」
  while (drafts.length % COLS) {
    drafts.push({ id: `courtyard-${drafts.length}`, name: named("courtyard", "中庭花園"), kind: "courtyard", floor: theme.grass });
  }
  const rows = drafts.length / COLS;
  const buildingW = COLS * PITCH - 2;
  const buildingH = rows * PITCH - 2;

  let chairIndex = 0;
  const rooms: Room[] = drafts.map((draft, i) => {
    const ox = (i % COLS) * PITCH;
    const oy = Math.floor(i / COLS) * PITCH;
    const agents = draft.agents ?? [];
    const single = agents.length === 1; // 秘書室、總經理室只有一張桌子，放在中間
    // 學院長桌：每排 4 人坐在長桌後方；一般辦公桌：兩兩一排
    const long = longTable && draft.kind === "department";
    const seats: Seat[] = agents.map((agent, j) => ({
      agent,
      x: single ? ox + 3.2 : long ? ox + 1.3 + (j % 4) * 1.8 : ox + (j % 2 === 0 ? 1.2 : 4.8),
      y: single ? oy + 2.4 : long ? oy + 2.2 + Math.floor(j / 4) * 3 : oy + 1.2 + Math.floor(j / 2) * 2.3,
      boss: j === 0,
      chair: chairOf(chairIndex++),
    }));
    return { ...draft, ox, oy, seats, spots: walkSpots(ox, oy), door: [ox + ROOM + 1, oy + ROOM + 1] };
  });

  // ── 各種定點 ──
  const hangouts: Rest[] = [];
  const workSpots: Rest[] = [];
  const napSpots: Rest[] = [];
  const arcades: Arcade[] = [];
  // 可以坐的座位：工作時帶筆電來坐，閒著時來這裡放鬆
  const seat = (key: string, room: string, x: number, y: number, place: string, bias = 0.5) => {
    workSpots.push({ key, room, x, y, pose: "laptop", bias, label: `在${place}用筆電工作` });
    hangouts.push({ key, room, x, y, pose: "lounge", bias, label: `在${place}休息` });
  };
  const stand = (room: Room, list: [number, number][]) =>
    hangouts.push(...list.map(([dx, dy]): Rest => ({ room: room.id, x: room.ox + dx, y: room.oy + dy, pose: "stand" })));

  // 遊戲室的機台（每個主題都有）：俄羅斯方塊機台（後牆）與彈珠台（左後角，長邊沿著左牆）；閒著的員工也會來玩
  for (const room of rooms.filter((r) => r.kind === "game")) {
    const { ox, oy, id } = room;
    const play = (game: GameId, x: number, y: number): Rest => ({ key: `${id}-${game}`, room: id, x, y, pose: "play", bias: 0.6, label: `在玩${GAMES[game].name}` });
    arcades.push(
      { game: "tetris", x: ox + 0.3, y: oy + 0.6, w: 0.8, d: 0.85, h: 58, spot: play("tetris", ox + 1.55, oy + 1.02) },
      { game: "pinball", x: ox + 0.3, y: oy + 3.3, w: 1.5, d: 0.8, h: 24, spot: play("pinball", ox + 2.25, oy + 3.7) },
    );
    hangouts.push(...arcades.map((a) => a.spot));
  }

  // 圖片主題：可以去的地方都寫在主題設定裡
  for (const room of config.renderer === "sprite" ? rooms : []) {
    for (const spot of config.spots?.[room.kind] ?? []) {
      const rest: Rest = {
        ...(spot.key ? { key: `${room.id}-${spot.key}` } : {}),
        room: room.id,
        x: room.ox + spot.at[0],
        y: room.oy + spot.at[1],
        z: spot.z,
        pose: spot.pose,
        bias: spot.bias,
        label: spot.label || undefined,
      };
      const use = spot.use ?? "hang";
      if (use === "nap") napSpots.push(rest);
      else if (use === "work") workSpots.push({ ...rest, label: spot.label });
      else if (use === "both") {
        workSpots.push({ ...rest, pose: "laptop", label: spot.label.replace(/休息|放鬆|看書|讀魔法書|查資料/, "用筆電工作") });
        hangouts.push(rest);
      } else hangouts.push(rest);
    }
  }

  // SVG 主題（經典、園區）：可以去的地方跟著程式畫的家具
  for (const room of config.renderer === "svg" ? rooms : []) {
    const { ox, oy, id } = room;
    switch (room.kind) {
      case "break":
        stand(room, [[1.5, 2], [5.5, 2.2], [6.6, 6.4]]);
        seat(`${id}-sofa1`, id, ox + 1.9, oy + 3.95, "休憩間沙發上", 0.6);
        seat(`${id}-sofa2`, id, ox + 2.9, oy + 3.95, "休憩間沙發上", 0.6);
        seat(`${id}-bean1`, id, ox + 5.4, oy + 4.7, "懶骨頭上", 0.3);
        seat(`${id}-bean2`, id, ox + 3.2, oy + 6.5, "懶骨頭上", 0.3);
        break;
      case "library":
        stand(room, [[3.5, 2.4], [5, 4.4], [6.9, 3.2]]);
        seat(`${id}-chair1`, id, ox + 3.05, oy + 7.2, "圖書館閱讀椅上");
        seat(`${id}-chair2`, id, ox + 6.05, oy + 7.2, "圖書館閱讀椅上");
        break;
      case "game": {
        stand(room, [[3.2, 4.5], [4.7, 2.5], [6.8, 2], [5.6, 6.5], [4.2, 7.2]]);
        seat(`${id}-bean1`, id, ox + 1.8, oy + 5.7, "遊戲室懶骨頭上", 0.3);
        seat(`${id}-bean2`, id, ox + 2.0, oy + 7.0, "遊戲室懶骨頭上", 0.3);
        break;
      }
      case "courtyard":
        stand(room, [[2.5, 3], [5.5, 5], [3, 6.5]]);
        seat(`${id}-bench`, id, ox + 3.8, oy + 4.5, "中庭長椅上", 0.4);
        break;
      case "playground": {
        // 溜滑梯：從右側梯子爬上塔頂 → 溜下來 → 在滑梯口站一下
        hangouts.push({
          key: `${id}-slide`,
          room: id,
          x: ox + 6.5,
          y: oy + 7.3,
          pose: "stretch",
          label: "剛溜完滑梯",
          via: [
            { x: ox + 7.7, y: oy + 7.5 },
            { x: ox + 7.7, y: oy + 1.1 },
            { x: ox + 7.25, y: oy + 1.1, z: 60, pose: "climb", speed: 0.3 },
            { x: ox + 6.5, y: oy + 1.4, z: 60, pose: "stand", speed: 0.8 },
            { x: ox + 6.5, y: oy + 6.4, z: 3, pose: "ride", speed: 3 },
          ],
        });
        // 攀岩牆（左側牆面）
        for (const [i, wy] of [1.8, 3.2].entries()) {
          hangouts.push({
            key: `${id}-climb${i}`,
            room: id,
            x: ox + 0.4,
            y: oy + wy,
            z: 26,
            pose: "climb",
            label: "在攀岩",
            via: [
              { x: ox + 1.1, y: oy + wy },
              { x: ox + 0.4, y: oy + wy, z: 26, pose: "climb", speed: 0.25 },
            ],
            exit: [{ x: ox + 1.1, y: oy + wy, pose: "climb", speed: 0.4 }],
          });
        }
        // 球池
        for (const [i, [bx, by]] of [[1.8, 5.8], [3.2, 6.4], [2.7, 5.4]].entries()) {
          hangouts.push({ key: `${id}-balls${i}`, room: id, x: ox + bx, y: oy + by, pose: "ride", label: "在球池裡玩" });
        }
        stand(room, [[4.6, 2.6], [5, 7.4]]);
        break;
      }
      case "wellness":
        // 睡眠艙：睡覺時可以來這裡
        for (const [i, px] of [0.6, 2.8].entries()) {
          napSpots.push({ key: `${id}-pod${i}`, room: id, x: ox + px + 0.8, y: oy + 1.3, z: 4, pose: "sleep", bias: 0.1, label: "在睡眠艙小睡" });
        }
        // 跑步機辦公桌：邊走邊工作
        for (const [i, ty] of [3.8, 6.0].entries()) {
          workSpots.push({ key: `${id}-treadmill${i}`, room: id, x: ox + 1.4, y: oy + ty, z: 4, pose: "walk", label: "在跑步機辦公桌邊走邊工作" });
        }
        hangouts.push({ key: `${id}-massage`, room: id, x: ox + 5.85, y: oy + 1.65, pose: "lounge", bias: 0.5, label: "在按摩椅上放鬆" });
        for (const [i, mx] of [4.1, 5.9].entries()) {
          hangouts.push({ key: `${id}-yoga${i}`, room: id, x: ox + mx, y: oy + 5.3, pose: "stretch", label: "在做瑜伽伸展" });
        }
        break;
    }
  }
  // 花園（建築右側與前方）：散步點與長椅
  for (const t of [0.15, 0.45, 0.75]) {
    hangouts.push({ room: "garden", x: buildingW + 2.6, y: buildingH * t, pose: "stand" });
    hangouts.push({ room: "garden", x: buildingW * t, y: buildingH + 2.6, pose: "stand" });
  }
  if (config.renderer === "svg") {
    seat("garden-bench-r", "garden", buildingW + 3.0, buildingH * 0.32 + 0.5, "花園長椅上", 0.4);
    seat("garden-bench-f", "garden", buildingW * 0.32 + 0.8, buildingH + 2.7, "花園長椅上", 0.4);
  }

  // ── 戶外草地：吊床、野餐桌、池塘 ──
  const W = buildingW;
  const H = buildingH;
  const outdoor: Plan["outdoor"] = {
    hammocks: [{ x: 1.5, y: H + 5.2 }, { x: 5.5, y: H + 6.4 }, { x: W + 4.2, y: H * 0.55 }, { x: W + 4.2, y: H * 0.72 }],
    picnics: [{ x: W * 0.36, y: H + 5 }, { x: W * 0.36 + 3.2, y: H + 5 }, { x: W + 4.5, y: H * 0.12 }],
    pond: { x: W * 0.78, y: H + 5.4, rx: 3, ry: 1.6 },
  };
  // 圖片主題的戶外：吊床、野餐桌換成主題的家具（例如休息艙、讀書桌）
  const themed = config.renderer === "sprite" ? config.outdoor : undefined;
  outdoor.hammocks.forEach((h, i) => {
    const spot = { key: `hammock${i}`, room: "garden", x: h.x + 1, y: h.y + 0.3, z: 8, bias: 0.1 };
    hangouts.push({ ...spot, pose: "lounge", label: themed?.hammock.label ?? "在戶外吊床上休息" });
    napSpots.push({ ...spot, pose: "sleep", label: themed ? themed.hammock.label.replace("休息", "小睡") : "在戶外吊床上小睡" });
  });
  outdoor.picnics.forEach((t, i) => seat(`picnic${i}`, "garden", t.x + 0.7, t.y + 1.3, themed?.picnic.label ?? "戶外野餐桌", 0.3));
  const { pond } = outdoor;
  const pondName = themed?.pond.label ?? "池塘";
  hangouts.push(
    { room: "garden", x: pond.x - pond.rx - 0.7, y: pond.y, pose: "stand", label: themed ? `在${pondName}邊散步` : "在池塘邊看鴨子" },
    { room: "garden", x: pond.x + 0.5, y: pond.y + pond.ry + 0.7, pose: "stand", label: `在${pondName}邊散步` },
  );

  // ── 開會位置：老闆在桌子左端主持、總經理在右端，其他人坐滿椅子後圍著站 ──
  const meetingSpots: Rest[] = [];
  const meeting = rooms.find((r) => r.kind === "meeting");
  if (meeting) {
    const { ox, oy, id } = meeting;
    const at = (dx: number, dy: number, pose: Pose = "stand"): Rest => ({ room: id, x: ox + dx, y: oy + dy, pose, bias: 0.05, label: "在會議室開會" });
    meetingSpots.push(
      at(1.2, 3.8), // 老闆
      at(6.8, 3.8), // 總經理
      ...[2.65, 3.85, 5.05].map((x) => at(x, 2.45, "sit")), // 後排椅子（桌子擋住腿）
      ...[2.65, 3.85, 5.05].map((x) => at(x, 6.0)),
      ...[1.4, 2.4, 3.4, 4.4, 5.4, 6.4].map((x) => at(x, 6.9)),
      ...[1.9, 2.9, 3.9, 4.9, 5.9].map((x) => at(x, 7.6)),
      at(0.8, 2.0), at(0.8, 5.0), at(7.3, 2.0), at(7.3, 5.4),
    );
  }

  // ── 圖片主題的家具：照主題設定擺（座位旁的桌椅、每種房間的家具、戶外景觀）──
  const props: PlacedProp[] = [];
  const place = (def: PropDef, x: number, y: number, room: string) => props.push({ ...def, x, y, room });
  if (config.renderer === "sprite") {
    const houses = config.houses ?? [""];
    let deptIndex = 0;
    for (const room of rooms) {
      const house = room.kind === "department" ? houses[deptIndex++ % houses.length] : "";
      for (const def of config.rooms?.[room.kind] ?? []) place({ ...def, s: def.s.replace("{house}", house) }, room.ox + def.at[0], room.oy + def.at[1], room.id);
      const long = longTable && room.kind === "department";
      const seatDefs = long ? config.seats?.longTable?.seat : room.kind === "boss" ? config.seats?.boss : room.seats.length === 1 ? config.seats?.single : config.seats?.desk;
      for (const s of room.seats) for (const def of seatDefs ?? []) place(def, s.x + def.at[0], s.y + def.at[1], room.id);
      // 學院長桌：每一排一組長桌
      if (long) for (const y of new Set(room.seats.map((s) => s.y))) for (const def of config.seats?.longTable?.row ?? []) place(def, room.ox + def.at[0], y + def.at[1], room.id);
    }
    // 戶外的大型擺設：離建築至少 1.5 格（不會卡進牆裡），也不能擋住有人會去的地方
    // （休息艙、工作桌、池塘、散步點、其他擺設）。擋到的話沿著那一邊左右挪，還是不行就再往外移
    const keepClear: { x: number; y: number; r: number }[] = [
      ...outdoor.hammocks.map((h) => ({ x: h.x + 1, y: h.y + 0.3, r: 1.6 })),
      ...outdoor.picnics.map((t) => ({ x: t.x + 0.7, y: t.y + 0.7, r: 1.6 })),
      ...hangouts.filter((h) => h.room === "garden").map((h) => ({ x: h.x, y: h.y, r: 0.9 })),
      { x: outdoor.pond.x, y: outdoor.pond.y, r: outdoor.pond.rx + 0.8 },
    ];
    for (const def of themed?.items ?? []) {
      const sprite = spriteOf(config, def.s);
      const half = sprite ? [(sprite.box.maxX - sprite.box.minX) / 2, (sprite.box.maxY - sprite.box.minY) / 2] : [0.5, 0.5];
      const edge = def.edge ?? "front";
      const clampOut = (x: number, y: number): [number, number] => [
        edge === "left" ? Math.min(x, -1.5 - half[0]) : edge === "right" ? Math.max(x, buildingW + 1.5 + half[0]) : x,
        edge === "back" ? Math.min(y, -1.5 - half[1]) : edge === "front" ? Math.max(y, buildingH + 1.5 + half[1]) : y,
      ];
      // 長長的軌道、整排的東西不用避開
      if (def.repeat || def.solid === false) {
        for (const [x, y] of edgePositions(def, buildingW, buildingH)) place(def, ...clampOut(x, y), "garden");
        continue;
      }
      const blocked = (x: number, y: number) =>
        keepClear.some((c) => Math.abs(c.x - x) < half[0] + c.r && Math.abs(c.y - y) < half[1] + c.r);
      let spot: [number, number] | null = null;
      for (let extra = 0; extra <= 3 && !spot; extra++) {
        for (let k = 0; k <= 24 && !spot; k++) {
          const shift = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.04; // 0, +0.04, -0.04, +0.08…
          const [x, y] = edgePositions({ ...def, t: (def.t ?? 0.5) + shift, d: (def.d ?? 4) + extra }, buildingW, buildingH)[0];
          const [cx, cy] = clampOut(x, y);
          if (!blocked(cx, cy)) spot = [cx, cy];
        }
      }
      if (!spot) continue; // 真的放不下就不放
      place(def, spot[0], spot[1], "garden");
      keepClear.push({ x: spot[0], y: spot[1], r: Math.max(half[0], half[1]) + 0.3 });
    }
    for (const h of outdoor.hammocks) if (themed) place({ s: themed.hammock.s, at: [0, 0], solid: false, bias: -0.05 }, h.x + 1, h.y + 0.3, "garden");
    for (const t of outdoor.picnics) if (themed) place({ s: themed.picnic.s, at: [0, 0] }, t.x + 0.7, t.y + 0.4, "garden");
  }

  // ── 障礙物：會擋路的家具（SVG 主題來自 svg-layout.json；圖片主題直接用圖片的佔地）──
  const obstacles: Box[] = [];
  if (config.renderer === "svg") {
    for (const room of rooms) {
      for (const [x, y, w, d] of SVG_LAYOUT.obstacles[room.kind] ?? []) obstacles.push({ x: room.ox + x, y: room.oy + y, w, d });
      for (const s of room.seats) {
        const [dx, dy, w, d] = room.kind === "boss" ? SVG_LAYOUT.bossDesk : SVG_LAYOUT.desk;
        obstacles.push({ x: s.x + dx, y: s.y + dy, w, d });
      }
    }
    for (const t of outdoor.picnics) obstacles.push({ x: t.x, y: t.y, w: 1.4, d: 0.8 });
  } else {
    for (const p of props) {
      if (p.solid === false || p.flat || p.z) continue;
      // 程式畫的家具（例如魔法大鍋）：有寫佔地才擋路
      if (p.shape) {
        if (p.size) obstacles.push({ x: p.x - p.size[0] / 2, y: p.y - p.size[1] / 2, w: p.size[0], d: p.size[1] });
        continue;
      }
      const sprite = spriteOf(config, p.s);
      if (!sprite) continue;
      const w = sprite.box.maxX - sprite.box.minX;
      const d = sprite.box.maxY - sprite.box.minY;
      obstacles.push({ x: p.x - w / 2, y: p.y - d / 2, w, d });
    }
  }
  for (const a of arcades) obstacles.push({ x: a.x, y: a.y, w: a.w, d: a.d });

  // 站著的位置如果剛好在家具裡（例如長桌擺在原本的走道上），就不要去
  const blocked = (x: number, y: number) => obstacles.some((b) => x > b.x - 0.25 && x < b.x + b.w + 0.25 && y > b.y - 0.25 && y < b.y + b.d + 0.25);
  for (const room of rooms) room.spots = room.spots.filter(([x, y]) => !blocked(x, y));
  const freeHangouts = hangouts.filter((h) => h.key || h.pose !== "stand" || !blocked(h.x, h.y));

  // ── 咖啡機：SVG 主題在吧檯左邊；圖片主題找名稱是 coffee 或 keg 的家具 ──
  const lounge = rooms.find((r) => r.kind === "break");
  const machine = props.find((p) => p.room === lounge?.id && /^(coffee|keg)@/.test(p.s));
  const coffee: Plan["coffee"] = !lounge
    ? null
    : (() => {
        const [x, y, z] = machine ? [machine.x, machine.y, (machine.z ?? 0) + 24] : [lounge.ox + 1.0, lounge.oy + 0.75, 50];
        return { room: lounge.id, x, y, z, spot: { key: `${lounge.id}-coffee`, room: lounge.id, x, y: lounge.oy + 1.85, pose: "stand" as Pose, label: "在拿剛煮好的咖啡" } };
      })();

  const bookProp = props.find((p) => p.shape === "book");
  const book = bookProp ? { x: bookProp.x, y: bookProp.y, z: bookProp.z ?? 70 } : null;
  const pot = props.find((p) => p.shape === "cauldron");
  const cauldron = pot
    ? { room: pot.room, x: pot.x, y: pot.y, spot: { key: `${pot.room}-cauldron`, room: pot.room, x: pot.x, y: pot.y + 0.95, pose: "play" as Pose, bias: 0.6, label: "在攪拌魔藥大鍋" } }
    : null;

  const shirts: Record<string, string> = {};
  departments.forEach((dept, i) => (shirts[dept.id] = theme.departments[i % theme.departments.length].shirt));

  // 畫面大小：左右兩端是 (−G, H+G) 與 (W+G, −G)，上端是最後面的牆頂
  const originX = (buildingH + 2 * GARDEN) * (TILE_W / 2) + PAD;
  const originY = 2 * GARDEN * (TILE_H / 2) + WALL_H + HEADROOM + PAD;
  const viewW = (buildingW + buildingH + 4 * GARDEN) * (TILE_W / 2) + PAD * 2;
  const viewH = (buildingW + buildingH + 2 * GARDEN) * (TILE_H / 2) + originY + PAD;

  const plan: Plan = {
    theme,
    config,
    props,
    obstacles,
    nav: null as unknown as Nav, // 下面算好再放進來（要用到整張平面圖）
    rooms,
    seats: rooms.flatMap((room) => room.seats.map((seat) => ({ ...seat, room }))),
    hangouts: freeHangouts,
    workSpots,
    napSpots,
    arcades,
    coffee,
    book,
    cauldron,
    meetingSpots,
    outdoor,
    shirts,
    buildingW,
    buildingH,
    viewW,
    viewH,
    originX,
    originY,
  };
  plan.nav = buildNav(plan);
  return plan;
}

// 戶外擺設的位置：沿著建築的哪一邊、在那一邊的哪個比例、離建築多遠；repeat 的話整排重複
function edgePositions(def: PropDef, W: number, H: number): [number, number][] {
  const edge = def.edge ?? "front";
  const d = def.d ?? 4;
  const length = edge === "front" || edge === "back" ? W : H;
  const at = (v: number): [number, number] =>
    edge === "front" ? [v, H + d] : edge === "back" ? [v, -d] : edge === "left" ? [-d, v] : [W + d, v];
  if (!def.repeat) return [at(length * (def.t ?? 0.5))];
  const list: [number, number][] = [];
  for (let v = -GARDEN + 1; v <= length + GARDEN - 1; v += def.repeat) list.push(at(v));
  return list;
}

// ── 走路路線 ────────────────────────────────────────
// 用障礙物地圖做 A* 尋路（nav.ts）：繞過牆和家具，路線會盡量拉直。回傳的最後一點就是目的地。
export function route(plan: Plan, from: { x: number; y: number }, to: { room: string; x: number; y: number }): [number, number][] {
  return findPath(plan.nav, from, to);
}
