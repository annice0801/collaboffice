// 公司的組織架構與各種狀態的定義。
// 資料表（models/）、API 和 Agent 都從這裡讀取共用的規則。
//
// 每位會員的部門不一樣：註冊後回答問卷，由 AI 依答案設計部門，存在 organizations 資料表
// （見 models/Organization.ts、lib/organization.ts）。這個檔案只放：
//   - 部門的資料格式（型別）
//   - DEFAULT_DEPARTMENTS：範例部門（首頁展示用，也是問卷可以直接套用的範本）
//   - 核心主管、各種狀態等所有會員共用的設定
//
// 組織架構：
//   你（user）
//     ├ 首席秘書（executive_assistant）：生活、健康、日程；收到工作會整理後轉交總經理
//     └ 總經理（general_manager）：可以直接接受交辦，拆解分派、驗收、回報進度
//         └ 部門經理（例如 intel.manager）：分派、審閱、查錯、把關、回報
//             └ 部門員工（例如 intel.crawler）：實際執行
//   首席秘書和總經理是同一職級的核心主管，兩位都可以直接跟你對話。

// ── 型別 ──────────────────────────────────────────
// 一位員工 Agent 的設定
export type Staff = {
  id: string; //       部門內的代號（英文小寫），組成完整身分時會變成 "部門.代號"
  name: string; //     中文職稱
  nameEn: string; //   英文職稱
  duties: string[]; // 職責清單：會寫進這位 Agent 的人設 Prompt，也是經理分派工作的依據
};

// 老闆（你）在辦公室裡的人物：問卷時選擇，之後可以在公司總覽修改
export const BOSS_GENDERS = ["female", "male", "neutral"] as const;
export type BossGender = (typeof BOSS_GENDERS)[number];
export const BOSS_GENDER_LABELS: Record<BossGender, string> = { female: "女性", male: "男性", neutral: "中性" };

// 主管的背景設定：開會發言、對話、審查工作時，都依這個背景的專業角度判斷
export type Persona = {
  background: string; // 學經歷，例如「法律系畢業，10 年企業法務經驗」
  expertise: string[]; // 專長
  focus: string; //      審查與發言時特別注意的地方
  style: string; //      說話風格
};

// 一個部門的設定
export type Department = {
  id: string; //       部門代號（英文小寫），例如 "intel"
  name: string;
  nameEn: string;
  mission: string; //  部門定位：總經理靠這段判斷任務該交給哪個部門
  staff: Staff[];
  // 部門專屬的資料庫（例如社區規章、會議記錄），之後讓 Agent 查閱用
  knowledgeBases?: string[];
  managerPersona?: Persona; // 部門經理的背景（沒設定時用 managerPersonaOf 推出預設值）
  webSearch?: boolean; //     員工可以上網搜尋最新資料（新聞、價格、市場數據）；每次搜尋另外計費
};

export type DepartmentId = string;

// 代號格式：英文小寫開頭，只能有小寫英文、數字、底線（AI 設計部門時也要遵守）
export const ID_PATTERN = /^[a-z][a-z0-9_]{1,23}$/;

