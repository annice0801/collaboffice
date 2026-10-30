// 像素風人物。用小方塊（rect）一格一格拼出來，shapeRendering="crispEdges" 讓邊緣保持銳利。
//
// 座標：原點在「腳底中央」，往上是負的。P 是一個像素格的大小。
// 姿勢：
//   stand   站著              walk    走路（腿會交替擺動；在跑步機上也用這個）
//   sit     坐在辦公桌前打字  sleep   趴著睡覺（閉眼、頭頂冒 Zzz）
//   laptop  坐沙發、懶骨頭，筆電放在腿上工作
//   lounge  坐著放鬆（按摩椅、沙發）
//   ride    坐著舉起雙手（溜滑梯、球池）
//   climb   背對我們、雙手往上（攀岩、爬梯子）
//   stretch 面對我們、雙手往上（瑜伽伸展）
//
// 每個職位一眼就分得出來：
//   老闆（你）：人物稍大、金色點綴。經典商務 → 深藍西裝；科技園區 → 黑色高領毛衣、牛仔褲、白球鞋
//              性別依問卷設定：女性（長髮、裙裝）、男性（短髮、領帶）、中性
//   總經理    ：炭黑西裝、紅領帶、眼鏡，站著時提公事包
//   首席秘書  ：松綠色外套、盤髮、手拿夾板
//   部門經理  ：深藍西裝外套（看得到翻領與白襯衫領口）、部門色領帶、識別證
//   員工      ：部門色上衣，沒有領帶
//
// 主題服裝（紙娃娃配件，outfit）：在上面的造型上換色、加配件
//   未來科技（scifi）：連身制服、發光護目鏡；部門經理白色制服；總經理肩章；秘書耳麥；老闆白金指揮官制服＋紅披風
//   魔法學院（magic）：黑色學院袍＋斗篷（內襯是部門的學院色）、學院色領帶、手拿魔杖、騎飛天掃帚；
//                     部門經理別級長徽章；秘書棕色長袍拿卷軸；總經理綠袍＋尖帽；老闆（校長）紫袍＋巫師帽（男性有白鬍子）

import type { BossGender, OfficeStyle } from "@/lib/company";

const P = 2;

export type Pose = "stand" | "walk" | "sit" | "sleep" | "laptop" | "lounge" | "ride" | "climb" | "stretch" | "play";
export type BossLook = { gender: BossGender; style: OfficeStyle };
export type Outfit = "classic" | "campus" | "scifi" | "magic";

// 坐在辦公桌前：腿被桌子擋住，不畫
const AT_DESK: Pose[] = ["sit", "sleep"];
// 坐在沙發、懶骨頭上：上半身往下沉，小腿垂在前面
const LOW: Pose[] = ["laptop", "lounge", "ride"];
// 雙手舉高
const ARMS_UP: Pose[] = ["ride", "climb", "stretch"];

// 這個姿勢的頭頂離腳底多高（像素），用來把名牌、對話框放在頭上
export function headHeight(pose: Pose): number {
  if (AT_DESK.includes(pose)) return 50;
  if (LOW.includes(pose)) return 54;
  return 62;
}

type Look = {
  skin: string;
  hair: string;
  shirt: string; //   上衣（外套）
  pants: string;
  shoes: string;
  tie?: string;
  collar?: string; // 白襯衫領口
  lapel?: string; //  西裝翻領
  longHair: boolean;
  bun: boolean; //    盤髮
  glasses: boolean;
  skirt?: string; //  裙子（取代褲子）
  badge?: string; //  識別證
  necklace?: string;
  carry: "briefcase" | "clipboard" | "scroll" | "tablet" | null; // 站著或走路時手上拿的東西
  scale: number;
  // 主題配件
  visor?: string; //   發光護目鏡（取代眼睛）
  headset?: boolean; // 耳麥
  epaulette?: string; // 肩章
  cloak?: string; //   斗篷／披風（畫在身體後面）
  lining?: string; //  斗篷內襯
  hat?: string; //     巫師帽
  beard?: string;
  wand?: boolean; //   站著時手拿魔杖
};

