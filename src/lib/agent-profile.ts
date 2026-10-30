// 每位 Agent 的「員工檔案」：職稱、職級、直屬主管、職責、工作流程、使用的 AI 模型。
// 辦公室桌上的名牌、點人物後的詳細資訊卡都從這裡讀。
// 純資料、不碰資料庫，所以瀏覽器和伺服器都可以用。

import {
  EXECUTIVES,
  GENERAL_MANAGER,
  getDepartment,
  managerOf,
  staffAgentId,
  USER,
  type Department,
} from "./company";

export type AgentProfile = {
  id: string;
  title: string; //      完整職稱，例如「行情與新聞抓取專員」
  shortTitle: string; // 桌上名牌用的短職稱（最多 7 個字）
  titleEn: string;
  rank: "老闆" | "核心主管" | "部門經理" | "專員";
  department: { id: string; name: string; mission: string } | null;
  reportsTo: string | null; // 直屬主管
  manages: string[]; //        帶領的人
  duties: string[]; //         職責
  workflow: string[]; //       在交辦流程中負責哪幾步
  model: string | null; //     使用的 AI 模型（與 lib/ai/claude.ts 的 MODELS 一致）
};

// 與 lib/ai/claude.ts 的 MODELS 對應（那個檔案只能在伺服器用，所以這裡寫顯示用的名稱）
const MODEL_NAMES = { manager: "Claude Sonnet 5.5", staff: "Claude Haiku 5.5" };

// 名牌上的字太長會擠到隔壁桌，超過 7 個字就截斷（完整職稱在資訊卡裡）
const shorten = (text: string) => (text.length > 7 ? `${text.slice(0, 6)}…` : text);

export function agentProfile(id: string, departments: Department[]): AgentProfile | null {
  if (id === USER) {
    return {
      id,
      title: "老闆",
      shortTitle: "老闆",
      titleEn: "Boss",
      rank: "老闆",
      department: null,
      reportsTo: null,
      manages: ["首席秘書", "總經理"],
      duties: ["決定公司的方向與目標", "把需求交辦給首席秘書或總經理", "查看各部門的工作進度與成果"],
      workflow: ["點秘書或總經理開始對話", "點會議室召集大家開會", "點各辦公區查看部門待辦與進度"],
      model: null,
    };
  }

  const executive = EXECUTIVES.find((e) => e.id === id);
  if (executive) {
    const isGm = id === GENERAL_MANAGER;
    return {
      id,
      title: executive.name,
      shortTitle: isGm ? "總經理" : "首席秘書",
      titleEn: executive.nameEn,
      rank: "核心主管",
      department: null,
      reportsTo: "老闆",
      manages: isGm ? departments.map((d) => `${d.name}經理`) : [],
      duties: [...executive.duties],
      workflow: isGm
        ? [
            "聽懂你的需求，必要時先反問細節",
            "把總目標拆成部門任務，附上驗收標準",
            "驗收各部門報告：不合格就退回修改",
            "全部通過後，寫成總結報告交給你",
          ]
        : [
            "聽你說生活、健康、行程上的事，直接幫你處理",
            "判斷是工作需求時，整理成清楚的交辦內容轉給總經理",
          ],
      model: MODEL_NAMES.manager,
    };
  }

  const [deptId, role] = id.split(".");
  const dept = getDepartment(departments, deptId);
  if (!dept) return null;
  const department = { id: dept.id, name: dept.name, mission: dept.mission };

  if (id === managerOf(dept.id)) {
    return {
      id,
      title: `${dept.name}經理`,
      shortTitle: "部門經理",
      titleEn: `${dept.nameEn || dept.name} Manager`,
      rank: "部門經理",
      department,
      reportsTo: "總經理",
      manages: dept.staff.map((s) => s.name),
      duties: [
        `帶領${dept.name}：${dept.mission}`,
        "依員工專長分派工作，控管品質與進度",
        "查錯、把關：成果不合格就退回並附修改意見",
      ],
      workflow: [
        "接收總經理分派的部門任務",
        "拆成子任務，交給最適合的員工",
        "逐一審閱員工交出的成果",
        "彙整成部門報告，交給總經理驗收",
      ],
      model: MODEL_NAMES.manager,
    };
  }

  const member = dept.staff.find((s) => id === staffAgentId(dept.id, s.id));
  if (!member || role !== member.id) return null;
  return {
    id,
    title: member.name,
    shortTitle: shorten(member.name),
    titleEn: member.nameEn,
    rank: "專員",
    department,
    reportsTo: `${dept.name}經理`,
    manages: [],
    duties: member.duties,
    workflow: [
      "接收部門經理分派的子任務與驗收標準",
      "執行工作、產出成果交給經理審閱",
      "被退回時依審閱意見修改（最多 2 次）",
    ],
    model: MODEL_NAMES.staff,
  };
}

// 老闆（你）沒有任務資料；其他人都有
export const hasTasks = (id: string) => id !== USER;