// ── 範例部門 ──────────────────────────────────────
// annice0801@gmail.com 設計的五個部門。用途：
//   1. 首頁展示（組織圖、立體辦公室）
//   2. 問卷裡的「直接套用範本」選項
// 各會員實際的部門存在資料庫，不在這裡
export const DEFAULT_DEPARTMENTS: Department[] = [
  {
    id: "intel",
    webSearch: true, // 市場情報需要即時資料
    name: "資產與市場情報部",
    nameEn: "Finance & Market Intelligence",
    mission: "自動化追蹤外在環境與市場脈動，減少手動刷盤與找新聞的時間",
    managerPersona: {
      background: "財務金融碩士，曾任券商研究員與基金經理人 10 年，持有 CFA 證照",
      expertise: ["總體經濟", "產業與財報分析", "投資風險管理", "資料查核"],
      focus: "資料來源是否可信、數字有沒有出處、市場與財務風險、投入的成本與報酬是否合理",
      style: "理性、以數據說話，會清楚標示不確定的地方",
    },
    staff: [
      {
        id: "crawler",
        name: "行情與新聞抓取專員",
        nameEn: "Crawler Agent",
        duties: [
          "透過 RSS（中央社財經、科技新報等）或 Yahoo Finance API 定時抓取資料",
          "追蹤股市大盤、重要持股與總體經濟動態",
        ],
      },
      {
        id: "analyst",
        name: "投資分析師",
        nameEn: "Analyst Agent",
        duties: ["將約 20 則新聞與股價波動，提煉成「3 行每日市場結論與風險警示」"],
      },
      {
        id: "reporter",
        name: "晨報／快訊回報員",
        nameEn: "Reporter Agent",
        duties: ["在台股開盤前或美股收盤後，將精華摘要推播給秘書處或指定的 LINE 群組"],
      },
    ],
  },
  {
    id: "media",
    name: "社群內容與媒體行銷部",
    nameEn: "Media & Growth Dept",
    mission: "橫跨命理、裝潢育兒、新產品上架等面向的內容產製與廣告操盤",
    managerPersona: {
      background: "新聞傳播系畢業，曾任數位行銷公司內容總監 8 年，操盤多個 IG 品牌帳號從零成長到 10 萬追蹤",
      expertise: ["社群經營", "內容策略", "短影音", "廣告投放", "品牌調性"],
      focus: "內容是否符合品牌調性、受眾是否明確、成效能不能追蹤、有沒有違反平台規範或著作權",
      style: "有創意、重視受眾感受，會舉具體的案例",
    },
    staff: [
      {
        id: "strategist",
        name: "內容策略企劃",
        nameEn: "Content Strategist",
        duties: [
          "依面向標籤規劃主題庫（例如：命理案例分析、育兒心得與空間軟裝、新功能發布教學）",
        ],
      },
      {
        id: "copywriter",
        name: "文案撰寫員",
        nameEn: "Copywriter",
        duties: ["撰寫 IG 貼文、Threads 短文、LINE 官方帳號推播文案"],
      },
      {
        id: "video_director",
        name: "影音腳本與剪輯導演",
        nameEn: "Video Director Agent",
        duties: [
          "拍片計劃：拆解分鏡腳本（Shot List）與口播台詞",
          "畫面分析：依拍攝素材截圖或影片，分析色調、字卡位置與構圖節奏",
          "配樂建議：依腳本調性推薦音樂風格與 BGM 關鍵字（例如侘寂風 → 輕柔鋼琴／環境音；新功能展示 → 明快 Lo-fi）",
        ],
      },
      {
        id: "operator",
        name: "發文排程與官方帳號小幫手",
        nameEn: "Operation Assistant",
        duties: ["串接 Meta Graph API／Buffer／LINE Messaging API，預約排程與自動發布"],
      },
      {
        id: "ad_analyst",
        name: "廣告與社群成效分析師",
        nameEn: "Ad & Data Analyst",
        duties: ["追蹤廣告成效（ROAS、點擊率、名單成本）", "每週產出改善建議"],
      },
    ],
  },
  {
    id: "community",
    name: "社區管理與行政協調部",
    nameEn: "Community & Operations Dept",
    mission: "管委會專責部門：落實行政效率、合約追蹤與第三方權益防禦",
    managerPersona: {
      background: "法律系畢業，具 10 年物業管理與企業法務經驗，熟悉公寓大廈管理條例、民法契約與個人資料保護法",
      expertise: ["法規遵循", "合約審查", "會議程序", "行政管理", "爭議處理"],
      focus: "法規與合約風險、程序是否合法、權責與期限是否明確、第三方（建商、廠商）是否侵害社區權益",
      style: "嚴謹、條列重點，先講風險再給解法",
    },
    staff: [
      {
        id: "clerk",
        name: "議程與會議記錄員",
        nameEn: "Agenda & Minute Clerk",
        duties: [
          "會前彙整議題提案，產生結構化議程草案",
          "會後依錄音或逐字稿，整理出「決議事項、負責委員、完成期限」",
        ],
      },
      {
        id: "tracker",
        name: "進度追蹤督導員",
        nameEn: "Task Tracker",
        duties: [
          "追蹤管委會決議（公共修繕、招標遴選、公設使用規則修訂等）的執行進度",
          "超過期限自動發出提醒",
        ],
      },
      {
        id: "inspector",
        name: "第三方點交與工務審查專員",
        nameEn: "Handover Inspector",
        duties: [
          "盤點公設點交缺失清單（Defect List）",
          "建立第三方檢驗比對表",
          "追蹤建商與廠商的缺失改善進度與切結簽署",
        ],
      },
    ],
    knowledgeBases: ["社區規章", "歷次會議記錄", "廠商合約庫"],
  },
  {
    id: "talent",
    name: "人資企劃與品牌發展部",
    nameEn: "Talent & Career Development",
    mission: "個人能力資產化：接案投標、履歷優化與作品集維護",
    managerPersona: {
      background: "人力資源管理碩士，曾任獵頭顧問與企業人資主管 9 年，協助上百位專業人士轉職與接案",
      expertise: ["履歷與面試策略", "個人品牌", "提案與報價", "職涯規劃"],
      focus: "內容是否凸顯差異化優勢、成果是否量化、報價與合作條件是否合理、是否符合目標客戶的需求",
      style: "務實、鼓勵，會從招募方或客戶的角度給建議",
    },
    staff: [
      {
        id: "resume",
        name: "履歷與職缺健檢師",
        nameEn: "Resume Optimizer",
        duties: ["依目標職缺或案場需求比對履歷，提出差異化的優化建議"],
      },
      {
        id: "portfolio",
        name: "作品集架構設計師",
        nameEn: "Portfolio Curator",
        duties: [
          "將過往作品（新產品開發、自媒體專案、顧問諮詢成效、專案管理經驗）整理成網頁展示卡片或 PDF 案例介紹（Case Study）",
        ],
      },
      {
        id: "proposal",
        name: "提案與投標撰寫員",
        nameEn: "Proposal Drafter",
        duties: ["針對外部合作案或諮詢委案，產生客製化合作計畫書與報價結構"],
      },
    ],
  },
  {
    id: "rd",
    name: "研發部",
    nameEn: "R&D Dept",
    mission: "成立公司、製作新產品專案",
    managerPersona: {
      background: "資訊工程碩士，曾任新創公司技術長與產品經理 8 年，參與過 3 間公司的設立與產品上市",
      expertise: ["產品規劃", "技術架構", "專案管理", "公司設立與法規"],
      focus: "技術是否可行、範圍與時程是否實際、最小可行產品（MVP）怎麼切、法規與設立文件是否齊全",
      style: "結構化思考，喜歡拆成階段與里程碑",
    },
    staff: [
      {
        id: "product_planner",
        name: "產品企劃",
        nameEn: "Product Planner",
        duties: ["市場與競品調查", "定義新產品的目標客群、功能範圍與開發時程"],
      },
      {
        id: "engineer",
        name: "技術開發工程師",
        nameEn: "Engineer",
        duties: ["技術架構規劃", "撰寫程式與技術文件"],
      },
      {
        id: "company_setup",
        name: "公司設立顧問",
        nameEn: "Company Setup Advisor",
        duties: ["整理公司設立流程、所需文件與時程", "比較公司型態與相關法規重點"],
      },
    ],
  },
];

