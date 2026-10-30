import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { BOSS_GENDERS, OFFICE_STYLE_IDS } from "@/lib/company";
import { resetModelInDev } from "./define";

// 會員的公司組織（organizations 資料表）：每位會員一筆。
// 註冊後回答問卷，AI 依答案設計部門，確認後存在這裡。
// 所有 Agent（總經理分派、部門經理、員工）和立體辦公室都依這份設定運作。

const staffSchema = new Schema(
  {
    id: { type: String, required: true }, //    員工代號（英文小寫）
    name: { type: String, required: true }, //  中文職稱
    nameEn: { type: String, default: "" },
    duties: { type: [String], default: [] }, // 職責清單
  },
  { _id: false },
);

// 主管的背景（經歷、專長、審查重點、說話風格），見 lib/company.ts 的 Persona
const personaSchema = new Schema(
  {
    background: { type: String, default: "", maxlength: 500 },
    expertise: { type: [String], default: [] },
    focus: { type: String, default: "", maxlength: 500 },
    style: { type: String, default: "", maxlength: 200 },
  },
  { _id: false },
);

const departmentSchema = new Schema(
  {
    id: { type: String, required: true }, // 部門代號（英文小寫）
    name: { type: String, required: true },
    nameEn: { type: String, default: "" },
    mission: { type: String, default: "" }, // 部門定位
    staff: { type: [staffSchema], default: [] },
    knowledgeBases: { type: [String], default: undefined },
    managerPersona: { type: personaSchema, default: undefined }, // 部門經理的背景
    webSearch: { type: Boolean, default: false }, // 員工可以上網搜尋（每次搜尋另外計費）
  },
  { _id: false },
);

// 年度目標（老闆在公司總覽設定）
const goalSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 },
    due: { type: String, default: "", maxlength: 20 }, // 預計達成時間，自由填寫，例如「2027 Q1」
    done: { type: Boolean, default: false },
    period: { type: String, enum: ["year", "month", "week"], default: "year" }, // 年度、本月、本週目標
  },
  { _id: false },
);

// 未來預計製作：先記下來、之後再交辦給秘書或總經理的事
const planSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 },
    detail: { type: String, default: "", maxlength: 1000 },
    agent: { type: String, required: true }, // 預計交給誰："executive_assistant" 或 "general_manager"
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// 秘書管理的會議時程：時間到了秘書會走到會議室提醒你（頭上出現 ⏰）
const scheduleSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 }, // 會議主題
    at: { type: Date, required: true }, //                     預計開會時間
    departments: { type: [String], default: [] }, //           預計列席的部門
    note: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: ["upcoming", "started", "cancelled"], default: "upcoming" },
  },
  { _id: false },
);

const organizationSchema = new Schema(
  {
    owner: { type: String, required: true, unique: true }, // 會員 id，一位會員只有一個組織
    companyName: { type: String, default: "我的 AI 公司", maxlength: 50 },
    officeStyle: { type: String, enum: OFFICE_STYLE_IDS, default: "classic" },
    bossGender: { type: String, enum: BOSS_GENDERS, default: "neutral" }, // 你在辦公室裡的人物
    departments: { type: [departmentSchema], default: [] },
    // 首席秘書、總經理的背景（沒設定的用 DEFAULT_EXECUTIVE_PERSONAS）
    executivePersonas: {
      executive_assistant: { type: personaSchema, default: undefined },
      general_manager: { type: personaSchema, default: undefined },
    },
    vision: { type: String, default: "", maxlength: 300 }, // 公司願景
    goals: { type: [goalSchema], default: [] },
    plans: { type: [planSchema], default: [] },
    schedules: { type: [scheduleSchema], default: [] },
    // 問卷的回答，之後要重新設計部門時可以參考
    answers: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export type Organization = InferSchemaType<typeof organizationSchema>;

resetModelInDev("Organization");
export const OrganizationModel: Model<Organization> =
  (models.Organization as Model<Organization>) ?? model<Organization>("Organization", organizationSchema);
