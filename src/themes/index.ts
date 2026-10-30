// 主題設定表（Theme Config Registry）
//
// 每個主題是一份獨立的 JSON（同資料夾的 <id>.json），程式只負責「照設定畫出來」：
//   palette    配色（地板、牆、名牌、各部門代表色…）
//   renderer   "svg"：用程式畫的家具（經典商務、科技園區）；"sprite"：用 3D 模型算好的圖片（public/themes/<id>/）
//   seats      辦公桌怎麼擺：desks（兩兩一排）或 longTable（學院長桌）；每個座位旁邊放哪些家具
//   rooms      每種房間放哪些家具（房間內座標，at 是家具佔地的中心點）
//   spots      每種房間裡可以去的地方：站著聊天、坐沙發、睡覺、帶筆電工作
//   outdoor    戶外景觀：樹、池塘、吊床／野餐桌換成什麼、建築四周的大型擺設
//   ambient    會動的小東西：飛天車、巡邏機器人、漂浮蠟燭、貓頭鷹
//   outfit     人物服裝（紙娃娃配件：護目鏡、斗篷、巫師帽…）
//
// 家具的佔地（尋路時當作障礙物）直接從 sprites.json 讀出來，不用另外寫座標。

import type { OfficeStyle } from "@/lib/company";
import type { Pose } from "@/app/office/floor/character";
import ancient from "./ancient.json";
import campus from "./campus.json";
import classic from "./classic.json";
import comic from "./comic.json";
import kpop from "./kpop.json";
import magic from "./magic.json";
import manor from "./manor.json";
import scifi from "./scifi.json";
import sports from "./sports.json";
import svgLayout from "./svg-layout.json";
import magicSprites from "../../public/themes/magic/sprites.json";
import scifiSprites from "../../public/themes/scifi/sprites.json";

export type RoomKind = "boss" | "assistant" | "gm" | "department" | "break" | "library" | "game" | "playground" | "wellness" | "meeting" | "courtyard";
type FloorPair = [string, string];

// 配色（SVG 與圖片主題共用）
export type Palette = {
  background: string; // 樓層外的底色
  corridor: string; //   走廊地板
  wall: string;
  wallLine: string;
  wallTop: string;
  window: string;
  plate: string; //      房間名牌底色
  plateText: string;
  desk: string;
  bossDesk: string;
  chairs: string[]; //   椅子顏色（多個就輪流使用）
  sofas: string[];
  grass: FloorPair;
  path: string;
  // 各部門的地板（兩色交錯）與代表色（員工衣服、魔法學院的學院色），依部門順序輪流使用
  departments: { floor: FloorPair; shirt: string }[];
  rooms: Record<Exclude<RoomKind, "department" | "courtyard">, FloorPair>;
};

// 一張算好的家具圖片：w × h 像素，(ax, ay) 是模型原點在圖上的位置；box 是佔地（格）與高度
export type Sprite = { file: string; w: number; h: number; ax: number; ay: number; box: { minX: number; maxX: number; minY: number; maxY: number; height: number } };

// 擺一件家具。s：圖片名稱「名稱@角度」（{house} 會換成部門的學院色），或 shape 畫的特效
export type PropDef = {
  s: string;
  at: [number, number]; // 佔地中心（房間內座標；座位家具是相對座位）
  z?: number; //          離地高度（像素），例如桌上的螢幕、牆上的旗幟
  solid?: boolean; //     會不會擋路（預設會）
  flat?: boolean; //      貼地的地毯：永遠畫在最底下
  bias?: number; //       畫圖前後順序的微調
  shape?: "pad" | "hoop" | "book" | "cauldron" | "broom"; // 不是圖片，用程式畫：發光圓墊、魁地奇圈、魔法書、大鍋、掃帚
  size?: [number, number]; // 程式畫的家具佔地（有的話會擋路）
  color?: string;
  // 戶外：沿著建築哪一邊、在那一邊的比例位置、離建築多遠；repeat：每隔幾格重複一個
  edge?: "front" | "back" | "left" | "right";
  t?: number;
  d?: number;
  repeat?: number;
  stack?: string[]; //    疊在上面的圖片（塔身、屋頂）
};

export type SpotDef = {
  at: [number, number];
  pose: Pose;
  label: string;
  key?: string; //  一次只能一個人用
  z?: number;
  bias?: number;
  use?: "hang" | "work" | "nap" | "both"; // both：閒著時來坐、工作時帶筆電來
};

export type ThemeConfig = {
  id: OfficeStyle;
  renderer: "svg" | "sprite";
  outfit: "classic" | "campus" | "scifi" | "magic";
  palette: Palette;
  sprites?: string; //   圖片資料夾（網址）
  atlas?: Record<string, Sprite>;
  floor?: "panel" | "stone";
  walls?: { style: "panel" | "brick"; stripe: string; window: "porthole" | "arched" };
  houses?: string[]; //  魔法學院：各部門的旗幟顏色
  roomNames?: Partial<Record<RoomKind, string>>;
  seats?: {
    layout: "desks" | "longTable";
    desk?: PropDef[]; //   一般座位
    single?: PropDef[]; // 秘書、總經理
    boss?: PropDef[];
    longTable?: { row: PropDef[]; seat: PropDef[] }; // 每一排的長桌、每個座位的椅子
  };
  rooms?: Partial<Record<RoomKind, PropDef[]>>;
  spots?: Partial<Record<RoomKind, SpotDef[]>>;
  outdoor?: {
    trees: string[];
    pond: { rim: string; water: string; inner: string; label: string };
    hammock: { s: string; label: string };
    picnic: { s: string; label: string };
    items: PropDef[];
  };
  ambient?: { flyers?: string[]; robots?: number; candles?: RoomKind[]; owls?: number };
};

// SVG 主題（經典、園區）的家具佔地：房間內座標 [x, y, 寬, 深]
export const SVG_LAYOUT = svgLayout as {
  obstacles: Partial<Record<RoomKind, [number, number, number, number][]>>;
  desk: [number, number, number, number];
  bossDesk: [number, number, number, number];
};

const READY: Record<string, ThemeConfig> = {
  classic: classic as ThemeConfig,
  campus: campus as ThemeConfig,
  scifi: { ...(scifi as unknown as ThemeConfig), atlas: scifiSprites },
  magic: { ...(magic as unknown as ThemeConfig), atlas: magicSprites },
};
// 還在製作中的主題：先用最接近的主題代替
const FALLBACK: Record<string, string> = Object.fromEntries(
  [ancient, comic, kpop, manor, sports].map((t) => [t.id, t.fallback]),
);

export function getTheme(id: OfficeStyle): ThemeConfig {
  return READY[id] ?? READY[FALLBACK[id]] ?? READY.classic;
}

// 圖片名稱 → 圖片資料（找不到回傳 null，畫面上就略過）
export function spriteOf(theme: ThemeConfig, name: string): Sprite | null {
  return theme.atlas?.[name] ?? null;
}