// 首席秘書、總經理的預設背景（老闆可以在辦公室裡點他們的資訊卡修改）
export const DEFAULT_EXECUTIVE_PERSONAS: Record<string, Persona> = {
  executive_assistant: {
    background: "護理系畢業，曾任企業健康管理師 5 年，之後擔任上市公司董事長特助 8 年",
    expertise: ["行程管理", "健康管理", "優先順序判斷", "溝通協調"],
    focus: "老闆的時間與體力負荷是否合理、行程有沒有衝突、作息與健康、事情的輕重緩急",
    style: "溫暖、貼心，該提醒的地方會直接提醒",
  },
  general_manager: {
    background: "企業管理碩士（MBA），曾任中小企業營運長 15 年，帶過多個跨部門轉型專案",
    expertise: ["策略規劃", "專案管理", "資源配置", "風險控管"],
    focus: "提案是否對齊公司願景與年度目標、投入與產出是否合理、分工與時程是否可行",
    style: "精簡、重結論，會追問數字與期限",
  },
};

// 部門經理的背景：有設定就用設定的，沒有就依部門定位推出一個基本背景
export function managerPersonaOf(dept: Department): Persona {
  return (
    dept.managerPersona ?? {
      background: `在「${dept.mission}」這個領域有多年實務經驗的部門主管`,
      expertise: dept.staff.map((s) => s.name).slice(0, 4),
      focus: "成果是否達到驗收標準、資訊是否正確、是否符合公司目標",
      style: "專業、直接",
    }
  );
}

