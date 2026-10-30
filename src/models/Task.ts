import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { TASK_LEVELS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/company";
import { attachmentSchema } from "./schemas/attachment";
import { resetModelInDev } from "./define";

// 分派任務（tasks 資料表）
// 兩種任務都存在這裡，用 level 區分：
//   department：總經理 → 部門經理（parentTask 是空的）
//   staff：     部門經理 → 員工（parentTask 指向上面那個部門任務）
// 這樣就能從任何一個任務，往上找到它屬於哪個部門任務、哪個總目標。
const taskSchema = new Schema(
  {
    // ── 關聯 ──
    owner: { type: String, required: true }, // 屬於哪位會員（跟總目標相同）
    mission: { type: Schema.Types.ObjectId, ref: "Mission", required: true },
    parentTask: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    level: { type: String, enum: TASK_LEVELS, required: true },
    // 部門代號。每位會員的部門不同，所以不用固定清單限制，由程式依會員的組織檢查
    department: { type: String, required: true },

    // ── 誰派給誰 ──（Agent 身分字串，見 lib/company.ts）
    assignedBy: { type: String, required: true }, // 例如 "general_manager"
    assignee: { type: String, required: true }, //   例如 "intel.manager"、"intel.crawler"

    // ── 任務內容 ──
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, required: true }, // 詳細的工作說明
    // 驗收標準：審閱的人依照這幾條判斷是否通過，避免「做完了但不是我要的」
    acceptanceCriteria: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] }, // 給執行者的參考檔案

    // ── 排程 ──
    // 必須等這些任務完成才能開始，例如「設計稿」要等「市場調查」做完
    dependsOn: { type: [{ type: Schema.Types.ObjectId, ref: "Task" }], default: [] },
    priority: { type: String, enum: TASK_PRIORITIES, default: "normal" },
    order: { type: Number, default: 0 }, // 同一層任務的顯示與執行順序

    // ── 目前進度 ──
    status: { type: String, enum: TASK_STATUSES, default: "pending" },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    // 最新一次交出的成果（完整歷史在 taskresults 資料表）
    latestResult: { type: Schema.Types.ObjectId, ref: "TaskResult", default: null },
    revisionCount: { type: Number, default: 0 }, // 已經被退回幾次
    maxRevisions: { type: Number, default: 2 }, //  最多可以退回幾次，超過就判定失敗

    startedAt: { type: Date },
    completedAt: { type: Date }, // 通過、失敗或取消的時間
  },
  { timestamps: true },
);

// 最常見的查詢：列出某個總目標底下的任務（依層級、順序排好）
taskSchema.index({ mission: 1, level: 1, order: 1 });
// 列出某個部門任務底下的員工子任務
taskSchema.index({ parentTask: 1, order: 1 });
// 找出某個 Agent 手上還沒做完的任務
taskSchema.index({ owner: 1, assignee: 1, status: 1 });

export type Task = InferSchemaType<typeof taskSchema>;

resetModelInDev("Task");
export const TaskModel: Model<Task> =
  (models.Task as Model<Task>) ?? model<Task>("Task", taskSchema);