const SKINS = ["#f2c9a5", "#e0ac83", "#c68b5e", "#8d5a3b"];
const HAIRS = ["#2b211c", "#5a3a22", "#a0672f", "#d9b26a", "#6b6b6b"];
const GOLD = "#e0b43a";

// 依 Agent 代號算出固定的長相（同一個人每次看都一樣）
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// deptShirt：這位員工所屬部門的代表色（由平面圖依部門順序分配）
export function lookOf(agent: string, deptShirt = "#777777", boss?: BossLook): Look {
  const h = hash(agent);
  const base = {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >> 3) % HAIRS.length],
    longHair: (h >> 6) % 2 === 0,
    bun: false,
    glasses: false,
    shoes: "#2a2a2a",
    carry: null,
    scale: 1,
  } as const;

  if (agent === "user") {
    const gender = boss?.gender ?? "neutral";
    const campus = boss?.style === "campus";
    return {
      ...base,
      hair: "#2b211c",
      longHair: gender === "female",
      scale: 1.12,
      ...(campus
        ? // 科技園區：黑色高領毛衣 + 牛仔褲 + 白球鞋，金色手錶點綴
          { shirt: "#1f1f1f", pants: "#3b5b8c", shoes: "#f5f5f5", necklace: GOLD }
        : // 經典商務：深藍西裝 + 白襯衫
          { shirt: "#1f2a44", pants: "#1f2a44", collar: "#ffffff", lapel: "#2c3b5e", ...(gender === "female" ? { necklace: GOLD } : { tie: GOLD }) }),
      ...(gender === "female" && !campus ? { skirt: "#1f2a44" } : {}),
    };
  }
  if (agent === "general_manager") {
    return { ...base, longHair: false, hair: "#1d1d1d", shirt: "#2b2b2b", pants: "#2b2b2b", collar: "#ffffff", lapel: "#3a3a3a", tie: "#c0392b", glasses: true, carry: "briefcase" };
  }
  if (agent === "executive_assistant") {
    return { ...base, longHair: false, bun: true, shirt: "#2f5d50", pants: "#24463d", collar: "#ffffff", lapel: "#3b7363", carry: "clipboard" };
  }
  if (agent.split(".")[1] === "manager") {
    return { ...base, shirt: "#2a3550", pants: "#1f2433", collar: "#ffffff", lapel: "#3a4870", tie: deptShirt, badge: "#ffffff" };
  }
  // 員工：部門色上衣
  return { ...base, shirt: deptShirt, pants: "#34405e" };
}

// 主題服裝：在原本的造型上換色、加配件
function dress(look: Look, agent: string, deptShirt: string, outfit: Outfit, gender: BossGender): Look {
  const role = agent === "user" ? "boss" : agent === "general_manager" ? "gm" : agent === "executive_assistant" ? "ea" : agent.split(".")[1] === "manager" ? "manager" : "staff";
  const plain = { lapel: undefined, necklace: undefined, collar: undefined, tie: undefined } as const;
  if (outfit === "scifi") {
    const suit = (color: string, extra: Partial<Look> = {}): Look => ({ ...look, ...plain, shirt: color, pants: color, shoes: "#e8e6ef", ...(look.skirt ? { skirt: color } : {}), ...extra });
    if (role === "boss") return suit("#f4f4fb", { epaulette: GOLD, cloak: "#c0392b", lining: "#7a1f1f", tie: GOLD });
    if (role === "gm") return suit("#2b2d42", { epaulette: GOLD, carry: "tablet" });
    if (role === "ea") return suit("#2ec4b6", { headset: true, carry: "tablet" });
    if (role === "manager") return suit("#e8e6f5", { tie: deptShirt, badge: "#7dd3fc", visor: "#7dd3fc", pants: "#c3c0e6" });
    return suit(deptShirt, { visor: "#7dd3fc" });
  }
  if (outfit === "magic") {
    const robe = (color: string, lining: string, extra: Partial<Look> = {}): Look => ({
      ...look, ...plain, shirt: color, pants: color, shoes: "#1a1a1a", collar: "#ffffff", cloak: shade(color, -0.25), lining, wand: true, carry: null,
      ...(look.skirt ? { skirt: color } : {}), ...extra,
    });
    if (role === "boss") return robe("#5b3a8c", GOLD, { hat: "#5b3a8c", ...(gender === "male" ? { beard: "#eeeeee" } : {}) });
    if (role === "gm") return robe("#1f5f3f", "#9c1c22", { hat: "#1f5f3f", glasses: true });
    if (role === "ea") return robe("#5a3a22", GOLD, { carry: "scroll", wand: false });
    if (role === "manager") return robe("#24212e", deptShirt, { tie: deptShirt, badge: GOLD });
    return robe("#24212e", deptShirt, { tie: deptShirt });
  }
  return look;
}