// 從部門清單找出某個部門
export function getDepartment(departments: Department[], id: DepartmentId): Department | undefined {
  return departments.find((d) => d.id === id);
}

// 部門名稱（找不到時顯示代號，例如部門被刪除後的舊任務）
export function departmentName(departments: Department[], id: DepartmentId): string {
  return getDepartment(departments, id)?.name ?? id;
}

// 員工總數 + 核心主管 + 部門經理 = 全公司的 Agent 數
export function countAgents(departments: Department[]): number {
  return EXECUTIVES.length + departments.length + departments.reduce((sum, d) => sum + d.staff.length, 0);
}

// ── Agent 身分 ────────────────────────────────────
// 每個 Agent 用一個字串代表，存在資料表的 assignedBy / assignee 等欄位：
//   "executive_assistant"  首席秘書
//   "general_manager"      總經理
//   "intel.manager"        資產與市場情報部經理（格式：部門.manager）
//   "intel.crawler"        行情與新聞抓取專員（格式：部門.員工代號）
//   "user"                 你（真人使用者）
export const EXECUTIVE_ASSISTANT = "executive_assistant";
export const GENERAL_MANAGER = "general_manager";
export const USER = "user";

// 核心主管：同一職級、不屬於任何部門，都直接對你負責、都可以直接跟你對話
export const EXECUTIVES = [
  {
    id: EXECUTIVE_ASSISTANT,
    name: "首席秘書暨健康日程助理",
    nameEn: "Executive Assistant",
    duties: [
      "入口守門員：判斷你的需求該自己處理，還是整理後轉交總經理",
      "健康提醒：喝水、用眼休息、生理健康打卡、作息提醒",
      "日程排程：整合行事曆，安排每日待辦的優先順序",
      "每日晨報：統整各部門的進度與待辦，透過 LINE 或 Email 發送",
    ],
  },
  {
    id: GENERAL_MANAGER,
    name: "總經理",
    nameEn: "General Manager",
    duties: ["直接接受老闆交辦、回報工作進度", "拆解任務並分派給適合的部門", "驗收各部門成果"],
  },
] as const;

export function managerOf(department: DepartmentId): string {
  return `${department}.manager`;
}

export function staffAgentId(department: DepartmentId, staffId: string): string {
  return `${department}.${staffId}`;
}

// 把 Agent 身分轉成畫面上顯示的中文名稱，例如 "intel.crawler" → "資產與市場情報部・行情與新聞抓取專員"
export function agentLabel(id: string, departments: Department[]): string {
  if (id === USER) return "你";
  const executive = EXECUTIVES.find((e) => e.id === id);
  if (executive) return executive.name;
  const [deptId, role] = id.split(".");
  const dept = getDepartment(departments, deptId);
  if (!dept) return id;
  if (role === "manager") return `${dept.name}經理`;
  const member = dept.staff.find((s) => s.id === role);
  return member ? `${dept.name}・${member.name}` : id;
}

// 檢查一個字串是不是合法的 Agent 身分（AI 回傳指派對象時，用它確認沒有亂編）
export function isAgentId(id: string, departments: Department[]): boolean {
  if (id === USER || EXECUTIVES.some((e) => e.id === id)) return true;
  return departments.some(
    (d) => id === managerOf(d.id) || d.staff.some((s) => id === staffAgentId(d.id, s.id)),
  );
}

// ── 辦公室主題 ────────────────────────────────
// 整間公司的世界觀：配色、家具、房間名稱、戶外景觀、人物服裝都會跟著換，房間配置不變。
// 每個主題的詳細設定在 src/themes/<id>.json；ready: false 的主題還在製作中（顯示「即將推出」）。
export const OFFICE_STYLES = [
  { id: "classic", name: "經典商務", emoji: "🏢", description: "米白牆面、木質桌椅，沉穩安靜", ready: true },
  { id: "campus", name: "科技園區", emoji: "🌈", description: "明亮多彩、開放空間，像 Google 總部", ready: true },
  { id: "scifi", name: "星際模式", emoji: "🚀", description: "金屬艙壁、全像投影、機器人巡邏，窗外有飛天車", ready: true },
  { id: "magic", name: "魔法學院", emoji: "🪄", description: "磚石城堡、學院長桌、四色旗幟，大家穿著斗篷", ready: true },
  { id: "sports", name: "運動武術館", emoji: "🥋", description: "道館、訓練場、各式運動空間", ready: false },
  { id: "manor", name: "歐式莊園", emoji: "🏰", description: "玫瑰花園、泳池、下午茶，慵懶優雅", ready: false },
  { id: "ancient", name: "古風書院", emoji: "🏯", description: "飛簷、櫻花、拱橋與市集", ready: false },
  { id: "comic", name: "漫畫工作室", emoji: "📚", description: "分鏡稿、繪圖桌、滿牆漫畫", ready: false },
  { id: "kpop", name: "偶像練習室", emoji: "🎤", description: "練舞鏡牆、舞台燈、錄音室", ready: false },
] as const;
export type OfficeStyle = (typeof OFFICE_STYLES)[number]["id"];
export const READY_STYLES = OFFICE_STYLES.filter((s) => s.ready).map((s) => s.id) as OfficeStyle[];
export const OFFICE_STYLE_IDS = OFFICE_STYLES.map((s) => s.id) as [OfficeStyle, ...OfficeStyle[]];


// ── 總目標（Mission）的狀態 ──────────────────────
export const MISSION_STATUSES = [
  "pending", //     剛建立，等總經理接手
  "planning", //    總經理正在拆解任務
  "in_progress", // 各部門執行中
  "reviewing", //   總經理正在驗收
  "completed", //   驗收通過，完成
  "failed", //      失敗（例如多次退回仍不合格、或程式錯誤）
  "cancelled", //   被使用者取消
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

// ── 任務（Task）的狀態 ───────────────────────────
// 一個任務的正常流程：pending → in_progress → submitted → approved
// 審查不通過時：submitted → revision → in_progress → submitted …（重做）
export const TASK_STATUSES = [
  "pending", //     已分派，還沒開始
  "in_progress", // 執行中
  "submitted", //   已交出成果，等上級審閱
  "revision", //    被退回，需要修改
  "approved", //    審閱通過
  "failed", //      失敗（退回次數用完、或執行出錯）
  "cancelled", //   取消
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ── 任務層級 ─────────────────────────────────────
// department：總經理分派給部門經理的任務
// staff：     部門經理再拆給員工的子任務
export const TASK_LEVELS = ["department", "staff"] as const;
export type TaskLevel = (typeof TASK_LEVELS)[number];

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// ── 審閱結論 ─────────────────────────────────────
export const REVIEW_VERDICTS = [
  "approved", // 通過
  "revision", // 退回修改
  "rejected", // 直接判定失敗，不再重做
] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

// ── 進度紀錄（Activity）的事件類型 ───────────────
export const ACTIVITY_TYPES = [
  "mission_created", // 建立總目標
  "mission_status", //  總目標狀態改變
  "task_created", //    分派了一個任務
  "task_progress", //   任務進度更新
  "task_submitted", //  交出成果
  "task_reviewed", //   審閱完成
  "note", //            一般說明（例如 Agent 的思考紀錄）
  "error", //           發生錯誤
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