// 顏色調暗（斗篷比袍子深一點）
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * (1 + amount)).toString(16).padStart(2, "0");
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

// 一個像素方塊
const px = (x: number, y: number, w: number, h: number, fill: string, key?: string) => (
  <rect key={key} x={x * P} y={y * P} width={w * P} height={h * P} fill={fill} />
);

export function Character({ agent, pose, shirt, boss, outfit = "classic" }: { agent: string; pose: Pose; shirt?: string; boss?: BossLook; outfit?: Outfit }) {
  const look = dress(lookOf(agent, shirt, boss), agent, shirt ?? "#777777", outfit, boss?.gender ?? "neutral");
  const atDesk = AT_DESK.includes(pose);
  const low = LOW.includes(pose);
  const back = pose === "climb" || pose === "play"; // 背對我們（攀岩、站在遊戲機台前玩）
  const upright = pose === "stand" || pose === "walk"; // 站著才拿東西
  // 坐在辦公桌前：整個人往下沉
  const lift = atDesk ? 6 : 0;
  // 坐沙發：只有上半身往下沉（腳還在地上）
  const drop = low ? 4 : 0;
  // 睡覺時頭往前垂
  const headDrop = pose === "sleep" ? 3 : 0;

  return (
    <g shapeRendering="crispEdges" transform={`translate(0 ${lift * P}) scale(${look.scale})`}>
      {/* 地上的影子（攀岩時人在牆上，不畫影子） */}
      {!atDesk && pose !== "climb" && <ellipse cx={0} cy={0} rx={9} ry={3.5} fill="#000" opacity={0.15} />}

      {/* 飛天掃帚（魔法學院騎著飛的時候） */}
      {pose === "ride" && outfit === "magic" && (
        <>
          {px(-11, -6, 20, 1.5, "#8a5a3b")}
          {px(8, -8, 5, 5, "#d9b26a")}
          {px(12, -7, 2, 3, "#c49a4a")}
        </>
      )}
      {/* 斗篷、披風：從肩膀垂到小腿，比身體寬一點（正面只看得到兩側與內襯） */}
      {look.cloak && !atDesk && !back && (
        <>
          {px(-7, -17, 14, low ? 12 : 14, look.cloak)}
          {look.lining && px(-6, -16, 1, low ? 10 : 12, look.lining)}
          {look.lining && px(5, -16, 1, low ? 10 : 12, look.lining)}
        </>
      )}

      {/* 腿與鞋子：坐著時只看得到垂下來的小腿；穿裙子時露出小腿 */}
      {!atDesk &&
        (low ? (
          <>
            {px(-4, -5, 3, 3, look.skirt ? look.skin : look.pants)}
            {px(1, -5, 3, 3, look.skirt ? look.skin : look.pants)}
            {px(-4, -2, 3, 2, look.shoes)}
            {px(1, -2, 3, 2, look.shoes)}
          </>
        ) : (
          <>
            <g className={pose === "walk" ? "leg-a" : undefined}>
              {px(-4, -9, 3, 7, look.skirt ? look.skin : look.pants)}
              {px(-4, -2, 3, 2, look.shoes)}
            </g>
            <g className={pose === "walk" ? "leg-b" : undefined}>
              {px(1, -9, 3, 7, look.skirt ? look.skin : look.pants)}
              {px(1, -2, 3, 2, look.shoes)}
            </g>
            {look.skirt && px(-5, -10, 10, 4, look.skirt)}
          </>
        ))}

      {/* 上半身 */}
      <g transform={`translate(0 ${drop * P})`}>
        <g className={pose === "sit" || pose === "laptop" || pose === "play" ? "typing" : undefined}>
          {px(-5, -17, 10, 8, look.shirt)}
          {/* 背對我們時，斗篷蓋住整個背 */}
          {back && look.cloak && px(-6, -17, 12, 11, look.cloak)}
          {look.epaulette && (
            <>
              {px(-6, -17, 2, 1, look.epaulette)}
              {px(4, -17, 2, 1, look.epaulette)}
            </>
          )}
          {!back && (
            <>
              {/* 西裝翻領、白襯衫領口、領帶、項鍊、識別證 */}
              {look.lapel && (
                <>
                  {px(-3, -17, 1, 5, look.lapel)}
                  {px(2, -17, 1, 5, look.lapel)}
                </>
              )}
              {look.collar && px(-2, -17, 4, 2, look.collar)}
              {look.tie && px(-0.5, -16, 1, 5, look.tie)}
              {look.necklace && px(-1, -16, 2, 1, look.necklace)}
              {look.badge && (
                <>
                  {px(2.5, -13, 2, 2.5, look.badge)}
                  {px(3, -12.5, 1, 0.5, "#4285f4")}
                </>
              )}
            </>
          )}
          {/* 手臂：打字時往前伸、睡覺時趴在桌上、玩的時候舉高 */}
          {pose === "sleep" ? (
            <>
              {px(-6, -11, 12, 2, look.shirt)}
              {px(-3, -11, 6, 1, look.skin)}
            </>
          ) : ARMS_UP.includes(pose) ? (
            <>
              {px(-7, -24, 2, 8, look.shirt)}
              {px(5, -24, 2, 8, look.shirt)}
              {px(-7, -26, 2, 2, look.skin)}
              {px(5, -26, 2, 2, look.skin)}
            </>
          ) : (
            <>
              {px(-7, -16, 2, 6, look.shirt)}
              {px(5, -16, 2, 6, look.shirt)}
              {px(-7, -10, 2, 2, look.skin)}
              {px(5, -10, 2, 2, look.skin)}
              {/* 老闆的金色手錶 */}
              {agent === "user" && px(5, -11, 2, 1, GOLD)}
            </>
          )}
        </g>
        {/* 手上拿的東西：總經理的公事包、秘書的夾板 */}
        {upright && look.carry === "briefcase" && (
          <>
            {px(5.5, -9, 4, 3, "#5a3a22")}
            {px(6.5, -10, 2, 1, "#3a2414")}
          </>
        )}
        {/* 魔杖、卷軸、平板 */}
        {upright && look.wand && px(7, -14, 1, 5, "#6b4423")}
        {upright && look.wand && px(7, -15, 1, 1, "#fff3b0")}
        {upright && look.carry === "scroll" && (
          <>
            {px(-9.5, -15, 3, 5, "#f4e3c1")}
            {px(-10, -15.5, 4, 1, "#c9a26a")}
            {px(-10, -10.5, 4, 1, "#c9a26a")}
          </>
        )}
        {upright && look.carry === "tablet" && (
          <>
            {px(-9.5, -15, 3, 4.5, "#2b2d42")}
            {px(-9, -14.5, 2, 3.5, "#7dd3fc")}
          </>
        )}
        {upright && look.carry === "clipboard" && (
          <>
            {px(-9.5, -15, 3, 5, "#b98b4e")}
            {px(-9, -14, 2, 3.5, "#ffffff")}
            {px(-8.5, -15.5, 1, 1, "#9aa0a6")}
          </>
        )}
        {/* 放在腿上的筆電：我們看到的是螢幕背面 */}
        {pose === "laptop" && (
          <>
            {px(-6, -9, 12, 1, "#7d838c")}
            {px(-5, -14, 10, 5, "#c9ccd3")}
            {px(-0.5, -12, 1, 1, "#ffffff")}
          </>
        )}
      </g>

      {/* 頭 */}
      <g transform={`translate(0 ${(headDrop + drop) * P})`}>
        {back ? (
          // 背面：整顆頭都是頭髮
          <>
            {px(-4, -25, 8, 8, look.hair)}
            {px(-5, -26, 10, 3, look.hair)}
          </>
        ) : (
          <>
            {px(-4, -25, 8, 8, look.skin)}
            {/* 頭髮：頂部 + 兩側；長髮多垂到肩膀；盤髮在頭頂加一個髻 */}
            {px(-5, -26, 10, 3, look.hair)}
            {px(-5, -23, 1, look.longHair ? 7 : 3, look.hair)}
            {px(4, -23, 1, look.longHair ? 7 : 3, look.hair)}
            {look.bun && px(-2, -28.5, 4, 2.5, look.hair)}
            {/* 眼睛：睡覺時是一條線；總經理戴眼鏡 */}
            {pose === "sleep" ? (
              <>
                {px(-3, -20, 2, 0.5, "#2a2a2a")}
                {px(1, -20, 2, 0.5, "#2a2a2a")}
              </>
            ) : look.glasses ? (
              <>
                {px(-3.5, -21.5, 3, 2.5, "#1d1d1d")}
                {px(0.5, -21.5, 3, 2.5, "#1d1d1d")}
                {px(-3, -21, 2, 1.5, "#bfe0f2")}
                {px(1, -21, 2, 1.5, "#bfe0f2")}
                {px(-0.5, -21, 1, 0.5, "#1d1d1d")}
              </>
            ) : (
              <>
                {px(-2.5, -21, 1, 1.5, "#2a2a2a")}
                {px(1.5, -21, 1, 1.5, "#2a2a2a")}
              </>
            )}
          </>
        )}
      </g>

      {/* 頭上的主題配件：護目鏡、耳麥、白鬍子、巫師帽 */}
      <g transform={`translate(0 ${(headDrop + drop) * P})`}>
        {look.visor && !back && pose !== "sleep" && (
          <>
            {px(-4.5, -22, 9, 2.5, look.visor)}
            {px(-3.5, -21.5, 2, 1, "#ffffff")}
          </>
        )}
        {look.headset && (
          <>
            {px(-5.5, -24, 1, 4, "#3a3a3a")}
            {!back && px(-5, -20, 3, 1, "#3a3a3a")}
          </>
        )}
        {look.beard && !back && px(-3, -19, 6, 4, look.beard)}
        {look.hat && (
          <>
            {px(-7, -27, 14, 1.5, look.hat)}
            <polygon points={`${-5 * P},${-26.5 * P} ${5 * P},${-26.5 * P} ${2 * P},${-38 * P}`} fill={look.hat} />
            {px(-0.5, -32, 1.5, 1.5, GOLD)}
          </>
        )}
      </g>

      {/* 睡覺的 Zzz */}
      {pose === "sleep" && (
        <g fontWeight={800} fill="#4a6fa5" shapeRendering="auto">
          <text className="zzz" x={8} y={-48} fontSize={10}>z</text>
          <text className="zzz zzz-2" x={14} y={-56} fontSize={12}>z</text>
          <text className="zzz zzz-3" x={20} y={-66} fontSize={14}>Z</text>
        </g>
      )}
    </g>
  );
}
